import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDesign } from "../src/design.js";
import { listVersions, loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

const origin = [100, 64, -200] as const;

describe("designs", () => {
  it("renders byte-identical output for the same design and origin", () => {
    const design = loadDesign("test-office");
    const a = renderDesign(design, { origin });
    const b = renderDesign(design, { origin });
    expect(a.volume.toSchem().equals(b.volume.toSchem())).toBe(true);
    expect(a.volume.toStructure().equals(b.volume.toStructure())).toBe(true);
    expect(a.layout).toEqual(b.layout);
  });

  it("takes the layout name and revision from the design", () => {
    const { layout } = renderDesign(loadDesign("test-office"), { origin });
    expect(layout.layout).toBe("test-office");
    expect(layout.revision).toBe(1);
  });

  it("rejects duplicate part ids", () => {
    const design = loadDesign("test-office");
    const dup = { ...design, parts: [...design.parts, design.parts[0]!] };
    expect(() => parseDesign(dup)).toThrow(/duplicate part id/);
  });

  it("rejects an unknown part type", () => {
    const design = loadDesign("test-office");
    expect(() => parseDesign({ ...design, parts: [{ type: "swimmingPool", id: "p" }] })).toThrow();
  });

  it("picks the latest version, and refuses a missing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "achq-designs-"));
    mkdirSync(join(dir, "t"));
    const base = loadDesign("test-office");
    for (const v of [1, 2, 10]) writeFileSync(join(dir, "t", `v${v}.json`), JSON.stringify({ ...base, name: "t", version: v }));
    expect(listVersions("t", dir)).toEqual([1, 2, 10]);
    expect(loadDesign("t", undefined, dir).version).toBe(10);
    expect(() => loadDesign("t", 3, dir)).toThrow(/no v3/);
    expect(() => loadDesign("nope", undefined, dir)).toThrow(/no design/);
  });

  it("refuses a file whose name or version disagrees with its path", () => {
    const dir = mkdtempSync(join(tmpdir(), "achq-designs-"));
    mkdirSync(join(dir, "t"));
    writeFileSync(join(dir, "t", "v1.json"), JSON.stringify({ ...loadDesign("test-office"), name: "other" }));
    expect(() => loadDesign("t", 1, dir)).toThrow(/says it is 'other'/);
  });
});
