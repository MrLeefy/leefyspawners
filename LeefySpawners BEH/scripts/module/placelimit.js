export {};
/*
const overworld = world.getDimension('overworld');

world.afterEvents.playerPlaceBlock.subscribe((event: PlayerPlaceBlockAfterEvent) => {
    const player = event.player;
    const dimension = event.dimension;
    const entityType = "mrleefy:spawnrule";
    let messageSent = false;

    // Check if the placed block is in the Overworld
    if (event.block.typeId.includes('spawner') && dimension !== overworld) {
        // Remove the recently placed block if it's not in the Overworld
        player.runCommand(`setblock ${event.block.location.x} ${event.block.location.y} ${event.block.location.z} air destroy`);
        player.sendMessage("§7[§6LeefySpawners§7] §7Location ¤ §4Placement not allowed in the Nether or the End.");
        return;
    }

    // Delay to allow entity associated with the block to spawn
    system.runTimeout(() => {
        const allEntities = dimension.getEntities({
            maxDistance: 50,
            location: event.block.location,
            type: entityType
        });

        const entityAtBlockLocation = allEntities.find(entity => Vector3.Distance(entity.location, event.block.location) <= 1.0);

        if (entityAtBlockLocation) {
            const entitiesWithinRadius = allEntities.filter(entity => Vector3.Distance(entity.location, event.block.location) <= 50 && Vector3.Distance(entity.location, entityAtBlockLocation.location) > 0.5);
            if (event.block.typeId.includes('spawner')) {
                const eventBlockNameTag = event.block.typeId.split(':')[1].replace(/\d+$/, '');

                entitiesWithinRadius.forEach(entity => {
                    const nameTagWithoutCoords = entity.nameTag.split(' ')[0].split(':')[1].replace(/\d+/g, '').replace(/,$/, '');

                    if (nameTagWithoutCoords === eventBlockNameTag) {
                        // If a similar spawner is found within the radius, remove the recently placed block
                        player.runCommand(`setblock ${event.block.location.x} ${event.block.location.y} ${event.block.location.z} air destroy`);
                        if (!messageSent) {
                            player.sendMessage("§7[§6LeefySpawners§7] §7Location ¤ §4SpawnerBroken...too close to a similar type of spawner... place 50+ away");
                            messageSent = true;
                        }
                        return; // Exit the loop and function once the matching entity is found and the block is removed
                    }
                });
            }
        }
    }, 1); // Delay to ensure the entity associated with the block has time to spawn
});
*/ 
