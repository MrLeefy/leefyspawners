import fs from 'fs';
import JavaScriptObfuscator from 'javascript-obfuscator';

const filePath = 'LeefySpawners BEH/scripts/module/import.js';

if (fs.existsSync(filePath)) {
    console.log("Obfuscating import.js for PRODUCTION RELEASE...");
    const rawCode = fs.readFileSync(filePath, 'utf8');
    
    try {
        const obfuscatedResult = JavaScriptObfuscator.obfuscate(rawCode, {
            compact: true,
            controlFlowFlattening: false,
            controlFlowFlatteningThreshold: 0.5,
            deadCodeInjection: false,
            debugProtection: false,
            disableConsoleOutput: false,
            identifierNamesGenerator: 'hexadecimal',
            log: false,
            numbersToExpressions: false,
            renameGlobals: false,
            selfDefending: false,
            simplify: false,
            splitStrings: false,
            splitStringsChunkLength: 6,
            stringArray: false,
            stringArrayCallsTransform: false,
            stringArrayCallsTransformThreshold: 0.5,
            stringArrayEncoding: ['base64'],
            stringArrayThreshold: 0.75,
            target: 'browser',
            unicodeEscapeSequence: false
        });
        
        fs.writeFileSync(filePath, obfuscatedResult.getObfuscatedCode(), 'utf8');
        console.log("Production Obfuscation complete!");
    } catch (e) {
        console.error("Production Obfuscation failed:", e);
        process.exit(1);
    }
} else {
    console.error("Error: import.js not found!");
    process.exit(1);
}
