import type { Box } from "../../generator/src/blocks.js";

export type Hit = { block: [number, number, number]; normal: [number, number, number]; distance: number };

/**
 * The first drawn box a ray hits, walking the block grid cell by cell (Amanatides and Woo). `boxesAt` gives a cell's
 * boxes in its own coordinates; `dir` must be normalized.
 */
export function raycast(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  maxDistance: number,
  boxesAt: (x: number, y: number, z: number) => readonly Box[],
): Hit | undefined {
  const cell = origin.map(Math.floor);
  const stepDir = dir.map((d) => (d > 0 ? 1 : d < 0 ? -1 : 0));
  const tDelta = dir.map((d) => (d === 0 ? Infinity : Math.abs(1 / d)));
  const tMax = dir.map((d, i) => (d === 0 ? Infinity : (d > 0 ? cell[i]! + 1 - origin[i]! : origin[i]! - cell[i]!) * tDelta[i]!));
  let t = 0;
  while (t <= maxDistance) {
    const [x, y, z] = [cell[0]!, cell[1]!, cell[2]!];
    let best: Hit | undefined;
    for (const b of boxesAt(x, y, z)) {
      const hit = rayBox(origin, dir, [x + b[0], y + b[1], z + b[2]], [x + b[3], y + b[4], z + b[5]]);
      if (hit && hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = { ...hit, block: [x, y, z] };
    }
    if (best) return best;
    const axis = tMax[0]! < tMax[1]! ? (tMax[0]! < tMax[2]! ? 0 : 2) : tMax[1]! < tMax[2]! ? 1 : 2;
    t = tMax[axis]!;
    cell[axis]! += stepDir[axis]!;
    tMax[axis]! += tDelta[axis]!;
  }
  return undefined;
}

/** Slab test: where the ray enters the box, and the face it enters through. */
function rayBox(o: readonly number[], d: readonly number[], min: readonly number[], max: readonly number[]): Omit<Hit, "block"> | undefined {
  let near = -Infinity, far = Infinity, axis = -1;
  for (let i = 0; i < 3; i++) {
    if (d[i] === 0) {
      if (o[i]! < min[i]! || o[i]! > max[i]!) return undefined;
      continue;
    }
    let t0 = (min[i]! - o[i]!) / d[i]!, t1 = (max[i]! - o[i]!) / d[i]!;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) { near = t0; axis = i; }
    far = Math.min(far, t1);
    if (near > far) return undefined;
  }
  if (far < 0 || axis === -1 || near < 0) return undefined;
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = d[axis]! > 0 ? -1 : 1;
  return { normal, distance: near };
}
