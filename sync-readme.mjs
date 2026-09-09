import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync("LeefySpawners BEH/manifest.json", "utf8"),
);
const version = manifest.header.version.join(".");
const path = "README.md";
const original = readFileSync(path, "utf8");

const updated = original
  .replace(
    /^# 🟢 LeefySpawners v\d+\.\d+\.\d+/m,
    `# 🟢 LeefySpawners v${version}`,
  )
  .replaceAll("JUN06LeefySpawners BEH", "LeefySpawners BEH")
  .replaceAll("JUN06LeefySpawners RES", "LeefySpawners RES");

if (updated !== original) {
  writeFileSync(path, updated, "utf8");
  console.log(`README synchronized for LeefySpawners v${version}.`);
} else {
  console.log("README is already synchronized.");
}
