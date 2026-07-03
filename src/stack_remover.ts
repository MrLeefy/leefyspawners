import { system, world, EntityHitEntityAfterEvent } from "@minecraft/server";
import { validMobs } from "./mobstacker-core";

// Cached set for O(1) lookups with zero GC allocation pressure
const validEntityTypes = new Set<string>(validMobs.map(mob => mob.typeId));

world.afterEvents.entityHitEntity.subscribe((evd: EntityHitEntityAfterEvent) => {
    system.run(() => {
        const player = evd.damagingEntity;
        if (!player || !player.isValid) return;
        
        const entity = evd.hitEntity;
        if (!entity || !entity.isValid) return;
        
        const entityTypeId = entity.typeId;
        const equippableComponent = player.getComponent("minecraft:equippable") as any;

        // Return if the player does not have an equippable component or mainhand is empty
        if (!equippableComponent || !equippableComponent.getEquipment("Mainhand")) {
            return;
        }

        const inventory = equippableComponent.getEquipment("Mainhand");
        const item = inventory;

        if (item?.typeId === `mrleefy:stack_killer_sword`) {
            if (validEntityTypes.has(entityTypeId)) {
                try {
                    entity.remove(); // Native entity deletion API
                    if (player.typeId === "minecraft:player") {
                        (player as any).sendMessage(`§cFull Stack Removed...`);
                    }
                } catch (error) {
                    console.error(`Error removing entity stack:`, error);
                }
            }
        }
    });
});

