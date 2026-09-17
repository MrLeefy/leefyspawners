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

function replaceRegex(source, regex, replacement, label) {
  if (typeof replacement === "string" && source.includes(replacement)) return source;
  if (!regex.test(source)) throw new Error(`[v9 hardening] regex anchor missing: ${label}`);
  regex.lastIndex = 0;
  return source.replace(regex, replacement);
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

  // A placed block is authoritative for dimension, not the player's potentially-changing dimension.
  s = replaceRegex(
    s,
    /(world\.afterEvents\.playerPlaceBlock\.subscribe\([\s\S]*?const spawnerData = \{\n\s*typeId,\n\s*)dimensionId: player\.dimension\.id,/,
    '$1dimensionId: normalizeDimensionId(block.dimension.id),',
    "placement dimension",
  );

  s = replaceRegex(
    s,
    /(world\.afterEvents\.playerPlaceBlock\.subscribe\([\s\S]*?entitiesKilled: 0,\n)(\s*lastAccessed: Date\.now\(\))/,
    '$1            schemaVersion: SPAWNER_SCHEMA_VERSION,\n$2',
    "placement schema version",
  );

  s = replaceOnce(
    s,
    'const ent = player.dimension.spawnEntity("mrleefy:spawnrule" as any, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });',
    'const ent = block.dimension.spawnEntity("mrleefy:spawnrule" as any, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });',
    "placement spawnrule dimension",
  );

  // A form cannot be completed against a block in another dimension, even at matching numeric coordinates.
  s = replaceOnce(
    s,
    '    if (!isPlayerNearBlock(player, x, y, z, 10)) {\n        player.sendMessage("§cYou are too far from the spawner.");\n        return false;\n    }',
    '    if (normalizeDimensionId(player.dimension.id) !== normalizeDimensionId(block.dimension.id)) {\n        player.sendMessage("§cYou must be in the same dimension as the spawner.");\n        return false;\n    }\n    if (!isPlayerNearBlock(player, x, y, z, 10)) {\n        player.sendMessage("§cYou are too far from the spawner.");\n        return false;\n    }',
    "same-dimension form validation",
  );

  s = replaceOnce(
    s,
    'updateSpawnerDatabaseOnInteraction(coordinates, typeId, player);',
    'updateSpawnerDatabaseOnInteraction(coordinates, typeId, player, block.dimension.id);',
    "interaction passes block dimension",
  );

  const marker = 'function updateSpawnerDatabaseOnInteraction(coordinates: string, typeId: string, player: Player): void {';
  if (s.includes(marker)) {
    const start = s.indexOf(marker);
    let before = s.slice(0, start);
    let tail = s.slice(start);
    tail = tail.replace(
      marker,
      'function updateSpawnerDatabaseOnInteraction(coordinates: string, typeId: string, player: Player, spawnerDimensionId: string): void {',
    );
    tail = tail.replace(
      'dimensionId: player.dimension.id,',
      'dimensionId: normalizeDimensionId(spawnerDimensionId),',
    );
    tail = tail.replace(
      'entitiesKilled: 0,\n                lastAccessed: Date.now(),',
      'entitiesKilled: 0,\n                schemaVersion: SPAWNER_SCHEMA_VERSION,\n                lastAccessed: Date.now(),',
    );
    tail = tail.replace(
      'existingData.dimensionId = existingData.dimensionId || player.dimension.id; // Self-healing migration for legacy spawners',
      'existingData.dimensionId = normalizeDimensionId(existingData.dimensionId || spawnerDimensionId); // Self-healing migration for legacy spawners\n            existingData.schemaVersion = SPAWNER_SCHEMA_VERSION;',
    );
    s = before + tail;
  }

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

  // Remove an obsolete coordinate-only statistics helper. The direct key-based path is the only live path.
  s = replaceRegex(
    s,
    /\/\/ Update statistics when entities are killed\nfunction updateSpawnerStatistics\([\s\S]*?\n\}\n\n\/\/ Optimized Direct Statistics Writer bypassing string parsing/,
    '// Optimized Direct Statistics Writer bypassing string parsing',
    "remove legacy coordinate-only statistics helper",
  );

  s = replaceOnce(
    s,
    '            existingData.entitiesKilled += pending.kills;\n            existingData.lastKill = pending.lastKill;\n            existingData.lastAccessed = Date.now();',
    '            const parsedKey = parseSpawnerKey(locationKey, existingData.dimensionId || "overworld");\n            existingData.dimensionId = normalizeDimensionId(existingData.dimensionId || parsedKey?.dimensionId || "overworld");\n            existingData.schemaVersion = SPAWNER_SCHEMA_VERSION;\n            existingData.entitiesKilled += pending.kills;\n            existingData.lastKill = pending.lastKill;\n            existingData.lastAccessed = Date.now();',
    "kill metadata schema/dimension",
  );

  s = replaceOnce(
    s,
    '            spawnerDatabase.write(locationKey, existingData);\n        } catch (error) {\n            console.error(`Error saving spawner metadata for ${locationKey}:`, error);',
    '            spawnerDatabase.write(locationKey, existingData);\n\n            // Keep stable Bedrock 26.50 block dynamic properties in sync with the DB.\n            try {\n                const parsed = parseSpawnerKey(locationKey, existingData.dimensionId || "overworld");\n                if (parsed) {\n                    const dimension = world.getDimension(parsed.dimensionId);\n                    const block = dimension.getBlock({ x: parsed.x, y: parsed.y, z: parsed.z });\n                    if (block && block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display")) {\n                        syncSpawnerRecordToBlock(block, existingData);\n                    }\n                }\n            } catch { /* unloaded chunks remain safely represented by the global DB */ }\n        } catch (error) {\n            console.error(`Error saving spawner metadata for ${locationKey}:`, error);',
    "kill metadata block mirror",
  );

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

  s = replaceOnce(
    s,
    "                        if (spawnerType === entityType) {\n                            const [sx, sy, sz] = key.split(',').map(Number);\n                            const dx = location.x - sx;\n                            const dy = location.y - sy;\n                            const dz = location.z - sz;",
    "                        if (spawnerType === entityType) {\n                            const parsed = parseSpawnerKey(key, data.dimensionId || 'overworld');\n                            if (!parsed || normalizeDimensionId(parsed.dimensionId) !== normalizeDimensionId(deadEntity.dimension.id)) {\n                                continue;\n                            }\n                            const { x: sx, y: sy, z: sz } = parsed;\n                            const dx = location.x - sx;\n                            const dy = location.y - sy;\n                            const dz = location.z - sz;",
    "same-dimension nearest-spawner fallback",
  );

  s = replaceOnce(
    s,
    '                    const chest = spawnerData.linkedChest;\n                    const chestDim = world.getDimension(chest.dimensionId);',
    '                    const chest = spawnerData.linkedChest;\n                    const chestDimensionId = normalizeDimensionId(chest.dimensionId || spawnerData.dimensionId || deadEntity.dimension.id);\n                    const chestDim = world.getDimension(chestDimensionId);',
    "legacy linked chest dimension fallback",
  );

  write(rel, s);
}

console.log("LeefySpawners v9 hardening applied: authoritative block dimensions, metadata mirror sync, and cross-dimension chest-routing guards.");
