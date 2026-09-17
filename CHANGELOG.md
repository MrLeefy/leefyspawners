# Changelog

## 9.0.0 — Bedrock 26.50 modernization

LeefySpawners v9 is a migration-safe modernization of the v8.2.86 codebase for the Bedrock 26.50 stable release.

### Platform and API

- Updated minimum engine version to `1.26.50`.
- Updated `@minecraft/server` to stable `2.10.0`.
- Updated `@minecraft/server-ui` to stable `2.2.0`.
- Updated functional custom spawner blocks to the Bedrock 26.50 block format.
- Added stable `minecraft:block_entity` dynamic-property support to functional spawner blocks.

### Persistence and world compatibility

- Preserved existing behavior/resource pack UUIDs.
- Preserved the existing 32 block/item level identifiers for every supported mob so existing worlds and inventories are not deliberately invalidated.
- Changed global spawner keys from `x,y,z` to `x,y,z,dimension`.
- Added automatic migration for legacy coordinate-only database records.
- Added self-healing dimension/schema metadata on interaction.
- Added a hybrid persistence model: the scoreboard database remains the global/offline index while block dynamic properties mirror local per-spawner metadata.
- Preserved block metadata when an upgrade/downgrade replaces one level block ID with another.
- Synchronized kill-count metadata back to the block mirror during persistence flushes.

### Multi-dimension support

- Spawner processing now covers the Overworld, Nether, and End.
- Entity ownership keys, death cooldowns, statistics, admin search, and teleport data are dimension-aware.
- Prevented same-coordinate spawners in different dimensions from colliding.
- Hardened chest-loot fallback so it cannot resolve to a matching spawner in another dimension after a restart.
- Added safe dimension fallback for legacy linked-chest records.
- Bound active spawner form actions to the block's actual dimension.

### Security and permissions

- Removed the private player-name-based automatic operator grant from the public loader.
- Kept admin actions behind tag permission checks and action-time revalidation.
- Fixed owner/admin level-selection permission inconsistency.
- Removed the mob stacker's global `console.log` override; debug logging now uses an internal logger instead.

### Spawner engine and statistics

- Unified spawner statistics with the canonical supported-mob registry instead of a second hard-coded list.
- Villager and Ender Dragon are no longer omitted by the statistics mob set.
- Removed the obsolete coordinate-only statistics helper from the v9 source path.
- Retained virtual mob stacking, max-stack caching, activation radius controls, randomized first delays, memory cleanup, and cooperative processing budgets.

### Live performance controls

- Clarified that v9 performance controls apply live.
- Added safe restart/rescheduling of the spawner processing interval when the configured interval changes.
- Activation radius, max operations per cycle, and randomized delay configuration remain runtime-configurable.

### Automation, economy, loot, and admin systems retained

- 32-level progression and max-upgrade flow.
- Reaper I–V stack processing and Looting integration.
- Spawner-to-chest links and double-chest routing.
- Physical display-spawner shops with configurable scoreboard economy/pricing.
- Per-entity loot and XP configuration.
- Admin statistics, teleportation, database verification/cleanup, theme controls, logging, and emergency lag purge tools.
- 39 supported spawner mob types.

### Build and release QA

- Updated manifest validation for Bedrock 26.50 stable API versions.
- Added a dedicated v9 release-invariant test suite.
- Release CI checks removal of the private auto-OP behavior, dimension-safe keys, all three processing dimensions, cooldown alignment, chest-routing isolation, block dynamic-property usage, metadata synchronization, and live scheduler support.
- CI validates every functional spawner block definition for the 26.50 block-entity/dynamic-property configuration.
- Added integrity testing for the outer `.mcaddon` and both nested `.mcpack` archives before the artifact is uploaded.
- Made migration/hardening scripts idempotent so repeated CI/release runs do not double-patch or fail on already-migrated source.

### Important upgrade note

Back up valuable worlds before upgrading. v9 is designed to migrate v8.2.86 data in place, but a disposable Bedrock 26.50 world/server smoke test is still recommended before production deployment.
