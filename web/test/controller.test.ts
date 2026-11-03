import { describe, expect, it } from "vitest";
import { type Body, type Input, newBody, step } from "../src/controller.js";
import type { World } from "../src/world.js";
import { fill, makeWorld } from "./helpers.js";

const STONE = "minecraft:stone";
const idle: Input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false, yaw: 0 };
/** Yaw that walks toward +x. */
const EAST = -Math.PI / 2;

function run(world: World, body: Body, input: Partial<Input>, seconds: number): Body {
  for (let t = 0; t < seconds; t += 1 / 60) step(body, { ...idle, ...input }, world, 1 / 60);
  return body;
}

/** A 16 x 16 stone floor at y=0, plus `extra` blocks. */
const floor = (extra: [number, number, number, string][] = []) => makeWorld([16, 8, 16], [...fill(0, 0, 0, 15, 0, 15, STONE), ...extra]);

describe("step", () => {
  it("falls and lands on the floor", () => {
    const b = run(floor(), newBody([4.5, 5, 4.5]), {}, 2);
    expect(b.pos[1]).toBeCloseTo(1);
    expect(b.onGround).toBe(true);
  });

  it("lands on a carpet at its height", () => {
    const b = run(floor([[4, 1, 4, "minecraft:red_carpet"]]), newBody([4.5, 3, 4.5]), {}, 2);
    expect(b.pos[1]).toBeCloseTo(1.0625);
  });

  it("walks forward along -z with yaw 0", () => {
    const b = run(floor(), newBody([8.5, 1, 12.5]), { forward: true }, 1);
    expect(b.pos[2]).toBeLessThan(9);
    expect(b.pos[0]).toBeCloseTo(8.5);
  });

  it("stops at a full block", () => {
    const b = run(floor(fill(6, 1, 0, 6, 1, 15, STONE)), newBody([3.5, 1, 4.5]), { forward: true, yaw: EAST }, 2);
    expect(b.pos[0]).toBeCloseTo(6 - 0.3);
    expect(b.pos[1]).toBeCloseTo(1);
  });

  it("steps onto a slab without jumping", () => {
    const b = run(floor(fill(6, 1, 0, 9, 1, 15, "minecraft:stone_slab[type=bottom]")), newBody([3.5, 1, 4.5]), { forward: true, yaw: EAST }, 1.5);
    expect(b.pos[0]).toBeGreaterThan(7);
    expect(b.pos[1]).toBeCloseTo(1.5);
  });

  it("jumps onto a full block", () => {
    const b = run(floor(fill(6, 1, 0, 9, 1, 15, STONE)), newBody([5.5, 1, 4.5]), { forward: true, jump: true, yaw: EAST }, 0.3);
    run(floor(fill(6, 1, 0, 9, 1, 15, STONE)), b, { forward: true, yaw: EAST }, 1);
    expect(b.pos[1]).toBeCloseTo(2);
    expect(b.pos[0]).toBeGreaterThan(6);
  });

  it("climbs a stair from the front but not from the back", () => {
    // facing=east: the tall half is on the east side, so it is climbed walking east.
    const stair = "minecraft:stone_stairs[facing=east,half=bottom]";
    const up = run(floor([...fill(6, 1, 0, 6, 1, 15, stair), ...fill(7, 1, 0, 9, 1, 15, STONE)]), newBody([3.5, 1, 4.5]), { forward: true, yaw: EAST }, 1);
    expect(up.pos[1]).toBeCloseTo(2);
    const back = run(floor(fill(6, 1, 0, 6, 1, 15, "minecraft:stone_stairs[facing=west,half=bottom]")), newBody([3.5, 1, 4.5]), { forward: true, yaw: EAST }, 2);
    expect(back.pos[1]).toBeCloseTo(1);
    expect(back.pos[0]).toBeLessThan(6);
  });

  it("cannot jump over a fence", () => {
    const fence = "minecraft:oak_fence[north=true,south=true]";
    const b = run(floor(fill(6, 1, 0, 6, 1, 15, fence)), newBody([4.5, 1, 4.5]), { forward: true, jump: true, yaw: EAST }, 2);
    expect(b.pos[0]).toBeLessThan(6.5);
  });

  it("climbs a ladder", () => {
    const w = floor([...fill(6, 1, 4, 6, 5, 4, STONE), ...fill(5, 1, 4, 5, 5, 4, "minecraft:ladder[facing=west]")]);
    const b = run(w, newBody([5.5, 1, 4.5]), { forward: true, yaw: EAST }, 1.5);
    expect(b.pos[1]).toBeGreaterThan(3);
  });

  it("flies through the air without falling", () => {
    const b = newBody([4.5, 4, 4.5]);
    b.flying = true;
    run(floor(), b, {}, 1);
    expect(b.pos[1]).toBeCloseTo(4);
  });
});
