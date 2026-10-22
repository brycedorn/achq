import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, inflateSync } from "node:zlib";
import { parse, simplify } from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import { parseDesign, type PartInput } from "../src/design.js";
import { renderDesign } from "../src/render.js";
import { HQ_LEVEL_NAME, writeWorld } from "../src/world.js";

const space = (parts: PartInput[], extra: Record<string, unknown> = {}) =>
  parseDesign({ name: "space", version: 1, size: [40, 30, 40], floorY: 10, shell: { kind: "none" }, parts, ...extra });

describe("cylinder", () => {
  const { volume: v, conflicts } = renderDesign(
    space([
      {
        type: "cylinder", id: "module", axis: "x", center: [15, 20], from: 5, to: 30, radius: 6, shell: "minecraft:white_concrete",
        windows: [{ angle: [160, 180], block: "minecraft:glass" }], floor: { offset: -3, block: "minecraft:stone" },
        ribs: { every: 5, block: "minecraft:light_gray_concrete" }, caps: { from: true, to: false },
      },
    ]),
    { origin: [0, 0, 0] },
  );

  it("is a hollow tube with a floor, glazed underneath, closed at one end only", () => {
    expect(conflicts).toEqual([]);
    expect(v.get(15, 15, 20)).toBe("minecraft:air"); // inside
    expect(v.get(15, 12, 20)).toBe("minecraft:stone"); // the floor, 3 below the centre line
    expect(v.get(15, 21, 20)).toBe("minecraft:white_concrete"); // the crown
    expect(v.get(15, 9, 20)).toBe("minecraft:glass"); // the bottom, glazed
    expect(v.get(5, 15, 20)).toBe("minecraft:white_concrete"); // the capped end
    expect(v.get(30, 15, 20)).toBe("minecraft:air"); // the open end
  });

  it("rings the outside with ribs", () => {
    expect(v.get(10, 22, 20)).toBe("minecraft:light_gray_concrete");
    expect(v.get(11, 22, 20)).toBe("minecraft:air");
  });

  it("is round: as wide as it is tall", () => {
    let wide = 0;
    let tall = 0;
    for (let z = 0; z < 40; z++) if (v.get(15, 15, z) !== "minecraft:air" || (z > 14 && z < 26)) wide++;
    for (let y = 0; y < 30; y++) if (v.get(15, y, 20) !== "minecraft:air" || (y > 9 && y < 21)) tall++;
    expect(Math.abs(wide - tall)).toBeLessThanOrEqual(1);
  });
});

describe("sphere", () => {
  const { volume: v } = renderDesign(
    space([
      {
        type: "sphere", id: "bulb", center: [20, 15, 20], radius: 8, shell: "minecraft:light_gray_concrete", glass: "minecraft:glass", meridians: 60,
        floor: { offset: -3, block: "minecraft:stone", glass: "minecraft:glass", glassFrom: 3 },
      },
    ]),
    { origin: [0, 0, 0] },
  );

  it("is a glazed shell with a frame, hollow, with a floor glazed towards the south", () => {
    expect(v.get(20, 15, 20)).toBe("minecraft:air");
    expect(v.get(20, 12, 18)).toBe("minecraft:stone");
    expect(v.get(20, 12, 24)).toBe("minecraft:glass");
    const shell = [v.get(20, 23, 20), v.get(28, 15, 20), v.get(20, 15, 28)];
    for (const b of shell) expect(["minecraft:glass", "minecraft:light_gray_concrete"]).toContain(b);
    expect(v.get(28, 15, 20)).toBe("minecraft:light_gray_concrete"); // the equator ring
  });
});

describe("a world save in space", () => {
  const design = space([{ type: "box", id: "deck", from: [10, 10, 10], to: [20, 10, 20], block: "minecraft:stone" }], {
    origin: [0, 200, 0],
    atmosphere: { biome: "minecraft:the_void", time: 18000 },
    surroundings: { void: true, planet: { center: [20, 20], top: -100, radius: 120, extent: 100 } },
  });
  const out = mkdtempSync(join(tmpdir(), "achq-space-"));
  const result = writeWorld(design, [0, 200, 0], out);
  const dir = join(out, HQ_LEVEL_NAME);
  const chunk = async (cx: number, cz: number) => {
    const region = readFileSync(join(dir, "dimensions", "minecraft", "overworld", "region", `r.${Math.floor(cx / 32)}.${Math.floor(cz / 32)}.mca`));
    const i = (cz & 31) * 32 + (cx & 31);
    const offset = (region.readUInt32BE(i * 4) >>> 8) * 4096;
    return simplify((await parse(inflateSync(region.subarray(offset + 5, offset + 4 + region.readUInt32BE(offset))))).parsed) as any;
  };

  it("generates nothing round the design: a void", async () => {
    const gen = simplify((await parse(gunzipSync(readFileSync(join(dir, "data", "minecraft", "world_gen_settings.dat"))))).parsed) as any;
    expect(gen.data.dimensions["minecraft:overworld"].generator.settings.layers).toEqual([{ block: "minecraft:air", height: 1 }]);
  });

  it("writes the planet's chunks far beyond the design, its surface 100 below the design's bottom", async () => {
    expect(result.chunks).toBeGreaterThan(9);
    const c = await chunk(1, 1); // over the planet's centre (20, 20)
    const surfaceSection = c.sections.find((s: any) => s.Y === Math.floor(100 / 16));
    const palette = surfaceSection.block_states.palette.map((p: any) => p.id ?? p);
    expect(palette.some((id: string) => id !== "minecraft:air")).toBe(true);
    const sky = c.sections.find((s: any) => s.Y === Math.floor(150 / 16));
    expect(sky.block_states.palette).toHaveLength(1);
  });

  it("leaves the anchors file and the design's own blocks where they belong", async () => {
    const c = await chunk(0, 0);
    const section = c.sections.find((s: any) => s.Y === Math.floor(210 / 16));
    expect(section.block_states.palette.map((p: any) => p.id ?? p)).toContain("minecraft:stone");
  });
});

describe("bodies in the sky", () => {
  const design = space([], {
    origin: [0, 200, 0],
    surroundings: {
      void: true,
      bodies: [{ center: [100, 40, 20], radius: 6, bands: ["minecraft:orange_terracotta"], ring: { inner: 8, outer: 11, blocks: ["minecraft:white_terracotta"], tilt: 0 } }],
      asteroids: { center: [20, 20], radius: 60, spread: 5, y: [0, 10], count: 12, minSize: 2, maxSize: 3, blocks: ["minecraft:tuff"] },
    },
  });
  const out = mkdtempSync(join(tmpdir(), "achq-sky-"));
  writeWorld(design, [0, 200, 0], out);
  const dir = join(out, HQ_LEVEL_NAME);
  const ids = async (cx: number, cz: number, sy: number) => {
    const region = readFileSync(join(dir, "dimensions", "minecraft", "overworld", "region", `r.${Math.floor(cx / 32)}.${Math.floor(cz / 32)}.mca`));
    const i = (cz & 31) * 32 + (cx & 31);
    const offset = (region.readUInt32BE(i * 4) >>> 8) * 4096;
    if (offset === 0) return [];
    const c = simplify((await parse(inflateSync(region.subarray(offset + 5, offset + 4 + region.readUInt32BE(offset))))).parsed) as any;
    return c.sections.find((s: any) => s.Y === sy).block_states.palette.map((p: any) => p.id ?? p) as string[];
  };

  it("writes a body and its ring into the chunks round it, far outside the design", async () => {
    expect(await ids(6, 1, Math.floor(240 / 16))).toContain("minecraft:orange_terracotta"); // the body's edge at x 106
    expect(await ids(6, 1, Math.floor(240 / 16))).toContain("minecraft:white_terracotta"); // the ring, level with its middle
  });

  it("scatters the asteroid belt round its centre", async () => {
    let rocks = 0;
    for (let cx = -4; cx <= 6; cx++) for (let cz = -4; cz <= 6; cz++) for (const sy of [12, 13]) if ((await ids(cx, cz, sy)).includes("minecraft:tuff")) rocks++;
    expect(rocks).toBeGreaterThan(3);
  });
});
