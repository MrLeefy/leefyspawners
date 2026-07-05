/**
 * Configuration constants for LeefySpawners
 * This file centralizes all hardcoded values for better maintainability
 */

// === TIMING CONSTANTS ===
export const TIMING = {
    SMALLEST_INTERVAL: 20, // 20 ticks = 1 second
    COOLDOWN_MILLIS: 2000,
    MESSAGE_DELAY: 1000,
    FORM_COOLDOWN: 3000,
    INTERACTION_WINDOW_MILLIS: 120 * 1000, // 2 minutes
    GLOBAL_COOLDOWN_MILLIS: 10 * 60 * 1000, // 10 minutes
    DEATH_PROCESSED_CLEAR_INTERVAL: 600, // 30 seconds in ticks
    DEFAULT_SPAWN_SPEED: 15,
    DEFAULT_SPAWN_QTY: 1,
    DEFAULT_MAX_STACK: 100
};

// === UI CONSTANTS ===
export const UI = {
    NAME_TAG_CONFIG: '§e[ §7x# @ §e]',
    ADMIN_PERMISSION_TAG: 'admin',
    OWNER_PERMISSION_TAG: 'owner',
    MAX_STACK_RADIUS: 100,
    MIN_STACK_RADIUS: 1,
    DEFAULT_STACK_RADIUS: 50,
    MAX_SPAWNER_LEVEL: 32,
    MIN_SPAWNER_LEVEL: 1,
    UPGRADE_COST_BASE: 10000,
    UPGRADE_COST_MULTIPLIER: 100,
    REFUND_PERCENTAGE: 77
};

// === DATABASE CONSTANTS ===
export const DATABASE = {
    MAX_CHANGES_BEFORE_CLEANUP: 1000,
    BATCH_SIZE: 10,
    MAX_DATA_LENGTH: 30000,
    SPLIT_DELIMITER: '\n_`Split`_\n',
    DEFAULT_SAVE_INTERVAL: 5
};

// === ENTITY CONSTANTS ===
export const ENTITIES = {
    SPAWNRULE_ENTITY_TYPE: 'mrleefy:spawnrule',
    PLAYER_TYPE_ID: 'minecraft:player',
    ITEM_TYPE: 'minecraft:item',
    XP_ORB_TYPE: 'minecraft:xp_orb',
    MAX_ITEM_SPILL_CAP: 5,
    MAX_XP_SPILL_CAP: 3,
    DEFAULT_ITEM_SPILL_CAP: 5,
    DEFAULT_XP_SPILL_CAP: 3
};

// === VALIDATION CONSTANTS ===
export const VALIDATION = {
    MIN_RADIUS: 1,
    MAX_RADIUS: 100,
    MIN_LEVEL: 1,
    MAX_LEVEL: 32,
    MIN_SPEED: 1,
    MAX_SPEED: 60,
    MIN_QTY: 0,
    MAX_QTY: 100,
    MIN_STACK: 1,
    MAX_STACK: 5000
};

// === ERROR MESSAGES ===
export const ERROR_MESSAGES = {
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

// === SUCCESS MESSAGES ===
const SUCCESS_MESSAGES = {
    UPGRADE_SUCCESS: "Successfully upgraded to level",
    DOWNGRADE_SUCCESS: "Successfully downgraded to level",
    TELEPORT_SUCCESS: "Teleported stack to spawner",
    CONFIG_UPDATED: "Configuration updated successfully",
    LEVEL_SET: "Level set to"
};

// === ADMIN CONSTANTS ===
const ADMIN = {
    MAX_ALLOWED_SPEED: 60,
    MAX_ALLOWED_STACK: 5000,
    MIN_ALLOWED_SPEED: 1,
    MIN_ALLOWED_STACK: 1
};

// === DEFAULT CONFIGURATIONS ===
const DEFAULT_CONFIG = {
    AA_VALUES: {
        "1-10": { qty: 1, speed: 15, maxStack: 100 },
        "11-20": { qty: 2, speed: 12, maxStack: 300 },
        "21-30": { qty: 3, speed: 9, maxStack: 500 },
        "31-31": { qty: 4, speed: 6, maxStack: 700 },
        "32-32": { qty: 5, speed: 3, maxStack: 1000 }
    }
};

// === FILE PATHS ===
const PATHS = {
    DATABASE_PREFIX: "ConfigValues",
    XP_DATABASE_PREFIX: "XPDropValues",
    SPAWNER_LOCATIONS: "SpawnerLocations",
    LOOT_TABLES: "LootTables"
};

// === PERFORMANCE CONSTANTS ===
export const PERFORMANCE = {
    CACHE_DURATION: 30000, // 30 seconds
    BATCH_PROCESS_SIZE: 10,
    MAX_MAP_SIZE: 10000,
    CLEANUP_THRESHOLD: 1000,
    ADAPTIVE_CLEANUP_THRESHOLD: 100,
    FAST_DISTANCE_THRESHOLD: 100
};

// === THEME CONSTANTS ===
export const THEME = {
    COLOR_TITLE: '§e', // Header titles (e.g. Gold/Yellow)
    COLOR_SUCCESS: '§a', // Success messages (Green)
    COLOR_ERROR: '§c', // Errors (Red)
    COLOR_WARN: '§6', // Warnings/Alerts (Gold)
    COLOR_INFO: '§b', // Info / Numbers (Aqua)
    COLOR_TEXT: '§7', // Regular description text (Gray)
    COLOR_HIGHLIGHT: '§d', // Highlighted features/titles (Light Purple)
    COLOR_RESET: '§r' // Reset color code
};
