// mobstacker-ui.ts
import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { forceShowForm, Format } from "./ui-utils.js";
import { Database } from "./database.js";
import { LootManager, lootTableDatabase } from "./loot_table.js";
import { cooldowns, spawnerDatabase } from "./levelsystem.js";
import { validMobs, configDatabase, xpDropDatabase, spawnerStatistics, calculateSpawnerTotals, performanceMetrics, getMemoryUsage, loadSpawnerStatistics, resetSpawnerStatistics, getPlayerTopKills, ACTIVE_CHUNKS, enableLogging, disableLogging, isLoggingEnabled, debugLog, clearSpawnerParseCache, extractStackNumber } from "./mobstacker-core.js";
import { securityService } from "./security-service.js";
import { UI, THEME, ERROR_MESSAGES } from "./constants.js";
import { performanceMonitor } from "./performance-monitor.js";
// --- CONFIGURATION MANAGEMENT ---
const aaDatabase = new Database("AAValues");
const MAX_ALLOWED_SPEED = 60;
const MAX_ALLOWED_STACK = 5000;
const defaultAAValues = {
    "1-10": { qty: 1, speed: 15, maxStack: 100 },
    "11-20": { qty: 2, speed: 12, maxStack: 300 },
    "21-30": { qty: 3, speed: 9, maxStack: 500 },
    "31-31": { qty: 4, speed: 6, maxStack: 700 },
    "32-32": { qty: 5, speed: 3, maxStack: 1000 }
};
const aaLookup = Array.from({ length: 33 }, () => ({ qty: 0, speed: 0, maxStack: 100 }));
function rebuildAALookup() {
    try {
        // BUG FIX: fill() with a single object gives every slot the SAME reference.
        // Use a map with a fresh object per slot to avoid aliased-mutation corruption.
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
                    // Always create a new object per slot — never share references
                    aaLookup[lvl] = { qty, speed, maxStack };
                }
            }
        });
    }
    catch (error) {
        console.error("Failed to rebuild AA lookup:", error);
        // Fallback to default values — still use fresh objects per slot
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
// Defer AA init until scoreboard database is loaded (tick 1) then rebuild (tick 2)
system.run(() => {
    system.run(() => {
        try {
            if (aaDatabase.length === 0) {
                Object.entries(defaultAAValues).forEach(([range, data]) => {
                    try {
                        aaDatabase.write(range, data);
                    }
                    catch (error) {
                        console.error(`Failed to write default AA value for range ${range}:`, error);
                    }
                });
            }
        }
        catch (error) {
            console.error("Failed to initialize AA database:", error);
        }
        rebuildAALookup();
    });
});
export function getAAValueForLevel(level) {
    return aaLookup[level] || { qty: 0, speed: 0, maxStack: 100 };
}
// --- ADMIN UI & EVENT LISTENERS ---
world.afterEvents.itemUse.subscribe(async (event) => {
    const { source, itemStack } = event;
    if (itemStack.typeId === "minecraft:blaze_rod" && source.hasTag("admin")) {
        openAdminMenu(source);
    }
});
function openAdminMenu(player) {
    // Security validation using security service
    if (!player || !player.isValid) {
        console.error(ERROR_MESSAGES.INVALID_PLAYER);
        return;
    }
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        securityService.logSecurityEvent('unauthorized_admin_access', player, {
            attemptedAction: 'openAdminMenu'
        });
        return;
    }
    const form = new ActionFormData()
        .title("Leefy Spawner Settings")
        .body("§7Configure spawner behavior and performance settings\n§c⚠ Performance settings require server/world restart")
        .button("Spawner Settings", "textures/items/diamond")
        .button("Entity Loot Tables", "textures/blocks/chest_front")
        .button("Stack Radius", "textures/items/snowball")
        .button("Loot Drop Rules", "textures/items/lever.png")
        .button("Performance Settings §c(Requires Restart)", "textures/items/clock_item")
        .button("Spawner Statistics", "textures/items/book_normal")
        .button("Teleport to Spawner", "textures/items/ender_pearl")
        .button("Verify & Clean Database", "textures/items/book_normal")
        .button(isLoggingEnabled() ? "Disable Logging" : "Enable Logging", "textures/items/paper")
        .button("Color Theme Settings", "textures/items/dye_powder_cyan")
        .button("Lag Diagnostics & Purge", "textures/items/blaze_powder")
        .button("Reset Databases", "textures/items/fireworks_charge");
    forceShowForm(player, form).then((r) => {
        if (r.canceled)
            return;
        // Validate admin permission again before executing actions
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            securityService.logSecurityEvent('unauthorized_admin_action', player, {
                attemptedAction: `admin_menu_selection_${r.selection}`
            });
            return;
        }
        // Command validation for admin actions
        const commandValidation = securityService.validateCommand(player, 'admin_action', [`selection_${r.selection}`]);
        if (!commandValidation.isValid) {
            player.sendMessage(`§c${commandValidation.error}`);
            return;
        }
        // Show warnings if any
        if (commandValidation.warnings.length > 0) {
            commandValidation.warnings.forEach((warning) => {
                console.warn(`Admin action warning for ${player.name}: ${warning}`);
            });
        }
        system.run(() => {
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
                case 9:
                    openColorThemeConfigForm(player);
                    break;
                case 10:
                    openLagDiagnosticsForm(player);
                    break;
                case 11:
                    openResetDatabaseForm(player);
                    break;
            }
        });
        securityService.logSecurityEvent('admin_action_executed', player, {
            action: `selection_${r.selection}`,
            warnings: commandValidation.warnings.length
        });
    }).catch((error) => {
        console.error(`Error in openAdminMenu: ${error}`);
        player.sendMessage("§cAn error occurred while opening the admin menu.");
        performanceMonitor.recordError('admin_menu_error', error instanceof Error ? error.message : String(error));
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}
function openColorThemeConfigForm(player) {
    if (!player || !player.isValid)
        return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const colorNames = [
        "§1Dark Blue",
        "§2Dark Green",
        "§3Dark Aqua",
        "§4Dark Red",
        "§5Dark Purple",
        "§6Gold",
        "§7Gray",
        "§8Dark Gray",
        "§9Blue",
        "§aGreen",
        "§bAqua",
        "§cRed",
        "§dLight Purple",
        "§eYellow",
        "§fWhite",
        "§gMinecoin Gold"
    ];
    const colorCodes = [
        "§1", "§2", "§3", "§4", "§5", "§6", "§7", "§8", "§9", "§a", "§b", "§c", "§d", "§e", "§f", "§g"
    ];
    const currentTitle = configDatabase.read("theme_COLOR_TITLE") ?? THEME.COLOR_TITLE;
    const currentSuccess = configDatabase.read("theme_COLOR_SUCCESS") ?? THEME.COLOR_SUCCESS;
    const currentError = configDatabase.read("theme_COLOR_ERROR") ?? THEME.COLOR_ERROR;
    const currentWarn = configDatabase.read("theme_COLOR_WARN") ?? THEME.COLOR_WARN;
    const currentInfo = configDatabase.read("theme_COLOR_INFO") ?? THEME.COLOR_INFO;
    const currentText = configDatabase.read("theme_COLOR_TEXT") ?? THEME.COLOR_TEXT;
    const currentHighlight = configDatabase.read("theme_COLOR_HIGHLIGHT") ?? THEME.COLOR_HIGHLIGHT;
    const titleIdx = Math.max(0, colorCodes.indexOf(currentTitle));
    const successIdx = Math.max(0, colorCodes.indexOf(currentSuccess));
    const errorIdx = Math.max(0, colorCodes.indexOf(currentError));
    const warnIdx = Math.max(0, colorCodes.indexOf(currentWarn));
    const infoIdx = Math.max(0, colorCodes.indexOf(currentInfo));
    const textIdx = Math.max(0, colorCodes.indexOf(currentText));
    const highlightIdx = Math.max(0, colorCodes.indexOf(currentHighlight));
    new ModalFormData()
        .title("Color Theme Settings")
        .dropdown("Title/Header Color:", colorNames, titleIdx)
        .dropdown("Success Msg Color:", colorNames, successIdx)
        .dropdown("Error Msg Color:", colorNames, errorIdx)
        .dropdown("Warning/Alert Color:", colorNames, warnIdx)
        .dropdown("Info/Value Color:", colorNames, infoIdx)
        .dropdown("Regular Text Color:", colorNames, textIdx)
        .dropdown("Highlight/Alert Color:", colorNames, highlightIdx)
        .show(player).then((r) => {
        if (r.canceled || !r.formValues)
            return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const [title, success, error, warn, info, text, highlight] = r.formValues;
        configDatabase.write("theme_COLOR_TITLE", colorCodes[title]);
        configDatabase.write("theme_COLOR_SUCCESS", colorCodes[success]);
        configDatabase.write("theme_COLOR_ERROR", colorCodes[error]);
        configDatabase.write("theme_COLOR_WARN", colorCodes[warn]);
        configDatabase.write("theme_COLOR_INFO", colorCodes[info]);
        configDatabase.write("theme_COLOR_TEXT", colorCodes[text]);
        configDatabase.write("theme_COLOR_HIGHLIGHT", colorCodes[highlight]);
        player.sendMessage(Format.success("Color theme settings updated successfully!"));
        openAdminMenu(player);
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}
function getDiagnostics() {
    let totalSpawners = spawnerDatabase.keys().length;
    let totalStackedEntities = 0;
    let totalStackedMobsCount = 0;
    const dimensions = ["overworld", "nether", "the_end"];
    for (const dimId of dimensions) {
        try {
            const dimension = world.getDimension(dimId);
            const entities = dimension.getEntities();
            for (const entity of entities) {
                if (!entity.isValid)
                    continue;
                const nameTag = entity.nameTag;
                if (nameTag && nameTag.includes('x')) {
                    const stackSize = extractStackNumber(nameTag);
                    if (stackSize > 0) {
                        totalStackedEntities++;
                        totalStackedMobsCount += stackSize;
                    }
                }
            }
        }
        catch (e) { }
    }
    return {
        totalSpawners,
        totalStackedEntities,
        totalStackedMobsCount
    };
}
function purgeAllStackedMobs() {
    let count = 0;
    const dimensions = ["overworld", "nether", "the_end"];
    for (const dimId of dimensions) {
        try {
            const dimension = world.getDimension(dimId);
            const entities = dimension.getEntities();
            for (const entity of entities) {
                if (!entity.isValid)
                    continue;
                const nameTag = entity.nameTag;
                if (nameTag && nameTag.includes('x')) {
                    const match = nameTag.match(/x(\d+)/);
                    if (match) {
                        try {
                            entity.remove();
                            count++;
                        }
                        catch (e) { }
                    }
                }
            }
        }
        catch (e) { }
    }
    return count;
}
function purgeAllDroppedItemsAndXP() {
    let count = 0;
    const dimensions = ["overworld", "nether", "the_end"];
    for (const dimId of dimensions) {
        try {
            const dimension = world.getDimension(dimId);
            const items = dimension.getEntities({ type: "minecraft:item" });
            const xpOrbs = dimension.getEntities({ type: "minecraft:xp_orb" });
            for (const entity of items) {
                try {
                    if (entity.isValid) {
                        entity.remove();
                        count++;
                    }
                }
                catch (e) { }
            }
            for (const entity of xpOrbs) {
                try {
                    if (entity.isValid) {
                        entity.remove();
                        count++;
                    }
                }
                catch (e) { }
            }
        }
        catch (e) { }
    }
    return count;
}
function openLagDiagnosticsForm(player) {
    if (!player || !player.isValid)
        return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    player.sendMessage("§eScanning world for diagnostics, please wait...");
    // Defer scan to next tick to prevent locking up current tick
    system.run(() => {
        const stats = getDiagnostics();
        const bodyText = `§l§6World Lag Diagnostics§r\n\n` +
            `§7Active Spawner Blocks: §e${stats.totalSpawners.toLocaleString()}\n` +
            `§7Active Stacked Entities (Memory): §e${stats.totalStackedEntities.toLocaleString()}\n` +
            `§7Total Mobs Inside Stacks (Virtual): §e${stats.totalStackedMobsCount.toLocaleString()}\n\n` +
            `§c⚠ Emergency Purge Options (Instantly recovers Realm performance):`;
        const form = new ActionFormData()
            .title("Diagnostics & Purge")
            .body(bodyText)
            .button("§cPurge Stacked Mobs", "textures/ui/slash_anim")
            .button("§cPurge Dropped Items & XP", "textures/ui/trash_default")
            .button("§8Back", "textures/ui/left_arrow");
        forceShowForm(player, form).then((r) => {
            if (r.canceled)
                return;
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.selection === 0) {
                // Purge stacked mobs
                let count = purgeAllStackedMobs();
                player.sendMessage(Format.success(`Purged ${count} stacked entities from the world.`));
                openLagDiagnosticsForm(player);
            }
            else if (r.selection === 1) {
                // Purge drops
                let count = purgeAllDroppedItemsAndXP();
                player.sendMessage(Format.success(`Purged ${count} dropped items and XP orbs.`));
                openLagDiagnosticsForm(player);
            }
            else if (r.selection === 2) {
                openAdminMenu(player);
            }
        }).finally(() => {
            cooldowns.set(player.name, Date.now());
        });
    });
}
function openToggleLootDropForm(player) {
    if (!player || !player.isValid)
        return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const currentCap = configDatabase.read("itemSpillCap") || 5;
    const currentXpCap = configDatabase.read("xpSpillCap") || 3;
    const playerKillOnly = configDatabase.read("playerKillOnly") ?? false;
    new ModalFormData()
        .title("Loot Drop Rules")
        .toggle("Player Kills Only (Lag Protection)", playerKillOnly)
        .textField("Max item drops near stack:", "Enter integer (>=1)", `${currentCap}`)
        .textField("Max XP orbs near stack:", "Enter integer (>=1)", `${currentXpCap}`)
        .show(player).then((r) => {
        if (r.canceled || !r.formValues)
            return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        configDatabase.write("playerKillOnly", r.formValues[0]);
        const capInput = parseInt(r.formValues[1]);
        if (!isNaN(capInput) && capInput >= 1)
            configDatabase.write("itemSpillCap", capInput);
        const xpCapInput = parseInt(r.formValues[2]);
        if (!isNaN(xpCapInput) && xpCapInput >= 1)
            configDatabase.write("xpSpillCap", xpCapInput);
        player.sendMessage(`§aLoot drop rules updated!`);
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
    // Read current performance settings from database (or use defaults)
    const currentActivationRadius = configDatabase.read("performanceActivationRadius") || 50;
    const currentMaxSpawns = configDatabase.read("performanceMaxSpawns") || 25;
    const currentRandomDelay = configDatabase.read("performanceRandomDelay") ?? true;
    const currentSpawnInterval = configDatabase.read("performanceSpawnInterval") || 20;
    const form = new ModalFormData()
        .title("Performance Settings")
        .slider("§bPlayer Activation Radius (blocks):§r\n" +
        "§7Distance players must be within to activate spawners.\n" +
        "§7Lower = Better performance (spawners pause sooner)\n" +
        "§eDefault: 50 blocks§r", 10, 128, 2, currentActivationRadius)
        .slider("§bMax Spawns Per Cycle:§r\n" +
        "§7Maximum entities that can spawn per second.\n" +
        "§7Lower = Smoother performance, slower spawning\n" +
        "§eDefault: 25 spawns/second§r", 5, 100, 5, currentMaxSpawns)
        .toggle("§bRandom Initial Spawn Delays:§r\n" +
        "§7Randomizes first spawn time (0-100%%% of interval).\n" +
        "§7Prevents all spawners from syncing up.\n" +
        "§aRecommended: Enabled§r", currentRandomDelay)
        .slider("§bSpawn Check Interval (ticks):§r\n" +
        "§7How often to check spawners (20 ticks = 1 second).\n" +
        "§7Lower = More responsive, higher CPU usage\n" +
        "§eDefault: 20 ticks§r", 10, 100, 5, currentSpawnInterval);
    form.show(player).then((r) => {
        if (r.canceled || !r.formValues)
            return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        // BUG FIX: parseInt("") === NaN, so a blank unchanged field would fail
        // !isNaN() validation and show a spurious "Invalid" warning to the admin.
        // Use parseOrPreserve: if the field is blank, keep the current saved value.
        const parseOrPreserve = (raw, saved) => {
            if (typeof raw === 'number')
                return raw;
            const s = String(raw).trim();
            if (s === '')
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
        // Validate and save activation radius
        if (activationRadius >= 10 && activationRadius <= 128) {
            configDatabase.write("performanceActivationRadius", activationRadius);
            updated = true;
        }
        else {
            warnings.push("§eInvalid activation radius - must be between 10-128 blocks");
        }
        // Validate and save max spawns
        if (maxSpawns >= 5 && maxSpawns <= 100) {
            configDatabase.write("performanceMaxSpawns", maxSpawns);
            updated = true;
        }
        else {
            warnings.push("§eInvalid max spawns - must be between 5-100");
        }
        // Save random delay toggle
        configDatabase.write("performanceRandomDelay", randomDelay);
        updated = true;
        // Validate and save spawn interval (with warning for low values)
        if (spawnInterval >= 10 && spawnInterval <= 100) {
            configDatabase.write("performanceSpawnInterval", spawnInterval);
            if (spawnInterval < 20) {
                warnings.push("§c⚠ Low spawn interval may increase CPU usage!");
            }
            updated = true;
        }
        else {
            warnings.push("§eInvalid spawn interval - must be between 10-100 ticks");
        }
        // Show results
        if (updated) {
            player.sendMessage("§a✓ Performance settings saved to database!");
            player.sendMessage("§c§l⚠ REQUIRES SERVER RESTART OR WORLD RESTART ⚠");
            player.sendMessage("§c(Settings are cached at startup for maximum performance)");
            player.sendMessage("§e");
            player.sendMessage("§e» Use §f/reload §eor restart world to apply changes");
        }
        // Show any warnings
        warnings.forEach(warning => player.sendMessage(warning));
        if (warnings.length === 0 && updated) {
            // Show optimized settings summary
            player.sendMessage("§7━━━━━━━━━━━━━━━━━━━━━━━━");
            player.sendMessage("§bSettings Saved (Pending Restart):§r");
            player.sendMessage(`§7Activation Radius: §e${activationRadius} blocks`);
            player.sendMessage(`§7Max Spawns: §e${maxSpawns}/second`);
            player.sendMessage(`§7Random Delays: §e${randomDelay ? 'Enabled' : 'Disabled'}`);
            player.sendMessage(`§7Check Interval: §e${spawnInterval} ticks`);
            player.sendMessage("§7━━━━━━━━━━━━━━━━━━━━━━━━");
            player.sendMessage("§c§l» RESTART REQUIRED TO ACTIVATE «");
        }
    }).catch((error) => {
        console.error(`Error in openPerformanceConfigForm: ${error}`);
        player.sendMessage("§cAn error occurred while updating performance settings.");
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}
function openRadiusConfigForm(player) {
    if (!player || !player.isValid) {
        console.error("Invalid player provided to openRadiusConfigForm");
        return;
    }
    const radius = configDatabase.read("stackRadius") || 50;
    new ModalFormData()
        .title("Configure Stack Radius")
        .slider("Stacking Radius (blocks):", 1, 100, 1, radius)
        .show(player).then((r) => {
        if (r.canceled || !r.formValues)
            return;
        // Security validation
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            securityService.logSecurityEvent('unauthorized_config_change', player, {
                configType: 'radius'
            });
            return;
        }
        const newRadius = typeof r.formValues[0] === 'number' ? r.formValues[0] : parseInt(r.formValues[0]);
        if (!isNaN(newRadius) && newRadius > 0 && newRadius <= 100) {
            configDatabase.write("stackRadius", newRadius);
            player.sendMessage(`§aStacking radius updated to ${newRadius}!`);
            securityService.logSecurityEvent('config_updated', player, {
                configType: 'stackRadius',
                oldValue: UI.DEFAULT_STACK_RADIUS,
                newValue: newRadius
            });
        }
        else {
            player.sendMessage(ERROR_MESSAGES.INVALID_RADIUS);
            securityService.logSecurityEvent('invalid_config_value', player, {
                configType: 'stackRadius',
                attemptedValue: r.formValues[0]
            });
        }
    }).catch((error) => {
        console.error(`Error in openRadiusConfigForm: ${error}`);
        player.sendMessage("§cAn error occurred while updating the configuration.");
        performanceMonitor.recordError('radius_config_error', error instanceof Error ? error.message : String(error));
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
    const form = new ActionFormData()
        .title("Loot Table Configuration")
        .body("Select an entity to configure its loot table:");
    const sortedMobs = [...validMobs].sort((a, b) => a.displayName.localeCompare(b.displayName));
    sortedMobs.forEach(mob => {
        const iconPath = getSpawnerIconPath(mob.typeId, mob.displayName);
        form.button(`Spawner ${mob.displayName}`, iconPath);
    });
    form.show(player).then((r) => {
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        if (!r.canceled && r.selection !== undefined)
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
    const lootManager = LootManager;
    const table = lootManager.entities[entityId] || {};
    const form = new ActionFormData().title(entityId).body("Select an action:");
    Object.keys(table).forEach(itemId => form.button(`Edit ${itemId}`));
    form.button("Add New Item", "textures/ui/plus.png");
    form.button("XP Manager", "textures/items/experience_bottle.png");
    form.show(player).then((r) => {
        if (r.canceled || r.selection === undefined)
            return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
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
    new ModalFormData()
        .title(`XP Manager: ${entityId}`)
        .textField("XP Amount:", "XP to drop on death", `${config.amount ?? 1}`)
        .slider("Drop Chance (%%%)", 1, 100, 1, config.chance ?? 100)
        .show(player).then((r) => {
        if (r.canceled || !r.formValues)
            return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const amount = parseInt(r.formValues[0]);
        const chance = r.formValues[1];
        if (!isNaN(amount) && amount >= 0) {
            xpDropDatabase.write(entityId, { amount, chance });
            player.sendMessage(`§aXP drop updated for ${entityId}.`);
        }
        else
            player.sendMessage("§cInvalid amount.");
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
    const lootManager = LootManager;
    const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
    new ModalFormData()
        .title(`Add Loot: ${entityId}`)
        .textField("Item ID:", "e.g., minecraft:diamond", "")
        .textField("Chance:", "[0.01-100]", "100")
        .toggle("Enchantable?", false)
        .dropdown("Enchantment Category:", categories, 0)
        .textField("Enchant Chance:", "[0-100]", "50")
        .toggle("Stackable?", true)
        .toggle("Random Durability?", false)
        .show(player).then((r) => {
        if (r.canceled || !r.formValues)
            return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const [id, chance, ench, catIdx, enchChance, stack, dura] = r.formValues;
        const pChance = parseFloat(chance);
        if (!id || isNaN(pChance)) {
            player.sendMessage("§cInvalid Item ID or Chance.");
            return;
        }
        if (!lootManager.entities[entityId])
            lootManager.entities[entityId] = {};
        lootManager.entities[entityId][id] = {
            chance: pChance,
            enchantments: (ench && categories[catIdx] !== "None") ? { chance: parseFloat(enchChance), category: categories[catIdx] } : undefined,
            stackable: stack,
            randomdurability: dura,
        };
        lootManager.saveLootTable(entityId);
        player.sendMessage(`§aAdded ${id} to ${entityId}'s loot table.`);
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
    const lootManager = LootManager;
    const config = lootManager.entities[entityId][itemId];
    const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
    // Resolve enchantable state and category dynamically
    const hasExplicitEnch = !!config.enchantments;
    const hasDefaultEnch = typeof config.enchantChance === 'number';
    const isEnchantable = hasExplicitEnch || hasDefaultEnch;
    let resolvedCategory = "None";
    if (hasExplicitEnch) {
        resolvedCategory = config.enchantments.category;
    }
    else if (hasDefaultEnch) {
        // Fall back to mapping item ID to its default category
        const ITEM_ENCHANT_CATEGORY = {
            'minecraft:iron_sword': 'sword', 'minecraft:diamond_sword': 'sword',
            'minecraft:iron_axe': 'axe', 'minecraft:diamond_axe': 'axe',
            'minecraft:iron_pickaxe': 'pickaxe', 'minecraft:diamond_pickaxe': 'pickaxe',
            'minecraft:iron_shovel': 'shovel', 'minecraft:diamond_shovel': 'shovel',
            'minecraft:iron_hoe': 'hoe', 'minecraft:diamond_hoe': 'hoe',
            'minecraft:bow': 'bow', 'minecraft:crossbow': 'crossbow',
            'minecraft:fishing_rod': 'fishing_rod', 'minecraft:shears': 'shears',
            'minecraft:trident': 'trident',
            'minecraft:iron_helmet': 'helmet', 'minecraft:iron_chestplate': 'chestplate', 'minecraft:iron_leggings': 'leggings', 'minecraft:iron_boots': 'boots',
            'minecraft:chainmail_helmet': 'helmet', 'minecraft:chainmail_chestplate': 'chestplate', 'minecraft:chainmail_leggings': 'leggings', 'minecraft:chainmail_boots': 'boots',
            'minecraft:diamond_helmet': 'helmet', 'minecraft:diamond_chestplate': 'chestplate', 'minecraft:diamond_leggings': 'leggings', 'minecraft:diamond_boots': 'boots',
            'minecraft:leather_helmet': 'helmet', 'minecraft:leather_chestplate': 'chestplate', 'minecraft:leather_leggings': 'leggings', 'minecraft:leather_boots': 'boots',
            'minecraft:stone_sword': 'sword', 'minecraft:stone_axe': 'axe', 'minecraft:stone_pickaxe': 'pickaxe', 'minecraft:stone_shovel': 'shovel', 'minecraft:stone_hoe': 'hoe',
            'minecraft:golden_sword': 'sword', 'minecraft:golden_axe': 'axe', 'minecraft:golden_pickaxe': 'pickaxe', 'minecraft:golden_shovel': 'shovel', 'minecraft:golden_hoe': 'hoe',
            'minecraft:golden_helmet': 'helmet', 'minecraft:golden_chestplate': 'chestplate', 'minecraft:golden_leggings': 'leggings', 'minecraft:golden_boots': 'boots'
        };
        resolvedCategory = ITEM_ENCHANT_CATEGORY[itemId] ?? "None";
    }
    const catIdx = categories.indexOf(resolvedCategory);
    const resolvedEnchChance = hasExplicitEnch ? config.enchantments.chance : (hasDefaultEnch ? config.enchantChance : 50);
    const form = new ModalFormData()
        .title(`Editing: ${itemId}`)
        .textField("Chance:", "[0.01-100]", `${config.chance}`)
        .toggle("Enchantable?", isEnchantable)
        .dropdown("Category:", categories, Math.max(0, catIdx))
        .textField("Enchant Chance:", "[0-100]", `${resolvedEnchChance}`)
        .toggle("Stackable?", config.stackable !== false)
        .toggle("Random Durability?", config.randomdurability === true)
        .toggle("§cDELETE THIS ITEM?§r", false);
    form.show(player).then((r) => {
        if (r.canceled || !r.formValues)
            return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
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
                player.sendMessage("§cInvalid Chance.");
                return;
            }
            config.chance = pChance;
            config.enchantments = (ench && categories[catIdxSelected] !== "None") ? { chance: parseFloat(enchChance), category: categories[catIdxSelected] } : undefined;
            delete config.enchantChance; // Clean up old property to prevent overlaps
            config.stackable = stack;
            config.randomdurability = dura;
        }
        lootManager.saveLootTable(entityId);
        player.sendMessage(`§aLoot table for ${entityId} updated.`);
        openEntityLootConfigForm(player, entityId);
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}
/**
 * Spawner Settings — List View (ActionFormData)
 * Shows all configured level ranges as buttons. Each button opens a
 * tiny 4-control edit form, completely avoiding the Bedrock ModalFormData
 * serialization limit (~60 controls) that silently truncated responses
 * when all ranges were on a single page.
 */
function openAAConfigForm(player) {
    if (!player || !player.isValid) {
        console.error(ERROR_MESSAGES.INVALID_PLAYER);
        return;
    }
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        securityService.logSecurityEvent('unauthorized_aa_config', player);
        return;
    }
    const entries = [];
    aaDatabase.forEach((val, key) => entries.push([key, val]));
    // Sort ranges numerically by their starting level
    entries.sort((a, b) => {
        const aMin = parseInt(a[0].split("-")[0], 10) || 0;
        const bMin = parseInt(b[0].split("-")[0], 10) || 0;
        return aMin - bMin;
    });
    const form = new ActionFormData()
        .title("Spawner Settings")
        .body(`${entries.length} level range(s) configured.\nTap a range to edit, or add a new one.`);
    // Button 0: Add New Range
    form.button("+ Add New Range", "textures/ui/color_plus");
    // Button 1: Load 32-Level Preset
    form.button("Load 32-Level Preset", "textures/items/nether_star");
    // Buttons 2..N+1: One button per existing range
    for (const [range, { qty, speed, maxStack }] of entries) {
        form.button(`Level ${range}\nQty: ${qty}  Speed: ${speed}s  Max: ${maxStack}`, "textures/items/diamond");
    }
    // Last button: Back
    form.button("Back", "textures/ui/cancel");
    forceShowForm(player, form).then((r) => {
        if (r.canceled || r.selection === undefined)
            return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        system.run(() => {
            if (r.selection === 0) {
                // Add New Range
                openAAAddForm(player);
            }
            else if (r.selection === 1) {
                // Load 32-Level Preset
                loadAAPreset32Levels(player);
            }
            else if (r.selection === entries.length + 2) {
                // Back button (last button, offset by 2 fixed buttons)
                openAdminMenu(player);
            }
            else {
                // Edit an existing range (selection 2..N+1 maps to entries[0..N-1])
                const idx = r.selection - 2;
                if (idx >= 0 && idx < entries.length) {
                    const [range, values] = entries[idx];
                    openAAEditForm(player, range, values);
                }
            }
        });
    }).catch((error) => {
        console.error(`Error in openAAConfigForm: ${error}`);
        player.sendMessage("§cAn error occurred while opening spawner settings.");
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}
/**
 * Edit a single spawner level range — only 4 controls (Qty, Speed, MaxStack, Remove toggle).
 * Well under Bedrock's form serialization limit.
 */
function openAAEditForm(player, range, currentVal) {
    if (!player || !player.isValid)
        return;
    const savedQty = currentVal?.qty ?? 1;
    const savedSpeed = currentVal?.speed ?? 10;
    const savedMaxStack = currentVal?.maxStack ?? 100;
    const form = new ModalFormData()
        .title(`Edit Level ${range}`)
        .textField("Quantity:", "e.g., 2", `${savedQty}`)
        .textField("Speed (sec):", "e.g., 6", `${savedSpeed}`)
        .textField("Max Stack:", "e.g., 50", `${savedMaxStack}`)
        .toggle("§cRemove this range?§r", false);
    form.show(player).then((r) => {
        if (r.canceled || !r.formValues) {
            system.run(() => openAAConfigForm(player));
            return;
        }
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const vals = r.formValues;
        const shouldRemove = vals[3];
        if (shouldRemove) {
            aaDatabase.delete(range);
            player.sendMessage(`§eRemoved level range §f${range}§e.`);
        }
        else {
            const parseOrPreserve = (raw, saved) => {
                const s = String(raw).trim();
                if (s === '')
                    return saved;
                const n = parseInt(s);
                return isNaN(n) ? saved : n;
            };
            aaDatabase.write(range, {
                qty: Math.max(1, parseOrPreserve(vals[0], savedQty)),
                speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseOrPreserve(vals[1], savedSpeed))),
                maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseOrPreserve(vals[2], savedMaxStack))),
            });
            player.sendMessage(`§aLevel range §f${range}§a updated!`);
        }
        rebuildAALookup();
        clearSpawnerParseCache();
        // Return to the list
        system.run(() => openAAConfigForm(player));
    }).catch((error) => {
        console.error(`Error in openAAEditForm: ${error}`);
        player.sendMessage("§cAn error occurred while editing spawner settings.");
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}
/**
 * Add a new spawner level range — only 4 controls (Range, Qty, Speed, MaxStack).
 * Well under Bedrock's form serialization limit.
 */
function openAAAddForm(player) {
    if (!player || !player.isValid)
        return;
    const form = new ModalFormData()
        .title("Add New Level Range")
        .textField("Range:", "e.g., 1-10 or 15-15", "")
        .textField("Quantity:", "e.g., 2", "1")
        .textField("Speed (sec):", "e.g., 10", "10")
        .textField("Max Stack:", "e.g., 100", "100");
    form.show(player).then((r) => {
        if (r.canceled || !r.formValues) {
            system.run(() => openAAConfigForm(player));
            return;
        }
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const vals = r.formValues;
        let range = String(vals[0]).trim();
        if (!range) {
            player.sendMessage("§cNo range specified. Nothing was added.");
            system.run(() => openAAConfigForm(player));
            return;
        }
        if (!range.includes("-"))
            range = `${range}-${range}`;
        const parseOrDefault = (raw, fallback) => {
            const s = String(raw).trim();
            if (s === '')
                return fallback;
            const n = parseInt(s);
            return isNaN(n) ? fallback : n;
        };
        aaDatabase.write(range, {
            qty: Math.max(1, parseOrDefault(vals[1], 1)),
            speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseOrDefault(vals[2], 10))),
            maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseOrDefault(vals[3], 100))),
        });
        rebuildAALookup();
        clearSpawnerParseCache();
        player.sendMessage(`§aAdded level range §f${range}§a!`);
        // Return to the list
        system.run(() => openAAConfigForm(player));
    }).catch((error) => {
        console.error(`Error in openAAAddForm: ${error}`);
        player.sendMessage("§cAn error occurred while adding a new range.");
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}
/**
 * Loads mute's 32-level spawner preset in one click.
 * Clears existing AA entries and writes all 32 individual levels.
 */
function loadAAPreset32Levels(player) {
    if (!player || !player.isValid)
        return;
    const confirmForm = new MessageFormData()
        .title("Load 32-Level Preset")
        .body("This will remove all existing level ranges and replace them with the full 32-level preset.\n\n" +
        "Levels 1-32 with escalating Qty, Speed, and Max Stack values.\n\n" +
        "This cannot be undone. Continue?")
        .button1("Yes, Load Preset")
        .button2("Cancel");
    confirmForm.show(player).then((r) => {
        if (r.canceled || r.selection !== 0) {
            system.run(() => openAAConfigForm(player));
            return;
        }
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        // Clear all existing AA entries
        const existingKeys = aaDatabase.keys();
        for (const key of existingKeys) {
            aaDatabase.delete(key);
        }
        // Mute's 32-level spawner rules
        const preset = {
            "1-1": { qty: 2, speed: 6, maxStack: 50 },
            "2-2": { qty: 4, speed: 7, maxStack: 70 },
            "3-3": { qty: 6, speed: 7, maxStack: 90 },
            "4-4": { qty: 8, speed: 8, maxStack: 110 },
            "5-5": { qty: 10, speed: 8, maxStack: 130 },
            "6-6": { qty: 12, speed: 9, maxStack: 150 },
            "7-7": { qty: 14, speed: 9, maxStack: 170 },
            "8-8": { qty: 16, speed: 10, maxStack: 190 },
            "9-9": { qty: 18, speed: 10, maxStack: 210 },
            "10-10": { qty: 20, speed: 11, maxStack: 230 },
            "11-11": { qty: 22, speed: 11, maxStack: 250 },
            "12-12": { qty: 24, speed: 12, maxStack: 270 },
            "13-13": { qty: 26, speed: 12, maxStack: 290 },
            "14-14": { qty: 28, speed: 13, maxStack: 310 },
            "15-15": { qty: 30, speed: 13, maxStack: 330 },
            "16-16": { qty: 32, speed: 14, maxStack: 350 },
            "17-17": { qty: 34, speed: 14, maxStack: 370 },
            "18-18": { qty: 36, speed: 15, maxStack: 390 },
            "19-19": { qty: 38, speed: 15, maxStack: 410 },
            "20-20": { qty: 40, speed: 16, maxStack: 430 },
            "21-21": { qty: 42, speed: 16, maxStack: 450 },
            "22-22": { qty: 44, speed: 17, maxStack: 470 },
            "23-23": { qty: 46, speed: 17, maxStack: 490 },
            "24-24": { qty: 48, speed: 18, maxStack: 510 },
            "25-25": { qty: 50, speed: 18, maxStack: 530 },
            "26-26": { qty: 52, speed: 19, maxStack: 550 },
            "27-27": { qty: 54, speed: 19, maxStack: 570 },
            "28-28": { qty: 56, speed: 20, maxStack: 590 },
            "29-29": { qty: 58, speed: 20, maxStack: 610 },
            "30-30": { qty: 62, speed: 21, maxStack: 650 },
            "31-31": { qty: 66, speed: 21, maxStack: 690 },
            "32-32": { qty: 70, speed: 22, maxStack: 730 },
        };
        let count = 0;
        for (const [range, values] of Object.entries(preset)) {
            aaDatabase.write(range, values);
            count++;
        }
        rebuildAALookup();
        clearSpawnerParseCache();
        player.sendMessage(`§a⚡ Loaded §f${count}§a level ranges from the 32-level preset!`);
        // Return to the list so the user can see all 32 entries
        system.run(() => openAAConfigForm(player));
    }).catch((error) => {
        console.error(`Error in loadAAPreset32Levels: ${error}`);
        player.sendMessage("§cAn error occurred while loading the preset.");
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
            player.sendMessage("§cLogging has been disabled for all spawner activities.");
        }
        else {
            enableLogging();
            player.sendMessage("§aLogging has been enabled for all spawner activities.");
        }
        system.run(() => openAdminMenu(player));
    }
    catch (error) {
        console.error(`Error in toggleLogging: ${error}`);
        player.sendMessage("§cAn error occurred while toggling logging.");
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
        debugLog("[MOBSTACKER] Loading database stats to merge with local data");
        loadSpawnerStatistics();
        debugLog(`Stats available: ${spawnerStatistics.entitiesKilled.size} entities, ${spawnerStatistics.playerStats.size} players`);
        calculateSpawnerTotals();
        const totalKills = Array.from(spawnerStatistics.entitiesKilled.values()).reduce((sum, kills) => sum + kills, 0);
        const onlinePlayersCount = world.getAllPlayers().length;
        const uniquePlayersCount = spawnerStatistics.playerStats.size;
        const totalKillsFormatted = totalKills.toLocaleString();
        const uptimeMinutes = Math.floor((Date.now() - (performanceMetrics.lastReset || Date.now())) / 1000 / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeDisplay = uptimeHours > 0 ?
            `${uptimeHours}h ${uptimeMinutes % 60}m` :
            `${uptimeMinutes}m`;
        const serverLoad = spawnerStatistics.totalSpawners > 0 ?
            Math.min(100, Math.max(0, (spawnerStatistics.totalEntities / spawnerStatistics.totalSpawners) * 25)).toFixed(1) : '0';
        const minecraftTickTime = 50;
        const tickEfficiency = performanceMetrics.averageProcessingTime > 0 ?
            Math.min(100, (performanceMetrics.averageProcessingTime / minecraftTickTime) * 100).toFixed(1) : '0';
        const memoryUsage = getMemoryUsage();
        let memoryLevel;
        if (memoryUsage < 50) {
            memoryLevel = "Low";
        }
        else if (memoryUsage < 150) {
            memoryLevel = "Medium";
        }
        else if (memoryUsage < 300) {
            memoryLevel = "High";
        }
        else {
            memoryLevel = "Very High";
        }
        const topMobs = Array.from(spawnerStatistics.entitiesKilled.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        const topPlayers = Array.from(spawnerStatistics.playerStats.entries())
            .sort((a, b) => (b[1].entitiesKilled || 0) - (a[1].entitiesKilled || 0))
            .slice(0, 10);
        const totalSpawnersPlaced = spawnerDatabase.length;
        const loadedSpawnersCount = spawnerStatistics.totalSpawners;
        let bodyText = `§6§lSERVER STATISTICS§r\n\n`;
        bodyText += `§bSpawner Blocks Placed (Total): §f${totalSpawnersPlaced.toLocaleString()}\n`;
        bodyText += `§bLoaded/Ticking Spawners: §f${loadedSpawnersCount.toLocaleString()}\n`;
        bodyText += `§bLoaded Mob Stacks (Physical): §f${spawnerStatistics.totalEntities.toLocaleString()}\n`;
        bodyText += `§bLoaded Mobs (Total inside Stacks): §f${spawnerStatistics.totalVirtualEntities.toLocaleString()}\n`;
        bodyText += `§bOnline Players: §f${onlinePlayersCount}\n`;
        bodyText += `§bPlayers with Kill History: §f${uniquePlayersCount}\n`;
        bodyText += `§bActive Spawner Chunks: §f${ACTIVE_CHUNKS.size}\n`;
        bodyText += `§bServer Load (Entity Density): §f${serverLoad}% §7(Target < 4 mobs/spawner)\n`;
        bodyText += `§bServer Uptime: §f${uptimeDisplay}\n`;
        bodyText += `§bMemory Usage (Internal Units): §f${memoryLevel} (${memoryUsage.toLocaleString()} / 200 warning)\n`;
        bodyText += `§bTick Usage (CPU load): §f${tickEfficiency}% (${performanceMetrics.averageProcessingTime.toFixed(2)}ms of 50ms tick)\n`;
        bodyText += `§bTotal Kills: §f${totalKillsFormatted}\n\n`;
        bodyText += `§6§lTOP 10 MOST KILLED MOBS§r\n`;
        if (topMobs.length > 0) {
            topMobs.forEach((mob, index) => {
                const mobName = getMobDisplayName(mob[0]) || 'Unknown';
                const rank = index + 1;
                bodyText += `§7${rank}. §f${mobName} §7(${mob[1].toLocaleString()} kills)\n`;
            });
        }
        else {
            bodyText += `§7No kills recorded yet\n`;
        }
        bodyText += `\n`;
        bodyText += `§6§lTOP 10 KILLERS§r\n`;
        if (topPlayers.length > 0) {
            topPlayers.forEach((playerEntry, index) => {
                const rank = index + 1;
                const totalKillsCount = playerEntry[1].entitiesKilled?.toLocaleString() || 0;
                bodyText += `§7${rank}. §f${playerEntry[0]} §7(${totalKillsCount} total kills)\n`;
                const playerTopKills = getPlayerTopKills(playerEntry[1], 3);
                playerTopKills.forEach((killType) => {
                    bodyText += `   §8- §7${killType.displayName}: ${killType.count.toLocaleString()}\n`;
                });
                bodyText += `\n`;
            });
        }
        else {
            bodyText += `§7No player kills recorded yet\n`;
        }
        const form = new ActionFormData()
            .title("§8Spawner Server Statistics")
            .body(bodyText)
            .button("§8Close", "textures/ui/cancel")
            .button("§bView Player Stats", "textures/items/name_tag")
            .button("§cReset All Statistics", "textures/ui/realms_red_x");
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
                const confirmForm = new ModalFormData()
                    .title("Confirm Reset")
                    .textField("Confirm", "Type 'RESET' to confirm", "")
                    .submitButton("CONFIRM");
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
                        player.sendMessage("§a✓ All statistics have been reset successfully!");
                    }
                    else {
                        player.sendMessage("§cReset cancelled - confirmation code was incorrect.");
                    }
                }).catch((error) => {
                    console.error(`Error in spawner stats reset confirmation: ${error}`);
                });
            }
        }).catch((error) => {
            console.error(`Error in openSpawnerStatisticsForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing statistics.");
        });
    }
    catch (error) {
        console.error(`Critical error in openSpawnerStatisticsForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
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
        const playerSpawners = new Map();
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
            player.sendMessage("§cNo active spawners found in the database.");
            return;
        }
        const totalSpawners = Array.from(playerSpawners.values()).reduce((sum, spawners) => sum + spawners.length, 0);
        const sortedPlayers = Array.from(playerSpawners.entries())
            .sort((a, b) => b[1].length - a[1].length);
        const form = new ActionFormData()
            .title("Spawner Teleport System")
            .body(`Database size: ${totalSpawners} spawners across ${playerSpawners.size} players. Select a player to view their spawners:`);
        form.button("🔍 Search by Location", "textures/ui/magnifying_glass");
        sortedPlayers.forEach(([playerName, spawners]) => {
            form.button(`👤 ${playerName} (${spawners.length} spawners)`, "textures/items/name_tag");
        });
        form.show(player).then((r) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined)
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
            player.sendMessage("§cAn error occurred while showing the spawner teleport form.");
        });
    }
    catch (error) {
        console.error(`Critical error in openSpawnerTeleportForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
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
        const validSpawners = spawners.filter((spawner) => spawner !== undefined && spawner !== null);
        const spawnerDetails = validSpawners.map((spawner) => {
            let x = 0, y = 0, z = 0;
            try {
                if (spawner.location && typeof spawner.location === 'string') {
                    const coords = spawner.location.split(',').map((coord) => parseFloat(coord.trim()));
                    if (coords.length >= 3 && coords.every((coord) => !isNaN(coord))) {
                        [x, y, z] = coords;
                    }
                }
            }
            catch (error) {
                debugLog(`Error parsing location for spawner: ${spawner.location}, error: ${error}`);
            }
            const typeId = spawner.typeId || 'unknown_spawner';
            const levelMatch = typeId.match(/spawner(\d+)/);
            const level = levelMatch ? parseInt(levelMatch[1]) : 1;
            const mobType = typeId.replace('mrleefy:', '').replace(/spawner\d+/, '').replace(/_/g, '');
            const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || 'Unknown';
            const info = getEntitiesInfoNearSpawner(x, y, z);
            return {
                ...spawner,
                displayName,
                level,
                physicalEntities: info.physicalCount,
                virtualEntities: info.virtualCount,
                x, y, z
            };
        });
        const totalPhysical = spawnerDetails.reduce((sum, s) => sum + (s.physicalEntities || 0), 0);
        const totalVirtual = spawnerDetails.reduce((sum, s) => sum + (s.virtualEntities || 0), 0);
        const avgLevel = spawnerDetails.length > 0 ?
            spawnerDetails.reduce((sum, s) => sum + (s.level || 1), 0) / spawnerDetails.length : 0;
        const form = new ActionFormData()
            .title(`${playerName}'s Spawners`)
            .body(`Total: ${spawnerDetails.length} spawners | Active: ${totalPhysical} stacks (${totalVirtual} mobs) | Avg Level: ${avgLevel.toFixed(1)}`);
        spawnerDetails.forEach((spawner) => {
            const status = spawner.physicalEntities > 0 ? `§a[Active: ${spawner.physicalEntities} stack (${spawner.virtualEntities} mobs)]` : '§8[Idle]';
            const iconPath = getSpawnerIconPath(spawner.typeId, spawner.displayName);
            form.button(`${status} §7Lvl ${spawner.level} §f${spawner.displayName}\n§8Coord: ${spawner.x}, ${spawner.y}, ${spawner.z}`, iconPath);
        });
        form.button("§6📊 View Player Statistics", "textures/ui/book_normal");
        form.show(player).then((r) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined)
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
            player.sendMessage("§cAn error occurred while opening selection form.");
        });
    }
    catch (error) {
        console.error(`Critical error in openSpawnerSelectionForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}
function teleportToSpawner(player, x, y, z) {
    try {
        if (!player || !player.isValid)
            return;
        player.sendMessage(`§aTeleporting to spawner at ${x}, ${y}, ${z}...`);
        system.run(() => {
            try {
                const dimension = player.dimension;
                player.teleport({ x: x + 0.5, y: y + 1.5, z: z + 0.5 }, { dimension: dimension });
            }
            catch (teleportError) {
                console.error(`Teleport logic failed: ${teleportError}`);
                player.sendMessage(`§cTeleport failed. Check if coordinate is in a loaded area or try again.`);
            }
        });
    }
    catch (error) {
        console.error(`Error in teleportToSpawner: ${error}`);
        player.sendMessage("§cA critical error occurred during teleportation.");
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
        const overworld = world.getDimension("overworld");
        const location = { x, y, z };
        const nearbyEntities = overworld.getEntities({
            location: location,
            maxDistance: 10
        });
        let physicalCount = 0;
        let virtualCount = 0;
        nearbyEntities.forEach((entity) => {
            if (entity?.isValid && entity.typeId.startsWith('mrleefy:')) {
                if (entity.nameTag && entity.nameTag.includes('x')) {
                    physicalCount++;
                    virtualCount += extractStackSize(entity.nameTag);
                }
            }
        });
        return { physicalCount, virtualCount };
    }
    catch (error) {
        return { physicalCount: 0, virtualCount: 0 };
    }
}
function countEntitiesNearSpawner(x, y, z) {
    return getEntitiesInfoNearSpawner(x, y, z).physicalCount;
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
        const form = new ModalFormData()
            .title("Search Spawners by Location")
            .toggle("Use current location", true)
            .textField("X Coordinate", "Enter X coordinate", playerX.toString())
            .textField("Z Coordinate", "Enter Z coordinate", playerZ.toString())
            .slider("Search Radius", 10, 500, 10, 50)
            .toggle("Include inactive spawners", true);
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
                player.sendMessage("§cInvalid coordinates entered.");
                return;
            }
            const results = [];
            Object.entries(allSpawners).forEach(([coordinates, data]) => {
                try {
                    const [x, y, z] = coordinates.split(',').map((coord) => parseFloat(coord.trim()));
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
                                x, y, z
                            });
                        }
                    }
                }
                catch (e) {
                    console.error("Error matching distance search coords:", e);
                }
            });
            results.sort((a, b) => a.distance - b.distance);
            openLocationResultsForm(player, results, searchX, searchZ, radius);
        }).catch((error) => {
            console.error(`Error in openLocationSearchForm: ${error}`);
            player.sendMessage("§cAn error occurred during search.");
        });
    }
    catch (error) {
        console.error(`Critical error in openLocationSearchForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
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
        const form = new ActionFormData()
            .title("Search Results")
            .body(`Found ${spawners.length} spawners within ${radius} blocks of ${searchX}, ${searchZ}:`);
        spawners.forEach((result) => {
            const spawner = result.data;
            const status = result.physicalCount > 0 ? `§a[Active: ${result.physicalCount} stack (${result.virtualCount} mobs)]` : '§8[Idle]';
            const typeId = spawner.typeId || 'unknown';
            const levelMatch = typeId.match(/spawner(\d+)/);
            const level = levelMatch ? levelMatch[1] : '1';
            const mobType = typeId.replace('mrleefy:', '').replace(/spawner\d+/, '').replace(/_/g, '');
            const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || 'Unknown';
            const iconPath = getSpawnerIconPath(typeId, displayName);
            form.button(`${status} §7Lvl ${level} §f${displayName}\n§7Player: ${spawner.placedBy || 'Unknown'} (${Math.round(result.distance)}m away)`, iconPath);
            validSpawners.push(result);
        });
        form.show(player).then((r) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined)
                return;
            const selectedSpawner = validSpawners[r.selection];
            if (selectedSpawner) {
                teleportToSpawner(player, selectedSpawner.x, selectedSpawner.y, selectedSpawner.z);
            }
        }).catch((error) => {
            console.error(`Error in openLocationResultsForm: ${error}`);
            player.sendMessage("§cAn error occurred while selecting spawner from search results.");
        });
    }
    catch (error) {
        console.error(`Critical error in openLocationResultsForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}
function getMobDisplayName(entityTypeId) {
    const found = validMobs.find(m => m.typeId === entityTypeId);
    if (found) {
        return found.displayName;
    }
    // Fallback to formatting raw ID if not in list
    const name = entityTypeId.replace("mrleefy:", "").replace("still", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
}
function getSpawnerIconPath(typeId, displayName) {
    const cleanTypeId = typeId.replace(/\d+$/, ''); // remove level numbers if any
    // Check crawler block texture mapping (pointing to actual ore block faces used by the game)
    const crawlerBlockMap = {
        'mrleefy:coalcrawlerspawner': 'textures/blocks/iron',
        'mrleefy:ironcrawlerspawner': 'textures/blocks/ironcrawlerspawner',
        'mrleefy:goldcrawlerspawner': 'textures/blocks/goldcrawlerspawner',
        'mrleefy:diamondcrawlerspawner': 'textures/blocks/diamondcrawlerspawner',
        'mrleefy:glowstonecrawlerspawner': 'textures/blocks/gold',
        'mrleefy:obsidiancrawlerspawner': 'textures/blocks/diamond',
        'mrleefy:icecrawlerspawner': 'textures/blocks/emerald',
        'mrleefy:spongecrawlerspawner': 'textures/blocks/netherite',
        'mrleefy:lapiscrawlerspawner': 'textures/blocks/lapis',
        'mrleefy:redstonecrawlerspawner': 'textures/blocks/redstone',
        'mrleefy:coppercrawlerspawner': 'textures/blocks/copper',
        'mrleefy:quartzcrawlerspawner': 'textures/blocks/quartz',
        'mrleefy:amethystcrawlerspawner': 'textures/blocks/amethyst',
        // Also map still crawler types
        'mrleefy:coalcrawlerstill': 'textures/blocks/iron',
        'mrleefy:ironcrawlerstill': 'textures/blocks/ironcrawlerspawner',
        'mrleefy:goldcrawlerstill': 'textures/blocks/goldcrawlerspawner',
        'mrleefy:diamondcrawlerstill': 'textures/blocks/diamondcrawlerspawner',
        'mrleefy:glowstonecrawlerstill': 'textures/blocks/gold',
        'mrleefy:obsidiancrawlerstill': 'textures/blocks/diamond',
        'mrleefy:icecrawlerstill': 'textures/blocks/emerald',
        'mrleefy:spongecrawlerstill': 'textures/blocks/netherite',
        'mrleefy:lapiscrawlerstill': 'textures/blocks/lapis',
        'mrleefy:redstonecrawlerstill': 'textures/blocks/redstone',
        'mrleefy:coppercrawlerstill': 'textures/blocks/copper',
        'mrleefy:quartzcrawlerstill': 'textures/blocks/quartz',
        'mrleefy:amethystcrawlerstill': 'textures/blocks/amethyst',
    };
    if (crawlerBlockMap[cleanTypeId]) {
        return `${crawlerBlockMap[cleanTypeId]}.png`;
    }
    // Default icon path
    let iconName = displayName.toLowerCase().replace(/ /g, '_');
    if (iconName === "wither_skeleton")
        iconName = "witherskeleton";
    if (iconName === "ender_dragon")
        iconName = "enderdragon";
    if (iconName === "snow_golem")
        iconName = "snowman";
    return `textures/blocks/icons/${iconName}.png`;
}
function scanAndUpdateSpawnerDatabase() {
    try {
        const overworld = world.getDimension("overworld");
        const allSpawnerKeys = spawnerDatabase.keys();
        const entities = overworld.getEntities();
        for (const entity of entities) {
            if (!entity?.isValid)
                continue;
            if (entity.typeId.startsWith('mrleefy:') && entity.nameTag && entity.nameTag.includes('x')) {
                const location = entity.location;
                const roundedLocation = `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
                if (!spawnerDatabase.read(roundedLocation)) {
                    spawnerDatabase.write(roundedLocation, {
                        typeId: entity.typeId.replace('still', ''),
                        placedBy: 'System Scan',
                        placedAt: Date.now()
                    });
                    debugLog(`[MOBSTACKER] Registered untracked spawner at ${roundedLocation} via system scan`);
                }
            }
        }
        for (const key of allSpawnerKeys) {
            try {
                const [x, y, z] = key.split(',').map((coord) => parseFloat(coord.trim()));
                const block = overworld.getBlock({ x, y, z });
                if (block && !(block.typeId.startsWith('mrleefy:') && block.typeId.includes('spawner') && !block.typeId.endsWith('_display'))) {
                    spawnerDatabase.delete(key);
                    debugLog(`[MOBSTACKER] Removed stale database entry for missing spawner block at ${key}`);
                }
            }
            catch (blockError) {
                // If block is unloaded, keep the entry
            }
        }
    }
    catch (error) {
        console.error(`[MOBSTACKER] Error in system scan: ${error}`);
    }
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
        const confirmForm = new MessageFormData()
            .title("§4§lDatabase Cleanup Warning")
            .body("§c§lWARNING:§r\n\n" +
            "This operation will verify all spawners stored in the database.\n\n" +
            "§eWhat it does:§r\n" +
            "• Checks if a spawner block actually exists at each stored location (only checks currently loaded chunks for safety).\n" +
            "• Deletes stale spawner coordinates from the database if the block was removed/broken.\n" +
            "• Removes any orphaned spawnrules at those locations.\n\n" +
            "§aUnloaded spawner chunks are safely skipped so they won't be deleted.§r\n\n" +
            "Are you sure you want to proceed?")
            .button1("§aYes, Start Scan")
            .button2("§cNo, Cancel");
        confirmForm.show(player).then((r) => {
            if (r.canceled || r.selection !== 0) {
                player.sendMessage("§eDatabase cleanup cancelled.");
                return;
            }
            player.sendMessage("§aStarting database verification and cleanup...");
            player.sendMessage("§7This process runs in batches to prevent lag.");
            const allSpawnerKeys = spawnerDatabase.keys();
            const totalCount = allSpawnerKeys.length;
            let currentIndex = 0;
            let verifiedSpawners = 0;
            let removedBlocks = 0;
            let removedEntities = 0;
            let processedCount = 0;
            let skippedUnloaded = 0;
            const BATCH_SIZE = 20;
            const processBatch = () => {
                const batchLimit = Math.min(currentIndex + BATCH_SIZE, totalCount);
                for (let i = currentIndex; i < batchLimit; i++) {
                    const coordinates = allSpawnerKeys[i];
                    try {
                        const [x, y, z] = coordinates.split(',').map((coord) => parseFloat(coord.trim()));
                        const spawnerData = spawnerDatabase.read(coordinates);
                        const dimensionId = spawnerData?.dimensionId;
                        let isLoaded = false;
                        let isSpawner = false;
                        let checkDimension;
                        if (dimensionId) {
                            try {
                                checkDimension = world.getDimension(dimensionId);
                                const block = checkDimension.getBlock({ x, y, z });
                                if (block && block.isValid) {
                                    isLoaded = true;
                                    const typeId = block.typeId;
                                    isSpawner = typeId.startsWith('mrleefy:') && typeId.includes('spawner') && !typeId.endsWith('_display');
                                }
                            }
                            catch (e) {
                                isLoaded = false;
                            }
                        }
                        else {
                            // Legacy spawner fallback: scan all dimensions. If found in any, we count it as verified.
                            // If loaded in all and not found, we delete it.
                            let found = false;
                            let allLoaded = true;
                            const dims = ["overworld", "nether", "the_end"];
                            for (const dim of dims) {
                                try {
                                    const d = world.getDimension(dim);
                                    const block = d.getBlock({ x, y, z });
                                    if (block && block.isValid) {
                                        const typeId = block.typeId;
                                        if (typeId.startsWith('mrleefy:') && typeId.includes('spawner') && !typeId.endsWith('_display')) {
                                            found = true;
                                            checkDimension = d;
                                            break;
                                        }
                                    }
                                    else {
                                        allLoaded = false;
                                    }
                                }
                                catch (e) {
                                    allLoaded = false;
                                }
                            }
                            isSpawner = found;
                            isLoaded = found || allLoaded;
                        }
                        if (isLoaded) {
                            if (isSpawner) {
                                verifiedSpawners++;
                            }
                            else {
                                // Block is loaded but it is NOT a spawner block -> stale!
                                spawnerDatabase.delete(coordinates);
                                removedBlocks++;
                                // Remove orphaned entities in that location
                                const targetDim = checkDimension || world.getDimension(dimensionId || "overworld");
                                try {
                                    const nearbyEntities = targetDim.getEntities({
                                        location: { x, y, z },
                                        maxDistance: 8
                                    });
                                    nearbyEntities.forEach((entity) => {
                                        if (entity?.isValid && entity.typeId.startsWith('mrleefy:') && entity.typeId.endsWith('still')) {
                                            entity.remove();
                                            removedEntities++;
                                        }
                                    });
                                }
                                catch (e) { }
                            }
                        }
                        else {
                            // Chunk is unloaded: skip for safety
                            skippedUnloaded++;
                        }
                    }
                    catch (error) {
                        console.error(`Error processing spawner at ${coordinates}:`, error);
                    }
                    processedCount++;
                }
                if (processedCount % 10 === 0 || processedCount === totalCount) {
                    player.sendMessage(`§7Progress: ${processedCount}/${totalCount} checked (${skippedUnloaded} skipped unloaded)...`);
                }
                if (currentIndex + BATCH_SIZE < totalCount) {
                    currentIndex += BATCH_SIZE;
                    system.runTimeout(() => {
                        processBatch();
                    }, 1);
                }
                else if (processedCount === totalCount) {
                    reportVerificationResults(player, verifiedSpawners, removedBlocks, removedEntities, skippedUnloaded);
                }
            };
            if (totalCount > 0) {
                processBatch();
            }
            else {
                player.sendMessage("§eNo spawners found in database.");
            }
        }).catch((confirmError) => {
            console.error(`Error in cleanup confirmation form: ${confirmError}`);
        });
    }
    catch (error) {
        console.error(`Error in verifyAndCleanSpawnerDatabase: ${error}`);
        player.sendMessage("§cAn error occurred while verifying the database.");
    }
}
function reportVerificationResults(player, verifiedSpawners, removedBlocks, removedEntities, skippedUnloaded) {
    try {
        player.sendMessage(`§a✓ Database verification complete!`);
        player.sendMessage(`§7Verified: §a${verifiedSpawners} §7spawners`);
        if (skippedUnloaded > 0) {
            player.sendMessage(`§7Skipped: §e${skippedUnloaded} §7unloaded spawners (safe skip)`);
        }
        if (removedBlocks > 0) {
            player.sendMessage(`§7Removed: §c${removedBlocks} §7stale database entries`);
        }
        if (removedEntities > 0) {
            player.sendMessage(`§7Cleaned: §c${removedEntities} §7orphaned spawnrule entities`);
        }
        if (removedBlocks === 0 && removedEntities === 0) {
            player.sendMessage(`§aDatabase is clean - no issues found!`);
        }
    }
    catch (error) {
        console.error(`Error reporting verification results: ${error}`);
    }
}
function openSimplePlayerListForm(player, sortedPlayers) {
    try {
        if (!player || !player.isValid)
            return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const alphaPlayers = Array.from(sortedPlayers).sort((a, b) => a[0].localeCompare(b[0]));
        const form = new ActionFormData()
            .title(`Spawner Owners (${alphaPlayers.length} players)`)
            .body("Select a player to view spawners they have placed:");
        for (const [playerName, spawners] of alphaPlayers) {
            form.button(`👤 ${playerName} (${spawners.length} spawners)`, "textures/items/name_tag");
        }
        form.show(player).then((r) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined)
                return;
            const selectedData = alphaPlayers[r.selection];
            if (selectedData) {
                const [selectedPlayer, spawners] = selectedData;
                openSpawnerSelectionForm(player, selectedPlayer, spawners);
            }
        }).catch((error) => {
            console.error(`Error in openSimplePlayerListForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing the player list.");
        });
    }
    catch (error) {
        console.error(`Critical error in openSimplePlayerListForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}
function openPlayerStatsSelectionForm(player) {
    try {
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const playerSpawners = new Map();
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
            player.sendMessage("§cNo spawner data found in the database.");
            return;
        }
        const sortedPlayers = Array.from(playerSpawners.entries())
            .sort((a, b) => b[1].length - a[1].length);
        const form = new ActionFormData()
            .title("Select Player for Detailed Stats")
            .body(`Found ${playerSpawners.size} players with spawners. Select a player to view their detailed spawner information:`);
        for (const [playerName, spawners] of sortedPlayers) {
            let totalPhysical = 0;
            let totalVirtual = 0;
            spawners.forEach((spawner) => {
                const [x, y, z] = spawner.location.split(',').map(Number);
                const info = getEntitiesInfoNearSpawner(x, y, z);
                totalPhysical += info.physicalCount;
                totalVirtual += info.virtualCount;
            });
            const avgLevel = spawners.reduce((sum, spawner) => {
                const levelMatch = spawner.typeId.match(/spawner(\d+)/);
                return sum + (levelMatch ? parseInt(levelMatch[1]) : 1);
            }, 0) / spawners.length;
            form.button(`§e${playerName}\n§8${spawners.length} spawners • ${totalPhysical} stacks (${totalVirtual} mobs) • Avg Level ${avgLevel.toFixed(1)}`, "textures/items/name_tag");
        }
        form.show(player).then((r) => {
            if (r.canceled || r.selection === undefined)
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
                        if (spawner.location && typeof spawner.location === 'string') {
                            const coords = spawner.location.split(',').map((coord) => parseFloat(coord.trim()));
                            if (coords.length >= 3 && coords.every((coord) => !isNaN(coord))) {
                                [x, y, z] = coords;
                            }
                        }
                    }
                    catch (error) {
                        debugLog(`Error parsing location for spawner: ${spawner.location}, error: ${error}`);
                    }
                    const typeId = spawner.typeId || 'unknown_spawner';
                    const levelMatch = typeId.match(/spawner(\d+)/);
                    const level = levelMatch ? parseInt(levelMatch[1]) : 1;
                    const mobType = typeId.replace('mrleefy:', '').replace(/spawner\d+/, '').replace(/_/g, '');
                    const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || 'Unknown';
                    const info = getEntitiesInfoNearSpawner(x, y, z);
                    return {
                        ...spawner,
                        displayName,
                        level,
                        physicalEntities: info.physicalCount,
                        virtualEntities: info.virtualCount,
                        x, y, z
                    };
                });
                openSpawnerInfoForm(player, selectedPlayer, spawnerDetails);
            }
        }).catch((error) => {
            console.error(`Error in openPlayerStatsSelectionForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing player selection.");
        });
    }
    catch (error) {
        console.error(`Critical error in openPlayerStatsSelectionForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
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
        const topType = Object.entries(typeDistribution)
            .sort((a, b) => b[1] - a[1])[0];
        let infoText = `**${playerName}'s Spawner Overview**\n\n`;
        infoText += `**Summary:**\n`;
        infoText += `• Total Spawners: ${totalSpawners}\n`;
        infoText += `• Active Spawners: ${activeSpawners}/${totalSpawners} (${totalSpawners > 0 ? ((activeSpawners / totalSpawners) * 100).toFixed(1) : '0.0'}%)\n`;
        infoText += `• Total Mob Stacks Nearby: ${totalPhysicalEntities} (Physical entities alive)\n`;
        infoText += `• Total Mobs inside Stacks: ${totalVirtualEntities} (Sum of stack sizes)\n`;
        infoText += `• Average Level: ${avgLevel.toFixed(1)}\n`;
        infoText += `• Total Kills: ${totalKills}\n\n`;
        infoText += `**Spawner Types:**\n`;
        Object.entries(typeDistribution)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
            infoText += `• ${type}: ${count}\n`;
        });
        infoText += `\nTop Performer: ${topType ? `${topType[0]} (${topType[1]} spawners)` : 'None'}\n\n`;
        infoText += `Individual Spawner Details:\n`;
        spawnerDetails
            .sort((a, b) => b.physicalEntities - a.physicalEntities)
            .slice(0, 5)
            .forEach((spawner, index) => {
            const status = spawner.physicalEntities > 0 ? '[ACTIVE]' : '[IDLE]';
            const placedTime = spawner.hasOwnProperty('placedAt') && spawner.placedAt ?
                new Date(spawner.placedAt).toLocaleDateString() : 'Unknown';
            infoText += `${index + 1}. ${status} ${spawner.displayName} Level ${spawner.level} Cord: ${spawner.x}, ${spawner.y}, ${spawner.z}\n`;
            infoText += `   ${spawner.physicalEntities} stacks (${spawner.virtualEntities} mobs) • ${spawner.entitiesKilled || 0} kills • Placed: ${placedTime}\n`;
        });
        const form = new ActionFormData()
            .title(`${playerName}'s Spawner Information`)
            .body(infoText)
            .button("§cClose");
        form.show(player).then((response) => {
            // Just close the form
        }).catch((error) => {
            console.error(`Error in openSpawnerInfoForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing spawner information.");
        });
    }
    catch (error) {
        console.error(`Critical error in openSpawnerInfoForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}
function openResetDatabaseForm(player) {
    if (!player || !player.isValid)
        return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const form = new ModalFormData()
        .title("Reset Database Settings")
        .toggle("Reset Spawner Upgrades (Levels)", false)
        .toggle("Reset General Settings (Speed/Limit)", false)
        .toggle("Reset XP Drops Configurations", false)
        .toggle("Reset Custom Loot Tables", false)
        .toggle("Reset Statistics (Kill counts, uptime)", false);
    forceShowForm(player, form).then((r) => {
        if (r.canceled || !r.formValues) {
            openAdminMenu(player);
            return;
        }
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const [resetSpawners, resetGeneral, resetXP, resetLoot, resetStats] = r.formValues;
        if (!resetSpawners && !resetGeneral && !resetXP && !resetLoot && !resetStats) {
            player.sendMessage("§eNo databases selected for reset.");
            openAdminMenu(player);
            return;
        }
        const selectedList = [];
        if (resetSpawners)
            selectedList.push("- Spawner Upgrades");
        if (resetGeneral)
            selectedList.push("- General Config Settings");
        if (resetXP)
            selectedList.push("- XP Drops Configurations");
        if (resetLoot)
            selectedList.push("- Custom Loot Tables");
        if (resetStats)
            selectedList.push("- Spawner Statistics");
        const confirmForm = new MessageFormData()
            .title("§4§lDOUBLE CONFIRMATION")
            .body(`§c§lWARNING:§r\n\n` +
            `You are about to reset the following databases:\n` +
            `§e${selectedList.join("\n")}\n\n` +
            `§cThis will permanently delete this data from your world save and CANNOT be undone.§r\n\n` +
            `Are you absolutely sure you want to proceed?`)
            .button1("§aYes, Reset Data")
            .button2("§cNo, Cancel");
        confirmForm.show(player).then((confirmResult) => {
            if (confirmResult.canceled || confirmResult.selection !== 0) {
                player.sendMessage("§eDatabase reset cancelled.");
                openResetDatabaseForm(player);
                return;
            }
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            let resetCount = 0;
            if (resetSpawners) {
                spawnerDatabase.clear();
                spawnerDatabase.Database?._executeSave?.();
                const dims = ["overworld", "nether", "the_end"];
                for (const dim of dims) {
                    try {
                        const entities = world.getDimension(dim).getEntities();
                        for (const entity of entities) {
                            if (entity?.isValid && entity.typeId.startsWith('mrleefy:') && entity.typeId.endsWith('still')) {
                                entity.remove();
                            }
                        }
                    }
                    catch (e) { }
                }
                resetCount++;
            }
            if (resetGeneral) {
                configDatabase.clear();
                configDatabase.Database?._executeSave?.();
                resetCount++;
            }
            if (resetXP) {
                xpDropDatabase.clear();
                xpDropDatabase.Database?._executeSave?.();
                resetCount++;
            }
            if (resetLoot) {
                lootTableDatabase.clear();
                lootTableDatabase.Database?._executeSave?.();
                LootManager.initialize(); // Instantly reload default loot configurations into memory!
                resetCount++;
            }
            if (resetStats) {
                resetSpawnerStatistics();
                resetCount++;
            }
            player.sendMessage(Format.success(`Successfully reset ${resetCount} selected database(s).`));
            openAdminMenu(player);
        }).catch((err) => {
            console.error(`Error in confirmation: ${err}`);
        });
    }).catch((err) => {
        console.error(`Error in reset selection: ${err}`);
    });
}
// --- CHAT COMMANDS ---
world.beforeEvents.chatSend.subscribe((event) => {
    const { sender: player, message } = event;
    const lowerMessage = message.trim().toLowerCase();
    if (lowerMessage.startsWith("!") || lowerMessage.startsWith("/")) {
        const cleanMsg = lowerMessage.substring(1).trim();
        if (cleanMsg.startsWith("reaper")) {
            event.cancel = true;
            system.run(() => {
                const isAdmin = player.hasTag("admin") || player.hasTag("Admin") || player.name === "Mr Leefy" || player.isOp?.() === true;
                if (!isAdmin) {
                    player.sendMessage("§cYou must have the 'admin' tag or be OP to run this command.");
                    return;
                }
                const parts = cleanMsg.split(/\s+/);
                if (parts.length < 2) {
                    player.sendMessage("§cUsage: !reaper <1-5 or I-V>");
                    return;
                }
                const levelStr = parts[1];
                let level = parseInt(levelStr);
                if (isNaN(level)) {
                    const romanMap = { "i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5 };
                    level = romanMap[levelStr.toLowerCase()] || 0;
                }
                if (level < 1 || level > 5) {
                    player.sendMessage("§cUsage: !reaper <1-5 or I-V>");
                    return;
                }
                try {
                    const equipment = player.getComponent("equippable");
                    const mainhand = equipment?.getEquipment("Mainhand");
                    if (!mainhand) {
                        player.sendMessage("§cYou must hold a weapon in your main hand.");
                        return;
                    }
                    mainhand.setDynamicProperty("reaper", level);
                    const romanLevels = ["", "I", "II", "III", "IV", "V"];
                    const newLoreLine = `§r§7Reaper ${romanLevels[level]}`;
                    const currentLore = mainhand.getLore() || [];
                    const updatedLore = currentLore.filter((l) => !l.replace(/§./g, "").includes("Reaper"));
                    updatedLore.push(newLoreLine);
                    mainhand.setLore(updatedLore);
                    equipment.setEquipment("Mainhand", mainhand);
                    player.sendMessage(`§aSuccessfully applied Reaper ${romanLevels[level]} to your weapon!`);
                }
                catch (error) {
                    player.sendMessage("§cError applying Reaper: " + (error?.message || error));
                    console.error("Error applying Reaper: " + (error?.stack || error));
                }
            });
            return;
        }
    }
});
// --- SPAWNER-TO-CHEST LINKING SYSTEM ---
// Tracks players who are in chest linking mode: Player Name -> { spawnerKey, dimensionId }
export const playerLinkingState = new Map();
// Auto-cleanup linking state when player leaves the server to prevent stale state memory leaks
world.afterEvents.playerLeave.subscribe((event) => {
    playerLinkingState.delete(event.playerName);
});
/**
 * Puts a player into chest linking mode for a specific spawner.
 */
export function startChestLinking(player, spawnerKey) {
    const spawnerData = spawnerDatabase.read(spawnerKey);
    if (!spawnerData) {
        player.sendMessage("§c[Spawner Link] Error: Spawner not found in database.");
        return;
    }
    playerLinkingState.set(player.name, { spawnerKey, dimensionId: spawnerData.dimensionId });
    player.sendMessage("§d[Spawner Link] Right-click a chest within 15 blocks to link it. Sneak (crouch) to cancel.");
}
/**
 * Removes the linked chest from a spawner.
 */
export function unlinkChest(player, spawnerKey) {
    const spawnerData = spawnerDatabase.read(spawnerKey);
    if (!spawnerData) {
        player.sendMessage("§c[Spawner Link] Error: Spawner not found in database.");
        return;
    }
    delete spawnerData.linkedChest;
    spawnerDatabase.write(spawnerKey, spawnerData);
    player.sendMessage("§e[Spawner Link] Spawner chest unlinked successfully.");
}
// Block interaction listener to intercept clicks and handle linking
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block } = event;
    const key = player.name;
    if (playerLinkingState.has(key)) {
        event.cancel = true; // Intercept block interaction
        // Sneak to cancel linking
        if (player.isSneaking) {
            playerLinkingState.delete(key);
            system.run(() => {
                player.sendMessage("§c[Spawner Link] Linking canceled.");
            });
            return;
        }
        const linkInfo = playerLinkingState.get(key);
        playerLinkingState.delete(key); // Clear state immediately
        system.run(() => {
            // 1. Verify destination block is a container
            const container = block.getComponent("inventory")?.container;
            if (!container) {
                player.sendMessage("§c[Spawner Link] Linking canceled: Clicked block must be a chest or container.");
                return;
            }
            // 2. Verify dimension matches
            if (block.dimension.id !== linkInfo.dimensionId) {
                player.sendMessage("§c[Spawner Link] Linking canceled: Chest must be in the same dimension.");
                return;
            }
            // 3. Parse spawner coordinates from key "x,y,z"
            const [sx, sy, sz] = linkInfo.spawnerKey.split(",").map(Number);
            if (isNaN(sx) || isNaN(sy) || isNaN(sz)) {
                player.sendMessage("§c[Spawner Link] Linking canceled: Invalid spawner coordinates.");
                return;
            }
            // 4. Calculate Euclidean distance (Max 15 blocks)
            const dx = block.x - sx;
            const dy = block.y - sy;
            const dz = block.z - sz;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distance > 15) {
                player.sendMessage(`§c[Spawner Link] Linking canceled: Chest is too far away (${distance.toFixed(1)} blocks). Max distance is 15 blocks.`);
                return;
            }
            // 5. Update database record
            const spawnerData = spawnerDatabase.read(linkInfo.spawnerKey);
            if (!spawnerData) {
                player.sendMessage("§c[Spawner Link] Linking canceled: Spawner database record missing.");
                return;
            }
            spawnerData.linkedChest = {
                x: block.x,
                y: block.y,
                z: block.z,
                dimensionId: block.dimension.id
            };
            spawnerDatabase.write(linkInfo.spawnerKey, spawnerData);
            player.sendMessage(`§a[Spawner Link] Successfully linked spawner to chest at ${block.x}, ${block.y}, ${block.z}!`);
            // 6. Trigger a beautiful particle wave connecting the spawner/mob stack to the chest
            try {
                triggerChestLinkParticles(player, sx, sy, sz, block.x, block.y, block.z, block.dimension.id);
            }
            catch (err) {
                console.error("Error starting linking particles:", err);
            }
        });
    }
});
// Tracks active chest link particle intervals to prevent duplication and allow lifetime extension
const activeParticleIntervals = new Map();
/**
 * Draws a pulsing particle wave from the spawner (or its nearby stacked mob) to the linked chest.
 * Animates a particle path every 8 ticks, terminating automatically after 10 seconds.
 * Reuses active intervals to prevent performance overhead and overlapping particles.
 */
export function triggerChestLinkParticles(player, spawnerX, spawnerY, spawnerZ, chestX, chestY, chestZ, dimensionId) {
    const spawnerKey = `${spawnerX},${spawnerY},${spawnerZ}`;
    // If particles are already showing, simply extend the timer back to 10 seconds
    const existing = activeParticleIntervals.get(spawnerKey);
    if (existing) {
        existing.elapsedTicks = 0;
        return;
    }
    // Resolve the spawner's database typeId (e.g. "mrleefy:zombie_") to target the correct entity type
    let spawnerTypeId = undefined;
    try {
        const spawnerData = spawnerDatabase.read(spawnerKey);
        if (spawnerData && spawnerData.typeId) {
            spawnerTypeId = spawnerData.typeId;
        }
    }
    catch (e) { }
    const dimension = world.getDimension(dimensionId);
    if (!dimension)
        return;
    const tracker = { intervalId: 0, elapsedTicks: 0 };
    const intervalId = system.runInterval(() => {
        tracker.elapsedTicks += 10;
        if (tracker.elapsedTicks > 200) { // Timeout after 10 seconds (200 ticks)
            system.clearRun(tracker.intervalId);
            activeParticleIntervals.delete(spawnerKey);
            return;
        }
        try {
            // Read the current linked chest coordinates from the database dynamically
            const activeSpawnerData = spawnerDatabase.read(spawnerKey);
            if (!activeSpawnerData || !activeSpawnerData.linkedChest) {
                system.clearRun(tracker.intervalId);
                activeParticleIntervals.delete(spawnerKey);
                return;
            }
            const currentChest = activeSpawnerData.linkedChest;
            // Verify that the chest block still exists and is a valid container block (Feature 3 extension)
            const chestBlock = dimension.getBlock({ x: currentChest.x, y: currentChest.y, z: currentChest.z });
            if (!chestBlock || !chestBlock.getComponent('inventory')?.container) {
                system.clearRun(tracker.intervalId);
                activeParticleIntervals.delete(spawnerKey);
                return;
            }
            let start = { x: spawnerX + 0.5, y: spawnerY + 0.5, z: spawnerZ + 0.5 };
            const end = { x: currentChest.x + 0.5, y: currentChest.y + 0.5, z: currentChest.z + 0.5 };
            // Dynamically locate the nearby stacked mob of the correct entity type
            try {
                const entities = dimension.getEntities({
                    location: start,
                    maxDistance: 10
                });
                let closestMob = undefined;
                let minMobDist = 999;
                for (const entity of entities) {
                    if (entity.typeId && entity.typeId.startsWith('mrleefy:') && entity.typeId.includes('still')) {
                        // Strict type matching: if spawner type is known, ensure the entity type matches it
                        if (spawnerTypeId) {
                            const cleanEntity = entity.typeId.toLowerCase().replace('minecraft:', '').replace('mrleefy:', '').replace('still', '').replace(/[^a-z0-9]/g, '');
                            const cleanSpawner = spawnerTypeId.toLowerCase().replace('minecraft:', '').replace('mrleefy:', '').replace('still', '').replace(/[^a-z0-9]/g, '');
                            if (!cleanEntity.includes(cleanSpawner) && !cleanSpawner.includes(cleanEntity)) {
                                continue; // Skip non-matching entity type
                            }
                        }
                        const dx = entity.location.x - start.x;
                        const dy = entity.location.y - start.y;
                        const dz = entity.location.z - start.z;
                        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (d < minMobDist) {
                            minMobDist = d;
                            closestMob = entity;
                        }
                    }
                }
                if (closestMob) {
                    start = { x: closestMob.location.x, y: closestMob.location.y + 1.0, z: closestMob.location.z };
                }
            }
            catch (e) {
                // Fallback to spawner block center
            }
            // Draw animated flowing particles along the line (Feature 2)
            const steps = 5; // Low density steps to keep the line very thin and clean
            const flowOffset = (tracker.elapsedTicks % 40) / 40; // complete cycle every 2.0 seconds
            for (let i = 0; i <= steps; i++) {
                const t = ((i / steps) + flowOffset) % 1.0;
                const px = start.x + (end.x - start.x) * t;
                const py = start.y + (end.y - start.y) * t;
                const pz = start.z + (end.z - start.z) * t;
                dimension.spawnParticle("minecraft:villager_happy", { x: px, y: py, z: pz });
            }
            // Single thin rotating ring of happy villager sparkles hovering above the target chest block (Feature 3)
            const particleCount = 5; // Only 5 points in a single ring to keep it clean and delicate
            const radius = 0.85;
            const rotationOffset = tracker.elapsedTicks * 0.05; // Creates a spinning effect
            for (let j = 0; j < particleCount; j++) {
                const angle = (j / particleCount) * Math.PI * 2 + rotationOffset;
                const ox = Math.cos(angle) * radius;
                const oz = Math.sin(angle) * radius;
                // Spawn a single ring shifted upward to hover over the chest block top
                dimension.spawnParticle("minecraft:villager_happy", { x: end.x + ox, y: end.y + 0.35, z: end.z + oz });
            }
        }
        catch (err) {
            // Cancel interval if dimension becomes unloaded
            system.clearRun(tracker.intervalId);
            activeParticleIntervals.delete(spawnerKey);
        }
    }, 10); // Run every 10 ticks (~0.5s) to allow old endrod particles to fade before new ones spawn!
    tracker.intervalId = intervalId;
    activeParticleIntervals.set(spawnerKey, tracker);
}
