import { world, system, ItemStack, EntityDieAfterEvent, Player, Dimension, Vector3, EnchantmentTypes } from '@minecraft/server';
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

// Maps item IDs → enchantment category for dynamic enchanting
const ITEM_ENCHANT_CATEGORY: Record<string, string> = {
    'minecraft:iron_sword':         'sword',
    'minecraft:diamond_sword':      'sword',
    'minecraft:iron_axe':           'axe',
    'minecraft:diamond_axe':        'axe',
    'minecraft:iron_pickaxe':       'pickaxe',
    'minecraft:diamond_pickaxe':    'pickaxe',
    'minecraft:iron_shovel':        'shovel',
    'minecraft:diamond_shovel':     'shovel',
    'minecraft:iron_hoe':           'hoe',
    'minecraft:diamond_hoe':        'hoe',
    'minecraft:bow':                'bow',
    'minecraft:crossbow':           'crossbow',
    'minecraft:fishing_rod':        'fishing_rod',
    'minecraft:shears':             'shears',
    'minecraft:trident':            'trident',
    'minecraft:iron_helmet':        'helmet',
    'minecraft:iron_chestplate':    'chestplate',
    'minecraft:iron_leggings':      'leggings',
    'minecraft:iron_boots':         'boots',
    'minecraft:chainmail_helmet':   'helmet',
    'minecraft:chainmail_chestplate': 'chestplate',
    'minecraft:chainmail_leggings': 'leggings',
    'minecraft:chainmail_boots':    'boots',
    'minecraft:diamond_helmet':     'helmet',
    'minecraft:diamond_chestplate': 'chestplate',
    'minecraft:diamond_leggings':   'leggings',
    'minecraft:diamond_boots':      'boots',
    'minecraft:leather_helmet':     'helmet',
    'minecraft:leather_chestplate': 'chestplate',
    'minecraft:leather_leggings':   'leggings',
    'minecraft:leather_boots':      'boots',
    // Stone tools
    'minecraft:stone_sword':        'sword',
    'minecraft:stone_axe':          'axe',
    'minecraft:stone_pickaxe':      'pickaxe',
    'minecraft:stone_shovel':       'shovel',
    'minecraft:stone_hoe':          'hoe',
    // Golden tools
    'minecraft:golden_sword':       'sword',
    'minecraft:golden_axe':         'axe',
    'minecraft:golden_pickaxe':     'pickaxe',
    'minecraft:golden_shovel':      'shovel',
    'minecraft:golden_hoe':         'hoe',
    'minecraft:golden_helmet':      'helmet',
    'minecraft:golden_chestplate':  'chestplate',
    'minecraft:golden_leggings':    'leggings',
    'minecraft:golden_boots':       'boots',
};

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
                // ── UNIVERSAL ──────────────────────────────────────────────
                'minecraft:emerald': { chance: 60, quantity: 1, stackable: true },

                // ── FARMER ─────────────────────────────────────────────────
                'minecraft:bread':           { chance: 45, quantity: 1, stackable: true },
                'minecraft:apple':           { chance: 35, quantity: 1, stackable: true },
                'minecraft:cookie':          { chance: 22, quantity: 1, stackable: true },
                'minecraft:pumpkin_pie':     { chance: 18, quantity: 1, stackable: true },
                'minecraft:wheat':           { chance: 30, quantity: 1, stackable: true },
                'minecraft:potato':          { chance: 25, quantity: 1, stackable: true },
                'minecraft:carrot':          { chance: 25, quantity: 1, stackable: true },
                'minecraft:beetroot':        { chance: 20, quantity: 1, stackable: true },
                'minecraft:pumpkin':         { chance: 12, quantity: 1, stackable: true },
                'minecraft:melon_slice':     { chance: 12, quantity: 1, stackable: true },
                'minecraft:golden_carrot':   { chance: 8,  quantity: 1, stackable: true },
                'minecraft:suspicious_stew': { chance: 6,  quantity: 1, stackable: false },
                'minecraft:glistering_melon_slice': { chance: 5, quantity: 1, stackable: true },
                'minecraft:cake':            { chance: 3,  quantity: 1, stackable: false },

                // ── FISHERMAN ──────────────────────────────────────────────
                'minecraft:cod':             { chance: 28, quantity: 1, stackable: true },
                'minecraft:salmon':          { chance: 25, quantity: 1, stackable: true },
                'minecraft:tropical_fish':   { chance: 12, quantity: 1, stackable: true },
                'minecraft:pufferfish':      { chance: 8,  quantity: 1, stackable: true },
                'minecraft:fishing_rod':     { chance: 6,  stackable: false, enchantChance: 25 },
                'minecraft:campfire':        { chance: 5,  quantity: 1, stackable: true },
                'minecraft:enchanted_book':  { chance: 4,  stackable: false },

                // ── LIBRARIAN ──────────────────────────────────────────────
                'minecraft:book':            { chance: 38, quantity: 1, stackable: true },
                'minecraft:paper':           { chance: 30, quantity: 1, stackable: true },
                'minecraft:ink_sac':         { chance: 18, quantity: 1, stackable: true },
                'minecraft:glass':           { chance: 15, quantity: 1, stackable: true },
                'minecraft:bookshelf':       { chance: 7,  quantity: 1, stackable: true },
                'minecraft:lantern':         { chance: 6,  quantity: 1, stackable: true },
                'minecraft:name_tag':        { chance: 1.5, stackable: false },

                // ── CARTOGRAPHER ───────────────────────────────────────────
                'minecraft:compass':         { chance: 9,  quantity: 1, stackable: true },
                'minecraft:empty_map':       { chance: 14, quantity: 1, stackable: true },
                'minecraft:item_frame':      { chance: 5,  quantity: 1, stackable: true },
                'minecraft:glass_pane':      { chance: 14, quantity: 1, stackable: true },

                // ── CLERIC ─────────────────────────────────────────────────
                'minecraft:experience_bottle': { chance: 28, quantity: 1, stackable: true },
                'minecraft:glowstone_dust':  { chance: 14, quantity: 1, stackable: true },
                'minecraft:redstone':        { chance: 14, quantity: 1, stackable: true },
                'minecraft:lapis_lazuli':    { chance: 14, quantity: 1, stackable: true },
                'minecraft:rotten_flesh':    { chance: 18, quantity: 1, stackable: true },
                'minecraft:gold_ingot':      { chance: 6,  quantity: 1, stackable: true },
                'minecraft:ender_pearl':     { chance: 5,  quantity: 1, stackable: true },
                'minecraft:glass_bottle':    { chance: 10, quantity: 1, stackable: true },
                'minecraft:nether_wart':     { chance: 10, quantity: 1, stackable: true },
                'minecraft:rabbit_foot':     { chance: 5,  quantity: 1, stackable: true },
                'minecraft:ghast_tear':      { chance: 2,  quantity: 1, stackable: true },
                'minecraft:scute':           { chance: 3,  quantity: 1, stackable: true },

                // ── ARMORER ────────────────────────────────────────────────
                'minecraft:coal':            { chance: 30, quantity: 1, stackable: true },
                'minecraft:iron_ingot':      { chance: 22, quantity: 1, stackable: true },
                'minecraft:diamond':         { chance: 4,  quantity: 1, stackable: true },
                'minecraft:chainmail_helmet':    { chance: 4, stackable: false, enchantChance: 15 },
                'minecraft:chainmail_chestplate':{ chance: 4, stackable: false, enchantChance: 15 },
                'minecraft:chainmail_leggings':  { chance: 4, stackable: false, enchantChance: 15 },
                'minecraft:chainmail_boots':     { chance: 4, stackable: false, enchantChance: 15 },
                'minecraft:iron_helmet':     { chance: 3, stackable: false, enchantChance: 15 },
                'minecraft:iron_chestplate': { chance: 3, stackable: false, enchantChance: 15 },
                'minecraft:iron_leggings':   { chance: 3, stackable: false, enchantChance: 15 },
                'minecraft:iron_boots':      { chance: 3, stackable: false, enchantChance: 15 },
                'minecraft:diamond_helmet':     { chance: 0.4, stackable: false, enchantChance: 30 },
                'minecraft:diamond_chestplate': { chance: 0.4, stackable: false, enchantChance: 30 },
                'minecraft:diamond_leggings':   { chance: 0.4, stackable: false, enchantChance: 30 },
                'minecraft:diamond_boots':      { chance: 0.4, stackable: false, enchantChance: 30 },
                'minecraft:shield':          { chance: 5,  stackable: false },
                'minecraft:bell':            { chance: 1,  stackable: false },

                // ── LEATHERWORKER ──────────────────────────────────────────
                'minecraft:leather':         { chance: 28, quantity: 1, stackable: true },
                'minecraft:rabbit_hide':     { chance: 15, quantity: 1, stackable: true },
                'minecraft:leather_helmet':     { chance: 6, stackable: false, enchantChance: 10 },
                'minecraft:leather_chestplate': { chance: 6, stackable: false, enchantChance: 10 },
                'minecraft:leather_leggings':   { chance: 6, stackable: false, enchantChance: 10 },
                'minecraft:leather_boots':      { chance: 6, stackable: false, enchantChance: 10 },
                'minecraft:saddle':          { chance: 3,  stackable: false },
                'minecraft:leather_horse_armor': { chance: 2, stackable: false },

                // ── BUTCHER ────────────────────────────────────────────────
                'minecraft:chicken':         { chance: 20, quantity: 1, stackable: true },
                'minecraft:porkchop':        { chance: 20, quantity: 1, stackable: true },
                'minecraft:beef':            { chance: 20, quantity: 1, stackable: true },
                'minecraft:mutton':          { chance: 18, quantity: 1, stackable: true },
                'minecraft:cooked_chicken':  { chance: 18, quantity: 1, stackable: true },
                'minecraft:cooked_porkchop': { chance: 18, quantity: 1, stackable: true },
                'minecraft:cooked_beef':     { chance: 18, quantity: 1, stackable: true },
                'minecraft:cooked_mutton':   { chance: 16, quantity: 1, stackable: true },
                'minecraft:rabbit':          { chance: 14, quantity: 1, stackable: true },
                'minecraft:cooked_rabbit':   { chance: 14, quantity: 1, stackable: true },
                'minecraft:rabbit_stew':     { chance: 8,  quantity: 1, stackable: false },
                'minecraft:dried_kelp':      { chance: 10, quantity: 1, stackable: true },

                // ── FLETCHER ───────────────────────────────────────────────
                'minecraft:arrow':           { chance: 28, quantity: 2, stackable: true },
                'minecraft:feather':         { chance: 22, quantity: 1, stackable: true },
                'minecraft:flint':           { chance: 22, quantity: 1, stackable: true },
                'minecraft:string':          { chance: 20, quantity: 1, stackable: true },
                'minecraft:gravel':          { chance: 15, quantity: 1, stackable: true },
                'minecraft:tripwire_hook':   { chance: 8,  quantity: 1, stackable: true },
                'minecraft:bow':             { chance: 5,  stackable: false, enchantChance: 25 },
                'minecraft:crossbow':        { chance: 5,  stackable: false, enchantChance: 25 },
                'minecraft:tipped_arrow':    { chance: 3,  quantity: 1, stackable: true },

                // ── TOOLSMITH ──────────────────────────────────────────────
                'minecraft:iron_shovel':     { chance: 4, stackable: false, enchantChance: 20 },
                'minecraft:iron_pickaxe':    { chance: 4, stackable: false, enchantChance: 20 },
                'minecraft:iron_axe':        { chance: 4, stackable: false, enchantChance: 20 },
                'minecraft:iron_hoe':        { chance: 4, stackable: false, enchantChance: 20 },
                'minecraft:diamond_shovel':  { chance: 0.6, stackable: false, enchantChance: 35 },
                'minecraft:diamond_pickaxe': { chance: 0.6, stackable: false, enchantChance: 35 },
                'minecraft:diamond_axe':     { chance: 0.6, stackable: false, enchantChance: 35 },
                'minecraft:diamond_hoe':     { chance: 0.6, stackable: false, enchantChance: 35 },

                // ── WEAPONSMITH ────────────────────────────────────────────
                'minecraft:iron_sword':      { chance: 4, stackable: false, enchantChance: 20 },
                'minecraft:diamond_sword':   { chance: 0.6, stackable: false, enchantChance: 35 },

                // ── SHEPHERD ───────────────────────────────────────────────
                'minecraft:shears':          { chance: 10, stackable: false, enchantChance: 10 },
                'minecraft:white_wool':      { chance: 10, quantity: 1, stackable: true },
                'minecraft:orange_wool':     { chance: 7,  quantity: 1, stackable: true },
                'minecraft:magenta_wool':    { chance: 7,  quantity: 1, stackable: true },
                'minecraft:light_blue_wool': { chance: 7,  quantity: 1, stackable: true },
                'minecraft:yellow_wool':     { chance: 7,  quantity: 1, stackable: true },
                'minecraft:lime_wool':       { chance: 7,  quantity: 1, stackable: true },
                'minecraft:pink_wool':       { chance: 7,  quantity: 1, stackable: true },
                'minecraft:gray_wool':       { chance: 7,  quantity: 1, stackable: true },
                'minecraft:cyan_wool':       { chance: 7,  quantity: 1, stackable: true },
                'minecraft:purple_wool':     { chance: 7,  quantity: 1, stackable: true },
                'minecraft:blue_wool':       { chance: 7,  quantity: 1, stackable: true },
                'minecraft:brown_wool':      { chance: 7,  quantity: 1, stackable: true },
                'minecraft:green_wool':      { chance: 7,  quantity: 1, stackable: true },
                'minecraft:red_wool':        { chance: 7,  quantity: 1, stackable: true },
                'minecraft:black_wool':      { chance: 7,  quantity: 1, stackable: true },
                'minecraft:painting':        { chance: 3,  stackable: false },
                'minecraft:white_bed':       { chance: 4,  stackable: false },
                'minecraft:red_bed':         { chance: 4,  stackable: false },
                'minecraft:blue_bed':        { chance: 4,  stackable: false },
                'minecraft:white_carpet':    { chance: 5,  quantity: 1, stackable: true },
                'minecraft:white_dye':       { chance: 6,  quantity: 1, stackable: true },
                'minecraft:red_dye':         { chance: 6,  quantity: 1, stackable: true },
                'minecraft:blue_dye':        { chance: 6,  quantity: 1, stackable: true },
                'minecraft:yellow_dye':      { chance: 6,  quantity: 1, stackable: true },
                'minecraft:green_dye':       { chance: 5,  quantity: 1, stackable: true },
                'minecraft:purple_dye':      { chance: 5,  quantity: 1, stackable: true },
                'minecraft:black_dye':       { chance: 5,  quantity: 1, stackable: true },

                // ── MASON ──────────────────────────────────────────────────
                'minecraft:clay_ball':       { chance: 20, quantity: 1, stackable: true },
                'minecraft:brick':           { chance: 16, quantity: 1, stackable: true },
                'minecraft:stone':           { chance: 14, quantity: 1, stackable: true },
                'minecraft:granite':         { chance: 12, quantity: 1, stackable: true },
                'minecraft:andesite':        { chance: 12, quantity: 1, stackable: true },
                'minecraft:diorite':         { chance: 12, quantity: 1, stackable: true },
                'minecraft:quartz':          { chance: 10, quantity: 1, stackable: true },
                'minecraft:chiseled_stone_bricks': { chance: 8, quantity: 1, stackable: true },
                'minecraft:terracotta':      { chance: 8,  quantity: 1, stackable: true },
                'minecraft:white_glazed_terracotta':  { chance: 5, quantity: 1, stackable: true },
                'minecraft:orange_glazed_terracotta': { chance: 5, quantity: 1, stackable: true },
                'minecraft:blue_glazed_terracotta':   { chance: 5, quantity: 1, stackable: true },
                'minecraft:red_glazed_terracotta':    { chance: 5, quantity: 1, stackable: true },
                'minecraft:yellow_glazed_terracotta': { chance: 5, quantity: 1, stackable: true },
                'minecraft:green_glazed_terracotta':  { chance: 5, quantity: 1, stackable: true },
                'minecraft:nether_brick':    { chance: 8,  quantity: 1, stackable: true },
                'minecraft:dripstone_block': { chance: 6,  quantity: 1, stackable: true },
                'minecraft:pointed_dripstone': { chance: 6, quantity: 1, stackable: true },

                // ── CLOCK / COMPASS (shared) ───────────────────────────
                'minecraft:clock':           { chance: 8,  quantity: 1, stackable: true },

                // ── MASTER-LEVEL TRADES (rare, any profession) ────────────────
                // Armorer master: offer diamond gear or netherite upgrade
                'minecraft:netherite_upgrade_smithing_template': { chance: 0.3, quantity: 1, stackable: false },
                // Toolsmith / Weaponsmith master: golden tools
                'minecraft:golden_sword':    { chance: 1.5, stackable: false, enchantChance: 15 },
                'minecraft:golden_axe':      { chance: 1.5, stackable: false, enchantChance: 15 },
                'minecraft:golden_pickaxe':  { chance: 1.5, stackable: false, enchantChance: 15 },
                'minecraft:golden_shovel':   { chance: 1.5, stackable: false, enchantChance: 15 },
                'minecraft:golden_hoe':      { chance: 1.5, stackable: false, enchantChance: 15 },
                // Armorer: golden armor
                'minecraft:golden_helmet':   { chance: 1.5, stackable: false, enchantChance: 15 },
                'minecraft:golden_chestplate': { chance: 1.5, stackable: false, enchantChance: 15 },
                'minecraft:golden_leggings': { chance: 1.5, stackable: false, enchantChance: 15 },
                'minecraft:golden_boots':    { chance: 1.5, stackable: false, enchantChance: 15 },
                // Leatherworker: horse armor
                'minecraft:iron_horse_armor':    { chance: 1,   quantity: 1, stackable: false },
                'minecraft:golden_horse_armor':  { chance: 0.8, quantity: 1, stackable: false },
                'minecraft:diamond_horse_armor': { chance: 0.3, quantity: 1, stackable: false },

                // ── WANDERING TRADER extras (found in all trades) ───────────
                'minecraft:nautilus_shell':  { chance: 2,   quantity: 1, stackable: true },
                'minecraft:podzol':          { chance: 3,   quantity: 1, stackable: true },
                'minecraft:mycelium':        { chance: 2,   quantity: 1, stackable: true },
                'minecraft:brown_mushroom':  { chance: 5,   quantity: 1, stackable: true },
                'minecraft:red_mushroom':    { chance: 5,   quantity: 1, stackable: true },
                'minecraft:cactus':          { chance: 5,   quantity: 1, stackable: true },
                'minecraft:sea_pickle':      { chance: 4,   quantity: 1, stackable: true },

                // ── MISSING SHEPHERD BEDS & CARPETS ───────────────────────
                'minecraft:orange_bed':      { chance: 4, quantity: 1, stackable: false },
                'minecraft:yellow_bed':      { chance: 4, quantity: 1, stackable: false },
                'minecraft:green_bed':       { chance: 4, quantity: 1, stackable: false },
                'minecraft:purple_bed':      { chance: 4, quantity: 1, stackable: false },
                'minecraft:cyan_bed':        { chance: 4, quantity: 1, stackable: false },
                'minecraft:black_bed':       { chance: 4, quantity: 1, stackable: false },
                'minecraft:orange_carpet':   { chance: 5, quantity: 1, stackable: true },
                'minecraft:yellow_carpet':   { chance: 5, quantity: 1, stackable: true },
                'minecraft:green_carpet':    { chance: 5, quantity: 1, stackable: true },
                'minecraft:purple_carpet':   { chance: 5, quantity: 1, stackable: true },
                'minecraft:cyan_carpet':     { chance: 5, quantity: 1, stackable: true },
                'minecraft:blue_carpet':     { chance: 5, quantity: 1, stackable: true },
                'minecraft:red_carpet':      { chance: 5, quantity: 1, stackable: true },
                'minecraft:black_carpet':    { chance: 5, quantity: 1, stackable: true },

                // ── MASON MISSING BLOCKS ─────────────────────────────────────
                'minecraft:polished_granite':   { chance: 8, quantity: 1, stackable: true },
                'minecraft:polished_andesite':  { chance: 8, quantity: 1, stackable: true },
                'minecraft:polished_diorite':   { chance: 8, quantity: 1, stackable: true },
                'minecraft:stone_bricks':        { chance: 8, quantity: 1, stackable: true },
                'minecraft:mossy_stone_bricks':  { chance: 5, quantity: 1, stackable: true },
                'minecraft:cracked_stone_bricks':{ chance: 4, quantity: 1, stackable: true },
                'minecraft:nether_brick_fence':  { chance: 4, quantity: 1, stackable: true },
                'minecraft:purple_glazed_terracotta':  { chance: 5, quantity: 1, stackable: true },
                'minecraft:cyan_glazed_terracotta':    { chance: 5, quantity: 1, stackable: true },
                'minecraft:light_blue_glazed_terracotta': { chance: 5, quantity: 1, stackable: true },
                'minecraft:gray_glazed_terracotta':    { chance: 5, quantity: 1, stackable: true },
                'minecraft:magenta_glazed_terracotta': { chance: 5, quantity: 1, stackable: true },
                'minecraft:pink_glazed_terracotta':    { chance: 5, quantity: 1, stackable: true },
                'minecraft:black_glazed_terracotta':   { chance: 5, quantity: 1, stackable: true },
                'minecraft:brown_glazed_terracotta':   { chance: 5, quantity: 1, stackable: true },
                'minecraft:lime_glazed_terracotta':    { chance: 5, quantity: 1, stackable: true },

                // ── FISHERMAN (missing cooked fish) ────────────────────────
                'minecraft:cooked_cod':      { chance: 22, quantity: 1, stackable: true },
                'minecraft:cooked_salmon':   { chance: 18, quantity: 1, stackable: true },

                // ── LIBRARIAN (book & quill) ────────────────────────────────
                'minecraft:writable_book':   { chance: 8,  quantity: 1, stackable: false },

                // ── TOOLSMITH & WEAPONSMITH (stone tools — novice tier) ────
                'minecraft:stone_sword':     { chance: 8,  stackable: false, enchantChance: 5 },
                'minecraft:stone_axe':       { chance: 8,  stackable: false, enchantChance: 5 },
                'minecraft:stone_pickaxe':   { chance: 8,  stackable: false, enchantChance: 5 },
                'minecraft:stone_shovel':    { chance: 8,  stackable: false, enchantChance: 5 },
                'minecraft:stone_hoe':       { chance: 8,  stackable: false, enchantChance: 5 },

                // ── BUTCHER (missing sweet berries) ────────────────────────
                'minecraft:sweet_berries':   { chance: 10, quantity: 1, stackable: true },

                // ── SHEPHERD (banners — expert tier) ───────────────────────
                'minecraft:white_banner':    { chance: 3, quantity: 1, stackable: true },
                'minecraft:orange_banner':   { chance: 3, quantity: 1, stackable: true },
                'minecraft:magenta_banner':  { chance: 3, quantity: 1, stackable: true },
                'minecraft:light_blue_banner': { chance: 3, quantity: 1, stackable: true },
                'minecraft:yellow_banner':   { chance: 3, quantity: 1, stackable: true },
                'minecraft:lime_banner':     { chance: 3, quantity: 1, stackable: true },
                'minecraft:pink_banner':     { chance: 3, quantity: 1, stackable: true },
                'minecraft:gray_banner':     { chance: 3, quantity: 1, stackable: true },
                'minecraft:cyan_banner':     { chance: 3, quantity: 1, stackable: true },
                'minecraft:purple_banner':   { chance: 3, quantity: 1, stackable: true },
                'minecraft:blue_banner':     { chance: 3, quantity: 1, stackable: true },
                'minecraft:brown_banner':    { chance: 3, quantity: 1, stackable: true },
                'minecraft:green_banner':    { chance: 3, quantity: 1, stackable: true },
                'minecraft:red_banner':      { chance: 3, quantity: 1, stackable: true },
                'minecraft:black_banner':    { chance: 3, quantity: 1, stackable: true },

                // ── SHEPHERD (missing dye colors) ──────────────────────────
                'minecraft:orange_dye':      { chance: 5, quantity: 1, stackable: true },
                'minecraft:magenta_dye':     { chance: 5, quantity: 1, stackable: true },
                'minecraft:light_blue_dye':  { chance: 5, quantity: 1, stackable: true },
                'minecraft:lime_dye':        { chance: 5, quantity: 1, stackable: true },
                'minecraft:pink_dye':        { chance: 5, quantity: 1, stackable: true },
                'minecraft:gray_dye':        { chance: 5, quantity: 1, stackable: true },
                'minecraft:light_gray_dye':  { chance: 5, quantity: 1, stackable: true },
                'minecraft:cyan_dye':        { chance: 5, quantity: 1, stackable: true },
                'minecraft:brown_dye':       { chance: 5, quantity: 1, stackable: true },

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
            'mrleefy:snowmanstill': { 'minecraft:snowball': { chance: 100, quantity: 1, stackable: true } },
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
            pickaxe: [
                { type: 'efficiency', minLevel: 1, maxLevel: 5 },
                { type: 'silk_touch', minLevel: 1, maxLevel: 1 },
                { type: 'fortune', minLevel: 1, maxLevel: 3 },
                { type: 'unbreaking', minLevel: 1, maxLevel: 3 },
                { type: 'mending', minLevel: 1, maxLevel: 1 },
                { type: 'vanishing', minLevel: 1, maxLevel: 1 }
            ],
            shovel: [
                { type: 'efficiency', minLevel: 1, maxLevel: 5 },
                { type: 'silk_touch', minLevel: 1, maxLevel: 1 },
                { type: 'fortune', minLevel: 1, maxLevel: 3 },
                { type: 'unbreaking', minLevel: 1, maxLevel: 3 },
                { type: 'mending', minLevel: 1, maxLevel: 1 },
                { type: 'vanishing', minLevel: 1, maxLevel: 1 }
            ],
            hoe: [
                { type: 'efficiency', minLevel: 1, maxLevel: 5 },
                { type: 'silk_touch', minLevel: 1, maxLevel: 1 },
                { type: 'fortune', minLevel: 1, maxLevel: 3 },
                { type: 'unbreaking', minLevel: 1, maxLevel: 3 },
                { type: 'mending', minLevel: 1, maxLevel: 1 },
                { type: 'vanishing', minLevel: 1, maxLevel: 1 }
            ],
            fishing_rod: [
                { type: 'luck_of_the_sea', minLevel: 1, maxLevel: 3 },
                { type: 'lure', minLevel: 1, maxLevel: 3 },
                { type: 'unbreaking', minLevel: 1, maxLevel: 3 },
                { type: 'mending', minLevel: 1, maxLevel: 1 },
                { type: 'vanishing', minLevel: 1, maxLevel: 1 }
            ],
            shears: [
                { type: 'efficiency', minLevel: 1, maxLevel: 5 },
                { type: 'unbreaking', minLevel: 1, maxLevel: 3 },
                { type: 'mending', minLevel: 1, maxLevel: 1 },
                { type: 'vanishing', minLevel: 1, maxLevel: 1 }
            ],
            book: [
                // Armor
                { type: 'protection', minLevel: 1, maxLevel: 4 },
                { type: 'fire_protection', minLevel: 1, maxLevel: 4 },
                { type: 'blast_protection', minLevel: 1, maxLevel: 4 },
                { type: 'projectile_protection', minLevel: 1, maxLevel: 4 },
                { type: 'feather_falling', minLevel: 1, maxLevel: 4 },
                { type: 'respiration', minLevel: 1, maxLevel: 3 },
                { type: 'aqua_affinity', minLevel: 1, maxLevel: 1 },
                { type: 'depth_strider', minLevel: 1, maxLevel: 3 },
                { type: 'frost_walker', minLevel: 1, maxLevel: 2 },
                { type: 'soul_speed', minLevel: 1, maxLevel: 3 },
                { type: 'thorns', minLevel: 1, maxLevel: 3 },
                // Weapons
                { type: 'sharpness', minLevel: 1, maxLevel: 5 },
                { type: 'smite', minLevel: 1, maxLevel: 5 },
                { type: 'bane_of_arthropods', minLevel: 1, maxLevel: 5 },
                { type: 'knockback', minLevel: 1, maxLevel: 2 },
                { type: 'fire_aspect', minLevel: 1, maxLevel: 2 },
                { type: 'looting', minLevel: 1, maxLevel: 3 },
                // Ranged
                { type: 'power', minLevel: 1, maxLevel: 5 },
                { type: 'punch', minLevel: 1, maxLevel: 2 },
                { type: 'flame', minLevel: 1, maxLevel: 1 },
                { type: 'infinity', minLevel: 1, maxLevel: 1 },
                { type: 'piercing', minLevel: 1, maxLevel: 4 },
                { type: 'quick_charge', minLevel: 1, maxLevel: 3 },
                { type: 'multishot', minLevel: 1, maxLevel: 1 },
                // Tools
                { type: 'efficiency', minLevel: 1, maxLevel: 5 },
                { type: 'silk_touch', minLevel: 1, maxLevel: 1 },
                { type: 'fortune', minLevel: 1, maxLevel: 3 },
                // Trident
                { type: 'impaling', minLevel: 1, maxLevel: 5 },
                { type: 'riptide', minLevel: 1, maxLevel: 3 },
                { type: 'loyalty', minLevel: 1, maxLevel: 3 },
                { type: 'channeling', minLevel: 1, maxLevel: 1 },
                // Mace
                { type: 'density', minLevel: 1, maxLevel: 5 },
                { type: 'breach', minLevel: 1, maxLevel: 4 },
                { type: 'wind_burst', minLevel: 1, maxLevel: 3 },
                // Universal
                { type: 'unbreaking', minLevel: 1, maxLevel: 3 },
                { type: 'mending', minLevel: 1, maxLevel: 1 },
                { type: 'swift_sneak', minLevel: 1, maxLevel: 3 },
                { type: 'vanishing', minLevel: 1, maxLevel: 1 }
            ]
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
        // Defer initialize() to tick 2: the Database constructor defers its own scoreboard.load()
        // to tick 1 via system.run(). If we call initialize() synchronously here (tick 0),
        // lootTableDatabase.read() returns undefined for every key and defaults overwrite saved data.
        system.run(() => system.run(() => this.initialize()));
    }

    /**
     * Loads loot tables from the database or uses defaults.
     */
    initialize(): void {
        // Load default entities first
        for (const entityId in this.defaultEntities) {
            this.entities[entityId] = this.defaultEntities[entityId];
        }
        // Overwrite or append with saved tables from the database (ensuring custom entities like crawlers are loaded)
        try {
            const savedKeys = lootTableDatabase.keys();
            for (const entityId of savedKeys) {
                const savedLootTable = lootTableDatabase.read(entityId);
                if (savedLootTable && Object.keys(savedLootTable).length > 0) {
                    this.entities[entityId] = savedLootTable;
                }
            }
        } catch (e) {
            console.error(`[LootManager] Failed to load custom tables from database: ${e}`);
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
    calcLoot(lootTable: any, lootLevel: number, singleDrop: boolean = false): Record<string, any> {
        const finalLoot: Record<string, any> = {};
        const lootTableEntries = Object.entries(lootTable) as [string, any][];

        // Early return for empty loot tables
        if (lootTableEntries.length === 0) return finalLoot;

        if (singleDrop) {
            // --- SINGLE DROP MODE: pick exactly ONE item via weighted random ---
            // Build weighted pool — items with higher chance appear proportionally more
            const totalWeight = lootTableEntries.reduce((sum, [, cfg]) => sum + (cfg.chance ?? 100), 0);
            let roll = Math.random() * totalWeight;
            let picked: [string, any] | null = null;
            for (const entry of lootTableEntries) {
                roll -= (entry[1].chance ?? 100);
                if (roll <= 0) { picked = entry; break; }
            }
            if (!picked) picked = lootTableEntries[lootTableEntries.length - 1];

            const [itemId, config] = picked;
            let dropQuantity = config.quantity ?? 1;
            if (lootLevel > 0 && config.stackable) {
                dropQuantity += Math.min(lootLevel, 3); // +1 per looting level, cap at +3
            }
            finalLoot[itemId] = { ...config, quantity: dropQuantity };
            return finalLoot;
        }

        // --- NORMAL MODE: roll each item independently ---
        for (const [itemId, config] of lootTableEntries) {
            const baseChance = config.chance ?? 100;
            const modifiedChance = baseChance * (1 + (lootLevel * 0.1)); // 10% bonus per Looting level

            if (Math.random() * 100 < modifiedChance) {
                let dropQuantity = config.quantity ?? 1;

                if (lootLevel > 0 && config.stackable) {
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

        // Villager uses single-drop mode — exactly one item per kill
        const singleDrop = entityId === 'mrleefy:villagerstill';
        const finalLoot = this.calcLoot(lootTable, lootLevel, singleDrop);

        // Stamp lootLevel onto every config so createItemStack can use it for enchant scaling
        for (const cfg of Object.values(finalLoot)) {
            (cfg as any).__lootLevel = lootLevel;
        }

        // Process loot drops with optimized item creation
        this.processLootDrops(finalLoot, entityDimension, entityLocation, lootLevel);
    }

    /**
     * Optimized loot drop processing
     * @param finalLoot - The calculated loot to drop
     * @param dimension - The dimension to spawn items in
     * @param location - The location to spawn items at
     */
    processLootDrops(finalLoot: Record<string, any>, dimension: Dimension, location: Vector3, lootLevel: number = 0): void {
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

        // Process non-stackable items — always spawn exactly 1
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
    createItemStack(itemId: string, config: any): ItemStack {
        const itemStack = new ItemStack(itemId, config.quantity);

        // --- DYNAMIC ENCHANTING ---
        if (config.enchantments) {
            // Explicit enchantment config: roll chance, then pick a random valid enchant from the category pool.
            // BUG FIX: config.enchantments.category is a category name (e.g. "sword"), NOT an enchantment ID.
            // Passing it directly to addEnchantment always threw an error and silently dropped the enchant.
            const enchComp: any = itemStack.getComponent('enchantable');
            if (enchComp && Math.random() * 100 < (config.enchantments.chance ?? 100)) {
                try {
                    const pool = this.enchantmentCategories[config.enchantments.category];
                    if (pool && pool.length > 0) {
                        const randomEnchant = pool[Math.floor(Math.random() * pool.length)];
                        const typeId = randomEnchant.type.includes(':') ? randomEnchant.type : 'minecraft:' + randomEnchant.type;
                        const enchType = EnchantmentTypes.get(typeId);
                        if (enchType) {
                            enchComp.addEnchantment({ type: enchType, level: randomEnchant.minLevel });
                        } else {
                            console.warn(`[LootManager] Enchantment type not found: ${typeId}`);
                        }
                    }
                } catch (e) {
                    console.warn(`[LootManager] Failed to apply enchantment to ${itemId}: ${e}`);
                }
            }
        } else if (itemId === 'minecraft:enchanted_book') {
            // Enchanted book — always gets a random enchant from the full pool
            const enchComp: any = itemStack.getComponent('enchantable');
            if (enchComp) {
                try {
                    const pool = this.enchantmentCategories['book'];
                    if (pool && pool.length > 0) {
                        const randomEnchant = pool[Math.floor(Math.random() * pool.length)];
                        const lootLevel: number = (config as any).__lootLevel ?? 0;
                        // Higher loot level biases toward higher tiers (but never exceeds enchant max)
                        const bonusTiers = lootLevel > 0 ? Math.floor(Math.random() * lootLevel) : 0;
                        const scaledMax = Math.min(randomEnchant.maxLevel, randomEnchant.minLevel + bonusTiers + Math.floor(Math.random() * (randomEnchant.maxLevel - randomEnchant.minLevel + 1)));
                        const level = Math.max(randomEnchant.minLevel, Math.min(scaledMax, randomEnchant.maxLevel));
                        const typeId = randomEnchant.type.includes(':') ? randomEnchant.type : 'minecraft:' + randomEnchant.type;
                        const enchType = EnchantmentTypes.get(typeId);
                        if (enchType) {
                            enchComp.addEnchantment({ type: enchType, level });
                        } else {
                            console.warn(`[LootManager] Enchantment type not found: ${typeId}`);
                        }
                    }
                } catch (e) {
                    console.warn(`[LootManager] Failed to apply random enchantment to enchanted_book: ${e}`);
                }
            }
        } else if (config.enchantChance && Math.random() * 100 < config.enchantChance) {
            // Dynamic enchantChance: roll once, if it passes apply a fitting random enchant
            const category = ITEM_ENCHANT_CATEGORY[itemId];
            if (category) {
                const pool = this.enchantmentCategories[category];
                if (pool && pool.length > 0) {
                    const enchComp: any = itemStack.getComponent('enchantable');
                    if (enchComp) {
                        try {
                            const lootLevel: number = (config as any).__lootLevel ?? 0;
                            // Filter out incompatibles (e.g. silk_touch vs fortune)
                            const existing = enchComp.getEnchantments?.() ?? [];
                            const existingIds = new Set(existing.map((e: any) => e?.type?.id ?? ''));
                            const incompatMap: Record<string, string[]> = this.enchantmentIncompatibilities;
                            const eligible = pool.filter((e: any) => {
                                const incompatible = incompatMap[e.type] ?? [];
                                return !incompatible.some((ic: string) => existingIds.has(ic));
                            });
                            if (eligible.length > 0) {
                                const randomEnchant = eligible[Math.floor(Math.random() * eligible.length)];
                                // Looting biases toward higher levels
                                const bonusTiers = lootLevel > 0 ? Math.floor(Math.random() * lootLevel) : 0;
                                const level = Math.max(randomEnchant.minLevel, Math.min(randomEnchant.maxLevel, randomEnchant.minLevel + bonusTiers + Math.floor(Math.random() * (randomEnchant.maxLevel - randomEnchant.minLevel + 1))));
                                const typeId = randomEnchant.type.includes(':') ? randomEnchant.type : 'minecraft:' + randomEnchant.type;
                                const enchType = EnchantmentTypes.get(typeId);
                                if (enchType) {
                                    enchComp.addEnchantment({ type: enchType, level });
                                } else {
                                    console.warn(`[LootManager] Enchantment type not found: ${typeId}`);
                                }
                            }
                        } catch (e) {
                            console.warn(`[LootManager] Failed dynamic enchant on ${itemId}: ${e}`);
                        }
                    }
                }
            }
        }

        // Apply random durability if configured (non-villager drops only)
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
