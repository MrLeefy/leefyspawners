import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const write = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), data);

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[v9 hardening] anchor missing: ${label}`);
  return source.replace(search, replacement);
}

function replaceIfPresent(source, search, replacement) {
  return source.includes(search) ? source.replace(search, replacement) : source;
}

// ---------------------------------------------------------------------------
// Spawner placement / interaction hardening
// ---------------------------------------------------------------------------
{
  const rel = "src/levelsystem.ts";
  let s = read(rel);

  s = replaceOnce(
    s,
    'import { makeSpawnerKey, migrateLegacySpawnerKeys, normalizeDimensionId, replaceSpawnerBlockTypePreservingMetadata, syncSpawnerRecordToBlock } from "./spawner-storage.js";',
    'import { makeSpawnerKey, migrateLegacySpawnerKeys, normalizeDimensionId, replaceSpawnerBlockTypePreservingMetadata, SPAWNER_SCHEMA_VERSION, syncSpawnerRecordToBlock } from "./spawner-storage.js";',
    "levelsystem schema import",
  );

  // Work only inside the placement handler so matching strings in upgrade paths
  // cannot cause false positives. Every mutation below is safe to run repeatedly.
  const placementStart = s.indexOf("world.afterEvents.playerPlaceBlock.subscribe");
  const placementEnd = s.indexOf("// SINGLE MERGED AND SECURE BLOCK INTERACTION HANDLER", placementStart);
  if (placementStart < 0 || placementEnd < 0) {
    throw new Error("[v9 hardening] placement handler boundaries not found");
  }
  const beforePlacement = s.slice(0, placementStart);
  let placement = s.slice(placementStart, placementEnd);
  const afterPlacement = s.slice(placementEnd);

  if (!placement.includes("dimensionId: normalizeDimensionId(block.dimension.id),")) {
    if (!placement.includes("dimensionId: player.dimension.id,")) {
      throw new Error("[v9 hardening] placement dimension anchor missing");
    }
    placement = placement.replace(
      "dimensionId: player.dimension.id,",
      "dimensionId: normalizeDimensionId(block.dimension.id),",
    );
  }

  if (!placement.includes("schemaVersion: SPAWNER_SCHEMA_VERSION,")) {
    const anchor = "            entitiesKilled: 0,\n            lastAccessed: Date.now()";
    if (!placement.includes(anchor)) {
      throw new Error("[v9 hardening] placement schema-version anchor missing");
    }
    placement = placement.replace(
      anchor,
      "            entitiesKilled: 0,\n            schemaVersion: SPAWNER_SCHEMA_VERSION,\n            lastAccessed: Date.now()",
    );
  }

  placement = replaceIfPresent(
    placement,
    'const ent = player.dimension.spawnEntity("mrleefy:spawnrule" as any, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });',
    'const ent = block.dimension.spawnEntity("mrleefy:spawnrule" as any, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });',
  );
  if (!placement.includes('block.dimension.spawnEntity("mrleefy:spawnrule"')) {
    throw new Error("[v9 hardening] placement spawnrule dimension was not hardened");
  }

  s = beforePlacement + placement + afterPlacement;

  const sameDimensionGuard = '    if (normalizeDimensionId(player.dimension.id) !== normalizeDimensionId(block.dimension.id)) {\n        player.sendMessage("§cYou must be in the same dimension as the spawner.");\n        return false;\n    }';
  if (!s.includes(sameDimensionGuard)) {
    const distanceGuard = '    if (!isPlayerNearBlock(player, x, y, z, 10)) {\n        player.sendMessage("§cYou are too far from the spawner.");\n        return false;\n    }';
    if (!s.includes(distanceGuard)) {
      throw new Error("[v9 hardening] same-dimension form validation anchor missing");
    }
    s = s.replace(distanceGuard, `${sameDimensionGuard}\n${distanceGuard}`);
  }

  s = replaceIfPresent(
    s,
    'updateSpawnerDatabaseOnInteraction(coordinates, typeId, player);',
    'updateSpawnerDatabaseOnInteraction(coordinates, typeId, player, block.dimension.id);',
  );
  if (!s.includes('updateSpawnerDatabaseOnInteraction(coordinates, typeId, player, block.dimension.id);')) {
    throw new Error("[v9 hardening] interaction does not pass the block dimension");
  }

  const oldMarker = 'function updateSpawnerDatabaseOnInteraction(coordinates: string, typeId: string, player: Player): void {';
  const newMarker = 'function updateSpawnerDatabaseOnInteraction(coordinates: string, typeId: string, player: Player, spawnerDimensionId: string): void {';
  if (s.includes(oldMarker)) s = s.replace(oldMarker, newMarker);
  if (!s.includes(newMarker)) {
    throw new Error("[v9 hardening] interaction database helper signature missing");
  }

  const helperStart = s.indexOf(newMarker);
  let helperPrefix = s.slice(0, helperStart);
  let helper = s.slice(helperStart);
  helper = replaceIfPresent(
    helper,
    "dimensionId: player.dimension.id,",
    "dimensionId: normalizeDimensionId(spawnerDimensionId),",
  );
  if (!helper.includes("dimensionId: normalizeDimensionId(spawnerDimensionId),")) {
    throw new Error("[v9 hardening] interaction record dimension is not authoritative");
  }

  if (!helper.includes("schemaVersion: SPAWNER_SCHEMA_VERSION,")) {
    const recordAnchor = "                entitiesKilled: 0,\n                lastAccessed: Date.now(),";
    if (!helper.includes(recordAnchor)) {
      throw new Error("[v9 hardening] interaction schema-version anchor missing");
    }
    helper = helper.replace(
      recordAnchor,
      "                entitiesKilled: 0,\n                schemaVersion: SPAWNER_SCHEMA_VERSION,\n                lastAccessed: Date.now(),",
    );
  }

  helper = replaceIfPresent(
    helper,
    "existingData.dimensionId = existingData.dimensionId || player.dimension.id; // Self-healing migration for legacy spawners",
    "existingData.dimensionId = normalizeDimensionId(existingData.dimensionId || spawnerDimensionId); // Self-healing migration for legacy spawners\n            existingData.schemaVersion = SPAWNER_SCHEMA_VERSION;",
  );
  if (!helper.includes("existingData.dimensionId = normalizeDimensionId(existingData.dimensionId || spawnerDimensionId);")) {
    throw new Error("[v9 hardening] existing interaction record does not self-heal its dimension");
  }
  if (!helper.includes("existingData.schemaVersion = SPAWNER_SCHEMA_VERSION;")) {
    throw new Error("[v9 hardening] existing interaction record does not self-heal its schema version");
  }

  s = helperPrefix + helper;
  write(rel, s);
}

// ---------------------------------------------------------------------------
// Keep the new block-entity mirror current when kill statistics flush.
// ---------------------------------------------------------------------------
{
  const rel = "src/mobstacker-core.ts";
  let s = read(rel);

  s = replaceOnce(
    s,
    'import { makeSpawnerKey, normalizeDimensionId } from "./spawner-storage.js";',
    'import { makeSpawnerKey, normalizeDimensionId, parseSpawnerKey, SPAWNER_SCHEMA_VERSION, syncSpawnerRecordToBlock } from "./spawner-storage.js";',
    "core metadata imports",
  );

  // Remove the obsolete coordinate-only helper if it is still present.
  // The direct key-based path below is the only live statistics writer in v9.
  if (s.includes("function updateSpawnerStatistics(")) {
    const legacyStats = /\/\/ Update statistics when entities are killed\nfunction updateSpawnerStatistics\([\s\S]*?\n\}\n\n\/\/ Optimized Direct Statistics Writer bypassing string parsing/;
    if (!legacyStats.test(s)) {
      throw new Error("[v9 hardening] legacy statistics helper boundary not found");
    }
    s = s.replace(legacyStats, "// Optimized Direct Statistics Writer bypassing string parsing");
  }

  const metadataReplacement = '            const parsedKey = parseSpawnerKey(locationKey, existingData.dimensionId || "overworld");\n            existingData.dimensionId = normalizeDimensionId(existingData.dimensionId || parsedKey?.dimensionId || "overworld");\n            existingData.schemaVersion = SPAWNER_SCHEMA_VERSION;\n            existingData.entitiesKilled += pending.kills;\n            existingData.lastKill = pending.lastKill;\n            existingData.lastAccessed = Date.now();';
  if (!s.includes(metadataReplacement)) {
    const metadataAnchor = '            existingData.entitiesKilled += pending.kills;\n            existingData.lastKill = pending.lastKill;\n            existingData.lastAccessed = Date.now();';
    if (!s.includes(metadataAnchor)) {
      throw new Error("[v9 hardening] kill metadata anchor missing");
    }
    s = s.replace(metadataAnchor, metadataReplacement);
  }

  const mirrorMarker = "// Keep stable Bedrock 26.50 block dynamic properties in sync with the DB.";
  if (!s.includes(mirrorMarker)) {
    const writeAnchor = '            spawnerDatabase.write(locationKey, existingData);\n        } catch (error) {\n            console.error(`Error saving spawner metadata for ${locationKey}:`, error);';
    const writeReplacement = '            spawnerDatabase.write(locationKey, existingData);\n\n            // Keep stable Bedrock 26.50 block dynamic properties in sync with the DB.\n            try {\n                const parsed = parseSpawnerKey(locationKey, existingData.dimensionId || "overworld");\n                if (parsed) {\n                    const dimension = world.getDimension(parsed.dimensionId);\n                    const block = dimension.getBlock({ x: parsed.x, y: parsed.y, z: parsed.z });\n                    if (block && block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display")) {\n                        syncSpawnerRecordToBlock(block, existingData);\n                    }\n                }\n            } catch { /* unloaded chunks remain safely represented by the global DB */ }\n        } catch (error) {\n            console.error(`Error saving spawner metadata for ${locationKey}:`, error);';
    if (!s.includes(writeAnchor)) {
      throw new Error("[v9 hardening] kill metadata mirror anchor missing");
    }
    s = s.replace(writeAnchor, writeReplacement);
  }

  write(rel, s);
}

// ---------------------------------------------------------------------------
// Chest routing fallback must never bind a death to a spawner in another dim.
// ---------------------------------------------------------------------------
{
  const rel = "src/loot_table.ts";
  let s = read(rel);

  s = replaceOnce(
    s,
    'import { spawnerDatabase } from "./levelsystem.js";',
    'import { spawnerDatabase } from "./levelsystem.js";\nimport { normalizeDimensionId, parseSpawnerKey } from "./spawner-storage.js";',
    "loot storage helpers",
  );

  const nearestReplacement = "                        if (spawnerType === entityType) {\n                            const parsed = parseSpawnerKey(key, data.dimensionId || 'overworld');\n                            if (!parsed || normalizeDimensionId(parsed.dimensionId) !== normalizeDimensionId(dimension.id)) {\n                                continue;\n                            }\n                            const { x: sx, y: sy, z: sz } = parsed;\n                            const dx = location.x - sx;\n                            const dy = location.y - sy;\n                            const dz = location.z - sz;";
  if (!s.includes(nearestReplacement)) {
    const nearestAnchor = "                        if (spawnerType === entityType) {\n                            const [sx, sy, sz] = key.split(',').map(Number);\n                            const dx = location.x - sx;\n                            const dy = location.y - sy;\n                            const dz = location.z - sz;";
    if (!s.includes(nearestAnchor)) {
      throw new Error("[v9 hardening] nearest-spawner fallback anchor missing");
    }
    s = s.replace(nearestAnchor, nearestReplacement);
  }

  const chestReplacement = '                    const chest = spawnerData.linkedChest;\n                    const chestDimensionId = normalizeDimensionId(chest.dimensionId || spawnerData.dimensionId || dimension.id);\n                    const chestDim = world.getDimension(chestDimensionId);';
  if (!s.includes(chestReplacement)) {
    const chestAnchor = '                    const chest = spawnerData.linkedChest;\n                    const chestDim = world.getDimension(chest.dimensionId);';
    if (!s.includes(chestAnchor)) {
      throw new Error("[v9 hardening] linked-chest dimension fallback anchor missing");
    }
    s = s.replace(chestAnchor, chestReplacement);
  }

  write(rel, s);
}

console.log("LeefySpawners v9 hardening applied: authoritative block dimensions, metadata mirror sync, and cross-dimension chest-routing guards.");
