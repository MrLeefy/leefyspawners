import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const write = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), data);

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[no-spawnrule migration] anchor missing: ${label}`);
  return source.replace(search, replacement);
}

function replaceRegex(source, regex, replacement, label, already = null) {
  if (already && source.includes(already)) return source;
  if (!regex.test(source)) throw new Error(`[no-spawnrule migration] regex anchor missing: ${label}`);
  regex.lastIndex = 0;
  return source.replace(regex, replacement);
}

function patchJson(rel, mutate) {
  const obj = JSON.parse(read(rel));
  mutate(obj);
  write(rel, JSON.stringify(obj, null, "\t") + "\n");
}

// ---------------------------------------------------------------------------
// v9.1 release identity - v9 storage compatibility, spawnrule-free runtime.
// ---------------------------------------------------------------------------
patchJson("package.json", pkg => {
  pkg.version = "9.1.0";
  pkg.description = "Realm/server-grade Bedrock spawner engine with 32-level progression, block metadata, chunk-indexed scheduling, stacking, automation and economy.";
});

for (const rel of ["LeefySpawners BEH/manifest.json", "LeefySpawners RES/manifest.json"]) {
  patchJson(rel, manifest => {
    const isBehavior = rel.includes("BEH");
    manifest.header.version = [9, 1, 0];
    manifest.header.name = isBehavior
      ? "LeefySpawners v9.1.0 BEH - Spawnrule-Free Runtime"
      : "LeefySpawners v9.1.0 RES - Spawnrule-Free Runtime";
    manifest.header.description = isBehavior
      ? "LeefySpawners v9.1 - Bedrock 26.50 stable, chunk-indexed spawner runtime with no spawnrule marker dependency"
      : "LeefySpawners v9.1 Resource Pack - Stable Bedrock 26.50+";
    for (const mod of manifest.modules || []) mod.version = [9, 1, 0];
    for (const dep of manifest.dependencies || []) if (dep.uuid) dep.version = [9, 1, 0];
  });
}

// ---------------------------------------------------------------------------
// Runtime spatial registry. This replaces one invisible spawnrule actor per
// spawner with lightweight JS records grouped by dimension + chunk.
// ---------------------------------------------------------------------------
const registrySource = `import { normalizeDimensionId, parseSpawnerKey } from "./spawner-storage.js";

const CHUNK_SIZE = 16;

export interface RuntimeSpawner {
    key: string;
    x: number;
    y: number;
    z: number;
    dimensionId: string;
    typeId: string;
    entityTypeId: string;
    level: number;
    record: Record<string, any>;
}

export interface RegistryRebuildResult {
    registered: number;
    rejected: number;
}

function chunkCoord(value: number): number {
    return Math.floor(value / CHUNK_SIZE);
}

function bucketKey(dimensionId: string, chunkX: number, chunkZ: number): string {
    return \`\${normalizeDimensionId(dimensionId)}:\${chunkX},\${chunkZ}\`;
}

export function parseSpawnerType(typeId: string | undefined | null): { entityTypeId: string; level: number } | null {
    const match = String(typeId || "").match(/^mrleefy:(.+?)spawner(\\d{1,2})$/i);
    if (!match) return null;
    const level = Number(match[2]);
    if (!Number.isInteger(level) || level < 1 || level > 32) return null;
    const mobName = match[1].replace(/_/g, "").toLowerCase();
    return { entityTypeId: \`mrleefy:\${mobName}still\`, level };
}

class SpawnerRuntimeRegistry {
    private byKey = new Map<string, RuntimeSpawner>();
    private buckets = new Map<string, Set<string>>();
    private ready = false;
    private revision = 0;

    private removeFromBucket(spawner: RuntimeSpawner): void {
        const key = bucketKey(spawner.dimensionId, chunkCoord(spawner.x), chunkCoord(spawner.z));
        const bucket = this.buckets.get(key);
        if (!bucket) return;
        bucket.delete(spawner.key);
        if (bucket.size === 0) this.buckets.delete(key);
    }

    upsert(key: string, record: Record<string, any> | null | undefined): RuntimeSpawner | null {
        if (!record || typeof record.typeId !== "string") return null;
        const parsedKey = parseSpawnerKey(key, record.dimensionId || "overworld");
        const parsedType = parseSpawnerType(record.typeId);
        if (!parsedKey || !parsedType) return null;

        const canonical: RuntimeSpawner = {
            key,
            x: Math.floor(parsedKey.x),
            y: Math.floor(parsedKey.y),
            z: Math.floor(parsedKey.z),
            dimensionId: normalizeDimensionId(record.dimensionId || parsedKey.dimensionId),
            typeId: record.typeId,
            entityTypeId: parsedType.entityTypeId,
            level: parsedType.level,
            record,
        };

        const previous = this.byKey.get(key);
        if (previous) this.removeFromBucket(previous);

        this.byKey.set(key, canonical);
        const keyForBucket = bucketKey(canonical.dimensionId, chunkCoord(canonical.x), chunkCoord(canonical.z));
        let bucket = this.buckets.get(keyForBucket);
        if (!bucket) {
            bucket = new Set<string>();
            this.buckets.set(keyForBucket, bucket);
        }
        bucket.add(key);
        this.revision++;
        return canonical;
    }

    remove(key: string): boolean {
        const existing = this.byKey.get(key);
        if (!existing) return false;
        this.removeFromBucket(existing);
        this.byKey.delete(key);
        this.revision++;
        return true;
    }

    clear(): void {
        this.byKey.clear();
        this.buckets.clear();
        this.ready = false;
        this.revision++;
    }

    rebuild(database: any): RegistryRebuildResult {
        this.byKey.clear();
        this.buckets.clear();
        let registered = 0;
        let rejected = 0;
        try {
            for (const key of database.keys()) {
                const record = database.read(key);
                if (this.upsert(key, record)) registered++;
                else rejected++;
            }
            this.ready = true;
        } catch (error) {
            this.ready = false;
            console.error("[LeefySpawners] Runtime registry rebuild failed:", error);
        }
        this.revision++;
        return { registered, rejected };
    }

    get(key: string): RuntimeSpawner | undefined {
        return this.byKey.get(key);
    }

    has(key: string): boolean {
        return this.byKey.has(key);
    }

    isReady(): boolean {
        return this.ready;
    }

    get size(): number {
        return this.byKey.size;
    }

    get bucketCount(): number {
        return this.buckets.size;
    }

    getRevision(): number {
        return this.revision;
    }

    values(): IterableIterator<RuntimeSpawner> {
        return this.byKey.values();
    }

    getNearPlayers(
        dimensionId: string,
        playerLocations: readonly { x: number; y: number; z: number }[],
        radius: number,
    ): RuntimeSpawner[] {
        if (playerLocations.length === 0 || radius <= 0) return [];
        const dim = normalizeDimensionId(dimensionId);
        const radiusSq = radius * radius;
        const chunkRadius = Math.max(1, Math.ceil(radius / CHUNK_SIZE));
        const candidateKeys = new Set<string>();

        for (const location of playerLocations) {
            const baseChunkX = chunkCoord(location.x);
            const baseChunkZ = chunkCoord(location.z);
            for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
                for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
                    const bucket = this.buckets.get(bucketKey(dim, baseChunkX + dx, baseChunkZ + dz));
                    if (!bucket) continue;
                    for (const key of bucket) candidateKeys.add(key);
                }
            }
        }

        const results: RuntimeSpawner[] = [];
        outer: for (const key of candidateKeys) {
            const spawner = this.byKey.get(key);
            if (!spawner || spawner.dimensionId !== dim) continue;
            const sx = spawner.x + 0.5;
            const sy = spawner.y + 0.5;
            const sz = spawner.z + 0.5;
            for (const player of playerLocations) {
                const dx = player.x - sx;
                const dy = player.y - sy;
                const dz = player.z - sz;
                if ((dx * dx + dy * dy + dz * dz) <= radiusSq) {
                    results.push(spawner);
                    continue outer;
                }
            }
        }
        return results;
    }

    findNearestForEntity(
        dimensionId: string,
        location: { x: number; y: number; z: number },
        entityTypeId: string,
        radius: number,
    ): RuntimeSpawner | undefined {
        const candidates = this.getNearPlayers(dimensionId, [location], radius);
        let best: RuntimeSpawner | undefined;
        let bestDistanceSq = Infinity;
        for (const spawner of candidates) {
            if (spawner.entityTypeId !== entityTypeId) continue;
            const dx = location.x - (spawner.x + 0.5);
            const dy = location.y - (spawner.y + 0.5);
            const dz = location.z - (spawner.z + 0.5);
            const distanceSq = dx * dx + dy * dy + dz * dz;
            if (distanceSq < bestDistanceSq) {
                bestDistanceSq = distanceSq;
                best = spawner;
            }
        }
        return best;
    }
}

export const spawnerRegistry = new SpawnerRuntimeRegistry();
`;
write("src/spawner-registry.ts", registrySource);

// ---------------------------------------------------------------------------
// Level system: all writes immediately update the registry. Marker creation,
// recreation and per-block marker cleanup disappear completely.
// ---------------------------------------------------------------------------
{
  const rel = "src/levelsystem.ts";
  let s = read(rel);

  s = replaceOnce(
    s,
    'import { makeSpawnerKey, migrateLegacySpawnerKeys, normalizeDimensionId, replaceSpawnerBlockTypePreservingMetadata, SPAWNER_SCHEMA_VERSION, syncSpawnerRecordToBlock } from "./spawner-storage.js";',
    'import { makeSpawnerKey, migrateLegacySpawnerKeys, normalizeDimensionId, replaceSpawnerBlockTypePreservingMetadata, SPAWNER_SCHEMA_VERSION, syncSpawnerRecordToBlock } from "./spawner-storage.js";\nimport { spawnerRegistry } from "./spawner-registry.js";',
    "registry import",
  );

  s = replaceOnce(
    s,
    '        spawnerDatabase.delete(coordinates);\n        // Remove associated spawnrule entity asynchronously (skip for display spawners)\n        if (!block.typeId.endsWith(\'_display\')) {\n            system.run(() => removeSpawnruleAtLocation(block.x, block.y, block.z, block.dimension));\n        }',
    '        spawnerDatabase.delete(coordinates);\n        spawnerRegistry.remove(coordinates);',
    "break removes registry entry",
  );

  s = s.replace(
    /\n\s*if \(!nearbyBlock \|\| !nearbyBlock\.typeId\.endsWith\('_display'\)\) \{\n\s*removeSpawnruleAtLocation\([^\n]+\);\n\s*\}/g,
    '',
  );
  s = s.replace(
    '                            spawnerDatabase.delete(nearbyCoordinates);',
    '                            spawnerDatabase.delete(nearbyCoordinates);\n                            spawnerRegistry.remove(nearbyCoordinates);',
  );

  s = replaceRegex(
    s,
    /\s*\/\/ Remove spawnrule entity at this location since the block is being moved\n\s*removeSpawnruleAtLocation\([^\n]+\);\n\s*/,
    '\n',
    "piston marker cleanup removal",
    "// Securely remove database entry to prevent desync",
  );
  s = replaceOnce(
    s,
    '                    spawnerDatabase.delete(coordinates);\n                }',
    '                    spawnerDatabase.delete(coordinates);\n                    spawnerRegistry.remove(coordinates);\n                }',
    "piston registry removal",
  );

  s = replaceRegex(
    s,
    /\n\s*try \{\n\s*const ent = block\.dimension\.spawnEntity\("mrleefy:spawnrule"[\s\S]*?console\.error\("Error spawning entity natively:", error\);\n\s*\}/,
    '\n        spawnerRegistry.upsert(coordinates, spawnerData);',
    "placement marker removal",
    "spawnerRegistry.upsert(coordinates, spawnerData);",
  );

  s = replaceOnce(
    s,
    '    if (currentRecord) syncSpawnerRecordToBlock(block, currentRecord);',
    '    if (currentRecord) {\n        syncSpawnerRecordToBlock(block, currentRecord);\n        spawnerRegistry.upsert(coordinates, currentRecord);\n    }',
    "interaction registry self-heal",
  );

  s = replaceRegex(
    s,
    /\nfunction ensureSpawnruleEntity\([\s\S]*?\n\}\n\nfunction createSpawnerForm/,
    '\nfunction createSpawnerForm',
    "remove ensure marker function",
    "function createSpawnerForm",
  );
  s = s.replace(/\n\s*ensureSpawnruleEntity\(player, x, y, z, typeId\);\n/, '\n');

  // Every DB write that changes type must update the runtime registry.
  s = s.replaceAll(
    '                spawnerDatabase.write(coordinates, existingData);\n\n                clearMaxedSpawnerCache',
    '                spawnerDatabase.write(coordinates, existingData);\n                spawnerRegistry.upsert(coordinates, existingData);\n\n                clearMaxedSpawnerCache',
  );
  s = s.replaceAll(
    '    spawnerDatabase.write(coordinates, existingData);\n\n    clearMaxedSpawnerCache',
    '    spawnerDatabase.write(coordinates, existingData);\n    spawnerRegistry.upsert(coordinates, existingData);\n\n    clearMaxedSpawnerCache',
  );
  s = s.replaceAll(
    '    spawnerDatabase.write(coordinates, existingData);\n    player.sendMessage',
    '    spawnerDatabase.write(coordinates, existingData);\n    spawnerRegistry.upsert(coordinates, existingData);\n    player.sendMessage',
  );

  // Remove all upgrade/downgrade marker refresh blocks.
  s = s.replace(/\n\s*const newTypeId = newBlockType;\n\s*try \{[\s\S]*?console\.error\("Error updating spawnrule in slider natively:", error\);\n\s*\}/, '');
  s = s.replace(/\n\s*\/\/ 5\. Summon spawnrules\n\s*try \{[\s\S]*?console\.error\("Error executing spawnrule updates natively:", error\);\n\s*\}/, '');
  s = s.replace(/\n\s*try \{\n\s*const dimension = player\.dimension;\n\s*const entities = dimension\.getEntities\(\{[\s\S]*?console\.error\("Error executing command natively:", error\);\n\s*\}/, '');
  s = s.replace(/\n\s*\/\/ Recreate spawnrule\n\s*try \{[\s\S]*?console\.error\("Error updating spawnrule in downgrade natively:", error\);\n\s*\}/, '');

  s = replaceRegex(
    s,
    /\nfunction removeSpawnruleAtLocation\([\s\S]*?\n\}\n\nfunction enforcePlayerMemoryLimits/,
    '\nfunction enforcePlayerMemoryLimits',
    "remove per-location marker remover",
    "function enforcePlayerMemoryLimits",
  );

  s = s.replace(
    '            spawnerDatabase.delete(coordinates);\n            activeForms.delete(coordinates);',
    '            spawnerDatabase.delete(coordinates);\n            spawnerRegistry.remove(coordinates);\n            activeForms.delete(coordinates);',
  );

  // Interaction fallback is also an authoritative registry update point.
  s = s.replace(
    '            spawnerDatabase.write(coordinates, spawnerData);\n        } else {',
    '            spawnerDatabase.write(coordinates, spawnerData);\n            spawnerRegistry.upsert(coordinates, spawnerData);\n        } else {',
  );
  s = s.replace(
    '            spawnerDatabase.write(coordinates, existingData);\n        }\n    } catch (error) {\n        console.error(`Error updating spawner database on interaction: ${error}`);',
    '            spawnerDatabase.write(coordinates, existingData);\n            spawnerRegistry.upsert(coordinates, existingData);\n        }\n    } catch (error) {\n        console.error(`Error updating spawner database on interaction: ${error}`);',
  );

  write(rel, s);
}

// ---------------------------------------------------------------------------
// Core engine: candidates now come from the chunk-indexed registry rather than
// dimension.getEntities(mrleefy:spawnrule). Legacy markers are purged once,
// only after registry hydration succeeds.
// ---------------------------------------------------------------------------
{
  const rel = "src/mobstacker-core.ts";
  let s = read(rel);

  s = replaceOnce(
    s,
    'import { makeSpawnerKey, normalizeDimensionId, parseSpawnerKey, SPAWNER_SCHEMA_VERSION, syncSpawnerRecordToBlock } from "./spawner-storage.js";',
    'import { makeSpawnerKey, normalizeDimensionId, parseSpawnerKey, SPAWNER_SCHEMA_VERSION, syncSpawnerRecordToBlock } from "./spawner-storage.js";\nimport { RuntimeSpawner, spawnerRegistry } from "./spawner-registry.js";',
    "core registry import",
  );

  // Kill metadata should only attach to a real known spawner key.
  s = s.replace(
    'function updateSpawnerStatisticsDirect(entityTypeId: string, locationKey: string, player?: Player) {',
    'function updateSpawnerStatisticsDirect(entityTypeId: string, locationKey: string | undefined, player?: Player) {',
  );
  s = s.replace(
    '    const currentUptime = spawnerStatistics.spawnerUptime.get(locationKey) || 0;\n    spawnerStatistics.spawnerUptime.set(locationKey, currentUptime + 1);\n\n    // Update metadata (now memory-buffered and flushed every 30s)\n    updateSpawnerMetadata(locationKey, entityTypeId, player);',
    '    if (locationKey) {\n        const currentUptime = spawnerStatistics.spawnerUptime.get(locationKey) || 0;\n        spawnerStatistics.spawnerUptime.set(locationKey, currentUptime + 1);\n\n        // Update metadata only for a canonical registered spawner key.\n        updateSpawnerMetadata(locationKey, entityTypeId, player);\n    }',
  );

  // Statistics count comes from registry, not marker entities.
  s = s.replace(
    '    let spawnerCount = 0;',
    '    let spawnerCount = spawnerRegistry.size;',
  );
  s = s.replace(
    /\n\s*const spawnruleEntities = dim\.getEntities\(\{ type: ENTITIES\.SPAWNRULE_ENTITY_TYPE \}\);\n\s*spawnerCount \+= spawnruleEntities\.length;\n/,
    '\n',
  );

  // Replace marker-derived active chunk cache with runtime spawners.
  s = replaceRegex(
    s,
    /\/\/ Check if any players are near a location \(cheap check for performance\)[\s\S]*?\/\/ Error recovery for stacking interval/,
    `// Spatial partitioning metrics for the admin/performance UI.\nconst ACTIVE_CHUNKS = new Map<string, RuntimeSpawner[]>();\n\nfunction updateActiveChunks(spawners: RuntimeSpawner[]): void {\n    ACTIVE_CHUNKS.clear();\n    for (const spawner of spawners) {\n        const chunkX = Math.floor(spawner.x / 16);\n        const chunkZ = Math.floor(spawner.z / 16);\n        const key = \`\${spawner.dimensionId}:\${chunkX},\${chunkZ}\`;\n        let bucket = ACTIVE_CHUNKS.get(key);\n        if (!bucket) {\n            bucket = [];\n            ACTIVE_CHUNKS.set(key, bucket);\n        }\n        bucket.push(spawner);\n    }\n}\n\n// Error recovery for stacking interval`,
    "replace marker spatial cache",
    "const ACTIVE_CHUNKS = new Map<string, RuntimeSpawner[]>()",
  );

  // Entire scheduler source changes from marker enumeration to registry lookup.
  s = replaceRegex(
    s,
    /function\* spawnerProcessingJob\(\) \{[\s\S]*?\n\}\n\n\/\/ Main interval that triggers the job-based processing/,
    `function* spawnerProcessingJob() {\n    try {\n        if (!spawnerRegistry.isReady()) return;\n\n        const startTime = Date.now();\n        let tickStartTime = startTime;\n        const stackRadius = getCachedConfig("stackRadius", UI.DEFAULT_STACK_RADIUS);\n        const perfConfig = getPerformanceConfig();\n        const allPlayers = world.getAllPlayers().filter(player => player?.isValid);\n        const playersByDimension = new Map<string, Player[]>();\n        const activeSpawners: RuntimeSpawner[] = [];\n\n        for (const player of allPlayers) {\n            const dimensionId = normalizeDimensionId(player.dimension.id);\n            let players = playersByDimension.get(dimensionId);\n            if (!players) {\n                players = [];\n                playersByDimension.set(dimensionId, players);\n            }\n            players.push(player);\n        }\n\n        let spawnsThisCycle = 0;\n        let processedCount = 0;\n        let staleRemoved = 0;\n        let skippedMaxed = 0;\n\n        for (const [dimensionId, players] of playersByDimension) {\n            if (players.length === 0) continue;\n            const dimension = players[0].dimension;\n            const candidates = spawnerRegistry.getNearPlayers(\n                dimensionId,\n                players.map(player => player.location),\n                perfConfig.PLAYER_ACTIVATION_RADIUS,\n            );\n            activeSpawners.push(...candidates);\n\n            for (const runtimeSpawner of candidates) {\n                if (Date.now() - tickStartTime > 4) {\n                    yield;\n                    tickStartTime = Date.now();\n                }\n\n                const spawnerKey = runtimeSpawner.key;\n                let block: Block | undefined;\n                try {\n                    block = dimension.getBlock({ x: runtimeSpawner.x, y: runtimeSpawner.y, z: runtimeSpawner.z });\n                } catch {\n                    continue;\n                }\n                if (!block) continue;\n\n                const isSpawnerBlock = block.typeId.startsWith("mrleefy:")\n                    && block.typeId.includes("spawner")\n                    && !block.typeId.endsWith("_display");\n                if (!isSpawnerBlock) {\n                    spawnerDatabase.delete(spawnerKey);\n                    spawnerRegistry.remove(spawnerKey);\n                    staleRemoved++;\n                    continue;\n                }\n\n                let record = spawnerDatabase.read(spawnerKey) || runtimeSpawner.record || {};\n                if (record.typeId !== block.typeId || normalizeDimensionId(record.dimensionId) !== dimensionId) {\n                    record.typeId = block.typeId;\n                    record.dimensionId = dimensionId;\n                    record.schemaVersion = SPAWNER_SCHEMA_VERSION;\n                    record.lastAccessed = Date.now();\n                    spawnerDatabase.write(spawnerKey, record);\n                    syncSpawnerRecordToBlock(block, record);\n                    spawnerRegistry.upsert(spawnerKey, record);\n                }\n\n                const specs = getSpawnerSpecs(block.typeId);\n                if (!specs) continue;\n                const { entityTypeId, qty, speed, maxStack, displayName } = specs;\n                const location = { x: runtimeSpawner.x + 0.5, y: runtimeSpawner.y + 0.5, z: runtimeSpawner.z + 0.5 };\n                const spawnKey = \`\${entityTypeId}:\${spawnerKey}\`;\n                const now = Date.now();\n\n                if (maxedSpawners.has(spawnKey)) {\n                    const lastMaxedCheck = maxedSpawners.get(spawnKey);\n                    if (now - lastMaxedCheck < perfConfig.MAXED_SPAWNER_RECHECK_MS) {\n                        skippedMaxed++;\n                        continue;\n                    }\n                }\n\n                const lastSpawn = lastSpawnTime.get(spawnKey) || 0;\n                const lastKill = lastKilled.get(spawnKey) || 0;\n                const speedMillis = speed * 1000;\n                if (lastSpawn === 0 && perfConfig.INITIAL_DELAY_RANDOM) {\n                    lastSpawnTime.set(spawnKey, now - Math.random() * speedMillis);\n                    continue;\n                }\n                if (now - lastSpawn < speedMillis || now - lastKill < cooldownMillis) continue;\n                if (spawnsThisCycle >= perfConfig.MAX_SPAWNS_PER_CYCLE) continue;\n\n                let nearbyEntities: Entity[];\n                try {\n                    nearbyEntities = dimension.getEntities({ type: entityTypeId, location, maxDistance: stackRadius });\n                } catch {\n                    continue;\n                }\n\n                lastSpawnTime.set(spawnKey, now);\n                let primaryEntity: Entity | null = null;\n                let maxStackInArea = 0;\n                let totalStack = 0;\n                const extras: Entity[] = [];\n\n                for (const entity of nearbyEntities) {\n                    if (!entity?.isValid || dyingEntities.has(entity.id)) continue;\n                    const stackSize = extractStackNumber(entity.nameTag || "");\n                    totalStack += stackSize;\n                    if (stackSize > maxStackInArea) {\n                        if (primaryEntity) extras.push(primaryEntity);\n                        maxStackInArea = stackSize;\n                        primaryEntity = entity;\n                    } else {\n                        extras.push(entity);\n                    }\n                }\n\n                for (const entity of extras) {\n                    try {\n                        if (!entity.isValid) continue;\n                        entitySpawnerMap.delete(entity.id);\n                        entitySpawnerOwnership.delete(entity.id);\n                        entity.remove();\n                        performanceMetrics.entityRemovals++;\n                    } catch (error) {\n                        debugLog(\`Failed to remove entity: \${(error as any).message}\`);\n                    }\n                }\n\n                if (primaryEntity && primaryEntity.isValid) {\n                    const newStackSize = Math.min(totalStack + qty, maxStack);\n                    const currentStack = extractStackNumber(primaryEntity.nameTag || "");\n                    if (currentStack !== newStackSize) {\n                        try {\n                            primaryEntity.nameTag = nameTagConfig.replace('#', newStackSize.toString()).replace('@', displayName);\n                        } catch (error) {\n                            debugLog(\`Failed to update primary entity nameTag: \${(error as any).message}\`);\n                        }\n                    }\n                    entitySpawnerMap.set(primaryEntity.id, spawnerKey);\n                    if (newStackSize >= maxStack) {\n                        maxedSpawners.set(spawnKey, now);\n                        entitySpawnerOwnership.set(primaryEntity.id, spawnKey);\n                    } else {\n                        maxedSpawners.delete(spawnKey);\n                    }\n                } else {\n                    spawnNewStackedEntity(dimension, entityTypeId, location, qty, displayName);\n                    spawnsThisCycle++;\n                    maxedSpawners.delete(spawnKey);\n                }\n                processedCount++;\n            }\n        }\n\n        updateActiveChunks(activeSpawners);\n        performanceMetrics.stackingOperations++;\n        const processingTime = Date.now() - startTime;\n        debugLog(\`Spawner cycle: active=\${activeSpawners.length}, processed=\${processedCount}, spawned=\${spawnsThisCycle}, staleRemoved=\${staleRemoved}, skippedMaxed=\${skippedMaxed}, time=\${processingTime}ms\`);\n        if (processingTime > PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME) performanceMetrics.warningCount++;\n        performanceMetrics.averageProcessingTime = performanceMetrics.averageProcessingTime === 0\n            ? processingTime\n            : (performanceMetrics.averageProcessingTime * 0.95 + processingTime * 0.05);\n    } catch (error) {\n        console.error("[MOBSTACKER] Error in registry-backed spawner job:", error);\n    } finally {\n        isProcessingJobRunning = false;\n    }\n}\n\n// Main interval that triggers the job-based processing`,
    "replace processing job",
    "registry-backed spawner job",
  );

  // Registry hydration gates scheduling. Legacy markers are cleanup-only and are
  // purged after successful DB hydration, never used as authoritative state.
  s = replaceOnce(
    s,
    'system.run(() => system.run(() => restartSpawnerProcessingInterval()));',
    `function purgeLegacySpawnruleMarkers(): number {\n    let removed = 0;\n    for (const dimensionId of ["overworld", "nether", "the_end"]) {\n        try {\n            const dimension = world.getDimension(dimensionId);\n            const markers = dimension.getEntities({ type: ENTITIES.SPAWNRULE_ENTITY_TYPE });\n            for (const marker of markers) {\n                try {\n                    if (marker?.isValid) {\n                        marker.remove();\n                        removed++;\n                    }\n                } catch { /* marker may already be gone */ }\n            }\n        } catch { /* dimension unavailable */ }\n    }\n    return removed;\n}\n\nexport function rebuildSpawnerRuntimeRegistry(): { registered: number; rejected: number } {\n    const result = spawnerRegistry.rebuild(spawnerDatabase);\n    if (result.registered > 0 || result.rejected > 0) {\n        debugLog(\`Runtime registry rebuilt: \${result.registered} registered, \${result.rejected} rejected\`);\n    }\n    return result;\n}\n\nsystem.run(() => system.run(() => system.run(() => {\n    const result = rebuildSpawnerRuntimeRegistry();\n    const removedMarkers = purgeLegacySpawnruleMarkers();\n    baseConsoleLog(\`[LeefySpawners v9.1] Runtime registry ready: \${result.registered} spawners in \${spawnerRegistry.bucketCount} chunk buckets; removed \${removedMarkers} legacy marker(s).\`);\n    restartSpawnerProcessingInterval();\n})));`,
    "registry startup hydration",
  );

  // On restart, old stacked entities have no JS ownership map. Recover their
  // owning spawner from the spatial registry instead of inventing a coordinate key.
  s = replaceOnce(
    s,
    '            const spawnerKey = entitySpawnerMap.get(hurtEntity.id);\n\n            const loc = hurtEntity.location;\n            const spawnerKeyFallback = makeSpawnerKey(hurtEntity.dimension.id, loc.x, loc.y, loc.z);\n            const finalSpawnerKey = spawnerKey || spawnerKeyFallback;',
    '            const trackedSpawnerKey = entitySpawnerMap.get(hurtEntity.id);\n\n            const loc = hurtEntity.location;\n            const inferredSpawner = trackedSpawnerKey\n                ? undefined\n                : spawnerRegistry.findNearestForEntity(hurtEntity.dimension.id, loc, entityTypeId, getCachedConfig("stackRadius", UI.DEFAULT_STACK_RADIUS));\n            const finalSpawnerKey = trackedSpawnerKey || inferredSpawner?.key;',
    "death ownership recovery",
  );
  s = replaceOnce(
    s,
    '            const inheritedSpawnerKey = entitySpawnerMap.get(hurtEntity.id);\n            entitySpawnerMap.delete(hurtEntity.id);',
    '            const inheritedSpawnerKey = trackedSpawnerKey || inferredSpawner?.key;\n            entitySpawnerMap.delete(hurtEntity.id);',
    "death inherited ownership",
  );
  s = replaceOnce(
    s,
    '            const killSpawnerKey = inheritedSpawnerKey || makeSpawnerKey(hurtEntity.dimension.id, hurtEntity.location.x, hurtEntity.location.y, hurtEntity.location.z);\n            lastKilled.set(`${entityTypeId}:${killSpawnerKey}`, Date.now());',
    '            if (inheritedSpawnerKey) {\n                lastKilled.set(`${entityTypeId}:${inheritedSpawnerKey}`, Date.now());\n            }',
    "canonical death cooldown",
  );

  // Keep registry metadata reference fresh after kill-stat flushes.
  s = replaceOnce(
    s,
    '            spawnerDatabase.write(locationKey, existingData);\n\n            // Keep stable Bedrock 26.50 block dynamic properties in sync with the DB.',
    '            spawnerDatabase.write(locationKey, existingData);\n            spawnerRegistry.upsert(locationKey, existingData);\n\n            // Keep stable Bedrock 26.50 block dynamic properties in sync with the DB.',
    "kill flush registry refresh",
  );

  write(rel, s);
}

// ---------------------------------------------------------------------------
// Admin UI: database/block reconciliation drives the registry. No marker entity
// is used to discover or validate a spawner. Cleanup labels are corrected too.
// ---------------------------------------------------------------------------
{
  const rel = "src/mobstacker-ui.ts";
  let s = read(rel);

  s = replaceOnce(
    s,
    'import { validMobs, configDatabase, xpDropDatabase, spawnerStatistics, calculateSpawnerTotals, performanceMetrics, getMemoryUsage, loadSpawnerStatistics, resetSpawnerStatistics, getPlayerTopKills, ACTIVE_CHUNKS, enableLogging, disableLogging, isLoggingEnabled, debugLog, clearSpawnerParseCache, extractStackNumber, restartSpawnerProcessingInterval } from "./mobstacker-core.js";',
    'import { validMobs, configDatabase, xpDropDatabase, spawnerStatistics, calculateSpawnerTotals, performanceMetrics, getMemoryUsage, loadSpawnerStatistics, resetSpawnerStatistics, getPlayerTopKills, ACTIVE_CHUNKS, enableLogging, disableLogging, isLoggingEnabled, debugLog, clearSpawnerParseCache, extractStackNumber, restartSpawnerProcessingInterval, rebuildSpawnerRuntimeRegistry } from "./mobstacker-core.js";\nimport { spawnerRegistry } from "./spawner-registry.js";',
    "UI registry imports",
  );

  s = replaceRegex(
    s,
    /function scanAndUpdateSpawnerDatabase\(\): void \{[\s\S]*?\n\}\n\nfunction verifyAndCleanSpawnerDatabase/,
    `function scanAndUpdateSpawnerDatabase(): void {\n    try {\n        for (const key of spawnerDatabase.keys()) {\n            const record = spawnerDatabase.read(key);\n            const parsed = parseSpawnerKey(key, record?.dimensionId || "overworld");\n            if (!parsed) {\n                spawnerRegistry.remove(key);\n                continue;\n            }\n            try {\n                const dimension = world.getDimension(parsed.dimensionId);\n                const block = dimension.getBlock({ x: parsed.x, y: parsed.y, z: parsed.z });\n                if (block && !(block.typeId.startsWith("mrleefy:") && block.typeId.includes("spawner") && !block.typeId.endsWith("_display"))) {\n                    spawnerDatabase.delete(key);\n                    spawnerRegistry.remove(key);\n                    debugLog(\`[MOBSTACKER] Removed stale database entry at \${key}\`);\n                } else if (block) {\n                    const repaired = {\n                        ...(record || {}),\n                        typeId: block.typeId,\n                        dimensionId: normalizeDimensionId(block.dimension.id),\n                        lastAccessed: Date.now(),\n                    };\n                    spawnerDatabase.write(key, repaired);\n                    syncSpawnerBlockMirror(key, repaired);\n                    spawnerRegistry.upsert(key, repaired);\n                }\n            } catch {\n                // Unloaded chunk: retain DB + runtime registry entry safely.\n                if (record) spawnerRegistry.upsert(key, record);\n            }\n        }\n        rebuildSpawnerRuntimeRegistry();\n    } catch (error) {\n        console.error(\`[MOBSTACKER] Error in system scan: \${error}\`);\n    }\n}\n\nfunction verifyAndCleanSpawnerDatabase`,
    "replace marker admin scan",
    "rebuildSpawnerRuntimeRegistry();",
  );

  s = s.replace(
    '• Removes any orphaned spawnrules at those locations.',
    '• Removes orphaned stacked mobs at stale loaded locations and refreshes the runtime registry.',
  );
  s = s.replace(
    '                                spawnerDatabase.delete(coordinates);\n                                removedBlocks++;',
    '                                spawnerDatabase.delete(coordinates);\n                                spawnerRegistry.remove(coordinates);\n                                removedBlocks++;',
  );
  s = s.replace(
    '                                verifiedSpawners++;',
    '                                verifiedSpawners++;\n                                if (spawnerData) spawnerRegistry.upsert(coordinates, spawnerData);',
  );
  s = s.replace(
    '            player.sendMessage(`§7Cleaned: §c${removedEntities} §7orphaned spawnrule entities`);',
    '            player.sendMessage(`§7Cleaned: §c${removedEntities} §7orphaned stacked mobs`);',
  );

  write(rel, s);
}

console.log("LeefySpawners v9.1 no-spawnrule migration applied: chunk-indexed runtime registry, marker-free scheduling, legacy marker cleanup, and restart-safe stack ownership recovery.");
