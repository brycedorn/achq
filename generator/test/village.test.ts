import { describe, expect, it } from "vitest";
import { parseDesign } from "../src/design.js";
import { renderDesign } from "../src/render.js";

/** A gentle hillside rising to the north, and a walk-in village on it. */
const hillside = (style: "varied" | "explorable", interior = true) =>
  parseDesign({
    name: "village", version: 1, seed: 4, size: [60, 30, 60], shell: { kind: "none" },
    parts: [
      { type: "terrain", id: "hill", x: [0, 59], z: [0, 59], grid: [[12, 12], [4, 4]], surface: "minecraft:grass_block", rock: "minecraft:stone", base: "minecraft:stone" },
      {
        type: "village", id: "village", on: "hill", at: [30, 30], radius: 22, houses: 10, style,
        wall: "minecraft:white_concrete", stone: "minecraft:stone_bricks", roof: "minecraft:brick_stairs", ridge: "minecraft:bricks",
        light: "minecraft:glowstone", post: "minecraft:oak_fence", lantern: "minecraft:lantern",
        ...(interior
          ? {
              interior: {
                floor: "minecraft:spruce_planks", glass: "minecraft:glass", table: "minecraft:spruce_slab[type=top]", chair: "minecraft:spruce_stairs",
                light: "minecraft:lantern[hanging=true]", candle: "minecraft:candle[candles=1,lit=true]", step: "minecraft:stone_brick_stairs",
              },
            }
          : {}),
      },
    ],
  });

const count = (design: ReturnType<typeof hillside>, pred: (s: string) => boolean) => {
  const { volume: v } = renderDesign(design, { origin: [0, 0, 0] });
  let n = 0;
  for (let y = 0; y < v.height; y++) for (let z = 0; z < v.length; z++) for (let x = 0; x < v.width; x++) if (pred(v.get(x, y, z))) n++;
  return n;
};

describe("explorable village", () => {
  it("furnishes its houses: a table with a candle in each, windows of glass, a barrel", () => {
    const d = hillside("explorable");
    const candles = count(d, (s) => s.startsWith("minecraft:candle"));
    expect(candles).toBeGreaterThan(2);
    expect(count(d, (s) => s === "minecraft:spruce_slab[type=top]")).toBe(candles);
    expect(count(d, (s) => s === "minecraft:glass")).toBeGreaterThan(candles * 2);
    expect(count(d, (s) => s.startsWith("minecraft:barrel"))).toBe(candles);
  });

  it("leaves room to walk in: hollow houses with floors, not solid blocks", () => {
    expect(count(hillside("explorable"), (s) => s === "minecraft:spruce_planks")).toBeGreaterThan(50);
    expect(count(hillside("varied"), (s) => s === "minecraft:spruce_planks")).toBe(0);
  });

  it("will not render without an interior to furnish with", () => {
    expect(() => renderDesign(hillside("explorable", false), { origin: [0, 0, 0] })).toThrow(/explorable but has no 'interior'/);
  });
});
