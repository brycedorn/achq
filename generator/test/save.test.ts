import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, inflateSync } from "node:zlib";
import { parse, simplify } from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import { parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";
import { packIndices } from "../src/nbt.js";
import { renderDesign } from "../src/render.js";
import { DATA_VERSION, HQ_LEVEL_NAME, writeWorld } from "../src/world.js";

const office = loadDesign("test-office");
/** The office with an atmosphere and one bound lamp, to check those reach the save. */
const design = parseDesign({
  ...office,
  atmosphere: { biome: "minecraft:snowy_taiga", weather: "rain", time: 12500 },
  parts: [...office.parts, { type: "device", id: "lamp", at: [15, 4, 7], block: "agentcraft:status_lamp[status=idle]", binding: "merge" }],
});
const origin = [100, 64, -40] as const;
const out = mkdtempSync(join(tmpdir(), "achq-world-"));
const result = writeWorld(design, origin, out);
const dir = join(out, HQ_LEVEL_NAME);
const nbt = async (file: string) => simplify((await parse(readFileSync(file))).parsed) as Record<string, any>;

/** Read one chunk from a region file. */
async function chunkAt(cx: number, cz: number): Promise<Record<string, any>> {
  const region = readFileSync(join(dir, "dimensions", "minecraft", "overworld", "region", `r.${Math.floor(cx / 32)}.${Math.floor(cz / 32)}.mca`));
  const i = (cz & 31) * 32 + (cx & 31);
  const offset = (region.readUInt32BE(i * 4) >>> 8) * 4096;
  expect(offset).toBeGreaterThan(0);
  const length = region.readUInt32BE(offset);
  expect(region[offset + 4]).toBe(2); // zlib
  return simplify((await parse(inflateSync(region.subarray(offset + 5, offset + 4 + length)))).parsed) as Record<string, any>;
}

/** The block state name at a world position, decoded from the packed section data. */
async function blockAt(x: number, y: number, z: number): Promise<string> {
  const chunk = await chunkAt(Math.floor(x / 16), Math.floor(z / 16));
  const section = chunk["sections"].find((s: any) => s.Y === Math.floor(y / 16));
  const palette: any[] = section.block_states.palette;
  const name = (e: any) => (typeof e === "string" ? e : e.id);
  if (palette.length === 1) return name(palette[0]);
  const bits = Math.max(4, Math.ceil(Math.log2(palette.length)));
  const perLong = Math.floor(64 / bits);
  const i = ((y & 15) * 16 + (z & 15)) * 16 + (x & 15);
  const [hi, lo] = section.block_states.data[Math.floor(i / perLong)] as [number, number];
  const value = (BigInt.asUintN(32, BigInt(hi)) << 32n) | BigInt.asUintN(32, BigInt(lo));
  const idx = Number((value >> BigInt((i % perLong) * bits)) & ((1n << BigInt(bits)) - 1n));
  return name(palette[idx]);
}

describe("writeWorld", () => {
  it("writes a world folder AgentCraft opens as its HQ", async () => {
    expect(readdirSync(out)).toEqual([HQ_LEVEL_NAME]);
    const level = (await nbt(join(dir, "level.dat")))["Data"];
    expect(level.LevelName).toBe("AgentCraft HQ");
    expect(level.DataVersion).toBe(DATA_VERSION);
    expect(level.Version.Name).toBe("26.3");
    expect(level.GameType).toBe(1);
    expect(level.difficulty_settings.hardcore).toBe(0); // AgentCraft refuses a hardcore HQ
    expect(level.spawn.pos).toEqual([112, 65, -38]); // the design's spawn anchor, in world coordinates
  });

  it("includes the marker, so AgentCraft keeps the design's time, weather and spawn", () => {
    expect(existsSync(join(dir, "agentcraft-world.json"))).toBe(true);
  });

  it("includes the anchors file, so AgentCraft loads the layout and does not build its own studio", () => {
    const anchors = JSON.parse(readFileSync(join(dir, "agentcraft-anchors.json"), "utf8"));
    expect(anchors.layout).toBe("test-office");
    expect(anchors.anchors.spawn).toMatchObject({ x: 112.5, y: 65, z: -37.5 }); // floor at y 64, feet at 65
  });

  it("bakes the atmosphere in: biome, rain held on, time of day", async () => {
    expect((await nbt(join(dir, "data", "minecraft", "weather.dat")))["data"]).toMatchObject({ raining: 1, thundering: 0 });
    expect((await nbt(join(dir, "data", "minecraft", "world_clocks.dat")))["data"]["minecraft:overworld"]).toEqual({ total_ticks: [0, 12500] });
    const gen = (await nbt(join(dir, "data", "minecraft", "world_gen_settings.dat")))["data"].dimensions["minecraft:overworld"].generator;
    expect(gen.type).toBe("minecraft:flat");
    expect(gen.settings.biome).toBe("minecraft:snowy_taiga");
    expect((await chunkAt(6, -3))["sections"][0].biomes.palette).toEqual(["minecraft:snowy_taiga"]);
  });

  it("places the design on AgentCraft's meadow, block for block", async () => {
    const { volume } = renderDesign(design, { origin });
    for (const [lx, ly, lz] of [[0, 0, 0], [12, 1, 0], [2, 1, 13], [3, 1, 6], [15, 4, 7], [10, 5, 9], [24, 7, 18]] as const) {
      const expected = volume.get(lx, ly, lz).replace(/\[.*$/, "");
      const actual = await blockAt(origin[0] + lx, origin[1] + ly, origin[2] + lz);
      expect(actual, `${lx},${ly},${lz}`).toBe(expected === "minecraft:air" ? actual : expected);
    }
    // Outside the design, and under it, the meadow layers.
    expect(await blockAt(origin[0] - 1, 64, origin[2])).toBe("minecraft:grass_block");
    expect(await blockAt(origin[0] - 1, 62, origin[2])).toBe("minecraft:dirt");
    expect(await blockAt(origin[0] + 5, 0, origin[2] + 5)).toBe("minecraft:stone");
    expect(await blockAt(origin[0] + 5, -64, origin[2] + 5)).toBe("minecraft:bedrock");
  });

  it("writes block properties the way 26.3 does: {id, properties}", async () => {
    const chunk = await chunkAt(Math.floor((origin[0] + 2) / 16), Math.floor((origin[2] + 13) / 16));
    const stairs = chunk["sections"].flatMap((s: any) => s.block_states.palette).find((e: any) => e.id === "minecraft:dark_oak_stairs");
    expect(stairs).toEqual({ id: "minecraft:dark_oak_stairs", properties: { facing: "north", half: "bottom" } });
  });

  it("gives bound blocks their block entity with the binding", async () => {
    const [x, y, z] = [origin[0] + 15, origin[1] + 4, origin[2] + 7];
    const chunk = await chunkAt(Math.floor(x / 16), Math.floor(z / 16));
    expect(chunk["block_entities"]).toContainEqual({ components: {}, keepPacked: 0, x, y, z, id: "agentcraft:status_lamp", binding: "merge" });
    // Vanilla blocks that need one get an empty one, as the game would make it.
    const lectern = chunk["block_entities"].concat((await chunkAt(Math.floor((origin[0] + 3) / 16), Math.floor((origin[2] + 6) / 16)))["block_entities"]);
    expect(lectern.some((e: any) => e.id === "minecraft:lectern")).toBe(true);
  });

  it("leaves light for the game to compute", async () => {
    expect((await chunkAt(6, -3))["isLightOn"]).toBe(0);
  });

  it("reports what it wrote", () => {
    expect(result.chunks).toBe(4); // a 25 x 19 office at x 100, z -40 spans two chunks each way
    expect(result.regions).toBe(1);
  });

  it("refuses a design that would not fit the world's height", () => {
    expect(() => writeWorld(design, [0, 315, 0], mkdtempSync(join(tmpdir(), "achq-world-")))).toThrow(/allows -64 to 319/);
  });
});

describe("packIndices", () => {
  it("packs whole entries per long, low bits first, for 4 and 5 bits", () => {
    const four = packIndices([1, 2, 3, ...new Array(13).fill(0)], 4);
    expect(Array.from(four)).toEqual([0, 0x321]);
    // 5 bits: 12 entries per long, the 7th straddles the 32-bit halves.
    const five = packIndices([0, 0, 0, 0, 0, 0, 31, ...new Array(5).fill(0)], 5);
    expect(Array.from(five)).toEqual([0x7, 0xc0000000]);
  });
});

describe("layout bounds", () => {
  it("are the HQ's walkable region, not the whole landscape", () => {
    const chalet = loadDesign("snowy-chalet", 7);
    const { layout } = renderDesign(chalet, { origin: [40, 64, 40] });
    const b = layout.bounds!;
    expect((b.maxX - b.minX + 1) * (b.maxZ - b.minZ + 1)).toBeLessThan(2500); // the chalet, not 480 x 512
    expect(b.minX).toBeLessThanOrEqual(40 + 124);
    expect(b.maxX).toBeGreaterThanOrEqual(40 + 136);
  });

  it("stay the whole volume for a small office", () => {
    const { layout } = renderDesign(office, { origin: [0, 0, 0] });
    expect(layout.bounds).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 24, maxY: 7, maxZ: 18 });
  });
});
