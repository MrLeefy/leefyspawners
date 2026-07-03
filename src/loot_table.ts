import { world, ItemStack, EntityDieAfterEvent, Player, Dimension, Vector3 } from '@minecraft/server';
import { Database } from './database';
import { ENTITIES } from './constants';

// --- DATABASE SETUP ---
export const lootTableDatabase = new Database('LootTables');
const configDatabase = new Database('ConfigValues');

// Performance optimizations
const configCache = new Map<string, any>();
const configCacheExpiry = new Map<string, number>();
const CACHE_DURATION = 30000; // 30 seconds
const MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory bloat

// Cached config getter with TTL and size limits
function getCachedConfig(key: string, defaultValue: any): any {
    const now = Date.now();
    const cacheKey = key;

    if (configCache.has(cacheKey) && (configCacheExpiry.get(cacheKey) ?? 0) > now) {
        return configCache.get(cacheKey);
    }

    const value = configDatabase.read(key) ?? defaultValue;
    configCache.set(cacheKey, value);
    configCacheExpiry.set(cacheKey, now + CACHE_DURATION);

    // Enforce cache size limits
    if (configCache.size > MAX_CACHE_SIZE) {
        // Remove expired entries first
        const expiredKeys: string[] = [];
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

// --- LOOT MANAGER CLASS DEFINITION ---

/**
 * Manages all loot table logic, including loading, saving, and processing drops.
 * This class uses a Singleton pattern to ensure only one instance exists.
 */
class LootManager {
    // Singleton instance
    static instance: LootManager;

    defaultEntities!: Record<string, any>;
    entities!: Record<string, any>;
    enchantmentCategories!: Record<string, any[]>;
    enchantmentIncompatibilities!: Record<string, string[]>;

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
            'mrleefy:villagerstill': {
                'minecraft:emerald': { chance: 100, quantity: 1, stackable: true },
                'minecraft:book': { chance: 45, quantity: 1, stackable: true },
                'minecraft:enchanted_book': { chance: 4, stackable: false },
                'minecraft:experience_bottle': { chance: 30, quantity: 1, stackable: true },
                'minecraft:map': { chance: 15, quantity: 1, stackable: true },
                'minecraft:compass': { chance: 8, quantity: 1, stackable: true },
                'minecraft:clock': { chance: 8, quantity: 1, stackable: true },
                'minecraft:bread': { chance: 40, quantity: 1, stackable: true },
                'minecraft:cookie': { chance: 20, quantity: 1, stackable: true },
                'minecraft:pumpkin_pie': { chance: 15, quantity: 1, stackable: true },
                'minecraft:apple': { chance: 30, quantity: 1, stackable: true },
                'minecraft:golden_carrot': { chance: 10, quantity: 1, stackable: true },
                'minecraft:iron_sword': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:iron_axe': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:iron_pickaxe': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:iron_shovel': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:diamond_sword': { chance: 0.5, stackable: false, randomdurability: true },
                'minecraft:diamond_axe': { chance: 0.5, stackable: false, randomdurability: true },
                'minecraft:diamond_pickaxe': { chance: 0.5, stackable: false, randomdurability: true },
                'minecraft:diamond_shovel': { chance: 0.5, stackable: false, randomdurability: true },
                'minecraft:shield': { chance: 5, stackable: false, randomdurability: true },
                'minecraft:bow': { chance: 5, stackable: false, randomdurability: true },
                'minecraft:crossbow': { chance: 5, stackable: false, randomdurability: true },
                'minecraft:shears': { chance: 10, stackable: false, randomdurability: true },
                'minecraft:saddle': { chance: 3, stackable: false },
                'minecraft:iron_helmet': { chance: 2, stackable: false, randomdurability: true },
                'minecraft:iron_chestplate': { chance: 2, stackable: false, randomdurability: true },
                'minecraft:iron_leggings': { chance: 2, stackable: false, randomdurability: true },
                'minecraft:iron_boots': { chance: 2, stackable: false, randomdurability: true },
                'minecraft:chainmail_helmet': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:chainmail_chestplate': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:chainmail_leggings': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:chainmail_boots': { chance: 3, stackable: false, randomdurability: true },
                'minecraft:diamond_helmet': { chance: 0.3, stackable: false, randomdurability: true },
                'minecraft:diamond_chestplate': { chance: 0.3, stackable: false, randomdurability: true },
                'minecraft:diamond_leggings': { chance: 0.3, stackable: false, randomdurability: true },
                'minecraft:diamond_boots': { chance: 0.3, stackable: false, randomdurability: true },
                'minecraft:leather_helmet': { chance: 5, stackable: false, randomdurability: true },
                'minecraft:leather_chestplate': { chance: 5, stackable: false, randomdurability: true },
                'minecraft:leather_leggings': { chance: 5, stackable: false, randomdurability: true },
                'minecraft:leather_boots': { chance: 5, stackable: false, randomdurability: true },
                'minecraft:arrow': { chance: 25, quantity: 2, stackable: true },
                'minecraft:flint': { chance: 20, quantity: 1, stackable: true },
                'minecraft:feather': { chance: 20, quantity: 1, stackable: true },
                'minecraft:leather': { chance: 25, quantity: 1, stackable: true },
                'minecraft:redstone': { chance: 15, quantity: 1, stackable: true },
                'minecraft:lapis_lazuli': { chance: 15, quantity: 1, stackable: true },
                'minecraft:glowstone_dust': { chance: 12, quantity: 1, stackable: true },
                'minecraft:ender_pearl': { chance: 5, quantity: 1, stackable: true },
                'minecraft:clay_ball': { chance: 18, quantity: 1, stackable: true },
                'minecraft:brick': { chance: 15, quantity: 1, stackable: true }
            },
            'mrleefy:witherstill': { 'minecraft:nether_star': { chance: 100, quantity: 1, stackable: false } },
            'mrleefy:enderdragonstill': {
                'minecraft:dragon_breath': { chance: 100, quantity: 1, stackable: true },
                'minecraft:dragon_egg': { chance: 1, stackable: false },
                'minecraft:experience_bottle': { chance: 100, quantity: 10, stackable: true },
                'minecraft:enchanted_book': { chance: 20, stackable: false },
                'minecraft:elytra': { chance: 2, stackable: false, randomdurability: true }
            },
            'mrleefy:spiderstill': { 'minecraft:string': { chance: 100, quantity: 1, stackable: true }, 'minecraft:spider_eye': { chance: 10, quantity: 1, stackable: true } },
            'mrleefy:slimestill': { 'minecraft:slime_ball': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:vindicatorstill': { 'minecraft:emerald': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:wardenstill': { 'minecraft:sculk_catalyst': { chance: 1, quantity: 1, stackable: true }, 'minecraft:echo_shard': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:skeletonstill': { 'minecraft:bone': { chance: 100, quantity: 1, stackable: true }, 'minecraft:arrow': { chance: 100, quantity: 1, stackable: true }, 'minecraft:bow': { chance: 5, stackable: false, randomdurability: true } },
            'mrleefy:shulkerstill': { 'minecraft:shulker_shell': { chance: 100, quantity: 1, stackable: true } },
            // --- Crawlers ---
            'mrleefy:coalcrawlerstill': { 'minecraft:coal': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:glowstonecrawlerstill': { 'minecraft:glowstone_dust': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:obsidiancrawlerstill': { 'minecraft:obsidian': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:icecrawlerstill': { 'minecraft:packed_ice': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:spongecrawlerstill': { 'minecraft:sponge': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:lapiscrawlerstill': { 'minecraft:lapis_lazuli': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:redstonecrawlerstill': { 'minecraft:redstone': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:coppercrawlerstill': { 'minecraft:copper_ingot': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:quartzcrawlerstill': { 'minecraft:quartz': { chance: 100, quantity: 1, stackable: true } },
            'mrleefy:amethystcrawlerstill': { 'minecraft:amethyst_shard': { chance: 100, quantity: 1, stackable: true } },
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
    initialize(): void {
        for (const entityId in this.defaultEntities) {
            const savedLootTable = lootTableDatabase.read(entityId);
            // If there's a table in the database, use it. Otherwise, use the hardcoded default.
            this.entities[entityId] = savedLootTable || this.defaultEntities[entityId];
        }
    }

    /**
     * Saves a specific entity's loot table to the database.
     * @param entityId The entity ID (e.g., 'mrleefy:zombiestill')
     */
    saveLootTable(entityId: string): void {
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
     * @param player - Player object
     * @returns The level of Looting, or 0 if none.
     */
    getLootLevel(player: Player): number {
        try {
            const equipment: any = player.getComponent('equippable');
            const mainhandItem = equipment?.getEquipment('Mainhand');
            if (!mainhandItem) return 0;
            
            const enchantments: any[] = mainhandItem.getComponent('enchantable')?.getEnchantments() || [];
            const lootingEnchant = enchantments?.find(e => e.type.id === 'looting');
            
            return lootingEnchant ? lootingEnchant.level : 0;
        } catch (e) {
            return 0; // Return 0 if any component is missing
        }
    }

    /**
     * Calculates the final loot to be dropped based on chance and Looting level.
     * @param lootTable The loot table to process.
     * @param lootLevel The level of Looting enchantment.
     * @returns A final loot object with items and quantities.
     */
    calcLoot(lootTable: any, lootLevel: number): Record<string, any> {
        const finalLoot: Record<string, any> = {};
        const lootTableEntries = Object.entries(lootTable);

        // Early return for empty loot tables
        if (lootTableEntries.length === 0) return finalLoot;

        for (const [itemId, config] of lootTableEntries as [string, any][]) {
            const baseChance = config.chance ?? 100;
            const modifiedChance = baseChance * (1 + (lootLevel * 0.1)); // 10% bonus per Looting level

            if (Math.random() * 100 < modifiedChance) {
                let dropQuantity = config.quantity ?? 1;

                // Optimized looting logic
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
     * @param event - EntityDieAfterEvent object
     */
    onEntityDeath(event: EntityDieAfterEvent): void {
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

        // Optimized spill protection
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

        const lootLevel = (killer?.typeId === 'minecraft:player') ? this.getLootLevel(killer as Player) : 0;
        const finalLoot = this.calcLoot(lootTable, lootLevel);

        // Process loot drops with optimized item creation
        this.processLootDrops(finalLoot, entityDimension, entityLocation);
    }

    /**
     * Optimized loot drop processing
     * @param finalLoot - The calculated loot to drop
     * @param dimension - The dimension to spawn items in
     * @param location - The location to spawn items at
     */
    processLootDrops(finalLoot: Record<string, any>, dimension: Dimension, location: Vector3): void {
        const lootEntries = Object.entries(finalLoot);
        if (lootEntries.length === 0) return;

        const xpOrbs: any[] = [];
        const stackableItems: any[] = [];
        const nonStackableItems: any[] = [];

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
                (dimension as any).spawnEntity(ENTITIES.XP_ORB_TYPE, location, { amount: config.quantity });
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
     * @param itemId - The item identifier
     * @param config - The item configuration
     * @returns The created item stack
     */
    createItemStack(itemId: string, config: any): ItemStack {
        const itemStack = new ItemStack(itemId, config.quantity);

        // Apply enchantments if configured
        if (config.enchantments) {
            const enchComp: any = itemStack.getComponent('enchantable');
            if (enchComp) {
                try {
                    enchComp.addEnchantment({
                        type: { id: config.enchantments.category },
                        level: 1
                    });
                } catch (e) {
                    console.warn(`[LootManager] Failed to apply enchantment to ${itemId}: ${e}`);
                }
            }
        } else if (itemId === 'minecraft:enchanted_book') {
            // Apply random enchantment from valid categories
            const enchComp: any = itemStack.getComponent('enchantable');
            if (enchComp) {
                try {
                    const categories = Object.keys(this.enchantmentCategories);
                    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
                    const enchantsList = this.enchantmentCategories[randomCategory];
                    if (enchantsList && enchantsList.length > 0) {
                        const randomEnchant = enchantsList[Math.floor(Math.random() * enchantsList.length)];
                        const level = Math.floor(Math.random() * (randomEnchant.maxLevel - randomEnchant.minLevel + 1)) + randomEnchant.minLevel;
                        enchComp.addEnchantment({
                            type: { id: randomEnchant.type },
                            level: level
                        });
                    }
                } catch (e) {
                    console.warn(`[LootManager] Failed to apply random enchantment to enchanted_book: ${e}`);
                }
            }
        }

        // Apply random durability if configured
        if (config.randomdurability) {
            const durability: any = itemStack.getComponent('durability');
            if (durability) {
                durability.damage = Math.floor(Math.random() * durability.maxDurability);
            }
        }

        return itemStack;
    }
}

// Create the single instance of the LootManager
const lootManagerInstance = new LootManager();

// Export the instance for other modules to use, ensuring they all use the same one
export { lootManagerInstance as LootManager };

// Subscribe to the entityDie event
world.afterEvents.entityDie.subscribe(event => {
    lootManagerInstance.onEntityDeath(event);
});
