import { world, ItemStack, EnchantmentType } from '@minecraft/server';
import { Database } from './database';

// --- DATABASE SETUP ---
export const lootTableDatabase = new Database('LootTables');
const configDatabase = new Database('ConfigValues');

// Performance optimizations
const configCache = new Map();
const configCacheExpiry = new Map();
const CACHE_DURATION = 30000; // 30 seconds
const MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory bloat

// Cached config getter with TTL and size limits
function getCachedConfig(key, defaultValue) {
    const now = Date.now();
    const cacheKey = key;

    if (configCache.has(cacheKey) && configCacheExpiry.get(cacheKey) > now) {
        return configCache.get(cacheKey);
    }

    const value = configDatabase.read(key) ?? defaultValue;
    configCache.set(cacheKey, value);
    configCacheExpiry.set(cacheKey, now + CACHE_DURATION);

    // Enforce cache size limits
    if (configCache.size > MAX_CACHE_SIZE) {
        // Remove expired entries first
        const expiredKeys = [];
        for (const [k, expiry] of configCacheExpiry.entries()) {
            if (expiry <= now) {
                expiredKeys.push(k);
            }
        }
        expiredKeys.forEach(k => {
            configCache.delete(k);
            configCacheExpiry.delete(k);
        });

        // If still over limit, remove oldest entries
        if (configCache.size > MAX_CACHE_SIZE) {
            const entries = Array.from(configCacheExpiry.entries());
            entries.sort((a, b) => a[1] - b[1]); // Sort by expiry time (oldest first)
            const toRemove = entries.slice(0, configCache.size - MAX_CACHE_SIZE);
            toRemove.forEach(([k]) => {
                configCache.delete(k);
                configCacheExpiry.delete(k);
            });
        }
    }

    return value;
}

// Pre-calculated loot tables for better performance
const preCalculatedLootTables = new Map();

// --- LOOT MANAGER CLASS DEFINITION ---

/**
 * Manages all loot table logic, including loading, saving, and processing drops.
 * This class uses a Singleton pattern to ensure only one instance exists.
 */
class LootManager {
    // Singleton instance
    static instance;

    constructor() {
        if (LootManager.instance) {
            return LootManager.instance;
        }

        // --- PROPERTIES ---
        this.defaultEntities = {
            'mrleefy:piglinbrutestill': { 'minecraft:golden_axe': { chance: 8.5 }, 'minecraft:gold_nugget': { chance: 100 } },
            'mrleefy:breezestill': { 'minecraft:wind_charge': { chance: 10 }, 'minecraft:breeze_rod': { chance: 80 } },
            'mrleefy:ravagerstill': { 'minecraft:saddle': { chance: 80 }, 'minecraft:wolf_armor': { chance: 0.1 }, 'minecraft:diamond_horse_armor': { chance: 0.1 }, 'minecraft:golden_horse_armor': { chance: 0.2 }, 'minecraft:iron_horse_armor': { chance: 1 } },
            'mrleefy:blazestill': { 'minecraft:blaze_rod': { chance: 100, quantity: 1 } },
            'mrleefy:cowstill': { 'minecraft:leather': { chance: 100, quantity: 1 }, 'minecraft:beef': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:sheepstill': { 'minecraft:wool': { chance: 100, quantity: 1, stackable: true }, 'minecraft:mutton': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:pigstill': { 'minecraft:porkchop': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:chickenstill': { 'minecraft:feather': { chance: 50, quantity: 1, stackable: true }, 'minecraft:chicken': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:emeraldgolemstill': { 'minecraft:emerald': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:netheritegolemstill': { 'minecraft:netherite_ingot': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:irongolemstill': { 'minecraft:iron_ingot': { chance: 100, quantity: 1, stackable: true }, 'minecraft:poppy': { chance: 25, quantity: 1, stackable: true } },
            'mrleefy:diamondgolemstill': { 'minecraft:diamond': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:goldgolemstill': { 'minecraft:gold_ingot': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:endermanstill': { 'minecraft:ender_pearl': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:creeperstill': { 'minecraft:gunpowder': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:magmacubestill': { 'minecraft:magma_cream': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:guardianstill': { 'minecraft:prismarine_shard': { chance: 100, quantity: 1, stackable: true }, 'minecraft:prismarine_crystals': { chance: 50, quantity: 1, stackable: true } },
            'mrleefy:witherskeletonstill': { 'minecraft:coal': { chance: 25, quantity: 1, stackable: true }, 'minecraft:bone': { chance: 100, quantity: 1, stackable: true }, 'minecraft:wither_skeleton_skull': { chance: 1, stackable: false } },
            'mrleefy:zombiestill': { 'minecraft:rotten_flesh': { chance: 100, quantity: 1, stackable: true }, 'minecraft:iron_ingot': { chance: 2, quantity: 1, stackable: true }, 'minecraft:carrot': { chance: 2, quantity: 1, stackable: true }, 'minecraft:potato': { chance: 2, quantity: 1, stackable: true } },
            'mrleefy:witherstill': { 'minecraft:nether_star': { chance: 100, quantity: 1, stackable: false } },
            'mrleefy:spiderstill': { 'minecraft:string': { chance: 100, quantity: 1, stackable: true }, 'minecraft:spider_eye': { chance: 10, quantity: 1, stackable: true } },
            'mrleefy:slimestill': { 'minecraft:slime_ball': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:vindicatorstill': { 'minecraft:emerald': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:wardenstill': { 'minecraft:sculk_catalyst': { chance: 1, quantity: 1, stackable: true }, 'minecraft:echo_shard': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:skeletonstill': { 'minecraft:bone': { chance: 100, quantity: 1, stackable: true }, 'minecraft:arrow': { chance: 100, quantity: 1, stackable: true }, 'minecraft:bow': { chance: 5, stackable: false, randomdurability: true } },
            'mrleefy:shulkerstill': { 'minecraft:shulker_shell': { chance: 100, quantity: 1, stackable: true } },
        };

        this.entities = {}; // This will be populated from the database
        this.enchantmentCategories = {
            axe: [ { type: 'sharpness', minLevel: 1, maxLevel: 5 }, { type: 'smite', minLevel: 1, maxLevel: 5 }, { type: 'bane_of_arthropods', minLevel: 1, maxLevel: 5 }, { type: 'efficiency', minLevel: 1, maxLevel: 5 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'fortune', minLevel: 1, maxLevel: 3 }, { type: 'silk_touch', minLevel: 1, maxLevel: 1 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            helmet: [ { type: 'protection', minLevel: 1, maxLevel: 4 }, { type: 'fire_protection', minLevel: 1, maxLevel: 4 }, { type: 'blast_protection', minLevel: 1, maxLevel: 4 }, { type: 'projectile_protection', minLevel: 1, maxLevel: 4 }, { type: 'respiration', minLevel: 1, maxLevel: 3 }, { type: 'aqua_affinity', minLevel: 1, maxLevel: 1 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            chestplate: [ { type: 'protection', minLevel: 1, maxLevel: 4 }, { type: 'fire_protection', minLevel: 1, maxLevel: 4 }, { type: 'blast_protection', minLevel: 1, maxLevel: 4 }, { type: 'projectile_protection', minLevel: 1, maxLevel: 4 }, { type: 'thorns', minLevel: 1, maxLevel: 3 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            leggings: [ { type: 'protection', minLevel: 1, maxLevel: 4 }, { type: 'fire_protection', minLevel: 1, maxLevel: 4 }, { type: 'blast_protection', minLevel: 1, maxLevel: 4 }, { type: 'projectile_protection', minLevel: 1, maxLevel: 4 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'thorns', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            boots: [ { type: 'protection', minLevel: 1, maxLevel: 4 }, { type: 'fire_protection', minLevel: 1, maxLevel: 4 }, { type: 'blast_protection', minLevel: 1, maxLevel: 4 }, { type: 'projectile_protection', minLevel: 1, maxLevel: 4 }, { type: 'feather_falling', minLevel: 1, maxLevel: 4 }, { type: 'depth_strider', minLevel: 1, maxLevel: 3 }, { type: 'frost_walker', minLevel: 1, maxLevel: 2 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'soul_speed', minLevel: 1, maxLevel: 3 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            sword: [ { type: 'sharpness', minLevel: 1, maxLevel: 5 }, { type: 'smite', minLevel: 1, maxLevel: 5 }, { type: 'bane_of_arthropods', minLevel: 1, maxLevel: 5 }, { type: 'knockback', minLevel: 1, maxLevel: 2 }, { type: 'fire_aspect', minLevel: 1, maxLevel: 2 }, { type: 'looting', minLevel: 1, maxLevel: 3 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            trident: [ { type: 'impaling', minLevel: 1, maxLevel: 5 }, { type: 'riptide', minLevel: 1, maxLevel: 3 }, { type: 'loyalty', minLevel: 1, maxLevel: 3 }, { type: 'channeling', minLevel: 1, maxLevel: 1 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            bow: [ { type: 'power', minLevel: 1, maxLevel: 5 }, { type: 'punch', minLevel: 1, maxLevel: 2 }, { type: 'flame', minLevel: 1, maxLevel: 1 }, { type: 'infinity', minLevel: 1, maxLevel: 1 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            crossbow: [ { type: 'piercing', minLevel: 1, maxLevel: 4 }, { type: 'quick_charge', minLevel: 1, maxLevel: 3 }, { type: 'multishot', minLevel: 1, maxLevel: 1 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            mace: [ { type: 'density', minLevel: 1, maxLevel: 5 }, { type: 'breach', minLevel: 1, maxLevel: 4 }, { type: 'wind_burst', minLevel: 1, maxLevel: 3 }, { type: 'unbreaking', minLevel: 1, maxLevel: 3 }, { type: 'mending', minLevel: 1, maxLevel: 1 }, { type: 'fire_aspect', minLevel: 1, maxLevel: 2 }, { type: 'sharpness', minLevel: 1, maxLevel: 5 }, { type: 'smite', minLevel: 1, maxLevel: 5 }, { type: 'bane_of_arthropods', minLevel: 1, maxLevel: 5 }, { type: 'vanishing', minLevel: 1, maxLevel: 1 } ],
            book: []
        };
        
        this.enchantmentIncompatibilities = {
            protection: ['fire_protection', 'blast_protection', 'projectile_protection'],
            fire_protection: ['protection', 'blast_protection', 'projectile_protection'],
            blast_protection: ['protection', 'fire_protection', 'projectile_protection'],
            projectile_protection: ['protection', 'fire_protection', 'blast_protection'],
            sharpness: ['smite', 'bane_of_arthropods'],
            smite: ['sharpness', 'bane_of_arthropods'],
            bane_of_arthropods: ['sharpness', 'smite'],
            fortune: ['silk_touch'],
            silk_touch: ['fortune'],
            infinity: ['mending'],
            mending: ['infinity'],
            loyalty: ['riptide'],
            riptide: ['loyalty', 'channeling'],
            channeling: ['riptide']
        };

        LootManager.instance = this;
        this.initialize(); // Load data when the instance is created
    }

    /**
     * Loads loot tables from the database or uses defaults.
     */
    initialize() {
        for (const entityId in this.defaultEntities) {
            const savedLootTable = lootTableDatabase.read(entityId);
            // If there's a table in the database, use it. Otherwise, use the hardcoded default.
            this.entities[entityId] = savedLootTable || this.defaultEntities[entityId];
        }
    }

    /**
     * Saves a specific entity's loot table to the database.
     * @param {string} entityId The entity ID (e.g., 'mrleefy:zombiestill')
     */
    saveLootTable(entityId) {
        if (this.entities[entityId] && Object.keys(this.entities[entityId]).length > 0) {
            lootTableDatabase.write(entityId, this.entities[entityId]);
        } else {
            // If the table is empty, remove it from the database to save space
            lootTableDatabase.delete(entityId);
            delete this.entities[entityId];
        }
    }

    /**
     * Gets the Looting level from a player's held item.
     * @param {import('@minecraft/server').Player} player
     * @returns {number} The level of Looting, or 0 if none.
     */
    getLootLevel(player) {
        try {
            const equipment = player.getComponent('equippable');
            const mainhandItem = equipment?.getEquipment('Mainhand');
            if (!mainhandItem) return 0;
            
            const enchantments = mainhandItem.getComponent('enchantable')?.getEnchantments();
            const lootingEnchant = enchantments?.find(e => e.type.id === 'looting');
            
            return lootingEnchant ? lootingEnchant.level : 0;
        } catch (e) {
            return 0; // Return 0 if any component is missing
        }
    }

    /**
     * Calculates the final loot to be dropped based on chance and Looting level.
     * @param {object} lootTable The loot table to process.
     * @param {number} lootLevel The level of Looting enchantment.
     * @returns {object} A final loot object with items and quantities.
     */
    calcLoot(lootTable, lootLevel) {
        const finalLoot = {};
        const lootTableEntries = Object.entries(lootTable);

        // Early return for empty loot tables
        if (lootTableEntries.length === 0) return finalLoot;

        for (const [itemId, config] of lootTableEntries) {
            const baseChance = config.chance ?? 100;
            const modifiedChance = baseChance * (1 + (lootLevel * 0.1)); // 10% bonus per Looting level

            if (Math.random() * 100 < modifiedChance) {
                let dropQuantity = config.quantity ?? 1;

                // Optimized looting logic - calculate all at once instead of loop
                if (lootLevel > 0 && config.stackable) {
                    // Calculate bonus drops using binomial distribution approximation
                    const bonusChance = 0.25 * lootLevel;
                    const bonusDrops = Math.floor(bonusChance + (Math.random() * 0.5));
                    dropQuantity += Math.min(bonusDrops, lootLevel);
                }

                finalLoot[itemId] = { ...config, quantity: dropQuantity };
            }
        }
        return finalLoot;
    }

    /**
     * Handles the entity death event to process and spawn loot.
     * @param {import('@minecraft/server').EntityDieEvent} event
     */
    onEntityDeath(event) {
        const { deadEntity, damageSource } = event;
        if (!deadEntity?.isValid) return;

        const entityId = deadEntity.typeId;
        const lootTable = this.entities[entityId];
        if (!lootTable) return;

        // Use cached config values for better performance
        const playerKillOnly = getCachedConfig('playerKillOnly', false);
        const killer = damageSource?.damagingEntity;

        if (playerKillOnly && (!killer || killer.typeId !== 'minecraft:player')) {
            return; // Exit if loot should only drop from player kills
        }

        const entityLocation = deadEntity.location;
        const entityDimension = deadEntity.dimension;

        // Optimized spill protection - cache item count in location
        const spillCap = getCachedConfig('itemSpillCap', 5);
        const nearbyItems = entityDimension.getEntities({
            type: 'minecraft:item',
            location: entityLocation,
            maxDistance: 3,
            closest: spillCap
        });

        if (nearbyItems.length >= spillCap) {
            return;
        }

        const lootLevel = (killer?.typeId === 'minecraft:player') ? this.getLootLevel(killer) : 0;
        const finalLoot = this.calcLoot(lootTable, lootLevel);

        // Process loot drops with optimized item creation
        this.processLootDrops(finalLoot, entityDimension, entityLocation);
    }

    /**
     * Optimized loot drop processing
     * @param {object} finalLoot - The calculated loot to drop
     * @param {Dimension} dimension - The dimension to spawn items in
     * @param {Vector3} location - The location to spawn items at
     */
    processLootDrops(finalLoot, dimension, location) {
        const lootEntries = Object.entries(finalLoot);
        if (lootEntries.length === 0) return;

        // Pre-allocate arrays for different item types to reduce iterations
        const xpOrbs = [];
        const stackableItems = [];
        const nonStackableItems = [];

        for (const [itemId, config] of lootEntries) {
            if (itemId === 'minecraft:xp_orb') {
                xpOrbs.push(config);
            } else if (config.stackable) {
                stackableItems.push({ itemId, config });
            } else {
                nonStackableItems.push({ itemId, config });
            }
        }

        // Process XP orbs
        for (const config of xpOrbs) {
            try {
                dimension.spawnEntity("minecraft:experience_orb", location, { amount: config.quantity });
            } catch (e) {
                console.warn(`[LootManager] Error spawning XP orb: ${e}`);
            }
        }

        // Process stackable items
        for (const { itemId, config } of stackableItems) {
            try {
                const itemStack = this.createItemStack(itemId, config);
                dimension.spawnItem(itemStack, location);
            } catch (e) {
                console.warn(`[LootManager] Error spawning loot item ${itemId}: ${e}`);
            }
        }

        // Process non-stackable items
        for (const { itemId, config } of nonStackableItems) {
            for (let i = 0; i < config.quantity; i++) {
                try {
                    const itemStack = this.createItemStack(itemId, { ...config, quantity: 1 });
                    dimension.spawnItem(itemStack, location);
                } catch (e) {
                    console.warn(`[LootManager] Error spawning loot item ${itemId}: ${e}`);
                    break; // Stop spawning this item type if error occurs
                }
            }
        }
    }

    /**
     * Creates an optimized ItemStack with enchantments and durability
     * @param {string} itemId - The item identifier
     * @param {object} config - The item configuration
     * @returns {ItemStack} The created item stack
     */
    createItemStack(itemId, config) {
        const itemStack = new ItemStack(itemId, config.quantity);

        // Apply enchantments if configured
        if (config.enchantments) {
            const enchComp = itemStack.getComponent('enchantable');
            if (enchComp) {
                try {
                    enchComp.addEnchantment({
                        type: new EnchantmentType(config.enchantments.category),
                        level: 1
                    });
                } catch (e) {
                    console.warn(`[LootManager] Failed to apply enchantment to ${itemId}: ${e}`);
                }
            }
        }

        // Apply random durability if configured
        if (config.randomdurability) {
            const durability = itemStack.getComponent('durability');
            if (durability) {
                durability.damage = Math.floor(Math.random() * durability.maxDurability);
            }
        }

        return itemStack;
    }
}

// --- INITIALIZATION AND EVENT SUBSCRIPTION ---

// Create the single instance of the LootManager
const lootManagerInstance = new LootManager();

// Export the instance for other modules to use, ensuring they all use the same one
export { lootManagerInstance as LootManager };

// Subscribe to the entityDie event
world.afterEvents.entityDie.subscribe(event => {
    lootManagerInstance.onEntityDeath(event);
});