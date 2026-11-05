import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderDesign } from "../../generator/src/render.js";
import { loadDesign } from "../../generator/src/designs.js";
import { encodeWorld } from "../server/world.js";
import { World } from "../src/world.js";

describe("encodeWorld", () => {
  it("round-trips a design: the browser's world reads the same blocks as the generator's volume", () => {
    const { meta, volume } = encodeWorld("test-office");
    const raw = gunzipSync(volume);
    const world = new World(meta, new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2));
    const { volume: v, layout } = renderDesign(loadDesign("test-office"), { origin: [0, 0, 0] });
    for (let y = 0; y < v.height; y++)
      for (let z = 0; z < v.length; z++) for (let x = 0; x < v.width; x++) expect(world.stateAt(x, y, z)).toBe(v.get(x, y, z));
    expect(meta.anchors["spawn"]).toEqual(layout.anchors["spawn"]);
  });
});
