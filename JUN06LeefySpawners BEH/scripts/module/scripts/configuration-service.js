import { UI, ENTITIES, VALIDATION, PERFORMANCE } from "./constants.js";
import { Database } from "./database.js";

/**
 * Service class for managing all configuration settings
 * Provides a unified interface for configuration with caching and validation
 */
export class ConfigurationService {
    constructor() {
        this.configDatabase = new Database("ConfigValues");
        this.xpDropDatabase = new Database("XPDropValues");
        this.spawnerDatabase = new Database("SpawnerLocations");

        // Configuration cache with TTL
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.CACHE_DURATION = PERFORMANCE.CACHE_DURATION;
    }

    /**
     * Get cached configuration value with automatic cache management
     * @param {string} key - Configuration key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {*} The configuration value
     */
    getConfig(key, defaultValue = null) {
        const now = Date.now();
        const cacheKey = `config_${key}`;

        // Check cache first
        if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey) > now) {
            return this.cache.get(cacheKey);
        }

        // Fetch from database
        let value;
        switch (key) {
            case 'playerKillOnly':
                value = this.configDatabase.read(key) ?? false;
                break;
            case 'itemSpillCap':
                value = this.configDatabase.read(key) ?? ENTITIES.DEFAULT_ITEM_SPILL_CAP;
                break;
            case 'xpSpillCap':
                value = this.configDatabase.read(key) ?? ENTITIES.DEFAULT_XP_SPILL_CAP;
                break;
            case 'stackRadius':
                value = this.configDatabase.read(key) ?? UI.DEFAULT_STACK_RADIUS;
                break;
            default:
                value = this.configDatabase.read(key) ?? defaultValue;
        }

        // Cache the value
        this.cache.set(cacheKey, value);
        this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);

        return value;
    }

    /**
     * Set configuration value with cache invalidation
     * @param {string} key - Configuration key
     * @param {*} value - Configuration value
     */
    setConfig(key, value) {
        // Validate value based on key
        if (!this.validateConfig(key, value)) {
            throw new Error(`Invalid configuration value for ${key}: ${value}`);
        }

        // Update database
        this.configDatabase.write(key, value);

        // Invalidate cache
        const cacheKey = `config_${key}`;
        this.cache.delete(cacheKey);
        this.cacheExpiry.delete(cacheKey);
    }

    /**
     * Validate configuration value
     * @param {string} key - Configuration key
     * @param {*} value - Value to validate
     * @returns {boolean} True if valid
     */
    validateConfig(key, value) {
        switch (key) {
            case 'stackRadius':
                return typeof value === 'number' &&
                       value >= VALIDATION.MIN_RADIUS &&
                       value <= VALIDATION.MAX_RADIUS;
            case 'itemSpillCap':
            case 'xpSpillCap':
                return typeof value === 'number' &&
                       value >= 1 &&
                       value <= 10;
            case 'playerKillOnly':
                return typeof value === 'boolean';
            default:
                return true;
        }
    }

    /**
     * Get XP drop configuration for an entity
     * @param {string} entityId - Entity identifier
     * @returns {object|null} XP configuration or null
     */
    getXpDropConfig(entityId) {
        const cacheKey = `xp_${entityId}`;
        const now = Date.now();

        if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey) > now) {
            return this.cache.get(cacheKey);
        }

        const config = this.xpDropDatabase.read(entityId);
        this.cache.set(cacheKey, config);
        this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);

        return config;
    }

    /**
     * Set XP drop configuration for an entity
     * @param {string} entityId - Entity identifier
     * @param {object} config - XP configuration
     */
    setXpDropConfig(entityId, config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid XP configuration');
        }

        if (typeof config.amount !== 'number' || config.amount < 0) {
            throw new Error('Invalid XP amount');
        }

        if (typeof config.chance !== 'number' || config.chance < 0 || config.chance > 100) {
            throw new Error('Invalid XP chance');
        }

        this.xpDropDatabase.write(entityId, config);

        // Invalidate cache
        const cacheKey = `xp_${entityId}`;
        this.cache.delete(cacheKey);
        this.cacheExpiry.delete(cacheKey);
    }

    /**
     * Get spawner location data
     * @param {string} coordinates - Coordinate string
     * @returns {object|null} Spawner data or null
     */
    getSpawnerLocation(coordinates) {
        const cacheKey = `spawner_${coordinates}`;
        const now = Date.now();

        if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey) > now) {
            return this.cache.get(cacheKey);
        }

        const data = this.spawnerDatabase.read(coordinates);
        this.cache.set(cacheKey, data);
        this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);

        return data;
    }

    /**
     * Set spawner location data
     * @param {string} coordinates - Coordinate string
     * @param {object} data - Spawner data
     */
    setSpawnerLocation(coordinates, data) {
        this.spawnerDatabase.write(coordinates, data);

        // Invalidate cache
        const cacheKey = `spawner_${coordinates}`;
        this.cache.delete(cacheKey);
        this.cacheExpiry.delete(cacheKey);
    }

    /**
     * Remove spawner location data
     * @param {string} coordinates - Coordinate string
     */
    removeSpawnerLocation(coordinates) {
        this.spawnerDatabase.delete(coordinates);

        // Invalidate cache
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
     * @returns {object} Configuration statistics
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
     * @returns {object} All configuration values
     */
    getAllConfig() {
        return {
            playerKillOnly: this.getConfig('playerKillOnly', false),
            itemSpillCap: this.getConfig('itemSpillCap', ENTITIES.DEFAULT_ITEM_SPILL_CAP),
            xpSpillCap: this.getConfig('xpSpillCap', ENTITIES.DEFAULT_XP_SPILL_CAP),
            stackRadius: this.getConfig('stackRadius', UI.DEFAULT_STACK_RADIUS)
        };
    }
}

// Export singleton instance
export const configService = new ConfigurationService();
