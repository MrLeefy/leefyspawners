import {
  system, world
} from "@minecraft/server";
import { validMobs } from "./mobstacker-core.js";

// Cached set for O(1) lookups with zero GC allocation pressure
const validEntityTypes = new Set(validMobs.map(mob => mob.typeId));

world.afterEvents.entityHitEntity.subscribe(evd => {
  system.run(() => {
      const player = evd.damagingEntity;
      const entity = evd.hitEntity; // This is an entity object now
      const entityTypeId = entity.typeId; // This is the type ID string
      const equippableComponent = player.getComponent("minecraft:equippable");

      // Return if the player does not have an equippable component or mainhand is empty
      if (!equippableComponent || !equippableComponent.getEquipment("Mainhand")) {
          return;
      }

      const inventory = equippableComponent.getEquipment("Mainhand");
      const item = inventory;

      if (item?.typeId == `mrleefy:stack_killer_sword`) {
          if (validEntityTypes.has(entityTypeId)) {
              try {
                  entity.remove(); // Native entity deletion API
                  player.sendMessage(`§cFull Stack Removed...`);
              } catch (error) {
                  console.error(`Error removing entity stack:`, error);
              }
          }
      }
  });
});
