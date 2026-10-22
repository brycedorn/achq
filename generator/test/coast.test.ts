import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, inflateSync } from "node:zlib";
import { parse, simplify } from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import { parseDesign, type PartInput } from "../src/design.js";
import { checkDesign } from "../src/check.js";
import { renderDesign } from "../src/render.js";
import { HQ_LEVEL_NAME, writeWorld } from "../src/world.js";

const SEA = 6;
/** A small coast: ground sloping from 10 in the north to 0 in the south, under a sea at layer 6. */
function coast(parts: PartInput[] = [], extra: Record<string, unknown> = {}) {
  return parseDesign({
    name: "coast",
    version: 1,
    size: [40, 24, 40],
    shell: { kind: "none" },
    parts: [
      {
        type: "terrain", id: "land", x: [0, 39], z: [0, 39], grid: [[12, 12], [0, 0]],
        sea: { level: SEA, bed: "minecraft:gravel", beach: { block: "minecraft:sand", above: 1 } },
        surface: "minecraft:grass_block", rock: "minecraft:stone", base: "minecraft:stone",
      },
      ...parts,
    ],
    ...extra,
  });
}
const name = (state: string) => state.replace(/\[.*/, "");

describe("sea", () => {
  const { volume: v } = renderDesign(coast(), { origin: [0, 0, 0] });
  const top = (x: number, z: number) => {
    for (let y = v.height - 1; y >= 0; y--) if (v.get(x, y, z) !== "minecraft:air") return { y, block: name(v.get(x, y, z)) };
    return undefined;
  };

  it("fills low ground with water up to its level, over the bed, and leaves high ground dry", () => {
    expect(top(20, 39)).toEqual({ y: SEA, block: "minecraft:water" });
    expect(top(20, 2)!.block).toBe("minecraft:grass_block");
    let bed = 0;
    for (let y = 0; y < SEA; y++) if (name(v.get(20, y, 39)) === "minecraft:gravel") bed++;
    expect(bed).toBeGreaterThan(0);
  });

  it("puts a beach just above the water", () => {
    const beach = Array.from({ length: 40 }, (_, z) => top(20, z)!).filter((t) => t.block === "minecraft:sand");
    expect(beach.length).toBeGreaterThan(0);
    for (const t of beach) expect(t.y).toBeGreaterThanOrEqual(SEA);
  });
});

describe("hull", () => {
  const design = coast([
    {
      type: "hull", id: "boat", bow: "south", stern: 20, length: 16, center: 20, beam: 7, keelY: 3, deckY: 8, bowLength: 6,
      shell: "minecraft:white_concrete", deck: "minecraft:jungle_planks",
      stripes: [{ y: 6, block: "minecraft:blue_concrete" }],
      rail: { block: "minecraft:white_stained_glass_pane", gaps: [[0, 0]] },
    },
  ]);
  const { volume: v, conflicts } = renderDesign(design, { origin: [0, 0, 0] });

  it("is symmetric about its centre line, full beam amidships and pointed at the bow", () => {
    expect(conflicts).toEqual([]);
    for (let z = 20; z < 36; z++)
      for (let y = 3; y <= 9; y++) for (let t = 1; t <= 4; t++) expect(name(v.get(20 - t, y, z))).toBe(name(v.get(20 + t, y, z)));
    expect(name(v.get(17, 8, 24))).toBe("minecraft:white_concrete"); // gunwale at full beam
    expect(name(v.get(20, 8, 24))).toBe("minecraft:jungle_planks"); // deck
    expect(name(v.get(17, 8, 35))).not.toBe("minecraft:white_concrete"); // narrowed at the bow
  });

  it("paints the stripe on the outside and joins the rail panes, open at the transom", () => {
    expect(name(v.get(18, 6, 26))).toBe("minecraft:blue_concrete"); // the hull is narrower lower down
    expect(v.get(17, 9, 26)).toBe("minecraft:white_stained_glass_pane[north=true,east=false,south=true,west=false]");
    expect(v.get(20, 9, 20)).toBe("minecraft:air"); // the gap at the stern
  });
});

describe("restaurant", () => {
  const design = coast([
    {
      type: "restaurant", id: "cafe", x: [10, 20], z: [5, 14], y: 12, facing: "south", terrace: 4,
      wall: "minecraft:white_concrete", pillar: "minecraft:smooth_sandstone", roof: "minecraft:white_concrete", floor: "minecraft:terracotta",
      terraceFloor: "minecraft:smooth_stone", glass: "minecraft:glass", awning: ["minecraft:blue_wool", "minecraft:white_wool"],
      table: "minecraft:spruce_slab[type=top]", chair: "minecraft:dark_oak_stairs", light: "minecraft:lantern[hanging=true]",
      candle: "minecraft:white_candle[candles=3,lit=true]", counter: "minecraft:dark_oak_planks", post: "minecraft:dark_oak_fence", lantern: "minecraft:lantern",
    },
  ]);
  const { volume: v, conflicts } = renderDesign(design, { origin: [0, 0, 0] });
  const all = (pred: (s: string) => boolean) => {
    let n = 0;
    for (let y = 12; y <= 18; y++) for (let z = 5; z <= 18; z++) for (let x = 10; x <= 20; x++) if (pred(v.get(x, y, z))) n++;
    return n;
  };

  it("has an open front to walk in through and a closed back", () => {
    expect(conflicts).toEqual([]);
    expect(v.get(11, 13, 14)).toBe("minecraft:air"); // between the first pillars
    expect(v.get(11, 14, 14)).toBe("minecraft:air");
    expect(name(v.get(11, 13, 5))).toBe("minecraft:white_concrete"); // the back wall
  });

  it("has lit candles on its tables and lights inside, and a striped awning over the terrace", () => {
    expect(all((s) => s.startsWith("minecraft:white_candle"))).toBeGreaterThanOrEqual(4);
    expect(all((s) => s === "minecraft:lantern[hanging=true]")).toBeGreaterThanOrEqual(3);
    expect(name(v.get(10, 16, 15))).toBe("minecraft:blue_wool");
    expect(name(v.get(11, 16, 15))).toBe("minecraft:white_wool");
  });
});

describe("a world save with sea round it", () => {
  const design = coast([], {
    atmosphere: { biome: "minecraft:savanna", seaBiome: "minecraft:warm_ocean" },
    surroundings: { sea: { level: SEA } },
  });
  const out = mkdtempSync(join(tmpdir(), "achq-coast-"));
  writeWorld(design, [0, 64, 0], out);
  const dir = join(out, HQ_LEVEL_NAME);

  it("generates open sea, at the design's sea level, beyond the written chunks", async () => {
    const gen = simplify((await parse(gunzipSync(readFileSync(join(dir, "data", "minecraft", "world_gen_settings.dat"))))).parsed) as any;
    const settings = gen.data.dimensions["minecraft:overworld"].generator.settings;
    expect(settings.biome).toBe("minecraft:warm_ocean");
    const layers = settings.layers as { block: string; height: number }[];
    expect(layers.at(-1)).toEqual({ block: "minecraft:water", height: SEA + 1 });
    expect(layers.reduce((n, l) => n + l.height, 0)).toBe(-64 * -1 + 64 + SEA + 1); // from y -64 up to 64 + SEA
  });

  it("gives water columns the sea biome and land the land biome", async () => {
    const region = readFileSync(join(dir, "dimensions", "minecraft", "overworld", "region", "r.0.0.mca"));
    const offset = (region.readUInt32BE(0) >>> 8) * 4096; // chunk 0, 0: the north, dry land
    const chunk = simplify((await parse(inflateSync(region.subarray(offset + 5, offset + 4 + region.readUInt32BE(offset))))).parsed) as any;
    const south = (region.readUInt32BE((2 * 32 + 0) * 4) >>> 8) * 4096; // chunk 0, 2: the south, sea
    const sea = simplify((await parse(inflateSync(region.subarray(south + 5, south + 4 + region.readUInt32BE(south))))).parsed) as any;
    expect(chunk.sections[8].biomes.palette).toContain("minecraft:savanna");
    expect(sea.sections[8].biomes.palette).toContain("minecraft:warm_ocean");
  });
});

describe("deckhouse", () => {
  const design = coast([
    {
      type: "deckhouse", id: "house", bow: "south", stern: 10, center: 20, from: 2, to: 20, y: 12, height: 4, halfWidth: 4, taper: 6, radius: 2, rake: 1,
      wall: "minecraft:white_concrete", roof: "minecraft:white_concrete", slope: "minecraft:smooth_quartz_stairs", trim: "minecraft:smooth_quartz_slab[type=bottom]",
      windows: { rows: [13, 14], block: "minecraft:gray_stained_glass", slope: "minecraft:polished_blackstone_stairs" },
    },
  ]);
  const { volume: v, conflicts } = renderDesign(design, { origin: [0, 0, 0] });

  it("is hollow, glazed along its window rows and roofed", () => {
    expect(conflicts).toEqual([]);
    expect(v.get(20, 13, 20)).toBe("minecraft:air"); // inside
    expect(v.get(16, 13, 20)).toBe("minecraft:gray_stained_glass"); // the side, in a window row
    expect(v.get(20, 15, 20)).toBe("minecraft:white_concrete"); // the roof
  });

  it("rakes its windscreen with stairs rising aft, dark where it crosses the windows", () => {
    // The front draws back a block per layer, from 30 at the bottom; each step is a stair facing north (aft).
    expect(v.get(20, 12, 30)).toBe("minecraft:smooth_quartz_stairs[facing=north,half=bottom]");
    expect(v.get(20, 13, 29)).toBe("minecraft:polished_blackstone_stairs[facing=north,half=bottom]");
    expect(v.get(20, 12, 31)).toBe("minecraft:air");
  });

  it("rounds its aft corners", () => {
    expect(v.get(16, 12, 12)).toBe("minecraft:air"); // the corner cell is cut away
    expect(v.get(18, 12, 12)).not.toBe("minecraft:air");
  });
});

describe("hillside town", () => {
  const town = (houses: number) =>
    coast([
      {
        type: "hillside", id: "town", on: "land", at: [20, 12], radius: 16, houses, maxSlope: 8,
        walls: ["minecraft:white_concrete"], stone: "minecraft:stone_bricks", roofs: ["minecraft:brick_slab"], ridge: "minecraft:bricks",
        terrace: "minecraft:terracotta", door: "minecraft:spruce_door", shutters: ["minecraft:warped_trapdoor"],
        flowers: "minecraft:flowering_azalea_leaves[persistent=true]", pots: ["minecraft:potted_poppy"], fence: "minecraft:dark_oak_fence",
        interior: {
          floor: "minecraft:spruce_planks", glass: "minecraft:glass", table: "minecraft:spruce_slab[type=top]", chair: "minecraft:spruce_stairs",
          light: "minecraft:lantern[hanging=true]", candle: "minecraft:candle[candles=2,lit=true]", step: "minecraft:stone_brick_stairs",
          rugs: ["minecraft:red_carpet"], ladder: "minecraft:ladder",
        },
      },
    ]);
  const { volume: v, conflicts } = renderDesign(town(6), { origin: [0, 0, 0] });
  const find = (pred: (s: string) => boolean) => {
    const out: [number, number, number][] = [];
    for (let y = 0; y < v.height; y++) for (let z = 0; z < v.length; z++) for (let x = 0; x < v.width; x++) if (pred(v.get(x, y, z))) out.push([x, y, z]);
    return out;
  };

  it("builds houses on the slope with doors that face downhill (south here)", () => {
    expect(conflicts).toEqual([]);
    const doors = find((s) => s.startsWith("minecraft:spruce_door") && s.includes("half=lower") && s.includes("hinge=left"));
    expect(doors.length).toBeGreaterThan(0);
    for (const [x, y, z] of doors) {
      expect(v.get(x, y, z)).toContain("facing=south");
      expect(v.get(x, y, z - 1)).not.toMatch(/concrete|stone/); // a room behind the door, not solid wall
    }
  });

  it("furnishes the rooms and hangs open shutters beside the windows", () => {
    expect(find((s) => s.startsWith("minecraft:candle")).length).toBeGreaterThan(0);
    expect(find((s) => s.startsWith("minecraft:warped_trapdoor") && s.includes("open=true")).length).toBeGreaterThan(0);
  });

  it("is the same every time", () => {
    const again = renderDesign(town(6), { origin: [0, 0, 0] }).volume;
    expect(again.get(20, 14, 12)).toBe(v.get(20, 14, 12));
    expect(find((s) => s.startsWith("minecraft:spruce_door")).length).toBe(
      (() => {
        let n = 0;
        for (let y = 0; y < again.height; y++) for (let z = 0; z < again.length; z++) for (let x = 0; x < again.width; x++) if (again.get(x, y, z).startsWith("minecraft:spruce_door")) n++;
        return n;
      })(),
    );
  });
});

describe("offices off the main floor", () => {
  const design = parseDesign({
    name: "decks",
    version: 1,
    size: [24, 16, 24],
    floorY: 2,
    shell: { kind: "none" },
    parts: [
      { type: "box", id: "deck", from: [0, 2, 0], to: [23, 2, 23], block: "minecraft:stone" },
      { type: "box", id: "upper", from: [0, 7, 0], to: [23, 7, 23], block: "minecraft:stone" },
      {
        type: "deskRow", id: "desks", at: [10, 5], spacing: 5, agents: ["a", "b"], look: "east",
        desk: "minecraft:smooth_quartz_slab", monitor: "minecraft:black_concrete", chair: "minecraft:jungle_stairs",
        screen: { block: "agentcraft:monitor[facing=west,lit=true]", width: 3, height: 2 }, lamp: "agentcraft:status_lamp[status=idle]",
      },
      { type: "station", id: "lib", station: "library", at: [5, 5], block: "minecraft:lectern", look: "west", floor: 7 },
      { type: "taskWall", id: "board", x: [3, 6], z: 20, y: [3, 5], block: "agentcraft:task_board[facing=south]", facing: "south" },
    ],
  });
  const { volume: v, layout } = renderDesign(design, { origin: [0, 0, 0] });
  const a = layout.anchors;

  it("lays desks out along Z for agents looking east, chairs behind, screens on the far side", () => {
    expect(v.get(9, 3, 5)).toBe("minecraft:jungle_stairs[facing=west,half=bottom]");
    expect(v.get(9, 3, 10)).toBe("minecraft:jungle_stairs[facing=west,half=bottom]");
    expect(v.get(10, 4, 4)).toMatch(/^agentcraft:monitor\[facing=west/);
    expect(a["desk_a"]).toMatchObject({ x: 9.5, y: 3, z: 5.5, yaw: -90 });
    expect(a["monitor_a"]).toMatchObject({ x: 10.748, z: 5.5, yaw: 90 });
  });

  it("stands a station on its own floor, its block the way the agent looks", () => {
    expect(a["library"]).toMatchObject({ x: 5.5, y: 8, z: 5.5, yaw: 90 });
    expect(v.get(4, 8, 5)).toBe("minecraft:lectern");
  });

  it("hangs a task board on a wall facing south, the anchor in front of it", () => {
    expect(v.get(3, 3, 20)).toMatch(/^agentcraft:task_board/);
    expect(a["task_wall"]).toMatchObject({ x: 5, y: 4.5, z: 21, yaw: 0 });
  });
});

describe("the goal hologram", () => {
  const room = (ceiling: number, lampY: number) =>
    parseDesign({
      name: "atrium", version: 1, size: [12, 12, 12], floorY: 2, shell: { kind: "none" },
      parts: [
        { type: "box", id: "floor", from: [0, 2, 0], to: [11, 2, 11], block: "minecraft:stone" },
        { type: "box", id: "ceiling", from: [0, ceiling, 0], to: [11, ceiling, 11], block: "minecraft:stone" },
        { type: "device", id: "goal-lamp", at: [5, lampY, 5], block: "agentcraft:status_lamp[status=idle]", binding: "goal:atrium", over: ["floor"] },
      ],
    });
  const about = (problems: { where: string }[]) => problems.filter((p) => p.where === "goal-lamp");

  it("is reported when a ceiling cuts through it", () => {
    expect(about(checkDesign(room(7, 3)))).toHaveLength(1); // lamp on the floor, ceiling 4 above
  });

  it("is fine with the lamp sunk into the floor, or under a high ceiling", () => {
    expect(about(checkDesign(room(7, 2)))).toHaveLength(0);
    expect(about(checkDesign(room(10, 3)))).toHaveLength(0);
  });
});
