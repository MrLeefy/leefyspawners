import {
    world,
    system,
    MolangVariableMap,
    PlayerBreakBlockBeforeEvent,
    PistonActivateAfterEvent,
    ExplosionBeforeEvent,
    PlayerPlaceBlockAfterEvent,
    PlayerInteractWithBlockBeforeEvent,
    Block,
    Dimension,
    Player
} from "@minecraft/server";
import {
    ActionFormData,
    ModalFormData
} from "@minecraft/server-ui";

import { Database } from "./database";
import { Vector3 } from "./VectorMath/index";
import { configDatabase, debugLog, clearMaxedSpawnerCache } from "./mobstacker-core";
import { TIMING, UI, ERROR_MESSAGES, VALIDATION } from "./constants";

// Define shared cooldown map here and export it for other scripts
export const cooldowns = new Map<string, number>();

// Initialize the database for spawner locations
const spawnerDatabase = new Database("SpawnerLocations");

// Custom character mapping
const charMap = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const activeForms = new Map<string, any>();

// Memory limits for player interaction tracking
const PLAYER_MEMORY_LIMITS = {
    ACTIVE_FORMS: 100,        // Max 100 concurrent form interactions
    MESSAGE_TIMES: 500,       // Max 500 message timestamps
    INTERACTION_TIMESTAMPS: 200, // Max 200 interaction timestamps
    COOLDOWNS: 1000          // Max 1000 active cooldowns
};

// Player session cleanup interval - more aggressive cleanup
const PLAYER_CLEANUP_INTERVAL = 150 * 20; // Every 2.5 minutes

const cooldownTime = TIMING.FORM_COOLDOWN;
const messageTimes = new Map<string, number>();
const messageDelay = TIMING.MESSAGE_DELAY;

// Hook into the playerBreakBlock event to prevent breaking certain blocks
world.beforeEvents.playerBreakBlock.subscribe((data: PlayerBreakBlockBeforeEvent) => {
    const { player, block } = data;
    const coordinates = `${block.x},${block.y},${block.z}`;

    // Early return for non-spawner blocks (most common case)
    if (!spawnerDatabase.has(coordinates) && !activeForms.has(coordinates)) {
        return;
    }

    // Check if the block has an active form
    if (activeForms.has(coordinates)) {
        const activeData = activeForms.get(coordinates);
        const activeTime = activeData.timestamp || Date.now();
        if (Date.now() - activeTime > 5 * 60 * 1000) {
            activeForms.delete(coordinates);
        } else {
            data.cancel = true;
            player.sendMessage("§cThis block cannot be broken while it is being used.");
            return;
        }
    }

    // Check if the block is recorded in the spawner database
    if (spawnerDatabase.has(coordinates)) {
        spawnerDatabase.delete(coordinates);
        // Remove associated spawnrule entity asynchronously (skip for display spawners)
        if (!block.typeId.endsWith('_display')) {
            system.run(() => removeSpawnruleAtLocation(block.x, block.y, block.z, block.dimension));
        }
    } else {
        // Check nearby locations if the exact location isn't found
        const nearbyRadius = 1;
        const dimension = block.dimension;
        for (let dx = -nearbyRadius; dx <= nearbyRadius; dx++) {
            for (let dy = -nearbyRadius; dy <= nearbyRadius; dy++) {
                for (let dz = -nearbyRadius; dz <= nearbyRadius; dz++) {
                    const nearbyCoordinates = `${block.x + dx},${block.y + dy},${block.z + dz}`;
                    if (spawnerDatabase.has(nearbyCoordinates)) {
                        const nearbyBlock = dimension.getBlock(new Vector3(block.x + dx, block.y + dy, block.z + dz));
                        if (!nearbyBlock || !nearbyBlock.typeId.startsWith('mrleefy:')) {
                            spawnerDatabase.delete(nearbyCoordinates);
                            if (!nearbyBlock || !nearbyBlock.typeId.endsWith('_display')) {
                                removeSpawnruleAtLocation(block.x + dx, block.y + dy, block.z + dz, dimension);
                            }
                        }
                    }
                }
            }
        }
    }
});

// Handle piston block movement - remove spawnrule entities when spawner blocks are moved
world.afterEvents.pistonActivate.subscribe((eventData: PistonActivateAfterEvent) => {
    try {
        const dimension = eventData.dimension;
        const attachedBlocks = eventData.piston.getAttachedBlocksLocations();

        // Check all attached blocks for spawner blocks
        for (const blockCoord of attachedBlocks) {
            const block = dimension.getBlock(blockCoord);
            if (block && block.typeId.startsWith('mrleefy:') && block.typeId.includes('spawner') && !block.typeId.endsWith('_display')) {
                // Remove spawnrule entity at this location since the block is being moved
                removeSpawnruleAtLocation(blockCoord.x, blockCoord.y, blockCoord.z, dimension);
                
                // Securely remove database entry to prevent desync
                const coordinates = `${blockCoord.x},${blockCoord.y},${blockCoord.z}`;
                if (spawnerDatabase.has(coordinates)) {
                    spawnerDatabase.delete(coordinates);
                }
            }
        }
    } catch (error) {
        console.error('Error in piston event handler:', error);
    }
});

world.beforeEvents.explosion.subscribe((eventData: ExplosionBeforeEvent) => {
    const dimension = eventData.dimension;
    // Filter the impacted blocks to exclude spawner blocks in the correct dimension
    const allowedBlocks = eventData.getImpactedBlocks().filter(blockCoord => {
        const block = dimension.getBlock(new Vector3(blockCoord.x, blockCoord.y, blockCoord.z));
        if (block && block.typeId.startsWith('mrleefy:') && block.typeId.includes('spawner') && !block.typeId.endsWith('_display')) {
            return false; // Do not allow explosion to destroy functional spawner blocks
        }
        return true; // Allow destruction of other blocks
    });

    eventData.setImpactedBlocks(allowedBlocks);
});

// Function to encode the coordinates using a custom character mapping
function encodeCoordinates(x: number, y: number, z: number): string {
    const shift = 3;
    const encodedX = charMap[(x + shift) % charMap.length];
    const encodedY = charMap[(y + shift) % charMap.length];
    const encodedZ = charMap[(z + shift) % charMap.length];
    return `X${encodedX}Y${encodedY}Z${encodedZ}`;
}

// Function to decode the encoded coordinates
function decodeCoordinates(encodedString: string): { x: number; y: number; z: number } | null {
    const match = encodedString.match(/X(.)Y(.)Z(.)/);
    if (match) {
        const x = charMap.indexOf(match[1]);
        const y = charMap.indexOf(match[2]);
        const z = charMap.indexOf(match[3]);
        return { x, y, z };
    }
    return null;
}

world.afterEvents.playerPlaceBlock.subscribe((data: PlayerPlaceBlockAfterEvent) => {
    const player = data.player;
    const block = data.block;
    const typeId = block.typeId;

    if (typeId.startsWith('mrleefy:')) {
        if (typeId.endsWith('_display')) {
            return;
        }

        const coordinates = `${block.x},${block.y},${block.z}`;
        const spawnerData = {
            typeId,
            placedBy: player.name || player.nameTag || 'Unknown',
            placedAt: Date.now(),
            entitiesKilled: 0,
            lastAccessed: Date.now()
        };
        spawnerDatabase.write(coordinates, spawnerData);

        try {
            player.runCommand(`summon mrleefy:spawnrule "${typeId}" ${block.x} ${block.y} ${block.z}`);
        } catch (error) {
            console.error("Error executing command:", error);
        }
    }
});

// SINGLE MERGED AND SECURE BLOCK INTERACTION HANDLER
function handleSpawnerBlockInteraction(player: Player, block: Block, cancelableEvent: { cancel: boolean }) {
    const coordinates = `${block.x},${block.y},${block.z}`;
    const typeId = block.typeId;

    // Early return for non-spawner blocks
    if (!typeId || !typeId.startsWith('mrleefy:') || !typeId.includes('spawner')) {
        return;
    }

    // Exclude display spawner blocks
    if (typeId.endsWith('_display')) {
        return;
    }

    cancelableEvent.cancel = true; // Cancel the interaction event

    // Prevent interaction if anyone is currently interacting with the block
    if (activeForms.has(coordinates)) {
        const activeData = activeForms.get(coordinates);
        const interactingPlayer = activeData.player || activeData;
        const activeTime = activeData.timestamp || Date.now();
        if (Date.now() - activeTime > 5 * 60 * 1000) {
            activeForms.delete(coordinates);
        } else if (interactingPlayer.id !== player.id) {
            player.sendMessage("§7This §cspawner§7 is currently in use, §cplease wait...");
            return;
        }
    }

    // Dynamic Database Fallback Check (auto-register missing blocks)
    updateSpawnerDatabaseOnInteraction(coordinates, typeId, player);

    // Open form
    system.run(() => {
        const spawnerType = typeId.replace('mrleefy:', '').replace(/spawner\d*/, '');
        const levelMatch = typeId.match(/\d*$/);
        const level = levelMatch ? Number(levelMatch[0]) : 0;

        const c = 10000;
        const y = 100;
        const cost = level * c;
        const upgradee = level + 1;
        const downgradee = level - 1;
        const refu = 77;
        const percentrefund = (cost / y) * refu;

        form1(player, level, cost, block, typeId, upgradee, downgradee, percentrefund, refu, spawnerType, block.x, block.y, block.z);
    });
}

if ('playerInteractWithBlock' in world.beforeEvents) {
    (world.beforeEvents as any).playerInteractWithBlock.subscribe((data: PlayerInteractWithBlockBeforeEvent) => {
        handleSpawnerBlockInteraction(data.player, data.block, data);
    });
} else {
    (world.beforeEvents as any).itemUseOn.subscribe((data: any) => {
        handleSpawnerBlockInteraction(data.source, data.block, data);
    });
}

function isPlayerNearBlock(player: Player, x: number, y: number, z: number, maxDistance = 10): boolean {
    if (!player || !player.isValid) return false;
    const pLoc = player.location;
    const dx = pLoc.x - (x + 0.5);
    const dy = pLoc.y - (y + 0.5);
    const dz = pLoc.z - (z + 0.5);
    return (dx * dx + dy * dy + dz * dz) <= (maxDistance * maxDistance);
}

function validateSpawnerInteraction(player: Player, block: Block, level: number, x: number, y: number, z: number): boolean {
    if (!player || !player.isValid) {
        console.error(ERROR_MESSAGES.INVALID_PLAYER);
        return false;
    }
    if (!isPlayerNearBlock(player, x, y, z, 10)) {
        player.sendMessage("§cYou are too far from the spawner.");
        return false;
    }
    if (!block || !block.isValid) {
        player.sendMessage(ERROR_MESSAGES.INVALID_BLOCK);
        return false;
    }
    if (typeof level !== 'number' || level < VALIDATION.MIN_LEVEL || level > VALIDATION.MAX_LEVEL) {
        console.error(`Invalid level provided: ${level}`);
        player.sendMessage(ERROR_MESSAGES.INVALID_LEVEL);
        return false;
    }
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        console.error(ERROR_MESSAGES.INVALID_COORDINATES);
        player.sendMessage(ERROR_MESSAGES.INVALID_COORDINATES);
        return false;
    }
    return true;
}

function checkPlayerCooldown(player: Player, coordinates: string): boolean {
    const currentTime = Date.now();
    const key = player.name; // Persistent gamertag instead of runtime Entity ID

    if (cooldowns.has(key)) {
        const lastInteractionTime = cooldowns.get(key)!;
        const timeSinceLastInteraction = currentTime - lastInteractionTime;
        if (timeSinceLastInteraction < cooldownTime) {
            const remainingTime = Math.ceil((cooldownTime - timeSinceLastInteraction) / 1000);

            if (!messageTimes.has(key) || currentTime - messageTimes.get(key)! > messageDelay) {
                player.sendMessage(`§cWait ${remainingTime}s before interacting again.`);
                messageTimes.set(key, currentTime);
            }
            return false;
        }
    }

    activeForms.set(coordinates, { player, timestamp: currentTime });
    cooldowns.set(key, currentTime);
    return true;
}

function ensureSpawnruleEntity(player: Player, x: number, y: number, z: number, typeId: string): void {
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        console.error(`Invalid coordinates: x=${x}, y=${y}, z=${z}`);
        return;
    }
    if (!typeId || typeof typeId !== 'string') {
        console.error(`Invalid typeId: ${typeId}`);
        return;
    }

    try {
        player.runCommand(`execute as @e[type=mrleefy:spawnrule,x=${x},y=${y},z=${z},dx=0.1,dy=0.1,dz=0.1] run tag @s add existing`);
    } catch (cmdError) {
        console.error(`Error tagging existing spawnrule: ${cmdError}`);
    }

    try {
        player.runCommand(`execute unless entity @e[type=mrleefy:spawnrule,x=${x},y=${y},z=${z},dx=0.1,dy=0.1,dz=0.1,tag=existing] run summon mrleefy:spawnrule "${typeId}" ${x} ${y} ${z}`);
    } catch (cmdError) {
        console.error(`Error summoning spawnrule: ${cmdError}`);
    }
}

function createSpawnerForm(player: Player, level: number, upgradee: number, downgradee: number, spawnerType: string, block: Block, typeId: string, percentrefund: number, refu: number, x: number, y: number, z: number, coordinates: string): any {
    const form1 = new ActionFormData();
    form1.title(`§l§8${spawnerType}Spawner§2§r`);
    form1.body(`§7§l\n                §7Level: §2${level}§r\n\n`);

    const buttonActions: (() => void)[] = [];

    if (level < UI.MAX_SPAWNER_LEVEL) {
        form1.button(`§l§2Upgrade§8 to Lvl ${upgradee}`, 'textures/carrot_golden');
        buttonActions.push(() => upgradeSpawner(player, block, level, spawnerType, typeId, x, y, z));
    }

    if (level < UI.MAX_SPAWNER_LEVEL) {
        form1.button(`§l§2Upgrade Max`, 'textures/items/netherite_ingot');
        buttonActions.push(() => maxUpgradeSpawner(player, block, level, spawnerType, typeId, x, y, z));
    }

    if (level > UI.MIN_SPAWNER_LEVEL) {
        form1.button(`§l§8Downgrade [§4${downgradee}§8]`, 'textures/carrot');
        buttonActions.push(() => downgrade(player, block, level, spawnerType, percentrefund, refu, x, y, z));
    }

    form1.button(`§l§2Teleport Stack Here`, 'textures/items/ender_eye');
    buttonActions.push(() => teleportSpawnerStack(player, block, spawnerType, x, y, z));

    form1.button(`§l§8Instructions`, 'textures/items/book_enchanted.png');
    buttonActions.push(() => showInstructions(player));

    if (player.hasTag(UI.OWNER_PERMISSION_TAG)) {
        form1.button(`§8§lChoose Level`, 'textures/items/diamond');
        const chooseLevelAction = () =>
            slider(player, spawnerType, block, level, 10000 * level, typeId, upgradee, downgradee, percentrefund, refu, x, y, z);
        (chooseLevelAction as any).isNested = true;
        buttonActions.push(chooseLevelAction);
    }

    form1.button(`§l§8Close`, 'textures/ruby');
    buttonActions.push(() => exit(player));

    return { form: form1, buttonActions };
}

function form1(player: Player, level: number, cost: number, block: Block, typeId: string, upgradee: number, downgradee: number, percentrefund: number, refu: number, spawnerType: string, x: number, y: number, z: number): void {
    const coordinates = `${x},${y},${z}`;

    if (!validateSpawnerInteraction(player, block, level, x, y, z)) {
        return;
    }

    if (!checkPlayerCooldown(player, coordinates)) {
        return;
    }

    ensureSpawnruleEntity(player, x, y, z, typeId);

    const { form, buttonActions } = createSpawnerForm(player, level, upgradee, downgradee, spawnerType, block, typeId, percentrefund, refu, x, y, z, coordinates);

    system.run(() => {
        form.show(player).then((response: any) => {
            const isNested = response.selection !== undefined && buttonActions[response.selection] && (buttonActions[response.selection] as any).isNested;
            if (!isNested) {
                activeForms.delete(coordinates);
            } else {
                activeForms.set(coordinates, { player, timestamp: Date.now() });
            }

            const dimension = block.dimension;
            const currentBlock = dimension.getBlock(new Vector3(x, y, z));
            if (!currentBlock || currentBlock.typeId !== typeId) {
                player.sendMessage(ERROR_MESSAGES.INVALID_BLOCK);
                spawnerDatabase.delete(coordinates);
                activeForms.delete(coordinates);
                return;
            }

            if (response.selection !== undefined && buttonActions[response.selection]) {
                buttonActions[response.selection]();
            }
        }).catch(() => {
            activeForms.delete(coordinates);
        });
    });
}

const interactionTimestamps = new Map<string, number[]>();
const globalCooldowns = new Map<string, number>();
const INTERACTION_WINDOW_MILLIS = 120 * 1000;
const INTERACTION_LIMIT = 3;
const GLOBAL_COOLDOWN_MILLIS = 10 * 60 * 1000;

function teleportSpawnerStack(player: Player, block: Block, spawnerType: string, x: number, y: number, z: number): void {
    if (!player || !player.isValid) {
        console.error("Invalid player provided to teleportSpawnerStack");
        return;
    }
    if (!isPlayerNearBlock(player, x, y, z, 10)) {
        player.sendMessage("§cYou are too far from the spawner.");
        return;
    }
    if (!block || !block.isValid) {
        player.sendMessage("§cInvalid spawner block detected.");
        return;
    }
    if (!spawnerType || typeof spawnerType !== 'string') {
        console.error(`Invalid spawnerType provided: ${spawnerType}`);
        player.sendMessage("§cInvalid spawner type detected.");
        return;
    }
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
        console.error("Invalid coordinates provided to teleportSpawnerStack");
        player.sendMessage("§cInvalid spawner location detected.");
        return;
    }

    const currentTime = Date.now();
    const key = player.name; // Persistent gamertag instead of runtime Entity ID

    if (globalCooldowns.has(key)) {
        const lastCooldownTime = globalCooldowns.get(key)!;
        const timeElapsed = currentTime - lastCooldownTime;

        if (timeElapsed < GLOBAL_COOLDOWN_MILLIS) {
            const remainingSeconds = Math.ceil((GLOBAL_COOLDOWN_MILLIS - timeElapsed) / 1000);
            player.sendMessage(`§dPlease wait ${remainingSeconds}s before teleporting entity stacks...`);
            return;
        } else {
            globalCooldowns.delete(key);
        }
    }

    if (!interactionTimestamps.has(key)) {
        interactionTimestamps.set(key, []);
    }
    const timestamps = interactionTimestamps.get(key)!;

    while (timestamps.length > 0 && currentTime - timestamps[0] > INTERACTION_WINDOW_MILLIS) {
        timestamps.shift();
    }

    timestamps.push(currentTime);

    if (timestamps.length > INTERACTION_LIMIT) {
        globalCooldowns.set(key, currentTime);
        const remainingSeconds = Math.ceil(GLOBAL_COOLDOWN_MILLIS / 1000);
        player.sendMessage(`§dPlease wait ${remainingSeconds}s before teleporting entity stacks...`);
        return;
    }

    const dimension = block.dimension;
    const searchRadius = configDatabase.read("stackRadius") || 50;

    const sanitizedSpawnerType = spawnerType.replace(/_/g, '');
    const entityType = `mrleefy:${sanitizedSpawnerType}still`;

    const nearbyEntities = dimension.getEntities({
        type: entityType,
        location: block.location,
        maxDistance: searchRadius,
    });

    if (!nearbyEntities || nearbyEntities.length === 0) {
        player.sendMessage(`§cNo entities of type ${sanitizedSpawnerType} found near the spawner.`);
        return;
    }

    let closestEntity: any = null;
    let closestDistance = Infinity;

    for (const entity of nearbyEntities) {
        try {
            if (!entity || !entity.isValid) continue;

            const distance = Math.sqrt(
                Math.pow(entity.location.x - x, 2) +
                Math.pow(entity.location.y - y, 2) +
                Math.pow(entity.location.z - z, 2)
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestEntity = entity;
            }
        } catch (error: any) {
            console.error(`Error processing entity: ${error.message}`);
        }
    }

    if (closestEntity) {
        const centerX = x + 0.5;
        const centerY = y + 1;
        const centerZ = z + 0.5;

        closestEntity.teleport(
            new Vector3(centerX, centerY, centerZ),
            { keepVelocity: true }
        );
        player.sendMessage(`§aTeleported ${sanitizedSpawnerType} stack to spawner`);
    } else {
        player.sendMessage(`§cNo valid entities found to teleport.`);
    }
}

function slider(player: Player, spawnerType: string, block: Block, level: number, cost: number, typeId: string, upgradee: number, downgradee: number, percentrefund: number, refu: number, x: number, y: number, z: number): void {
    if (!player || !player.isValid) {
        console.error("Invalid player provided to slider");
        return;
    }
    const coordinates = `${x},${y},${z}`;
    if (!player.hasTag(`admin`)) {
        player.sendMessage("§cYou don't have permission to use this feature.");
        activeForms.delete(coordinates);
        return;
    }
    if (!isPlayerNearBlock(player, x, y, z, 10)) {
        player.sendMessage("§cYou are too far from the spawner.");
        activeForms.delete(coordinates);
        return;
    }
    if (!block || !block.isValid) {
        player.sendMessage("§cInvalid spawner block detected.");
        activeForms.delete(coordinates);
        return;
    }
    if (typeof level !== 'number' || level < 1 || level > 32) {
        console.error(`Invalid level provided: ${level}`);
        player.sendMessage("§cInvalid spawner level detected.");
        activeForms.delete(coordinates);
        return;
    }
    if (!spawnerType || typeof spawnerType !== 'string') {
        console.error(`Invalid spawnerType provided: ${spawnerType}`);
        player.sendMessage("§cInvalid spawner type detected.");
        activeForms.delete(coordinates);
        return;
    }

    const slider = new ModalFormData();
    slider.title('Select Spawner Level');
    slider.slider('Set Range', 1, 32, { valueStep: 1, defaultValue: 1 });

    system.run(() => {
        slider.show(player).then((response) => {
            activeForms.delete(coordinates); // Release lock

            // Re-validate permission and proximity
            if (!player || !player.isValid || !player.hasTag(`admin`)) {
                player.sendMessage("§cYou don't have permission to use this feature.");
                return;
            }
            if (!isPlayerNearBlock(player, x, y, z, 10)) {
                player.sendMessage("§cYou are too far from the spawner.");
                return;
            }
            if (response.formValues && response.formValues.length > 0) {
                const newLevel = response.formValues[0];
                if (newLevel) {
                    player.sendMessage(`§6Level §7set to §2${newLevel}`);
                    const newBlockType = `mrleefy:${spawnerType}spawner${newLevel}`;
                    block.setType(newBlockType);

                    clearMaxedSpawnerCache(x, y, z);

                    const newTypeId = newBlockType;
                    try {
                        player.runCommand(`execute as @e[type=mrleefy:spawnrule,x=${x},y=${y},z=${z},dx=0.1,dy=0.1,dz=0.1] run tag @s add desme`);
                        player.runCommand(`kill @e[type=mrleefy:spawnrule,tag=desme]`);
                        player.runCommand(`summon mrleefy:spawnrule "${newTypeId}" ${x} ${y} ${z}`);
                    } catch (error) {
                        console.error("Error executing command:", error);
                    }
                }
            }
        }).catch(() => {
            activeForms.delete(coordinates); // Release lock on cancel
        });
    });
}

function showInstructions(player: Player): void {
    const instructions = new ActionFormData();
    instructions.title('§l§eHow To Use Spawners');
    instructions.body(
        '§f§lGetting Started§r\n' +
        '§7Place your spawner and tap it to open this menu!\n\n' +
        '§a§lUpgrading§r\n' +
        '§7- Have spawners of the §esame type§7 in your inventory\n' +
        '§7- Tap §aUpgrade§7 to combine them\n' +
        '§7- Higher levels = §efaster spawns§7 + §ebigger stacks§7!\n\n' +
        '§c§lDowngrading§r\n' +
        '§7- Only works at Level 2+\n' +
        '§7- Get a spawner back in your inventory\n\n' +
        '§b§lMax Upgrade§r\n' +
        '§7- Uses ALL your spawners at once\n' +
        '§7- Upgrades to the highest level possible (max 32)\n' +
        '§7- Leftover spawners are returned to you\n\n' +
        '§d§lTeleport Stack§r\n' +
        '§7- Brings nearby stacked mobs to this spawner\n\n' +
        '§8Max level is 32. Each level boosts spawn rate and stack size!'
    );
    instructions.button('§l§aGot it!');
    instructions.show(player);
}

// SAFE AND EXPLOIT-FREE MAX UPGRADE ALGORITHM
function maxUpgradeSpawner(player: Player, block: Block, level: number, spawnerType: string, typeId: string, x: number, y: number, z: number): void {
    if (!player || !player.isValid) return;
    if (!isPlayerNearBlock(player, x, y, z, 10)) {
        player.sendMessage("§cYou are too far from the spawner.");
        return;
    }
    if (level >= 32) {
        player.sendMessage("§4Cannot upgrade further. Maximum level reached.");
        return;
    }

    const inventoryComp = player.getComponent('inventory') as any;
    if (!inventoryComp || !inventoryComp.container) return;
    const inventory = inventoryComp.container;
    const spawnerItemPrefix = `mrleefy:${spawnerType}spawner`;

    // 1. Gather all spawner items and compute levels in inventory
    const spawnerEntries = [];
    let totalAvailableLevels = 0;
    for (let i = 0; i < inventory.size; i++) {
        const item = inventory.getItem(i);
        if (item && item.typeId.startsWith(spawnerItemPrefix)) {
            const itemLevel = parseInt(item.typeId.replace(spawnerItemPrefix, '')) || 1;
            spawnerEntries.push({ slot: i, item, level: itemLevel });
            totalAvailableLevels += itemLevel * item.amount;
        }
    }

    if (totalAvailableLevels === 0) {
        player.sendMessage(`§4You don't have any ${spawnerType} spawners in your inventory, unable to upgrade.`);
        return;
    }

    // Sort to consume lowest level spawners first
    spawnerEntries.sort((a, b) => a.level - b.level);

    const levelsNeeded = 32 - level;
    let levelsConsumed = 0;
    const spawnersToRemove = [];
    let refundAmount = 0;

    // 2. Determine exactly which items/amounts to consume
    for (const entry of spawnerEntries) {
        if (levelsConsumed >= levelsNeeded) break;

        const { slot, item, level: itemLevel } = entry;
        let amountToConsume = 0;

        for (let count = 1; count <= item.amount; count++) {
            levelsConsumed += itemLevel;
            amountToConsume = count;
            if (levelsConsumed >= levelsNeeded) {
                if (levelsConsumed > levelsNeeded) {
                    refundAmount = levelsConsumed - levelsNeeded;
                }
                break;
            }
        }
        spawnersToRemove.push({ slot, item, amount: amountToConsume });
    }

    // 3. Consume items safely from inventory
    for (const entry of spawnersToRemove) {
        const { slot, item, amount } = entry;
        if (item.amount <= amount) {
            inventory.setItem(slot, null);
        } else {
            item.amount -= amount;
            inventory.setItem(slot, item);
        }
    }

    // 4. Update the spawner block and database
    const newLevel = level + Math.min(levelsNeeded, levelsConsumed - refundAmount);
    const newTypeId = `${spawnerItemPrefix}${newLevel}`;
    block.setType(newTypeId);

    const coordinates = `${x},${y},${z}`;
    const existingData = spawnerDatabase.read(coordinates);
    if (existingData) {
        existingData.typeId = newTypeId;
        existingData.lastAccessed = Date.now();
        spawnerDatabase.write(coordinates, existingData);
    }

    clearMaxedSpawnerCache(x, y, z);

    // 5. Summon spawnrules
    try {
        player.runCommand(`execute as @e[type=mrleefy:spawnrule,x=${x},y=${y},z=${z},dx=0.1,dy=0.1,dz=0.1] run tag @s add desme`);
        player.runCommand(`kill @e[type=mrleefy:spawnrule,tag=desme]`);
        player.runCommand(`summon mrleefy:spawnrule "${newTypeId}" ${x} ${y} ${z}`);
    } catch (error) {
        console.error("Error executing spawnrule commands:", error);
    }

    player.sendMessage(`§7Successfully Upgraded to level §2§l${newLevel}`);
    try {
        player.runCommand('playsound random.levelup @s');
    } catch (error) {}

    try {
        block.dimension.spawnParticle(
            'minecraft:crop_growth_area_emitter',
            new Vector3(block.x + 0.5, block.y + 0.5, block.z + 0.5),
            new MolangVariableMap()
        );
    } catch (e) {}

    // 6. Give the refund for over-consumption
    if (refundAmount > 0) {
        try {
            player.runCommand(`give @s ${spawnerItemPrefix}1 ${refundAmount}`);
        } catch (error) {
            console.error("Error executing remainder command:", error);
        }
        player.sendMessage(`§7Refunded §2§l${refundAmount} level 1 spawners§7.`);
    }
}

function upgradeSpawner(player: Player, block: Block, level: number, spawnerType: string, typeId: string, x: number, y: number, z: number): void {
    if (!player || !player.isValid) return;
    if (!isPlayerNearBlock(player, x, y, z, 10)) {
        player.sendMessage("§cYou are too far from the spawner.");
        return;
    }
    const inventoryComp = player.getComponent('inventory') as any;
    if (!inventoryComp || !inventoryComp.container) return;
    const inventory = inventoryComp.container;
    const spawnerItemPrefix = `mrleefy:${spawnerType}spawner`;
    const newLevel = level + 1;

    if (newLevel > 32) {
        player.sendMessage("§4Cannot upgrade further. Maximum level reached.");
        return;
    }

    let totalLevels = 0;
    const refundQueue: { level: number; amount: number }[] = [];
    const spawnersToRemove: { slot: number; item: any; amount: number }[] = [];

    const spawnerLevels = [];
    for (let i = 0; i < inventory.size; i++) {
        const item = inventory.getItem(i);
        if (item && item.typeId.startsWith(spawnerItemPrefix)) {
            const itemLevel = parseInt(item.typeId.replace(spawnerItemPrefix, '')) || 1;
            spawnerLevels.push({ slot: i, item, level: itemLevel });
        }
    }

    spawnerLevels.sort((a, b) => a.level - b.level);

    for (const entry of spawnerLevels) {
        const { slot, item, level: itemLevel } = entry;

        if (itemLevel === 1) {
            spawnersToRemove.push({ slot, item, amount: 1 });
            totalLevels += 1;
        } else if (totalLevels === 0) {
            spawnersToRemove.push({ slot, item, amount: 1 });
            totalLevels = itemLevel;
            if (itemLevel > 1) {
                refundQueue.push({ level: 1, amount: itemLevel - 1 });
            }
        }

        if (totalLevels >= 1) break;
    }

    if (totalLevels < 1) {
        player.sendMessage(`§4You don't have enough spawners in your inventory to upgrade.`);
        return;
    }

    for (const entry of spawnersToRemove) {
        const { slot, item, amount } = entry;
        if (item.amount <= amount) {
            inventory.setItem(slot, null);
        } else {
            item.amount -= amount;
            inventory.setItem(slot, item);
        }
    }

    for (const refund of refundQueue) {
        player.runCommand(`give @s ${spawnerItemPrefix}1 ${refund.amount}`);
    }

    block.setType(`${spawnerItemPrefix}${newLevel}`);
    player.sendMessage(`§7Successfully upgraded to level §2§l${newLevel}`);

    const coordinates = `${x},${y},${z}`;
    const existingData = spawnerDatabase.read(coordinates);
    if (existingData) {
        existingData.typeId = `${spawnerItemPrefix}${newLevel}`;
        existingData.lastAccessed = Date.now();
        spawnerDatabase.write(coordinates, existingData);
    }

    clearMaxedSpawnerCache(x, y, z);

    try {
        player.runCommand(`execute as @e[type=mrleefy:spawnrule,x=${x},y=${y},z=${z},dx=0.1,dy=0.1,dz=0.1] run tag @s add desme`);
        player.runCommand(`kill @e[type=mrleefy:spawnrule,tag=desme]`);
        player.runCommand(`summon mrleefy:spawnrule "mrleefy:${spawnerType}spawner${newLevel}" ${x} ${y} ${z}`);
    } catch (error) {
        console.error("Error executing command:", error);
    }
}

// SAFE AND EXPLOIT-FREE DOWNGRADE ALGORITHM
function downgrade(player: Player, block: Block, level: number, spawnerType: string, percentrefund: number, refu: number, x: number, y: number, z: number): void {
    if (!player || !player.isValid) return;
    if (!isPlayerNearBlock(player, x, y, z, 10)) {
        player.sendMessage("§cYou are too far from the spawner.");
        return;
    }
    if (!block || !block.isValid) {
        player.sendMessage("§cInvalid spawner block detected.");
        return;
    }
    if (level <= 1) {
        player.sendMessage("§cCannot downgrade further. Minimum level reached.");
        return;
    }

    const coordinates = `${x},${y},${z}`;
    const dimension = block.dimension;
    const currentBlock = dimension.getBlock(new Vector3(x, y, z));

    if (!currentBlock || currentBlock.typeId !== `mrleefy:${spawnerType}spawner${level}`) {
        player.sendMessage("§cNo spawner block found at the recorded location, action canceled.");
        return;
    }

    // Verify empty slot for downgrade refund
    const inventoryComp = player.getComponent('inventory') as any;
    if (!inventoryComp || !inventoryComp.container) return;
    const inventory = inventoryComp.container;
    let hasEmptySlot = false;
    for (let i = 0; i < inventory.size; i++) {
        if (!inventory.getItem(i)) {
            hasEmptySlot = true;
            break;
        }
    }

    if (!hasEmptySlot) {
        player.sendMessage(`§4You don't have enough space in your inventory to perform the downgrade.`);
        return;
    }

    // Apply the block downgrade
    const newLevel = level - 1;
    const newTypeId = `mrleefy:${spawnerType}spawner${newLevel}`;
    block.setType(newTypeId);

    const existingData = spawnerDatabase.read(coordinates);
    if (existingData) {
        existingData.typeId = newTypeId;
        existingData.lastAccessed = Date.now();
        spawnerDatabase.write(coordinates, existingData);
    }

    // Recreate spawnrule
    try {
        player.runCommand(`execute as @e[type=mrleefy:spawnrule,x=${block.x},y=${block.y},z=${block.z},dx=0.1,dy=0.1,dz=0.1] run tag @s add desme`);
        player.runCommand(`kill @e[type=mrleefy:spawnrule,tag=desme]`);
        player.runCommand(`summon mrleefy:spawnrule "${newTypeId}" ${x} ${y} ${z}`);
    } catch (error) {
        console.error("Error updating spawnrule in downgrade:", error);
    }

    // Refund EXACTLY 1 level 1 spawner to the player without wiping inventory
    try {
        player.runCommand(`give @s mrleefy:${spawnerType}spawner1 1`);
    } catch (error) {
        console.error("Error giving downgraded spawner:", error);
    }

    player.sendMessage(`§7Successfully downgraded to level §2§l${newLevel}`);
    try {
        player.runCommand('playsound mob.irongolem.crack @s');
    } catch (error) {}

    try {
        dimension.spawnParticle(
            'minecraft:villager_angry', 
            new Vector3(block.x + 0.5, block.y + 0.5, block.z + 0.5), 
            new MolangVariableMap()
        );
    } catch (e) {}
}

function removeSpawnruleAtLocation(x: number, y: number, z: number, dimension: Dimension): void {
    try {
        const spawnruleEntities = dimension.getEntities({
            type: 'mrleefy:spawnrule',
            location: { x: x, y: y, z: z },
            maxDistance: 1
        });

        system.run(() => {
            for (const entity of spawnruleEntities) {
                if (entity?.isValid) {
                    try {
                        entity.remove();
                    } catch (removeError) {
                        console.error(`Error removing spawnrule entity:`, removeError);
                    }
                }
            }
        });
    } catch (error) {
        console.error(`Error finding spawnrule at ${x},${y},${z}:`, error);
    }
}

function enforcePlayerMemoryLimits(): void {
    const now = Date.now();

    if (activeForms.size > PLAYER_MEMORY_LIMITS.ACTIVE_FORMS) {
        const entries = Array.from(activeForms.entries());
        const toRemove = entries.slice(0, Math.floor(entries.length / 2));
        toRemove.forEach(([key]) => activeForms.delete(key));
    }

    const formTimeout = 5 * 60 * 1000;
    for (const [key, activeData] of activeForms.entries()) {
        const player = activeData.player || activeData;
        const timestamp = activeData.timestamp || now;
        if (!player || !player.isValid || (now - timestamp) > formTimeout) {
            activeForms.delete(key);
        }
    }

    if (messageTimes.size > PLAYER_MEMORY_LIMITS.MESSAGE_TIMES) {
        const cutoffTime = now - (TIMING.MESSAGE_DELAY * 2);
        for (const [key, timestamp] of messageTimes.entries()) {
            if (timestamp < cutoffTime) {
                messageTimes.delete(key);
            }
        }
        if (messageTimes.size > PLAYER_MEMORY_LIMITS.MESSAGE_TIMES) {
            const entries = Array.from(messageTimes.entries());
            entries.sort((a, b) => a[1] - b[1]);
            const toRemove = entries.slice(0, messageTimes.size - PLAYER_MEMORY_LIMITS.MESSAGE_TIMES);
            toRemove.forEach(([key]) => messageTimes.delete(key));
        }
    }

    if (typeof interactionTimestamps !== 'undefined' && interactionTimestamps.size > PLAYER_MEMORY_LIMITS.INTERACTION_TIMESTAMPS) {
        const cutoffTime = now - (INTERACTION_WINDOW_MILLIS * 2);
        for (const [key, timestamps] of interactionTimestamps.entries()) {
            if (Array.isArray(timestamps)) {
                const validTimestamps = timestamps.filter(t => now - t < INTERACTION_WINDOW_MILLIS);
                if (validTimestamps.length === 0) {
                    interactionTimestamps.delete(key);
                } else {
                    interactionTimestamps.set(key, validTimestamps);
                }
            }
        }
    }

    if (typeof globalCooldowns !== 'undefined' && globalCooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
        const cutoffTime = now - GLOBAL_COOLDOWN_MILLIS;
        for (const [key, timestamp] of globalCooldowns.entries()) {
            if (now - timestamp > GLOBAL_COOLDOWN_MILLIS) {
                globalCooldowns.delete(key);
            }
        }
        if (globalCooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
            const remainingEntries = Array.from(globalCooldowns.entries());
            remainingEntries.sort((a, b) => a[1] - b[1]);
            const toRemove = remainingEntries.slice(0, globalCooldowns.size - PLAYER_MEMORY_LIMITS.COOLDOWNS);
            toRemove.forEach(([k]) => globalCooldowns.delete(k));
        }
    }

    if (cooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
        const cutoffTime = now - cooldownTime;
        for (const [key, timestamp] of cooldowns.entries()) {
            if (now - timestamp > cooldownTime) {
                cooldowns.delete(key);
            }
        }
        if (cooldowns.size > PLAYER_MEMORY_LIMITS.COOLDOWNS) {
            const remainingEntries = Array.from(cooldowns.entries());
            remainingEntries.sort((a, b) => a[1] - b[1]);
            const toRemove = remainingEntries.slice(0, cooldowns.size - PLAYER_MEMORY_LIMITS.COOLDOWNS);
            toRemove.forEach(([k]) => cooldowns.delete(k));
        }
    }
}

system.runInterval(() => {
    try {
        enforcePlayerMemoryLimits();
    } catch (error) {
        console.error('Player memory cleanup error:', error);
    }
}, PLAYER_CLEANUP_INTERVAL);

function exit(player: Player): void {
    return;
}

function updateSpawnerDatabaseOnInteraction(coordinates: string, typeId: string, player: Player): void {
    try {
        const existingData = spawnerDatabase.read(coordinates);

        if (!existingData) {
            const spawnerData = {
                typeId,
                placedBy: player.name || player.nameTag || 'Unknown',
                placedAt: Date.now(),
                entitiesKilled: 0,
                lastAccessed: Date.now(),
                interactedAt: Date.now()
            };
            spawnerDatabase.write(coordinates, spawnerData);
        } else {
            existingData.typeId = typeId;
            existingData.lastAccessed = Date.now();
            existingData.interactedAt = existingData.interactedAt || Date.now();

            if (existingData.placedBy === 'Existing') {
                existingData.placedBy = player.name || player.nameTag || 'Unknown';
                existingData.placedAt = Date.now();
            }

            spawnerDatabase.write(coordinates, existingData);
        }
    } catch (error) {
        console.error(`Error updating spawner database on interaction: ${error}`);
    }
}

export { spawnerDatabase, activeForms };
