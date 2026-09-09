import fs from "node:fs";
import { randomUUID } from "node:crypto";

const BEH_PATH = "LeefySpawners BEH/manifest.json";
const RES_PATH = "LeefySpawners RES/manifest.json";
const PACKAGE_PATH = "package.json";
const MIN_ENGINE_VERSION = [1, 26, 40];
const STABLE_APIS = new Map([
  ["@minecraft/server", "2.9.0"],
  ["@minecraft/server-ui", "2.1.0"],
]);

function load(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function releaseLabel() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
}

const behavior = load(BEH_PATH);
const resources = load(RES_PATH);
const oldBehaviorUuid = behavior.header.uuid;
const oldResourceUuid = resources.header.uuid;
const newBehaviorUuid = randomUUID();
const newResourceUuid = randomUUID();
const [major, minor, patch] = behavior.header.version;
const version = [major, minor, patch + 1];
const versionText = version.join(".");
const label = releaseLabel();

behavior.header = {
  ...behavior.header,
  name: `LeefySpawners v${versionText} BEH - ${label}`,
  description: `LeefySpawners Behavior Pack v${versionText} - Stable Bedrock 26.40-26.45 compatibility`,
  uuid: newBehaviorUuid,
  version,
  min_engine_version: MIN_ENGINE_VERSION,
};
behavior.modules = (behavior.modules ?? []).map((module) => ({
  ...module,
  uuid: randomUUID(),
  version,
}));
behavior.dependencies = (behavior.dependencies ?? []).map((dependency) => {
  if (dependency.module_name && STABLE_APIS.has(dependency.module_name)) {
    return { ...dependency, version: STABLE_APIS.get(dependency.module_name) };
  }
  if (dependency.uuid === oldResourceUuid) {
    return { ...dependency, uuid: newResourceUuid, version };
  }
  return dependency;
});

resources.header = {
  ...resources.header,
  name: `LeefySpawners v${versionText} RES - ${label}`,
  description: `LeefySpawners Resource Pack v${versionText} - Stable Bedrock 26.40-26.45 compatibility`,
  uuid: newResourceUuid,
  version,
  min_engine_version: MIN_ENGINE_VERSION,
};
resources.modules = (resources.modules ?? []).map((module) => ({
  ...module,
  uuid: randomUUID(),
  version,
}));
resources.dependencies = (resources.dependencies ?? []).map((dependency) => {
  if (dependency.uuid === oldBehaviorUuid) {
    return { ...dependency, uuid: newBehaviorUuid, version };
  }
  return dependency;
});

fs.writeFileSync(BEH_PATH, `${JSON.stringify(behavior, null, "\t")}\n`, "utf8");
fs.writeFileSync(RES_PATH, `${JSON.stringify(resources, null, "\t")}\n`, "utf8");

if (fs.existsSync(PACKAGE_PATH)) {
  const packageJson = load(PACKAGE_PATH);
  packageJson.version = versionText;
  fs.writeFileSync(PACKAGE_PATH, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

console.log(`Prepared LeefySpawners v${versionText} with refreshed release UUIDs.`);
