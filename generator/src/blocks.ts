import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseState } from "./schematic.js";

/**
 * Every block the game knows (Minecraft 26.3 and AgentCraft), with the values each property can take: from the game's
 * own report and the mod's blockstates (`tools/update-blocks.py`). Minecraft loads a block state it does not know as
 * air, without a word, so a misspelt block or property leaves a hole; this finds it first.
 */
const BLOCKS: Record<string, Record<string, string[]>> = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "data", "blocks.json"), "utf8"));

/** What is wrong with a block state, if the game would not load it as written. */
export function invalidState(state: string): string | undefined {
  const { name, properties } = parseState(state);
  const known = BLOCKS[name];
  if (!known) {
    const near = Object.keys(BLOCKS).find((b) => b.split(":")[1] === name.split(":")[1]?.replace(/s$/, "") || b === `${name}s`);
    return `${name} is not a block${near ? ` (did you mean ${near}?)` : ""}`;
  }
  for (const [k, v] of Object.entries(properties)) {
    const values = known[k];
    if (!values) return `${name} has no property '${k}'${Object.keys(known).length ? ` (it has ${Object.keys(known).join(", ")})` : ""}`;
    if (!values.includes(v)) return `${name}'s '${k}' cannot be '${v}' (it takes ${values.join(", ")})`;
  }
  return undefined;
}
