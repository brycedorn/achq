import { describe, expect, it } from "vitest";
import { checkDesign, type DesignProblem } from "../src/check.js";
import { parseDesign, type PartInput } from "../src/design.js";
import { encodeNbt, byte, compound, float, int, intArray, list, long, str, type Nbt } from "../src/nbt.js";
import { parse, simplify } from "prismarine-nbt";

/** A room with a floor at layer 2, a spawn at (5, 5), and whatever else a test adds. */
const room = (parts: PartInput[]) =>
  parseDesign({
    name: "room", version: 1, size: [12, 12, 12], floorY: 2, shell: { kind: "none" },
    parts: [
      { type: "box", id: "floor", from: [0, 2, 0], to: [11, 2, 11], block: "minecraft:stone" },
      { type: "spot", id: "spawn", anchor: "spawn", at: [5, 5], look: "south" },
      ...parts,
    ],
  });
const spawnWarnings = (parts: PartInput[]) => {
  const warnings: DesignProblem[] = [];
  checkDesign(room(parts), warnings);
  return warnings.filter((w) => w.where === "spawn");
};

describe("the roofed-spawn warning", () => {
  it("warns when a roof would put new players on top of it", () => {
    const found = spawnWarnings([{ type: "box", id: "roof", from: [0, 7, 0], to: [11, 7, 11], block: "minecraft:white_concrete" }]);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/arrive on top of minecraft:white_concrete at y 8/);
  });

  it("is quiet with open sky, or a pane or a bottom slab over the spawn", () => {
    expect(spawnWarnings([])).toHaveLength(0);
    for (const hatch of ["minecraft:glass_pane", "minecraft:smooth_quartz_slab[type=bottom]", "minecraft:iron_bars"])
      expect(
        spawnWarnings([
          { type: "box", id: "roof", from: [0, 7, 0], to: [11, 7, 11], block: "minecraft:white_concrete" },
          { type: "box", id: "hatch", from: [5, 7, 5], to: [5, 7, 5], block: hatch, over: ["roof"] },
        ]),
      ).toHaveLength(0);
  });

  it("treats a top slab or an upside-down stair as a roof", () => {
    for (const lid of ["minecraft:smooth_quartz_slab[type=top]", "minecraft:smooth_quartz_stairs[facing=north,half=top]"])
      expect(spawnWarnings([{ type: "box", id: "lid", from: [5, 7, 5], to: [5, 7, 5], block: lid }])).toHaveLength(1);
  });

  it("is only collected when asked for: plain checks stay as they were", () => {
    expect(checkDesign(room([{ type: "box", id: "roof", from: [0, 7, 0], to: [11, 7, 11], block: "minecraft:white_concrete" }])).filter((p) => p.where === "spawn")).toEqual([]);
  });
});

describe("design problems", () => {
  it("reports a part outside the volume instead of throwing", () => {
    const outside = checkDesign(room([{ type: "box", id: "far", from: [0, 2, 0], to: [20, 2, 0], block: "minecraft:stone", over: ["floor"] }]));
    expect(outside).toHaveLength(1);
    expect(outside[0]!.message).toMatch(/outside the 12 x 12 x 12 volume/);
  });

  it("reports a seat that faces the wrong way for the agent sitting in it", () => {
    const problems = checkDesign(
      room([
        { type: "spot", id: "lounge", anchor: "lounge", at: [3, 8], look: "south" },
        { type: "box", id: "chair", from: [3, 3, 8], to: [3, 3, 8], block: "minecraft:oak_stairs[facing=south,half=bottom]" },
      ]),
    );
    expect(problems.map((p) => p.message).join("\n")).toMatch(/stairs should face north for an agent looking south/);
  });
});

describe("NBT encoding", () => {
  it("writes every tag type so the game's reader gets back what was put in", async () => {
    const root: Nbt = compound({
      b: byte(true),
      s: { t: "short", v: -1234 },
      i: int(70000),
      l: long(2n ** 40n),
      f: float(1.5),
      d: { t: "double", v: Math.PI },
      t: str("snow"),
      ia: intArray([1, -2, 3]),
      la: { t: "longArray", v: new Uint32Array([0, 7, 1, 0]) },
      ls: list("string", [str("a"), str("b")]),
      empty: list("int", []),
      nested: compound({ deep: list("compound", [compound({ x: int(1) })]) }),
    });
    const back = simplify((await parse(encodeNbt(root, "root"))).parsed) as Record<string, unknown>;
    expect(back["b"]).toBe(1);
    expect(back["s"]).toBe(-1234);
    expect(back["i"]).toBe(70000);
    expect(back["f"]).toBe(1.5);
    expect(back["d"]).toBeCloseTo(Math.PI, 12);
    expect(back["t"]).toBe("snow");
    expect(back["ia"]).toEqual([1, -2, 3]);
    expect(back["ls"]).toEqual(["a", "b"]);
    expect(back["empty"]).toEqual([]);
    expect(back["nested"]).toEqual({ deep: [{ x: 1 }] });
    expect(String(back["l"])).toBe(String(2 ** 40));
    expect((back["la"] as unknown[]).length).toBe(2); // two longs from four halves
  });
});
