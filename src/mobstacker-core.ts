// mobstacker-core.js

import { system, world, Player, Entity, Block, Vector3, Dimension, EntityHealthComponent, EntityDieAfterEvent, EntityHurtAfterEvent } from "@minecraft/server";
import { Database } from "./database";
import { getAAValueForLevel } from "./mobstacker-ui"; // Import the config function from the UI file
import { TIMING, UI, ENTITIES, PERFORMANCE, VALIDATION } from "./constants";
import { activeForms, cooldowns } from "./levelsystem";

// Performance monitoring
const performanceMetrics = {
    stackingOperations: 0,
    entitySpawns: 0,
    entityRemovals: 0,
    averageProcessingTime: 0,
    lastReset: Date.now(),
    peakMemoryUsage: 0,
    warningCount: 0,
    criticalCount: 0
};

// Statistics tracking for admin panel
const spawnerStatistics = {
    totalSpawners: 0,
    totalEntities: 0, // physical stacks
    totalVirtualEntities: 0, // virtual mobs
    entitiesKilled: new Map(), // Per entity type
    spawnerUptime: new Map(), // Per spawner location
    playerStats: new Map(), // Per player statistics
    lastStatsUpdate: Date.now()
};

// Memory management constants for statistics
const STATS_MEMORY_LIMITS = {
    MAX_ENTITY_TYPES: 1000,    // Max entity types to track
    MAX_PLAYER_ENTRIES: 500,   // Max players to track
    MAX_SPAWNER_ENTRIES: 2000, // Max spawner locations to track
    STATS_CLEANUP_INTERVAL: 3600000, // 1 hour in milliseconds
    PLAYER_INACTIVITY_THRESHOLD: 30 * 24 * 60 * 60 * 1000 // 30 days
};

// Global logging system
let LOGGING_ENABLED = false; // Global toggle for all logging (disabled by default)
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Override console methods to respect global logging toggle
console.log = function (...args) {
    if (LOGGING_ENABLED) {
        originalConsoleLog.apply(console, args);
    }
};

console.error = function (...args) {
    if (LOGGING_ENABLED) {
        originalConsoleError.apply(console, args);
    }
};

// Debug logging function that respects the global logging toggle
function debugLog(message: any, ...args: any[]): void {
    if (LOGGING_ENABLED) {
        console.log(`[DEBUG] ${message}`, ...args);
    }
}

// Logging control functions
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

// Track which entities belong to which spawner locations
const entitySpawnerMap = new Map(); // entityId -> spawnerLocationKey

// Statistics cleanup function
function cleanupStatistics() {
    const now = Date.now();

    // Clean up entitiesKilled map - keep only top entries by kill count
    if (spawnerStatistics.entitiesKilled.size > STATS_MEMORY_LIMITS.MAX_ENTITY_TYPES) {
        const entries = Array.from(spawnerStatistics.entitiesKilled.entries());
        entries.sort((a, b) => b[1] - a[1]); // Sort by kill count (highest first)
        spawnerStatistics.entitiesKilled.clear();
        entries.slice(0, STATS_MEMORY_LIMITS.MAX_ENTITY_TYPES).forEach(([entityType, kills]) => {
            spawnerStatistics.entitiesKilled.set(entityType, kills);
        });
    }

    // Clean up spawnerUptime map - limit size and remove old entries
    if (spawnerStatistics.spawnerUptime.size > STATS_MEMORY_LIMITS.MAX_SPAWNER_ENTRIES) {
        const entries = Array.from(spawnerStatistics.spawnerUptime.entries());
        entries.sort((a, b) => b[1] - a[1]); // Sort by uptime (highest first)
        spawnerStatistics.spawnerUptime.clear();
        entries.slice(0, STATS_MEMORY_LIMITS.MAX_SPAWNER_ENTRIES).forEach(([location, uptime]) => {
            spawnerStatistics.spawnerUptime.set(location, uptime);
        });
    }

    // Clean up inactive players
    if (spawnerStatistics.playerStats.size > STATS_MEMORY_LIMITS.MAX_PLAYER_ENTRIES) {
        const cutoffTime = now - STATS_MEMORY_LIMITS.PLAYER_INACTIVITY_THRESHOLD;
        for (const [playerName, stats] of spawnerStatistics.playerStats.entries()) {
            if (stats.lastActivity && stats.lastActivity < cutoffTime) {
                spawnerStatistics.playerStats.delete(playerName);
            }
        }
    }

    debugLog(`Statistics cleanup: entities=${spawnerStatistics.entitiesKilled.size}, players=${spawnerStatistics.playerStats.size}, spawners=${spawnerStatistics.spawnerUptime.size}`);
}

// Update statistics when entities are killed
function updateSpawnerStatistics(entityTypeId: string, spawnerLocation: Vector3, player?: Player) {
    // Track entities killed by type
    const currentKills = spawnerStatistics.entitiesKilled.get(entityTypeId) || 0;
    spawnerStatistics.entitiesKilled.set(entityTypeId, currentKills + 1);

    // Track spawner uptime and kills per location
    const locationKey = `${spawnerLocation.x},${spawnerLocation.y},${spawnerLocation.z}`;
    const currentUptime = spawnerStatistics.spawnerUptime.get(locationKey) || 0;
    spawnerStatistics.spawnerUptime.set(locationKey, currentUptime + 1);

    // Update metadata (now memory-buffered and flushed every 30s)
    updateSpawnerMetadata(locationKey, entityTypeId, player);

    // Track player statistics
    if (player) {
        const playerName = player.name || player.nameTag || 'Unknown';
        const playerStat = spawnerStatistics.playerStats.get(playerName) || {
            entitiesKilled: 0,
            spawnersPlaced: 0,
            killsByType: {},
            lastActivity: Date.now()
        };
        playerStat.entitiesKilled++;
        playerStat.lastActivity = Date.now();
        // Track kills by entity type
        playerStat.killsByType[entityTypeId] = (playerStat.killsByType[entityTypeId] || 0) + 1;
        spawnerStatistics.playerStats.set(playerName, playerStat);
    }
}

// Optimized Direct Statistics Writer bypassing string parsing
function updateSpawnerStatisticsDirect(entityTypeId: string, locationKey: string, player?: Player) {
    // Track entities killed by type
    const currentKills = spawnerStatistics.entitiesKilled.get(entityTypeId) || 0;
    spawnerStatistics.entitiesKilled.set(entityTypeId, currentKills + 1);

    // Track spawner uptime and kills per location
    const currentUptime = spawnerStatistics.spawnerUptime.get(locationKey) || 0;
    spawnerStatistics.spawnerUptime.set(locationKey, currentUptime + 1);

    // Update metadata (now memory-buffered and flushed every 30s)
    updateSpawnerMetadata(locationKey, entityTypeId, player);

    // Track player statistics
    if (player) {
        const playerName = player.name || player.nameTag || 'Unknown';
        const playerStat = spawnerStatistics.playerStats.get(playerName) || {
            entitiesKilled: 0,
            spawnersPlaced: 0,
            killsByType: {},
            lastActivity: Date.now()
        };
        playerStat.entitiesKilled++;
        playerStat.lastActivity = Date.now();
        // Track kills by entity type
        playerStat.killsByType[entityTypeId] = (playerStat.killsByType[entityTypeId] || 0) + 1;
        spawnerStatistics.playerStats.set(playerName, playerStat);
    }
}

// Memory-based pending metadata updates (removes critical path JSON read/writes on kills)
const pendingSpawnerMetadata = new Map(); // locationKey -> { entityTypeId, kills, playersKilled: { playerName: count }, lastKill }

// Update spawner metadata buffer
function updateSpawnerMetadata(locationKey: string, entityTypeId: string, player?: Player) {
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
            const playerName = player.name || player.nameTag || 'Unknown';
            pending.playersKilled[playerName] = (pending.playersKilled[playerName] || 0) + 1;
        }
    } catch (error) {
        console.error(`Error buffering spawner metadata for ${locationKey}:`, error);
    }
}

// Flush pending spawner metadata updates to the database (called every 30 seconds)
function flushPendingSpawnerMetadata() {
    if (pendingSpawnerMetadata.size === 0) return;

    for (const [locationKey, pending] of pendingSpawnerMetadata.entries()) {
        try {
            const existingData = spawnerDatabase.read(locationKey) || {
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
            existingData.killsByType[pending.entityTypeId] = 
                (existingData.killsByType[pending.entityTypeId] || 0) + pending.kills;

            if (!existingData.playersKilled) {
                existingData.playersKilled = {};
            }
            for (const [playerName, count] of Object.entries(pending.playersKilled)) {
                existingData.playersKilled[playerName] = 
                    (existingData.playersKilled[playerName] || 0) + count;
            }

            spawnerDatabase.write(locationKey, existingData);
        } catch (error) {
            console.error(`Error saving spawner metadata for ${locationKey}:`, error);
        }
    }
    pendingSpawnerMetadata.clear();
    debugLog("[MOBSTACKER] Flushed pending spawner metadata to database");
}

// Run metadata flush and statistics persistence every 30 seconds
system.runInterval(() => {
    try {
        cleanupStatistics(); // CRITICAL: Run the map pruner to prevent leaks
        flushPendingSpawnerMetadata();
        saveSpawnerStatistics();
    } catch (error) {
        console.error("Error in persistent statistics sync:", error);
    }
}, 30 * 20); // 30 seconds * 20 ticks

// Save statistics to database
function saveSpawnerStatistics() {
    try {
        // Ensure they are Maps before calling Array.from
        const entitiesKilledEntries = (spawnerStatistics.entitiesKilled instanceof Map) 
            ? Array.from(spawnerStatistics.entitiesKilled.entries()) 
            : [];
        const spawnerUptimeEntries = (spawnerStatistics.spawnerUptime instanceof Map) 
            ? Array.from(spawnerStatistics.spawnerUptime.entries()) 
            : [];
        const playerStatsEntries = (spawnerStatistics.playerStats instanceof Map) 
            ? Array.from(spawnerStatistics.playerStats.entries()) 
            : [];

        const statsObj = {
            entitiesKilled: entitiesKilledEntries,
            spawnerUptime: spawnerUptimeEntries,
            playerStats: playerStatsEntries,
            lastStatsUpdate: spawnerStatistics.lastStatsUpdate
        };
        configDatabase.write("spawnerStatistics", statsObj);
    } catch (error) {
        console.error("Failed to save spawner statistics:", error);
    }
}

// Load statistics from database
function loadSpawnerStatistics() {
    try {
        const statsObj = configDatabase.read("spawnerStatistics");
        if (statsObj) {
            // Entities killed recovery
            if (statsObj.entitiesKilled && Array.isArray(statsObj.entitiesKilled)) {
                spawnerStatistics.entitiesKilled = new Map(statsObj.entitiesKilled);
            } else if (statsObj.entitiesKilled && typeof statsObj.entitiesKilled === "object") {
                spawnerStatistics.entitiesKilled = new Map(Object.entries(statsObj.entitiesKilled));
            } else {
                spawnerStatistics.entitiesKilled = new Map();
            }

            // Spawner uptime recovery
            if (statsObj.spawnerUptime && Array.isArray(statsObj.spawnerUptime)) {
                spawnerStatistics.spawnerUptime = new Map(statsObj.spawnerUptime);
            } else if (statsObj.spawnerUptime && typeof statsObj.spawnerUptime === "object") {
                spawnerStatistics.spawnerUptime = new Map(Object.entries(statsObj.spawnerUptime));
            } else {
                spawnerStatistics.spawnerUptime = new Map();
            }

            // Player stats recovery
            if (statsObj.playerStats && Array.isArray(statsObj.playerStats)) {
                spawnerStatistics.playerStats = new Map(statsObj.playerStats);
            } else if (statsObj.playerStats && typeof statsObj.playerStats === "object") {
                spawnerStatistics.playerStats = new Map(Object.entries(statsObj.playerStats));
            } else {
                spawnerStatistics.playerStats = new Map();
            }

            spawnerStatistics.lastStatsUpdate = statsObj.lastStatsUpdate || Date.now();
        } else {
            // Ensure initialized if database is empty
            if (!(spawnerStatistics.entitiesKilled instanceof Map)) spawnerStatistics.entitiesKilled = new Map();
            if (!(spawnerStatistics.spawnerUptime instanceof Map)) spawnerStatistics.spawnerUptime = new Map();
            if (!(spawnerStatistics.playerStats instanceof Map)) spawnerStatistics.playerStats = new Map();
        }
    } catch (error) {
        console.error("Failed to load spawner statistics:", error);
        // Guarantee Maps on load failure
        if (!(spawnerStatistics.entitiesKilled instanceof Map)) spawnerStatistics.entitiesKilled = new Map();
        if (!(spawnerStatistics.spawnerUptime instanceof Map)) spawnerStatistics.spawnerUptime = new Map();
        if (!(spawnerStatistics.playerStats instanceof Map)) spawnerStatistics.playerStats = new Map();
    }
}

// Reset statistics
function resetSpawnerStatistics() {
    try {
        // Ensure they are Maps before resetting
        if (!(spawnerStatistics.entitiesKilled instanceof Map)) {
            spawnerStatistics.entitiesKilled = new Map();
        } else {
            spawnerStatistics.entitiesKilled.clear();
        }

        if (!(spawnerStatistics.spawnerUptime instanceof Map)) {
            spawnerStatistics.spawnerUptime = new Map();
        } else {
            spawnerStatistics.spawnerUptime.clear();
        }

        if (!(spawnerStatistics.playerStats instanceof Map)) {
            spawnerStatistics.playerStats = new Map();
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

// Get player top kills
function getPlayerTopKills(playerStat: any, count = 3): any[] {
    if (!playerStat || !playerStat.killsByType) return [];
    
    return Object.entries(playerStat.killsByType)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, count)
        .map(([typeId, killsCount]) => ({
            displayName: mobDisplayNameMap.get(typeId) || typeId.replace("mrleefy:", ""),
            count: killsCount
        }));
}

// Calculate total spawners and entities for statistics
function calculateSpawnerTotals() {
    const dimensions = ['overworld', 'nether', 'the_end'];
    let spawnerCount = 0;
    let physicalCount = 0;
    let virtualCount = 0;

    const validMobs = ['mrleefy:blazestill', 'mrleefy:cowstill', 'mrleefy:sheepstill', 'mrleefy:pigstill',
        'mrleefy:chickenstill', 'mrleefy:emeraldgolemstill', 'mrleefy:netheritegolemstill',
        'mrleefy:irongolemstill', 'mrleefy:diamondgolemstill', 'mrleefy:goldgolemstill',
        'mrleefy:endermanstill', 'mrleefy:creeperstill', 'mrleefy:magmacubestill',
        'mrleefy:guardianstill', 'mrleefy:witherskeletonstill', 'mrleefy:zombiestill',
        'mrleefy:witherstill', 'mrleefy:spiderstill', 'mrleefy:slimestill',
        'mrleefy:vindicatorstill', 'mrleefy:skeletonstill', 'mrleefy:shulkerstill',
        'mrleefy:breezestill', 'mrleefy:piglinbrutestill', 'mrleefy:wardenstill',
        'mrleefy:ravagerstill',
        // Crawlers
        'mrleefy:coalcrawlerstill', 'mrleefy:glowstonecrawlerstill', 'mrleefy:obsidiancrawlerstill',
        'mrleefy:icecrawlerstill', 'mrleefy:spongecrawlerstill', 'mrleefy:lapiscrawlerstill',
        'mrleefy:redstonecrawlerstill', 'mrleefy:coppercrawlerstill', 'mrleefy:quartzcrawlerstill',
        'mrleefy:amethystcrawlerstill'];

    for (const dimId of dimensions) {
        try {
            const dim = world.getDimension(dimId);
            if (dim) {
                const spawnruleEntities = dim.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE });
                spawnerCount += spawnruleEntities.length;

                for (const mobType of validMobs) {
                    const entities = dim.getEntities({ type: mobType });
                    entities.forEach((entity: Entity) => {
                        if (entity?.isValid) {
                            physicalCount++;
                            if (entity.nameTag && entity.nameTag.includes('x')) {
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
            // Safe ignore if dimension is unloaded/unaccessible
        }
    }

    spawnerStatistics.totalSpawners = spawnerCount;
    spawnerStatistics.totalEntities = physicalCount;
    spawnerStatistics.totalVirtualEntities = virtualCount;
    spawnerStatistics.lastStatsUpdate = Date.now();
}

// Performance thresholds for monitoring
const PERFORMANCE_THRESHOLDS = {
    MAX_PROCESSING_TIME: 50, // ms per tick
    MAX_ENTITIES_PER_TICK: 100,
    MEMORY_WARNING: 200, // High memory usage threshold
    MEMORY_CRITICAL: 400, // Critical memory usage threshold
    SPAWN_TIME_WARNING: 10, // seconds
    CLEANUP_TIME_WARNING: 5 // seconds
};

// Import services for better separation of concerns
import { ConfigurationService } from './configuration-service';
import { PerformanceMonitor } from './performance-monitor';

// Performance monitoring functions
function getMemoryUsage() {
    const baseChunkLoad = ACTIVE_CHUNKS.size * 10; // Base load per active chunk
    const entityLoad = entitySpawnerMap.size * 2; // Entities being tracked
    const timerLoad = (lastSpawnTime.size + lastKilled.size) * 1; // Active timers
    const cacheLoad = Math.min(cacheManager.getStats().config?.size || 0, 20); // Capped cache impact

    return baseChunkLoad + entityLoad + timerLoad + cacheLoad;
}

function checkPerformanceHealth() {
    const memoryUsage = getMemoryUsage();
    performanceMetrics.peakMemoryUsage = Math.max(performanceMetrics.peakMemoryUsage, memoryUsage);

    // Memory warnings
    if (memoryUsage > PERFORMANCE_THRESHOLDS.MEMORY_CRITICAL) {
        debugLog(`[PERFORMANCE] CRITICAL: High memory usage detected: ${memoryUsage} units`);
        performanceMetrics.criticalCount++;
    } else if (memoryUsage > PERFORMANCE_THRESHOLDS.MEMORY_WARNING) {
        debugLog(`[PERFORMANCE] WARNING: Elevated memory usage: ${memoryUsage} units`);
        performanceMetrics.warningCount++;
    }

    // Entity count warnings
    const entityCount = lastSpawnTime.size + lastKilled.size;
    if (entityCount > PERFORMANCE_THRESHOLDS.MAX_ENTITIES_PER_TICK * 10) {
        debugLog(`[PERFORMANCE] WARNING: High entity tracking count: ${entityCount}`);
    }
}

function logPerformanceReport() {
    const memoryUsage = getMemoryUsage();
    const cacheStats = cacheManager.getStats();

    debugLog(`[PERFORMANCE REPORT]
    Memory Usage: ${memoryUsage} units (Peak: ${performanceMetrics.peakMemoryUsage})
    Maps - SpawnTime: ${lastSpawnTime.size}, Killed: ${lastKilled.size}, Deaths: ${processedDeaths.size}
    Chunks: ${ACTIVE_CHUNKS.size}
    Cache - Config: ${cacheStats.config?.size || 0}
    Warnings: ${performanceMetrics.warningCount}, Critical: ${performanceMetrics.criticalCount}
    Operations: ${performanceMetrics.stackingOperations}`);
}

// Reset performance metrics periodically
system.runInterval(() => {
    const now = Date.now();
    const elapsedMinutes = (now - performanceMetrics.lastReset) / 60000;

    if (elapsedMinutes >= 5) { // Reset every 5 minutes
        logPerformanceReport(); // Log report before reset
        performanceMetrics.lastReset = now;
        performanceMetrics.averageProcessingTime = 0;
        performanceMetrics.stackingOperations = 0;
        performanceMetrics.entitySpawns = 0;
        performanceMetrics.entityRemovals = 0;
        performanceMetrics.warningCount = 0;
        performanceMetrics.criticalCount = 0;
    }

    // Regular health checks
    checkPerformanceHealth();
}, 300 * 20); // Every 5 minutes

// --- DATABASES & CONFIGURATION ---
export const configDatabase = new Database("ConfigValues");
export const xpDropDatabase = new Database("XPDropValues");
export const spawnerDatabase = new Database("SpawnerLocations");

// Unified Cache Manager - consolidates all caching systems
class UnifiedCacheManager {
    caches = new Map<string, Map<any, any>>();
    cacheConfigs = new Map<string, { duration: number; maxSize: number | null; lastUpdate: number }>();

    constructor() {
        this.caches = new Map();
        this.cacheConfigs = new Map();
    }

    // Register a cache with specific configuration
    registerCache(cacheName: string, duration: number, maxSize: number | null = null): void {
        this.caches.set(cacheName, new Map());
        this.cacheConfigs.set(cacheName, { duration, maxSize, lastUpdate: 0 });
    }

    // Get cached value with automatic refresh
    get(cacheName: string, key: any, fetchFunction: () => any, defaultValue: any = null): any {
        const cache = this.caches.get(cacheName);
        const config = this.cacheConfigs.get(cacheName);

        if (!cache || !config) return defaultValue;

        const now = Date.now();

        // Check if cache needs refresh
        if (now - config.lastUpdate > config.duration || !cache.has(key)) {
            config.lastUpdate = now;
            const value = fetchFunction();
            cache.set(key, value);

            // Enforce size limits if specified
            if (config.maxSize && cache.size > config.maxSize) {
                const entries = Array.from(cache.entries());
                const toRemove = entries.slice(0, cache.size - config.maxSize);
                toRemove.forEach(([k]) => cache.delete(k as any));
            }
        }

        return cache.get(key) ?? defaultValue;
    }

    // Manual cache update
    set(cacheName: string, key: any, value: any): void {
        const cache = this.caches.get(cacheName);
        if (cache) {
            cache.set(key, value);
        }
    }

    // Clear specific cache
    clearCache(cacheName: string): void {
        const cache = this.caches.get(cacheName);
        if (cache) {
            cache.clear();
        }
    }

    // Get cache statistics
    getStats(): Record<string, { size: number; config: any }> {
        const stats: Record<string, { size: number; config: any }> = {};
        for (const [name, cache] of this.caches.entries()) {
            stats[name] = {
                size: cache.size,
                config: this.cacheConfigs.get(name)
            };
        }
        return stats;
    }
}

// Global cache manager instance
const cacheManager = new UnifiedCacheManager();

// Register caches
cacheManager.registerCache('config', 30000); // 30 second config cache
cacheManager.registerCache('entity', 5000, 100); // 5 second entity cache, max 100 entries
cacheManager.registerCache('xpDrop', 60000); // 1 minute XP drop configuration cache

// Configuration validation to prevent performance issues
function validateAndClampConfig(key: string, value: any, defaultValue: any): any {
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

// Legacy compatibility functions with validation
function getCachedConfig(key: string, defaultValue: any): any {
    return cacheManager.get('config', key,
        () => {
            const rawConfigs = {
                "stackRadius": configDatabase.read("stackRadius"),
                "playerKillOnly": configDatabase.read("playerKillOnly"),
                "itemSpillCap": configDatabase.read("itemSpillCap"),
                "xpSpillCap": configDatabase.read("xpSpillCap")
            };

            const configs = {
                "stackRadius": validateAndClampConfig("stackRadius", rawConfigs.stackRadius, UI.DEFAULT_STACK_RADIUS),
                "playerKillOnly": rawConfigs.playerKillOnly ?? false,
                "itemSpillCap": validateAndClampConfig("itemSpillCap", rawConfigs.itemSpillCap, ENTITIES.DEFAULT_ITEM_SPILL_CAP),
                "xpSpillCap": validateAndClampConfig("xpSpillCap", rawConfigs.xpSpillCap, ENTITIES.DEFAULT_XP_SPILL_CAP)
            };

            return (configs as Record<string, any>)[key];
        },
        defaultValue
    );
}

(globalThis as any).updateMobstackerCache = function (key: string, value: any): void {
    cacheManager.set('config', key, value);
};

// --- CORE GAME LOGIC ---
const SMALLEST_INTERVAL = TIMING.SMALLEST_INTERVAL;
const lastSpawnTime = new Map();
const lastKilled = new Map();
const cooldownMillis = TIMING.COOLDOWN_MILLIS;
const nameTagConfig = UI.NAME_TAG_CONFIG;
const processedDeaths = new Set();

// Memory management constants
const MAP_MEMORY_LIMITS = {
    LAST_SPAWN_TIME: 5000,    // Max 5000 spawn time entries
    LAST_KILLED: 3000,        // Max 3000 kill time entries
    PROCESSED_DEATHS: 1000,   // Max 1000 processed death IDs
    ENTITY_SPAWNER_MAP: 10000 // Max 10000 entity-spawner mappings
};

const MEMORY_CLEANUP_INTERVAL = 12000; // Every 10 minutes (12000 ticks)
const ENTRY_MAX_AGE = 30 * 60 * 1000; // 30 minutes in milliseconds

export const validMobs = [
    { typeId: 'mrleefy:blazestill', displayName: 'Blaze' },
    { typeId: 'mrleefy:cowstill', displayName: 'Cow' },
    { typeId: 'mrleefy:sheepstill', displayName: 'Sheep' },
    { typeId: 'mrleefy:pigstill', displayName: 'Pig' },
    { typeId: 'mrleefy:chickenstill', displayName: 'Chicken' },
    { typeId: 'mrleefy:emeraldgolemstill', displayName: 'Emerald Golem' },
    { typeId: 'mrleefy:netheritegolemstill', displayName: 'Netherite Golem' },
    { typeId: 'mrleefy:irongolemstill', displayName: 'Iron Golem' },
    { typeId: 'mrleefy:diamondgolemstill', displayName: 'Diamond Golem' },
    { typeId: 'mrleefy:goldgolemstill', displayName: 'Gold Golem' },
    { typeId: 'mrleefy:endermanstill', displayName: 'Enderman' },
    { typeId: 'mrleefy:creeperstill', displayName: 'Creeper' },
    { typeId: 'mrleefy:magmacubestill', displayName: 'MagmaCube' },
    { typeId: 'mrleefy:guardianstill', displayName: 'Guardian' },
    { typeId: 'mrleefy:witherskeletonstill', displayName: 'Wither Skeleton' },
    { typeId: 'mrleefy:zombiestill', displayName: 'Zombie' },
    { typeId: 'mrleefy:villagerstill', displayName: 'Villager' },
    { typeId: 'mrleefy:witherstill', displayName: 'Wither' },
    { typeId: 'mrleefy:enderdragonstill', displayName: 'Ender Dragon' },
    { typeId: 'mrleefy:spiderstill', displayName: 'Spider' },
    { typeId: 'mrleefy:slimestill', displayName: 'Slime' },
    { typeId: 'mrleefy:vindicatorstill', displayName: 'Vindicator' },
    { typeId: 'mrleefy:skeletonstill', displayName: 'Skeleton' },
    { typeId: 'mrleefy:shulkerstill', displayName: 'Shulker' },
    { typeId: 'mrleefy:breezestill', displayName: 'Breeze' },
    { typeId: 'mrleefy:piglinbrutestill', displayName: 'PiglinBrute' },
    { typeId: 'mrleefy:wardenstill', displayName: 'Warden' },
    { typeId: 'mrleefy:ravagerstill', displayName: 'Ravager' },
    // --- Crawlers ---
    { typeId: 'mrleefy:coalcrawlerstill', displayName: 'Coal Crawler' },
    { typeId: 'mrleefy:glowstonecrawlerstill', displayName: 'Glowstone Crawler' },
    { typeId: 'mrleefy:obsidiancrawlerstill', displayName: 'Obsidian Crawler' },
    { typeId: 'mrleefy:icecrawlerstill', displayName: 'Ice Crawler' },
    { typeId: 'mrleefy:spongecrawlerstill', displayName: 'Sponge Crawler' },
    { typeId: 'mrleefy:lapiscrawlerstill', displayName: 'Lapis Crawler' },
    { typeId: 'mrleefy:redstonecrawlerstill', displayName: 'Redstone Crawler' },
    { typeId: 'mrleefy:coppercrawlerstill', displayName: 'Copper Crawler' },
    { typeId: 'mrleefy:quartzcrawlerstill', displayName: 'Quartz Crawler' },
    { typeId: 'mrleefy:amethystcrawlerstill', displayName: 'Amethyst Crawler' },
];

const mobDisplayNameMap = new Map(validMobs.map(m => [m.typeId, m.displayName]));

function extractStackNumber(nameTag: string | undefined): number {
    const match = nameTag?.match(/x(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
}

// Check if any players are near a location (cheap check for performance)
function hasPlayersNearby(location: Vector3, radius: number): boolean {
    try {
        const overworld = world.getDimension('overworld');
        const nearbyPlayers = overworld.getPlayers({
            location: location,
            maxDistance: radius,
            closest: 1
        });
        return nearbyPlayers.length > 0;
    } catch (error) {
        debugLog(`Error checking players near ${location.x},${location.y},${location.z}: ${error}`);
        return true; // Default to true on error to avoid skipping spawners
    }
}

// Pre-compiled regex for better performance - captures mob name until spawner
const SPAWNER_NAME_REGEX = /mrleefy:(.+?)spawner(\d+)/;

// Cache for entity type validation
const validEntityTypes = new Set(validMobs.map(mob => mob.typeId));

// Spatial partitioning for performance
const CHUNK_SIZE = 16; // Minecraft chunk size
const ACTIVE_CHUNKS = new Map(); // Track chunks with spawners
const CHUNK_CACHE_DURATION = 60000; // 1 minute cache for chunk data
let lastChunkUpdate = 0;

// Get chunk key from coordinates
function getChunkKey(x: number, z: number): string {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    return `${chunkX},${chunkZ}`;
}

// Update active chunks based on spawner locations
function updateActiveChunks(spawnruleEntities: Entity[]): void {
    const now = Date.now();
    if (now - lastChunkUpdate < CHUNK_CACHE_DURATION) return;

    ACTIVE_CHUNKS.clear();

    const MAX_CHUNKS = 500; // Reasonable limit for most servers
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

// Error recovery for stacking interval
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

// Adaptive timing variables
let currentInterval = SMALLEST_INTERVAL;

// Performance configuration for optimized spawning
function getPerformanceConfig() {
    return {
        PLAYER_ACTIVATION_RADIUS: configDatabase.read("performanceActivationRadius") || 50,
        MAX_SPAWNS_PER_CYCLE: configDatabase.read("performanceMaxSpawns") || 25,
        SPAWN_INTERVAL_TICKS: configDatabase.read("performanceSpawnInterval") || 20,
        INITIAL_DELAY_RANDOM: configDatabase.read("performanceRandomDelay") ?? true,
        MAXED_SPAWNER_RECHECK_MS: 30000 // 30 seconds backup check
    };
}

// Cache config at startup
const PERFORMANCE_CONFIG = getPerformanceConfig();

// Maxed spawner optimization
const maxedSpawners = new Map();

// Track which spawner owns each entity
const entitySpawnerOwnership = new Map();

// Clear maxed spawner cache when upgrading
export function clearMaxedSpawnerCache(x: number, y: number, z: number): void {
    const spawnerKey = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    for (const [key] of maxedSpawners) {
        if (key.endsWith(`:${spawnerKey}`)) {
            maxedSpawners.delete(key);
            debugLog(`Cleared maxed cache for: ${key}`);
        }
    }
}

// BUG FIX: Clear the per-nameTag spawner spec cache so that after AA settings
// are updated, all spawners re-read qty/speed/maxStack from the updated lookup
// on their next tick instead of continuing to use stale cached values.
export function clearSpawnerParseCache(): void {
    spawnerParseCache.clear();
    debugLog(`[AASettings] Spawner spec cache cleared — all spawners will re-read updated settings on next tick.`);
}

// Concurrency lock to prevent overlapping job execution desyncs
let isProcessingJobRunning = false;

// Cached parsed spawner nameTags to completely eliminate regex GC pressure
const spawnerParseCache = new Map();

function getSpawnerSpecs(nameTag: string): any {
    let specs = spawnerParseCache.get(nameTag);
    if (specs !== undefined) return specs;

    const parsedName = nameTag.replace(/(_)|(spawner)/gi, (match: string) =>
        match === '_' ? "" : match.toLowerCase() === 'spawner' ? 'still' : ""
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

// Generator function for processing spawners (highly optimized with a 4ms time budget per tick)
function* spawnerProcessingJob() {
    try {
        const startTime = Date.now();
        let tickStartTime = startTime;
        const overworld = world.getDimension('overworld');
        const radius = getCachedConfig("stackRadius", UI.DEFAULT_STACK_RADIUS);

        const spawnruleEntities = overworld.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE });
        updateActiveChunks(spawnruleEntities);
        if (spawnruleEntities.length === 0) {
            return; 
        }

        // Fetch all active players once to prevent C++/JS boundary crossing inside the loop
        const activePlayers = overworld.getPlayers();
        const playerRadiusSq = PERFORMANCE_CONFIG.PLAYER_ACTIVATION_RADIUS * PERFORMANCE_CONFIG.PLAYER_ACTIVATION_RADIUS;

        let spawnsThisCycle = 0;
        let processedCount = 0;
        let skippedNoPlayers = 0;
        let skippedMaxed = 0;

        for (const spawnruleEntity of spawnruleEntities) {
            // OPTIMIZATION: Yield only when exceeding a 4ms tick budget (spreads work smoothly and stops desyncs)
            if (Date.now() - tickStartTime > 4) {
                yield;
                tickStartTime = Date.now();
            }

            // Verify spawner chunk is loaded/valid
            if (!spawnruleEntity?.isValid) continue;

            const location = spawnruleEntity.location;

            // Optimized pure JS player distance evaluation (0 script boundary crossings inside loop)
            let playerNear = false;
            for (const player of activePlayers) {
                if (!player.isValid) continue;
                const pLoc = player.location;
                const dx = pLoc.x - location.x;
                const dy = pLoc.y - location.y;
                const dz = pLoc.z - location.z;
                if ((dx * dx + dy * dy + dz * dz) <= playerRadiusSq) {
                    playerNear = true;
                    break;
                }
            }
            
            if (!playerNear) {
                skippedNoPlayers++;
                continue;
            }

            const nameTag = spawnruleEntity.nameTag;
            if (!nameTag) continue;

            // Retrieve cached parsed specs (saves massive regex string GC pressure)
            const specs = getSpawnerSpecs(nameTag);
            if (!specs) continue;

            const { entityTypeId, levelNum, qty, speed, maxStack, displayName } = specs;
            const spawnerKey = `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
            const spawnKey = `${entityTypeId}:${spawnerKey}`;

            // Skip maxed spawners
            const now = Date.now();
            if (maxedSpawners.has(spawnKey)) {
                const lastMaxedCheck = maxedSpawners.get(spawnKey);
                if (now - lastMaxedCheck < PERFORMANCE_CONFIG.MAXED_SPAWNER_RECHECK_MS) {
                    skippedMaxed++;
                    continue; 
                }
            }

            // Cooldown timing
            const lastSpawn = lastSpawnTime.get(spawnKey) || 0;
            const lastKill = lastKilled.get(spawnKey) || 0;
            const speedMillis = speed * 1000;

            if (lastSpawn === 0 && PERFORMANCE_CONFIG.INITIAL_DELAY_RANDOM) {
                const randomDelay = Math.random() * speedMillis;
                lastSpawnTime.set(spawnKey, now - randomDelay);
                continue;
            }

            if (now - lastSpawn < speedMillis) continue;
            if (now - lastKill < cooldownMillis) continue;

            if (spawnsThisCycle >= PERFORMANCE_CONFIG.MAX_SPAWNS_PER_CYCLE) {
                continue; 
            }

            // Double check validation before calling getEntities in potentially unloaded chunks
            if (!spawnruleEntity.isValid) continue;

            let nearbyEntities;
            try {
                nearbyEntities = overworld.getEntities({
                    type: entityTypeId,
                    location: location,
                    maxDistance: radius,
                });
            } catch (err) {
                // Ignore chunk unloaded errors gracefully
                continue;
            }

            lastSpawnTime.set(spawnKey, now);

            let primaryEntity = null;
            let maxStackInArea = 0;
            let totalStack = 0;
            const extras = [];

            for (const entity of nearbyEntities) {
                if (!entity || !entity.isValid) continue;
                const stackSize = extractStackNumber(entity.nameTag || "");
                totalStack += stackSize;
                if (stackSize > maxStackInArea) {
                    if (primaryEntity) extras.push(primaryEntity);
                    maxStackInArea = stackSize;
                    primaryEntity = entity;
                } else {
                    extras.push(entity);
                }
            }

            // Remove extra entities
            for (const entity of extras) {
                try {
                    if (entity.isValid) {
                        entitySpawnerMap.delete(entity.id);
                        entitySpawnerOwnership.delete(entity.id);
                        entity.remove();
                        performanceMetrics.entityRemovals++;
                    }
                } catch (error) {
                    debugLog(`Failed to remove entity: ${(error as any).message}`);
                }
            }

            if (primaryEntity && primaryEntity.isValid) {
                const newStackSize = Math.min(totalStack + qty, maxStack);
                const currentStack = extractStackNumber(primaryEntity.nameTag || "");

                if (currentStack !== newStackSize) {
                    try {
                        primaryEntity.nameTag = nameTagConfig
                            .replace('#', newStackSize.toString())
                            .replace('@', displayName);
                    } catch (err) {
                        debugLog(`Failed to update primary entity nameTag: ${(err as any).message}`);
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

        debugLog(`Spawner cycle: processed=${processedCount}, spawned=${spawnsThisCycle}, skippedNoPlayers=${skippedNoPlayers}, skippedMaxed=${skippedMaxed}, time=${processingTime}ms`);

        if (processingTime > PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME) {
            debugLog(`[PERFORMANCE] Slow processing: ${processingTime}ms`);
            performanceMetrics.warningCount++;
        }

        performanceMetrics.averageProcessingTime =
            performanceMetrics.averageProcessingTime === 0
                ? processingTime
                : (performanceMetrics.averageProcessingTime * 0.95 + processingTime * 0.05);
    } catch (error) {
        console.error(`[MOBSTACKER] Error in spawner job:`, error);
    } finally {
        isProcessingJobRunning = false; // Lock release
    }
}

// Main interval that triggers the job-based processing
const stackingIntervalFunction = () => {
    if (isProcessingJobRunning) {
        debugLog("[MOBSTACKER] Stacking interval skipped - previous job still running");
        return;
    }
    try {
        isProcessingJobRunning = true;
        system.runJob(spawnerProcessingJob());
        consecutiveErrors = 0;
    } catch (error) {
        isProcessingJobRunning = false;
        consecutiveErrors++;
        console.error(`[MOBSTACKER] Stacking error (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            debugLog(`[MOBSTACKER] Too many consecutive errors`);
        }

        performanceMetrics.criticalCount++;
    }
};

// Start the interval
let activeInterval = system.runInterval(stackingIntervalFunction, PERFORMANCE_CONFIG.SPAWN_INTERVAL_TICKS);

// Memory management functions (optimised to use chronological insertion-order Map eviction - zero sorting garbage!)
function enforceMapLimits() {
    const now = Date.now();
    const cutoffTime = now - ENTRY_MAX_AGE;

    // Clean up lastSpawnTime map using Map insertion order (very fast O(N), zero GC)
    if (lastSpawnTime.size > MAP_MEMORY_LIMITS.LAST_SPAWN_TIME) {
        let toRemoveCount = lastSpawnTime.size - MAP_MEMORY_LIMITS.LAST_SPAWN_TIME;
        for (const key of lastSpawnTime.keys()) {
            if (toRemoveCount <= 0) break;
            lastSpawnTime.delete(key);
            toRemoveCount--;
        }
    }
    for (const [key, timestamp] of lastSpawnTime.entries()) {
        if (timestamp < cutoffTime) {
            lastSpawnTime.delete(key);
        }
    }

    // Clean up lastKilled map
    if (lastKilled.size > MAP_MEMORY_LIMITS.LAST_KILLED) {
        let toRemoveCount = lastKilled.size - MAP_MEMORY_LIMITS.LAST_KILLED;
        for (const key of lastKilled.keys()) {
            if (toRemoveCount <= 0) break;
            lastKilled.delete(key);
            toRemoveCount--;
        }
    }
    for (const [key, timestamp] of lastKilled.entries()) {
        if (timestamp < cutoffTime) {
            lastKilled.delete(key);
        }
    }

    // Clean up processedDeaths
    if (processedDeaths.size > MAP_MEMORY_LIMITS.PROCESSED_DEATHS) {
        let toRemoveCount = processedDeaths.size - MAP_MEMORY_LIMITS.PROCESSED_DEATHS;
        for (const value of processedDeaths.values()) {
            if (toRemoveCount <= 0) break;
            processedDeaths.delete(value);
            toRemoveCount--;
        }
    }

    // Clean up entitySpawnerMap
    if (entitySpawnerMap.size > MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP) {
        let toRemoveCount = entitySpawnerMap.size - MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP;
        for (const key of entitySpawnerMap.keys()) {
            if (toRemoveCount <= 0) break;
            entitySpawnerMap.delete(key);
            toRemoveCount--;
        }
    }

    // Clean up entitySpawnerOwnership to prevent memory leaks!
    if (entitySpawnerOwnership.size > MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP) {
        let toRemoveCount = entitySpawnerOwnership.size - MAP_MEMORY_LIMITS.ENTITY_SPAWNER_MAP;
        for (const key of entitySpawnerOwnership.keys()) {
            if (toRemoveCount <= 0) break;
            entitySpawnerOwnership.delete(key);
            toRemoveCount--;
        }
    }

    // Clean up maxedSpawners to prevent memory leaks!
    if (maxedSpawners.size > 2000) {
        let toRemoveCount = maxedSpawners.size - 2000;
        for (const key of maxedSpawners.keys()) {
            if (toRemoveCount <= 0) break;
            maxedSpawners.delete(key);
            toRemoveCount--;
        }
    }

    // Bounded spawner parse cache cleanup
    if (spawnerParseCache.size > 1000) {
        let toRemoveCount = spawnerParseCache.size - 1000;
        for (const key of spawnerParseCache.keys()) {
            if (toRemoveCount <= 0) break;
            spawnerParseCache.delete(key);
            toRemoveCount--;
        }
    }
}

// Automated memory cleanup
system.runInterval(() => {
    try {
        enforceMapLimits();
    } catch (error) {
        console.error('Memory cleanup error:', error);
    }
}, MEMORY_CLEANUP_INTERVAL);

// Optimized entity spawning function
function spawnNewStackedEntity(dimension: Dimension, entityTypeId: string, location: Vector3, qty: number, displayName: string): void {
    try {
        const spawnLocation = {
            x: location.x,
            y: location.y + 0.5,
            z: location.z
        };
        const newEntity = dimension.spawnEntity(entityTypeId as any, spawnLocation);
        if (newEntity?.isValid) {
            newEntity.nameTag = nameTagConfig.replace('#', qty.toString()).replace('@', displayName);
            const spawnerKey = `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
            entitySpawnerMap.set(newEntity.id, spawnerKey);
            performanceMetrics.entitySpawns++;
        }
    } catch (error) {
        console.error(`Failed to spawn entity ${entityTypeId}: ${error}`);
    }
}

// Optimized periodic cleanup with adaptive timing
let lastCleanupSize = 0;
let cleanupInterval = system.runInterval(() => {
    const currentSize = processedDeaths.size;
    if (currentSize > 0) {
        processedDeaths.clear();

        if (currentSize > 100 && lastCleanupSize > 100) {
            system.clearRun(cleanupInterval);
            cleanupInterval = system.runInterval(() => {
                if (processedDeaths.size > 0) processedDeaths.clear();
            }, 300);
        }
    }
    lastCleanupSize = currentSize;
}, 600); // Every 30 seconds

// Entity death and loot handling
if (!(globalThis as any).__stackDieSubscribed) {
    (globalThis as any).__stackDieSubscribed = true;

    // Entity removal handler for cleanup
    world.afterEvents.entityDie.subscribe((event: EntityDieAfterEvent) => {
        const { deadEntity } = event;
        if (deadEntity && validEntityTypes.has(deadEntity.typeId)) {
            entitySpawnerMap.delete(deadEntity.id);

            const spawnerKey = entitySpawnerOwnership.get(deadEntity.id);
            if (spawnerKey) {
                maxedSpawners.delete(spawnerKey); // Instant reactivation
                entitySpawnerOwnership.delete(deadEntity.id);
                debugLog(`Spawner reactivated (death): ${spawnerKey}`);
            }
        }
    });

    world.afterEvents.entityHurt.subscribe((event: EntityHurtAfterEvent) => {
        try {
            const { hurtEntity, damageSource } = event;
            if (!hurtEntity?.isValid) return;

            const health = hurtEntity.getComponent("health") as EntityHealthComponent | undefined;
            if (!health || health.currentValue > 0) {
                // Reactivate spawner on damage
                const ownerSpawnKey = entitySpawnerOwnership.get(hurtEntity.id);
                if (ownerSpawnKey && maxedSpawners.has(ownerSpawnKey)) {
                    maxedSpawners.delete(ownerSpawnKey);
                    debugLog(`Spawner reactivated (hurt): ${ownerSpawnKey}`);
                }
                return;
            }

            if (processedDeaths.has(hurtEntity.id)) return;
            processedDeaths.add(hurtEntity.id);

            const entityTypeId = hurtEntity.typeId;

            // FIXED: Extremely fast O(1) Set validation without closures
            if (!validEntityTypes.has(entityTypeId)) {
                return; 
            }

            // Update statistics for admin panel
            const spawnerKey = entitySpawnerMap.get(hurtEntity.id);

            const loc = hurtEntity.location;
            const spawnerKeyFallback = `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;
            const finalSpawnerKey = spawnerKey || spawnerKeyFallback;
            const killer = damageSource?.damagingEntity;
            const killerPlayer = killer?.typeId === "minecraft:player" ? (killer as Player) : undefined;
            updateSpawnerStatisticsDirect(entityTypeId, finalSpawnerKey, killerPlayer);

            debugLog(`Tracked kill: ${entityTypeId} at ${finalSpawnerKey}`);

            // Reactivate spawner
            const ownerSpawnKey = entitySpawnerOwnership.get(hurtEntity.id);
            if (ownerSpawnKey) {
                maxedSpawners.delete(ownerSpawnKey);
                entitySpawnerOwnership.delete(hurtEntity.id);
                debugLog(`Spawner reactivated (death): ${ownerSpawnKey}`);
            }

            const inheritedSpawnerKey = entitySpawnerMap.get(hurtEntity.id);
            entitySpawnerMap.delete(hurtEntity.id);
            if (!entityTypeId) {
                debugLog("Entity hurt event received without valid typeId");
                return;
            }

            const displayName = mobDisplayNameMap.get(entityTypeId);
            if (!displayName) return;

            const locKey = `${hurtEntity.location.x.toFixed(0)},${hurtEntity.location.y.toFixed(0)},${hurtEntity.location.z.toFixed(0)}`;
            lastKilled.set(`${entityTypeId}:${locKey}`, Date.now());

            const currentAmount = extractStackNumber(hurtEntity.nameTag);
            if (currentAmount > 1) {
                try {
                    const oldRotation = hurtEntity.getRotation();
                    const oldLocation = hurtEntity.location;

                    if (!oldLocation || typeof oldLocation.x !== 'number') {
                        console.error(`Invalid location data for entity ${entityTypeId}`);
                        return;
                    }

                    const newEntity = hurtEntity.dimension.spawnEntity(entityTypeId as any, oldLocation);

                    if (newEntity && newEntity.isValid) {
                        newEntity.nameTag = nameTagConfig.replace('#', (currentAmount - 1).toString()).replace('@', displayName);
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

            // --- Loot Logic (Optimised Config Reads) ---
            try {
                // Forced use of Config Cache in event listeners (critical fix)
                const playerKillOnly = getCachedConfig("playerKillOnly", false);
                // BUG FIX: 'killer' was re-declared here, shadowing the one from line 1158.
                // 'damageSource.damagingEntity' was also accessed without optional chaining,
                // which could crash if damageSource is undefined.
                // Now reuses the already-resolved 'killer' from above.
                if (playerKillOnly && (!killer || killer.typeId !== 'minecraft:player')) return;

                const xpSpillCap = getCachedConfig('xpSpillCap', ENTITIES.DEFAULT_XP_SPILL_CAP);
                if (hurtEntity.dimension.getEntities({ type: ENTITIES.XP_ORB_TYPE, location: hurtEntity.location, maxDistance: 3, closest: xpSpillCap }).length < xpSpillCap) {
                    // Cached XP Drop configs (prevents disk access on kills)
                    const xpConfig = cacheManager.get('xpDrop', entityTypeId, () => xpDropDatabase.read(entityTypeId));
                    if (xpConfig && (Math.random() * 100 < (xpConfig.chance ?? 100))) {
                        try {
                            (hurtEntity.dimension as any).spawnEntity(ENTITIES.XP_ORB_TYPE, hurtEntity.location, { amount: xpConfig.amount ?? 1 });
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

// Export statistics and functions for admin panel
export { spawnerStatistics, calculateSpawnerTotals, performanceMetrics, getMemoryUsage, loadSpawnerStatistics, resetSpawnerStatistics, getPlayerTopKills, ACTIVE_CHUNKS, enableLogging, disableLogging, isLoggingEnabled, debugLog };
