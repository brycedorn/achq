import { describe, expect, it } from "vitest";
import { loadDesign } from "../src/designs.js";
import { setupCommands } from "../src/setup.js";

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
