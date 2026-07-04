// Auto-update pipeline verification comment
import { world, system, Player, Block, Vector3, Entity, EntityInventoryComponent, EntityHitEntityAfterEvent, PlayerSpawnAfterEvent, PlayerInteractWithBlockBeforeEvent, PlayerInteractWithEntityBeforeEvent, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { Database } from "./database";
import { forceShowForm } from "./ui-utils";

// Helper to give items to player natively without commands, spawning on ground if inventory is full
function giveItemNatively(player: Player, itemTypeId: string, amount: number): void {
    try {
        const inventory = (player as any).getComponent('inventory');
        const container = inventory?.container;
        if (container) {
            const itemStack = new ItemStack(itemTypeId, amount);
            const remaining = container.addItem(itemStack);
            if (remaining && remaining.amount > 0) {
                player.dimension.spawnItem(remaining, player.location);
            }
        } else {
            player.dimension.spawnItem(new ItemStack(itemTypeId, amount), player.location);
        }
    } catch (e) {
        console.error(`[Display Spawner] Error giving item natively: ${e}`);
    }
}

/**
 * Display Spawner Handler
 * Handles admin interactions with display spawner blocks
 * Spawns display entities on top of the blocks when requested
 * Manages shop system for non-admin players
 */

// Initialize databases
const priceDatabase = new Database("DisplaySpawnerPrices");
const configDatabase = new Database("DisplaySpawnerConfig");

// Cooldown system to prevent multiple form opens
const formCooldowns = new Map<string, number>();
const FORM_COOLDOWN_MS = 1000; // 1 second cooldown

// Check if player is on cooldown
function isOnCooldown(playerId: string): boolean {
    const now = Date.now();
    if (formCooldowns.has(playerId)) {
        const lastInteraction = formCooldowns.get(playerId);
        if (lastInteraction !== undefined && now - lastInteraction < FORM_COOLDOWN_MS) {
            return true;
        }
    }
    formCooldowns.set(playerId, now);
    return false;
}

// Get the configured money scoreboard objective (default: "money")
function getMoneyObjective(): string {
    const saved = configDatabase.read("moneyObjective");
    return (saved as string) || "money";
}

// Set the money scoreboard objective
function setMoneyObjective(objective: string): void {
    configDatabase.write("moneyObjective", objective);
}

// Map display spawner blocks to their corresponding display entities
const SPAWNER_TO_ENTITY_MAP: Record<string, string> = {
    "mrleefy:blazespawner_display": "mrleefy:blazestill_display",
    "mrleefy:breezespawner_display": "mrleefy:breezestill_display",
    "mrleefy:chickenspawner_display": "mrleefy:chickenstill_display",
    "mrleefy:cowspawner_display": "mrleefy:cowstill_display",
    "mrleefy:creeperspawner_display": "mrleefy:creeperstill_display",
    "mrleefy:diamondgolemspawner_display": "mrleefy:diamondgolemstill_display",
    "mrleefy:emeraldgolemspawner_display": "mrleefy:emeraldgolemstill_display",
    "mrleefy:endermanspawner_display": "mrleefy:endermanstill_display",
    "mrleefy:goldgolemspawner_display": "mrleefy:goldgolemstill_display",
    "mrleefy:guardianspawner_display": "mrleefy:guardianstill_display",
    "mrleefy:irongolemspawner_display": "mrleefy:irongolemstill_display",
    "mrleefy:magmacubespawner_display": "mrleefy:magmacubestill_display",
    "mrleefy:netheritegolemspawner_display": "mrleefy:netheritegolemstill_display",
    "mrleefy:pigspawner_display": "mrleefy:pigstill_display",
    "mrleefy:piglinbrutespawner_display": "mrleefy:piglinbrutestill_display",
    "mrleefy:ravagerspawner_display": "mrleefy:ravagerstill_display",
    "mrleefy:sheepspawner_display": "mrleefy:sheepstill_display",
    "mrleefy:shulkerspawner_display": "mrleefy:shulkerstill_display",
    "mrleefy:skeletonspawner_display": "mrleefy:skeletonstill_display",
    "mrleefy:slimespawner_display": "mrleefy:slimestill_display",
    "mrleefy:spiderspawner_display": "mrleefy:spiderstill_display",
    "mrleefy:vindicatorspawner_display": "mrleefy:vindicatorstill_display",
    "mrleefy:wardenspawner_display": "mrleefy:wardenstill_display",
    "mrleefy:witherspawner_display": "mrleefy:witherstill_display",
    "mrleefy:witherskeletonspawner_display": "mrleefy:witherskeletonstill_display",
    "mrleefy:zombiespawner_display": "mrleefy:zombiestill_display",
    "mrleefy:villagerspawner_display": "mrleefy:villagerstill_display",
    "mrleefy:enderdragonspawner_display": "mrleefy:enderdragonstill_display",
    "mrleefy:snowmanspawner_display": "mrleefy:snowmanstill_display",
    "mrleefy:amethystcrawlerspawner_display": "mrleefy:amethystcrawlerstill_display",
    "mrleefy:coalcrawlerspawner_display": "mrleefy:coalcrawlerstill_display",
    "mrleefy:coppercrawlerspawner_display": "mrleefy:coppercrawlerstill_display",
    "mrleefy:glowstonecrawlerspawner_display": "mrleefy:glowstonecrawlerstill_display",
    "mrleefy:icecrawlerspawner_display": "mrleefy:icecrawlerstill_display",
    "mrleefy:lapiscrawlerspawner_display": "mrleefy:lapiscrawlerstill_display",
    "mrleefy:obsidiancrawlerspawner_display": "mrleefy:obsidiancrawlerstill_display",
    "mrleefy:quartzcrawlerspawner_display": "mrleefy:quartzcrawlerstill_display",
    "mrleefy:redstonecrawlerspawner_display": "mrleefy:redstonecrawlerstill_display",
    "mrleefy:spongecrawlerspawner_display": "mrleefy:spongecrawlerstill_display"
};

// Default prices for each spawner type
const DEFAULT_PRICES: Record<string, number> = {
    "mrleefy:blazespawner_display": 10000,
    "mrleefy:breezespawner_display": 15000,
    "mrleefy:chickenspawner_display": 5000,
    "mrleefy:cowspawner_display": 5000,
    "mrleefy:creeperspawner_display": 8000,
    "mrleefy:diamondgolemspawner_display": 50000,
    "mrleefy:emeraldgolemspawner_display": 75000,
    "mrleefy:endermanspawner_display": 20000,
    "mrleefy:goldgolemspawner_display": 30000,
    "mrleefy:guardianspawner_display": 12000,
    "mrleefy:irongolemspawner_display": 15000,
    "mrleefy:magmacubespawner_display": 9000,
    "mrleefy:netheritegolemspawner_display": 100000,
    "mrleefy:pigspawner_display": 4000,
    "mrleefy:piglinbrutespawner_display": 18000,
    "mrleefy:ravagerspawner_display": 25000,
    "mrleefy:sheepspawner_display": 4500,
    "mrleefy:shulkerspawner_display": 15000,
    "mrleefy:skeletonspawner_display": 7000,
    "mrleefy:slimespawner_display": 8000,
    "mrleefy:spiderspawner_display": 6500,
    "mrleefy:vindicatorspawner_display": 11000,
    "mrleefy:wardenspawner_display": 150000,
    "mrleefy:witherspawner_display": 200000,
    "mrleefy:witherskeletonspawner_display": 10000,
    "mrleefy:zombiespawner_display": 6000,
    "mrleefy:villagerspawner_display": 12000,
    "mrleefy:enderdragonspawner_display": 250000,
    "mrleefy:snowmanspawner_display": 6000,
    "mrleefy:amethystcrawlerspawner_display": 15000,
    "mrleefy:coalcrawlerspawner_display": 8000,
    "mrleefy:coppercrawlerspawner_display": 10000,
    "mrleefy:glowstonecrawlerspawner_display": 12000,
    "mrleefy:icecrawlerspawner_display": 10000,
    "mrleefy:lapiscrawlerspawner_display": 12000,
    "mrleefy:obsidiancrawlerspawner_display": 30000,
    "mrleefy:quartzcrawlerspawner_display": 15000,
    "mrleefy:redstonecrawlerspawner_display": 12000,
    "mrleefy:spongecrawlerspawner_display": 15000
};

// Get friendly name from block ID
function getFriendlyName(blockId: string): string {
    const name = blockId.replace("mrleefy:", "").replace("spawner_display", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
}

// Get the actual spawner item ID (level 1) from display block
function getActualSpawnerItem(blockId: string): string {
    // Convert display block ID to actual spawner item ID
    // Example: mrleefy:blazespawner_display -> mrleefy:blazespawner1
    // Special case for golems: mrleefy:diamondgolemspawner_display -> mrleefy:diamond_golem_spawner1

    // Fix golem naming (add underscore back)
    let itemId = blockId.replace("_display", "1");

    // Handle golem spawners - they need underscores in the actual item name
    itemId = itemId.replace("diamondgolemspawner", "diamond_golem_spawner");
    itemId = itemId.replace("emeraldgolemspawner", "emerald_golem_spawner");
    itemId = itemId.replace("goldgolemspawner", "gold_golem_spawner");
    itemId = itemId.replace("irongolemspawner", "iron_golem_spawner");
    itemId = itemId.replace("netheritegolemspawner", "netherite_golem_spawner");

    return itemId;
}

// Get price for a spawner type
function getPrice(blockId: string): number {
    const savedPrice = priceDatabase.read(blockId);
    return savedPrice !== undefined ? (savedPrice as number) : DEFAULT_PRICES[blockId] || 10000;
}

// Set price for a spawner type
function setPrice(blockId: string, price: number): void {
    priceDatabase.write(blockId, price);
}

// Get player's money from configured scoreboard objective
function getPlayerMoney(player: Player): number {
    try {
        const objectiveName = getMoneyObjective();
        const moneyObjective = world.scoreboard.getObjective(objectiveName);
        if (moneyObjective) {
            try {
                const score = moneyObjective.getScore(player);
                if (score !== undefined && score !== null) {
                    return score;
                }
            } catch (scoreError) {
                // If getScore fails, the player's identity is not yet resolved or has no score set.
                // Fallback to running a command to initialize them to 0 safely.
                try {
                    moneyObjective.setScore(player, 0);
                    return 0;
                } catch (cmdError) { /* ignore */ }
            }
        }
        return 0;
    } catch (error) {
        return 0;
    }
}

// Remove money from player using configured scoreboard objective
function removePlayerMoney(player: Player, amount: number): boolean {
    try {
        const objectiveName = getMoneyObjective();
        const moneyObjective = world.scoreboard.getObjective(objectiveName);
        if (moneyObjective) {
            const score = moneyObjective.getScore(player) ?? 0;
            if (score >= amount) {
                moneyObjective.setScore(player, score - amount);
                return true;
            }
        }
        return false;
    } catch (error) {
        console.warn(`[Display Spawner] Error removing player money: ${error}`);
        return false;
    }
}

/**
 * Shows the admin form to the player
 */
async function showAdminForm(player: Player, blockId: string, blockLocation: Vector3): Promise<void> {
    const entityId = SPAWNER_TO_ENTITY_MAP[blockId];
    if (!entityId) return;
    const mobName = getFriendlyName(blockId);
    const currentPrice = getPrice(blockId);
    const moneyObjective = getMoneyObjective();

    const form = new ActionFormData()
        .title("§l§6Admin: Display Spawner")
        .body(`§7${mobName} Display Spawner\n§eCurrent Price: §7$${currentPrice.toLocaleString()}\n§7Money Objective: §e${moneyObjective}\n\n§8§oTip: To remove display entities, hit them with a wooden axe`)
        .button("§8Spawn Display Entity", "textures/ui/confirm")
        .button("§8Change Price", "textures/ui/icon_setting")
        .button("§8Change Money Objective", "textures/items/emerald")
        .button("§cClose", "textures/ui/cancel");

    try {
        const response = await forceShowForm(player, form);

        if (response.canceled) {
            return;
        }

        if (response.selection === 0) {
            // Spawn entity
            spawnDisplayEntity(player, entityId, blockLocation, mobName);
        } else if (response.selection === 1) {
            // Change price 
            await showChangePriceForm(player, blockId, blockLocation);
        } else if (response.selection === 2) {
            // Change money objective 
            await showChangeMoneyObjectiveForm(player, blockId, blockLocation);
        }
    } catch (error) {
        console.warn(`[Display Spawner] Error showing admin form: ${error}`);
    }
}

/**
 * Shows the price change form to admins
 */
async function showChangePriceForm(player: Player, blockId: string, blockLocation: Vector3): Promise<void> {
    const mobName = getFriendlyName(blockId);
    const currentPrice = getPrice(blockId);

    const form = (new ModalFormData() as any)
        .title("§l§6Change Spawner Price")
        .textField(
            `§7Set price for §e${mobName} Spawner\n§7Current: §a$${currentPrice.toLocaleString()}\n\n§7Enter new price:`,
            "e.g., 50000",
            currentPrice.toString()
        );

    try {
        const response = await forceShowForm(player, form);

        if (response.canceled || !response.formValues) {
            return;
        }

        const newPrice = Number(response.formValues[0]);

        // Validate the input
        if (isNaN(newPrice) || newPrice < 1) {
            player.sendMessage(`§c✗ Invalid price! Please enter a number greater than 0.`);
            await showAdminForm(player, blockId, blockLocation);
            return;
        }

        setPrice(blockId, newPrice);
        player.sendMessage(`§a✓ Price updated to §e$${newPrice.toLocaleString()} §afor ${mobName} Spawner!`);

        // Show admin form again
        await showAdminForm(player, blockId, blockLocation);
    } catch (error) {
        console.warn(`[Display Spawner] Error showing price form: ${error}`);
    }
}

/**
 * Shows the money objective change form to admins
 */
async function showChangeMoneyObjectiveForm(player: Player, blockId: string, blockLocation: Vector3): Promise<void> {
    const currentObjective = getMoneyObjective();

    const form = (new ModalFormData() as any)
        .title("§l§6Change Money Objective")
        .textField(
            `§7Enter the scoreboard objective name for money\n§7Current: §e${currentObjective}\n\n§7Common examples:\n§7- money\n§7- balance\n§7- coins\n§7- cash\n\n§7Objective Name:`,
            "e.g., money",
            currentObjective
        );

    try {
        const response = await forceShowForm(player, form);

        if (response.canceled || !response.formValues) {
            return;
        }

        const newObjective = (response.formValues[0] as string).trim();

        if (!newObjective || newObjective.length === 0) {
            player.sendMessage(`§c✗ Invalid objective name!`);
            await showAdminForm(player, blockId, blockLocation);
            return;
        }

        // Create the objective if it doesn't exist, then add all players
        try {
            let objective = world.scoreboard.getObjective(newObjective);
            if (!objective) {
                // Create the objective
                objective = world.scoreboard.addObjective(newObjective, newObjective);
                player.sendMessage(`§a✓ Created scoreboard objective: §e${newObjective}`);
            }

            // Add all current players to the objective with score 0 if they don't have a score
            const allPlayers = world.getAllPlayers();
            let addedCount = 0;
            for (const p of allPlayers) {
                try {
                    const currentScore = objective.getScore(p);
                    if (currentScore === undefined || currentScore === null) {
                        objective.setScore(p, 0);
                        addedCount++;
                    }
                } catch (e) {
                    // Player not on scoreboard, add them
                    try {
                        objective.setScore(p, 0);
                        addedCount++;
                    } catch (innerError) {
                        console.warn(`[Display Spawner] Could not add ${p.name} to scoreboard: ${innerError}`);
                    }
                }
            }

            if (addedCount > 0) {
                player.sendMessage(`§a✓ Added §e${addedCount} §aplayer(s) to scoreboard with starting balance of §e$0`);
            }
        } catch (error: any) {
            player.sendMessage(`§c✗ Error setting up objective: ${error.message}`);
            await showAdminForm(player, blockId, blockLocation);
            return;
        }

        setMoneyObjective(newObjective);
        player.sendMessage(`§a✓ Money objective updated to §e${newObjective}§a!`);

        // Show admin form again
        await showAdminForm(player, blockId, blockLocation);
    } catch (error) {
        console.warn(`[Display Spawner] Error showing money objective form: ${error}`);
    }
}

/**
 * Shows the shop form to non-admin players
 */
async function showShopForm(player: Player, blockId: string): Promise<void> {
    const mobName = getFriendlyName(blockId);
    const price = getPrice(blockId);
    const playerMoney = getPlayerMoney(player);
    const maxAffordable = Math.min(64, Math.floor(playerMoney / price));
    const actualSpawnerItem = getActualSpawnerItem(blockId);

    if (maxAffordable === 0) {
        player.sendMessage(`§c✗ You don't have enough money! §e${mobName} Spawner §ccosts §a$${price.toLocaleString()}`);
        return;
    }

    const form = (new ModalFormData() as any)
        .title("§l§5Spawner Shop")
        .slider(
            `§7${mobName} Spawner (Level 1)\n` +
            `§7Price: §a$${price.toLocaleString()} §7each\n` +
            `§7Your Money: §a$${playerMoney.toLocaleString()}\n` +
            `§7Max Affordable: §e${maxAffordable}\n\n` +
            `§7Select quantity:`,
            1,
            maxAffordable,
            1,
            1
        );

    try {
        const response = await forceShowForm(player, form);

        if (response.canceled || !response.formValues) {
            return;
        }

        const quantity = response.formValues[0] as number;
        const totalCost = quantity * price;

        // Verify player still has enough money
        const currentMoney = getPlayerMoney(player);
        if (currentMoney < totalCost) {
            player.sendMessage(`§c✗ You don't have enough money! Need §a$${totalCost.toLocaleString()}`);
            return;
        }

        // Process purchase - give actual functional spawners (level 1)
        if (removePlayerMoney(player, totalCost)) {
            giveItemNatively(player, actualSpawnerItem, quantity);
            player.sendMessage(`§a✓ Purchased §e${quantity}x ${mobName} Spawner (Lvl 1) §afor §e$${totalCost.toLocaleString()}§a!`);
        } else {
            player.sendMessage(`§c✗ Transaction failed!`);
        }
    } catch (error) {
        console.warn(`[Display Spawner] Error showing shop form: ${error}`);
    }
}

/**
 * Spawns the display entity on top of the spawner block
 */
function spawnDisplayEntity(player: Player, entityId: string, blockLocation: Vector3, mobName: string): void {
    try {
        const dimension = player.dimension;

        // Calculate spawn position (center of block, on top)
        const spawnLocation = {
            x: blockLocation.x + 0.5,
            y: blockLocation.y + 1,
            z: blockLocation.z + 0.5
        };

        // Spawn the entity
        const entity = dimension.spawnEntity(entityId as any, spawnLocation);

        if (entity) {
            player.sendMessage(`§a✓ Successfully spawned ${mobName} Display Entity!`);
        } else {
            player.sendMessage(`§c✗ Failed to spawn entity. Please try again.`);
        }
    } catch (error: any) {
        player.sendMessage(`§c✗ Error spawning entity: ${error.message}`);
        console.warn(`[Display Spawner] Error spawning entity: ${error}`);
    }
}

/**
 * Handles player interaction with display spawner blocks
 */
if ('playerInteractWithBlock' in world.beforeEvents) {
    (world.beforeEvents as any).playerInteractWithBlock.subscribe((event: PlayerInteractWithBlockBeforeEvent) => {
        const { player, block } = event;

        // Check if the block is a display spawner
        const blockId = block.typeId;
        if (!SPAWNER_TO_ENTITY_MAP[blockId]) {
            return; // Not a display spawner block
        }

        // Cancel the default interaction
        event.cancel = true;

        // Check cooldown to prevent multiple form opens
        if (isOnCooldown(player.id)) {
            return; // Player is on cooldown
        }

        // Show the appropriate form on the next tick (required for forms in beforeEvents)
        system.run(async () => {
            // Admin must be sneaking to access admin panel, otherwise they see the shop (for testing)
            if (player.hasTag("admin") && player.isSneaking) {
                // Show admin form with spawn entity + change price options
                await showAdminForm(player, blockId, block.location);
            } else {
                // Show shop form for non-admin players (and admins who aren't sneaking)
                await showShopForm(player, blockId);
            }
        });
    });
}

/**
 * Handles player interaction with display entities (on top of spawner blocks)
 */
if ('playerInteractWithEntity' in world.beforeEvents) {
    (world.beforeEvents as any).playerInteractWithEntity.subscribe((event: PlayerInteractWithEntityBeforeEvent) => {
        const { player, target: entity } = event;

        // Check if the entity is a display entity
        const entityId = entity.typeId;
        if (!entityId.endsWith("still_display")) {
            return; // Not a display entity
        }

        // Find the corresponding block type
        let blockId: string | null = null;
        for (const [block, ent] of Object.entries(SPAWNER_TO_ENTITY_MAP)) {
            if (ent === entityId) {
                blockId = block;
                break;
            }
        }

        if (!blockId) {
            return; // No matching block found
        }

        // Get the block underneath the entity (should be the display spawner)
        const entityLocation = entity.location;
        const blockLocation = {
            x: Math.floor(entityLocation.x),
            y: Math.floor(entityLocation.y) - 1, // Block is below the entity
            z: Math.floor(entityLocation.z)
        };

        try {
            const dimension = entity.dimension;
            const block = dimension.getBlock(blockLocation);

            // Verify it's the correct display spawner block
            if (!block || block.typeId !== blockId) {
                // Block underneath doesn't match, still show the form but without block location
                console.warn(`[Display Spawner] Entity ${entityId} found but block underneath is ${block?.typeId || 'null'}`);
            }

            // Cancel the default interaction
            event.cancel = true;

            // Check cooldown to prevent multiple form opens
            if (isOnCooldown(player.id)) {
                return; // Player is on cooldown
            }

            const finalBlockId = blockId;
            // Show the appropriate form on the next tick
            system.run(async () => {
                // Admin must be sneaking to access admin panel, otherwise they see the shop (for testing)
                if (player.hasTag("admin") && player.isSneaking) {
                    // Show admin form with spawn entity + change price options
                    await showAdminForm(player, finalBlockId, blockLocation);
                } else {
                    // Show shop form for non-admin players (and admins who aren't sneaking)
                    await showShopForm(player, finalBlockId);
                }
            });
        } catch (error) {
            console.warn(`[Display Spawner] Error handling entity interaction: ${error}`);
        }
    });
}

/**
 * Admin feature: Remove display entities by hitting them with a wooden axe
 */
world.afterEvents.entityHitEntity.subscribe((event: EntityHitEntityAfterEvent) => {
    const { damagingEntity, hitEntity } = event;

    // Check if the damaging entity is a player
    if (!damagingEntity || damagingEntity.typeId !== "minecraft:player") {
        return;
    }

    const player = damagingEntity as Player;

    if (!player || !player.isValid) return;

    // Check if player has admin tag
    if (!player.hasTag("admin")) {
        return;
    }

    // Check if player is holding a wooden axe
    const inventory = player.getComponent("inventory") as EntityInventoryComponent | undefined;
    if (!inventory || !inventory.container) {
        return;
    }

    const selectedSlot = player.selectedSlotIndex;
    const heldItem = inventory.container.getItem(selectedSlot);

    if (!heldItem || heldItem.typeId !== "minecraft:wooden_axe") {
        return;
    }

    // Check if the hit entity is a display entity
    if (!hitEntity || !hitEntity.isValid || !hitEntity.typeId.endsWith("still_display")) {
        return;
    }

    // Remove the entity
    try {
        const entityName = hitEntity.typeId.replace("mrleefy:", "").replace("still_display", "");
        const friendlyName = entityName.charAt(0).toUpperCase() + entityName.slice(1);

        hitEntity.remove();
        player.sendMessage(`§a✓ Removed ${friendlyName} Display Entity!`);
    } catch (error: any) {
        player.sendMessage(`§c✗ Error removing entity: ${error.message}`);
        console.warn(`[Display Spawner] Error removing display entity: ${error}`);
    }
});

console.warn("[Display Spawner Handler] Loaded successfully!");

// Initialize scoreboard objectives on world load
system.run(() => {
    try {
        const moneyObjective = getMoneyObjective();

        // Try to get existing objective, or create if doesn't exist
        let objective = world.scoreboard.getObjective(moneyObjective);
        if (!objective) {
            objective = world.scoreboard.addObjective(moneyObjective, moneyObjective);
            console.warn(`[Display Spawner] Created scoreboard objective: ${moneyObjective}`);
        } else {
            console.warn(`[Display Spawner] Scoreboard objective already exists: ${moneyObjective}`);
        }
    } catch (error) {
        console.warn(`[Display Spawner] Error initializing scoreboard: ${error}`);
    }
});

// Add players to scoreboard when they first spawn
world.afterEvents.playerSpawn.subscribe((event: PlayerSpawnAfterEvent) => {
    try {
        const { player, initialSpawn } = event;

        // Only handle initial spawn (when player joins for the first time)
        if (!initialSpawn) return;

        const moneyObjective = getMoneyObjective();

        // Delay execution by 80 ticks (4 seconds) to ensure native profile/identity loads
        system.runTimeout(() => {
            try {
                if (!player.isValid) return;
                const objective = world.scoreboard.getObjective(moneyObjective);
                if (objective) {
                    objective.setScore(player, objective.getScore(player) ?? 0);
                    console.warn(`[Display Spawner] Initialized ${player.name} on scoreboard ${moneyObjective}`);
                }
            } catch (error) {
                // If fails (already exists or still unresolved), ignore
            }
        }, 80);
    } catch (error) {
        console.warn(`[Display Spawner] Error in playerSpawn handler: ${error}`);
    }
});

