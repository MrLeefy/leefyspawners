// @ts-nocheck
// scripts/main.js
// Advanced Dungeon System for Minecraft Bedrock Edition using Script API
// FIX: Removed "chatSend" prefix from all runCommand() calls for valid execution.

import { world, system, Dimension, BlockTypes, EntityTypes, ItemStack, EffectTypes, EnchantmentTypes, CustomCommandParamType } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

// Config storage
export const PROPERTY_DIFFICULTY = "dungeon:difficulty";
export const PROPERTY_SIZE = "dungeon:size";
export const PROPERTY_MOB_DENSITY = "dungeon:mob_density";
export const PROPERTY_INSTANCE_COUNTER = "dungeon:instance_counter";

// Default config
export let config = {
    difficulty: 5, // 1-10
    size: 5, // max rooms 3-10
    mobDensity: 3 // mobs per room 1-5
};

// In-memory instances data
export const instances = new Map(); // id => {deaths:0, players:Set<Player>, minPos, maxPos, dim, level, effectiveDifficulty, entrancePos, threshold, completed:false, bossEntityId, rooms: [] with {pos, index}}

// Load config from world properties
config.difficulty = world.getDynamicProperty(PROPERTY_DIFFICULTY) ?? config.difficulty;
config.size = world.getDynamicProperty(PROPERTY_SIZE) ?? config.size;
config.mobDensity = world.getDynamicProperty(PROPERTY_MOB_DENSITY) ?? config.mobDensity;

// Command registration moved to dungeon-commands.js for proper timing


// Create dungeon - exported for command system
export function createDungeon(player, level) {
    if (getPlayerInstanceId(player) !== null) {
        player.sendMessage("You are already in a dungeon. Use /dungeon:leave first.");
        return;
    }

    const difficultyModifier = { easy: 0.5, medium: 1, hard: 1.5 }[level] ?? 1;
    const effectiveDifficulty = Math.round(config.difficulty * difficultyModifier);

    const instanceId = getNextInstanceId();
    const basePos = { x: instanceId * 500, y: 60, z: 0 }; // Plain object
    const dungeonDim = world.getDimension("nether");

    player.sendMessage("Creating dungeon instance...");

    // Start generation job
    system.runJob(generateDungeonGen(dungeonDim, basePos, effectiveDifficulty, instanceId, level, (dungeonData) => {
        // On complete
        instances.set(instanceId, {
            deaths: 0,
            players: new Set(),
            minPos: dungeonData.minPos,
            maxPos: dungeonData.maxPos,
            dim: dungeonDim,
            level,
            effectiveDifficulty,
            entrancePos: dungeonData.rooms[0].pos,
            threshold: config.size * 3,
            completed: false,
            bossEntityId: dungeonData.boss.id,
            rooms: dungeonData.rooms
        });

        enterInstance(player, instanceId);
        player.sendMessage(`Dungeon instance ${instanceId} created at ${level} level. Share ID to invite others.`);
    }));
}

// Instance counter
export function getNextInstanceId() {
    let id = world.getDynamicProperty(PROPERTY_INSTANCE_COUNTER) ?? 0;
    id++;
    world.setDynamicProperty(PROPERTY_INSTANCE_COUNTER, id);
    return id;
}

// Generator for progressive generation with ticking area
function* generateDungeonGen(dim, basePos, difficulty, instanceId, level, onComplete) {
    const roomSize = 10;
    const numRooms = config.size;
    const themes = ["overworld", "nether", "end"];
    const theme = themes[Math.floor(Math.random() * themes.length)];

    // Generate room graph
    let grid = {};
    let rooms = [];
    let frontiers = [];

    const startRoom = { gx: 0, gz: 0, connections: [], type: "entrance" };
    grid[`0_0`] = startRoom;
    rooms.push(startRoom);
    frontiers.push(startRoom);

    while (rooms.length < numRooms && frontiers.length > 0) {
        const randIndex = Math.floor(Math.random() * frontiers.length);
        const current = frontiers[randIndex];
        const directions = shuffle([{ dx: 1, dz: 0, dir: "east" }, { dx: -1, dz: 0, dir: "west" }, { dx: 0, dz: 1, dir: "south" }, { dx: 0, dz: -1, dir: "north" }]);

        let added = false;
        for (let d of directions) {
            const ngx = current.gx + d.dx;
            const ngz = current.gz + d.dz;
            const key = `${ngx}_${ngz}`;
            if (!grid[key]) {
                const newRoom = { gx: ngx, gz: ngz, connections: [], type: getRandomRoomType(), connectFromDir: oppositeDir(d.dir) };
                grid[key] = newRoom;
                rooms.push(newRoom);
                frontiers.push(newRoom);
                current.connections.push({ dir: d.dir, to: newRoom });
                added = true;
                break;
            }
        }
        if (!added) {
            frontiers.splice(randIndex, 1);
        }
        yield;
    }

    // Add extra connections
    for (let room of rooms) {
        const directions = shuffle([{ dx: 1, dz: 0, dir: "east" }, { dx: -1, dz: 0, dir: "west" }, { dx: 0, dz: 1, dir: "south" }, { dx: 0, dz: -1, dir: "north" }]);
        for (let d of directions) {
            if (Math.random() < 0.2) {
                const ngx = room.gx + d.dx;
                const ngz = room.gz + d.dz;
                const key = `${ngx}_${ngz}`;
                const neighbor = grid[key];
                if (neighbor && !room.connections.some(c => c.to === neighbor)) {
                    room.connections.push({ dir: d.dir, to: neighbor });
                    neighbor.connections.push({ dir: oppositeDir(d.dir), to: room });
                }
            }
        }
        yield;
    }

    // Offsets
    const minGx = Math.min(...rooms.map(r => r.gx));
    const minGz = Math.min(...rooms.map(r => r.gz));
    const offsetX = -minGx * roomSize;
    const offsetZ = -minGz * roomSize;

    const minPos = { x: basePos.x + offsetX, y: basePos.y, z: basePos.z + offsetZ };
    const maxPos = { x: minPos.x + (Math.max(...rooms.map(r => r.gx)) - minGx + 1) * roomSize - 1, y: basePos.y + 5, z: minPos.z + (Math.max(...rooms.map(r => r.gz)) - minGz + 1) * roomSize - 1 };

    // Add ticking area for the dungeon bounds
    dim.runCommand(`tickingarea add ${minPos.x} ${minPos.y - 1} ${minPos.z} ${maxPos.x} ${maxPos.y + 1} ${maxPos.z} dungeon_${instanceId}`);
    yield;

    // Assign room indices
    rooms.forEach((room, index) => {
        room.index = index;
        room.pos = { x: basePos.x + offsetX + (room.gx - minGx) * roomSize, y: basePos.y, z: basePos.z + offsetZ + (room.gz - minGz) * roomSize };
    });

    // Build rooms one by one
    for (let room of rooms) {
        buildRoom(dim, room.pos, theme, room.connections.map(c => c.dir), room.connectFromDir ?? null, difficulty, room.type, instanceId, room.index);
        yield;
    }

    // Boss in last room
    const bossRoom = rooms[rooms.length - 1];
    const boss = spawnBoss(dim, bossRoom.pos, difficulty, instanceId, bossRoom.index);
    boss.addTag(`dungeon_boss_${instanceId}`);

    const dungeonData = { rooms, minPos, maxPos, boss };

    onComplete(dungeonData);
}

// Join dungeon
export function joinDungeon(player, instanceId) {
    if (!instances.has(instanceId)) {
        player.sendMessage("Invalid dungeon instance ID.");
        return;
    }
    if (getPlayerInstanceId(player) !== null) {
        player.sendMessage("You are already in a dungeon. Use /dungeon:leave first.");
        return;
    }
    enterInstance(player, instanceId);
    player.sendMessage(`Joined dungeon instance ${instanceId}.`);
}

// Enter instance
function enterInstance(player, instanceId) {
    const instance = instances.get(instanceId);
    player.addTag(`in_dungeon_${instanceId}`);
    instance.players.add(player);
    // Adjust threshold for group size
    instance.threshold = config.size * 2 * instance.players.size;
    const entrancePos = instance.entrancePos;
    player.teleport({ x: entrancePos.x + 5, y: entrancePos.y + 1, z: entrancePos.z + 5 }, { dimension: instance.dim });
    player.runCommand("gamemode adventure @s");
    player.sendMessage("Entered dungeon. Clear rooms to open doors. No breaking/placing blocks.");
}

// Leave dungeon
export function leaveDungeon(player) {
    const instanceId = getPlayerInstanceId(player);
    if (instanceId === null) {
        player.sendMessage("You are not in a dungeon.");
        return;
    }
    player.runCommand("gamemode survival @s");
    removePlayerFromInstance(player, instanceId);
    player.teleport(world.getDefaultSpawnLocation(), { dimension: world.getDimension("overworld") });
    player.sendMessage("Left the dungeon.");
}

// Get player's instance ID
export function getPlayerInstanceId(player) {
    const tags = player.getTags();
    const dungeonTag = tags.find(tag => tag.startsWith("in_dungeon_"));
    return dungeonTag ? parseInt(dungeonTag.split("_")[2]) : null;
}

// Remove player from instance
function removePlayerFromInstance(player, instanceId) {
    player.removeTag(`in_dungeon_${instanceId}`);
    player.runCommand("gamemode survival @s");
    const instance = instances.get(instanceId);
    if (instance) {
        instance.players.delete(player);
        if (instance.players.size === 0) {
            system.runTimeout(() => cleanupInstance(instanceId), 6000); // 5 min if empty
        }
    }
}

// Handle player death
world.afterEvents.entityDie.subscribe((event) => {
    if (event.deadEntity.typeId !== "minecraft:player") return;

    const player = event.deadEntity;
    const instanceId = getPlayerInstanceId(player);
    if (instanceId === null) return;

    const instance = instances.get(instanceId);
    instance.deaths++;

    // Give basic gear and food
    system.run(() => {
        player.runCommand("give @s iron_sword 1");
        player.runCommand("give @s iron_helmet 1");
        player.runCommand("give @s iron_chestplate 1");
        player.runCommand("give @s iron_leggings 1");
        player.runCommand("give @s iron_boots 1");
        player.runCommand("give @s bread 16");
        player.runCommand("give @s cooked_beef 16");
    });


    // Teleport to checkpoint (entrance)
    const entrancePos = instance.entrancePos;
    player.teleport({ x: entrancePos.x + 5, y: entrancePos.y + 1, z: entrancePos.z + 5 }, { dimension: instance.dim });

    player.sendMessage("You died and respawned at the checkpoint with basic gear. Retrieve your items!");

    // Check failure
    if (instance.deaths > instance.threshold) {
        failDungeon(instanceId);
    }
});

// Fail dungeon
function failDungeon(instanceId) {
    const instance = instances.get(instanceId);
    if (!instance) return;

    for (let player of instance.players) {
        player.sendMessage("Too many deaths! The ancient seal has broken, banishing you from the dungeon.");
        player.runCommand("gamemode survival @s");
        removePlayerFromInstance(player, instanceId);
        player.teleport(world.getDefaultSpawnLocation(), { dimension: world.getDimension("overworld") });
    }

    cleanupInstance(instanceId);
}

// Handle boss death for completion
world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    const bossTag = entity.getTags().find(tag => tag.startsWith("dungeon_boss_"));
    if (bossTag) {
        const instanceId = parseInt(bossTag.split("_")[2]);
        const instance = instances.get(instanceId);
        if (!instance || instance.completed) return;

        instance.completed = true;
        const rewardAmount = Math.max(1, (Math.floor(instance.effectiveDifficulty / 2) + 1) - instance.deaths);

        for (const player of instance.players) {
            player.sendMessage(`Dungeon completed! Rewards reduced due to deaths: ${instance.deaths}/${instance.threshold}`);
            player.runCommand(`give @s diamond ${rewardAmount}`);
            player.runCommand("gamemode survival @s");
            removePlayerFromInstance(player, instanceId);
            player.teleport(world.getDefaultSpawnLocation(), { dimension: world.getDimension("overworld") });
        }

        // Schedule cleanup
        system.runTimeout(() => cleanupInstance(instanceId), 1200); // 1 min
    }
});

// Cleanup instance
function cleanupInstance(instanceId) {
    const instance = instances.get(instanceId);
    if (!instance) return;

    // Remove ticking area
    instance.dim.runCommand(`tickingarea remove dungeon_${instanceId}`);

    // Clear blocks
    instance.dim.fillBlocks(instance.minPos, instance.maxPos, BlockTypes.get("minecraft:air"));

    // Kill remaining entities
    const center = { x: (instance.minPos.x + instance.maxPos.x) / 2, y: instance.minPos.y + 3, z: (instance.minPos.z + instance.maxPos.z) / 2 };
    for (const entity of instance.dim.getEntities({ location: center, maxDistance: 250 })) {
        if(entity.typeId !== "minecraft:player") entity.kill();
    }

    instances.delete(instanceId);
}

// Config UI
world.beforeEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;
    if (item && item.typeId === "minecraft:stick" && player.hasTag("admin")) {
        event.cancel = true;
        showConfigForm(player);
    }
});

function showConfigForm(player) {
    const form = new ModalFormData();
    form.title("Dungeon Config");
    form.slider("Difficulty", 1, 10, { defaultValue: config.difficulty });
    form.slider("Max Rooms", 3, 10, { defaultValue: config.size });
    form.slider("Mob Density", 1, 5, { defaultValue: config.mobDensity });
    system.run(() => {
        form.show(player).then((response) => {
        if (!response.canceled) {
            config.difficulty = response.formValues[0];
            config.size = response.formValues[1];
            config.mobDensity = response.formValues[2];
            world.setDynamicProperty(PROPERTY_DIFFICULTY, config.difficulty);
            world.setDynamicProperty(PROPERTY_SIZE, config.size);
            world.setDynamicProperty(PROPERTY_MOB_DENSITY, config.mobDensity);
            player.sendMessage("Config updated!");
        }
    });
    });
}

// Prevent block breaking in dungeon
world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const player = event.player;
    const instanceId = getPlayerInstanceId(player);
    if (instanceId !== null) {
        const instance = instances.get(instanceId);
        if (instance && isPositionInBounds(event.block.location, instance.minPos, instance.maxPos)) {
            event.cancel = true;
        }
    }
});

// Prevent block placing in dungeon
world.beforeEvents.playerPlaceBlock.subscribe((event) => {
    const player = event.player;
    const instanceId = getPlayerInstanceId(player);
    if (instanceId !== null) {
        const instance = instances.get(instanceId);
        if (instance && isPositionInBounds(event.block.location, instance.minPos, instance.maxPos)) {
            event.cancel = true;
        }
    }
});

// Prevent door opening if room not cleared
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const player = event.player;
    const block = event.block;
    const instanceId = getPlayerInstanceId(player);
    if (instanceId !== null && block.typeId.includes("door")) {
        const instance = instances.get(instanceId);
        if (instance) {
            const room = getRoomFromPosition(instance.rooms, player.location);
            if (room) {
                const mobsInRoom = instance.dim.getEntities({ tags: [`dungeon_mob_${instanceId}_${room.index}`] });
                const aliveMobs = mobsInRoom.filter(mob => mob.isValid);
                if (aliveMobs.length > 0) {
                    event.cancel = true;
                    player.sendMessage("Clear the room of mobs before opening the door!");
                }
            }
        }
    }
});

// Helper to check if position in bounds
function isPositionInBounds(pos, minPos, maxPos) {
    return pos.x >= minPos.x && pos.x <= maxPos.x &&
        pos.y >= minPos.y && pos.y <= maxPos.y &&
        pos.z >= minPos.z && pos.z <= maxPos.z;
}

// Helper to get room from position
function getRoomFromPosition(rooms, pos) {
    for (let room of rooms) {
        if (pos.x >= room.pos.x && pos.x < room.pos.x + 10 &&
            pos.z >= room.pos.z && pos.z < room.pos.z + 10) {
            return room;
        }
    }
    return null;
}

// Helper functions
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


function oppositeDir(dir) {
    const opposites = { east: "west", west: "east", south: "north", north: "south" };
    return opposites[dir];
}

function getRandomRoomType() {
    const types = ["mob", "mob", "loot", "trap"];
    return types[Math.floor(Math.random() * types.length)];
}

function buildRoom(dim, roomPos, theme, doorDirs, connectFromDir, difficulty, roomType, instanceId, roomIndex) {
    const roomSize = 10;
    const endPos = { x: roomPos.x + roomSize - 1, y: roomPos.y + 5, z: roomPos.z + roomSize - 1 };

    // Walls, Floor, Ceiling
    const floorBlock = getThemeBlock(theme, "floor");
    const ceilingBlock = getThemeBlock(theme, "ceiling");
    const wallBlock = getThemeBlock(theme, "wall");
    // Create proper BlockVolume objects for fillBlocks
    const floorVolume = {
        from: roomPos,
        to: { x: endPos.x, y: roomPos.y, z: endPos.z }
    };
    dim.fillBlocks(floorVolume, floorBlock); // Floor
    // Ceiling
    const ceilingVolume = {
        from: { x: roomPos.x, y: endPos.y, z: roomPos.z },
        to: { x: endPos.x, y: endPos.y, z: endPos.z }
    };
    dim.fillBlocks(ceilingVolume, ceilingBlock);

    for (let y = roomPos.y + 1; y < endPos.y; y++) {
        // North Wall
        const northWallVolume = {
            from: { x: roomPos.x, y, z: roomPos.z },
            to: { x: endPos.x, y, z: roomPos.z }
        };
        dim.fillBlocks(northWallVolume, wallBlock);

        // South Wall
        const southWallVolume = {
            from: { x: roomPos.x, y, z: endPos.z },
            to: { x: endPos.x, y, z: endPos.z }
        };
        dim.fillBlocks(southWallVolume, wallBlock);

        // West Wall
        const westWallVolume = {
            from: { x: roomPos.x, y, z: roomPos.z + 1 },
            to: { x: roomPos.x, y, z: endPos.z - 1 }
        };
        dim.fillBlocks(westWallVolume, wallBlock);

        // East Wall
        const eastWallVolume = {
            from: { x: endPos.x, y, z: roomPos.z + 1 },
            to: { x: endPos.x, y, z: endPos.z - 1 }
        };
        dim.fillBlocks(eastWallVolume, wallBlock);
    }
    // Clear inside
    const clearVolume = {
        from: { x: roomPos.x + 1, y: roomPos.y + 1, z: roomPos.z + 1 },
        to: { x: endPos.x - 1, y: endPos.y - 1, z: endPos.z - 1 }
    };
    dim.fillBlocks(clearVolume, BlockTypes.get("minecraft:air"));

    // Doorways with doors
    const allDoors = new Set(doorDirs);
    if (connectFromDir) allDoors.add(connectFromDir);
    for (let doorDir of allDoors) {
        let doorPos, clearStart, clearEnd;
        if (doorDir === "west") {
            doorPos = { x: roomPos.x, y: roomPos.y + 1, z: roomPos.z + 4 };
        } else if (doorDir === "east") {
            doorPos = { x: endPos.x, y: roomPos.y + 1, z: roomPos.z + 4 };
        } else if (doorDir === "north") {
            doorPos = { x: roomPos.x + 4, y: roomPos.y + 1, z: roomPos.z };
        } else { // south
            doorPos = { x: roomPos.x + 4, y: roomPos.y + 1, z: endPos.z };
        }

        clearStart = { x: doorPos.x, y: doorPos.y, z: doorPos.z };
        clearEnd = { ...clearStart };

        if (doorDir === "west" || doorDir === "east") {
            clearEnd.z += 2; // 3 wide
        } else {
            clearEnd.x += 2; // 3 wide
        }
        clearEnd.y += 2; // 3 high

        const doorwayClearVolume = {
            from: clearStart,
            to: clearEnd
        };
        dim.fillBlocks(doorwayClearVolume, BlockTypes.get("minecraft:air"));
    }

    // Room content
    if (roomType === "mob") {
        spawnMobs(dim, roomPos, difficulty, theme, instanceId, roomIndex);
    } else if (roomType === "loot") {
        placeLoot(dim, roomPos, difficulty);
    } else if (roomType === "trap") {
        addTrap(dim, roomPos, theme);
    }

    // Random trap anyway
    if (Math.random() < 0.3) {
        addTrap(dim, roomPos, theme);
    }
}

// Theme blocks
function getThemeBlock(theme, part) {
    const blocks = {
        overworld: { floor: "minecraft:stone_bricks", wall: "minecraft:cobblestone", ceiling: "minecraft:mossy_cobblestone" },
        nether: { floor: "minecraft:netherrack", wall: "minecraft:nether_brick", ceiling: "minecraft:blackstone" },
        end: { floor: "minecraft:end_stone_bricks", wall: "minecraft:purpur_block", ceiling: "minecraft:end_stone" }
    };
    return BlockTypes.get(blocks[theme][part] ?? "minecraft:stone");
}

// Spawn mobs
const mobThemes = {
    overworld: ["minecraft:zombie", "minecraft:skeleton", "minecraft:creeper", "minecraft:spider"],
    nether: ["minecraft:blaze", "minecraft:piglin", "minecraft:magma_cube"],
    end: ["minecraft:enderman", "minecraft:shulker"]
};
function spawnMobs(dim, roomPos, difficulty, theme, instanceId, roomIndex) {
    const mobs = mobThemes[theme] ?? mobThemes.overworld;
    const num = Math.floor(config.mobDensity * (difficulty / 5)) + 1;
    for (let i = 0; i < num; i++) {
        const mobType = mobs[Math.floor(Math.random() * mobs.length)];
        const pos = { x: roomPos.x + Math.random() * 8 + 1, y: roomPos.y + 1, z: roomPos.z + Math.random() * 8 + 1 };
        try {
            const entity = dim.spawnEntity(mobType, pos);
            entity.addTag(`dungeon_mob_${instanceId}_${roomIndex}`);
            if (difficulty > 5) {
                entity.addEffect(EffectTypes.get("strength"), 20 * 9999, { amplifier: Math.floor(difficulty / 3) });
                entity.addEffect(EffectTypes.get("speed"), 20 * 9999, { amplifier: 1 });
            }
        } catch (e) {
            console.warn(`Could not spawn mob ${mobType}: ${e}`);
        }
    }
}

// Spawn boss
const bossTypes = ["minecraft:warden", "minecraft:wither", "minecraft:elder_guardian"];
function spawnBoss(dim, roomPos, difficulty, instanceId, roomIndex) {
    const pos = { x: roomPos.x + 5, y: roomPos.y + 1, z: roomPos.z + 5 };
    const bossType = bossTypes[Math.floor(Math.random() * bossTypes.length)];
    const boss = dim.spawnEntity(bossType, pos);
    boss.addEffect(EffectTypes.get("strength"), 20 * 9999, { amplifier: Math.floor(difficulty / 2) });
    boss.addEffect(EffectTypes.get("speed"), 20 * 9999, { amplifier: 2 });
    boss.addEffect(EffectTypes.get("resistance"), 20 * 9999, { amplifier: 1 });
    boss.nameTag = "Dungeon Boss";
    boss.addTag(`dungeon_mob_${instanceId}_${roomIndex}`);
    boss.addTag(`dungeon_boss_${instanceId}`);
    return boss;
}

// Place loot
function placeLoot(dim, roomPos, difficulty) {
    const chestPos = { x: roomPos.x + 5, y: roomPos.y + 1, z: roomPos.z + 5 };
    dim.getBlock(chestPos).setType(BlockTypes.get("minecraft:chest"));
    const block = dim.getBlock(chestPos);
    
    system.run(() => {
        const inventory = block.getComponent("minecraft:inventory");
        if (inventory) {
            const container = inventory.container;
            const lootItems = ["minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:diamond", "minecraft:emerald", "minecraft:enchanted_golden_apple"];
            for (let i = 0; i < Math.min(5, difficulty); i++) {
                const itemType = lootItems[Math.floor(Math.random() * lootItems.length)];
                const count = Math.floor(Math.random() * (difficulty / 2)) + 1;
                const item = new ItemStack(itemType, count);

                if (Math.random() < 0.3) {
                    try {
                        const enchantComp = item.getComponent("enchantable");
                        if (enchantComp) {
                            // Find a valid enchantment for the item
                            const validEnchants = enchantComp.getValidEnchantments();
                            if(validEnchants.length > 0){
                                const randomEnchant = validEnchants[Math.floor(Math.random() * validEnchants.length)];
                                enchantComp.addEnchantment({ type: randomEnchant, level: Math.floor(difficulty / 3) + 1 });
                            }
                        }
                    } catch(e) { /* Fails silently if item not enchantable */ }
                }
                const randomSlot = Math.floor(Math.random() * container.size);
                container.setItem(randomSlot, item);
            }
        }
    });
}

// Add trap
function addTrap(dim, roomPos, theme) {
    const trapTypes = ["lava_pit", "arrow_dispenser"];
    const trapType = trapTypes[Math.floor(Math.random() * trapTypes.length)];

    if (trapType === "lava_pit") {
        const trapPos = { x: roomPos.x + 3, y: roomPos.y, z: roomPos.z + 3 };
        const trapAirVolume = {
            from: trapPos,
            to: { x: trapPos.x + 3, y: trapPos.y, z: trapPos.z + 3 }
        };
        dim.fillBlocks(trapAirVolume, BlockTypes.get("minecraft:air"));

        const trapLavaVolume = {
            from: { x: trapPos.x, y: trapPos.y - 1, z: trapPos.z },
            to: { x: trapPos.x + 3, y: trapPos.y - 1, z: trapPos.z + 3 }
        };
        dim.fillBlocks(trapLavaVolume, BlockTypes.get("minecraft:lava"));
    } else if (trapType === "arrow_dispenser") {
        const dispPos = { x: roomPos.x + 5, y: roomPos.y + 2, z: roomPos.z };
        const block = dim.getBlock(dispPos);
        block.setType(BlockTypes.get("minecraft:dispenser"));
        
        system.run(() => {
            const inv = block.getComponent("inventory");
            if (inv) {
                inv.container.setItem(0, new ItemStack("minecraft:arrow", 64));
            }
            const tripwireHookPos1 = { x: roomPos.x + 2, y: roomPos.y + 1, z: roomPos.z + 2 };
            const tripwireHookPos2 = { x: roomPos.x + 8, y: roomPos.y + 1, z: roomPos.z + 2 };
            dim.getBlock(tripwireHookPos1).setType(BlockTypes.get("minecraft:tripwire_hook"));
            dim.getBlock(tripwireHookPos2).setType(BlockTypes.get("minecraft:tripwire_hook"));
            const tripwireVolume = {
                from: { x: roomPos.x + 3, y: roomPos.y + 1, z: roomPos.z + 2 },
                to: { x: roomPos.x + 7, y: roomPos.y + 1, z: roomPos.z + 2 }
            };
            dim.fillBlocks(tripwireVolume, BlockTypes.get("minecraft:tripwire"));
        });
    }
}