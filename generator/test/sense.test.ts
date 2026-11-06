import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { parseDesign, type PartInput } from "../src/design.js";

/** A grass yard (natural ground) with a stone house in it (walls at x 10 and 14, z 4 to 10), the spawn at (3, 3). */
const yard = (parts: PartInput[]) =>
  parseDesign({
    name: "yard", size: [20, 10, 16], floorY: 2, shell: { kind: "none" }, walk: { to: [{ name: "corner", at: [18, 3, 14] }] },
    parts: [
      { type: "terrain", id: "ground", x: [0, 19], z: [0, 15], grid: [[2, 2], [2, 2]], surface: "minecraft:grass_block", rock: "minecraft:stone", base: "minecraft:stone" },
      { type: "spot", id: "spawn", anchor: "spawn", at: [3, 3], look: "south" },
      { type: "box", id: "house", from: [10, 3, 4], to: [14, 5, 10], block: "minecraft:stone_bricks" },
      { type: "box", id: "inside", from: [11, 3, 5], to: [13, 5, 9], block: "minecraft:air" },
      ...parts,
    ],
  });
const sense = (parts: PartInput[]) =>
  checkDesign(yard(parts)).filter((p) => !/missing required|a player/.test(p.message)).map((p) => `${p.where}: ${p.message}`);
/** A gravel path along z = 7 from x 2 to x 9, ending at the house's west wall. */
const path: PartInput = { type: "box", id: "path", from: [2, 2, 7], to: [9, 2, 7], block: "minecraft:gravel", over: ["ground"] };
const door = (x: number): PartInput[] => [
  { type: "box", id: "door", from: [x, 3, 7], to: [x, 3, 7], block: "minecraft:oak_door[facing=east,half=lower,hinge=left,open=false]", over: ["house"] },
  { type: "box", id: "door-top", from: [x, 4, 7], to: [x, 4, 7], block: "minecraft:oak_door[facing=east,half=upper,hinge=left,open=false]", over: ["house"] },
];

describe("what makes sense to a person", () => {
  it("finds a path that runs into a blank wall, and one that ends in the open", () => {
    const found = sense([path]);
    expect(found).toContain("path: the path runs into a wall at 10, 3, 7: give the wall a door or a gate there, or end the path before it");
    expect(found).toContain("path: the path ends in the open at 2, 3, 7: lead it to a door, a gate or a jetty, or end it at something (a bench, a well)");
  });

  it("is content with a path from a bench to a door", () => {
    const bench: PartInput = { type: "box", id: "bench", from: [1, 3, 7], to: [1, 3, 7], block: "minecraft:oak_stairs[facing=west,half=bottom]" };
    expect(sense([path, ...door(10), bench])).toEqual([]);
  });

  it("is content with a path that meets another path", () => {
    const street: PartInput = { type: "box", id: "street", from: [0, 2, 1], to: [0, 2, 14], block: "minecraft:gravel", over: ["ground"] };
    const lane: PartInput = { ...path, from: [2, 2, 7] };
    const found = sense([street, lane, ...door(10)]);
    expect(found.filter((m) => m.startsWith("path:"))).toEqual([]);
  });

  it("finds a door that opens onto nowhere", () => {
    const sealed: PartInput = { type: "box", id: "sealed", from: [11, 3, 5], to: [13, 5, 9], block: "minecraft:stone_bricks", over: ["house"] };
    expect(sense([...door(10), sealed])).toContain("door: the door at 10, 3, 7 opens onto 11, 3, 7, where no one can stand or walk to");
  });

  it("finds what floats or hangs from nothing", () => {
    const found = sense([
      { type: "box", id: "slab", from: [5, 6, 12], to: [5, 6, 12], block: "minecraft:oak_slab[type=top]" },
      { type: "box", id: "lamp", from: [3, 5, 12], to: [3, 5, 12], block: "minecraft:lantern[hanging=true]" },
      { type: "box", id: "light", from: [7, 5, 12], to: [7, 5, 12], block: "minecraft:sea_lantern" },
    ]);
    expect(found).toContain("floating: minecraft:oak_slab at 5, 6, 12 floats, touching nothing");
    expect(found).toContain("support: minecraft:lantern at 3, 5, 12 hangs from nothing");
    expect(found.some((m) => m.includes("sea_lantern at 7, 5, 12") && m.includes("hangs"))).toBe(false); // a sea lantern is a block, not a lantern
  });

  /** The house with a plank floor, a door in its west wall, and whatever else a test adds. */
  const home = (parts: PartInput[]) => sense([
    { type: "box", id: "floor", from: [11, 2, 5], to: [13, 2, 9], block: "minecraft:spruce_planks" },
    { type: "box", id: "roof", from: [10, 6, 4], to: [14, 6, 10], block: "minecraft:stone_bricks" },
    ...door(10), ...parts,
  ]);
  const lamp: PartInput = { type: "box", id: "lamp", from: [12, 5, 7], to: [12, 5, 7], block: "minecraft:lantern[hanging=true]" };

  it("finds a room with no lamp, where mobs can spawn", () => {
    expect(home([]).some((m) => m.startsWith("dark: it is dark (block light 0)"))).toBe(true);
    expect(home([lamp]).filter((m) => m.startsWith("dark:"))).toEqual([]);
  });

  it("counts glow berries as light, but not bare cave vines", () => {
    const vine = (berries: boolean): PartInput => ({ type: "box", id: "vine", from: [12, 5, 7], to: [12, 5, 7], block: `minecraft:cave_vines[age=0,berries=${berries}]` });
    expect(home([vine(true)]).filter((m) => m.startsWith("dark:"))).toEqual([]);
    expect(home([vine(false)]).some((m) => m.startsWith("dark:"))).toBe(true);
  });

  it("finds a seat that faces a blank wall, but not one that faces the room", () => {
    const chair = (facing: string): PartInput => ({ type: "box", id: "chair", from: [13, 3, 7], to: [13, 3, 7], block: `minecraft:oak_stairs[facing=${facing},half=bottom]` });
    expect(home([lamp, chair("west")])).toContain("seat: the seat at 13, 3, 7 faces a blank wall: turn it to a table, a fire, a window or the view");
    expect(home([lamp, chair("east")]).filter((m) => m.startsWith("seat:"))).toEqual([]);
  });

  it("finds a window with a block right against it", () => {
    const window: PartInput = { type: "box", id: "window", from: [14, 4, 7], to: [14, 4, 7], block: "minecraft:glass", over: ["house"] };
    const shelf: PartInput = { type: "box", id: "shelf", from: [13, 4, 6], to: [13, 4, 8], block: "minecraft:bookshelf" };
    expect(home([lamp, window, shelf]).some((m) => m.startsWith("window: the window at 14, 4, 7"))).toBe(true);
    expect(home([lamp, window]).filter((m) => m.startsWith("window:"))).toEqual([]);
  });

  it("finds stairs whose head runs into something", () => {
    // Two steps up the east wall of the yard to a platform: the platform's top is blocked by a post.
    const flight: PartInput[] = [
      { type: "box", id: "step-1", from: [5, 3, 12], to: [5, 3, 12], block: "minecraft:oak_stairs[facing=east,half=bottom]" },
      { type: "box", id: "step-2", from: [6, 4, 12], to: [6, 4, 12], block: "minecraft:oak_stairs[facing=east,half=bottom]" },
      { type: "box", id: "under", from: [6, 3, 12], to: [6, 3, 12], block: "minecraft:oak_planks" },
      { type: "box", id: "deck", from: [7, 3, 11], to: [9, 4, 13], block: "minecraft:oak_planks" },
    ];
    expect(sense(flight).filter((m) => m.startsWith("stairs:"))).toEqual([]);
    const post: PartInput = { type: "box", id: "post", from: [7, 5, 12], to: [7, 5, 12], block: "minecraft:oak_log" };
    expect(sense([...flight, post]).some((m) => m.startsWith("stairs: the stairs at 6, 4, 12 arrive at minecraft:oak_log"))).toBe(true);
  });

  it("finds a floor standing over a gap above the ground", () => {
    // A deck a block above the grass, up two steps.
    const deck: PartInput[] = [
      { type: "box", id: "deck", from: [4, 4, 11], to: [8, 4, 14], block: "minecraft:oak_planks" },
      { type: "box", id: "step-1", from: [2, 3, 12], to: [2, 3, 12], block: "minecraft:oak_stairs[facing=east,half=bottom]" },
      { type: "box", id: "step-base", from: [3, 3, 12], to: [3, 3, 12], block: "minecraft:oak_planks" },
      { type: "box", id: "step-2", from: [3, 4, 12], to: [3, 4, 12], block: "minecraft:oak_stairs[facing=east,half=bottom]" },
    ];
    expect(sense(deck).some((m) => m.startsWith("ground: the floor at"))).toBe(true);
  });
});
