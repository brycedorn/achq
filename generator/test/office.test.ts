import { describe, expect, it } from "vitest";
import { validateLayout } from "../src/anchors.js";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

describe("renderDesign(test-office)", () => {
  const origin = [100, 64, -200] as const;
  const { volume, layout } = renderDesign(loadDesign("test-office"), { origin });

  it("satisfies the anchor contract, with every anchor inside the bounds", () => {
    expect(validateLayout(layout)).toEqual([]);
  });

  const local = (a: { x: number; z: number }) => [Math.floor(a.x) - origin[0], Math.floor(a.z) - origin[2]] as const;
  const isSeat = (name: string) => /^(desk_|lounge|meeting)/.test(name);
  // Yaw 0 = south, 180 = north, -90 = east, 90 = west. The right-hand cell is a quarter turn clockwise from the look direction.
  const right: Record<number, readonly [number, number]> = { 0: [-1, 0], 180: [1, 0], [-90]: [0, 1], 90: [0, -1] };
  const back: Record<number, string> = { 0: "north", 180: "south", [-90]: "west", 90: "east" };

  it("puts every standing anchor on solid floor with head room", () => {
    for (const [name, a] of Object.entries(layout.anchors)) {
      if (!/^(desk_|lounge|meeting|library|terminal|testbench|mergestation|user|entrance|spawn)/.test(name)) continue;
      const [lx, lz] = local(a);
      expect(a.y, name).toBe(origin[1] + 1);
      expect(volume.get(lx, 0, lz), name).not.toBe("minecraft:air");
      expect(volume.get(lx, 2, lz), name).toBe("minecraft:air");
      if (!isSeat(name)) expect(volume.get(lx, 1, lz), name).toBe("minecraft:air");
    }
  });

  it("makes every seat a bottom stairs block with its back to the agent and a free cell on the right", () => {
    const seats = Object.entries(layout.anchors).filter(([name]) => isSeat(name));
    expect(seats).toHaveLength(6 + 6 + 6);
    for (const [name, a] of seats) {
      const [lx, lz] = local(a);
      const state = volume.get(lx, 1, lz);
      expect(state, name).toMatch(/_stairs\[/);
      expect(state, name).toContain("half=bottom");
      expect(state, name).toContain(`facing=${back[a.yaw]}`);
      const [dx, dz] = right[a.yaw]!;
      expect(volume.get(lx + dx, 0, lz + dz), name).not.toBe("minecraft:air");
      expect(volume.get(lx + dx, 1, lz + dz), name).toBe("minecraft:air");
      expect(volume.get(lx + dx, 2, lz + dz), name).toBe("minecraft:air");
    }
  });

  it("keeps slots of one station at least 1.6 blocks apart", () => {
    for (const station of ["meeting", "lounge"]) {
      const slots = Object.entries(layout.anchors).filter(([n]) => n === station || n.startsWith(`${station}_`));
      expect(slots).toHaveLength(6);
      for (const [i, [, a]] of slots.entries())
        for (const [, b] of slots.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(1.6);
    }
  });

  it("keeps the door open and the spawn clear", () => {
    expect(volume.get(12, 1, 0)).toBe("minecraft:air");
    expect(volume.get(12, 2, 0)).toBe("minecraft:air");
    expect(volume.get(12, 1, 2)).toBe("minecraft:air");
  });
});
