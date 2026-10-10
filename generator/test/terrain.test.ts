import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";
import { buildScene } from "../src/scene.js";

const design = loadDesign("snowy-chalet", 2);
const { volume, conflicts } = renderDesign(design, { origin: [0, 0, 0] });
const name = (x: number, y: number, z: number) => volume.get(x, y, z).replace(/\[.*$/, "");
const GROUND = new Set(["minecraft:stone", "minecraft:andesite", "minecraft:snow_block", "minecraft:stone_bricks"]);
/** Layer of the ground in a column: how far solid terrain runs up from the bottom without a gap. */
const ground = (x: number, z: number) => {
  let y = -1;
  while (y + 1 < design.size[1] && GROUND.has(name(x, y + 1, z))) y++;
  return y;
};

describe("snowy-chalet v2", () => {
  it("is the chalet of v1 moved onto a shelf, with ground and trees", () => {
    expect(design.version).toBe(2);
    expect(design.floorY).toBe(14);
    expect(design.parts[0]!.type).toBe("terrain");
    expect(design.parts.at(-1)!.type).toBe("trees");
  });

  it("passes every check with no overlaps", () => {
    expect(checkDesign(design)).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it("keeps the ground level with the floor around the building, so the door opens onto snow", () => {
    for (const [x, z] of [[23, 0], [23, 4], [10, 10], [40, 20], [5, 24]] as const) expect(ground(x, z), `${x},${z}`).toBe(14);
    expect(name(23, 14, 4)).toBe("minecraft:snow_block");
    expect(name(23, 15, 5)).toBe("minecraft:air"); // the doorway
  });

  it("falls away steeply south of the deck, with rock showing", () => {
    expect(ground(23, 30)).toBeLessThan(8);
    expect(ground(23, 45)).toBeLessThan(4);
    const rock = new Set<string>();
    for (let z = 26; z < 40; z++) for (let x = 0; x < 47; x++) if (ground(x, z) >= 0) rock.add(name(x, ground(x, z), z));
    expect(rock.has("minecraft:stone") || rock.has("minecraft:andesite")).toBe(true);
  });

  it("leaves the hall interior clear above the floor", () => {
    for (const x of [20, 23, 26]) for (const y of [15, 16]) expect(name(x, y, 12), `${x},${y}`).toBe("minecraft:air");
  });

  it("stands each tree on the ground, with a trunk, leaves and snow on the tiers", () => {
    for (const [x, z] of [[5, 6], [41, 8], [24, 40]] as const) {
      const g = ground(x, z);
      const column = Array.from({ length: design.size[1] }, (_, y) => name(x, y, z));
      expect(column[g + 1], `${x},${z} trunk`).toBe("minecraft:spruce_log");
      const around = new Set<string>();
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let y = g + 2; y < g + 14; y++) {
        if (x + dx >= 0 && x + dx < 47 && z + dz >= 0 && z + dz < 48 && y < design.size[1]) around.add(name(x + dx, y, z + dz));
      }
      expect(around.has("minecraft:spruce_leaves"), `${x},${z} leaves`).toBe(true);
      expect(around.has("minecraft:snow_block"), `${x},${z} snow`).toBe(true);
    }
  });

  it("renders the same ground and trees every time", () => {
    const again = renderDesign(design, { origin: [0, 0, 0] });
    expect(again.volume.toStructure().equals(volume.toStructure())).toBe(true);
  });

  it("tells the viewer to start with everything shown, and where the roof starts", () => {
    const scene = buildScene(design);
    expect(scene.hasTerrain).toBe(true);
    expect(scene.roofCut).toBe(19);
  });
});
