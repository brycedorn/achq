import { describe, expect, it } from "vitest";
import { invalidState } from "../src/registry.js";
import { checkDesign } from "../src/check.js";
import { parseDesign } from "../src/design.js";

describe("every block is one the game knows", () => {
  it("passes real blocks, with or without properties, and AgentCraft's own", () => {
    for (const s of ["minecraft:stone", "minecraft:oak_stairs[facing=east,half=bottom]", "minecraft:iron_chain[axis=y]", "agentcraft:status_lamp[status=idle]", "agentcraft:monitor[facing=north,lit=true]"])
      expect(invalidState(s)).toBeUndefined();
  });

  it("names what is wrong: the block, the property, or the value", () => {
    expect(invalidState("minecraft:stone_brick")).toBe("minecraft:stone_brick is not a block (did you mean minecraft:stone_bricks?)");
    expect(invalidState("minecraft:oak_stairs[facing=east,half=lower]")).toBe("minecraft:oak_stairs's 'half' cannot be 'lower' (it takes top, bottom)");
    expect(invalidState("minecraft:glass[lit=true]")).toBe("minecraft:glass has no property 'lit'");
    expect(invalidState("agentcraft:status_lamp[status=asleep]")).toMatch(/cannot be 'asleep'/);
  });

  it("is a problem in a design", () => {
    const design = parseDesign({
      name: "typo", size: [6, 6, 6], shell: { kind: "none" },
      parts: [{ type: "box", id: "floor", from: [0, 0, 0], to: [5, 0, 5], block: "minecraft:sprcue_planks" }],
    });
    expect(checkDesign(design)).toContainEqual({ where: "blocks", message: "minecraft:sprcue_planks is not a block" });
  });
});

describe("cameras see something", () => {
  const room = (at: [number, number, number], yaw: number) =>
    parseDesign({
      name: "cam", size: [10, 6, 10], shell: { kind: "none" },
      parts: [
        { type: "box", id: "wall", from: [0, 0, 5], to: [9, 5, 5], block: "minecraft:stone" },
        { type: "camera", id: "cam", name: "view", at, yaw, pitch: 0 },
      ],
    });
  const about = (d: ReturnType<typeof room>) => checkDesign(d).filter((p) => p.where === "cam_view").map((p) => p.message);

  it("finds a camera inside a block, or right up against a wall", () => {
    expect(about(room([4.5, 2.5, 5.5], 0))).toEqual(["the camera is inside minecraft:stone"]);
    expect(about(room([4.5, 2.5, 4.2], 0))[0]).toMatch(/^the camera looks straight into minecraft:stone 0\.\d blocks away/);
  });

  it("passes one with room to see", () => {
    expect(about(room([4.5, 2.5, 4.2], 180))).toEqual([]);
  });
});
