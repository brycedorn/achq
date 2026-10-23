import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

/**
 * Saved design versions are immutable: the same version must always render the same blocks, so a
 * world built from it can be rebuilt. These are the first 16 hex digits of the SHA-256 of each
 * version's `.nbt` at origin 40, 64, 40, taken before compression: gzip writes the operating system
 * into its header, so the compressed file differs between Windows and Linux. A code change that alters one fails here; if the change
 * is meant to alter old output, it should instead be opt-in for new versions.
 */
const GOLDEN: Record<string, string> = {
  "test-office v1": "24062cb581a3712c",
  "snowy-chalet v1": "8992d206a635be6b",
  "snowy-chalet v2": "91ee73f503b2a257",
  "snowy-chalet v3": "7e2b94cb2c7440ba",
  "snowy-chalet v4": "06fca43bcc18a6e1",
  "snowy-chalet v5": "b6c5fb74cf1493c6",
  "snowy-chalet v6": "0d64107cfa6b06e9",
  "snowy-chalet v7": "21569ea37293b01b",
  "riviera-yacht v1": "8ad935aa09d209a8",
  "orbital-station v1": "888f068c4dc1f877",
};

describe("saved designs render exactly as before", () => {
  for (const [key, hash] of Object.entries(GOLDEN)) {
    it(key, () => {
      const [name, v] = key.split(" v") as [string, string];
      const { volume } = renderDesign(loadDesign(name, Number(v)), { origin: [40, 64, 40] });
      expect(createHash("sha256").update(gunzipSync(volume.toStructure())).digest("hex").slice(0, 16)).toBe(hash);
    });
  }
});
