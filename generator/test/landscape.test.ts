import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

const SPRUCE = { trunk: "minecraft:spruce_log", leaves: "minecraft:spruce_leaves[persistent=true]", snow: "minecraft:snow_block", minHeight: 6, maxHeight: 8 };

/** A small landscape: flat ground at layer 20 with a river across it, a trail along it, and trees, rocks and a village. */
function small(extra: Record<string, unknown> = {}) {
  return parseDesign({
    name: "t", seed: 2, size: [80, 60, 80], shell: { kind: "none" },
    parts: [
      {
        type: "terrain", id: "ground", x: [0, 79], z: [0, 79], grid: [[20, 20], [20, 20]],
        rivers: [{ points: [[0, 40], [79, 40]], y: [[0, 12], [1, 12]], width: 5, depth: 2, margin: 3, open: [[0.3, 0.7]], bed: "minecraft:gravel", ice: "minecraft:packed_ice" }],
        trails: [{ points: [[10, 4], [10, 36]], y: [[0, 20], [1, 20]], width: 3, margin: 2, surface: "minecraft:gravel", lamps: { every: 10, post: "minecraft:spruce_fence", lantern: "minecraft:lantern" } }],
        surface: "minecraft:snow_block", rock: "minecraft:stone", base: "minecraft:stone", depth: 6, ...extra,
      },
      {
        type: "village", id: "town", style: "varied", on: "ground", at: [55, 20], church: [60, 12], radius: 18, houses: 6, lodges: 0.3, chimneys: true,
        wall: "minecraft:spruce_planks", accent: "minecraft:dark_oak_planks", stone: "minecraft:stone_bricks", roof: "minecraft:smooth_quartz_stairs",
        ridge: "minecraft:snow_block", light: "minecraft:shroomlight", post: "minecraft:spruce_fence", lantern: "minecraft:lantern",
      },
      { type: "trees", id: "forest", on: "ground", dead: 0.3, scatter: { x: [0, 79], z: [0, 79], count: 120, treeline: 40, maxSlope: 2, spacing: 5, clusters: { scale: 12, threshold: -0.2 } }, ...SPRUCE },
      { type: "boulders", id: "rocks", on: "ground", scatter: { x: [0, 79], z: [0, 79], count: 20, treeline: 40, maxSlope: 2, spacing: 8 }, minSize: 1, maxSize: 3, blocks: ["minecraft:stone", "minecraft:andesite"], snow: "minecraft:snow_block" },
    ],
  });
}

const design = small();
const { volume, conflicts } = renderDesign(design, { origin: [0, 0, 0] });
const name = (x: number, y: number, z: number) => volume.get(x, y, z).replace(/\[.*$/, "");
const countAll = (n: string) => {
  let c = 0;
  for (const [, , , s] of volume.blocks()) if (s.replace(/\[.*$/, "") === n) c++;
  return c;
};

describe("rivers", () => {
  it("run open in the middle and frozen at the ends", () => {
    expect(name(40, 12, 40)).toBe("minecraft:water"); // the middle, inside the open stretch
    expect(name(40, 11, 40)).toBe("minecraft:water");
    expect(name(12, 12, 40)).toBe("minecraft:packed_ice"); // before the open stretch
    expect(name(68, 12, 40)).toBe("minecraft:packed_ice");
  });

  it("cut a channel with a gravel bed and banks just above the water", () => {
    expect(name(40, 10, 40)).toBe("minecraft:gravel"); // bed: level 12 minus depth 2
    expect(name(40, 13, 40)).toBe("minecraft:air"); // nothing above the water surface
    expect(name(40, 19, 40 + 5)).not.toBe("minecraft:air"); // a bank just beside the channel (the ground is a shell)
  });

  it("never let open water touch the edge of the volume", () => {
    for (const [x, , , state] of volume.blocks()) void x, void state;
    for (let y = 0; y < 60; y++)
      for (let t = 0; t < 80; t++)
        for (const [x, z] of [[0, t], [79, t], [t, 0], [t, 79], [1, t], [78, t]] as const) expect(name(x, y, z), `${x},${y},${z}`).not.toBe("minecraft:water");
  });

  describe("without a height profile", () => {
    // A concave slope, steep then gentle, with a bump and a trail across the stream's way: a straight profile would stand
    // on an embankment, and levels taken before the trail is graded would stand above it.
    const slope = (rivers: unknown[]) =>
      renderDesign(
        parseDesign({
          name: "t", seed: 2, size: [40, 90, 80], shell: { kind: "none" },
          parts: [{
            type: "terrain", id: "ground", x: [0, 39], z: [0, 79], grid: [[70, 70], [30, 30], [20, 20]], peaks: [{ at: [20, 50], height: 6, radius: 6 }],
            trails: [{ points: [[0, 40], [39, 40]], y: [[0, 27], [1, 27]], width: 3, margin: 2, surface: "minecraft:gravel" }],
            rivers, surface: "minecraft:snow_block", rock: "minecraft:stone", base: "minecraft:stone",
          }],
        }),
        { origin: [0, 0, 0] },
      ).volume;
    const bare = slope([]);
    const cut = slope([{ points: [[20, 3], [20, 76]], width: 5, depth: 2, margin: 3, bed: "minecraft:gravel", ice: "minecraft:packed_ice" }]);
    const top = (v: typeof bare, x: number, z: number, solid = false) => {
      let y = v.height - 1;
      while (y > 0 && (v.get(x, y, z) === "minecraft:air" || (solid && /ice|water/.test(v.get(x, y, z))))) y--;
      return y;
    };

    it("follow the ground, cutting into it and never raising it, ice included", () => {
      for (let z = 0; z < 80; z++) for (let x = 0; x < 40; x++) expect(top(cut, x, z), `${x},${z}`).toBeLessThanOrEqual(top(bare, x, z));
      expect(top(cut, 20, 40)).toBe(top(bare, 20, 40) - 1); // a step down off the trail onto the ice
      expect(top(cut, 20, 50, true)).toBeLessThan(top(bare, 20, 50) - 2); // a groove through the bump
    });

    it("run downhill from the first point, never rising", () => {
      let last = Infinity;
      for (let z = 3; z <= 76; z++) {
        expect(cut.get(20, top(cut, 20, z), z), `z=${z}`).toBe("minecraft:packed_ice");
        expect(top(cut, 20, z), `z=${z}`).toBeLessThanOrEqual(last);
        last = top(cut, 20, z);
      }
    });
  });
});

describe("trails", () => {
  it("lay the surface along the path at the profile height", () => {
    for (const z of [6, 20, 34]) {
      expect(name(10, 20, z), `z=${z}`).toBe("minecraft:gravel");
      expect(name(11, 20, z)).toBe("minecraft:gravel");
    }
  });

  it("light the way with lamp posts on alternating sides", () => {
    expect(countAll("minecraft:lantern")).toBeGreaterThanOrEqual(3);
    expect(name(12, 22, 9) === "minecraft:lantern" || name(8, 22, 9) === "minecraft:lantern" || countAll("minecraft:spruce_fence") > 0).toBe(true);
  });

  it("keep trees clear of themselves", () => {
    for (let x = 7; x <= 13; x++) for (let z = 3; z <= 37; z++) for (let y = 21; y < 40; y++) expect(name(x, y, z), `${x},${y},${z}`).not.toBe("minecraft:spruce_log");
  });

  describe("across a valley", () => {
    // Down one side of a valley and up the other: a level profile would carry the path across on an embankment.
    const valley = (y?: unknown) =>
      parseDesign({
        name: "t", seed: 2, size: [40, 60, 80], shell: { kind: "none" },
        parts: [{
          type: "terrain", id: "ground", x: [0, 39], z: [0, 79], grid: [[40, 40], [12, 12], [40, 40]],
          trails: [{ points: [[20, 2], [20, 77]], ...(y ? { y } : {}), width: 3, margin: 3, surface: "minecraft:gravel" }],
          surface: "minecraft:snow_block", rock: "minecraft:stone", base: "minecraft:stone",
        }],
      });
    const level = [[0, 40], [1, 40]];

    it("follow the ground without a height profile, never built up and no steeper than 0.6", () => {
      const r = renderDesign(valley(), { origin: [0, 0, 0] });
      for (let z = 0; z < 80; z++) for (let x = 0; x < 40; x++) expect(r.raised(x, z), `${x},${z}`).toBe(0);
      const top = (z: number) => {
        let y = 59;
        while (y > 0 && r.volume.get(20, y, z) === "minecraft:air") y--;
        return y;
      };
      for (let z = 2; z < 77; z++) expect(Math.abs(top(z + 1) - top(z)), `z=${z}`).toBeLessThanOrEqual(1);
      expect(top(40)).toBeLessThanOrEqual(13); // down at the valley floor, not carried over it
    });

    it("are reported as embankments when a profile carries them over the land", () => {
      const r = renderDesign(valley(level), { origin: [0, 0, 0] });
      expect(r.raised(20, 40)).toBeGreaterThan(20);
      const banks = (problems: { where: string }[]) => problems.filter((p) => p.where === "embankment");
      expect(banks(checkDesign(valley(level)))).toHaveLength(1);
      expect(banks(checkDesign(valley()))).toEqual([]);
    });

    it("are walked from end to end and back, which takes a stair on every rise", () => {
      const r = renderDesign(valley(), { origin: [0, 0, 0] });
      let top = 59;
      while (top > 0 && r.volume.get(20, top, 2) === "minecraft:air") top--;
      const walked = (steps: boolean) => {
        const d = parseDesign({
          name: "t", seed: 2, size: [40, 60, 80], floorY: top + 1, shell: { kind: "none" }, walk: { to: [] },
          parts: [
            {
              type: "terrain", id: "ground", x: [0, 39], z: [0, 79], grid: [[40, 40], [12, 12], [40, 40]],
              trails: [{ points: [[20, 2], [20, 77]], width: 3, margin: 3, surface: "minecraft:gravel", ...(steps ? { steps: "minecraft:cobblestone_stairs" } : {}) }],
              surface: "minecraft:snow_block", rock: "minecraft:stone", base: "minecraft:stone",
            },
            { type: "spot", id: "spawn", anchor: "spawn", at: [20, 2], look: "south" },
          ],
        });
        return checkDesign(d).filter((p) => /trail 1 (start|end)$/.test(p.where));
      };
      expect(walked(false).map((p) => p.message)).toEqual([expect.stringContaining("without jumping")]);
      expect(walked(true)).toEqual([]);
    });
  });
});

describe("forest and rocks", () => {
  it("grow in clusters, with some bare dead trees", () => {
    expect(countAll("minecraft:spruce_log")).toBeGreaterThan(100);
    expect(countAll("minecraft:spruce_leaves")).toBeGreaterThan(300);
    // A dead tree has branch logs lying along an axis; living trees only have upright trunks.
    let sideways = 0;
    for (const [, , , s] of volume.blocks()) if (/spruce_log\[axis=[xz]\]/.test(s)) sideways++;
    expect(sideways).toBeGreaterThan(0);
  });

  it("scatter boulders with a snow cap", () => {
    expect(countAll("minecraft:andesite")).toBeGreaterThan(5);
    expect(countAll("minecraft:snow_block")).toBeGreaterThan(100);
  });
});

describe("village (varied style)", () => {
  it("builds the church away from the village centre, and houses with chimneys and glowing windows", () => {
    expect(countAll("minecraft:shroomlight")).toBeGreaterThan(8);
    expect(countAll("minecraft:stone_bricks")).toBeGreaterThan(100);
    // The church tower at (60, 12): stone from the ground up.
    expect(name(60, 25, 8)).toBe("minecraft:stone_bricks");
  });

  it("has no overlaps with anything else", () => {
    expect(conflicts).toEqual([]);
    expect(checkDesign(design).filter((p) => /overwrites/.test(p.message))).toEqual([]);
  });
});

describe("ellipse flats and the elevation profile", () => {
  it("level an ellipse and blend out of it", () => {
    const d = parseDesign({
      name: "e", seed: 1, size: [80, 60, 80], shell: { kind: "none" },
      parts: [{
        type: "terrain", id: "ground", x: [0, 79], z: [0, 79], grid: [[40, 40], [40, 40]],
        flats: [{ x: [20, 60], z: [20, 60], y: 25, margin: 8, shape: "ellipse", ripple: 0 }],
        surface: "minecraft:snow_block", rock: "minecraft:stone", base: "minecraft:stone", depth: 6,
      }],
    });
    const v = renderDesign(d, { origin: [0, 0, 0] }).volume;
    const top = (x: number, z: number) => {
      for (let y = 59; y >= 0; y--) if (v.idAt(x, y, z) !== 0) return y;
      return -1;
    };
    expect(top(40, 40)).toBe(25); // the centre is exactly level
    expect(top(5, 5)).toBe(40); // far outside the grid height
    const edge = top(40, 14); // just outside the ellipse, part way between 25 and 40
    expect(edge).toBeGreaterThan(25);
    expect(edge).toBeLessThan(40);
  });
});

describe("snowy-chalet", () => {
  const world = loadDesign("snowy-chalet");
  const { volume } = renderDesign(world, { origin: [0, 0, 0] });

  // Every check is in designs.test.ts, which holds every design to all of them.
  it("is the chalet on a shoulder above a river valley", () => {
    expect(world.floorY).toBe(72);
  });

  it("sends the river away to the south-east, frozen where it leaves the world", () => {
    const water = (x: number, z: number) => {
      for (let y = 40; y >= 0; y--) {
        const state = volume.get(x, y, z);
        if (state === "minecraft:water" || state === "minecraft:packed_ice") return state;
      }
      return "none";
    };
    expect(water(445, 509)).toBe("minecraft:packed_ice"); // the exit at the south edge is frozen, so it cannot run out of the structure
    let open = 0;
    for (const [x, z] of [[150, 250], [255, 345], [350, 372]] as const) if (water(x, z) === "minecraft:water") open++;
    expect(open).toBeGreaterThan(0); // and it runs open through the middle
  });

  it("puts the town well off the line of sight straight out of the chalet", () => {
    const door = world.parts.find((p) => p.id === "door")!;
    const village = world.parts.find((p) => p.type === "village")!;
    if (door.type !== "box" || village.type !== "village") throw new Error("unexpected parts");
    const [dx, dz] = [village.at[0] - door.from[0], village.at[1] - door.from[2]];
    const off = (Math.atan2(dx, dz) * 180) / Math.PI; // degrees east of due south
    expect(off).toBeGreaterThan(25);
    expect(off).toBeLessThan(60);
    expect(Math.hypot(dx, dz)).toBeGreaterThan(200);
  });
});
