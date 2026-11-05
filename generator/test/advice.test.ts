import { describe, expect, it } from "vitest";
import { type Advice } from "../src/advice.js";
import { checkDesign } from "../src/check.js";
import { parseDesign, type PartInput } from "../src/design.js";

const advise = (parts: PartInput[], extra: Record<string, unknown> = {}) => {
  const advice: Advice[] = [];
  checkDesign(parseDesign({ name: "taste", size: [16, 6, 16], shell: { kind: "none" }, ...extra, parts }), advice);
  return advice;
};
const pots = (block: string, xs: number[]): PartInput[] => xs.map((x) => ({ type: "box", id: `pot-${x}`, from: [x, 1, 4], to: [x, 1, 4], block }) as PartInput);

describe("advice on taste", () => {
  it("notes the same plant stamped close together, but not a varied few", () => {
    expect(advise(pots("minecraft:potted_fern", [1, 3, 5, 7])).map((a) => a.where)).toEqual(["repetition"]);
    expect(advise([...pots("minecraft:potted_fern", [1, 5]), ...pots("minecraft:potted_poppy", [3, 7])])).toEqual([]);
  });

  it("notes what does not belong where the design is set", () => {
    const candle: PartInput = { type: "box", id: "candle", from: [4, 1, 4], to: [4, 1, 4], block: "minecraft:candle[candles=1,lit=true]" };
    expect(advise([candle], { surroundings: { void: true } })[0]!.message).toMatch(/minecraft:candle at 4, 1, 4 in space: no open flame/);
    expect(advise([candle])).toEqual([]);
  });

  it("never fails a design", () => {
    expect(checkDesign(parseDesign({ name: "taste", size: [16, 6, 16], shell: { kind: "none" }, parts: pots("minecraft:potted_fern", [1, 3, 5, 7]) })).some((p) => p.where === "repetition")).toBe(false);
  });

  it("notes a long, tall, flat outside wall, but not one broken by posts", () => {
    const wall: PartInput = { type: "box", id: "wall", from: [2, 1, 8], to: [13, 5, 8], block: "minecraft:white_concrete" };
    expect(advise([wall]).map((a) => a.where)).toContain("flat wall");
    const posts = [2, 6, 10].map((x) => ({ type: "box", id: `post-${x}`, from: [x, 1, 9], to: [x, 5, 9], block: "minecraft:spruce_log" }) as PartInput);
    const mixed = [3, 7, 11].map((x) => ({ type: "box", id: `band-${x}`, from: [x, 1, 8], to: [x, 5, 8], block: "minecraft:stone_bricks", over: ["wall"] }) as PartInput);
    expect(advise([wall, ...posts, ...mixed]).filter((a) => a.where === "flat wall" && a.message.includes("white_concrete"))).toEqual([]);
  });

  it("notes a room only 2 high", () => {
    const floor: PartInput = { type: "box", id: "floor", from: [1, 0, 1], to: [8, 0, 8], block: "minecraft:spruce_planks" };
    const low: PartInput = { type: "box", id: "ceiling", from: [1, 3, 1], to: [8, 3, 8], block: "minecraft:spruce_planks" };
    const high: PartInput = { type: "box", id: "ceiling", from: [1, 4, 1], to: [8, 4, 8], block: "minecraft:spruce_planks" };
    expect(advise([floor, low]).map((a) => a.where)).toContain("low room");
    expect(advise([floor, high]).map((a) => a.where)).not.toContain("low room");
  });
});
