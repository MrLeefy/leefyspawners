import { readFileSync, writeFileSync } from "node:fs";

const path = "src/mobstacker-ui.ts";
const original = readFileSync(path, "utf8");
let updated = original;

const oldImport = 'import { world, system, Player, Block, Entity, Vector3, Dimension } from "@minecraft/server";';
const newImport = 'import { world, system, Player, Block, Entity, Vector3, Dimension, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, CustomCommand, CustomCommandOrigin, CustomCommandResult, StartupEvent } from "@minecraft/server";';
updated = updated.replace(oldImport, newImport);

const commandStart = updated.indexOf("// --- CHAT COMMANDS ---");
if (commandStart === -1) {
  const alreadyMigrated =
    updated.includes("// --- CUSTOM COMMANDS ---") &&
    updated.includes('name: "leefy:reaper"');

  if (alreadyMigrated) {
    console.log("LeefySpawners Script API source is already current.");
    process.exit(0);
  }

  throw new Error("Could not locate the legacy Reaper chat-command section.");
}

const commandEnd = updated.indexOf("// --- SPAWNER-TO-CHEST LINKING SYSTEM ---", commandStart);
if (commandEnd === -1) {
  throw new Error("Could not locate the end of the legacy Reaper chat-command section.");
}

const commandReplacement = `// --- CUSTOM COMMANDS ---
const REAPER_LEVEL_VALUES = ["1", "2", "3", "4", "5", "I", "II", "III", "IV", "V"];
const REAPER_ROMAN_LEVELS = ["", "I", "II", "III", "IV", "V"];

function parseReaperLevel(levelValue: string): number {
    const normalized = levelValue.trim().toLowerCase();
    const numericLevel = Number.parseInt(normalized, 10);
    if (Number.isInteger(numericLevel) && numericLevel >= 1 && numericLevel <= 5) {
        return numericLevel;
    }

    const romanLevels: Record<string, number> = {
        i: 1,
        ii: 2,
        iii: 3,
        iv: 4,
        v: 5,
    };
    return romanLevels[normalized] ?? 0;
}

function handleReaperCommand(origin: CustomCommandOrigin, levelValue: string): CustomCommandResult {
    const sourceEntity = origin.sourceEntity;
    if (!(sourceEntity instanceof Player)) {
        return {
            status: CustomCommandStatus.Failure,
            message: "This command must be run by a player.",
        };
    }

    const player = sourceEntity;
    const isAdmin = player.hasTag("admin") ||
        player.hasTag("Admin") ||
        player.name === "Mr Leefy" ||
        (player as any).isOp?.() === true;

    if (!isAdmin) {
        return {
            status: CustomCommandStatus.Failure,
            message: "You must have the 'admin' tag or be OP to run this command.",
        };
    }

    const level = parseReaperLevel(levelValue);
    if (level < 1 || level > 5) {
        return {
            status: CustomCommandStatus.Failure,
            message: "Usage: /leefy:reaper <1-5 or I-V>",
        };
    }

    system.run(() => {
        try {
            const equipment = player.getComponent("equippable") as any;
            const mainhand = equipment?.getEquipment("Mainhand");
            if (!mainhand) {
                player.sendMessage("§cYou must hold a weapon in your main hand.");
                return;
            }

            mainhand.setDynamicProperty("reaper", level);
            const newLoreLine = `§r§7Reaper ${REAPER_ROMAN_LEVELS[level]}`;
            const currentLore = mainhand.getLore() || [];
            const updatedLore = currentLore.filter(
                (line: string) => !line.replace(/§./g, "").includes("Reaper"),
            );
            updatedLore.push(newLoreLine);
            mainhand.setLore(updatedLore);
            equipment.setEquipment("Mainhand", mainhand);
            player.sendMessage(
                `§aSuccessfully applied Reaper ${REAPER_ROMAN_LEVELS[level]} to your weapon!`,
            );
        } catch (error: any) {
            player.sendMessage("§cError applying Reaper: " + (error?.message || error));
            console.error("Error applying Reaper: " + (error?.stack || error));
        }
    });

    return {
        status: CustomCommandStatus.Success,
        message: `Applying Reaper ${REAPER_ROMAN_LEVELS[level]}...`,
    };
}

system.beforeEvents.startup.subscribe((event: StartupEvent) => {
    const commandRegistry = event.customCommandRegistry;
    commandRegistry.registerEnum("leefy:reaper_level", REAPER_LEVEL_VALUES);

    const reaperCommand: CustomCommand = {
        name: "leefy:reaper",
        description: "Apply Reaper I-V to the weapon in your main hand.",
        permissionLevel: CommandPermissionLevel.Any,
        mandatoryParameters: [
            {
                type: CustomCommandParamType.Enum,
                name: "leefy:reaper_level",
            },
        ],
    };

    commandRegistry.registerCommand(reaperCommand, handleReaperCommand);
});

`;

updated =
  updated.slice(0, commandStart) +
  commandReplacement +
  updated.slice(commandEnd);

if (updated !== original) {
  writeFileSync(path, updated, "utf8");
  console.log("Migrated Reaper to the stable Script API custom-command system.");
} else {
  console.log("LeefySpawners Script API source is already current.");
}
