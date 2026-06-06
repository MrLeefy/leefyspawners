
import { world } from "@minecraft/server"


world.afterEvents.worldLoad.subscribe(() => {
  import("./scripts/levelsystem.js")
  import("./scripts/mobstacker-core.js")
  import("./scripts/mobstacker-ui.js")
  import("./scripts/stack_remover.js")
  import("./scripts/placelimit")
  import("./scripts/loot_table.js")
  import("./scripts/entity-service.js")
  import("./scripts/configuration-service.js")
  import("./scripts/performance-monitor.js")
  import("./scripts/security-service.js")
  import("./scripts/mob-stacker-service.js")
  import("./scripts/constants.js")
  import("./scripts/display-spawner-handler.js")
})