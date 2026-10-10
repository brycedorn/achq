import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

const design = loadDesign("snowy-chalet");
const { volume, layout, conflicts } = renderDesign(design, { origin: [0, 0, 0] });
const name = (x: number, y: number, z: number) => volume.get(x, y, z).replace(/\[.*$/, "");

describe("snowy-chalet", () => {
  it("passes every design check", () => {
    expect(checkDesign(design)).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it("stands its floor on a foundation", () => {
    expect(design.floorY).toBe(3);
    expect(layout.anchors["spawn"]!.y).toBe(4);
    expect(name(15, 3, 10)).toBe("minecraft:spruce_planks");
    expect(name(15, 2, 10)).toBe("minecraft:stone_bricks");
  });

  it("builds a roof that is symmetric about the ridge, away from the chimney", () => {
    for (let y = 8; y <= 16; y++)
      for (let x = 7; x < 15; x++) expect(name(x, y, 10), `y=${y} x=${x}`).toBe(name(30 - x, y, 10));
  });

  it("closes the roof with snow on top and timber under it", () => {
    expect(name(15, 15, 10)).toBe("minecraft:spruce_planks"); // ridge body
    expect(name(15, 16, 10)).toBe("minecraft:snow_block"); // ridge snow
    expect(volume.get(9, 10, 10)).toBe("minecraft:spruce_stairs[facing=east,half=bottom]");
    expect(volume.get(9, 11, 10)).toBe("minecraft:smooth_quartz_stairs[facing=east,half=bottom]");
    expect(name(9, 10, 4)).toBe("minecraft:dark_oak_stairs"); // trimmed gable edge
  });

  it("leaves the ridge cell to the roof, not the glazed gable", () => {
    expect(name(15, 15, 25)).toBe("minecraft:spruce_planks");
    expect(name(14, 14, 25)).not.toBe("minecraft:air"); // gable fill below the ridge
  });

  it("takes the chimney through the roof", () => {
    expect(name(21, 12, 14)).toBe("minecraft:air"); // the flue is hollow
    expect(name(21, 12, 13)).toBe("minecraft:stone_bricks");
    expect(volume.get(21, 4, 14)).toBe("minecraft:campfire[lit=true]");
    expect(name(21, 15, 13)).toBe("minecraft:smooth_quartz_slab");
  });

  it("rails the deck and keeps its posts clear of the hall", () => {
    expect(name(15, 4, 33)).toBe("minecraft:spruce_fence");
    expect(name(5, 2, 26)).toBe("minecraft:spruce_log");
    expect(name(15, 4, 26)).toBe("minecraft:air");
  });

  it("opens a door on each side", () => {
    expect(name(15, 4, 5)).toBe("minecraft:air");
    expect(name(17, 4, 25)).toBe("minecraft:air");
    expect(name(17, 6, 25)).not.toBe("minecraft:air");
  });
});

describe("part overrides", () => {
  it("reject a part that overrides one that does not exist", () => {
    expect(() => parseDesign({ ...design, parts: design.parts.map((p) => (p.id === "fireplace" ? { ...p, over: ["ghost"] } : p)) })).toThrow(/unknown part 'ghost'/);
  });

  it("report a part that overwrites another without declaring it", () => {
    const parts = design.parts.map((p) => (p.id === "fireplace" ? { ...p, over: [] } : p));
    const found = checkDesign(parseDesign({ ...design, parts })).map((p) => p.message);
    expect(found.some((m) => /overwrites a block of part 'roof'/.test(m))).toBe(true);
  });
});
