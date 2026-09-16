import { Block, system } from "@minecraft/server";

/**
 * LeefySpawners v9 storage helpers.
 *
 * V9 keeps the scoreboard-backed database as the global/offline index, while
 * mirroring per-spawner metadata into Bedrock 26.50 stable block dynamic
 * properties. Keys are dimension-aware to prevent Overworld/Nether/End
 * collisions.
 */
export const SPAWNER_SCHEMA_VERSION = 9;

const VANILLA_DIMENSIONS = new Set(["overworld", "nether", "the_end"]);

export function normalizeDimensionId(id: string | undefined | null): string {
    const raw = String(id || "overworld").replace(/^minecraft:/, "");
    return VANILLA_DIMENSIONS.has(raw) ? raw : raw || "overworld";
}

export function legacySpawnerKey(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

export function makeSpawnerKey(dimensionId: string, x: number, y: number, z: number): string {
    return `${legacySpawnerKey(x, y, z)},${normalizeDimensionId(dimensionId)}`;
}

export interface ParsedSpawnerKey {
    x: number;
    y: number;
    z: number;
    dimensionId: string;
    isLegacy: boolean;
}

export function parseSpawnerKey(key: string, fallbackDimension = "overworld"): ParsedSpawnerKey | null {
    const parts = String(key).split(",").map(part => part.trim());
    if (parts.length < 3) return null;

    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);
    if (![x, y, z].every(Number.isFinite)) return null;

    return {
        x,
        y,
        z,
        dimensionId: normalizeDimensionId(parts[3] || fallbackDimension),
        isLegacy: parts.length < 4,
    };
}

/** Migrates v8 coordinate-only keys without dropping any record data. */
export function migrateLegacySpawnerKeys(database: any): number {
    let migrated = 0;
    try {
        for (const oldKey of [...database.keys()]) {
            const record = database.read(oldKey);
            const parsed = parseSpawnerKey(oldKey, record?.dimensionId || "overworld");
            if (!parsed || !parsed.isLegacy) continue;

            const dimensionId = normalizeDimensionId(record?.dimensionId || parsed.dimensionId);
            const newKey = makeSpawnerKey(dimensionId, parsed.x, parsed.y, parsed.z);
            const existing = database.read(newKey);
            const merged = {
                ...(record || {}),
                ...(existing || {}),
                dimensionId,
                schemaVersion: SPAWNER_SCHEMA_VERSION,
            };

            database.write(newKey, merged);
            database.delete(oldKey);
            migrated++;
        }
    } catch (error) {
        console.error("[LeefySpawners v9] Legacy spawner-key migration failed:", error);
    }
    return migrated;
}

const DYNAMIC_KEYS = {
    schemaVersion: "leefy:schema_version",
    typeId: "leefy:type_id",
    dimensionId: "leefy:dimension_id",
    placedBy: "leefy:placed_by",
    placedAt: "leefy:placed_at",
    entitiesKilled: "leefy:entities_killed",
    lastAccessed: "leefy:last_accessed",
    linkedChest: "leefy:linked_chest",
} as const;

function getDynamicPropertiesComponent(block: Block): any | undefined {
    try {
        return (block as any).getComponent("minecraft:dynamic_properties");
    } catch {
        return undefined;
    }
}

export function readSpawnerBlockMetadata(block: Block): Record<string, any> {
    const component = getDynamicPropertiesComponent(block);
    if (!component) return {};

    const data: Record<string, any> = {};
    try {
        data.schemaVersion = component.getDynamicProperty(DYNAMIC_KEYS.schemaVersion);
        data.typeId = component.getDynamicProperty(DYNAMIC_KEYS.typeId);
        data.dimensionId = component.getDynamicProperty(DYNAMIC_KEYS.dimensionId);
        data.placedBy = component.getDynamicProperty(DYNAMIC_KEYS.placedBy);
        data.placedAt = component.getDynamicProperty(DYNAMIC_KEYS.placedAt);
        data.entitiesKilled = component.getDynamicProperty(DYNAMIC_KEYS.entitiesKilled);
        data.lastAccessed = component.getDynamicProperty(DYNAMIC_KEYS.lastAccessed);

        const linkedChestRaw = component.getDynamicProperty(DYNAMIC_KEYS.linkedChest);
        if (typeof linkedChestRaw === "string" && linkedChestRaw.length > 0) {
            try { data.linkedChest = JSON.parse(linkedChestRaw); } catch { /* ignore corrupt mirror */ }
        }
    } catch {
        return {};
    }

    for (const key of Object.keys(data)) {
        if (data[key] === undefined) delete data[key];
    }
    return data;
}

export function writeSpawnerBlockMetadata(block: Block, data: Record<string, any>): boolean {
    const component = getDynamicPropertiesComponent(block);
    if (!component) return false;

    try {
        component.setDynamicProperty(DYNAMIC_KEYS.schemaVersion, SPAWNER_SCHEMA_VERSION);
        component.setDynamicProperty(DYNAMIC_KEYS.typeId, String(data.typeId || block.typeId));
        component.setDynamicProperty(DYNAMIC_KEYS.dimensionId, normalizeDimensionId(data.dimensionId || block.dimension.id));

        if (data.placedBy !== undefined) component.setDynamicProperty(DYNAMIC_KEYS.placedBy, String(data.placedBy).slice(0, 80));
        if (Number.isFinite(data.placedAt)) component.setDynamicProperty(DYNAMIC_KEYS.placedAt, Number(data.placedAt));
        if (Number.isFinite(data.entitiesKilled)) component.setDynamicProperty(DYNAMIC_KEYS.entitiesKilled, Number(data.entitiesKilled));
        if (Number.isFinite(data.lastAccessed)) component.setDynamicProperty(DYNAMIC_KEYS.lastAccessed, Number(data.lastAccessed));

        if (data.linkedChest) {
            const linkedChest = {
                x: Number(data.linkedChest.x),
                y: Number(data.linkedChest.y),
                z: Number(data.linkedChest.z),
                dimensionId: normalizeDimensionId(data.linkedChest.dimensionId),
            };
            component.setDynamicProperty(DYNAMIC_KEYS.linkedChest, JSON.stringify(linkedChest));
        } else {
            component.setDynamicProperty(DYNAMIC_KEYS.linkedChest, undefined);
        }
        return true;
    } catch (error) {
        console.warn("[LeefySpawners v9] Could not mirror block metadata:", error);
        return false;
    }
}

/**
 * Bedrock creates a new block entity when setType changes one custom block ID
 * into another. Capture and reapply metadata so v8's 32-level item/block model
 * remains compatible while v9 still benefits from stable block properties.
 */
export function replaceSpawnerBlockTypePreservingMetadata(
    block: Block,
    newTypeId: string,
    databaseRecord: Record<string, any> = {},
): void {
    const captured = {
        ...readSpawnerBlockMetadata(block),
        ...databaseRecord,
        typeId: newTypeId,
        dimensionId: normalizeDimensionId(databaseRecord.dimensionId || block.dimension.id),
        lastAccessed: Date.now(),
        schemaVersion: SPAWNER_SCHEMA_VERSION,
    };

    block.setType(newTypeId);
    if (!writeSpawnerBlockMetadata(block, captured)) {
        system.run(() => {
            try { writeSpawnerBlockMetadata(block, captured); } catch { /* block may have unloaded */ }
        });
    }
}

export function syncSpawnerRecordToBlock(block: Block, record: Record<string, any>): void {
    const dynamic = readSpawnerBlockMetadata(block);
    writeSpawnerBlockMetadata(block, {
        ...dynamic,
        ...record,
        typeId: record.typeId || block.typeId,
        dimensionId: normalizeDimensionId(record.dimensionId || block.dimension.id),
        schemaVersion: SPAWNER_SCHEMA_VERSION,
    });
}
