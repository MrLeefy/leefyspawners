import fs from 'fs';
import { randomUUID } from 'crypto';

// Paths
const behPath = 'LeefySpawners BEH/manifest.json';
const resPath = 'LeefySpawners RES/manifest.json';
const pkgPath = 'package.json';

// Helper: Clean JSON text of comments, trailing commas, and empty slots
function cleanJSONText(text) {
    // 1. Remove block comments
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // 2. Remove line comments
    const lines = text.split('\n').map(line => {
        const commentIndex = line.indexOf('//');
        if (commentIndex !== -1) {
            if (commentIndex > 0 && line[commentIndex - 1] === ':') {
                return line;
            }
            return line.substring(0, commentIndex);
        }
        return line;
    });
    text = lines.join('\n');
    
    // 3. Fix missing values in array literals (e.g. [8,,] -> [8,0,0])
    let lastText;
    do {
        lastText = text;
        text = text.replace(/,([ \t\r\n]*),/g, ',0,');
    } while (text !== lastText);

    // Fix leading comma in brackets (e.g. [,1, 2] -> [0,1, 2])
    text = text.replace(/\[([ \t\r\n]*),/g, '[$10,');

    // 4. Remove trailing commas before brackets/braces
    text = text.replace(/,([ \t\r\n]*\])/g, '$1');
    text = text.replace(/,([ \t\r\n]*\})/g, '$1');
    
    return text;
}

// Helper: Safely load and parse JSON file
function loadJSON(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`Error: Unable to read file at ${filePath}. Make sure it exists.`);
        process.exit(1);
    }
    
    const cleaned = cleanJSONText(raw);
    try {
        return JSON.parse(cleaned);
    } catch (err) {
        console.error(`\n========================================`);
        console.error(`CRITICAL: JSON parsing failed for file: ${filePath}`);
        console.error(`Error details: ${err.message}`);
        console.error(`========================================`);
        const posMatch = err.message.match(/at position (\d+)/);
        if (posMatch) {
            const pos = parseInt(posMatch[1], 10);
            const start = Math.max(0, pos - 100);
            const end = Math.min(cleaned.length, pos + 100);
            console.error(`Context around error:\n...${cleaned.substring(start, end)}...\n`);
        }
        process.exit(1);
    }
}

// Helper: Safely parse a version array/string
function parseVersion(versionVal) {
    if (Array.isArray(versionVal)) {
        const cleaned = versionVal.map(x => parseInt(x, 10)).filter(x => !isNaN(x));
        while (cleaned.length < 3) cleaned.push(0);
        return cleaned.slice(0, 3);
    }
    if (typeof versionVal === 'string') {
        const parts = versionVal.split('.').map(x => parseInt(x, 10)).filter(x => !isNaN(x));
        while (parts.length < 3) parts.push(0);
        return parts.slice(0, 3);
    }
    return [1, 0, 0];
}

// Helper: Bump version string/name dynamically
function bumpTextWithVersion(text, versionStr, fallback) {
    if (typeof text !== 'string') return fallback;
    const verRegex = /v\d+\.\d+\.\d+/g;
    if (verRegex.test(text)) {
        return text.replace(verRegex, 'v' + versionStr);
    }
    const dotRegex = /\b\d+\.\d+\.\d+\b/g;
    if (dotRegex.test(text)) {
        return text.replace(dotRegex, versionStr);
    }
    return fallback;
}

// Read manifests safely
const beh = loadJSON(behPath);
const res = loadJSON(resPath);

// Store old UUIDs to identify dependencies
const oldBehUuid = beh.header?.uuid;
const oldResUuid = res.header?.uuid;

if (!oldBehUuid || !oldResUuid) {
    console.error("Error: Missing UUID in manifest header.");
    process.exit(1);
}

// Generate new UUIDs
const newBehUuid = randomUUID();
const newResUuid = randomUUID();

// Bump versions
let oldVerVal = beh.header?.version;
if (!Array.isArray(oldVerVal)) {
    oldVerVal = res.header?.version;
}
const oldVer = parseVersion(oldVerVal);
const newVer = [oldVer[0], oldVer[1], oldVer[2] + 1];
const newVerStr = newVer.join('.');

// Update BEH
beh.header.uuid = newBehUuid;
beh.header.version = newVer;
beh.header.name = bumpTextWithVersion(beh.header.name, newVerStr, `LeefySpawners v${newVerStr} BEH - Jun 06`);
beh.header.description = bumpTextWithVersion(beh.header.description, newVerStr, `LeefySpawners Behavior Pack v${newVerStr} - Production Release - Jun 2026 Update`);
if (beh.modules) {
    beh.modules.forEach(m => {
        m.uuid = randomUUID();
        m.version = newVer; // Keep modules version in sync
    });
}

// Update RES
res.header.uuid = newResUuid;
res.header.version = newVer;
res.header.name = bumpTextWithVersion(res.header.name, newVerStr, `LeefySpawners v${newVerStr} RES - Jun 06`);
res.header.description = bumpTextWithVersion(res.header.description, newVerStr, `LeefySpawners Resource Pack v${newVerStr} - Production Release - Jun 2026 Update`);
if (res.modules) {
    res.modules.forEach(m => {
        m.uuid = randomUUID();
        m.version = newVer; // Keep modules version in sync
    });
}

// Update mutual dependencies
if (beh.dependencies) {
    beh.dependencies.forEach(d => {
        if (d.uuid === oldResUuid) {
            d.uuid = newResUuid;
            d.version = newVer;
        }
    });
}
if (res.dependencies) {
    res.dependencies.forEach(d => {
        if (d.uuid === oldBehUuid) {
            d.uuid = newBehUuid;
            d.version = newVer;
        }
    });
}

// Write back (Keep tab spacing for LeefySpawners manifests)
fs.writeFileSync(behPath, JSON.stringify(beh, null, '\t'), 'utf8');
fs.writeFileSync(resPath, JSON.stringify(res, null, '\t'), 'utf8');

// Update package.json safely
if (fs.existsSync(pkgPath)) {
    const pkg = loadJSON(pkgPath);
    pkg.version = newVerStr;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
}

console.log(`Bumped version to ${newVerStr} and generated new UUIDs with synced dependencies.`);
