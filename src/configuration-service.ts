import { UI, ENTITIES, VALIDATION, PERFORMANCE } from "./constants";
import { Database } from "./database";

/**
 * Service class for managing all configuration settings
 * Provides a unified interface for configuration with caching and validation
 */
export class ConfigurationService {
    configDatabase: Database;
    xpDropDatabase: Database;
    spawnerDatabase: Database;
    cache: Map<string, any>;
    cacheExpiry: Map<string, number>;
    CACHE_DURATION: number;

    constructor() {
        this.configDatabase = new Database("ConfigValues");
        this.xpDropDatabase = new Database("XPDropValues");
        this.spawnerDatabase = new Database("SpawnerLocations");

        // Configuration cache with TTL
        this.cache = new Map<string, any>();
        this.cacheExpiry = new Map<string, number>();
        this.CACHE_DURATION = PERFORMANCE.CACHE_DURATION;
    }

    /**
     * Get cached configuration value with automatic cache management
     * @param key - Configuration key
     * @param defaultValue - Default value if key doesn't exist
     * @returns The configuration value
     */
    getConfig(key: string, defaultValue: any = null): any {
        const now = Date.now();
        const cacheKey = `config_${key}`;

        // Check cache first
        if (this.cache.has(cacheKey) && (this.cacheExpiry.get(cacheKey) ?? 0) > now) {
            return this.cache.get(cacheKey);
        }

        // Fetch from database
        let value: any;
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
     * @param key - Configuration key
     * @param value - Configuration value
     */
    setConfig(key: string, value: any): void {
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
     * @param key - Configuration key
     * @param value - Value to validate
     * @returns True if valid
     */
    validateConfig(key: string, value: any): boolean {
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
     * @param entityId - Entity identifier
     * @returns XP configuration or null
     */
    getXpDropConfig(entityId: string): any {
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
    setXpDropConfig(entityId: string, config: any): void {
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
     * @param coordinates - Coordinate string
     * @returns Spawner data or null
     */
    getSpawnerLocation(coordinates: string): any {
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
    setSpawnerLocation(coordinates: string, data: any): void {
        this.spawnerDatabase.write(coordinates, data);

        // Invalidate cache
        const cacheKey = `spawner_${coordinates}`;
        this.cache.delete(cacheKey);
        this.cacheExpiry.delete(cacheKey);
    }

    /**
     * Remove spawner location data
     * @param coordinates - Coordinate string
     */
    removeSpawnerLocation(coordinates: string): void {
        this.spawnerDatabase.delete(coordinates);

        // Invalidate cache
        const cacheKey = `spawner_${coordinates}`;
        this.cache.delete(cacheKey);
        this.cacheExpiry.delete(cacheKey);
    }

    /**
     * Clear all configuration cache
     */
    clearCache(): void {
        this.cache.clear();
        this.cacheExpiry.clear();
    }

    /**
     * Get configuration statistics
     * @returns Configuration statistics
     */
    getStats(): any {
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
    getAllConfig(): any {
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
