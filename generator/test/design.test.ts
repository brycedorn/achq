import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDesign } from "../src/design.js";
import { listDesigns, loadDesign } from "../src/designs.js";
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

  it("takes the layout name from the design, and a revision that changes with it", () => {
    const design = loadDesign("test-office");
    const { layout } = renderDesign(design, { origin });
    expect(layout.layout).toBe("test-office");
    expect(renderDesign(design, { origin }).layout.revision).toBe(layout.revision);
    expect(renderDesign({ ...design, seed: design.seed + 1 }, { origin }).layout.revision).not.toBe(layout.revision);
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

  it("loads a design by name, and refuses a missing one or one whose name disagrees with its file", () => {
    const dir = mkdtempSync(join(tmpdir(), "achq-designs-"));
    const base = loadDesign("test-office");
    writeFileSync(join(dir, "t.json"), JSON.stringify({ ...base, name: "t" }));
    writeFileSync(join(dir, "u.json"), JSON.stringify({ ...base, name: "other" }));
    expect(listDesigns(dir)).toEqual(["t", "u"]);
    expect(loadDesign("t", dir).name).toBe("t");
    expect(() => loadDesign("nope", dir)).toThrow(/no design 'nope'/);
    expect(() => loadDesign("u", dir)).toThrow(/says it is 'other'/);
  });
});
