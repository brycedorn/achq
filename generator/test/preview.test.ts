import { type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDesign } from "../src/designs.js";
import { startPreview } from "../src/preview.js";
import { buildScene, type Scene } from "../src/scene.js";
import { type Server } from "node:http";

describe("buildScene", () => {
  const design = loadDesign("test-office");
  const scene = buildScene(design);

  it("describes every placed block through the palette", () => {
    expect(scene.cells.length % 4).toBe(0);
    for (let i = 3; i < scene.cells.length; i += 4) expect(scene.palette[scene.cells[i]!]).toBeDefined();
    expect(scene.palette).not.toContain("minecraft:air");
    expect(new Set(scene.palette).size).toBe(scene.palette.length);
  });

  it("keeps the anchors in local coordinates and reports no problems for a clean design", () => {
    expect(scene.anchors["spawn"]).toMatchObject({ x: 12.5, y: 1, z: 2.5 });
    expect(scene.problems).toEqual([]);
  });

  it("marks every walkable cell reachable in the test office, including the seats", () => {
    expect(scene.walkable.length % 5).toBe(0);
    const cells = new Map<string, number>();
    for (let i = 0; i < scene.walkable.length; i += 5) cells.set(scene.walkable.slice(i, i + 3).join(","), scene.walkable[i + 4]!);
    expect(cells.get("12,1,2")).toBe(1); // spawn
    expect(cells.get("2,2,13")).toBe(1); // standing on the chair at desk_marlow
    // Cells on the roof are walkable ground too, but nothing connects them to the spawn.
    expect([...cells.values()]).toContain(0);
  });
});

describe("startPreview", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = await startPreview("test-office", undefined, 0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("serves the viewer and its libraries", async () => {
    for (const path of ["/", "/viewer.js", "/three/three.module.min.js", "/three-addons/controls/OrbitControls.js"]) {
      const res = await fetch(base + path);
      expect(res.status, path).toBe(200);
    }
  });

  it("serves a fresh scene as JSON", async () => {
    const scene = (await (await fetch(`${base}/scene.json`)).json()) as Scene;
    expect(scene.name).toBe("test-office");
    expect(scene.version).toBe(1);
  });

  it("serves nothing outside its whitelist", async () => {
    for (const path of ["/package.json", "/../package.json", "/src/cli.ts", "/node_modules/three/package.json"]) {
      const res = await fetch(base + path);
      expect(res.status, path).toBe(404);
    }
  });
});
