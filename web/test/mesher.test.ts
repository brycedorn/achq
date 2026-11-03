import { describe, expect, it } from "vitest";
import { CHUNK, chunkOrder, type MeshData, meshChunk } from "../src/mesher.js";
import type { World } from "../src/world.js";
import { fill, makeWorld } from "./helpers.js";

const STONE = "minecraft:stone";
const mesh = (w: World, cx = 0, cy = 0, cz = 0) => meshChunk({ size: w.meta.size, cells: w.cells, looks: w.looks }, cx, cy, cz);
const quads = (d: MeshData | null) => (d ? d.indices.length / 6 : 0);

/** Red channel of each vertex of the quads lying flat in the plane `axis = at`, by position. */
function cornerLights(d: MeshData, axis: number, at: number): Map<string, number> {
  const out = new Map<string, number>();
  for (let q = 0; q < d.positions.length / 12; q++) {
    const vs = [0, 1, 2, 3].map((i) => Array.from(d.positions.slice((q * 4 + i) * 3, (q * 4 + i) * 3 + 3)));
    if (!vs.every((v) => v[axis] === at)) continue;
    vs.forEach((v, i) => out.set(v.join(","), d.colors[(q * 4 + i) * 3]!));
  }
  return out;
}

describe("meshChunk", () => {
  it("draws the six faces of a lone cube", () => {
    const m = mesh(makeWorld([4, 4, 4], [[1, 1, 1, STONE]]));
    expect(quads(m.opaque)).toBe(6);
    expect(m.transparent).toBeNull();
  });

  it("hides the faces between two touching cubes and merges the rest", () => {
    expect(quads(mesh(makeWorld([4, 4, 4], fill(1, 1, 1, 2, 1, 1, STONE))).opaque)).toBe(6);
  });

  it("merges a 4 x 4 wall into one quad per side", () => {
    expect(quads(mesh(makeWorld([8, 8, 8], fill(1, 1, 1, 4, 4, 1, STONE))).opaque)).toBe(6);
  });

  it("does not merge different blocks", () => {
    const m = mesh(makeWorld([4, 4, 4], [[1, 1, 1, STONE], [2, 1, 1, "minecraft:oak_planks"]]));
    expect(quads(m.opaque)).toBe(10);
  });

  it("darkens the corners of a floor where it meets a wall", () => {
    // A floor at y=0 with a wall along x=0 standing on it.
    const w = makeWorld([4, 4, 4], [...fill(0, 0, 0, 3, 0, 3, STONE), ...fill(0, 1, 0, 0, 2, 3, STONE)]);
    const lights = cornerLights(mesh(w).opaque!, 1, 1);
    // Floor top corners against the wall (x=1) are darker than those in the open (x=4).
    expect(lights.get("1,1,0")).toBeLessThan(lights.get("4,1,0")!);
  });

  it("keeps a cube's side face next to a slab, and culls the slab's face against the cube", () => {
    const w = makeWorld([4, 4, 4], [[1, 1, 1, STONE], [2, 1, 1, "minecraft:oak_slab[type=bottom]"]]);
    const m = mesh(w);
    // Cube: 6 faces. Slab: 6 faces less the one against the cube.
    expect(quads(m.opaque)).toBe(11);
  });

  it("hides the face between two glass blocks and puts glass in the transparent mesh", () => {
    const m = mesh(makeWorld([4, 4, 4], fill(1, 1, 1, 2, 1, 1, "minecraft:glass")));
    expect(m.opaque).toBeNull();
    expect(quads(m.transparent)).toBe(6);
  });

  it("fills stacked water so there is no surface between layers", () => {
    const m = mesh(makeWorld([4, 4, 4], fill(1, 1, 1, 1, 2, 1, "minecraft:water")));
    // The lower block is a cube (water above it); the upper is 0.875 tall. Their shared face is hidden both ways.
    const ys = Array.from({ length: m.transparent!.positions.length / 3 }, (_, i) => m.transparent!.positions[i * 3 + 1]!);
    const flatAt = (y: number) => Array.from({ length: ys.length / 4 }, (_, q) => ys.slice(q * 4, q * 4 + 4)).filter((qy) => qy.every((v) => v === y));
    expect(flatAt(2)).toHaveLength(0);
    expect(Math.max(...ys)).toBeCloseTo(2.875);
  });

  it("culls faces across a chunk border", () => {
    const w = makeWorld([CHUNK * 2, 2, 2], [[CHUNK - 1, 0, 0, STONE], [CHUNK, 0, 0, STONE]]);
    expect(quads(mesh(w, 0).opaque)).toBe(5);
    expect(quads(mesh(w, 1).opaque)).toBe(5);
  });

  it("faces point outward", () => {
    const m = mesh(makeWorld([4, 4, 4], [[1, 1, 1, STONE]])).opaque!;
    for (let t = 0; t < m.indices.length / 3; t++) {
      const [a, b, c] = [0, 1, 2].map((k) => Array.from(m.positions.slice(m.indices[t * 3 + k]! * 3, m.indices[t * 3 + k]! * 3 + 3)));
      const e1 = a!.map((v, i) => b![i]! - v);
      const e2 = a!.map((v, i) => c![i]! - v);
      const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const centre = [0, 1, 2].map((i) => (a![i]! + b![i]! + c![i]!) / 3 - 1.5);
      expect(n[0]! * centre[0]! + n[1]! * centre[1]! + n[2]! * centre[2]!).toBeGreaterThan(0);
    }
  });
});

describe("chunkOrder", () => {
  it("starts with the chunk holding the given point", () => {
    expect(chunkOrder([96, 32, 96], [70, 5, 10])[0]).toEqual([2, 0, 0]);
  });
});
