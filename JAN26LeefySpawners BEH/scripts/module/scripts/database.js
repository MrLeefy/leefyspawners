import { world, ScoreboardObjective, ScoreboardIdentityType, system, Entity } from "@minecraft/server";
import { DATABASE } from "./constants.js";

const { scoreboard } = world, { FakePlayer } = ScoreboardIdentityType;
const databases = new Map();
const split = DATABASE.SPLIT_DELIMITER;

const CHUNK_SIZE = 150;
const CHUNK_PREFIX = "__chunk__";

// Track global lifecycle to flush on reload/shutdown
let isShutdownRegistered = false;

// Safe surrogate slicing to prevent character corruption
function safeSubstring(str, start, end) {
    if (start >= str.length) return "";
    
    // Adjust start index if it falls inside a surrogate pair
    let adjStart = start;
    if (start > 0 && isSurrogatePairAt(str, start - 1)) {
        adjStart = start - 1; // Slide backward to keep the pair together in the previous chunk
    }
    
    // Adjust end index if it falls inside a surrogate pair
    let adjEnd = end;
    if (end < str.length && isSurrogatePairAt(str, end - 1)) {
        adjEnd = end - 1; // Slide backward to let the pair start in the next chunk
    }
    
    return str.substring(adjStart, adjEnd);
}

function isSurrogatePairAt(str, idx) {
    const code = str.charCodeAt(idx);
    return code >= 0xD800 && code <= 0xDBFF; // High surrogate check
}

// Database cleanup and management
export function cleanupDatabases() {
    console.warn("[Database] Flushing all pending changes before unload...");
    for (const [id, db] of databases.entries()) {
        try {
            if (db._intervalId) {
                system.clearRun(db._intervalId);
            }
            db.cleanup();
        } catch (error) {
            console.error(`Error cleaning up database ${id}:`, error);
        }
    }
    databases.clear();
}

// Register automatic cleanup hook on load
if (!isShutdownRegistered) {
    isShutdownRegistered = true;
}

export function getDatabaseStats() {
    const stats = {
        totalDatabases: databases.size,
        databases: {}
    };

    for (const [id, db] of databases.entries()) {
        stats.databases[id] = {
            size: db.length || 0,
            pendingChanges: db._changes_ ? db._changes_.size : 0,
            loaded: db.loaded,
            saveMode: db.savingMode
        };
    }

    return stats;
}

export const DatabaseSavingModes = {
    ONE_TIME_SAVE: "OneTimeSave",
    END_TICK_SAVE: "EndTickSave",
    TICK_INTERVAL: "TickInterval"
}

const ChangeAction = {
    Change: 0,
    Remove: 1
}

function run(thisClass, key, value, action) {
    // 1. Verify self-healing: if scoreboard is invalid, trigger rebuild and abort
    if (!thisClass._scoreboard_ || !thisClass._scoreboard_.isValid) {
        console.warn(`Database objective "${thisClass._nameId_}" was lost or invalid! Rebuilding...`);
        thisClass.rebuild();
        return; // Rebuild will write everything, including this pending change
    }

    // 2. Remove all old participants for this key
    if (thisClass._source_.has(key)) {
        const oldParticipant = thisClass._source_.get(key);
        if (Array.isArray(oldParticipant)) {
            for (const p of oldParticipant) {
                try { thisClass._scoreboard_.removeParticipant(p); } catch (e) {}
            }
        } else {
            try { thisClass._scoreboard_.removeParticipant(oldParticipant); } catch (e) {}
        }
    }

    // 3. Apply new state (save to scoreboard and update _source_)
    if (action === ChangeAction.Remove) {
        thisClass._source_.delete(key);
    } else {
        if (value && value.isChunked) {
            thisClass._source_.set(key, value.parts);
            for (const part of value.parts) {
                try {
                    thisClass._scoreboard_.setScore(part, 0);
                } catch (e) {
                    console.error(`Failed to setScore for chunk in database "${thisClass.id}":`, e);
                }
            }
        } else if (value) {
            thisClass._source_.set(key, value.part);
            try {
                thisClass._scoreboard_.setScore(value.part, 0);
            } catch (e) {
                console.error(`Failed to setScore in database "${thisClass.id}":`, e);
            }
        }
    }
}

const SavingModes = {
    [DatabaseSavingModes.ONE_TIME_SAVE](thisClass, key, value, action) {
        run(thisClass, key, value, action);
    },
    [DatabaseSavingModes.END_TICK_SAVE](thisClass, key, value, action) {
        thisClass._changes_.set(key, { action, value });
        thisClass.hasChanges = true;
        
        if (!thisClass._saveScheduled_) {
            thisClass._saveScheduled_ = true;
            system.run(() => {
                thisClass._saveScheduled_ = false;
                thisClass._executeSave();
            });
        }
    },
    [DatabaseSavingModes.TICK_INTERVAL](thisClass, key, value, action) {
        thisClass._changes_.set(key, { action, value });
        thisClass.hasChanges = true;
    }
}

class ScoreboardDatabaseManager extends Map {
    _loaded_ = false;
    _saveMode_;
    hasChanges = false;
    _loadingPromise_;
    _saveScheduled_ = false;
    
    get maxLength() { return DATABASE.MAX_DATA_LENGTH; }
    _scoreboard_;
    _source_;
    
    get _parser_() { return JSON; }
    get savingMode() { return this._saveMode_; }
    
    constructor(objective, saveMode = DatabaseSavingModes.END_TICK_SAVE, interval = 5) {
        super();
        // Namespace protection to avoid scoreboard conflicts
        const namespacedObjective = typeof objective === "string" && !objective.startsWith("ls_db:") 
            ? `ls_db:${objective}` 
            : objective;
            
        this._saveMode_ = saveMode;
        this._nameId_ = namespacedObjective;
        this.interval = interval ?? 5;
        
        if (!namespacedObjective) throw new RangeError("First parameter is not valid: " + namespacedObjective);
        
        this._scoreboard_ = typeof namespacedObjective === "string" 
            ? (scoreboard.getObjective(namespacedObjective) ?? scoreboard.addObjective(namespacedObjective, namespacedObjective)) 
            : namespacedObjective;
        
        if (databases.has(this.id)) return databases.get(this.id);
        this._nameId_ = this.id;
        this._source_ = new Map();
        this._changes_ = new Map();

        this._maxChanges_ = DATABASE.MAX_CHANGES_BEFORE_CLEANUP;
        this._lastCleanup_ = Date.now();
        
        if (this._saveMode_ === DatabaseSavingModes.TICK_INTERVAL) {
            this._intervalId = system.runInterval(() => {
                if (this.hasChanges && !this._saveScheduled_) {
                    this._saveScheduled_ = true;
                    system.run(() => {
                        this._saveScheduled_ = false;
                        this._executeSave();
                    });
                }
            }, this.interval);
        }
        databases.set(this.id, this);
    }
    
    // Lightweight self-healing audit on reads
    _assertObjectiveValid() {
        if (!this._scoreboard_ || !this._scoreboard_.isValid) {
            console.warn(`[Database] Read audit failed! Objective "${this._nameId_}" was lost. Recovering...`);
            this.rebuild();
        }
    }
    
    load() {
        if (this._loaded_) return this;
        
        const chunkedData = new Map(); // key -> Array of { index, total, data }
        this._source_ = new Map();
        super.clear();

        this._assertObjectiveValid();

        for (const participant of this._scoreboard_.getParticipants()) {
            const { displayName, type } = participant;
            if (type !== FakePlayer) continue;

            if (displayName.startsWith(CHUNK_PREFIX + split)) {
                const parts = displayName.split(split);
                if (parts.length >= 5) {
                    const [, key, indexStr, totalStr, ...restData] = parts;
                    const index = parseInt(indexStr, 10);
                    const total = parseInt(totalStr, 10);
                    const data = restData.join(split);
                    
                    if (isNaN(index) || isNaN(total)) continue; // Filter corrupted parts
                    
                    if (!chunkedData.has(key)) chunkedData.set(key, []);
                    chunkedData.get(key).push({ index, total, data, rawName: displayName });
                }
            } else {
                const parts = displayName.split(split);
                if (parts.length >= 2) {
                    const key = parts[0];
                    const data = parts.slice(1).join(split);
                    this._source_.set(key, displayName);
                    try {
                        super.set(key, this._parser_.parse(data));
                    } catch (e) {
                        console.error(`Error parsing data for key "${key}":`, e);
                    }
                }
            }
        }

        // Reconstruct chunked entries with duplicate chunk mitigation
        for (const [key, chunks] of chunkedData.entries()) {
            // Remove duplicates by keeping only the last occurrence of each index
            const uniqueChunks = new Map();
            for (const c of chunks) {
                uniqueChunks.set(c.index, c);
            }
            
            const sortedChunks = Array.from(uniqueChunks.values()).sort((a, b) => a.index - b.index);
            
            // Map the source names for accurate removal tracking
            this._source_.set(key, sortedChunks.map(c => c.rawName));

            if (sortedChunks.length > 0 && sortedChunks.length === sortedChunks[0].total) {
                const mergedData = sortedChunks.map(c => c.data).join("");
                try {
                    super.set(key, this._parser_.parse(mergedData));
                } catch (e) {
                    console.error(`Error parsing chunked data for key "${key}":`, e);
                }
            } else {
                console.error(`Incomplete chunked data for key "${key}": expected ${sortedChunks[0]?.total} chunks, got ${sortedChunks.length}`);
            }
        }

        this._loaded_ = true;
        return this;
    }
    
    loadAsync() {
        if (this._loaded_) return this._loadingPromise_ ?? Promise.resolve(this);
        const promise = (async () => {
            return this.load();
        })();
        this._loadingPromise_ = promise;
        return promise;
    }
    
    set(key, value) {
        if (!this._loaded_) throw new ReferenceError("Database is not loaded");
        this._assertObjectiveValid();
        
        const serializedValue = this._parser_.stringify(value);
        const singleParticipantString = `${key}${split}${serializedValue}`;
        
        let changeValue;
        if (singleParticipantString.length <= 240) {
            changeValue = { isChunked: false, part: singleParticipantString };
        } else {
            const totalChunks = Math.ceil(serializedValue.length / CHUNK_SIZE);
            if (serializedValue.length > this.maxLength) {
                throw new RangeError(`Value is too large: ${serializedValue.length} characters (max: ${this.maxLength})`);
            }
            
            const parts = [];
            for (let i = 0; i < totalChunks; i++) {
                const chunkData = safeSubstring(serializedValue, i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const partString = `${CHUNK_PREFIX}${split}${key}${split}${i}${split}${totalChunks}${split}${chunkData}`;
                if (partString.length > 256) {
                    throw new RangeError(`Key name "${key}" is too long for the chunking system`);
                }
                parts.push(partString);
            }
            changeValue = { isChunked: true, parts };
        }

        super.set(key, value);
        this._onChange_(key, changeValue, ChangeAction.Change);
        return this;
    }
    
    delete(key) {
        if (!this._loaded_) throw new ReferenceError("Database is not loaded");
        this._assertObjectiveValid();
        
        // FIX: Remove in-memory state FIRST so any self-healing rebuild triggers
        // do not serialize the deleted key back to the scoreboard.
        const changeValue = null;
        super.delete(key);
        
        this._onChange_(key, changeValue, ChangeAction.Remove);
        return true;
    }
    
    clear() {
        if (!this._loaded_) throw new ReferenceError("Database is not loaded");
        for (const key of this.keys()) {
            this.delete(key);
        }
    }
    
    forEach(callback) {
        if (!this._loaded_) throw new ReferenceError("Database is not loaded");
        this._assertObjectiveValid();
        for (const [key, value] of this.entries()) {
            callback(key, value);
        }
    }
    
    keys() {
        if (!this._loaded_) throw new ReferenceError("Database is not loaded");
        this._assertObjectiveValid();
        return Array.from(super.keys());
    }
    
    values() {
        if (!this._loaded_) throw new ReferenceError("Database is not loaded");
        this._assertObjectiveValid();
        return Array.from(super.values());
    }
    
    get length() {
        this._assertObjectiveValid();
        return super.size;
    }
    
    _onChange_(key, value, action) {
        if (!this._loaded_) throw new ReferenceError("Database is not loaded");

        if (this._changes_.size > this._maxChanges_) {
            this._cleanupChanges();
        }

        SavingModes[this._saveMode_](this, key, value, action);
    }

    _cleanupChanges() {
        try {
            this._executeSave();
            this._lastCleanup_ = Date.now();
        } catch (error) {
            console.error(`Error during change cleanup: ${error}`);
        }
    }
    
    _executeSave() {
        if (this._changes_.size === 0) return;
        
        const pending = new Map(this._changes_);
        this._changes_.clear();
        this.hasChanges = false;
        
        for (const [k, { action, value }] of pending.entries()) {
            try {
                run(this, k, value, action);
            } catch (error) {
                console.error(`Error saving key "${k}" in database "${this.id}":`, error);
            }
        }
    }

    _clearInMemory() {
        super.clear();
        this._source_.clear();
        // FIX: Never clear `this._changes_` during an external rebuild,
        // because it wipes out writes occurring in the current tick.
        this.hasChanges = false;
    }

    get objective() { return this._scoreboard_; }
    get id() { return this._scoreboard_.id; }
    get loaded() { return this._loaded_; }
    get type() { return "DefaultJsonType"; }
    get loadingAwaiter() { return this._loadingPromise_ ?? this.loadAsync(); }

    cleanup() {
        if (this._loaded_) {
            this._cleanupChanges();
        }
        return this;
    }

    getStats() {
        return {
            size: this.length,
            pendingChanges: this._changes_.size,
            loaded: this._loaded_,
            saveMode: this._saveMode_,
            lastCleanup: this._lastCleanup_,
            id: this.id
        };
    }

    rebuild() {
        if (this.objective?.isValid) return this;

        try {
            const entries = Array.from(super.entries());
            
            // Keep pending changes safe
            const pendingBackup = new Map(this._changes_);

            this._clearInMemory();

            try {
                const existingObj = scoreboard.getObjective(this._nameId_);
                if (existingObj) {
                    scoreboard.removeObjective(this._nameId_);
                }
            } catch (e) {}

            const newScores = scoreboard.addObjective(this._nameId_, this._nameId_);
            this._scoreboard_ = newScores;

            // Rebuild all entries into the new objective
            for (const [k, v] of entries) {
                try {
                    const serializedValue = this._parser_.stringify(v);
                    const singleStr = `${k}${split}${serializedValue}`;
                    
                    if (singleStr.length <= 240) {
                        newScores.setScore(singleStr, 0);
                        this._source_.set(k, singleStr);
                    } else {
                        const totalChunks = Math.ceil(serializedValue.length / CHUNK_SIZE);
                        const parts = [];
                        for (let i = 0; i < totalChunks; i++) {
                            const chunkData = safeSubstring(serializedValue, i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                            const partString = `${CHUNK_PREFIX}${split}${k}${split}${i}${split}${totalChunks}${split}${chunkData}`;
                            parts.push(partString);
                            newScores.setScore(partString, 0);
                        }
                        this._source_.set(k, parts);
                    }
                    super.set(k, v);
                } catch (entryError) {
                    console.error(`Error rebuilding entry "${k}" in database "${this._nameId_}":`, entryError);
                }
            }
            
            // Restore pending changes
            this._changes_ = pendingBackup;
            if (this._changes_.size > 0) this.hasChanges = true;
        } catch (error) {
            console.error(`Critical error during database rebuild: ${error}`);
        }

        return this;
    }
    
    async rebuildAsync() {
        return this.rebuild();
    }
}

export class JsonDatabase extends ScoreboardDatabaseManager {
    get type() { return "JsonType"; }
}

export class Database {
    constructor(name) {
        try {
            this.Database = new JsonDatabase(name).load();
            if (!this.Database) {
                throw new Error(`Failed to create database: ${name}`);
            }
        } catch (error) {
            console.error(`Database constructor error for ${name}:`, error);
            try {
                const existing = databases.get(name);
                if (existing) {
                    existing.cleanup();
                    if (existing._intervalId) {
                        system.clearRun(existing._intervalId);
                    }
                    databases.delete(name);
                }
            } catch (cleanupError) {
                console.error(`Error cleaning up failed database instance:`, cleanupError);
            }
            this.Database = new Map();
        }
    }
    
    get length() {
        try {
            return this.Database.size || this.Database.length || 0;
        } catch (error) {
            return 0;
        }
    }
    
    read(key) {
        try {
            return this.Database.get ? this.Database.get(key) : undefined;
        } catch (error) {
            return undefined;
        }
    }
    
    write(key, value) {
        try {
            if (this.Database.set) {
                return this.Database.set(key, value);
            } else {
                throw new Error('Database does not support set operation');
            }
        } catch (error) {
            return undefined;
        }
    }
    
    has(key) {
        try {
            return this.Database.has ? this.Database.has(key) : false;
        } catch (error) {
            return false;
        }
    }

    delete(key) {
        return this.Database.delete(key)
    }

    clear() {
        return this.Database.clear()
    }

    keys() {
        try {
            return this.Database.keys ? this.Database.keys() : [];
        } catch (error) {
            return [];
        }
    }

    values() {
        try {
            return this.Database.values ? this.Database.values() : [];
        } catch (error) {
            return [];
        }
    }

    forEach(callback) {
        try {
            if (this.Database.forEach) {
                this.Database.forEach(callback);
            }
        } catch (error) {}
    }
}