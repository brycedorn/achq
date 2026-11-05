import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { parseDesign, type PartInput } from "../src/design.js";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

/** Flat grass at layer 2 over a `size` volume, with the given parts on it. */
const flat = (size: [number, number, number], parts: PartInput[], walk: { name: string; at: [number, number, number] }[] = [], trails: { points: [number, number][]; width: number; margin: number; surface: string }[] = []) =>
  parseDesign({
    name: "t", size, floorY: 2, shell: { kind: "none" }, walk: { to: walk },
    parts: [{ type: "terrain", id: "ground", x: [0, size[0] - 1], z: [0, size[2] - 1], grid: [[2, 2], [2, 2]], trails, surface: "minecraft:grass_block", rock: "minecraft:stone", base: "minecraft:stone" }, ...parts],
  });
/** The step towards the block a vine or a cocoa pod hangs on, from the side named in its state. */
const toward = (state: string, prop: RegExp): [number, number] => {
  const side = prop.exec(state)?.[1];
  return side === "east" ? [1, 0] : side === "west" ? [-1, 0] : side === "north" ? [0, -1] : side === "south" ? [0, 1] : [0, 0];
};
const render = (size: [number, number, number], parts: PartInput[]) => renderDesign(flat(size, parts), { origin: [0, 0, 0] }).volume;
const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

describe("bridge", () => {
  const ends: PartInput[] = [
    { type: "box", id: "west", from: [0, 10, 0], to: [3, 10, 5], block: "minecraft:oak_planks" },
    { type: "box", id: "east", from: [16, 10, 0], to: [19, 10, 5], block: "minecraft:oak_planks" },
    { type: "box", id: "west-rail", from: [3, 11, 0], to: [3, 11, 5], block: "minecraft:oak_fence[east=false,north=true,south=true,waterlogged=false,west=false]" },
  ];
  const bridge: PartInput = { type: "bridge", id: "bridge", from: [4, 10, 2], to: [15, 10, 2], width: 2, sag: 2, deck: "minecraft:bamboo_planks", steps: "minecraft:bamboo_stairs", rail: "minecraft:bamboo_fence" };
  const v = render([20, 16, 6], [...ends, bridge]);
  const deckAt = (x: number) => [...Array(16).keys()].find((y) => v.get(x, y, 2) === "minecraft:bamboo_planks");

  it("sags in the middle and climbs every rise with a stair facing up it", () => {
    const layers = [...Array(12).keys()].map((i) => deckAt(4 + i)!);
    expect(layers[0]).toBe(10);
    expect(layers[11]).toBe(10);
    expect(Math.min(...layers)).toBe(8);
    layers.forEach((y, i) => {
      const up = layers[i + 1] === y + 1 ? "east" : layers[i - 1] === y + 1 ? "west" : undefined;
      for (const z of [2, 3]) expect(v.get(4 + i, y + 1, z)).toBe(up ? `minecraft:bamboo_stairs[facing=${up},half=bottom]` : "minecraft:air");
    });
  });

  it("runs joined rails along both sides, opens the railing it meets and joins the fence left beside the gap", () => {
    expect(v.get(9, deckAt(9)! + 1, 1)).toMatch(/bamboo_fence\[east=true,.*west=true\]/);
    expect(v.get(9, deckAt(9)! + 1, 4)).toMatch(/bamboo_fence\[east=true,.*west=true\]/);
    expect(v.get(3, 11, 2)).toBe("minecraft:air");
    expect(v.get(3, 11, 3)).toBe("minecraft:air");
    expect(v.get(3, 11, 1)).toBe("minecraft:oak_fence[east=true,north=true,south=false,waterlogged=false,west=false]");
  });

  it("refuses to run on a diagonal", () => {
    const diagonal: PartInput = { type: "bridge", id: "bridge", from: [4, 10, 2], to: [15, 10, 4], deck: "minecraft:bamboo_planks", steps: "minecraft:bamboo_stairs", rail: "minecraft:bamboo_fence" };
    expect(() => render([20, 16, 6], [diagonal])).toThrow(/along X or along Z/);
  });
});

describe("spiral stair", () => {
  // A floor at layer 20 over the whole area, with the stair cut down through it to the ground.
  const parts: PartInput[] = [
    { type: "box", id: "floor", from: [0, 20, 0], to: [20, 20, 20], block: "minecraft:oak_planks" },
    { type: "spot", id: "spawn", anchor: "spawn", at: [2, 2], look: "south", floor: 20 },
    { type: "spiral", id: "stair", center: [10, 10], inner: 3, width: 2, top: 20, bottom: 2, start: "north", steps: "minecraft:oak_stairs", landing: "minecraft:spruce_planks",
      rail: "minecraft:oak_fence", core: "minecraft:oak_wood", stringer: "minecraft:oak_planks", lamp: "minecraft:lantern", over: ["floor"] },
  ];
  const v = render([21, 26, 21], parts);

  it("goes down a block a step along each side, round flat corner landings, to the ground", () => {
    for (let j = 0; j < 5; j++) for (const z of [6, 7]) expect(v.get(8 + j, 20 - j, z)).toBe("minecraft:oak_stairs[facing=west,half=bottom]");
    for (const [x, z] of [[13, 6], [14, 7]]) expect(v.get(x!, 15, z!)).toBe("minecraft:spruce_planks");
    expect(v.get(15, 17, 5)).toBe("minecraft:lantern");
    for (let j = 0; j < 5; j++) expect(v.get(13, 15 - j, 8 + j)).toBe("minecraft:oak_stairs[facing=north,half=bottom]");
    // A player walks down it from the floor to the ground.
    const problems = checkDesign(flat([21, 26, 21], parts, [{ name: "foot", at: [6, 3, 6] }])).map((p) => p.message);
    expect(problems.filter((m) => /a player|unguarded|dark/.test(m))).toEqual([]);
  });

  it("cuts the floor open over the top steps and rails the opening only where the drop would hurt", () => {
    for (let x = 9; x <= 11; x++) expect(v.get(x, 20, 6)).toBe("minecraft:air");
    expect(v.get(12, 21, 6)).toMatch(/oak_fence/); // beside the third step, 3.5 down
    expect(v.get(10, 21, 5)).toBe("minecraft:air"); // beside the second, 2.5 down
  });
});

describe("rainforest trees", () => {
  const floor: PartInput = { type: "box", id: "floor", from: [10, 15, 10], to: [30, 15, 30], block: "minecraft:oak_planks" };
  const giant: PartInput = {
    type: "trees", id: "giant", on: "ground", style: "giant", at: [[20, 20]], trunk: "minecraft:jungle_log", leaves: "minecraft:jungle_leaves[persistent=true]",
    minHeight: 30, maxHeight: 30, girth: 2.5, vines: { amount: 0.5, length: 4 }, cocoa: 0.3, clear: [[10, 16, 10, 30, 22, 30]], over: ["floor"],
  };
  const v = render([41, 40, 41], [floor, giant]);
  const all = (test: (s: string) => boolean) => {
    const out: [number, number, number][] = [];
    for (let y = 0; y < v.height; y++) for (let z = 0; z < v.length; z++) for (let x = 0; x < v.width; x++) if (test(v.get(x, y, z))) out.push([x, y, z]);
    return out;
  };
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= v.width || y >= v.height || z >= v.length ? "minecraft:air" : v.get(x, y, z));

  it("passes its trunk through a floor but keeps leaves, limbs and vines out of the clear box", () => {
    expect(v.get(20, 15, 20)).toBe("minecraft:jungle_log");
    expect(v.get(23, 15, 20)).toBe("minecraft:oak_planks");
    const trunk = (x: number, z: number) => (x - 20) ** 2 + (z - 20) ** 2 <= 2.5 * 2.5 + 2.5;
    const inClear = all((s) => s !== "minecraft:air").filter(([x, y, z]) => y >= 16 && y <= 22 && x >= 10 && x <= 30 && z >= 10 && z <= 30 && !trunk(x, z));
    expect(inClear).toEqual([]);
  });

  it("joins every log face to face to another log or the ground, and hangs every vine from a leaf or a vine", () => {
    const logs = all((s) => s.startsWith("minecraft:jungle_log"));
    expect(logs.length).toBeGreaterThan(200);
    for (const [x, y, z] of logs) expect([x, y, z, SIX.some(([a, b, c]) => /jungle_log|grass_block|stone|oak_planks/.test(at(x + a, y + b, z + c)))]).toEqual([x, y, z, true]);
    const vines = all((s) => s.startsWith("minecraft:vine"));
    expect(vines.length).toBeGreaterThan(0);
    for (const [x, y, z] of vines) {
      const [dx, dz] = toward(v.get(x, y, z), /(east|west|north|south)=true/);
      expect(/leaves/.test(at(x + dx, y, z + dz)) || /vine/.test(at(x, y + 1, z))).toBe(true);
    }
    for (const [x, y, z] of all((s) => s.startsWith("minecraft:cocoa"))) {
      const [dx, dz] = toward(v.get(x, y, z), /facing=(\w+)/);
      expect(at(x + dx, y, z + dz)).toMatch(/jungle_log/);
    }
  });
});

describe("plants", () => {
  it("grow two-block plants whole and keep off paths", () => {
    const parts: PartInput[] = [
      { type: "plants", id: "plants", on: "ground", x: [0, 29], z: [0, 29], density: 1, kinds: [{ block: "minecraft:large_fern", weight: 1, form: "double" }, { block: "minecraft:bamboo", weight: 1, form: "stalk", height: [3, 5], top: "minecraft:bamboo[leaves=large]" }] },
    ];
    const d = flat([30, 12, 30], parts, [], [{ points: [[0, 15], [29, 15]], width: 2, margin: 0, surface: "minecraft:coarse_dirt" }]);
    const v = renderDesign(d, { origin: [0, 0, 0] }).volume;
    let ferns = 0;
    for (let z = 0; z < 30; z++)
      for (let x = 0; x < 30; x++) {
        const s = v.get(x, 3, z);
        if (s === "minecraft:large_fern[half=lower]") {
          ferns++;
          expect(v.get(x, 4, z)).toBe("minecraft:large_fern[half=upper]");
        }
        if (s.startsWith("minecraft:bamboo")) {
          let y = 3;
          while (v.get(x, y + 1, z).startsWith("minecraft:bamboo")) y++;
          expect(v.get(x, y, z)).toBe("minecraft:bamboo[leaves=large]");
        }
      }
    expect(ferns).toBeGreaterThan(100);
    for (let x = 0; x < 30; x++) expect(v.get(x, 3, 15)).toBe("minecraft:air");
  });
});

describe("a trail under a deck", () => {
  it("is judged where it ends on the ground, not on the deck over it", () => {
    const parts: PartInput[] = [
      { type: "spot", id: "spawn", anchor: "spawn", at: [2, 2], look: "south" },
      { type: "box", id: "bench-1", from: [1, 3, 10], to: [1, 3, 10], block: "minecraft:oak_stairs[facing=west,half=bottom]" },
      { type: "box", id: "bench-2", from: [20, 3, 10], to: [20, 3, 10], block: "minecraft:oak_stairs[facing=east,half=bottom]" },
      { type: "box", id: "deck", from: [14, 9, 6], to: [19, 9, 14], block: "minecraft:oak_planks" },
    ];
    const d = flat([22, 14, 20], parts, [], [{ points: [[2, 10], [19, 10]], width: 1, margin: 0, surface: "minecraft:coarse_dirt" }]);
    expect(checkDesign(d).filter((p) => p.where.includes("trail"))).toEqual([]);
  });
});

describe("jungle treehouse", () => {
  // Every check (and so the walk there and back) is in designs.test.ts.
  it("is walked as a player down the stair and the trail to the river", () => {
    expect(loadDesign("jungle-treehouse").walk?.to.map((t) => t.name)).toEqual(["stair foot", "landing"]);
  });
});
