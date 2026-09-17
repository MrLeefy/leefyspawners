# 🟢 LeefySpawners v9.0.0

**LeefySpawners** is a progression-focused spawner, mob-stacking, automation, economy, loot, and administration system for **Minecraft: Bedrock Edition**.

Version 9 is built for the **Bedrock 26.50 stable release** and uses only stable Script API modules. It is designed for survival worlds, SMPs, Realms, and Bedrock Dedicated Servers without requiring the Beta APIs experiment.

> **Upgrading an existing world?** Back up the world first. v9 preserves the existing LeefySpawners pack UUIDs and the existing 32-level block/item identifiers, then migrates the old coordinate-only spawner database to the new dimension-aware schema automatically.

## 📥 Download

The repository's published master build is always available here:

**[Download LeefySpawners (.mcaddon)](https://github.com/MrLeefy/leefyspawners/raw/master/LeefySpawners.mcaddon)**

During v9 testing, builds from the `v9-modernization` pull request are produced by GitHub Actions before v9 is merged into master.

---

# 🚀 What LeefySpawners Does

LeefySpawners is not just a block that changes a mob spawner. It turns spawners into a complete multiplayer progression system.

- **32 upgrade levels per spawner**
- **Virtual mob stacking** to dramatically reduce physical entity count
- **39 supported spawner types**
- **Spawner → chest automation**, including double chests
- **Custom loot and XP configuration**
- **Reaper I–V** bulk-stack killing system with Looting support
- **Physical spawner shops** with configurable prices and scoreboard currency
- **Admin GUI**, statistics, teleport tools, database verification, cleanup, and emergency lag controls
- **Live performance controls** for activation radius, cycle limits, interval, and randomized initial delays
- **Overworld + Nether + End support** with dimension-safe persistence
- **Stable 26.50 block dynamic properties** mirrored onto individual spawner block entities
- **Automatic v8 database migration**
- **Realms-compatible stable APIs**

---

# 📊 32-Level Spawner Progression

Every supported spawner can progress from **Level 1 through Level 32**. Server owners can customize the ranges, but the default progression is:

| Level | Spawn Quantity | Spawn Interval | Max Virtual Stack |
| ---: | ---: | ---: | ---: |
| 1–10 | 1 | 15 sec | 100 |
| 11–20 | 2 | 12 sec | 300 |
| 21–30 | 3 | 9 sec | 500 |
| 31 | 4 | 6 sec | 700 |
| 32 | 5 | 3 sec | 1000 |

Players interact directly with a placed spawner to open its menu.

Available actions include:

- **Upgrade** one level
- **Max Upgrade** using all compatible spawner items available in the player's inventory
- **Downgrade** and receive the configured refund
- **Choose Level** for authorized owner/admin workflows
- **Teleport Stack** back to the spawner
- **Link Chest / View Linked Chest / Unlink Chest**
- **Instructions**

LeefySpawners keeps the existing 32 block IDs for each mob in v9 so worlds and inventories created with v8 are not deliberately broken by a destructive identifier conversion.

---

# 🎯 Lag-Friendly Virtual Mob Stacking

Instead of allowing a farm to create hundreds or thousands of physical entities, LeefySpawners represents many mobs with one physical entity and a virtual stack count.

Example:

```text
[ x250 Cow ]
```

That single cow can represent a virtual stack of 250 mobs.

The stacking engine includes:

- Configurable stacking radius
- Configurable maximum stack size by spawner level
- Player activation radius so distant farms do not consume unnecessary processing
- Configurable maximum spawner operations per processing cycle
- Randomized first-spawn delay to prevent every farm from firing on the same tick
- Per-spawner cooldown tracking
- Cached handling for already-maxed stacks
- A cooperative `system.runJob()` processing loop with a small per-tick time budget
- Automatic memory cleanup for runtime maps and tracking data
- Dimension-aware entity ownership and cooldown keys
- Emergency stacked-mob purge tools for admins

Spawner processing runs independently in the **Overworld, Nether, and End**.

---

# ⚔️ Reaper I–V

LeefySpawners includes a custom **Reaper** mechanic for killing multiple virtual mobs from a stack at once.

| Reaper Level | Base Mobs Reaped |
| ---: | ---: |
| I | 3 |
| II | 6 |
| III | 12 |
| IV | 18 |
| V | 30 |

When enabled, vanilla **Looting** can add to the amount processed by a Reaper hit. Loot and XP are still calculated through the LeefySpawners loot system rather than spawning hundreds of unnecessary physical entities.

---

# 📦 Automatic Chest Linking

A functional spawner can be linked to storage so generated loot is routed directly into a chest.

Features include:

- Spawner → chest links
- Double-chest support
- Dimension stored with the chest link
- Linked-storage status in the spawner UI
- Slot/capacity checks and a fullness indicator
- Link particles and interaction feedback
- Automatic ground fallback when linked storage cannot accept all items
- v9 cross-dimension safeguards so a spawner can never accidentally resolve to a different spawner at matching X/Y/Z coordinates in another dimension

Chest links are stored in the persistent spawner record and mirrored into the v9 block entity's dynamic metadata.

---

# 💰 Physical Spawner Shops

LeefySpawners includes physical display spawners that can act as server shops.

Players can:

- Interact with a display spawner
- Select a purchase quantity
- Review the total price
- Confirm the purchase
- Pay using the configured scoreboard money objective
- Receive the real Level 1 spawner item

Admins can configure pricing and shop behavior. Purchase balances are rechecked before the transaction is finalized.

---

# 🎁 Custom Loot and XP

Server owners can customize drops rather than being locked to a single hard-coded loot model.

The admin tools support:

- Per-entity loot tables
- Drop chances
- Quantities
- Stackable/non-stackable items
- Random durability where supported
- Enchantment chances where supported
- XP configuration
- Looting integration
- Player-kill-only rules
- Item/XP spill caps to reduce lag spikes

LeefySpawners also supports its custom resource mobs and their corresponding resource-oriented loot.

---

# 🛠️ Admin Control Center

Players with the `admin` tag can open the LeefySpawners control center with a Blaze Rod.

```mcfunction
/tag @s add admin
```

Admin tools include:

- **Spawner Settings / 32-Level Presets**
- **Entity Loot Tables**
- **Stack Radius**
- **Loot Drop Rules**
- **Live Performance Settings**
- **Spawner Statistics**
- **Spawner Teleportation**
- **Database Verification & Cleanup**
- **Debug Logging Toggle**
- **Color Theme Settings**
- **Lag Diagnostics & Emergency Purge**
- **Database Reset Tools**

Security-sensitive admin actions revalidate permission before the action executes. The public v9 release contains **no player-name-based automatic operator grant**.

---

# ⚙️ Live Performance Controls

Version 9 makes the performance menu accurately reflect what happens in the engine.

Admins can configure:

- **Player activation radius**
- **Maximum spawns per processing cycle**
- **Spawner processing interval**
- **Randomized initial spawn delay**

The interval scheduler can be restarted when its value changes, so these controls are applied without pretending a server restart is required when it is not.

The statistics and diagnostics system can report active spawners, physical stacks, virtual mob totals, kill information, processing metrics, and error conditions.

---

# 🌎 Dimension-Safe v9 Persistence

Version 8 stored a spawner primarily by:

```text
x,y,z
```

That could collide if two spawners occupied the same coordinates in different dimensions.

Version 9 stores the global key as:

```text
x,y,z,dimension
```

For example:

```text
100,64,-40,overworld
100,64,-40,nether
100,64,-40,the_end
```

Those are now three independent spawners.

On startup, v9 migrates old coordinate-only records into the new schema while preserving the record contents and known dimension.

## Hybrid persistence design

v9 intentionally uses two layers:

1. **Scoreboard-backed database** — remains the global/offline index for lookup, configuration, migration, and recovery.
2. **Stable block dynamic properties** — each functional spawner block entity mirrors important local metadata such as schema version, type, dimension, placement information, kill count, last access, and linked chest information.

When an upgrade/downgrade changes a spawner from one level block ID to another, v9 captures and reapplies its metadata so the block-entity replacement does not silently discard that data.

---

# 👾 Supported Spawner Types

LeefySpawners v9 includes **39 supported spawner mobs**:

1. Blaze
2. Cow
3. Sheep
4. Pig
5. Chicken
6. Emerald Golem
7. Netherite Golem
8. Iron Golem
9. Diamond Golem
10. Gold Golem
11. Enderman
12. Creeper
13. Magma Cube
14. Guardian
15. Wither Skeleton
16. Zombie
17. Villager
18. Wither
19. Ender Dragon
20. Spider
21. Slime
22. Vindicator
23. Skeleton
24. Shulker
25. Breeze
26. Piglin Brute
27. Warden
28. Ravager
29. Snow Golem
30. Coal Crawler
31. Glowstone Crawler
32. Obsidian Crawler
33. Ice Crawler
34. Sponge Crawler
35. Lapis Crawler
36. Redstone Crawler
37. Copper Crawler
38. Quartz Crawler
39. Amethyst Crawler

---

# 📦 Installation

## Local world / Windows

1. Download `LeefySpawners.mcaddon`.
2. Open the file with Minecraft.
3. Apply both the LeefySpawners behavior pack and resource pack to the world.
4. Load the world and test a Level 1 spawner before migrating important production worlds.

## Bedrock Dedicated Server

1. Put `LeefySpawners BEH` in `behavior_packs`.
2. Put `LeefySpawners RES` in `resource_packs`.
3. Add their UUID/version entries to the world's `world_behavior_packs.json` and `world_resource_packs.json`.
4. Start the world on a Bedrock 26.50+ server.

## Realms

LeefySpawners v9 targets stable APIs, so Beta APIs are not required for the features used by the addon.

A common workflow is to apply the packs to a local world, verify the world loads successfully, then upload/replace the Realm world with that configured copy.

---

# 🔄 Upgrading from v8.2.86

Before upgrading a valuable world, **make a backup**.

v9 was intentionally designed to avoid a destructive content-ID migration:

- Existing pack UUIDs are preserved.
- Existing Level 1–32 spawner block/item identifiers are preserved.
- Old `x,y,z` database records are automatically migrated to dimension-aware keys.
- Missing legacy dimension metadata falls back safely to the Overworld and can self-heal as a spawner is interacted with.
- Existing scoreboard-backed data remains the authoritative global index.
- Block dynamic metadata is added as a local mirror rather than replacing the entire old persistence system in one risky release.

---

# 🧪 v9 Release QA

The v9 build pipeline automatically checks:

- Stable Script API migration
- Manifest versions and UUID relationships
- TypeScript compilation
- Production JS build and obfuscation
- Removal of the old private auto-OP behavior
- Three-dimension spawner processing
- Dimension-aware persistence/cooldown invariants
- Block dynamic-property usage
- Chest-routing dimension isolation
- Metadata synchronization
- Every functional spawner block definition's 26.50 block-entity configuration
- Outer `.mcaddon` ZIP integrity
- Both inner `.mcpack` ZIP archives

CI does **not** replace an actual Minecraft runtime smoke test. A new release should still be tested in a disposable Bedrock world/server before being promoted to a production Realm/SMP.

---

# 🧑‍💻 Developer Details

- **LeefySpawners:** `9.0.0`
- **Minimum Bedrock engine:** `1.26.50`
- **`@minecraft/server`:** `2.10.0`
- **`@minecraft/server-ui`:** `2.2.0`
- **APIs:** stable
- **Persistence:** scoreboard-backed global database + stable block dynamic-property mirror
- **Dimensions:** Overworld, Nether, End
- **Source language:** TypeScript
- **License:** MIT

Important source modules include:

```text
src/
├── import.ts
├── levelsystem.ts
├── mobstacker-core.ts
├── mobstacker-ui.ts
├── loot_table.ts
├── display-spawner-handler.ts
├── database.ts
├── spawner-storage.ts
├── security-service.ts
├── performance-monitor.ts
└── constants.ts
```

The production `.mcaddon` contains both the behavior and resource `.mcpack` archives.

---

# 📄 License

LeefySpawners is released under the **MIT License**.

Copyright © 2026 MrLeefy.
