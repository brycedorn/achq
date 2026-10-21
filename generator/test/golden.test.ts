import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

/**
 * Saved design versions are immutable: the same version must always render the same blocks, so a
 * world built from it can be rebuilt. These are the first 16 hex digits of the SHA-256 of each
 * version's `.nbt` at origin 40, 64, 40. A code change that alters one fails here; if the change
 * is meant to alter old output, it should instead be opt-in for new versions.
 */
const GOLDEN: Record<string, string> = {
  "test-office v1": "c2da14092d607f22",
  "snowy-chalet v1": "268b2c4edb1aa7b9",
  "snowy-chalet v2": "82cda44fa04a7b5a",
  "snowy-chalet v3": "9db438f4ec172816",
  "snowy-chalet v4": "9d13b551cd1d2e7f",
  "snowy-chalet v5": "64c36b7ba2774242",
  "snowy-chalet v6": "54401c9e1780bed7",
  "snowy-chalet v7": "0c539b4c3755c36b",
};

describe("saved designs render exactly as before", () => {
  for (const [key, hash] of Object.entries(GOLDEN)) {
    it(key, () => {
      const [name, v] = key.split(" v") as [string, string];
      const { volume } = renderDesign(loadDesign(name, Number(v)), { origin: [40, 64, 40] });
      expect(createHash("sha256").update(volume.toStructure()).digest("hex").slice(0, 16)).toBe(hash);
    });
  }
});
