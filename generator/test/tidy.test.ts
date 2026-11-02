import { describe, expect, it } from "vitest";
import { parseDesign, type PartInput } from "../src/design.js";
import { renderDesign } from "../src/render.js";
import { type Volume } from "../src/schematic.js";

/** Render parts in an empty volume (with a flat terrain `ground` at layer 4 when asked). */
const render = (parts: PartInput[], size: [number, number, number] = [40, 30, 40], ground = false) =>
  renderDesign(
    parseDesign({
      name: "tidy", size, floorY: 4, shell: { kind: "none" },
      parts: [
        ...(ground ? [{ type: "terrain", id: "ground", x: [0, size[0] - 1], z: [0, size[2] - 1], grid: [[4, 4], [4, 4]], surface: "minecraft:sand", rock: "minecraft:stone", base: "minecraft:stone" } as PartInput] : []),
        ...parts,
      ],
    }),
    { origin: [0, 0, 0] },
  ).volume;

/** Blocks matching `match` that touch nothing on any face. */
function loose(v: Volume, match: RegExp): number {
  let n = 0;
  for (let y = 0; y < v.height; y++)
    for (let z = 0; z < v.length; z++)
      for (let x = 0; x < v.width; x++) {
        if (!match.test(v.get(x, y, z))) continue;
        const near = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => {
          const [nx, ny, nz] = [x + a!, y + b!, z + c!];
          return nx >= 0 && ny >= 0 && nz >= 0 && nx < v.width && ny < v.height && nz < v.length && v.get(nx, ny, nz) !== "minecraft:air";
        });
        if (!near) n++;
      }
  return n;
}

describe("shapes leave nothing touching only at its corners", () => {
  it("closes a sphere's shell", () => {
    const ball = (closed: boolean): PartInput => ({ type: "sphere", id: "ball", center: [20, 15, 20], radius: 7, shell: "minecraft:glass", closed });
    expect(loose(render([ball(false)]), /glass/)).toBeGreaterThan(0);
    expect(loose(render([ball(true)]), /glass/)).toBe(0);
  });

  it("closes a raked deckhouse nose", () => {
    const nose: PartInput = {
      type: "deckhouse", id: "house", bow: "south", stern: 5, center: 20, from: 0, to: 24, y: 5, height: 3, halfWidth: 5, taper: 9, rake: 1,
      open: true, wall: "minecraft:white_concrete", roof: "minecraft:white_concrete", slope: "minecraft:quartz_stairs", trim: "minecraft:quartz_slab",
      windows: { rows: [6, 7], block: "minecraft:gray_stained_glass" },
    };
    expect(loose(render([nose]), /stained_glass/)).toBe(0);
  });

  it("joins a deck's railing into a railing, not a row of posts", () => {
    const deck: PartInput = {
      type: "deck", id: "deck", x: [10, 16], z: [10, 14], y: 8, planks: "minecraft:spruce_planks",
      rail: { block: "minecraft:spruce_fence", sides: ["south", "east", "west"] }, posts: { block: "minecraft:spruce_fence", every: 3, bottom: 5 },
    };
    expect(render([deck]).get(13, 9, 14)).toBe("minecraft:spruce_fence[east=true,north=false,south=false,waterlogged=false,west=true]");
    expect(render([deck]).get(16, 9, 14)).toBe("minecraft:spruce_fence[east=false,north=true,south=false,waterlogged=false,west=true]");
  });

  it("trims an olive grove's stray leaves", () => {
    const at = [] as [number, number][];
    for (let x = 4; x < 36; x += 6) for (let z = 4; z < 36; z += 6) at.push([x, z]);
    const grove: PartInput = {
      type: "trees", id: "grove", on: "ground", style: "olive", at, trunk: "minecraft:oak_log", leaves: "minecraft:oak_leaves[persistent=true]",
      minHeight: 5, maxHeight: 7,
    };
    expect(loose(render([grove], undefined, true), /oak_leaves/)).toBe(0);
  });

  it("gives a beach umbrella a flat canopy", () => {
    const beach: PartInput = {
      type: "beach", id: "beach", on: "ground", umbrellas: [[20, 20]], colors: ["minecraft:blue_wool"], pole: "minecraft:birch_fence",
      bed: "minecraft:white_carpet", boats: [], boatColors: ["minecraft:red_concrete"], boatWood: "minecraft:spruce",
    };
    expect(loose(render([beach], undefined, true), /wool/)).toBe(0);
  });
});
