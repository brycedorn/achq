import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDesign } from "./designs.js";
import { buildScene } from "./scene.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THREE_DIR = join(root, "node_modules", "three");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
};

/** Static files the viewer imports. Only these paths are ever read from disk. */
const FILES: Record<string, string> = {
  "/": join(root, "viewer", "index.html"),
  "/viewer.js": join(root, "viewer", "viewer.js"),
  "/three/three.module.min.js": join(THREE_DIR, "build", "three.module.min.js"),
  "/three-addons/controls/OrbitControls.js": join(THREE_DIR, "examples", "jsm", "controls", "OrbitControls.js"),
};

/**
 * Serve the viewer for one design. `/scene.json` is rebuilt from the design file on every request, so
 * editing the JSON and reloading (or letting the page poll) shows the change without a restart.
 */
export function startPreview(name: string, version: number | undefined, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      if (path === "/scene.json") {
        const scene = buildScene(loadDesign(name, version));
        res.writeHead(200, { "content-type": TYPES[".json"]!, "cache-control": "no-store" });
        res.end(JSON.stringify(scene));
        return;
      }
      const file = FILES[path];
      if (!file) {
        res.writeHead(404).end("not found");
        return;
      }
      const ext = file.slice(file.lastIndexOf("."));
      res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(readFileSync(file));
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(e instanceof Error ? e.message : String(e));
    }
  });
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolvePromise(server));
  });
}
