import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = rel => JSON.parse(read(rel));
const fail = message => { throw new Error(`[v9.1 validation] ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const EXPECTED_VERSION = "9.1.0";
const pkg = json("package.json");
assert(pkg.version === EXPECTED_VERSION, `package version is ${pkg.version}, expected ${EXPECTED_VERSION}`);
assert(pkg.devDependencies?.["@minecraft/server"] === "2.10.0", "@minecraft/server must be 2.10.0");
assert(pkg.devDependencies?.["@minecraft/server-ui"] === "2.2.0", "@minecraft/server-ui must be 2.2.0");

const behavior = json("LeefySpawners BEH/manifest.json");
const resources = json("LeefySpawners RES/manifest.json");
assert(behavior.header.version.join(".") === EXPECTED_VERSION, `behavior pack must be v${EXPECTED_VERSION}`);
assert(resources.header.version.join(".") === EXPECTED_VERSION, `resource pack must be v${EXPECTED_VERSION}`);
assert(behavior.header.min_engine_version.join(".") === "1.26.50", "behavior pack must target 1.26.50+");
assert(resources.header.min_engine_version.join(".") === "1.26.50", "resource pack must target 1.26.50+");

const sourceFiles = [
  "src/import.ts",
  "src/levelsystem.ts",
  "src/mobstacker-core.ts",
  "src/mobstacker-ui.ts",
  "src/loot_table.ts",
  "src/spawner-storage.ts",
  "src/spawner-registry.ts",
];
const source = Object.fromEntries(sourceFiles.map(file => [file, read(file)]));
const allCriticalSource = Object.values(source).join("\n");

// Public release security invariants.
assert(!/runCommand(?:Async)?\([^\n]{0,160}\bop\b[^\n]{0,160}Mr\s*Leefy/i.test(allCriticalSource), "private auto-OP behavior is present");
assert(!/console\.log\s*=/.test(source["src/mobstacker-core.ts"]), "mobstacker-core still overrides global console.log");
assert(!source["src/import.ts"].includes("playerSpawn"), "import.ts contains player-spawn privilege logic");

// Dimension-safe block persistence.
const level = source["src/levelsystem.ts"];
assert(level.includes("migrateLegacySpawnerKeys(spawnerDatabase)"), "legacy spawner key migration is missing");
assert(level.includes("makeSpawnerKey(block.dimension.id"), "block database keys are not dimension-aware");
assert(level.includes("normalizeDimensionId(player.dimension.id) !== normalizeDimensionId(block.dimension.id)"), "form actions are not dimension-bound");
assert(!level.includes('const coordinates = `${block.x},${block.y},${block.z}`'), "coordinate-only block key remains in levelsystem");
assert(level.includes("spawnerRegistry.upsert(coordinates"), "levelsystem does not update runtime registry");
assert(level.includes("spawnerRegistry.remove(coordinates)"), "levelsystem does not remove runtime registry records");

// Spawnrule marker replacement must be complete. The entity definition may remain in the
// pack for backwards compatibility, but gameplay/runtime state must not create or depend on it.
assert(!level.includes('spawnEntity("mrleefy:spawnrule"'), "levelsystem still creates spawnrule markers");
assert(!level.includes("ensureSpawnruleEntity"), "levelsystem still ensures spawnrule markers");
assert(!level.includes("removeSpawnruleAtLocation"), "levelsystem still manages per-spawner marker entities");
assert(!source["src/mobstacker-ui.ts"].includes("SPAWNRULE_ENTITY_TYPE"), "admin UI still discovers spawners through marker entities");

const core = source["src/mobstacker-core.ts"];
const markerConstantUses = (core.match(/SPAWNRULE_ENTITY_TYPE/g) || []).length;
assert(markerConstantUses <= 1, `core has ${markerConstantUses} spawnrule marker references; only one legacy-cleanup reference is allowed`);
assert(!core.includes("spawnruleEntities"), "core still has marker-backed processing collections");
assert(!core.includes('spawnEntity("mrleefy:spawnrule"'), "core creates spawnrule marker entities");
assert(core.includes("spawnerRegistry.getNearPlayers"), "scheduler is not sourcing candidates from the spatial registry");
assert(core.includes("world.getAllPlayers()"), "scheduler is not driven by active player dimensions");
assert(core.includes("registry-backed spawner job"), "registry-backed processing job is missing");
assert(core.includes("findNearestForEntity"), "restart-safe stack ownership recovery is missing");
assert(core.includes("rebuildSpawnerRuntimeRegistry"), "runtime registry rebuild API is missing");
assert(core.includes("purgeLegacySpawnruleMarkers"), "legacy marker migration cleanup is missing");
assert(core.includes("syncSpawnerRecordToBlock(block, existingData)"), "kill-stat DB flush is not mirrored to block metadata");
assert(core.includes("restartSpawnerProcessingInterval"), "live performance scheduler restart is missing");
assert(!core.includes("const overworld = world.getDimension('overworld')"), "old overworld-only processing loop remains");

const registry = source["src/spawner-registry.ts"];
assert(registry.includes("class SpawnerRuntimeRegistry"), "runtime registry implementation is missing");
assert(registry.includes("private buckets = new Map<string, Set<string>>()"), "runtime registry is not chunk bucketed");
assert(registry.includes("getNearPlayers("), "runtime registry lacks nearby-player lookup");
assert(registry.includes("findNearestForEntity("), "runtime registry lacks restart ownership recovery");
assert(!registry.includes("@minecraft/server"), "runtime registry should remain a lightweight data structure with no entity API dependency");

// Loot/chest dimension safety retained from v9.
const loot = source["src/loot_table.ts"];
assert(loot.includes("parseSpawnerKey(key, data.dimensionId || 'overworld')"), "loot fallback does not parse dimension-aware keys");
assert(loot.includes("normalizeDimensionId(parsed.dimensionId) !== normalizeDimensionId(dimension.id)"), "loot fallback can cross dimensions");
assert(loot.includes("chest.dimensionId || spawnerData.dimensionId || dimension.id"), "linked-chest legacy dimension fallback is missing");

// Stable 26.50 block dynamic properties remain the per-block metadata mirror.
const storage = source["src/spawner-storage.ts"];
assert(storage.includes('getComponent("minecraft:dynamic_properties")'), "block dynamic property component lookup is missing");
assert(storage.includes("component.get("), "BlockDynamicPropertiesComponent.get is not used");
assert(storage.includes("component.set("), "BlockDynamicPropertiesComponent.set is not used");
assert(!storage.includes("component.getDynamicProperty("), "obsolete block dynamic property getter remains");
assert(!storage.includes("component.setDynamicProperty("), "obsolete block dynamic property setter remains");

let functionalSpawnerBlocks = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    let obj;
    try { obj = JSON.parse(fs.readFileSync(full, "utf8")); } catch { continue; }
    const block = obj?.["minecraft:block"];
    const id = block?.description?.identifier;
    if (!id || !id.startsWith("mrleefy:") || !id.includes("spawner") || id.endsWith("_display")) continue;

    functionalSpawnerBlocks++;
    assert(obj.format_version === "1.26.50", `${id} is not on block format 1.26.50`);
    assert(block.components?.["minecraft:block_entity"]?.dynamic_properties === true, `${id} is missing block-entity dynamic properties`);
  }
}
walk(path.join(ROOT, "LeefySpawners BEH", "blocks"));
assert(functionalSpawnerBlocks >= 1200, `only ${functionalSpawnerBlocks} functional spawner blocks were validated; expected the full 32-level catalog`);

const builtEntry = path.join(ROOT, "LeefySpawners BEH", behavior.modules.find(m => m.type === "script")?.entry || "");
assert(fs.existsSync(builtEntry), "compiled behavior-pack script entrypoint is missing");

console.log(`LeefySpawners v${EXPECTED_VERSION} invariants passed: marker-free scheduler + ${functionalSpawnerBlocks} block definitions validated.`);
