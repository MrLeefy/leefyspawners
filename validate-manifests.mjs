import { existsSync, readFileSync } from "node:fs";

const BEH_PATH = "LeefySpawners BEH/manifest.json";
const RES_PATH = "LeefySpawners RES/manifest.json";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_ENGINE = [1, 26, 40];
const EXPECTED_APIS = new Map([
  ["@minecraft/server", "2.9.0"],
  ["@minecraft/server-ui", "2.1.0"],
]);

function fail(message) {
  throw new Error(`[manifest validation] ${message}`);
}

function sameVersion(a, b) {
  return Array.isArray(a) && Array.isArray(b) &&
    a.length === 3 && b.length === 3 &&
    a.every((value, index) => value === b[index]);
}

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const behavior = load(BEH_PATH);
const resources = load(RES_PATH);
const version = behavior.header?.version;

if (behavior.format_version !== 2 || resources.format_version !== 2) {
  fail("Both manifests must use format_version 2.");
}
if (!sameVersion(version, resources.header?.version)) {
  fail("Behavior and resource pack header versions do not match.");
}
if (!sameVersion(behavior.header?.min_engine_version, EXPECTED_ENGINE) ||
    !sameVersion(resources.header?.min_engine_version, EXPECTED_ENGINE)) {
  fail(`Both packs must target min_engine_version ${EXPECTED_ENGINE.join(".")}.`);
}

for (const [path, manifest] of [[BEH_PATH, behavior], [RES_PATH, resources]]) {
  if (!UUID_PATTERN.test(manifest.header?.uuid ?? "")) {
    fail(`${path} has an invalid header UUID.`);
  }
  for (const module of manifest.modules ?? []) {
    if (!UUID_PATTERN.test(module.uuid ?? "")) {
      fail(`${path} contains an invalid module UUID.`);
    }
    if (!sameVersion(module.version, version)) {
      fail(`${path} contains a module version that does not match ${version.join(".")}.`);
    }
  }
}

const apiDependencies = new Map(
  (behavior.dependencies ?? [])
    .filter((dependency) => dependency.module_name)
    .map((dependency) => [dependency.module_name, dependency.version]),
);
for (const [moduleName, expectedVersion] of EXPECTED_APIS) {
  if (apiDependencies.get(moduleName) !== expectedVersion) {
    fail(`${moduleName} must be pinned to stable version ${expectedVersion}.`);
  }
}

const behaviorPackDependency = (resources.dependencies ?? []).find((dependency) => dependency.uuid);
const resourcePackDependency = (behavior.dependencies ?? []).find((dependency) => dependency.uuid);
if (behaviorPackDependency?.uuid !== behavior.header.uuid ||
    !sameVersion(behaviorPackDependency?.version, version)) {
  fail("The resource pack dependency must point to the current behavior pack UUID and version.");
}
if (resourcePackDependency?.uuid !== resources.header.uuid ||
    !sameVersion(resourcePackDependency?.version, version)) {
  fail("The behavior pack dependency must point to the current resource pack UUID and version.");
}

const allUuids = [
  behavior.header.uuid,
  ...behavior.modules.map((module) => module.uuid),
  resources.header.uuid,
  ...resources.modules.map((module) => module.uuid),
];
if (new Set(allUuids).size !== allUuids.length) {
  fail("Every header and module UUID must be unique.");
}

const scriptModule = behavior.modules.find((module) => module.type === "script");
if (!scriptModule?.entry || !existsSync(`LeefySpawners BEH/${scriptModule.entry}`)) {
  fail("The behavior pack script entry point is missing.");
}

console.log(
  `LeefySpawners ${version.join(".")} manifests are valid for stable Bedrock 26.40-26.45.`,
);
