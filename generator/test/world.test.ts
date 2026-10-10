import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";
import { buildScene } from "../src/scene.js";

const design = loadDesign("snowy-chalet", 3);
const rendered = renderDesign(design, { origin: [0, 0, 0] });
const { volume } = rendered;

/** Count blocks with a given name (properties ignored). */
function count(name: string): number {
  let n = 0;
  for (const [, , , state] of volume.blocks()) if (state.replace(/\[.*$/, "") === name) n++;
  return n;
}

describe("snowy-chalet v3", () => {
  it("passes every check with no overlaps, at landscape size", () => {
    expect(design.size).toEqual([160, 128, 176]);
    expect(checkDesign(design)).toEqual([]);
    expect(rendered.conflicts).toEqual([]);
  });

  it("builds a village with glowing windows, lamps and a church tower", () => {
    expect(count("minecraft:shroomlight")).toBeGreaterThan(60);
    expect(count("minecraft:lantern")).toBeGreaterThan(30);
    expect(count("minecraft:stone_bricks")).toBeGreaterThan(500);
  });

  it("grows a forest, leaving the chalet shelf and the village clear", () => {
    expect(count("minecraft:spruce_log")).toBeGreaterThan(3000);
    // The shelf in front of the door and the church square have no scattered trees.
    for (const [x, z] of [[73, 12], [60, 20], [90, 30], [80, 106], [72, 100]] as const) {
      for (let y = 39; y < 60; y++) expect(volume.get(x, y, z).includes("spruce_log"), `${x},${y},${z}`).toBe(false);
    }
  });

  it("is deterministic", () => {
    const again = renderDesign(design, { origin: [0, 0, 0] });
    expect(again.volume.toStructure().equals(volume.toStructure())).toBe(true);
  });

  it("writes a large structure without air, and a small one with it", () => {
    const small = renderDesign(loadDesign("test-office"), { origin: [0, 0, 0] }).volume;
    expect(small.toStructure().length).toBeGreaterThan(0);
    const withAir = volume.toStructure(undefined, true).length;
    const sparse = volume.toStructure().length;
    expect(sparse).toBeLessThan(withAir);
    expect(sparse).toBeLessThan(5_000_000);
  });

  it("culls buried blocks from the preview scene but keeps the surface", () => {
    const scene = buildScene(design);
    let solid = 0;
    for (const [, , , state] of volume.blocks()) if (state !== "minecraft:air") solid++;
    expect(scene.cells.length / 4).toBeLessThan(solid);
    expect(scene.cells.length / 4).toBeGreaterThan(50_000);
    expect(scene.hasTerrain).toBe(true);
    expect(Object.keys(scene.anchors)).toEqual(expect.arrayContaining(["cam_vista", "cam_town"]));
  });
});

describe("forest and village parts", () => {
  it("need terrain to stand on", () => {
    const parts = design.parts.map((p) => (p.id === "village" ? { ...p, on: "nowhere" } : p));
    expect(() => parseDesign({ ...design, parts })).toThrow(/not a terrain part/);
  });

  it("need either listed trees or a scatter", () => {
    const parts = design.parts.map((p) => (p.id === "forest" ? { ...p, scatter: undefined } : p));
    expect(() => parseDesign({ ...design, parts })).toThrow(/neither 'at' nor 'scatter'/);
  });
});
