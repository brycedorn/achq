import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Design, parseDesign } from "./design.js";

/** `designs/` at the repo root, next to `generator/`. */
export const DESIGNS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "designs");

const VERSION_FILE = /^v(\d+)\.json$/;

/** Saved version numbers of a design, ascending. Empty when the design does not exist. */
export function listVersions(name: string, dir = DESIGNS_DIR): number[] {
  const folder = join(dir, name);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map((file) => VERSION_FILE.exec(file)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Load `designs/<name>/v<version>.json`, or the latest version when none is given. */
export function loadDesign(name: string, version?: number, dir = DESIGNS_DIR): Design {
  const versions = listVersions(name, dir);
  if (versions.length === 0) throw new Error(`no design '${name}' in ${dir}`);
  const wanted = version ?? versions[versions.length - 1]!;
  if (!versions.includes(wanted)) throw new Error(`design '${name}' has no v${wanted} (have ${versions.map((n) => `v${n}`).join(", ")})`);
  const design = parseDesign(JSON.parse(readFileSync(join(dir, name, `v${wanted}.json`), "utf8")));
  if (design.name !== name || design.version !== wanted) {
    throw new Error(`designs/${name}/v${wanted}.json says it is '${design.name}' v${design.version}`);
  }
  return design;
}
