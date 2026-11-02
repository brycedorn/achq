import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Design, parseDesign } from "./design.js";

/** `designs/` at the repo root, next to `generator/`. */
export const DESIGNS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "designs");

/** Names of the saved designs, sorted. */
export function listDesigns(dir = DESIGNS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

/** Path of `designs/<name>.json`. */
export function designFilePath(name: string, dir = DESIGNS_DIR): string {
  const file = join(dir, `${name}.json`);
  if (!existsSync(file)) throw new Error(`no design '${name}' in ${dir} (have ${listDesigns(dir).join(", ")})`);
  return file;
}

/** Load `designs/<name>.json`. */
export function loadDesign(name: string, dir = DESIGNS_DIR): Design {
  const file = designFilePath(name, dir);
  const design = parseDesign(JSON.parse(readFileSync(file, "utf8")));
  if (design.name !== name) throw new Error(`designs/${name}.json says it is '${design.name}'`);
  return design;
}
