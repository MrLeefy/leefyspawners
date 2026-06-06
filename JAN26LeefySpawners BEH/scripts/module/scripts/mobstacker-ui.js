// mobstacker-ui.js

import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { Database } from "./database";
import { LootManager } from './loot_table.js';
import { cooldowns, spawnerDatabase } from "./levelsystem.js"; // <-- CORRECTLY IMPORTED COOLDOWNS AND DATABASE
import { validMobs, configDatabase, xpDropDatabase, spawnerStatistics, calculateSpawnerTotals, performanceMetrics, getMemoryUsage, saveSpawnerStatistics, loadSpawnerStatistics, resetSpawnerStatistics, getPlayerTopKills, ACTIVE_CHUNKS, enableLogging, disableLogging, isLoggingEnabled, debugLog } from "./mobstacker-core.js";
import { securityService } from "./security-service.js";
import { UI, ERROR_MESSAGES, ENTITIES } from "./constants.js";

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

// Initialize AA values if database is empty
try {
  if (aaDatabase.keys().length === 0) {
    Object.entries(defaultAAValues).forEach(([range, data]) => {
      try {
        aaDatabase.write(range, data);
      } catch (error) {
        console.error(`Failed to write AA value for range ${range}:`, error);
      }
    });
  }
} catch (error) {
  console.error("Failed to initialize AA database:", error);
}

const aaLookup = Array.from({ length: 33 }, () => ({ qty: 0, speed: 0, maxStack: 100 }));

export function rebuildAALookup() {
  try {
    aaLookup.fill({ qty: 0, speed: 0, maxStack: 100 });
    aaDatabase.forEach((range, value) => {
      if (!value) return;
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
    // Fallback to default values
    Object.entries(defaultAAValues).forEach(([range, data]) => {
      const [min, max] = range.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        for (let lvl = min; lvl <= max && lvl < aaLookup.length; lvl++) {
          aaLookup[lvl] = data;
        }
      }
    });
  }
}
rebuildAALookup();

export function getAAValueForLevel(level) {
    return aaLookup[level] || { qty: 0, speed: 0, maxStack: 100 };
}


// --- ADMIN UI & EVENT LISTENERS ---

world.afterEvents.itemUse.subscribe(event => {
  const { source, itemStack } = event;
  if (itemStack.typeId === "minecraft:blaze_rod" && source.hasTag("admin")) {
    openAdminMenu(source);
  }
});

world.beforeEvents.chatSend.subscribe(event => {
  const { sender, message } = event;
  if (message.trim() === "-help") {
      event.cancel = true;
      sender.sendMessage("Test help message from mobstacker-ui.js.");
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

    // Admin access - no rate limiting for administrators

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
      .button(isLoggingEnabled() ? "Disable Logging" : "Enable Logging", "textures/items/paper");
    form.show(player).then((r) => {
      if (r.canceled) return;

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
        commandValidation.warnings.forEach(warning => {
          console.warn(`Admin action warning for ${player.name}: ${warning}`);
        });
      }

      switch (r.selection) {
        case 0: openAAConfigForm(player); break;
        case 1: openLootTableConfigForm(player); break;
        case 2: openRadiusConfigForm(player); break;
        case 3: openToggleLootDropForm(player); break;
        case 4: openPerformanceConfigForm(player); break;
        case 5: openSpawnerStatisticsForm(player); break;
        case 6: openSpawnerTeleportForm(player); break;
        case 7: verifyAndCleanSpawnerDatabase(player); break;
        case 8: toggleLogging(player); break;
      }

      securityService.logSecurityEvent('admin_action_executed', player, {
        action: `selection_${r.selection}`,
        warnings: commandValidation.warnings.length
      });

    }).catch((error) => {
        console.error(`Error in openAdminMenu: ${error}`);
        player.sendMessage("§cAn error occurred while opening the admin menu.");
        securityService.recordError('admin_menu_error', error.message);
    }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
        cooldowns.set(player.name, Date.now());
    });
}

function openToggleLootDropForm(player) {
  if (!player || !player.isValid) return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const currentCap = configDatabase.read("itemSpillCap") || 5;
  const currentXpCap = configDatabase.read("xpSpillCap") || 3;
  const playerKillOnly = configDatabase.read("playerKillOnly") ?? false;
  
  new ModalFormData()
    .title("Loot Drop Rules")
    .toggle("Player Kills Only (Lag Protection)", {defaultValue: playerKillOnly})
    .textField("Max item drops near stack:", "Enter integer (>=1)", { defaultValue: `${currentCap}`})
    .textField("Max XP orbs near stack:", "Enter integer (>=1)", { defaultValue: `${currentXpCap}`})
    .show(player).then((r) => {
        if (r.canceled || !r.formValues) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        configDatabase.write("playerKillOnly", r.formValues[0]);
        const capInput = parseInt(r.formValues[1]);
        if (!isNaN(capInput) && capInput >= 1) configDatabase.write("itemSpillCap", capInput);
        const xpCapInput = parseInt(r.formValues[2]);
        if (!isNaN(xpCapInput) && xpCapInput >= 1) configDatabase.write("xpSpillCap", xpCapInput);
        player.sendMessage(`§aLoot drop rules updated!`);
    }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
        cooldowns.set(player.name, Date.now());
    });
}

function openPerformanceConfigForm(player) {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    // Input validation
    if (!player || !player.isValid) {
        console.error("Invalid player provided to openPerformanceConfigForm");
        return;
    }

    // Read current performance settings from database (or use defaults)
    const currentActivationRadius = configDatabase.read("performanceActivationRadius") || 50;
    const currentMaxSpawns = configDatabase.read("performanceMaxSpawns") || 25;
    const currentRandomDelay = configDatabase.read("performanceRandomDelay") ?? true;
    const currentSpawnInterval = configDatabase.read("performanceSpawnInterval") || 20;

    const form = new ModalFormData()
        .title("Performance Settings")
        .textField(
            "§bPlayer Activation Radius:§r\n\n" +
            "§7Distance (in blocks) players must be within to activate spawners.\n" +
            "§7Lower = Better performance (spawners pause sooner)\n" +
            "§7Higher = Spawners active from further away\n" +
            "§eDefault: 50 blocks§r",
            "Enter radius (10-128)", 
            { defaultValue: `${currentActivationRadius}` }
        )
        .textField(
            "§bMax Spawns Per Cycle:§r\n\n" +
            "§7Maximum entities that can spawn per second.\n" +
            "§7Lower = Smoother performance, slower spawning\n" +
            "§7Higher = Faster spawning, potential lag spikes\n" +
            "§eDefault: 25 spawns/second§r",
            "Enter max spawns (5-100)", 
            { defaultValue: `${currentMaxSpawns}` }
        )
        .toggle(
            "§bRandom Initial Spawn Delays:§r\n\n" +
            "§7Randomizes first spawn time (0-100% of interval).\n" +
            "§7Prevents all spawners from syncing up.\n" +
            "§aRecommended: Enabled§r",
            { defaultValue: currentRandomDelay }
        )
        .textField(
            "§bSpawn Check Interval (Advanced):§r\n\n" +
            "§7How often (in ticks) to check spawners.\n" +
            "§7Lower = More responsive, higher CPU usage\n" +
            "§7Higher = More efficient, less responsive\n" +
            "§c⚠ Only change if you know what you're doing!\n" +
            "§eDefault: 20 ticks (1 second)§r",
            "Enter ticks (10-100)", 
            { defaultValue: `${currentSpawnInterval}` }
        );

    form.show(player).then((r) => {
        if (r.canceled || !r.formValues) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        // Parse and validate inputs
        const activationRadius = parseInt(r.formValues[0]);
        const maxSpawns = parseInt(r.formValues[1]);
        const randomDelay = r.formValues[2];
        const spawnInterval = parseInt(r.formValues[3]);

        let updated = false;
        let warnings = [];

        // Validate and save activation radius
        if (!isNaN(activationRadius) && activationRadius >= 10 && activationRadius <= 128) {
            configDatabase.write("performanceActivationRadius", activationRadius);
            updated = true;
        } else {
            warnings.push("§eInvalid activation radius - must be between 10-128 blocks");
        }

        // Validate and save max spawns
        if (!isNaN(maxSpawns) && maxSpawns >= 5 && maxSpawns <= 100) {
            configDatabase.write("performanceMaxSpawns", maxSpawns);
            updated = true;
        } else {
            warnings.push("§eInvalid max spawns - must be between 5-100");
        }

        // Save random delay toggle
        configDatabase.write("performanceRandomDelay", randomDelay);
        updated = true;

        // Validate and save spawn interval (with warning for low values)
        if (!isNaN(spawnInterval) && spawnInterval >= 10 && spawnInterval <= 100) {
            configDatabase.write("performanceSpawnInterval", spawnInterval);
            if (spawnInterval < 20) {
                warnings.push("§c⚠ Low spawn interval may increase CPU usage!");
            }
            updated = true;
        } else {
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
    // Input validation
    if (!player || !player.isValid) {
        console.error("Invalid player provided to openRadiusConfigForm");
        return;
    }

    const radius = configDatabase.read("stackRadius") || 50;
  new ModalFormData()
    .title("Configure Stack Radius")
    .textField("Stacking Radius:", `Current: ${radius}`, { defaultValue: `${radius}` })
            .show(player).then((r) => {
            if (r.canceled || !r.formValues) return;

            // Security validation
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                securityService.logSecurityEvent('unauthorized_config_change', player, {
                    configType: 'radius'
                });
                return;
            }

            // Admin config access - no rate limiting for administrators

            const newRadius = parseInt(r.formValues[0]);
            if (!isNaN(newRadius) && newRadius > 0 && newRadius <= 100) {
                configDatabase.write("stackRadius", newRadius);
                player.sendMessage(`§aStacking radius updated to ${newRadius}!`);
                securityService.logSecurityEvent('config_updated', player, {
                    configType: 'stackRadius',
                    oldValue: UI.DEFAULT_STACK_RADIUS,
                    newValue: newRadius
                });
            } else {
                player.sendMessage(ERROR_MESSAGES.INVALID_RADIUS);
                securityService.logSecurityEvent('invalid_config_value', player, {
                    configType: 'stackRadius',
                    attemptedValue: r.formValues[0]
                });
            }
        }).catch((error) => {
            console.error(`Error in openRadiusConfigForm: ${error}`);
            player.sendMessage("§cAn error occurred while updating the configuration.");
            securityService.recordError('radius_config_error', error.message);
        }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
            cooldowns.set(player.name, Date.now());
        });
}

function openLootTableConfigForm(player) {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const form = new ActionFormData()
        .title("Loot Table Configuration")
        .body("Select an entity to configure its loot table:");
    const sortedMobs = [...validMobs].sort((a, b) => a.displayName.localeCompare(b.displayName));
    sortedMobs.forEach(mob => {
        let icon = mob.displayName.toLowerCase().replace(/ /g, '_');
        if (icon === "wither_skeleton") icon = "witherskeleton";
        form.button(`Spawner ${mob.displayName}`, `textures/blocks/icons/${icon}.png`);
    });
    form.show(player).then(r => {
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        if (!r.canceled) openEntityLootConfigForm(player, sortedMobs[r.selection].typeId);
    }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
        cooldowns.set(player.name, Date.now());
    });
}

function openEntityLootConfigForm(player, entityId) {
    if (!player || !player.isValid) return;
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
    form.show(player).then(r => {
        if (r.canceled) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const itemCount = Object.keys(table).length;
        if (r.selection < itemCount) openEditLootItemForm(player, entityId, Object.keys(table)[r.selection]);
        else if (r.selection === itemCount) openAddNewLootItemForm(player, entityId);
        else if (r.selection === itemCount + 1) openXPDropManagerForm(player, entityId);
    }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
        cooldowns.set(player.name, Date.now());
    });
}

function openXPDropManagerForm(player, entityId) {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const config = xpDropDatabase.read(entityId) || {};
    new ModalFormData()
        .title(`XP Manager: ${entityId}`)
        .textField("XP Amount:", "XP to drop on death", { defaultValue: `${config.amount ?? 1}` })
        .slider("Drop Chance (%)", 1, 100, { defaultValue: config.chance ?? 100 })
        .show(player).then(r => {
            if (r.canceled || !r.formValues) return;
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
            } else player.sendMessage("§cInvalid amount.");
            openEntityLootConfigForm(player, entityId);
        }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
            cooldowns.set(player.name, Date.now());
        });
}

function openAddNewLootItemForm(player, entityId) {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const lootManager = LootManager;
    const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
    new ModalFormData()
        .title(`Add Loot: ${entityId}`)
        .textField("Item ID:", "e.g., minecraft:diamond", { defaultValue: "" })
        .textField("Chance:", "[0.01-100]", { defaultValue: "100" })
        .toggle("Enchantable?", { defaultValue: false })
        .dropdown("Enchantment Category:", categories, { defaultValue: 0 })
        .textField("Enchant Chance:", "[0-100]", { defaultValue: "50" })
        .toggle("Stackable?", { defaultValue: true })
        .toggle("Random Durability?", { defaultValue: false })
        .show(player).then(r => {
            if (r.canceled || !r.formValues) return;
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            const [id, chance, ench, catIdx, enchChance, stack, dura] = r.formValues;
            const pChance = parseFloat(chance);
            if (!id || isNaN(pChance)) { player.sendMessage("§cInvalid Item ID or Chance."); return; }
            if(!lootManager.entities[entityId]) lootManager.entities[entityId] = {};
            lootManager.entities[entityId][id] = {
                chance: pChance,
                enchantments: (ench && categories[catIdx] !== "None") ? { chance: parseFloat(enchChance), category: categories[catIdx] } : undefined,
                stackable: stack,
                randomdurability: dura,
            };
            lootManager.saveLootTable(entityId);
            player.sendMessage(`§aAdded ${id} to ${entityId}'s loot table.`);
            openEntityLootConfigForm(player, entityId);
        }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
            cooldowns.set(player.name, Date.now());
        });
}

function openEditLootItemForm(player, entityId, itemId) {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const lootManager = LootManager;
    const config = lootManager.entities[entityId][itemId];
    const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
    const catIdx = config.enchantments ? categories.indexOf(config.enchantments.category) : 0;
    new ModalFormData()
        .title(`Editing: ${itemId}`)
        .textField("Chance:", "[0.01-100]", { defaultValue: `${config.chance}` })
        .toggle("Enchantable?", { defaultValue: !!config.enchantments })
        .dropdown("Category:", categories, { defaultValue: Math.max(0, catIdx) })
        .textField("Enchant Chance:", "[0-100]", { defaultValue: `${config.enchantments?.chance ?? 50}` })
        .toggle("Stackable?", { defaultValue: config.stackable !== false })
        .toggle("Random Durability?", { defaultValue: config.randomdurability === true })
        .toggle("§cDELETE THIS ITEM?§r", { defaultValue: false })
        .show(player).then(r => {
            if (r.canceled || !r.formValues) return;
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            const [chance, ench, catIdx, enchChance, stack, dura, del] = r.formValues;
            if (del) delete lootManager.entities[entityId][itemId];
            else {
                const pChance = parseFloat(chance);
                if (isNaN(pChance)) { player.sendMessage("§cInvalid Chance."); return; }
                config.chance = pChance;
                config.enchantments = (ench && categories[catIdx] !== "None") ? { chance: parseFloat(enchChance), category: categories[catIdx] } : undefined;
                config.stackable = stack;
                config.randomdurability = dura;
            }
            lootManager.saveLootTable(entityId);
            player.sendMessage(`§aLoot table for ${entityId} updated.`);
            openEntityLootConfigForm(player, entityId);
        }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
            cooldowns.set(player.name, Date.now());
        });
}

function openAAConfigForm(player) {
    // Security validation
    if (!player || !player.isValid) {
        console.error(ERROR_MESSAGES.INVALID_PLAYER);
        return;
    }

    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        securityService.logSecurityEvent('unauthorized_aa_config', player);
        return;
    }

    // Admin AA config access - no rate limiting for administrators

    const form = new ModalFormData().title("Spawner Settings");
    const entries = [];
    aaDatabase.forEach((key, val) => entries.push([key, val]));
    
    form.textField("Add New Range:", "e.g., 1-10 or 33-33", { defaultValue: "" });
    form.textField("New Range - Quantity:", "e.g., 1", { defaultValue: "" });
    form.textField("New Range - Speed (sec):", "e.g., 10", { defaultValue: "" });
    form.textField("New Range - Max Stack:", "e.g., 100", { defaultValue: "" });

    entries.forEach(([range, {qty, speed, maxStack}]) => {
        form.textField(`Qty for ${range}:`, `Update`, { defaultValue: `${qty}` });
        form.textField(`Speed for ${range}:`, `Update`, { defaultValue: `${speed}` });
        form.textField(`Max Stack for ${range}:`, `Update`, { defaultValue: `${maxStack}` });
        form.toggle(`§cRemove Range ${range}?§r`, { defaultValue: false });
    });

    form.show(player).then(r => {
        if (r.canceled || !r.formValues) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const vals = r.formValues;

        if (vals[0].trim()) {
            let range = vals[0].trim();
            if (!range.includes("-")) range = `${range}-${range}`;
            aaDatabase.write(range, {
                qty: Math.max(1, parseInt(vals[1]) || 1),
                speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseInt(vals[2]) || 10)),
                maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseInt(vals[3]) || 100)),
            });
        }

        let offset = 4;
        entries.forEach(([range]) => {
            if (vals[offset + 3]) aaDatabase.delete(range);
            else aaDatabase.write(range, {
                qty: Math.max(1, parseInt(vals[offset]) || 1),
                speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseInt(vals[offset + 1]) || 10)),
                maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseInt(vals[offset + 2]) || 100)),
            });
            offset += 4;
        });

        rebuildAALookup();
        player.sendMessage("§aSpawner settings updated!");
    }).finally(() => { // <-- COOLDOWN FUNCTIONALITY RESTORED
        cooldowns.set(player.name, Date.now());
    });
}

// Logging Toggle Function
function toggleLogging(player) {
    try {
        // Input validation
        if (!player || !player.isValid) {
            console.error("Invalid player provided to toggleLogging");
            return;
        }

        // Security validation
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        // Toggle logging state
        if (isLoggingEnabled()) {
            disableLogging();
            player.sendMessage("§cLogging has been disabled for all spawner activities.");
        } else {
            enableLogging();
            player.sendMessage("§aLogging has been enabled for all spawner activities.");
        }

        // Reopen admin menu to update button text
        system.run(() => openAdminMenu(player));

    } catch (error) {
        console.error(`Error in toggleLogging: ${error}`);
        player.sendMessage("§cAn error occurred while toggling logging.");
    }
}

// Spawner Statistics Form
function openSpawnerStatisticsForm(player) {
    try {
        // Input validation
        if (!player || !player.isValid) {
            console.error("Invalid player provided to openSpawnerStatisticsForm");
            return;
        }

        // Security validation
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        // Always load database data to merge with local data for complete historical view
        debugLog("[MOBSTACKER] Loading database stats to merge with local data");
        loadSpawnerStatistics();

        // Log what we have after loading
        debugLog(`Stats available: ${spawnerStatistics.entitiesKilled.size} entities, ${spawnerStatistics.playerStats.size} players`);

        calculateSpawnerTotals();

        // Calculate basic stats (already filtered to spawner entities only)
        const totalKills = Array.from(spawnerStatistics.entitiesKilled.values()).reduce((sum, kills) => sum + kills, 0);
        const activePlayers = spawnerStatistics.playerStats.size;
        const totalKillsFormatted = totalKills.toLocaleString();

        // Format uptime in human-readable format
        const uptimeMinutes = Math.floor((Date.now() - (performanceMetrics.lastReset || Date.now())) / 1000 / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeDisplay = uptimeHours > 0 ?
            `${uptimeHours}h ${uptimeMinutes % 60}m` :
            `${uptimeMinutes}m`;

        // Server Load: Based on entities per spawner (higher ratio = more active spawners)
        // Formula: (entities/spawners) * 25 = load percentage
        // Example: 4 entities per spawner = 4 * 25 = 100% load
        const serverLoad = spawnerStatistics.totalSpawners > 0 ?
            Math.min(100, Math.max(0, (spawnerStatistics.totalEntities / spawnerStatistics.totalSpawners) * 25)).toFixed(1) : '0';

        // Calculate tick efficiency (Minecraft = 20 TPS = 50ms per tick)
        const minecraftTickTime = 50; // ms per tick at 20 TPS
        const tickEfficiency = performanceMetrics.averageProcessingTime > 0 ?
            Math.min(100, (performanceMetrics.averageProcessingTime / minecraftTickTime) * 100).toFixed(1) : '0';

        // Get memory usage estimate (primarily based on active chunks)
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

        // Get top 10 most killed mobs (already filtered to spawner entities)
        const topMobs = Array.from(spawnerStatistics.entitiesKilled.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        // Get top 10 players by kills
        const topPlayers = Array.from(spawnerStatistics.playerStats.entries())
            .sort(([,a], [,b]) => (b.entitiesKilled || 0) - (a.entitiesKilled || 0))
            .slice(0, 10);

        // Build the statistics body
        let bodyText = `§6§lSERVER STATISTICS§r\n\n`;
        bodyText += `§bSpawner Blocks Placed: §f${spawnerStatistics.totalSpawners.toLocaleString()}\n`;
        bodyText += `§bEntities Spawned (Total): §f${spawnerStatistics.totalEntities.toLocaleString()}\n`;
        bodyText += `§bActive Players: §f${activePlayers}\n`;
        bodyText += `§bChunks Loaded (Spawner Activity): §f${ACTIVE_CHUNKS.size}\n`;
        bodyText += `§bServer Load: §f${serverLoad}%\n`;
        bodyText += `§bTotal Kills: §f${totalKillsFormatted}\n`;
        bodyText += `§bServer Uptime: §f${uptimeDisplay}\n`;
        bodyText += `§bMemory Usage: §f${memoryLevel} (${memoryUsage.toLocaleString()} units)\n`;
        bodyText += `§bTick Usage: §f${tickEfficiency}% (${performanceMetrics.averageProcessingTime.toFixed(2)}ms)\n\n`;

        // Top 10 Most Killed Mobs
        bodyText += `§6§lTOP 10 MOST KILLED MOBS§r\n`;
        if (topMobs.length > 0) {
            topMobs.forEach((mob, index) => {
                const mobName = getMobDisplayName(mob[0]) || 'Unknown';
                const rank = index + 1;
                bodyText += `§7${rank}. §f${mobName} §7(${mob[1].toLocaleString()} kills)\n`;
            });
        } else {
            bodyText += `§7No kills recorded yet\n`;
        }
        bodyText += `\n`;

        // Top 10 Killers (Players)
        bodyText += `§6§lTOP 10 KILLERS§r\n`;
        if (topPlayers.length > 0) {
            topPlayers.forEach((player, index) => {
                const rank = index + 1;
                const totalKills = player[1].entitiesKilled?.toLocaleString() || 0;
                bodyText += `§7${rank}. §f${player[0]} §7(${totalKills} total kills)\n`;

                // Show top 3 entity types killed by this player
                const playerTopKills = getPlayerTopKills(player[1], 3);
                playerTopKills.forEach(killType => {
                    bodyText += `   §8- §7${killType.displayName}: ${killType.count.toLocaleString()}\n`;
                });
                bodyText += `\n`;
            });
        } else {
            bodyText += `§7No player kills recorded yet\n`;
        }

        const form = new ActionFormData()
            .title("§8Spawner Server Statistics")
            .body(bodyText)
            .button("§cClose")
            .button("View Player Stats")
            .button("Reset All Statistics");

        form.show(player).then((response) => {
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (response.canceled || response.selection === 0) return; // Close button

            if (response.selection === 1) { // View Player Stats button
                openPlayerStatsSelectionForm(player);
                return;
            }

            if (response.selection === 2) { // Reset Statistics button
                // Show confirmation form
                const confirmForm = new ModalFormData()
                    .title("Confirm Reset")
                    .textField("Confirm", "Type 'RESET' to confirm", { defaultValue: "" })
                    .submitButton("CONFIRM");

                confirmForm.show(player).then((confirmResponse) => {
                    // Re-validate permission inside .then() to prevent session-tag-revocation bypass
                    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                        return;
                    }
                    if (!confirmResponse.canceled) {
                        const confirmationText = confirmResponse.formValues[0]?.toUpperCase().trim();
                        if (confirmationText === "RESET") {
                            // Confirmed reset
                            resetSpawnerStatistics();
                            player.sendMessage("All statistics have been reset!");
                            // Reopen the form to show empty stats
                            system.run(() => openSpawnerStatisticsForm(player));
                        } else if (confirmationText && confirmationText !== "") {
                            player.sendMessage("Reset cancelled - confirmation text was incorrect.");
                        }
                    }
                }).catch((error) => {
                    console.error(`Error in reset confirmation: ${error}`);
                });
            }
        }).catch((error) => {
            console.error(`Error in openSpawnerStatisticsForm: ${error}`);
            player.sendMessage("§cAn error occurred while opening the statistics form.");
        });

    } catch (error) {
        console.error(`Critical error in openSpawnerStatisticsForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

// Spawner Teleportation System - Enhanced Navigation
function openSpawnerTeleportForm(player) {
    try {
        // Input validation
        if (!player || !player.isValid) {
            console.error("Invalid player provided to openSpawnerTeleportForm");
            return;
        }

        // Security validation
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        // Scan for any existing spawners not in database (for existing servers)
        scanAndUpdateSpawnerDatabase();

        // Get spawner locations from database by iterating through all keys
        const playerSpawners = new Map();
        const allSpawners = {}; // Object for location search
        const allSpawnerKeys = spawnerDatabase.keys();

        // Group spawners by player and calculate statistics
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

                // Also store in allSpawners object for location search
                allSpawners[key] = spawnerData;
            }
        }

        // Calculate total spawners
        const totalSpawners = Array.from(playerSpawners.values()).reduce((sum, spawners) => sum + spawners.length, 0);

        // Sort players by spawner count (most active first)
        const sortedPlayers = Array.from(playerSpawners.entries())
            .sort(([,a], [,b]) => b.length - a.length);

        // Check current player
        const currentPlayerName = player.name || player.nameTag || 'Unknown';
        const hasOwnSpawners = playerSpawners.has(currentPlayerName);

        // Debug logging
        debugLog(`Found ${totalSpawners} total spawners`);
        debugLog(`Players with spawners:`, Array.from(playerSpawners.keys()));
        debugLog(`Current player: ${currentPlayerName}`);
        debugLog(`Current player has spawners: ${hasOwnSpawners}`);

        // Create enhanced player selection form

        const form = new ActionFormData()
            .title(`Teleport to Spawner (${totalSpawners} total)`)
            .body(`Found ${playerSpawners.size} players with spawners${hasOwnSpawners ? ' (including you)' : ''}. Select a player:`);

        // Add "Quick Actions" section
        form.button(" Search by Location", "textures/ui/magnifyingGlass");
        form.button(" Player List", "textures/items/book_normal");

        // "View All Statistics" button removed - already available in admin panel

        form.show(player).then((r) => {
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled) return;

            // Handle special buttons (only 2 buttons now)
            if (r.selection === 0) {
                // Search by location
                openLocationSearchForm(player, allSpawners);
                return;
            } else if (r.selection === 1) {
                // Player list view
                openSimplePlayerListForm(player, sortedPlayers);
                return;
            }
        }).catch((error) => {
            console.error(`Error in openSpawnerTeleportForm: ${error}`);
            player.sendMessage("§cAn error occurred while opening the teleport form.");
        });

    } catch (error) {
        console.error(`Critical error in openSpawnerTeleportForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

// Spawner Selection Form - Enhanced with detailed information and sorting
function openSpawnerSelectionForm(player, playerName, spawners) {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        // Debug: Check spawners array
        debugLog(`openSpawnerSelectionForm called with ${spawners.length} spawners for ${playerName}`);
        spawners.forEach((spawner, index) => {
            debugLog(`Spawner ${index}:`, spawner);
        });

        // Filter out any undefined spawners and calculate enhanced statistics
        const validSpawners = spawners.filter(spawner => spawner !== undefined && spawner !== null);
        debugLog(`After filtering: ${validSpawners.length} valid spawners`);

        const spawnerDetails = validSpawners.map(spawner => {
            // Defensive parsing of location coordinates
            let x = 0, y = 0, z = 0;
            try {
                if (spawner.location && typeof spawner.location === 'string') {
                    const coords = spawner.location.split(',').map(coord => parseFloat(coord.trim()));
                    if (coords.length >= 3 && coords.every(coord => !isNaN(coord))) {
                        [x, y, z] = coords;
                    }
                }
            } catch (error) {
                debugLog(`Error parsing location for spawner: ${spawner.location}, error: ${error}`);
            }

            const typeId = spawner.typeId || 'unknown_spawner';
            const levelMatch = typeId.match(/spawner(\d+)/);
            const level = levelMatch ? parseInt(levelMatch[1]) : 1;

            const mobType = typeId.replace('mrleefy:', '').replace(/spawner\d+/, '').replace(/_/g, '');
            const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || 'Unknown';
            const activeEntities = countEntitiesNearSpawner(x, y, z);

            // Calculate distance from player
            const playerLoc = player.location;
            let distance = 0;
            if (playerLoc) {
                distance = Math.sqrt(
                    Math.pow(x - playerLoc.x, 2) +
                    Math.pow(y - playerLoc.y, 2) +
                    Math.pow(z - playerLoc.z, 2)
                );
            }

            // Calculate efficiency (entities per level)
            const efficiency = level > 0 ? (activeEntities / level * 100).toFixed(0) : '0';

            return {
                ...spawner,
                displayName,
                level,
                activeEntities,
                distance: Math.floor(distance),
                efficiency: parseInt(efficiency),
                x, y, z
            };
        });

        // Sort by distance (closest first)
        spawnerDetails.sort((a, b) => a.distance - b.distance);

        const totalEntities = spawnerDetails.reduce((sum, s) => sum + (s.activeEntities || 0), 0);
        const avgLevel = spawnerDetails.length > 0 ?
            spawnerDetails.reduce((sum, s) => sum + (s.level || 1), 0) / spawnerDetails.length : 0;

        const form = new ActionFormData()
            .title(`Spawners Placed by ${playerName} (${spawners.length} total)`)
            .body(`${playerName} has placed ${spawners.length} spawner(s).\nTotal Entities: ${totalEntities} • Average Level: ${avgLevel.toFixed(1)}\n\nSelect a spawner to teleport:`);

        for (const detail of spawnerDetails) {
            try {
                const status = (detail.activeEntities || 0) > 0 ? '[ACTIVE]' : '[IDLE]';
                const placedTime = detail.hasOwnProperty('placedAt') && detail.placedAt ?
                    new Date(detail.placedAt).toLocaleDateString() : 'Unknown';

                const buttonText = `${status} ${detail.displayName || 'Unknown'} L${detail.level || 1} (${detail.efficiency || 0}% efficient)\nLocation: ${detail.x || 0},${detail.y || 0},${detail.z || 0} • ${detail.distance || 0} blocks • ${detail.activeEntities || 0} entities\nPlaced: ${placedTime}`;

                form.button(buttonText, "textures/blocks/mob_spawner");
            } catch (buttonError) {
                console.error(`Error creating button for spawner at ${detail?.x},${detail?.y},${detail?.z}:`, buttonError);
                // Create a fallback button
                form.button(`Spawner at ${detail?.x || 0},${detail?.y || 0},${detail?.z || 0}`, "textures/blocks/mob_spawner");
            }
        }

        // Add info button at the end
        form.button("Spawner Information", "textures/ui/infobulb");

        form.show(player).then((r) => {
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled) return;

            // Check if info button was clicked
            if (r.selection === spawnerDetails.length) {
                // Show general info about this player's spawners
                openSpawnerInfoForm(player, playerName, spawnerDetails);
                return;
            }

            const selectedDetail = spawnerDetails[r.selection];
            if (selectedDetail && typeof selectedDetail.x === 'number' && typeof selectedDetail.y === 'number' && typeof selectedDetail.z === 'number') {
                teleportToSpawner(player, selectedDetail.x, selectedDetail.y, selectedDetail.z);
            } else {
                debugLog(`Invalid spawner detail selected:`, selectedDetail);
                player.sendMessage("§cInvalid spawner data - cannot teleport.");
            }
        }).catch((error) => {
            console.error(`Error in openSpawnerSelectionForm: ${error}`);
            player.sendMessage("§cAn error occurred while selecting spawner.");
        });

    } catch (error) {
        console.error(`Critical error in openSpawnerSelectionForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

// Teleport player to spawner location +1 Y for safety, centered on block
function teleportToSpawner(player, x, y, z) {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        // Validate coordinates
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' ||
            isNaN(x) || isNaN(y) || isNaN(z)) {
            console.error(`Invalid coordinates provided to teleportToSpawner: x=${x}, y=${y}, z=${z}`);
            player.sendMessage("§cInvalid spawner location - cannot teleport.");
            return;
        }

        // Teleport to spawner location +1 Y to avoid spawning inside the block
        // Add 0.5 to X and Z to center on the block instead of edge
        const teleportLocation = { x: x + 0.5, y: y + 1, z: z + 0.5 };

        // Use system.run for proper privilege handling
        system.run(() => {
            try {
                player.teleport(teleportLocation);
                player.sendMessage(`§aTeleported to spawner at ${x}, ${y + 1}, ${z}`);
            } catch (teleportError) {
                console.error(`Teleport error: ${teleportError}`);
                player.sendMessage("§cFailed to teleport to spawner location.");
            }
        });
    } catch (error) {
        console.error(`Critical error in teleportToSpawner: ${error}`);
        player.sendMessage("§cA critical error occurred during teleport.");
    }
}

// Helper function to count entities near a spawner
function countEntitiesNearSpawner(x, y, z) {
    try {
        const overworld = world.getDimension('overworld');
        const nearbyEntities = overworld.getEntities({
            location: { x, y, z },
            maxDistance: 10 // Check within 10 blocks of spawner
        });

        // Count only stacked entities (those with our naming convention)
        return nearbyEntities.filter(entity => {
            return entity?.nameTag && entity.nameTag.includes('x') && entity.typeId.startsWith('mrleefy:');
        }).length;
    } catch (error) {
        console.error(`Error counting entities near spawner: ${error}`);
        return 0;
    }
}

// Location Search Form - Find spawners by coordinates
function openLocationSearchForm(player, allSpawners) {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const playerX = Math.floor(player.location.x);
        const playerZ = Math.floor(player.location.z);

        const form = new ModalFormData()
            .title("Search Spawners by Location")
            .toggle("Use current location", { defaultValue: true })
            .textField("X Coordinate", "Enter X coordinate", { defaultValue: playerX.toString() })
            .textField("Z Coordinate", "Enter Z coordinate", { defaultValue: playerZ.toString() })
            .slider("Search Radius", 10, 500, { defaultValue: 50 })
            .toggle("Include inactive spawners", { defaultValue: true });

        form.show(player).then((r) => {
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || !r.formValues) return;

            const useCurrentLocation = r.formValues[0];
            const enteredX = r.formValues[1];
            const enteredZ = r.formValues[2];
            const radius = r.formValues[3];
            const includeInactive = r.formValues[4];

            // Use current location or entered coordinates
            const searchX = useCurrentLocation ? playerX : parseInt(enteredX);
            const searchZ = useCurrentLocation ? playerZ : parseInt(enteredZ);

            // Debug logging
            debugLog(`Location search: useCurrent=${useCurrentLocation}, enteredX=${enteredX}, enteredZ=${enteredZ}, searchX=${searchX}, searchZ=${searchZ}, radius=${radius}`);

            if (isNaN(searchX) || isNaN(searchZ)) {
                player.sendMessage("§cInvalid coordinates provided.");
                return;
            }

            // Find spawners within radius
            const nearbySpawners = [];
            debugLog(`Searching for spawners - allSpawners keys: ${Object.keys(allSpawners).length}`);

            for (const [location, data] of Object.entries(allSpawners)) {
                try {
                    const [x, y, z] = location.split(',').map(Number);
                    const distance = Math.sqrt(Math.pow(x - searchX, 2) + Math.pow(z - searchZ, 2));

                    if (distance <= radius) {
                        const entityCount = countEntitiesNearSpawner(x, y, z);
                        if (includeInactive || entityCount > 0) {
                            nearbySpawners.push({
                                location,
                                data,
                                distance: Math.floor(distance),
                                entityCount
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error processing spawner at ${location}: ${error}`);
                }
            }

            // Sort by distance
            nearbySpawners.sort((a, b) => a.distance - b.distance);

            if (nearbySpawners.length === 0) {
                player.sendMessage(`§cNo spawners found within ${radius} blocks of ${searchX}, ${searchZ}.`);
                return;
            }

            // Show results
            openLocationResultsForm(player, nearbySpawners, searchX, searchZ, radius);

        }).catch((error) => {
            console.error(`Error in openLocationSearchForm: ${error}`);
            player.sendMessage("§cAn error occurred while searching.");
        });

    } catch (error) {
        console.error(`Critical error in openLocationSearchForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

// Location Results Form - Show search results
function openLocationResultsForm(player, spawners, searchX, searchZ, radius) {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        // Filter out spawners with invalid data and create valid spawners array
        const validSpawners = [];

        for (const spawner of spawners) {
            try {
                const [x, y, z] = spawner.location.split(',').map(Number);
                const typeId = spawner.data?.typeId || spawner.typeId;

                if (!typeId) {
                    debugLog(`Skipping spawner at ${spawner.location} - missing typeId`);
                    continue;
                }

                const levelMatch = typeId.match(/spawner(\d+)/);
                const level = levelMatch ? levelMatch[1] : '1';

                const mobType = typeId.replace('mrleefy:', '').replace(/spawner\d+/, '').replace(/_/g, '');
                const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || 'Unknown';

                const status = spawner.entityCount > 0 ? '[ACTIVE]' : '[IDLE]';
                const placedBy = spawner.data?.placedBy || spawner.placedBy || 'Unknown';

                validSpawners.push({
                    ...spawner,
                    x, y, z,
                    typeId,
                    level,
                    displayName,
                    status,
                    placedBy
                });

            } catch (error) {
                debugLog(`Error processing spawner ${spawner.location}: ${error}`);
                // Skip this spawner and continue with others
            }
        }

        if (validSpawners.length === 0) {
            player.sendMessage(`§cNo valid spawners found within ${radius} blocks of ${searchX}, ${searchZ}.`);
            return;
        }

        // Create form with valid spawners only
        const form = new ActionFormData()
            .title(`Spawners near ${searchX}, ${searchZ} (Radius: ${radius})`)
            .body(`Found ${validSpawners.length} valid spawner(s):`);

        for (const validSpawner of validSpawners) {
            const buttonText = `${validSpawner.status} ${validSpawner.displayName} Level ${validSpawner.level} (${validSpawner.x},${validSpawner.z}) - ${validSpawner.distance} blocks away`;
            form.button(buttonText, "textures/blocks/mob_spawner");
        }

        form.show(player).then((r) => {
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled) return;

            const selectedSpawner = validSpawners[r.selection];
            if (selectedSpawner) {
                teleportToSpawner(player, selectedSpawner.x, selectedSpawner.y, selectedSpawner.z);
            }
        }).catch((error) => {
            console.error(`Error in openLocationResultsForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing results.");
        });

    } catch (error) {
        console.error(`Critical error in openLocationResultsForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

// Helper function to get mob display name
function getMobDisplayName(entityTypeId) {
    const nameMap = {
        'mrleefy:blazestill': 'Blaze',
        'mrleefy:cowstill': 'Cow',
        'mrleefy:sheepstill': 'Sheep',
        'mrleefy:pigstill': 'Pig',
        'mrleefy:chickenstill': 'Chicken',
        'mrleefy:emeraldgolemstill': 'Emerald Golem',
        'mrleefy:netheritegolemstill': 'Netherite Golem',
        'mrleefy:irongolemstill': 'Iron Golem',
        'mrleefy:diamondgolemstill': 'Diamond Golem',
        'mrleefy:goldgolemstill': 'Gold Golem',
        'mrleefy:endermanstill': 'Enderman',
        'mrleefy:creeperstill': 'Creeper',
        'mrleefy:magmacubestill': 'Magma Cube',
        'mrleefy:guardianstill': 'Guardian',
        'mrleefy:witherskeletonstill': 'Wither Skeleton',
        'mrleefy:zombiestill': 'Zombie',
        'mrleefy:witherstill': 'Wither',
        'mrleefy:spiderstill': 'Spider',
        'mrleefy:slimestill': 'Slime',
        'mrleefy:vindicatorstill': 'Vindicator',
        'mrleefy:skeletonstill': 'Skeleton',
        'mrleefy:shulkerstill': 'Shulker',
        'mrleefy:breezestill': 'Breeze',
        'mrleefy:piglinbrutestill': 'Piglin Brute',
        'mrleefy:wardenstill': 'Warden',
        'mrleefy:ravagerstill': 'Ravager'
    };

    return nameMap[entityTypeId] || 'Unknown';
}

// Scan world for existing spawners and update database
function scanAndUpdateSpawnerDatabase() {
    try {
        const overworld = world.getDimension('overworld');
        const spawnruleEntities = overworld.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE });

        let addedCount = 0;
        let updatedCount = 0;

        for (const entity of spawnruleEntities) {
            if (!entity?.isValid) continue;

            // Get spawner location from entity position
            const x = Math.floor(entity.location.x);
            const y = Math.floor(entity.location.y);
            const z = Math.floor(entity.location.z);
            const coordinates = `${x},${y},${z}`;

            // Check if this spawner is already in database
            const existingData = spawnerDatabase.read(coordinates);

            if (!existingData) {
                // Add missing spawner to database with default metadata
                const spawnerData = {
                    typeId: 'unknown_spawner', // Will be updated when interacted with
                    placedBy: 'Existing', // Indicates this was found during scan
                    placedAt: Date.now(),
                    entitiesKilled: 0,
                    lastAccessed: Date.now(),
                    scannedAt: Date.now() // Mark when it was discovered
                };
                spawnerDatabase.write(coordinates, spawnerData);
                addedCount++;
            } else if (!existingData.scannedAt) {
                // Update existing entry to mark it as scanned
                existingData.scannedAt = Date.now();
                existingData.lastAccessed = Date.now();
                spawnerDatabase.write(coordinates, existingData);
                updatedCount++;
            }
        }

        if (addedCount > 0 || updatedCount > 0) {
            debugLog(`Spawner database updated: ${addedCount} added, ${updatedCount} updated`);
        }

    } catch (error) {
        console.error(`Error scanning spawner database: ${error}`);
    }
}

// Verify and clean spawner database - removes stale entries (handles unloaded chunks)
function verifyAndCleanSpawnerDatabase(player) {
    try {
        // Input validation
        if (!player || !player.isValid) {
            console.error("Invalid player provided to verifyAndCleanSpawnerDatabase");
            return;
        }

        // Security validation
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        player.sendMessage("§e🔍 Verifying spawner database...");
        player.sendMessage("§7This may take a moment for spawners in unloaded chunks...");
        
        const overworld = world.getDimension('overworld');
        const allSpawnerKeys = spawnerDatabase.keys();
        
        let removedBlocks = 0;
        let removedEntities = 0;
        let verifiedSpawners = 0;
        let processedCount = 0;
        const totalCount = allSpawnerKeys.length;

        // Process spawners in batches to avoid overwhelming the system
        let currentIndex = 0;
        
        const processBatch = () => {
            const BATCH_SIZE = 5; // Process 5 spawners at a time
            const endIndex = Math.min(currentIndex + BATCH_SIZE, totalCount);
            
            for (let i = currentIndex; i < endIndex; i++) {
                const coordinates = allSpawnerKeys[i];
                const [x, y, z] = coordinates.split(',').map(Number);
                
                if (isNaN(x) || isNaN(y) || isNaN(z)) {
                    debugLog(`Invalid coordinates in database: ${coordinates}`);
                    processedCount++;
                    continue;
                }

                try {
                    // Create a unique ticking area name for this check
                    const tickingAreaName = `verify_${x}_${y}_${z}`;
                    
                    // Add ticking area to load the chunk (3x3x3 area centered on spawner)
                    try {
                        player.runCommand(`tickingarea add ${x-1} ${y-1} ${z-1} ${x+1} ${y+1} ${z+1} ${tickingAreaName}`);
                    } catch (tickError) {
                        // Ticking area might already exist or hit limit, try to continue
                        debugLog(`Could not add ticking area at ${coordinates}: ${tickError}`);
                    }
                    
                    // Small delay to ensure chunk loads (schedule check for next tick)
                    system.runTimeout(() => {
                        try {
                            // Now check if the spawner block actually exists
                            const block = overworld.getBlock({ x, y, z });
                            
                            // Check if it's a spawner block
                            const isSpawnerBlock = block && block.typeId && 
                                block.typeId.startsWith('mrleefy:') && 
                                block.typeId.includes('spawner');

                            if (!isSpawnerBlock) {
                                // Block doesn't exist or isn't a spawner - remove from database
                                spawnerDatabase.delete(coordinates);
                                removedBlocks++;
                                
                                // Also remove any spawnrule entities at this location
                                const spawnruleEntities = overworld.getEntities({
                                    type: ENTITIES.SPAWNRULE_ENTITY_TYPE,
                                    location: { x, y, z },
                                    maxDistance: 1
                                });
                                
                                for (const entity of spawnruleEntities) {
                                    if (entity?.isValid) {
                                        try {
                                            entity.remove();
                                            removedEntities++;
                                        } catch (removeError) {
                                            console.error(`Failed to remove spawnrule entity at ${coordinates}:`, removeError);
                                        }
                                    }
                                }
                                
                                debugLog(`Removed stale spawner entry: ${coordinates}`);
                            } else {
                                verifiedSpawners++;
                                
                                // Update database with correct typeId if needed
                                const spawnerData = spawnerDatabase.read(coordinates);
                                if (spawnerData && spawnerData.typeId !== block.typeId) {
                                    spawnerData.typeId = block.typeId;
                                    spawnerData.lastVerified = Date.now();
                                    spawnerDatabase.write(coordinates, spawnerData);
                                    debugLog(`Updated spawner typeId at ${coordinates} to ${block.typeId}`);
                                } else if (spawnerData) {
                                    spawnerData.lastVerified = Date.now();
                                    spawnerDatabase.write(coordinates, spawnerData);
                                }
                            }
                            
                            // Remove ticking area after verification
                            try {
                                player.runCommand(`tickingarea remove ${tickingAreaName}`);
                            } catch (removeTickError) {
                                // Ticking area might not exist, that's okay
                                debugLog(`Could not remove ticking area ${tickingAreaName}: ${removeTickError}`);
                            }
                            
                        } catch (blockError) {
                            console.error(`Error checking block at ${coordinates}:`, blockError);
                            
                            // Still try to remove ticking area
                            try {
                                player.runCommand(`tickingarea remove ${tickingAreaName}`);
                            } catch (e) { /* ignore */ }
                        }
                        
                        processedCount++;
                        
                        // Show progress every 10 spawners
                        if (processedCount % 10 === 0 || processedCount === totalCount) {
                            player.sendMessage(`§7Progress: ${processedCount}/${totalCount} spawners checked...`);
                        }
                        
                        // Continue processing if there are more spawners
                        if (currentIndex + BATCH_SIZE < totalCount) {
                            currentIndex += BATCH_SIZE;
                            // Process next batch after a short delay
                            system.runTimeout(() => {
                                processBatch();
                            }, 20); // 1 second delay between batches
                        } else if (processedCount === totalCount) {
                            // All done - report results
                            reportVerificationResults(player, verifiedSpawners, removedBlocks, removedEntities);
                        }
                    }, 2); // Wait 2 ticks for chunk to load
                    
                } catch (error) {
                    console.error(`Error processing spawner at ${coordinates}:`, error);
                    processedCount++;
                }
            }
        };
        
        // Start processing
        if (totalCount > 0) {
            processBatch();
        } else {
            player.sendMessage("§eNo spawners found in database.");
        }

    } catch (error) {
        console.error(`Error in verifyAndCleanSpawnerDatabase: ${error}`);
        player.sendMessage("§cAn error occurred while verifying the database.");
    }
}

// Report verification results to player
function reportVerificationResults(player, verifiedSpawners, removedBlocks, removedEntities) {
    try {
        player.sendMessage(`§a✓ Database verification complete!`);
        player.sendMessage(`§7Verified: §a${verifiedSpawners} §7spawners`);
        if (removedBlocks > 0) {
            player.sendMessage(`§7Removed: §c${removedBlocks} §7stale database entries`);
        }
        if (removedEntities > 0) {
            player.sendMessage(`§7Cleaned: §c${removedEntities} §7orphaned spawnrule entities`);
        }
        
        if (removedBlocks === 0 && removedEntities === 0) {
            player.sendMessage(`§aDatabase is clean - no issues found!`);
        }
    } catch (error) {
        console.error(`Error reporting verification results: ${error}`);
    }
}

// Simple Player List Form - Alphabetical list of spawner owners
function openSimplePlayerListForm(player, sortedPlayers) {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        // Sort alphabetically for the simple list
        const alphaPlayers = Array.from(sortedPlayers).sort(([a], [b]) => a.localeCompare(b));

        const form = new ActionFormData()
            .title(`Spawner Owners (${alphaPlayers.length} players)`)
            .body("Select a player to view spawners they have placed:");

        for (const [playerName, spawners] of alphaPlayers) {
            form.button(`👤 ${playerName} (${spawners.length} spawners)`, "textures/ui/steve_head");
        }

        form.show(player).then((r) => {
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled) return;

            const [selectedPlayer, spawners] = alphaPlayers[r.selection];
            if (selectedPlayer) {
                openSpawnerSelectionForm(player, selectedPlayer, spawners);
            }
        }).catch((error) => {
            console.error(`Error in openSimplePlayerListForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing the player list.");
        });

    } catch (error) {
        console.error(`Critical error in openSimplePlayerListForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

// Player Stats Selection Form - Choose a player to view their detailed spawner stats
function openPlayerStatsSelectionForm(player) {
    try {
        // Security validation
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        // Get spawner locations from database by iterating through all keys
        const playerSpawners = new Map();
        const allSpawnerKeys = spawnerDatabase.keys();

        // Group spawners by player and calculate statistics
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

        // Sort players by spawner count (most active first)
        const sortedPlayers = Array.from(playerSpawners.entries())
            .sort(([,a], [,b]) => b.length - a.length);

        const form = new ActionFormData()
            .title("Select Player for Detailed Stats")
            .body(`Found ${playerSpawners.size} players with spawners. Select a player to view their detailed spawner information:`);

        for (const [playerName, spawners] of sortedPlayers) {
            // Calculate some basic stats for the button text
            const totalEntities = spawners.reduce((sum, spawner) => {
                const [x, y, z] = spawner.location.split(',').map(Number);
                return sum + countEntitiesNearSpawner(x, y, z);
            }, 0);

            const avgLevel = spawners.reduce((sum, spawner) => {
                const levelMatch = spawner.typeId.match(/spawner(\d+)/);
                return sum + (levelMatch ? parseInt(levelMatch[1]) : 1);
            }, 0) / spawners.length;

            form.button(`§e${playerName}\n§7${spawners.length} spawners • ${totalEntities} entities • Avg Level ${avgLevel.toFixed(1)}`, "textures/ui/steve_head");
        }

        form.show(player).then((r) => {
            if (r.canceled) return;
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }

            const selectedPlayerData = sortedPlayers[r.selection];
            if (selectedPlayerData) {
                const [selectedPlayer, spawners] = selectedPlayerData;

                // Convert spawners to spawnerDetails format for openSpawnerInfoForm
                const spawnerDetails = spawners.map(spawner => {
                    // Defensive parsing of location coordinates
                    let x = 0, y = 0, z = 0;
                    try {
                        if (spawner.location && typeof spawner.location === 'string') {
                            const coords = spawner.location.split(',').map(coord => parseFloat(coord.trim()));
                            if (coords.length >= 3 && coords.every(coord => !isNaN(coord))) {
                                [x, y, z] = coords;
                            }
                        }
                    } catch (error) {
                        debugLog(`Error parsing location for spawner: ${spawner.location}, error: ${error}`);
                    }

                    const typeId = spawner.typeId || 'unknown_spawner';
                    const levelMatch = typeId.match(/spawner(\d+)/);
                    const level = levelMatch ? parseInt(levelMatch[1]) : 1;

                    const mobType = typeId.replace('mrleefy:', '').replace(/spawner\d+/, '').replace(/_/g, '');
                    const displayName = getMobDisplayName(`mrleefy:${mobType}still`) || 'Unknown';
                    const activeEntities = countEntitiesNearSpawner(x, y, z);

                    return {
                        ...spawner,
                        displayName,
                        level,
                        activeEntities,
                        x, y, z
                    };
                });

                openSpawnerInfoForm(player, selectedPlayer, spawnerDetails);
            }
        }).catch((error) => {
            console.error(`Error in openPlayerStatsSelectionForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing player selection.");
        });

    } catch (error) {
        console.error(`Critical error in openPlayerStatsSelectionForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

// Spawner Information Form - Detailed stats for a player's spawners
function openSpawnerInfoForm(player, playerName, spawnerDetails) {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        // Calculate comprehensive statistics
        const totalSpawners = spawnerDetails.length;
        const totalEntities = spawnerDetails.reduce((sum, s) => sum + s.activeEntities, 0);
        const avgLevel = totalSpawners > 0 ? spawnerDetails.reduce((sum, s) => sum + s.level, 0) / totalSpawners : 0;
        const activeSpawners = spawnerDetails.filter(s => s.activeEntities > 0).length;
        const totalKills = spawnerDetails.reduce((sum, s) => sum + (s.entitiesKilled || 0), 0);

        // Calculate spawner types distribution
        const typeDistribution = {};
        spawnerDetails.forEach(spawner => {
            const type = spawner.displayName;
            typeDistribution[type] = (typeDistribution[type] || 0) + 1;
        });

        const topType = Object.entries(typeDistribution)
            .sort(([,a], [,b]) => b - a)[0];

        // Build detailed information string
        let infoText = `**${playerName}'s Spawner Overview**\n\n`;
        infoText += `**Summary:**\n`;
        infoText += `• Total Spawners: ${totalSpawners}\n`;
        infoText += `• Active Spawners: ${activeSpawners}/${totalSpawners} (${totalSpawners > 0 ? ((activeSpawners/totalSpawners)*100).toFixed(1) : '0.0'}%)\n`;
        infoText += `• Total Entities: ${totalEntities}\n`;
        infoText += `• Average Level: ${avgLevel.toFixed(1)}\n`;
        infoText += `• Total Kills: ${totalKills}\n\n`;

        infoText += `**Spawner Types:**\n`;
        Object.entries(typeDistribution)
            .sort(([,a], [,b]) => b - a)
            .forEach(([type, count]) => {
                infoText += `• ${type}: ${count}\n`;
            });

        infoText += `\nTop Performer: ${topType ? `${topType[0]} (${topType[1]} spawners)` : 'None'}\n\n`;

        infoText += `Individual Spawner Details:\n`;
        spawnerDetails
            .sort((a, b) => b.activeEntities - a.activeEntities) // Sort by activity
            .slice(0, 5) // Show top 5
            .forEach((spawner, index) => {
                const status = spawner.activeEntities > 0 ? '[ACTIVE]' : '[IDLE]';

                const placedTime = spawner.hasOwnProperty('placedAt') && spawner.placedAt ?
                    new Date(spawner.placedAt).toLocaleDateString() : 'Unknown';
                infoText += `${index + 1}. ${status} ${spawner.displayName} Level ${spawner.level} Cord: ${spawner.x}, ${spawner.y}, ${spawner.z}\n`;
                infoText += `   ${spawner.activeEntities} entities • ${spawner.entitiesKilled || 0} kills • ${placedTime}\n`;
            });

        const form = new ActionFormData()
            .title(`${playerName}'s Spawner Information`)
            .body(infoText)
            .button("§cClose");

        form.show(player).then((response) => {
            // Just close the form - no action needed
        }).catch((error) => {
            console.error(`Error in openSpawnerInfoForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing spawner information.");
        });

    } catch (error) {
        console.error(`Critical error in openSpawnerInfoForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}