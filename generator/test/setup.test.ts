import { describe, expect, it } from "vitest";
import { loadDesign } from "../src/designs.js";
import { gunzipSync } from "node:zlib";
import { parse, simplify } from "prismarine-nbt";
import { renderDesign } from "../src/render.js";
import { hqBox, setupCommands } from "../src/setup.js";

describe("setupCommands", () => {
  it("loads the area, places the structure and lets the area unload, for a small design", () => {
    const office = loadDesign("test-office");
    expect(setupCommands(office, [0, 64, 0])).toEqual([
      "/forceload add 0 0 24 18",
      "/place template minecraft:test-office 0 64 0",
      "/forceload remove all",
    ]);
  });

  it("splits a big area into force-loads of at most 16 x 16 chunks and applies the atmosphere", () => {
    const world = loadDesign("snowy-chalet", 6);
    const commands = setupCommands(world, [40, 64, 40]);
    const loads = commands.filter((c) => c.startsWith("/forceload add"));
    expect(loads.length).toBe(6); // chunks 2 to 32 east (31) and 2 to 34 south (33): two tiles by three
    for (const load of loads) {
      const [x0, z0, x1, z1] = load.split(" ").slice(2).map(Number) as [number, number, number, number];
      const chunks = (Math.floor(x1 / 16) - Math.floor(x0 / 16) + 1) * (Math.floor(z1 / 16) - Math.floor(z0 / 16) + 1);
      expect(chunks).toBeLessThanOrEqual(256);
    }
    // Everything in the box is loaded: the tiles cover its corners.
    expect(loads.some((c) => c.startsWith("/forceload add 40 40"))).toBe(true);
    expect(loads.some((c) => c.endsWith(" 519 551"))).toBe(true);
    expect(commands).toContain("/place template minecraft:snowy-chalet 40 64 40");
    expect(commands).toContain("/gamerule max_block_modifications 43253760");
    expect(commands).toContain("/fillbiome 40 64 40 519 239 551 minecraft:snowy_taiga");
    expect(commands).toContain("/time set 12500");
    expect(commands).toContain("/weather rain");
    expect(commands.at(-1)).toBe("/forceload remove all");
    // The place comes before the atmosphere.
    expect(commands.indexOf("/weather rain")).toBeGreaterThan(commands.indexOf("/place template minecraft:snowy-chalet 40 64 40"));
  });

  it("is silent about atmosphere when a design has none", () => {
    const commands = setupCommands(loadDesign("snowy-chalet", 3), [0, 64, 0]);
    expect(commands.some((c) => c.startsWith("/fillbiome") || c.startsWith("/weather") || c.startsWith("/time"))).toBe(false);
  });
});

describe("hqBox", () => {
  const chalet = loadDesign("snowy-chalet", 7);
  const origin = [40, 64, 40] as const;
  const { volume, layout } = renderDesign(chalet, { origin });
  const box = hqBox(layout, origin, chalet.size)!;

  it("covers the chalet with its deck, foundation and roof, and little else", () => {
    const [x0, y0, z0, x1, y1, z1] = box;
    // Chalet walls x 123..137, z 100..120; deck to x 140, z 128; foundation from y 69; ridge near y 86.
    expect(x0).toBeLessThanOrEqual(120);
    expect(x1).toBeGreaterThanOrEqual(140);
    expect(z0).toBeLessThanOrEqual(100);
    expect(z1).toBeGreaterThanOrEqual(128);
    expect(y0).toBeLessThanOrEqual(69);
    expect(y1).toBeGreaterThanOrEqual(86);
    expect((x1 - x0 + 1) * (z1 - z0 + 1)).toBeLessThan(2500); // a building, not the valley
  });

  it("keeps the air inside the box when air is otherwise left out, and only there", async () => {
    const { parsed } = await parse(gunzipSync(volume.toStructure(undefined, undefined, box)));
    const tree = simplify(parsed) as { palette: { Name: string }[]; blocks: { pos: number[]; state: number }[] };
    const air = tree.blocks.filter((b) => tree.palette[b.state]!.Name === "minecraft:air");
    expect(air.length).toBeGreaterThan(1000);
    const [x0, y0, z0, x1, y1, z1] = box;
    // One assertion, not one per block: there are many thousands.
    const outside = air.filter((b) => {
      const [x, y, z] = b.pos as [number, number, number];
      return !(x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1);
    });
    expect(outside.length).toBe(0);
  });
});

