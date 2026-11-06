import { describe, expect, it } from "vitest";
import { checkDesign, judgeRoutes, LOUNGE_MAX, ROUTE_MAX, ROUTE_MEAN, type Route, ROUTE_STATIONS } from "../src/check.js";
import { loadDesign } from "../src/designs.js";
import { Volume } from "../src/schematic.js";
import { Walk } from "../src/walk.js";

describe("agents' walks (rule 13)", () => {
  it("prices a walk as the mod's A* does: 1 a step, 1.414 a diagonal, 0.6 more up or down", () => {
    // A stone floor at layer 0 with a one-block step up at x 6 and beyond.
    const v = new Volume(10, 4, 10);
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) v.set(x, x >= 6 ? 1 : 0, z, "minecraft:stone");
    const far = new Walk(v).distances([0, 1, 0]);
    expect(far.get("3,1,0")).toBe(3);
    expect(far.get("2,1,2")).toBeCloseTo(2 * Math.SQRT2);
    expect(far.get("6,2,0")).toBeCloseTo(6.6);
    expect(far.has("6,1,0")).toBe(false); // inside the step
  });

  it("times every desk's walk to every station and the lounge in a design", () => {
    const routes: Route[] = [];
    checkDesign(loadDesign("test-office"), [], routes);
    expect(routes).toHaveLength(6 * (ROUTE_STATIONS.length + 1));
    expect(Math.max(...routes.map((r) => r.length))).toBeLessThan(ROUTE_MAX);
  });

  it("finds a walk too long, the lounge allowed further, and a long average", () => {
    const r = (station: string, length: number): Route => ({ desk: "kit", station, length });
    expect(judgeRoutes([r("library", 10), r("lounge", LOUNGE_MAX - 1)])).toEqual([]);
    expect(judgeRoutes([r("library", ROUTE_MAX + 1)]).map((p) => p.message)).toEqual([
      `kit's walk from the desk to the library is ${ROUTE_MAX + 1} blocks (21 s): keep every desk within ${ROUTE_MAX} blocks of the stations`,
      `the walks from the desks to the stations average ${ROUTE_MAX + 1} blocks: bring the stations nearer the desks (at most ${ROUTE_MEAN} on average)`,
    ]);
    expect(judgeRoutes([r("lounge", LOUNGE_MAX + 1)])).toHaveLength(1);
    expect(judgeRoutes([r("terminal", ROUTE_MEAN + 5), r("testbench", ROUTE_MEAN + 5)]).map((p) => p.message)).toEqual([
      `the walks from the desks to the stations average ${ROUTE_MEAN + 5} blocks: bring the stations nearer the desks (at most ${ROUTE_MEAN} on average)`,
    ]);
  });
});
