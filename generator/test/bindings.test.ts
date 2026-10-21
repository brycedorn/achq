import { gunzipSync } from "node:zlib";
import { parse, simplify } from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { type PartInput, parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

const office = loadDesign("test-office");
const MONITOR = "agentcraft:monitor[facing=north,lit=true]";

/** The test office with AgentCraft blocks: bound 3 x 2 screens and lamps on the desks, and a few devices. */
function wired(extra: PartInput[] = []) {
  return parseDesign({
    ...office,
    parts: [
      ...office.parts.map((p) =>
        p.id === "desks" ? { ...p, screen: { block: MONITOR, width: 3, height: 2 }, lamp: "agentcraft:status_lamp[status=idle]" } : p.id === "library" ? { ...p, block: "agentcraft:memory_archive[facing=north]", binding: "shared" } : p,
      ),
      { type: "device", id: "merge-lamp", at: [15, 4, 7], block: "agentcraft:status_lamp[status=off]", binding: "merge" },
      ...extra,
    ],
  });
}

const design = wired();
const { volume, layout } = renderDesign(design, { origin: [0, 0, 0] });

describe("bound AgentCraft blocks", () => {
  it("puts a 3 x 2 wall of monitors on each desk, every block bound to its agent", () => {
    // desk_marlow's desk is at x = 2, z = 14; the screen spans x 1..3, y 2..3.
    for (const x of [1, 2, 3])
      for (const y of [2, 3]) {
        expect(volume.get(x, y, 14), `${x},${y}`).toMatch(/^agentcraft:monitor\[/);
        expect(volume.dataAt(x, y, 14)).toEqual({ id: "agentcraft:monitor", binding: "marlow" });
      }
    expect(volume.dataAt(6, 2, 14)?.binding).toBe("juniper");
    expect(volume.get(1, 1, 14)).toBe("minecraft:spruce_slab"); // the desk is as wide as the screen
  });

  it("sets the panel connections so the six blocks read as one screen", () => {
    const flags = (x: number, y: number) => {
      const m = /up=(\w+),down=(\w+),left=(\w+),right=(\w+)/.exec(volume.get(x, y, 14))!;
      return { up: m[1], down: m[2], left: m[3], right: m[4] };
    };
    // Facing north, left is the clockwise side (east, +x) and right is west (-x).
    expect(flags(1, 2)).toEqual({ up: "true", down: "false", left: "true", right: "false" });
    expect(flags(2, 2)).toEqual({ up: "true", down: "false", left: "true", right: "true" });
    expect(flags(3, 3)).toEqual({ up: "false", down: "true", left: "false", right: "true" });
  });

  it("keeps the binding when the connection pass rewrites the state", () => {
    expect(volume.dataAt(3, 3, 14)?.binding).toBe("marlow");
  });

  it("puts the agent's status lamp on top of the screen", () => {
    expect(volume.get(2, 4, 14)).toBe("agentcraft:status_lamp[status=idle]");
    expect(volume.dataAt(2, 4, 14)).toEqual({ id: "agentcraft:status_lamp", binding: "agent:marlow" });
  });

  it("moves the monitor anchor to the centre of the screen's face", () => {
    expect(layout.anchors["monitor_marlow"]).toMatchObject({ x: 2.5, y: 3, z: 14.748, yaw: 180 }); // the screen spans heights 2 to 4
  });

  it("binds stations and devices", () => {
    expect(volume.dataAt(3, 1, 6)).toEqual({ id: "agentcraft:memory_archive", binding: "shared" });
    expect(volume.dataAt(15, 4, 7)).toEqual({ id: "agentcraft:status_lamp", binding: "merge" });
  });

  it("still passes every check", () => {
    expect(checkDesign(design)).toEqual([]);
  });

  it("writes the bindings into the structure file where the game reads them", async () => {
    const { parsed } = await parse(gunzipSync(volume.toStructure()));
    const tree = simplify(parsed) as { palette: { Name: string }[]; blocks: { pos: number[]; state: number; nbt?: Record<string, string> }[] };
    const at = (x: number, y: number, z: number) => tree.blocks.find((b) => b.pos[0] === x && b.pos[1] === y && b.pos[2] === z)!;
    expect(at(1, 2, 14).nbt).toEqual({ id: "agentcraft:monitor", binding: "marlow" });
    expect(tree.palette[at(1, 2, 14).state]!.Name).toBe("agentcraft:monitor");
    expect(at(2, 4, 14).nbt).toEqual({ id: "agentcraft:status_lamp", binding: "agent:marlow" });
    expect(at(2, 1, 14).nbt).toBeUndefined(); // plain blocks carry no entity data
  });

  it("writes them into the .schem as Sponge block entities", async () => {
    const { parsed } = await parse(gunzipSync(volume.toSchem()));
    const tree = simplify(parsed) as { Schematic: { Blocks: { BlockEntities: { Pos: number[]; Id: string; Data: Record<string, string> }[] } } };
    const entities = tree.Schematic.Blocks.BlockEntities;
    expect(entities).toContainEqual({ Pos: [1, 2, 14], Id: "agentcraft:monitor", Data: { binding: "marlow" } });
    expect(entities).toHaveLength(6 * 6 + 6 + 2); // six screens of six blocks, six lamps, the archive and the merge lamp
  });

  it("drops a binding when a later part puts another block in that cell", () => {
    const over = wired([{ type: "device", id: "replace", at: [1, 2, 14], block: "minecraft:stone", over: ["desks"] }]);
    const v = renderDesign(over, { origin: [0, 0, 0] }).volume;
    expect(v.get(1, 2, 14)).toBe("minecraft:stone");
    expect(v.dataAt(1, 2, 14)).toBeUndefined();
    expect(v.get(2, 2, 14)).toMatch(/right=false/); // and its neighbour no longer connects to it
  });

  it("rejects a screen that cannot centre on the desk", () => {
    expect(() => parseDesign({ ...office, parts: office.parts.map((p) => (p.id === "desks" ? { ...p, screen: { block: MONITOR, width: 2, height: 2 } } : p)) })).toThrow(/odd/);
  });
});

describe("snowy-chalet v7", () => {
  const chalet = loadDesign("snowy-chalet", 7);
  const { volume: v, layout: l } = renderDesign(chalet, { origin: [0, 0, 0] });
  const bindings = new Map<string, number>();
  for (const [x, y, z] of v.blocks()) {
    const b = v.dataAt(x, y, z)?.binding;
    if (b) bindings.set(b, (bindings.get(b) ?? 0) + 1);
  }

  it("passes every check", () => {
    expect(checkDesign(chalet)).toEqual([]);
  });

  it("gives every agent a bound 3 x 2 screen and a status lamp", () => {
    for (const agent of ["marlow", "juniper", "kit", "wren", "rowan", "tove"]) {
      expect(bindings.get(agent), agent).toBe(6);
      expect(bindings.get(`agent:${agent}`), agent).toBe(1);
      expect(l.anchors[`monitor_${agent}`]).toBeDefined();
    }
  });

  it("binds the shared stations' lamps and blocks the way the studio does", () => {
    for (const b of ["shared", "merge", "decisions", "goal:atrium", "ci:#1", "ci:#2", "ci:#3"]) expect(bindings.get(b), b).toBe(1);
  });
});

