import { describe, expect, it } from "vitest";
import { checkDesign, type DesignProblem } from "../src/check.js";
import { parseDesign, type PartInput } from "../src/design.js";
import { renderDesign } from "../src/render.js";
import { PlayerWalk, shapes } from "../src/player.js";

/** A stone floor at layer 2, the spawn at (2, 2) on it, and a place to walk to at `to` (feet layer). */
const room = (parts: PartInput[], to: [number, number, number], walk = true) =>
  parseDesign({
    name: "walk", version: 1, size: [16, 12, 16], floorY: 2, shell: { kind: "none" },
    ...(walk ? { walk: { to: [{ name: "goal", at: to }] } } : {}),
    parts: [
      { type: "box", id: "floor", from: [0, 2, 0], to: [15, 2, 15], block: "minecraft:stone" },
      { type: "spot", id: "spawn", anchor: "spawn", at: [2, 2], look: "south" },
      ...parts,
    ],
  });
const walkProblems = (parts: PartInput[], to: [number, number, number]) =>
  checkDesign(room(parts, to)).filter((p) => /a player/.test(p.message));

/** A platform of stone from x 6 to 9, its top at layer `top`, along z 0 to 15. */
const platform = (top: number): PartInput => ({ type: "box", id: "platform", from: [6, 3, 0], to: [9, top, 15], block: "minecraft:stone", over: [] });
const stair = (id: string, x: number, y: number, z: number, facing: string, over: string[] = []): PartInput =>
  ({ type: "box", id, from: [x, y, z], to: [x, y, z], block: `minecraft:oak_stairs[facing=${facing},half=bottom]`, over });

describe("walking as a player", () => {
  it("walks across a level floor", () => {
    expect(walkProblems([], [12, 3, 12])).toEqual([]);
  });

  it("cannot step up a whole block without jumping, though an agent can", () => {
    const found = walkProblems([platform(3)], [8, 4, 8]);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/cannot walk from the spawn to 8, 4, 8 without jumping; the walk gets closest at 5, 3, \d+/);
    expect(checkDesign(room([platform(3)], [8, 4, 8])).filter((p) => /cannot be reached/.test(p.message))).toEqual([]);
  });

  it("climbs a stair up the step, but not over its tall back", () => {
    expect(walkProblems([platform(3), stair("step", 5, 3, 8, "east")], [8, 4, 8])).toEqual([]);
    expect(walkProblems([platform(3), stair("step", 5, 3, 8, "west")], [8, 4, 8])).toHaveLength(1);
  });

  it("finds a flight that ends a block short of the floor above (the step is missing at the top)", () => {
    const short = [platform(4), stair("s1", 4, 3, 8, "east")]; // one stair, then a full block up to the platform
    expect(walkProblems(short, [8, 5, 8])).toHaveLength(1);
    const flush = [platform(4), stair("s1", 4, 3, 8, "east"), stair("s2", 5, 4, 8, "east"), { type: "box", id: "s2-under", from: [5, 3, 8], to: [5, 3, 8], block: "minecraft:stone" } as PartInput];
    expect(walkProblems(flush, [8, 5, 8])).toEqual([]);
  });

  it("can drop down a block, but reports a place it cannot walk back from", () => {
    // A sunken yard a block down: its floor at layer 1, the main floor cut away over it.
    const sunk: PartInput[] = [
      { type: "box", id: "yard", from: [10, 1, 0], to: [15, 1, 15], block: "minecraft:stone" },
      { type: "box", id: "cut", from: [10, 2, 0], to: [15, 2, 15], block: "minecraft:air" },
    ];
    const found = walkProblems(sunk, [12, 2, 12]);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/can walk from the spawn to 12, 2, 12 but not back without jumping/);
    // A slab as a step out of it puts that right.
    expect(walkProblems([...sunk, { type: "box", id: "step", from: [10, 2, 8], to: [10, 2, 8], block: "minecraft:stone_slab[type=bottom]" }], [12, 2, 12])).toEqual([]);
  });

  it("climbs ladders, opens doors, and stops at fences", () => {
    const ladder = [platform(5), ...[3, 4, 5].map((y) => ({ type: "box", id: `rung-${y}`, from: [5, y, 8], to: [5, y, 8], block: "minecraft:ladder[facing=west]" }) as PartInput)];
    expect(walkProblems(ladder, [8, 6, 8])).toEqual([]);
    const wall = (block: string): PartInput[] => [{ type: "box", id: "wall", from: [6, 3, 0], to: [6, 4, 15], block: "minecraft:stone" },
      { type: "box", id: "gap", from: [6, 3, 8], to: [6, 4, 8], block, over: ["wall"] }];
    expect(walkProblems(wall("minecraft:air"), [12, 3, 12])).toEqual([]);
    expect(walkProblems(wall("minecraft:oak_door[facing=east,half=lower]"), [12, 3, 12])).toEqual([]);
    expect(walkProblems(wall("minecraft:oak_fence"), [12, 3, 12])).toHaveLength(1);
  });

  it("is a warning, not a problem, for designs saved before the check", () => {
    const old = room([platform(3)], [8, 4, 8], false);
    expect(checkDesign(old).filter((p) => /a player/.test(p.message))).toEqual([]);
    const warnings: DesignProblem[] = [];
    checkDesign(old, warnings);
    expect(warnings.filter((w) => /a player/.test(w.message))).toEqual([]); // only agent spots are walked to then: none here
  });

  it("knows the shapes of blocks: the tall half of a stair is the way up, bars are a thin post", () => {
    const [base, tall] = shapes("minecraft:oak_stairs[facing=east,half=bottom]");
    expect(base).toMatchObject({ x0: 0, x1: 1, lo: 0, hi: 0.5 });
    expect(tall).toMatchObject({ x0: 0.5, x1: 1, lo: 0.5, hi: 1 });
    expect(shapes("minecraft:iron_bars[east=false,north=false,south=false,west=false]")).toEqual([{ x0: 0.4375, z0: 0.4375, x1: 0.5625, z1: 0.5625, lo: 0, hi: 1, standable: false }]);
    expect(shapes("minecraft:iron_bars[east=true,north=false,south=false,west=false]")).toHaveLength(2);
    expect(shapes("minecraft:potted_fern")[0]!.hi).toBe(0.375);
    expect(shapes("minecraft:water")[0]!.standable).toBe(false);
  });

  it("puts a player down on what is under them, and not under a beam at head height", () => {
    const { volume } = renderDesign(room([{ type: "box", id: "beam", from: [4, 4, 4], to: [4, 4, 4], block: "minecraft:stone" },
      { type: "box", id: "seat", from: [6, 3, 6], to: [6, 3, 6], block: "minecraft:oak_slab[type=bottom]" }], [3, 3, 3]), { origin: [0, 0, 0] });
    const walk = new PlayerWalk(volume, [0, 0, 15, 15]);
    expect(walk.standAt(4, 3, 4)).toBeUndefined();
    expect(walk.standAt(3, 3, 3)?.f).toBe(3);
    expect(walk.standAt(6, 3, 6)?.f).toBe(3.5);
  });
});

describe("guarded drops", () => {
  const drops = (parts: PartInput[]) => checkDesign(room(parts, [8, 7, 8])).filter((p) => p.where === "drop");
  /** A walkway of planks at layer 6 over open space, reached by a ladder. */
  const walkway: PartInput[] = [
    { type: "box", id: "walkway", from: [6, 6, 6], to: [10, 6, 10], block: "minecraft:spruce_planks" },
    ...[3, 4, 5, 6].map((y) => ({ type: "box", id: `rung-${y}`, from: [5, y, 8], to: [5, y, 8], block: "minecraft:ladder[facing=west]" }) as PartInput),
  ];
  /** A railing of `block` (fences or bars) over the cells given, each joined to its neighbours in the railing. */
  const railing = (id: string, cells: [number, number][], block: string, y = 7): PartInput[] => {
    const has = (x: number, z: number) => cells.some(([a, b]) => a === x && b === z);
    return cells.map(([x, z]) => ({
      type: "box", id: `${id}-${x}-${z}`, from: [x, y, z], to: [x, y, z],
      block: `${block}[east=${has(x + 1, z)},north=${has(x, z - 1)},south=${has(x, z + 1)},west=${has(x - 1, z)}]`,
    }) as PartInput);
  };
  /** The edge of the walkway, all round. */
  const ring: [number, number][] = [];
  for (let x = 6; x <= 10; x++) for (let z = 6; z <= 10; z++) if (x === 6 || x === 10 || z === 6 || z === 10) ring.push([x, z]);

  it("reports a built floor with a fall off its edge, once per stretch", () => {
    const found = drops(walkway);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/an unguarded drop \(4 blocks\) beside .* more blocks along the edge: add a railing or a wall/);
  });

  it("is satisfied by a railing, leaving the way in open", () => {
    expect(drops([...walkway, ...railing("rail", ring, "minecraft:oak_fence")])).toEqual([]);
    // The gap at the ladder head is the way in, not an edge: stepping into it puts a player on the ladder.
    const open = ring.filter(([x, z]) => !(x === 6 && z === 8));
    expect(checkDesign(room([...walkway, ...railing("rail", open, "minecraft:oak_fence")], [8, 7, 8])).filter((p) => p.where === "drop" || /a player/.test(p.message))).toEqual([]);
  });

  it("finds the gaps in a railing whose posts are not joined", () => {
    const posts = ring.map(([x, z]) => ({ type: "box", id: `post-${x}-${z}`, from: [x, 7, z], to: [x, 7, z], block: "minecraft:oak_fence" }) as PartInput);
    expect(drops([...walkway, ...posts]).length).toBeGreaterThan(0);
  });

  it("counts a fall into water, or past a ladder, as safe, and leaves natural ground alone", () => {
    const pool: PartInput[] = [{ type: "box", id: "pool", from: [0, 3, 0], to: [15, 3, 15], block: "minecraft:water" }];
    expect(drops([...walkway, ...pool])).toEqual([]);
    const hill = parseDesign({
      name: "hill", version: 1, size: [24, 20, 24], floorY: 10, shell: { kind: "none" }, walk: { to: [] },
      parts: [
        { type: "terrain", id: "ground", x: [0, 23], z: [0, 23], grid: [[10, 10], [2, 2]], surface: "minecraft:grass_block", rock: "minecraft:stone", base: "minecraft:stone" },
        { type: "spot", id: "spawn", anchor: "spawn", at: [4, 2], look: "south" },
      ],
    });
    expect(checkDesign(hill).filter((p) => p.where === "drop")).toEqual([]);
  });

  it("finds the gap where a railing of bars only meets at a corner", () => {
    // The walkway's railing with its north-east corner cut, so the bars there step diagonally and touch only at corners.
    const stepped = ring.filter(([x, z]) => !(x === 10 && z === 6));
    expect(drops([...walkway, ...railing("bar", stepped, "minecraft:iron_bars")]).length).toBeGreaterThan(0);
    expect(drops([...walkway, ...railing("bar", ring, "minecraft:iron_bars")])).toEqual([]);
  });
});
