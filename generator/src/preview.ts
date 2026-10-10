import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { designFilePath, loadDesign } from "./designs.js";
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

/** The pathname of a request URL, or undefined when it is not a path (such as `//`, which parses as a host). */
function requestPath(url: string | undefined): string | undefined {
  if (!url?.startsWith("/") || url.startsWith("//")) return undefined;
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return undefined;
  }
}

/**
 * Serve the viewer for one design. `/scene.json` is rebuilt from the design file on every request, so
 * editing the JSON and reloading (or letting the page poll) shows the change without a restart.
 */
export function startPreview(name: string, version: number | undefined, port: number): Promise<Server> {
  // A large landscape takes seconds to build and the page polls every second, so the scene is kept
  // until the design file changes.
  let cache: { key: string; json: string } | undefined;
  const sceneJson = (): string => {
    const key = readFileSync(designFilePath(name, version), "utf8");
    if (cache?.key === key) return cache.json;
    cache = { key, json: JSON.stringify(buildScene(loadDesign(name, version))) };
    return cache.json;
  };
  const server = createServer((req, res) => {
    try {
      const path = requestPath(req.url);
      if (path === undefined) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("bad request");
        return;
      }
      if (path === "/scene.json") {
        const json = sceneJson();
        res.writeHead(200, { "content-type": TYPES[".json"]!, "cache-control": "no-store" });
        res.end(json);
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
