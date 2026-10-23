import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parse, simplify } from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import { parseLayout, validateLayout } from "../src/anchors.js";
import { parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";
import { writeOutputs } from "../src/output.js";

describe("writeOutputs", () => {
  const out = mkdtempSync(join(tmpdir(), "achq-out-"));
  const office = loadDesign("test-office");
  const files = writeOutputs(office, [10, 64, -5], out);

  it("writes the structure, the anchors file, the commands and a schematic for a small design", () => {
    for (const f of [files.nbt, files.anchors, files.commands, files.schem!]) expect(existsSync(f)).toBe(true);
    expect(files.nbt).toBe(join(out, "test-office.nbt"));
    expect(files.anchors).toBe(join(out, "agentcraft-anchors.json"));
  });

  it("writes an anchors file AgentCraft accepts, at the world origin it was given", () => {
    const layout = parseLayout(JSON.parse(readFileSync(files.anchors, "utf8")));
    expect(validateLayout(layout)).toEqual([]);
    expect(layout.anchors["spawn"]).toEqual(files.layout.anchors["spawn"]);
    expect(layout.anchors["spawn"]!.x).toBeGreaterThanOrEqual(10); // offset by the origin
  });

  it("writes the setup commands one per line, placing the structure at the origin", () => {
    const lines = readFileSync(files.commands, "utf8").trimEnd().split("\n");
    expect(lines).toEqual(files.setup);
    expect(lines).toContain("/place template minecraft:test-office 10 64 -5");
  });

  it("writes a structure the game can read", async () => {
    const tree = simplify((await parse(gunzipSync(readFileSync(files.nbt)))).parsed) as { size: number[]; palette: unknown[] };
    expect(tree.size).toEqual(office.size);
    expect(tree.palette.length).toBeGreaterThan(1);
  });

  it("leaves the schematic out of a design too big for one", () => {
    const big = parseDesign({
      name: "big", version: 1, size: [170, 150, 170], shell: { kind: "none" },
      parts: [{ type: "box", id: "slab", from: [0, 0, 0], to: [169, 0, 169], block: "minecraft:stone" }],
    });
    const bigFiles = writeOutputs(big, [0, 0, 0], mkdtempSync(join(tmpdir(), "achq-big-")));
    expect(bigFiles.schem).toBeUndefined();
    expect(existsSync(bigFiles.nbt)).toBe(true);
  });
});
