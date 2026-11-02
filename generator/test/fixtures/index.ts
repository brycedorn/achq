import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Design } from "../../src/design.js";
import { loadDesign } from "../../src/designs.js";

/** Small designs kept as test inputs: the chalet alone, on a shelf, and in a valley. */
export function loadFixture(name: "chalet" | "chalet-shelf" | "chalet-valley"): Design {
  return loadDesign(name, join(dirname(fileURLToPath(import.meta.url))));
}
