// mobstacker-ui.ts

import { world, system, Player, Block, Entity, Vector3, Dimension } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { Database } from "./database";
import { LootManager } from './loot_table';
import { cooldowns, spawnerDatabase } from "./levelsystem";
import { validMobs, configDatabase, xpDropDatabase, spawnerStatistics, calculateSpawnerTotals, performanceMetrics, getMemoryUsage, loadSpawnerStatistics, resetSpawnerStatistics, getPlayerTopKills, ACTIVE_CHUNKS, enableLogging, disableLogging, isLoggingEnabled, debugLog, clearSpawnerParseCache } from "./mobstacker-core";
import { securityService } from "./security-service";
import { UI, ERROR_MESSAGES, ENTITIES } from "./constants";
import { performanceMonitor } from "./performance-monitor";

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

// Initialization is deferred to tick 2 below (database not ready at module load)

interface AALookupValue {
  qty: number;
  speed: number;
  maxStack: number;
}

const aaLookup: AALookupValue[] = Array.from({ length: 33 }, () => ({ qty: 0, speed: 0, maxStack: 100 }));

function rebuildAALookup(): void {
  try {
    // BUG FIX: fill() with a single object gives every slot the SAME reference.
    // Use a map with a fresh object per slot to avoid aliased-mutation corruption.
    for (let i = 0; i < aaLookup.length; i++) {
      aaLookup[i] = { qty: 0, speed: 0, maxStack: 100 };
    }
    aaDatabase.forEach((value, range) => {
      if (!value) return;
      const { qty = 0, speed = 0, maxStack = 100 } = value as AALookupValue;
      const [min, max] = range.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        for (let lvl = min; lvl <= max && lvl < aaLookup.length; lvl++) {
          // Always create a new object per slot — never share references
          aaLookup[lvl] = { qty, speed, maxStack };
        }
      }
    });
  } catch (error) {
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

export function getAAValueForLevel(level: number): AALookupValue {
    return aaLookup[level] || { qty: 0, speed: 0, maxStack: 100 };
}

// --- ADMIN UI & EVENT LISTENERS ---

world.afterEvents.itemUse.subscribe(event => {
  const { source, itemStack } = event;
  if (itemStack.typeId === "minecraft:blaze_rod" && source.hasTag("admin")) {
    openAdminMenu(source as Player);
  }
});


function openAdminMenu(player: Player): void {
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
      .button(isLoggingEnabled() ? "Disable Logging" : "Enable Logging", "textures/items/paper");

    form.show(player).then((r: any) => {
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
        commandValidation.warnings.forEach((warning: string) => {
          console.warn(`Admin action warning for ${player.name}: ${warning}`);
        });
      }

      system.run(() => {
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
      });

      securityService.logSecurityEvent('admin_action_executed', player, {
        action: `selection_${r.selection}`,
        warnings: commandValidation.warnings.length
      });

    }).catch((error: any) => {
        console.error(`Error in openAdminMenu: ${error}`);
        player.sendMessage("§cAn error occurred while opening the admin menu.");
        performanceMonitor.recordError('admin_menu_error', error instanceof Error ? error.message : String(error));
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}

function openToggleLootDropForm(player: Player): void {
  if (!player || !player.isValid) return;
  if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
    player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
    return;
  }
  const currentCap = configDatabase.read("itemSpillCap") || 5;
  const currentXpCap = configDatabase.read("xpSpillCap") || 3;
  const playerKillOnly = configDatabase.read("playerKillOnly") ?? false;
  
  (new ModalFormData() as any)
    .title("Loot Drop Rules")
    .toggle("Player Kills Only (Lag Protection)", playerKillOnly)
    .textField("Max item drops near stack:", "Enter integer (>=1)", `${currentCap}`)
    .textField("Max XP orbs near stack:", "Enter integer (>=1)", `${currentXpCap}`)
    .show(player).then((r: any) => {
        if (r.canceled || !r.formValues) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        configDatabase.write("playerKillOnly", r.formValues[0] as boolean);
        const capInput = parseInt(r.formValues[1] as string);
        if (!isNaN(capInput) && capInput >= 1) configDatabase.write("itemSpillCap", capInput);
        const xpCapInput = parseInt(r.formValues[2] as string);
        if (!isNaN(xpCapInput) && xpCapInput >= 1) configDatabase.write("xpSpillCap", xpCapInput);
        player.sendMessage(`§aLoot drop rules updated!`);
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}

function openPerformanceConfigForm(player: Player): void {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }

    // Read current performance settings from database (or use defaults)
    const currentActivationRadius = configDatabase.read("performanceActivationRadius") || 50;
    const currentMaxSpawns = configDatabase.read("performanceMaxSpawns") || 25;
    const currentRandomDelay = configDatabase.read("performanceRandomDelay") ?? true;
    const currentSpawnInterval = configDatabase.read("performanceSpawnInterval") || 20;

    const form = (new ModalFormData() as any)
        .title("Performance Settings")
        .slider(
            "§bPlayer Activation Radius (blocks):§r\n" +
            "§7Distance players must be within to activate spawners.\n" +
            "§7Lower = Better performance (spawners pause sooner)\n" +
            "§eDefault: 50 blocks§r",
            10, 128, 2, currentActivationRadius
        )
        .slider(
            "§bMax Spawns Per Cycle:§r\n" +
            "§7Maximum entities that can spawn per second.\n" +
            "§7Lower = Smoother performance, slower spawning\n" +
            "§eDefault: 25 spawns/second§r",
            5, 100, 5, currentMaxSpawns
        )
        .toggle(
            "§bRandom Initial Spawn Delays:§r\n" +
            "§7Randomizes first spawn time (0-100% of interval).\n" +
            "§7Prevents all spawners from syncing up.\n" +
            "§aRecommended: Enabled§r",
            currentRandomDelay
        )
        .slider(
            "§bSpawn Check Interval (ticks):§r\n" +
            "§7How often to check spawners (20 ticks = 1 second).\n" +
            "§7Lower = More responsive, higher CPU usage\n" +
            "§eDefault: 20 ticks§r",
            10, 100, 5, currentSpawnInterval
        );

    form.show(player).then((r: any) => {
        if (r.canceled || !r.formValues) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        // BUG FIX: parseInt("") === NaN, so a blank unchanged field would fail
        // !isNaN() validation and show a spurious "Invalid" warning to the admin.
        // Use parseOrPreserve: if the field is blank, keep the current saved value.
        const parseOrPreserve = (raw: any, saved: number): number => {
            if (typeof raw === 'number') return raw;
            const s = String(raw).trim();
            if (s === '') return saved;
            const n = parseInt(s);
            return isNaN(n) ? saved : n;
        };

        const activationRadius = parseOrPreserve(r.formValues[0], currentActivationRadius);
        const maxSpawns = parseOrPreserve(r.formValues[1], currentMaxSpawns);
        const randomDelay = r.formValues[2] as boolean;
        const spawnInterval = parseOrPreserve(r.formValues[3], currentSpawnInterval);

        let updated = false;
        let warnings = [];

        // Validate and save activation radius
        if (activationRadius >= 10 && activationRadius <= 128) {
            configDatabase.write("performanceActivationRadius", activationRadius);
            updated = true;
        } else {
            warnings.push("§eInvalid activation radius - must be between 10-128 blocks");
        }

        // Validate and save max spawns
        if (maxSpawns >= 5 && maxSpawns <= 100) {
            configDatabase.write("performanceMaxSpawns", maxSpawns);
            updated = true;
        } else {
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

    }).catch((error: any) => {
        console.error(`Error in openPerformanceConfigForm: ${error}`);
        player.sendMessage("§cAn error occurred while updating performance settings.");
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}

function openRadiusConfigForm(player: Player): void {
    if (!player || !player.isValid) {
        console.error("Invalid player provided to openRadiusConfigForm");
        return;
    }

    const radius = configDatabase.read("stackRadius") || 50;
  (new ModalFormData() as any)
    .title("Configure Stack Radius")
    .slider("Stacking Radius (blocks):", 1, 100, 1, radius)
            .show(player).then((r: any) => {
            if (r.canceled || !r.formValues) return;

            // Security validation
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                securityService.logSecurityEvent('unauthorized_config_change', player, {
                    configType: 'radius'
                });
                return;
            }

            const newRadius = typeof r.formValues[0] === 'number' ? r.formValues[0] : parseInt(r.formValues[0] as string);
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
        }).catch((error: any) => {
            console.error(`Error in openRadiusConfigForm: ${error}`);
            player.sendMessage("§cAn error occurred while updating the configuration.");
            performanceMonitor.recordError('radius_config_error', error instanceof Error ? error.message : String(error));
        }).finally(() => {
            cooldowns.set(player.name, Date.now());
        });
}

function openLootTableConfigForm(player: Player): void {
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
        const iconPath = getSpawnerIconPath(mob.typeId, mob.displayName);
        form.button(`Spawner ${mob.displayName}`, iconPath);
    });
    form.show(player).then((r: any) => {
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        if (!r.canceled && r.selection !== undefined) openEntityLootConfigForm(player, sortedMobs[r.selection].typeId);
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}

function openEntityLootConfigForm(player: Player, entityId: string): void {
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
    form.show(player).then((r: any) => {
        if (r.canceled || r.selection === undefined) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const itemCount = Object.keys(table).length;
        if (r.selection < itemCount) openEditLootItemForm(player, entityId, Object.keys(table)[r.selection]);
        else if (r.selection === itemCount) openAddNewLootItemForm(player, entityId);
        else if (r.selection === itemCount + 1) openXPDropManagerForm(player, entityId);
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}

function openXPDropManagerForm(player: Player, entityId: string): void {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const config = xpDropDatabase.read(entityId) || {};
    (new ModalFormData() as any)
        .title(`XP Manager: ${entityId}`)
        .textField("XP Amount:", "XP to drop on death", `${config.amount ?? 1}`)
        .slider("Drop Chance (%)", 1, 100, 1, config.chance ?? 100)
        .show(player).then((r: any) => {
            if (r.canceled || !r.formValues) return;
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            const amount = parseInt(r.formValues[0] as string);
            const chance = r.formValues[1] as number;
            if (!isNaN(amount) && amount >= 0) {
                xpDropDatabase.write(entityId, { amount, chance });
                player.sendMessage(`§aXP drop updated for ${entityId}.`);
            } else player.sendMessage("§cInvalid amount.");
            openEntityLootConfigForm(player, entityId);
        }).finally(() => {
            cooldowns.set(player.name, Date.now());
        });
}

function openAddNewLootItemForm(player: Player, entityId: string): void {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const lootManager = LootManager;
    const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
    (new ModalFormData() as any)
        .title(`Add Loot: ${entityId}`)
        .textField("Item ID:", "e.g., minecraft:diamond", "")
        .textField("Chance:", "[0.01-100]", "100")
        .toggle("Enchantable?", false)
        .dropdown("Enchantment Category:", categories, 0)
        .textField("Enchant Chance:", "[0-100]", "50")
        .toggle("Stackable?", true)
        .toggle("Random Durability?", false)
        .show(player).then((r: any) => {
            if (r.canceled || !r.formValues) return;
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            const [id, chance, ench, catIdx, enchChance, stack, dura] = r.formValues as [string, string, boolean, number, string, boolean, boolean];
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
        }).finally(() => {
            cooldowns.set(player.name, Date.now());
        });
}

function openEditLootItemForm(player: Player, entityId: string, itemId: string): void {
    if (!player || !player.isValid) return;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        return;
    }
    const lootManager = LootManager;
    const config = lootManager.entities[entityId][itemId];
    const categories = ["None", ...Object.keys(lootManager.enchantmentCategories)];
    const catIdx = config.enchantments ? categories.indexOf(config.enchantments.category) : 0;
    (new ModalFormData() as any)
        .title(`Editing: ${itemId}`)
        .textField("Chance:", "[0.01-100]", `${config.chance}`)
        .toggle("Enchantable?", !!config.enchantments)
        .dropdown("Category:", categories, Math.max(0, catIdx))
        .textField("Enchant Chance:", "[0-100]", `${config.enchantments?.chance ?? 50}`)
        .toggle("Stackable?", config.stackable !== false)
        .toggle("Random Durability?", config.randomdurability === true)
        .toggle("§cDELETE THIS ITEM?§r", false)
        .show(player).then((r: any) => {
            if (r.canceled || !r.formValues) return;
            // Re-validate permission inside .then() to prevent session-tag-revocation bypass
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            const [chance, ench, catIdxSelected, enchChance, stack, dura, del] = r.formValues as [string, boolean, number, string, boolean, boolean, boolean];
            if (del) delete lootManager.entities[entityId][itemId];
            else {
                const pChance = parseFloat(chance);
                if (isNaN(pChance)) { player.sendMessage("§cInvalid Chance."); return; }
                config.chance = pChance;
                config.enchantments = (ench && categories[catIdxSelected] !== "None") ? { chance: parseFloat(enchChance), category: categories[catIdxSelected] } : undefined;
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

function openAAConfigForm(player: Player): void {
    if (!player || !player.isValid) {
        console.error(ERROR_MESSAGES.INVALID_PLAYER);
        return;
    }

    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
        securityService.logSecurityEvent('unauthorized_aa_config', player);
        return;
    }

    const form = (new ModalFormData() as any).title("Spawner Settings");
    const entries: [string, any][] = [];
    aaDatabase.forEach((val, key) => entries.push([key, val]));
    
    form.textField("Add New Range:", "e.g., 1-10 or 33-33", "");
    form.textField("New Range - Quantity:", "e.g., 1", "");
    form.textField("New Range - Speed (sec):", "e.g., 10", "");
    form.textField("New Range - Max Stack:", "e.g., 100", "");

    entries.forEach(([range, {qty, speed, maxStack}]) => {
        form.textField(`Qty for ${range}:`, `Update`, `${qty}`);
        form.textField(`Speed for ${range}:`, `Update`, `${speed}`);
        form.textField(`Max Stack for ${range}:`, `Update`, `${maxStack}`);
        form.toggle(`§cRemove Range ${range}?§r`, false);
    });

    form.show(player).then((r: any) => {
        if (r.canceled || !r.formValues) return;
        // Re-validate permission inside .then() to prevent session-tag-revocation bypass
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const vals = r.formValues as (string | boolean)[];

        if (typeof vals[0] === 'string' && vals[0].trim()) {
            let range = vals[0].trim();
            if (!range.includes("-")) range = `${range}-${range}`;
            // BUG FIX: parseInt("") is NaN, so `NaN || fallback` silently resets to
            // the hardcoded default whenever a field is left blank. Use a helper that
            // only falls back when the field is actually blank/invalid, not when a
            // valid 0 is intentionally entered. For the "new range" fields there is
            // no existing saved value to preserve, so the fallback is safe here.
            const parseOrDefault = (raw: string | boolean, fallback: number) => {
                const s = String(raw).trim();
                if (s === '') return fallback;
                const n = parseInt(s);
                return isNaN(n) ? fallback : n;
            };
            aaDatabase.write(range, {
                qty: Math.max(1, parseOrDefault(vals[1], 1)),
                speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseOrDefault(vals[2], 10))),
                maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseOrDefault(vals[3], 100))),
            });
        }

        let offset = 4;
        entries.forEach(([range, currentVal]) => {
            if (vals[offset + 3] as boolean) {
                aaDatabase.delete(range);
            } else {
                // BUG FIX: For existing entries, if the user leaves a field blank
                // (didn't change it), preserve the previously-saved value instead
                // of falling back to a hardcoded default. This was the root cause
                // of settings "reverting" after editing — any untouched field would
                // silently reset to qty=1, speed=10, maxStack=100.
                const savedQty: number = currentVal?.qty ?? 1;
                const savedSpeed: number = currentVal?.speed ?? 10;
                const savedMaxStack: number = currentVal?.maxStack ?? 100;

                const parseOrPreserve = (raw: string | boolean, saved: number) => {
                    const s = String(raw).trim();
                    if (s === '') return saved; // blank = keep current
                    const n = parseInt(s);
                    return isNaN(n) ? saved : n;
                };

                aaDatabase.write(range, {
                    qty: Math.max(1, parseOrPreserve(vals[offset], savedQty)),
                    speed: Math.min(MAX_ALLOWED_SPEED, Math.max(1, parseOrPreserve(vals[offset + 1], savedSpeed))),
                    maxStack: Math.min(MAX_ALLOWED_STACK, Math.max(1, parseOrPreserve(vals[offset + 2], savedMaxStack))),
                });
            }
            offset += 4;
        });

        rebuildAALookup();
        // BUG FIX: Flush the per-nameTag spawner spec cache so running spawners
        // immediately pick up the new qty/speed/maxStack values on their next tick
        // instead of continuing to use stale cached specs until a server restart.
        clearSpawnerParseCache();
        player.sendMessage("§aSpawner settings updated!");
    }).finally(() => {
        cooldowns.set(player.name, Date.now());
    });
}

function toggleLogging(player: Player): void {
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
        } else {
            enableLogging();
            player.sendMessage("§aLogging has been enabled for all spawner activities.");
        }

        system.run(() => openAdminMenu(player));

    } catch (error: any) {
        console.error(`Error in toggleLogging: ${error}`);
        player.sendMessage("§cAn error occurred while toggling logging.");
    }
}

function openSpawnerStatisticsForm(player: Player): void {
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

        const totalKills = Array.from(spawnerStatistics.entitiesKilled.values()).reduce((sum: number, kills: number) => sum + kills, 0);
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
        } else if (memoryUsage < 150) {
            memoryLevel = "Medium";
        } else if (memoryUsage < 300) {
            memoryLevel = "High";
        } else {
            memoryLevel = "Very High";
        }

        const topMobs = Array.from(spawnerStatistics.entitiesKilled.entries())
            .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
            .slice(0, 10);

        const topPlayers = Array.from(spawnerStatistics.playerStats.entries())
            .sort((a: [string, any], b: [string, any]) => (b[1].entitiesKilled || 0) - (a[1].entitiesKilled || 0))
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
        } else {
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
                playerTopKills.forEach((killType: any) => {
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
            .button("§8Close", "textures/ui/cancel")
            .button("§bView Player Stats", "textures/items/name_tag")
            .button("§cReset All Statistics", "textures/ui/realms_red_x");

        form.show(player).then((response: any) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (response.canceled || response.selection === 0) return;

            if (response.selection === 1) {
                openPlayerStatsSelectionForm(player);
                return;
            }

            if (response.selection === 2) {
                const confirmForm = new ModalFormData()
                    .title("Confirm Reset")
                    .textField("Confirm", "Type 'RESET' to confirm", { defaultValue: "" })
                    .submitButton("CONFIRM");

                confirmForm.show(player).then((confirmResponse: any) => {
                    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                        player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                        return;
                    }
                    if (confirmResponse.canceled || !confirmResponse.formValues) return;

                    const confirmationText = (confirmResponse.formValues as any[])[0]?.toUpperCase().trim();
                    if (confirmationText === "RESET") {
                        resetSpawnerStatistics();
                        player.sendMessage("§a✓ All statistics have been reset successfully!");
                    } else {
                        player.sendMessage("§cReset cancelled - confirmation code was incorrect.");
                    }
                }).catch((error: any) => {
                    console.error(`Error in spawner stats reset confirmation: ${error}`);
                });
            }
        }).catch((error: any) => {
            console.error(`Error in openSpawnerStatisticsForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing statistics.");
        });

    } catch (error: any) {
        console.error(`Critical error in openSpawnerStatisticsForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

function openSpawnerTeleportForm(player: Player): void {
    try {
        if (!player || !player.isValid) {
            console.error("Invalid player provided to openSpawnerTeleportForm");
            return;
        }

        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        const playerSpawners = new Map<string, any[]>();
        const allSpawners: Record<string, any> = {};

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
                playerSpawners.get(playerName)!.push(details);
                allSpawners[key] = spawnerData;
            }
        }

        if (playerSpawners.size === 0) {
            player.sendMessage("§cNo active spawners found in the database.");
            return;
        }

        const totalSpawners = Array.from(playerSpawners.values()).reduce((sum: number, spawners: any[]) => sum + spawners.length, 0);

        const sortedPlayers = Array.from(playerSpawners.entries())
            .sort((a: [string, any[]], b: [string, any[]]) => b[1].length - a[1].length);

        const form = new ActionFormData()
            .title("Spawner Teleport System")
            .body(`Database size: ${totalSpawners} spawners across ${playerSpawners.size} players. Select a player to view their spawners:`);

        form.button("🔍 Search by Location", "textures/ui/magnifying_glass");

        sortedPlayers.forEach(([playerName, spawners]) => {
            form.button(`👤 ${playerName} (${spawners.length} spawners)`, "textures/items/name_tag");
        });

        form.show(player).then((r: any) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined) return;

            if (r.selection === 0) {
                openLocationSearchForm(player, allSpawners);
                return;
            }

            const selectedPlayerData = sortedPlayers[r.selection - 1];
            if (selectedPlayerData) {
                const [selectedPlayer, spawners] = selectedPlayerData;
                openSpawnerSelectionForm(player, selectedPlayer, spawners);
            }
        }).catch((error: any) => {
            console.error(`Error in openSpawnerTeleportForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing the spawner teleport form.");
        });

    } catch (error: any) {
        console.error(`Critical error in openSpawnerTeleportForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

function openSpawnerSelectionForm(player: Player, playerName: string, spawners: any[]): void {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        const validSpawners = spawners.filter((spawner: any) => spawner !== undefined && spawner !== null);

        const spawnerDetails = validSpawners.map((spawner: any) => {
            let x = 0, y = 0, z = 0;
            try {
                if (spawner.location && typeof spawner.location === 'string') {
                    const coords = spawner.location.split(',').map((coord: string) => parseFloat(coord.trim()));
                    if (coords.length >= 3 && coords.every((coord: number) => !isNaN(coord))) {
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

        const totalPhysical = spawnerDetails.reduce((sum: number, s: any) => sum + (s.physicalEntities || 0), 0);
        const totalVirtual = spawnerDetails.reduce((sum: number, s: any) => sum + (s.virtualEntities || 0), 0);
        const avgLevel = spawnerDetails.length > 0 ?
            spawnerDetails.reduce((sum: number, s: any) => sum + (s.level || 1), 0) / spawnerDetails.length : 0;

        const form = new ActionFormData()
            .title(`${playerName}'s Spawners`)
            .body(`Total: ${spawnerDetails.length} spawners | Active: ${totalPhysical} stacks (${totalVirtual} mobs) | Avg Level: ${avgLevel.toFixed(1)}`);

        spawnerDetails.forEach((spawner: any) => {
            const status = spawner.physicalEntities > 0 ? `§a[Active: ${spawner.physicalEntities} stack (${spawner.virtualEntities} mobs)]` : '§8[Idle]';
            const iconPath = getSpawnerIconPath(spawner.typeId, spawner.displayName);
            form.button(`${status} §7Lvl ${spawner.level} §f${spawner.displayName}\n§8Coord: ${spawner.x}, ${spawner.y}, ${spawner.z}`, iconPath);
        });

        form.button("§6📊 View Player Statistics", "textures/ui/book_normal");

        form.show(player).then((r: any) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined) return;

            if (r.selection === spawnerDetails.length) {
                openSpawnerInfoForm(player, playerName, spawnerDetails);
                return;
            }

            const selectedDetail = spawnerDetails[r.selection];
            if (selectedDetail) {
                teleportToSpawner(player, selectedDetail.x, selectedDetail.y, selectedDetail.z);
            }
        }).catch((error: any) => {
            console.error(`Error in openSpawnerSelectionForm: ${error}`);
            player.sendMessage("§cAn error occurred while opening selection form.");
        });

    } catch (error: any) {
        console.error(`Critical error in openSpawnerSelectionForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

function teleportToSpawner(player: Player, x: number, y: number, z: number): void {
    try {
        if (!player || !player.isValid) return;

        player.sendMessage(`§aTeleporting to spawner at ${x}, ${y}, ${z}...`);

        system.run(() => {
            try {
                const dimension = player.dimension;
                player.teleport({ x: x + 0.5, y: y + 1.5, z: z + 0.5 }, { dimension: dimension });
            } catch (teleportError) {
                console.error(`Teleport logic failed: ${teleportError}`);
                player.sendMessage(`§cTeleport failed. Check if coordinate is in a loaded area or try again.`);
            }
        });

    } catch (error: any) {
        console.error(`Error in teleportToSpawner: ${error}`);
        player.sendMessage("§cA critical error occurred during teleportation.");
    }
}

function extractStackSize(nameTag: string | undefined): number {
    if (!nameTag) return 1;
    const match = nameTag.match(/x(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
}

interface SpawnerEntitiesInfo {
    physicalCount: number; // Number of stacks
    virtualCount: number;  // Sum of stack multipliers
}

function getEntitiesInfoNearSpawner(x: number, y: number, z: number): SpawnerEntitiesInfo {
    try {
        const overworld = world.getDimension("overworld");
        const location: Vector3 = { x, y, z };
        
        const nearbyEntities = overworld.getEntities({
            location: location,
            maxDistance: 10
        });

        let physicalCount = 0;
        let virtualCount = 0;

        nearbyEntities.forEach((entity: Entity) => {
            if (entity?.isValid && entity.typeId.startsWith('mrleefy:')) {
                if (entity.nameTag && entity.nameTag.includes('x')) {
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

function countEntitiesNearSpawner(x: number, y: number, z: number): number {
    return getEntitiesInfoNearSpawner(x, y, z).physicalCount;
}

function openLocationSearchForm(player: Player, allSpawners: Record<string, any>): void {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        const playerLocation = player.location;
        const playerX = Math.round(playerLocation.x);
        const playerZ = Math.round(playerLocation.z);

        const form = (new ModalFormData() as any)
            .title("Search Spawners by Location")
            .toggle("Use current location", true)
            .textField("X Coordinate", "Enter X coordinate", playerX.toString())
            .textField("Z Coordinate", "Enter Z coordinate", playerZ.toString())
            .slider("Search Radius", 10, 500, 10, 50)
            .toggle("Include inactive spawners", true);

        form.show(player).then((r: any) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || !r.formValues) return;

            const useCurrentLocation = r.formValues[0] as boolean;
            const enteredX = r.formValues[1] as string;
            const enteredZ = r.formValues[2] as string;
            const radius = r.formValues[3] as number;
            const includeInactive = r.formValues[4] as boolean;

            const searchX = useCurrentLocation ? playerX : parseInt(enteredX);
            const searchZ = useCurrentLocation ? playerZ : parseInt(enteredZ);

            if (isNaN(searchX) || isNaN(searchZ)) {
                player.sendMessage("§cInvalid coordinates entered.");
                return;
            }

            const results: any[] = [];
            Object.entries(allSpawners).forEach(([coordinates, data]) => {
                try {
                    const [x, y, z] = coordinates.split(',').map((coord: string) => parseFloat(coord.trim()));
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
                } catch (e) {
                    console.error("Error matching distance search coords:", e);
                }
            });

            results.sort((a, b) => a.distance - b.distance);
            openLocationResultsForm(player, results, searchX, searchZ, radius);

        }).catch((error: any) => {
            console.error(`Error in openLocationSearchForm: ${error}`);
            player.sendMessage("§cAn error occurred during search.");
        });

    } catch (error: any) {
        console.error(`Critical error in openLocationSearchForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

function openLocationResultsForm(player: Player, spawners: any[], searchX: number, searchZ: number, radius: number): void {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        const validSpawners: any[] = [];

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

        form.show(player).then((r: any) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined) return;

            const selectedSpawner = validSpawners[r.selection];
            if (selectedSpawner) {
                teleportToSpawner(player, selectedSpawner.x, selectedSpawner.y, selectedSpawner.z);
            }
        }).catch((error: any) => {
            console.error(`Error in openLocationResultsForm: ${error}`);
            player.sendMessage("§cAn error occurred while selecting spawner from search results.");
        });

    } catch (error: any) {
        console.error(`Critical error in openLocationResultsForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

function getMobDisplayName(entityTypeId: string): string {
    const found = validMobs.find(m => m.typeId === entityTypeId);
    if (found) {
        return found.displayName;
    }
    // Fallback to formatting raw ID if not in list
    const name = entityTypeId.replace("mrleefy:", "").replace("still", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function getSpawnerIconPath(typeId: string, displayName: string): string {
    const cleanTypeId = typeId.replace(/\d+$/, ''); // remove level numbers if any
    
    // Check crawler block texture mapping (pointing to actual ore block faces used by the game)
    const crawlerBlockMap: Record<string, string> = {
        'mrleefy:coalcrawlerspawner':      'textures/blocks/iron',
        'mrleefy:ironcrawlerspawner':      'textures/blocks/ironcrawlerspawner',
        'mrleefy:goldcrawlerspawner':      'textures/blocks/goldcrawlerspawner',
        'mrleefy:diamondcrawlerspawner':   'textures/blocks/diamondcrawlerspawner',
        'mrleefy:glowstonecrawlerspawner': 'textures/blocks/gold',
        'mrleefy:obsidiancrawlerspawner':  'textures/blocks/diamond',
        'mrleefy:icecrawlerspawner':       'textures/blocks/emerald',
        'mrleefy:spongecrawlerspawner':    'textures/blocks/netherite',
        'mrleefy:lapiscrawlerspawner':     'textures/blocks/lapis',
        'mrleefy:redstonecrawlerspawner':  'textures/blocks/redstone',
        'mrleefy:coppercrawlerspawner':    'textures/blocks/copper',
        'mrleefy:quartzcrawlerspawner':    'textures/blocks/quartz',
        'mrleefy:amethystcrawlerspawner':  'textures/blocks/amethyst',
        // Also map still crawler types
        'mrleefy:coalcrawlerstill':        'textures/blocks/iron',
        'mrleefy:ironcrawlerstill':        'textures/blocks/ironcrawlerspawner',
        'mrleefy:goldcrawlerstill':        'textures/blocks/goldcrawlerspawner',
        'mrleefy:diamondcrawlerstill':     'textures/blocks/diamondcrawlerspawner',
        'mrleefy:glowstonecrawlerstill':   'textures/blocks/gold',
        'mrleefy:obsidiancrawlerstill':    'textures/blocks/diamond',
        'mrleefy:icecrawlerstill':         'textures/blocks/emerald',
        'mrleefy:spongecrawlerstill':      'textures/blocks/netherite',
        'mrleefy:lapiscrawlerstill':       'textures/blocks/lapis',
        'mrleefy:redstonecrawlerstill':    'textures/blocks/redstone',
        'mrleefy:coppercrawlerstill':      'textures/blocks/copper',
        'mrleefy:quartzcrawlerstill':      'textures/blocks/quartz',
        'mrleefy:amethystcrawlerstill':    'textures/blocks/amethyst',
    };

    if (crawlerBlockMap[cleanTypeId]) {
        return `${crawlerBlockMap[cleanTypeId]}.png`;
    }

    // Default icon path
    let iconName = displayName.toLowerCase().replace(/ /g, '_');
    if (iconName === "wither_skeleton") iconName = "witherskeleton";
    return `textures/blocks/icons/${iconName}.png`;
}

function scanAndUpdateSpawnerDatabase(): void {
    try {
        const overworld = world.getDimension("overworld");
        const allSpawnerKeys = spawnerDatabase.keys();
        const entities = overworld.getEntities();

        for (const entity of entities) {
            if (!entity?.isValid) continue;
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
                const [x, y, z] = key.split(',').map((coord: string) => parseFloat(coord.trim()));
                const block = overworld.getBlock({ x, y, z });
                
                if (block && !(block.typeId.startsWith('mrleefy:') && block.typeId.includes('spawner') && !block.typeId.endsWith('_display'))) {
                    spawnerDatabase.delete(key);
                    debugLog(`[MOBSTACKER] Removed stale database entry for missing spawner block at ${key}`);
                }
            } catch (blockError) {
                // If block is unloaded, keep the entry
            }
        }

    } catch (error) {
        console.error(`[MOBSTACKER] Error in system scan: ${error}`);
    }
}

function verifyAndCleanSpawnerDatabase(player: Player): void {
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
            .body(
                "§c§lWARNING:§r\n\n" +
                "This operation will verify all spawners stored in the database by temporarily loading their chunks via ticking areas.\n\n" +
                "§eWhat it does:§r\n" +
                "• Checks if a spawner block actually exists at each stored location.\n" +
                "• Deletes old spawner coordinates from the database if the block is gone.\n" +
                "• Removes any orphaned/stuck stacked entities at those locations.\n\n" +
                "§cThis may cause temporary server lag during the scan.§r\n\n" +
                "Are you sure you want to proceed?"
            )
            .button1("§aYes, Start Scan")
            .button2("§cNo, Cancel");

        confirmForm.show(player).then((r: any) => {
            if (r.canceled || r.selection !== 0) {
                player.sendMessage("§eDatabase cleanup cancelled.");
                return;
            }

            player.sendMessage("§aStarting database verification and cleanup...");
            player.sendMessage("§7This process runs in batches to prevent lag.");

            const overworld = world.getDimension("overworld");
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
                        const [x, y, z] = coordinates.split(',').map((coord: string) => parseFloat(coord.trim()));
                        
                        const tickingAreaName = `db_verify_${x}_${y}_${z}`;
                        player.runCommand(`tickingarea add ${x-2} ${y-2} ${z-2} ${x+2} ${y+2} ${z+2} ${tickingAreaName} true`);
                        
                        system.runTimeout(() => {
                            try {
                                const block = overworld.getBlock({ x, y, z });
                                
                                if (!block || !(block.typeId.startsWith('mrleefy:') && block.typeId.includes('spawner') && !block.typeId.endsWith('_display'))) {
                                    spawnerDatabase.delete(coordinates);
                                    removedBlocks++;
                                    debugLog(`[CLEANUP] Deleted stale spawner coordinates from DB: ${coordinates}`);

                                    const nearbyEntities = overworld.getEntities({
                                        location: { x, y, z },
                                        maxDistance: 8
                                    });

                                    nearbyEntities.forEach((entity: Entity) => {
                                        if (entity?.isValid && entity.typeId.startsWith('mrleefy:') && entity.typeId.endsWith('still')) {
                                            entity.remove();
                                            removedEntities++;
                                            debugLog(`[CLEANUP] Removed orphaned spawnrule entity: ${entity.typeId} at ${coordinates}`);
                                        }
                                    });
                                } else {
                                    verifiedSpawners++;
                                }
                                
                                try {
                                    player.runCommand(`tickingarea remove ${tickingAreaName}`);
                                } catch (e) { /* ignore */ }

                            } catch (blockError: any) {
                                console.error(`Error checking block at ${coordinates}:`, blockError);
                                
                                try {
                                    player.runCommand(`tickingarea remove ${tickingAreaName}`);
                                } catch (e) { /* ignore */ }
                            }
                            
                            processedCount++;
                            
                            if (processedCount % 10 === 0 || processedCount === totalCount) {
                                player.sendMessage(`§7Progress: ${processedCount}/${totalCount} spawners checked...`);
                            }
                            
                            if (currentIndex + BATCH_SIZE < totalCount) {
                                currentIndex += BATCH_SIZE;
                                system.runTimeout(() => {
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
                player.sendMessage("§eNo spawners found in database.");
            }
        }).catch((confirmError: any) => {
            console.error(`Error in cleanup confirmation form: ${confirmError}`);
        });

    } catch (error) {
        console.error(`Error in verifyAndCleanSpawnerDatabase: ${error}`);
        player.sendMessage("§cAn error occurred while verifying the database.");
    }
}

function reportVerificationResults(player: Player, verifiedSpawners: number, removedBlocks: number, removedEntities: number): void {
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

function openSimplePlayerListForm(player: Player, sortedPlayers: [string, any[]][]): void {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const alphaPlayers = Array.from(sortedPlayers).sort((a: [string, any[]], b: [string, any[]]) => a[0].localeCompare(b[0]));

        const form = new ActionFormData()
            .title(`Spawner Owners (${alphaPlayers.length} players)`)
            .body("Select a player to view spawners they have placed:");

        for (const [playerName, spawners] of alphaPlayers) {
            form.button(`👤 ${playerName} (${spawners.length} spawners)`, "textures/items/name_tag");
        }

        form.show(player).then((r: any) => {
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }
            if (r.canceled || r.selection === undefined) return;

            const selectedData = alphaPlayers[r.selection];
            if (selectedData) {
                const [selectedPlayer, spawners] = selectedData;
                openSpawnerSelectionForm(player, selectedPlayer, spawners);
            }
        }).catch((error: any) => {
            console.error(`Error in openSimplePlayerListForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing the player list.");
        });

    } catch (error) {
        console.error(`Critical error in openSimplePlayerListForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

function openPlayerStatsSelectionForm(player: Player): void {
    try {
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }

        const playerSpawners = new Map<string, any[]>();
        const allSpawnerKeys = spawnerDatabase.keys();

        for (const key of allSpawnerKeys) {
            const spawnerData = spawnerDatabase.read(key);
            if (spawnerData && spawnerData.placedBy) {
                const playerName = spawnerData.placedBy;
                if (!playerSpawners.has(playerName)) {
                    playerSpawners.set(playerName, []);
                }
                playerSpawners.get(playerName)!.push({
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
            .sort((a: [string, any[]], b: [string, any[]]) => b[1].length - a[1].length);

        const form = new ActionFormData()
            .title("Select Player for Detailed Stats")
            .body(`Found ${playerSpawners.size} players with spawners. Select a player to view their detailed spawner information:`);

        for (const [playerName, spawners] of sortedPlayers) {
            let totalPhysical = 0;
            let totalVirtual = 0;
            spawners.forEach((spawner: any) => {
                const [x, y, z] = spawner.location.split(',').map(Number);
                const info = getEntitiesInfoNearSpawner(x, y, z);
                totalPhysical += info.physicalCount;
                totalVirtual += info.virtualCount;
            });

            const avgLevel = spawners.reduce((sum: number, spawner: any) => {
                const levelMatch = spawner.typeId.match(/spawner(\d+)/);
                return sum + (levelMatch ? parseInt(levelMatch[1]) : 1);
            }, 0) / spawners.length;

            form.button(`§e${playerName}\n§8${spawners.length} spawners • ${totalPhysical} stacks (${totalVirtual} mobs) • Avg Level ${avgLevel.toFixed(1)}`, "textures/items/name_tag");
        }

        form.show(player).then((r: any) => {
            if (r.canceled || r.selection === undefined) return;
            if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
                player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
                return;
            }

            const selectedPlayerData = sortedPlayers[r.selection];
            if (selectedPlayerData) {
                const [selectedPlayer, spawners] = selectedPlayerData;

                const spawnerDetails = spawners.map((spawner: any) => {
                    let x = 0, y = 0, z = 0;
                    try {
                        if (spawner.location && typeof spawner.location === 'string') {
                            const coords = spawner.location.split(',').map((coord: string) => parseFloat(coord.trim()));
                            if (coords.length >= 3 && coords.every((coord: number) => !isNaN(coord))) {
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
        }).catch((error: any) => {
            console.error(`Error in openPlayerStatsSelectionForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing player selection.");
        });

    } catch (error) {
        console.error(`Critical error in openPlayerStatsSelectionForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}

function openSpawnerInfoForm(player: Player, playerName: string, spawnerDetails: any[]): void {
    try {
        if (!player || !player.isValid) return;
        if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
            player.sendMessage(ERROR_MESSAGES.NO_PERMISSION);
            return;
        }
        const totalSpawners = spawnerDetails.length;
        const totalPhysicalEntities = spawnerDetails.reduce((sum: number, s: any) => sum + s.physicalEntities, 0);
        const totalVirtualEntities = spawnerDetails.reduce((sum: number, s: any) => sum + s.virtualEntities, 0);
        const avgLevel = totalSpawners > 0 ? spawnerDetails.reduce((sum: number, s: any) => sum + s.level, 0) / totalSpawners : 0;
        const activeSpawners = spawnerDetails.filter((s: any) => s.physicalEntities > 0).length;
        const totalKills = spawnerDetails.reduce((sum: number, s: any) => sum + (s.entitiesKilled || 0), 0);

        const typeDistribution: Record<string, number> = {};
        spawnerDetails.forEach((spawner: any) => {
            const type = spawner.displayName;
            typeDistribution[type] = (typeDistribution[type] || 0) + 1;
        });

        const topType = Object.entries(typeDistribution)
            .sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0];

        let infoText = `**${playerName}'s Spawner Overview**\n\n`;
        infoText += `**Summary:**\n`;
        infoText += `• Total Spawners: ${totalSpawners}\n`;
        infoText += `• Active Spawners: ${activeSpawners}/${totalSpawners} (${totalSpawners > 0 ? ((activeSpawners/totalSpawners)*100).toFixed(1) : '0.0'}%)\n`;
        infoText += `• Total Mob Stacks Nearby: ${totalPhysicalEntities} (Physical entities alive)\n`;
        infoText += `• Total Mobs inside Stacks: ${totalVirtualEntities} (Sum of stack sizes)\n`;
        infoText += `• Average Level: ${avgLevel.toFixed(1)}\n`;
        infoText += `• Total Kills: ${totalKills}\n\n`;

        infoText += `**Spawner Types:**\n`;
        Object.entries(typeDistribution)
            .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
            .forEach(([type, count]) => {
                infoText += `• ${type}: ${count}\n`;
            });

        infoText += `\nTop Performer: ${topType ? `${topType[0]} (${topType[1]} spawners)` : 'None'}\n\n`;

        infoText += `Individual Spawner Details:\n`;
        spawnerDetails
            .sort((a: any, b: any) => b.physicalEntities - a.physicalEntities)
            .slice(0, 5)
            .forEach((spawner: any, index: number) => {
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

        form.show(player).then((response: any) => {
            // Just close the form
        }).catch((error: any) => {
            console.error(`Error in openSpawnerInfoForm: ${error}`);
            player.sendMessage("§cAn error occurred while showing spawner information.");
        });

    } catch (error) {
        console.error(`Critical error in openSpawnerInfoForm: ${error}`);
        player.sendMessage("§cA critical error occurred. Please try again.");
    }
}
