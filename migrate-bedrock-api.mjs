import { readFileSync } from "node:fs";

const path = "src/mobstacker-ui.ts";
const source = readFileSync(path, "utf8");

const stillUsesRemovedChatHook = source.includes("world.beforeEvents.chatSend");
const hasStableCustomCommand =
  source.includes("// --- CUSTOM COMMANDS ---") &&
  source.includes('name: "leefy:reaper"') &&
  source.includes("system.beforeEvents.startup.subscribe");

if (stillUsesRemovedChatHook) {
  throw new Error(
    "LeefySpawners still contains the removed world.beforeEvents.chatSend API.",
  );
}

if (!hasStableCustomCommand) {
  throw new Error(
    "The stable /leefy:reaper custom-command registration could not be found.",
  );
}

console.log(
  "LeefySpawners Script API migration is applied and the stable custom command is present.",
);
