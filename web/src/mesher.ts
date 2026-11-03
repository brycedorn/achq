import type { Box } from "../../generator/src/blocks.js";
import type { Look } from "./world.js";

/**
 * Turns a chunk of blocks into triangles. Whole cubes go through greedy meshing: each visible face gets ambient
 * occlusion (corners darkened by solid neighbours) and runs of faces with the same block and the same corner shading
 * merge into one quad. Shaped blocks (stairs, slabs, fences) emit their boxes' faces directly. Pure: no three.js, so it
 * runs in a worker and in tests.
 */

export const CHUNK = 32;

export type MeshWorld = { size: readonly [number, number, number]; cells: Uint16Array; looks: readonly Look[] };

/** Positions in world block units, sRGB vertex colors (shading baked in), triangle indices. */
export type MeshData = { positions: Float32Array; colors: Uint8Array; indices: Uint32Array };
export type ChunkMesh = { opaque: MeshData | null; transparent: MeshData | null };

/** Brightness for 0 to 3 open sides around a corner. */
const AO_LIGHT = [0.5, 0.65, 0.8, 1];
/** Fixed light per face direction, as Minecraft does: top brightest, bottom darkest. Indexed [axis][dir > 0 ? 1 : 0]. */
const FACE_LIGHT = [[0.6, 0.6], [0.5, 1], [0.8, 0.8]];
/** Glowing blocks keep a little of the face shading, so their shape still reads. */
const faceLight = (look: Look, d: number, s: number) => {
  const face = FACE_LIGHT[d]![s > 0 ? 1 : 0]!;
  return look.emissive ? 0.85 + 0.15 * face : face;
};
/** Corner offsets in a face's (u, v) plane, in quad order. */
const CORNERS: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
/** All four corners fully lit. */
const NO_AO = 0xff;

type V3 = readonly [number, number, number];
const v3 = (x: number, y: number, z: number): V3 => [x, y, z];

class Builder {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  /** A quad from four corners in counter-clockwise order seen from the front, with per-corner brightness. */
  quad(corners: readonly V3[], color: readonly [number, number, number], light: readonly number[]): void {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      const c = corners[i]!;
      this.positions.push(c[0], c[1], c[2]);
      const l = light[i]!;
      this.colors.push(Math.round(color[0] * l), Math.round(color[1] * l), Math.round(color[2] * l));
    }
    // Split along the darker diagonal, so a single dark corner shades smoothly instead of leaving a crease.
    const flip = light[0]! + light[2]! > light[1]! + light[3]!;
    if (flip) this.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): MeshData | null {
    if (this.indices.length === 0) return null;
    return { positions: new Float32Array(this.positions), colors: new Uint8Array(this.colors), indices: new Uint32Array(this.indices) };
  }
}

export function meshChunk(world: MeshWorld, cx: number, cy: number, cz: number): ChunkMesh {
  const [W, H, L] = world.size;
  const { cells, looks } = world;
  const idAt = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L ? 0 : cells[x + z * W + y * W * L]!;
  const occludes = (x: number, y: number, z: number) => looks[idAt(x, y, z)]!.occludes;
  /** Whether a neighbour hides the face of `look` that touches it. */
  const hides = (look: Look, nid: number) => {
    if (nid === 0) return false;
    const n = looks[nid]!;
    return n.occludes || (look.cullGroup !== 0 && n.cullGroup === look.cullGroup);
  };
  // Water with water above fills its whole block, so stacked water has no inner surfaces.
  const isCubeAt = (x: number, y: number, z: number, id: number) => {
    const look = looks[id]!;
    if (look.cube) return true;
    return look.cullGroup !== 0 && look.boxes.length === 1 && idAt(x, y + 1, z) !== 0 && looks[idAt(x, y + 1, z)]!.cullGroup === look.cullGroup;
  };

  const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
  const opaque = new Builder();
  const transparent = new Builder();
  const pick = (look: Look) => (look.transparent ? transparent : opaque);

  // Greedy pass over whole cubes, one axis and direction at a time.
  const mask = new Int32Array(CHUNK * CHUNK);
  const p = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    for (const s of [1, -1]) {
      for (let i = 0; i < CHUNK; i++) {
        mask.fill(0);
        let any = false;
        for (let b = 0; b < CHUNK; b++)
          for (let a = 0; a < CHUNK; a++) {
            p[d] = i; p[u] = a; p[v] = b;
            const x = ox + p[0]!, y = oy + p[1]!, z = oz + p[2]!;
            const id = idAt(x, y, z);
            if (id === 0 || !isCubeAt(x, y, z, id)) continue;
            const look = looks[id]!;
            const n = [x, y, z];
            n[d]! += s;
            if (hides(look, idAt(n[0]!, n[1]!, n[2]!))) continue;
            mask[a + b * CHUNK] = (id + 1) * 256 + (look.emissive || look.transparent ? NO_AO : ao(occludes, n, u, v));
            any = true;
          }
        if (!any) continue;
        for (let b = 0; b < CHUNK; b++)
          for (let a = 0; a < CHUNK; ) {
            const key = mask[a + b * CHUNK]!;
            if (key === 0) { a++; continue; }
            let w = 1;
            while (a + w < CHUNK && mask[a + w + b * CHUNK] === key) w++;
            let h = 1;
            grow: while (b + h < CHUNK) {
              for (let k = 0; k < w; k++) if (mask[a + k + (b + h) * CHUNK] !== key) break grow;
              h++;
            }
            for (let hh = 0; hh < h; hh++) mask.fill(0, a + (b + hh) * CHUNK, a + w + (b + hh) * CHUNK);
            const look = looks[Math.floor(key / 256) - 1]!;
            const plane = i + (s > 0 ? 1 : 0);
            const corners = [[a, b], [a + w, b], [a + w, b + h], [a, b + h]].map(([cu, cv]) => {
              const q = [0, 0, 0];
              q[d] = plane; q[u] = cu!; q[v] = cv!;
              return v3(ox + q[0]!, oy + q[1]!, oz + q[2]!);
            });
            const shade = faceLight(look, d, s);
            const light = [0, 1, 2, 3].map((c) => AO_LIGHT[(key >> (c * 2)) & 3]! * shade);
            emit(pick(look), corners, look.color, light, s);
            a += w;
          }
      }
    }
  }

  // Shaped blocks: each box's faces, culled only where a face lies on the block's side against a hiding neighbour.
  for (let y = oy; y < Math.min(oy + CHUNK, H); y++)
    for (let z = oz; z < Math.min(oz + CHUNK, L); z++)
      for (let x = ox; x < Math.min(ox + CHUNK, W); x++) {
        const id = idAt(x, y, z);
        if (id === 0 || isCubeAt(x, y, z, id)) continue;
        const look = looks[id]!;
        for (const box of look.boxes) shapedBox(pick(look), look, box, x, y, z, (dx, dy, dz) => hides(look, idAt(x + dx, y + dy, z + dz)));
      }

  return { opaque: opaque.build(), transparent: transparent.build() };
}

/** Corner shading of a face whose open side is cell `n`, packed two bits per corner in quad order. */
function ao(occludes: (x: number, y: number, z: number) => boolean, n: number[], u: number, v: number): number {
  let packed = 0;
  for (let c = 0; c < 4; c++) {
    const [du, dv] = CORNERS[c]!;
    const at = (ou: number, ov: number) => {
      const q = [n[0]!, n[1]!, n[2]!];
      q[u]! += ou; q[v]! += ov;
      return occludes(q[0]!, q[1]!, q[2]!) ? 1 : 0;
    };
    const side1 = at(du, 0), side2 = at(0, dv), corner = at(du, dv);
    packed |= (side1 && side2 ? 0 : 3 - side1 - side2 - corner) << (c * 2);
  }
  return packed;
}

/** Add a quad whose corners are in (u, v) order; a face pointing down its axis reverses them to stay front-facing. */
function emit(out: Builder, corners: V3[], color: readonly [number, number, number], light: number[], s: number): void {
  if (s > 0) out.quad(corners, color, light);
  else out.quad([corners[0]!, corners[3]!, corners[2]!, corners[1]!], color, [light[0]!, light[3]!, light[2]!, light[1]!]);
}

function shapedBox(out: Builder, look: Look, box: Box, x: number, y: number, z: number, hidden: (dx: number, dy: number, dz: number) => boolean): void {
  const min = [box[0], box[1], box[2]];
  const max = [box[3], box[4], box[5]];
  const at = [x, y, z];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    for (const s of [1, -1]) {
      const onSide = s > 0 ? max[d] === 1 : min[d] === 0;
      if (onSide) {
        const off = [0, 0, 0];
        off[d] = s;
        if (hidden(off[0]!, off[1]!, off[2]!)) continue;
      }
      const plane = s > 0 ? max[d]! : min[d]!;
      const corners = [[min[u]!, min[v]!], [max[u]!, min[v]!], [max[u]!, max[v]!], [min[u]!, max[v]!]].map(([cu, cv]) => {
        const q = [0, 0, 0];
        q[d] = at[d]! + plane; q[u] = at[u]! + cu!; q[v] = at[v]! + cv!;
        return v3(q[0]!, q[1]!, q[2]!);
      });
      const shade = faceLight(look, d, s);
      emit(out, corners, look.color, [shade, shade, shade, shade], s);
    }
  }
}

/** Chunk coordinates of a world, nearest to `from` (in blocks) first. */
export function chunkOrder(size: readonly [number, number, number], from: readonly [number, number, number]): [number, number, number][] {
  const n = size.map((s) => Math.ceil(s / CHUNK));
  const out: [number, number, number][] = [];
  for (let cy = 0; cy < n[1]!; cy++) for (let cz = 0; cz < n[2]!; cz++) for (let cx = 0; cx < n[0]!; cx++) out.push([cx, cy, cz]);
  const dist = ([cx, cy, cz]: [number, number, number]) =>
    ((cx + 0.5) * CHUNK - from[0]) ** 2 + ((cy + 0.5) * CHUNK - from[1]) ** 2 + ((cz + 0.5) * CHUNK - from[2]) ** 2;
  return out.sort((a, b) => dist(a) - dist(b));
}
