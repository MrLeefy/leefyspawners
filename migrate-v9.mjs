import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const write = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), data);

function mustReplace(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`v9 migration anchor missing: ${label}`);
  return source.replace(search, replacement);
}

function mustReplaceRegex(source, regex, replacement, label) {
  if (typeof replacement === "string" && source.includes(replacement)) return source;
  if (!regex.test(source)) throw new Error(`v9 migration regex anchor missing: ${label}`);
  regex.lastIndex = 0;
  return source.replace(regex, replacement);
}

function patchJson(rel, mutate) {
  const obj = JSON.parse(read(rel));
  mutate(obj);
  write(rel, JSON.stringify(obj, null, "\t") + "\n");
}

// ---------------------------------------------------------------------------
// Version + stable 26.50 API baseline
// ---------------------------------------------------------------------------
patchJson("package.json", pkg => {
  pkg.version = "9.0.0";
  pkg.description = "Realm/server-grade spawner progression, stacking, automation and economy system for Minecraft Bedrock 26.50+.";
  pkg.devDependencies["@minecraft/server"] = "2.10.0";
  pkg.devDependencies["@minecraft/server-ui"] = "2.2.0";
});

patchJson("LeefySpawners BEH/manifest.json", manifest => {
  manifest.header.name = "LeefySpawners v9.0.0 BEH - Sep 2026";
  manifest.header.description = "LeefySpawners v9 - Stable Bedrock 26.50, multi-dimension persistence and block-entity metadata";
  manifest.header.version = [9, 0, 0];
  manifest.header.min_engine_version = [1, 26, 50];
  for (const mod of manifest.modules || []) mod.version = [9, 0, 0];
  for (const dep of manifest.dependencies || []) {
    if (dep.module_name === "@minecraft/server") dep.version = "2.10.0";
    else if (dep.module_name === "@minecraft/server-ui") dep.version = "2.2.0";
    else if (dep.uuid) dep.version = [9, 0, 0];
  }
});

patchJson("LeefySpawners RES/manifest.json", manifest => {
  manifest.header.name = "LeefySpawners v9.0.0 RES - Sep 2026";
  manifest.header.description = "LeefySpawners v9 Resource Pack - Stable Bedrock 26.50+";
  manifest.header.version = [9, 0, 0];
  manifest.header.min_engine_version = [1, 26, 50];
  for (const mod of manifest.modules || []) mod.version = [9, 0, 0];
  for (const dep of manifest.dependencies || []) if (dep.uuid) dep.version = [9, 0, 0];
});

// ---------------------------------------------------------------------------
// Turn every functional v8 level block into a stable 26.50 block entity.
// The existing IDs remain untouched so inventories/worlds remain compatible.
// ---------------------------------------------------------------------------
function walkJson(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJson(full);
    else if (ent.isFile() && ent.name.endsWith(".json")) {
      let obj;
      try { obj = JSON.parse(fs.readFileSync(full, "utf8")); } catch { continue; }
      const block = obj?.["minecraft:block"];
      const id = block?.description?.identifier;
      if (!id || !id.startsWith("mrleefy:") || !id.includes("spawner") || id.endsWith("_display")) continue;
      obj.format_version = "1.26.50";
      block.components ||= {};
      block.components["minecraft:block_entity"] = { dynamic_properties: true };
      fs.writeFileSync(full, JSON.stringify(obj, null, 4) + "\n");
    }
  }
}
walkJson(path.join(ROOT, "LeefySpawners BEH", "blocks"));

// ---------------------------------------------------------------------------
// Remove private auto-OP behavior completely.
// ---------------------------------------------------------------------------
write("src/import.ts", `import "./constants.js";\nimport "./database.js";\nimport "./configuration-service.js";\nimport "./performance-monitor.js";\nimport "./security-service.js";\nimport "./levelsystem.js";\nimport "./mobstacker-core.js";\nimport "./mobstacker-ui.js";\nimport "./stack_remover.js";\nimport "./placelimit.js";\nimport "./loot_table.js";\nimport "./display-spawner-handler.js";\n`);

// ---------------------------------------------------------------------------
// Level system: dimension-aware keys + block metadata + preserved upgrades.
// ---------------------------------------------------------------------------
{
  const rel = "src/levelsystem.ts";
  let s = read(rel);
  if (!s.includes("// LeefySpawners v9: dimension-aware storage")) {
    s = mustReplace(
      s,
      'import { getDoubleChestContainers } from "./loot_table.js";\n',
      'import { getDoubleChestContainers } from "./loot_table.js";\nimport { makeSpawnerKey, migrateLegacySpawnerKeys, normalizeDimensionId, replaceSpawnerBlockTypePreservingMetadata, syncSpawnerRecordToBlock } from "./spawner-storage.js";\n\n// LeefySpawners v9: dimension-aware storage + stable 26.50 block metadata\n',
      "levelsystem storage import",
    );

    s = mustReplace(
      s,
      'const spawnerDatabase = new Database("SpawnerLocations");',
      'const spawnerDatabase = new Database("SpawnerLocations");\n\n// Migrate v8 x,y,z records after the scoreboard DB has initialized.\nsystem.run(() => system.run(() => {\n    const migrated = migrateLegacySpawnerKeys(spawnerDatabase);\n    if (migrated > 0) console.warn(`[LeefySpawners v9] Migrated ${migrated} legacy spawner record(s) to dimension-aware keys.`);\n}));',
      "legacy key migration",
    );

    s = s.replaceAll('const coordinates = `${block.x},${block.y},${block.z}`;', 'const coordinates = makeSpawnerKey(block.dimension.id, block.x, block.y, block.z);');
    s = s.replaceAll('const nearbyCoordinates = `${block.x + dx},${block.y + dy},${block.z + dz}`;', 'const nearbyCoordinates = makeSpawnerKey(dimension.id, block.x + dx, block.y + dy, block.z + dz);');
    s = s.replaceAll('const coordinates = `${blockCoord.x},${blockCoord.y},${blockCoord.z}`;', 'const coordinates = makeSpawnerKey(dimension.id, blockCoord.x, blockCoord.y, blockCoord.z);');
    s = s.replaceAll('const coordinates = `${x},${y},${z}`;', 'const coordinates = makeSpawnerKey(block.dimension.id, x, y, z);');

    s = mustReplace(
      s,
      '        spawnerDatabase.write(coordinates, spawnerData);\n\n        try {',
      '        spawnerDatabase.write(coordinates, spawnerData);\n        syncSpawnerRecordToBlock(block, spawnerData);\n\n        try {',
      "placement metadata mirror",
    );

    s = mustReplace(
      s,
      '    updateSpawnerDatabaseOnInteraction(coordinates, typeId, player);\n\n    // Open form',
      '    updateSpawnerDatabaseOnInteraction(coordinates, typeId, player);\n    const currentRecord = spawnerDatabase.read(coordinates);\n    if (currentRecord) syncSpawnerRecordToBlock(block, currentRecord);\n\n    // Open form',
      "interaction metadata mirror",
    );

    s = s.replace('if (player.hasTag(UI.OWNER_PERMISSION_TAG)) {', 'if (player.hasTag(UI.OWNER_PERMISSION_TAG) || player.hasTag(UI.ADMIN_PERMISSION_TAG)) {');
    s = s.replaceAll('if (!player.hasTag(`admin`)) {', 'if (!player.hasTag(UI.ADMIN_PERMISSION_TAG) && !player.hasTag(UI.OWNER_PERMISSION_TAG)) {');

    s = mustReplace(
      s,
      '                const newBlockType = `mrleefy:${spawnerType}spawner${newLevel}`;\n                block.setType(newBlockType);\n\n                clearMaxedSpawnerCache(x, y, z);',
      '                const newBlockType = `mrleefy:${spawnerType}spawner${newLevel}`;\n                const existingData = spawnerDatabase.read(coordinates) || {\n                    typeId, dimensionId: normalizeDimensionId(block.dimension.id), placedBy: player.name, placedAt: Date.now(), entitiesKilled: 0\n                };\n                existingData.typeId = newBlockType;\n                existingData.dimensionId = normalizeDimensionId(block.dimension.id);\n                existingData.lastAccessed = Date.now();\n                replaceSpawnerBlockTypePreservingMetadata(block, newBlockType, existingData);\n                spawnerDatabase.write(coordinates, existingData);\n\n                clearMaxedSpawnerCache(x, y, z);',
      "admin level change metadata preserve",
    );

    s = mustReplaceRegex(
      s,
      /    const newTypeId = `\$\{spawnerItemPrefix\}\$\{newLevel\}`;\n    block\.setType\(newTypeId\);\n\n    const coordinates = makeSpawnerKey\(block\.dimension\.id, x, y, z\);\n    const existingData = spawnerDatabase\.read\(coordinates\);\n    if \(existingData\) \{\n        existingData\.typeId = newTypeId;\n        existingData\.lastAccessed = Date\.now\(\);\n        spawnerDatabase\.write\(coordinates, existingData\);\n    \}/,
      '    const newTypeId = `${spawnerItemPrefix}${newLevel}`;\n    const coordinates = makeSpawnerKey(block.dimension.id, x, y, z);\n    const existingData = spawnerDatabase.read(coordinates) || {\n        typeId, dimensionId: normalizeDimensionId(block.dimension.id), placedBy: player.name, placedAt: Date.now(), entitiesKilled: 0\n    };\n    existingData.typeId = newTypeId;\n    existingData.dimensionId = normalizeDimensionId(block.dimension.id);\n    existingData.lastAccessed = Date.now();\n    replaceSpawnerBlockTypePreservingMetadata(block, newTypeId, existingData);\n    spawnerDatabase.write(coordinates, existingData);',
      "max upgrade metadata preserve",
    );

    s = mustReplaceRegex(
      s,
      /    block\.setType\(`\$\{spawnerItemPrefix\}\$\{newLevel\}`\);\n    player\.sendMessage\(`§7Successfully upgraded to level §2§l\$\{newLevel\}`\);\n\n    const coordinates = makeSpawnerKey\(block\.dimension\.id, x, y, z\);\n    const existingData = spawnerDatabase\.read\(coordinates\);\n    if \(existingData\) \{\n        existingData\.typeId = `\$\{spawnerItemPrefix\}\$\{newLevel\}`;\n        existingData\.lastAccessed = Date\.now\(\);\n        spawnerDatabase\.write\(coordinates, existingData\);\n    \}/,
      '    const upgradedTypeId = `${spawnerItemPrefix}${newLevel}`;\n    const coordinates = makeSpawnerKey(block.dimension.id, x, y, z);\n    const existingData = spawnerDatabase.read(coordinates) || {\n        typeId, dimensionId: normalizeDimensionId(block.dimension.id), placedBy: player.name, placedAt: Date.now(), entitiesKilled: 0\n    };\n    existingData.typeId = upgradedTypeId;\n    existingData.dimensionId = normalizeDimensionId(block.dimension.id);\n    existingData.lastAccessed = Date.now();\n    replaceSpawnerBlockTypePreservingMetadata(block, upgradedTypeId, existingData);\n    spawnerDatabase.write(coordinates, existingData);\n    player.sendMessage(`§7Successfully upgraded to level §2§l${newLevel}`);',
      "single upgrade metadata preserve",
    );

    s = mustReplaceRegex(
      s,
      /    const newLevel = level - 1;\n    const newTypeId = `mrleefy:\$\{spawnerType\}spawner\$\{newLevel\}`;\n    block\.setType\(newTypeId\);\n\n    const existingData = spawnerDatabase\.read\(coordinates\);\n    if \(existingData\) \{\n        existingData\.typeId = newTypeId;\n        existingData\.lastAccessed = Date\.now\(\);\n        spawnerDatabase\.write\(coordinates, existingData\);\n    \}/,
      '    const newLevel = level - 1;\n    const newTypeId = `mrleefy:${spawnerType}spawner${newLevel}`;\n    const existingData = spawnerDatabase.read(coordinates) || {\n        typeId: currentBlock.typeId, dimensionId: normalizeDimensionId(block.dimension.id), placedBy: player.name, placedAt: Date.now(), entitiesKilled: 0\n    };\n    existingData.typeId = newTypeId;\n    existingData.dimensionId = normalizeDimensionId(block.dimension.id);\n    existingData.lastAccessed = Date.now();\n    replaceSpawnerBlockTypePreservingMetadata(block, newTypeId, existingData);\n    spawnerDatabase.write(coordinates, existingData);',
      "downgrade metadata preserve",
    );

    // Keep the mirrored block entity current whenever self-healing touches a record.
    s = mustReplace(
      s,
      '            spawnerDatabase.write(coordinates, existingData);\n        }\n    } catch (error) {\n        console.error(`Error updating spawner database on interaction: ${error}`);',
      '            spawnerDatabase.write(coordinates, existingData);\n        }\n    } catch (error) {\n        console.error(`Error updating spawner database on interaction: ${error}`);',
      "interaction record finalization",
    );

    write(rel, s);
  }
}

// ---------------------------------------------------------------------------
// Core stacker: true multi-dimension processing, no global console override,
// canonical mob registry, live scheduler restart and dimension-aware ownership.
// ---------------------------------------------------------------------------
{
  const rel = "src/mobstacker-core.ts";
  let s = read(rel);
  if (!s.includes("// LeefySpawners v9: multi-dimension core")) {
    s = mustReplace(
      s,
      'import { reapMultipliers, deadEntitySpawnerMap } from "./loot_table.js";\n',
      'import { reapMultipliers, deadEntitySpawnerMap } from "./loot_table.js";\nimport { makeSpawnerKey, normalizeDimensionId } from "./spawner-storage.js";\n\n// LeefySpawners v9: multi-dimension core\n',
      "core storage import",
    );

    s = mustReplaceRegex(
      s,
      /let LOGGING_ENABLED = false;[\s\S]*?function isLoggingEnabled\(\) \{\n    return LOGGING_ENABLED;\n\}/,
      `let LOGGING_ENABLED = false;\nconst baseConsoleLog = console.log.bind(console);\n\nfunction debugLog(message: any, ...args: any[]): void {\n    if (LOGGING_ENABLED) baseConsoleLog(\`[DEBUG] \${message}\`, ...args);\n}\n\nfunction enableLogging() {\n    LOGGING_ENABLED = true;\n    baseConsoleLog("[MOBSTACKER] Logging enabled");\n}\n\nfunction disableLogging() {\n    baseConsoleLog("[MOBSTACKER] Logging disabled");\n    LOGGING_ENABLED = false;\n}\n\nfunction isLoggingEnabled() {\n    return LOGGING_ENABLED;\n}`,
      "logger isolation",
    );

    s = s.replace(
      /    const validMobs = \[[\s\S]*?\];\n\n    for \(const dimId of dimensions\)/,
      '    const validMobTypes = validMobs.map(mob => mob.typeId);\n\n    for (const dimId of dimensions)',
    );
    s = s.replace('for (const mobType of validMobs) {', 'for (const mobType of validMobTypes) {');

    s = mustReplaceRegex(
      s,
      /function hasPlayersNearby\(location: Vector3, radius: number\): boolean \{[\s\S]*?\n\}/,
      `function hasPlayersNearby(dimension: Dimension, location: Vector3, radius: number): boolean {\n    try {\n        return dimension.getPlayers({ location, maxDistance: radius, closest: 1 }).length > 0;\n    } catch (error) {\n        debugLog(\`Error checking players near \${location.x},\${location.y},\${location.z}: \${error}\`);\n        return true;\n    }\n}`,
      "dimension-aware nearby players",
    );

    s = s.replace('const chunkKey = getChunkKey(entity.location.x, entity.location.z);', 'const chunkKey = `${normalizeDimensionId(entity.dimension.id)}:${getChunkKey(entity.location.x, entity.location.z)}`;');

    s = mustReplaceRegex(
      s,
      /export function clearMaxedSpawnerCache\(x: number, y: number, z: number\): void \{[\s\S]*?\n\}/,
      `export function clearMaxedSpawnerCache(x: number, y: number, z: number): void {\n    const coords = \`\${Math.floor(x)},\${Math.floor(y)},\${Math.floor(z)}\`;\n    for (const [key] of maxedSpawners) {\n        if (key.includes(\`:\${coords},\`) || key.endsWith(\`:\${coords}\`)) {\n            maxedSpawners.delete(key);\n            debugLog(\`Cleared maxed cache for: \${key}\`);\n        }\n    }\n}`,
      "dimension-aware cache clear",
    );

    s = mustReplaceRegex(
      s,
      /function\* spawnerProcessingJob\(\) \{[\s\S]*?\n\}\n\n\/\/ Main interval that triggers the job-based processing/,
      `function* spawnerProcessingJob() {\n    try {\n        const startTime = Date.now();\n        let tickStartTime = startTime;\n        const radius = getCachedConfig("stackRadius", UI.DEFAULT_STACK_RADIUS);\n        const perfConfig = getPerformanceConfig();\n        const dimensionIds = ["overworld", "nether", "the_end"];\n        const allSpawnrules: Entity[] = [];\n        const playerRadiusSq = perfConfig.PLAYER_ACTIVATION_RADIUS * perfConfig.PLAYER_ACTIVATION_RADIUS;\n\n        let spawnsThisCycle = 0;\n        let processedCount = 0;\n        let skippedNoPlayers = 0;\n        let skippedMaxed = 0;\n\n        for (const dimensionId of dimensionIds) {\n            let dimension: Dimension;\n            try { dimension = world.getDimension(dimensionId); } catch { continue; }\n\n            let spawnruleEntities: Entity[] = [];\n            try { spawnruleEntities = dimension.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE }); } catch { continue; }\n            allSpawnrules.push(...spawnruleEntities);\n            if (spawnruleEntities.length === 0) continue;\n\n            const activePlayers = dimension.getPlayers();\n            if (activePlayers.length === 0) {\n                skippedNoPlayers += spawnruleEntities.length;\n                continue;\n            }\n\n            for (const spawnruleEntity of spawnruleEntities) {\n                if (Date.now() - tickStartTime > 4) {\n                    yield;\n                    tickStartTime = Date.now();\n                }\n                if (!spawnruleEntity?.isValid) continue;\n\n                const location = spawnruleEntity.location;\n                let playerNear = false;\n                for (const player of activePlayers) {\n                    if (!player.isValid) continue;\n                    const pLoc = player.location;\n                    const dx = pLoc.x - location.x;\n                    const dy = pLoc.y - location.y;\n                    const dz = pLoc.z - location.z;\n                    if ((dx * dx + dy * dy + dz * dz) <= playerRadiusSq) {\n                        playerNear = true;\n                        break;\n                    }\n                }\n                if (!playerNear) { skippedNoPlayers++; continue; }\n\n                const nameTag = spawnruleEntity.nameTag;\n                if (!nameTag) continue;\n                const specs = getSpawnerSpecs(nameTag);\n                if (!specs) continue;\n\n                const { entityTypeId, qty, speed, maxStack, displayName } = specs;\n                const spawnerKey = makeSpawnerKey(dimension.id, location.x, location.y, location.z);\n                const spawnKey = \`\${entityTypeId}:\${spawnerKey}\`;\n                const now = Date.now();\n\n                if (maxedSpawners.has(spawnKey)) {\n                    const lastMaxedCheck = maxedSpawners.get(spawnKey);\n                    if (now - lastMaxedCheck < perfConfig.MAXED_SPAWNER_RECHECK_MS) {\n                        skippedMaxed++;\n                        continue;\n                    }\n                }\n\n                const lastSpawn = lastSpawnTime.get(spawnKey) || 0;\n                const lastKill = lastKilled.get(spawnKey) || 0;\n                const speedMillis = speed * 1000;\n                if (lastSpawn === 0 && perfConfig.INITIAL_DELAY_RANDOM) {\n                    lastSpawnTime.set(spawnKey, now - Math.random() * speedMillis);\n                    continue;\n                }\n                if (now - lastSpawn < speedMillis || now - lastKill < cooldownMillis) continue;\n                if (spawnsThisCycle >= perfConfig.MAX_SPAWNS_PER_CYCLE) continue;\n                if (!spawnruleEntity.isValid) continue;\n\n                let nearbyEntities: Entity[];\n                try {\n                    nearbyEntities = dimension.getEntities({ type: entityTypeId, location, maxDistance: radius });\n                } catch { continue; }\n\n                lastSpawnTime.set(spawnKey, now);\n                let primaryEntity: Entity | null = null;\n                let maxStackInArea = 0;\n                let totalStack = 0;\n                const extras: Entity[] = [];\n\n                for (const entity of nearbyEntities) {\n                    if (!entity?.isValid || dyingEntities.has(entity.id)) continue;\n                    const stackSize = extractStackNumber(entity.nameTag || "");\n                    totalStack += stackSize;\n                    if (stackSize > maxStackInArea) {\n                        if (primaryEntity) extras.push(primaryEntity);\n                        maxStackInArea = stackSize;\n                        primaryEntity = entity;\n                    } else extras.push(entity);\n                }\n\n                for (const entity of extras) {\n                    try {\n                        if (entity.isValid) {\n                            entitySpawnerMap.delete(entity.id);\n                            entitySpawnerOwnership.delete(entity.id);\n                            entity.remove();\n                            performanceMetrics.entityRemovals++;\n                        }\n                    } catch (error) { debugLog(\`Failed to remove entity: \${(error as any).message}\`); }\n                }\n\n                if (primaryEntity && primaryEntity.isValid) {\n                    const newStackSize = Math.min(totalStack + qty, maxStack);\n                    const currentStack = extractStackNumber(primaryEntity.nameTag || "");\n                    if (currentStack !== newStackSize) {\n                        try { primaryEntity.nameTag = nameTagConfig.replace('#', newStackSize.toString()).replace('@', displayName); }\n                        catch (err) { debugLog(\`Failed to update primary entity nameTag: \${(err as any).message}\`); }\n                    }\n                    entitySpawnerMap.set(primaryEntity.id, spawnerKey);\n                    if (newStackSize >= maxStack) {\n                        maxedSpawners.set(spawnKey, now);\n                        entitySpawnerOwnership.set(primaryEntity.id, spawnKey);\n                    } else maxedSpawners.delete(spawnKey);\n                } else {\n                    spawnNewStackedEntity(dimension, entityTypeId, location, qty, displayName);\n                    spawnsThisCycle++;\n                    maxedSpawners.delete(spawnKey);\n                }\n                processedCount++;\n            }\n        }\n\n        updateActiveChunks(allSpawnrules);\n        performanceMetrics.stackingOperations++;\n        const processingTime = Date.now() - startTime;\n        debugLog(\`Spawner cycle: processed=\${processedCount}, spawned=\${spawnsThisCycle}, skippedNoPlayers=\${skippedNoPlayers}, skippedMaxed=\${skippedMaxed}, time=\${processingTime}ms\`);\n        if (processingTime > PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME) performanceMetrics.warningCount++;\n        performanceMetrics.averageProcessingTime = performanceMetrics.averageProcessingTime === 0\n            ? processingTime\n            : (performanceMetrics.averageProcessingTime * 0.95 + processingTime * 0.05);\n    } catch (error) {\n        console.error("[MOBSTACKER] Error in spawner job:", error);\n    } finally {\n        isProcessingJobRunning = false;\n    }\n}\n\n// Main interval that triggers the job-based processing`,
      "multi-dimension processing job",
    );

    s = mustReplaceRegex(
      s,
      /let activeInterval: number;\nsystem\.run\(\(\) => \{\n    system\.run\(\(\) => \{\n        const perfConfig = getPerformanceConfig\(\);\n        activeInterval = system\.runInterval\(stackingIntervalFunction, perfConfig\.SPAWN_INTERVAL_TICKS\);\n    \}\);\n\}\);/,
      `let activeInterval: number | undefined;\nexport function restartSpawnerProcessingInterval(): void {\n    if (activeInterval !== undefined) {\n        try { system.clearRun(activeInterval); } catch { /* already cleared */ }\n    }\n    const perfConfig = getPerformanceConfig();\n    activeInterval = system.runInterval(stackingIntervalFunction, perfConfig.SPAWN_INTERVAL_TICKS);\n    debugLog(\`Spawner processing interval applied live: \${perfConfig.SPAWN_INTERVAL_TICKS} ticks\`);\n}\n\nsystem.run(() => system.run(() => restartSpawnerProcessingInterval()));`,
      "live performance scheduler",
    );

    s = s.replace('const spawnerKey = `${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;\n            entitySpawnerMap.set(newEntity.id, spawnerKey);', 'const spawnerKey = makeSpawnerKey(dimension.id, location.x, location.y, location.z);\n            entitySpawnerMap.set(newEntity.id, spawnerKey);');
    s = s.replace('const spawnerKeyFallback = `${Math.floor(loc.x)},${Math.floor(loc.y)},${Math.floor(loc.z)}`;', 'const spawnerKeyFallback = makeSpawnerKey(hurtEntity.dimension.id, loc.x, loc.y, loc.z);');
    s = s.replace('const locKey = `${hurtEntity.location.x.toFixed(0)},${hurtEntity.location.y.toFixed(0)},${hurtEntity.location.z.toFixed(0)}`;\n            lastKilled.set(`${entityTypeId}:${locKey}`, Date.now());', 'const killSpawnerKey = inheritedSpawnerKey || makeSpawnerKey(hurtEntity.dimension.id, hurtEntity.location.x, hurtEntity.location.y, hurtEntity.location.z);\n            lastKilled.set(`${entityTypeId}:${killSpawnerKey}`, Date.now());');

    write(rel, s);
  }
}

// ---------------------------------------------------------------------------
// Admin/UI: live perf application, dimension-correct search/teleport/statistics,
// block metadata syncing for chest links and a safe multi-dimension DB scanner.
// ---------------------------------------------------------------------------
{
  const rel = "src/mobstacker-ui.ts";
  let s = read(rel);
  if (!s.includes("// LeefySpawners v9: dimension-aware admin UI")) {
    s = s.replace(
      'extractStackNumber } from "./mobstacker-core.js";',
      'extractStackNumber, restartSpawnerProcessingInterval } from "./mobstacker-core.js";',
    );
    s = mustReplace(
      s,
      'import { performanceMonitor } from "./performance-monitor.js";\n',
      'import { performanceMonitor } from "./performance-monitor.js";\nimport { makeSpawnerKey, normalizeDimensionId, parseSpawnerKey, syncSpawnerRecordToBlock } from "./spawner-storage.js";\n\n// LeefySpawners v9: dimension-aware admin UI\nfunction syncSpawnerBlockMirror(spawnerKey: string, record: any): void {\n    try {\n        const parsed = parseSpawnerKey(spawnerKey, record?.dimensionId || "overworld");\n        if (!parsed) return;\n        const dimension = world.getDimension(parsed.dimensionId);\n        const block = dimension.getBlock({ x: parsed.x, y: parsed.y, z: parsed.z });\n        if (block && block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display")) {\n            syncSpawnerRecordToBlock(block, record);\n        }\n    } catch { /* unloaded chunk: DB remains authoritative */ }\n}\n',
      "UI storage helpers",
    );

    s = s.replace('.body("§7Configure spawner behavior and performance settings\\n§c⚠ Performance settings require server/world restart")', '.body("§7Configure spawner behavior and performance settings\\n§a✓ v9 performance controls apply live")');
    s = s.replace('.button("Performance Settings §c(Requires Restart)", "textures/items/clock_item")', '.button("Performance Settings §a(Live)", "textures/items/clock_item")');

    s = s.replace(
      '            player.sendMessage("§a✓ Performance settings saved to database!");\n            player.sendMessage("§c§l⚠ REQUIRES SERVER RESTART OR WORLD RESTART ⚠");\n            player.sendMessage("§c(Settings are cached at startup for maximum performance)");\n            player.sendMessage("§e");\n            player.sendMessage("§e» Use §f/reload §eor restart world to apply changes");',
      '            restartSpawnerProcessingInterval();\n            player.sendMessage("§a✓ Performance settings saved and applied live!");\n            player.sendMessage("§7No server/world restart is required in LeefySpawners v9.");',
    );
    s = s.replace('            player.sendMessage("§c§l» RESTART REQUIRED TO ACTIVATE «");', '            player.sendMessage("§a§l» CHANGES ACTIVE NOW «");');

    s = mustReplaceRegex(
      s,
      /function teleportToSpawner\(player: Player, x: number, y: number, z: number\): void \{[\s\S]*?\n\}\n\nfunction extractStackSize/,
      `function teleportToSpawner(player: Player, x: number, y: number, z: number, dimensionId = player.dimension.id): void {\n    try {\n        if (!player || !player.isValid) return;\n        const targetDimension = world.getDimension(normalizeDimensionId(dimensionId));\n        player.sendMessage(\`§aTeleporting to spawner at \${x}, \${y}, \${z} in \${normalizeDimensionId(dimensionId)}...\`);\n        system.run(() => {\n            try {\n                player.teleport({ x: x + 0.5, y: y + 1.5, z: z + 0.5 }, { dimension: targetDimension });\n            } catch (teleportError) {\n                console.error(\`Teleport logic failed: \${teleportError}\`);\n                player.sendMessage("§cTeleport failed. The target chunk may be unavailable.");\n            }\n        });\n    } catch (error) {\n        console.error(\`Error in teleportToSpawner: \${error}\`);\n        player.sendMessage("§cA critical error occurred during teleportation.");\n    }\n}\n\nfunction extractStackSize`,
      "dimension-aware teleport",
    );

    s = mustReplaceRegex(
      s,
      /function getEntitiesInfoNearSpawner\(x: number, y: number, z: number\): SpawnerEntitiesInfo \{[\s\S]*?\n\}/,
      `function getEntitiesInfoNearSpawner(x: number, y: number, z: number, dimensionId = "overworld"): SpawnerEntitiesInfo {\n    try {\n        const dimension = world.getDimension(normalizeDimensionId(dimensionId));\n        const nearbyEntities = dimension.getEntities({ location: { x, y, z }, maxDistance: 10 });\n        let physicalCount = 0;\n        let virtualCount = 0;\n        nearbyEntities.forEach((entity: Entity) => {\n            if (entity?.isValid && entity.typeId.startsWith("mrleefy:") && entity.nameTag?.includes("x")) {\n                physicalCount++;\n                virtualCount += extractStackSize(entity.nameTag);\n            }\n        });\n        return { physicalCount, virtualCount };\n    } catch {\n        return { physicalCount: 0, virtualCount: 0 };\n    }\n}`,
      "dimension-aware entity stats",
    );

    s = s.replace('teleportToSpawner(player, selectedDetail.x, selectedDetail.y, selectedDetail.z);', 'teleportToSpawner(player, selectedDetail.x, selectedDetail.y, selectedDetail.z, selectedDetail.dimensionId);');
    s = s.replace('teleportToSpawner(player, selectedSpawner.x, selectedSpawner.y, selectedSpawner.z);', 'teleportToSpawner(player, selectedSpawner.x, selectedSpawner.y, selectedSpawner.z, selectedSpawner.dimensionId);');

    s = s.replace(
      '                try {\n                    const [x, y, z] = coordinates.split(\',\').map((coord: string) => parseFloat(coord.trim()));\n                    const distance = Math.sqrt(Math.pow(x - searchX, 2) + Math.pow(z - searchZ, 2));\n\n                    if (distance <= radius) {\n                        const info = getEntitiesInfoNearSpawner(x, y, z);',
      '                try {\n                    const [x, y, z] = coordinates.split(\',\').map((coord: string) => parseFloat(coord.trim()));\n                    const dimensionId = normalizeDimensionId(data.dimensionId || parseSpawnerKey(coordinates)?.dimensionId || "overworld");\n                    if (dimensionId !== normalizeDimensionId(player.dimension.id)) return;\n                    const distance = Math.sqrt(Math.pow(x - searchX, 2) + Math.pow(z - searchZ, 2));\n\n                    if (distance <= radius) {\n                        const info = getEntitiesInfoNearSpawner(x, y, z, dimensionId);',
    );
    s = s.replace('                                x, y, z\n                            });', '                                x, y, z, dimensionId\n                            });');

    s = s.replace('                    placedAt: spawnerData.placedAt,\n                    entitiesKilled: spawnerData.entitiesKilled || 0', '                    placedAt: spawnerData.placedAt,\n                    entitiesKilled: spawnerData.entitiesKilled || 0,\n                    dimensionId: normalizeDimensionId(spawnerData.dimensionId || parseSpawnerKey(key)?.dimensionId || "overworld")');
    s = s.replaceAll('const info = getEntitiesInfoNearSpawner(x, y, z);', 'const info = getEntitiesInfoNearSpawner(x, y, z, spawner.dimensionId || "overworld");');

    s = mustReplaceRegex(
      s,
      /function scanAndUpdateSpawnerDatabase\(\): void \{[\s\S]*?\n\}\n\nfunction verifyAndCleanSpawnerDatabase/,
      `function scanAndUpdateSpawnerDatabase(): void {\n    try {\n        const dimensionIds = ["overworld", "nether", "the_end"];\n        for (const dimensionId of dimensionIds) {\n            const dimension = world.getDimension(dimensionId);\n            const markers = dimension.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE });\n            for (const marker of markers) {\n                if (!marker?.isValid || !marker.nameTag?.includes("spawner")) continue;\n                const key = makeSpawnerKey(dimension.id, marker.location.x, marker.location.y, marker.location.z);\n                if (!spawnerDatabase.read(key)) {\n                    const record = {\n                        typeId: marker.nameTag,\n                        dimensionId: normalizeDimensionId(dimension.id),\n                        placedBy: "System Scan",\n                        placedAt: Date.now(),\n                        entitiesKilled: 0,\n                        lastAccessed: Date.now(),\n                    };\n                    spawnerDatabase.write(key, record);\n                    syncSpawnerBlockMirror(key, record);\n                    debugLog(\`[MOBSTACKER] Registered untracked spawner at \${key}\`);\n                }\n            }\n        }\n\n        for (const key of spawnerDatabase.keys()) {\n            const record = spawnerDatabase.read(key);\n            const parsed = parseSpawnerKey(key, record?.dimensionId || "overworld");\n            if (!parsed) continue;\n            try {\n                const dimension = world.getDimension(parsed.dimensionId);\n                const block = dimension.getBlock({ x: parsed.x, y: parsed.y, z: parsed.z });\n                if (block && !(block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display"))) {\n                    spawnerDatabase.delete(key);\n                    debugLog(\`[MOBSTACKER] Removed stale database entry at \${key}\`);\n                } else if (block) syncSpawnerRecordToBlock(block, record || {});\n            } catch { /* unloaded chunk: retain safely */ }\n        }\n    } catch (error) {\n        console.error(\`[MOBSTACKER] Error in system scan: \${error}\`);\n    }\n}\n\nfunction verifyAndCleanSpawnerDatabase`,
      "multi-dimension database scan",
    );

    s = s.replace('    spawnerDatabase.write(spawnerKey, spawnerData);\n    player.sendMessage("§e[Spawner Link] Spawner chest unlinked successfully.");', '    spawnerDatabase.write(spawnerKey, spawnerData);\n    syncSpawnerBlockMirror(spawnerKey, spawnerData);\n    player.sendMessage("§e[Spawner Link] Spawner chest unlinked successfully.");');
    s = s.replace('            spawnerDatabase.write(linkInfo.spawnerKey, spawnerData);\n\n            player.sendMessage(`§a[Spawner Link] Successfully linked', '            spawnerDatabase.write(linkInfo.spawnerKey, spawnerData);\n            syncSpawnerBlockMirror(linkInfo.spawnerKey, spawnerData);\n\n            player.sendMessage(`§a[Spawner Link] Successfully linked');

    write(rel, s);
  }
}

console.log("LeefySpawners v9 migration applied: stable 26.50 APIs, block entities, dimension-safe persistence, multi-dimension spawning, live performance controls and public-release security cleanup.");
