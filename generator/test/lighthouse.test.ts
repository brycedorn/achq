import { describe, expect, it } from "vitest";
import { loadDesign } from "../src/designs.js";
import { renderDesign } from "../src/render.js";

describe("lighthouse", () => {
  const design = loadDesign("lighthouse");

  // Every check (and so the walk there and back) is in designs.test.ts.
  it("is walked as a player to every room, the gallery and the jetty", () => {
    expect(design.walk?.to.map((t) => t.name)).toEqual(["gallery", "jetty"]);
  });

  it("puts stairs on the rises of the cliff path down to the jetty", () => {
    const { volume } = renderDesign(design, { origin: [0, 0, 0] });
    let stairs = 0;
    for (let x = 0; x < volume.width; x++)
      for (let z = 0; z < volume.length; z++)
        for (let y = 20; y < 45; y++) if (volume.get(x, y, z).startsWith("minecraft:cobblestone_stairs")) stairs++;
    expect(stairs).toBeGreaterThan(8);
  });
});
