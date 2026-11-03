import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { listDesigns, loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

/**
 * Each design renders the blocks it rendered when its hash was taken, so a code change cannot alter a design by
 * accident. These are the first 16 hex digits of the SHA-256 of each design's `.nbt` at origin 40, 64, 40, taken
 * before compression: gzip writes the operating system into its header. When a change is meant to alter a design,
 * look at the result, then update its hash here.
 */
const GOLDEN: Record<string, string> = {
  "test-office": "6da4cda6e29d2032",
  "snowy-chalet": "a54d676edfd94ce0",
  "riviera-yacht": "c6efa9d64dc31a94",
  "orbital-station": "a68b3a85fe156ee4",
  "lighthouse": "7ca693e37d7e1bed",
  "jungle-treehouse": "00d7223f42132dce",
};

describe("designs render exactly as before", () => {
  it("has a hash for every design", () => expect(Object.keys(GOLDEN).sort()).toEqual(listDesigns()));
  for (const [name, hash] of Object.entries(GOLDEN)) {
    it(name, () => {
      const { volume } = renderDesign(loadDesign(name), { origin: [40, 64, 40] });
      expect(createHash("sha256").update(gunzipSync(volume.toStructure())).digest("hex").slice(0, 16)).toBe(hash);
    });
  }
});
