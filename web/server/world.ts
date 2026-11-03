import { statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";
import { designFilePath, listDesigns, loadDesign } from "../../generator/src/designs.js";
import { renderDesign } from "../../generator/src/render.js";
import type { WorldMeta } from "../src/world.js";

/** A design ready to send: its metadata, and every cell's palette id, gzipped. */
export type EncodedWorld = { meta: WorldMeta; volume: Buffer };

export function encodeWorld(name: string): EncodedWorld {
  const { volume, layout } = renderDesign(loadDesign(name), { origin: [0, 0, 0] });
  const palette = Array.from({ length: volume.paletteSize }, (_, id) => volume.stateOf(id));
  const ids = volume.ids;
  return {
    meta: { name, size: [volume.width, volume.height, volume.length], palette, anchors: layout.anchors },
    volume: gzipSync(Buffer.from(ids.buffer, ids.byteOffset, ids.byteLength), { level: 6 }),
  };
}

const cache = new Map<string, { mtime: number; world: EncodedWorld }>();

/** The encoded design, rebuilt when its file changes. */
function world(name: string): EncodedWorld {
  const mtime = statSync(designFilePath(name)).mtimeMs;
  const hit = cache.get(name);
  if (hit?.mtime === mtime) return hit.world;
  const encoded = encodeWorld(name);
  cache.set(name, { mtime, world: encoded });
  return encoded;
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, gzipped = false): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...(gzipped ? { "content-encoding": "gzip" } : {}) });
  res.end(body);
}

/** Serves `/api/designs`, `/api/world/<name>/meta.json` and `/api/world/<name>/volume.bin`. */
export function handle(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const path = (req.url ?? "").split("?")[0] ?? "";
  if (!path.startsWith("/api/")) return next();
  try {
    if (path === "/api/designs") return send(res, 200, "application/json", JSON.stringify(listDesigns()));
    const m = /^\/api\/world\/([^/]+)\/(meta\.json|volume\.bin)$/.exec(path);
    const name = m && decodeURIComponent(m[1]!);
    // Only names from the list, so a request can never reach outside `designs/`.
    if (!m || !name || !listDesigns().includes(name)) return send(res, 404, "text/plain", "not found");
    const w = world(name);
    if (m[2] === "meta.json") return send(res, 200, "application/json", JSON.stringify(w.meta));
    return send(res, 200, "application/octet-stream", w.volume, true);
  } catch (e) {
    send(res, 500, "text/plain", e instanceof Error ? e.message : String(e));
  }
}

export function worldApi(): Plugin {
  return {
    name: "achq-world",
    configureServer(server) {
      server.middlewares.use(handle);
    },
  };
}
