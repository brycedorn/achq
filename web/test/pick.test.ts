import { describe, expect, it } from "vitest";
import { raycast } from "../src/pick.js";
import { makeWorld } from "./helpers.js";

const world = makeWorld([8, 8, 8], [[4, 1, 1, "minecraft:stone"], [1, 1, 1, "minecraft:oak_slab[type=bottom]"]]);
const boxesAt = (x: number, y: number, z: number) => world.looks[world.idAt(x, y, z)]!.boxes;

describe("raycast", () => {
  it("hits the near face of a cube", () => {
    const hit = raycast([0.5, 1.75, 1.5], [1, 0, 0], 8, boxesAt);
    // The slab at x=1 is only half a block tall, so a ray at y=1.75 passes over it.
    expect(hit).toEqual({ block: [4, 1, 1], normal: [-1, 0, 0], distance: 3.5 });
  });

  it("hits the top of a slab looking down", () => {
    const hit = raycast([1.5, 3, 1.5], [0, -1, 0], 8, boxesAt);
    expect(hit?.block).toEqual([1, 1, 1]);
    expect(hit?.normal).toEqual([0, 1, 0]);
    expect(hit?.distance).toBeCloseTo(1.5);
  });

  it("stops at its reach", () => {
    expect(raycast([0.5, 1.75, 1.5], [1, 0, 0], 3, boxesAt)).toBeUndefined();
  });

  it("misses into the open", () => {
    expect(raycast([0.5, 5.5, 0.5], [0, 1, 0], 8, boxesAt)).toBeUndefined();
  });
});
