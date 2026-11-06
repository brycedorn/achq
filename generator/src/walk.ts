import { parseState, type Volume } from "./schematic.js";

/** Same constants as the mod's `GridPathfinder`. */
const THIN = 0.125;
const STANDABLE = 0.9;
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

const NO_COLLISION = /(_button|_sign|_pressure_plate|:(air|cave_air|void_air|light|torch|wall_torch|redstone_wire|vine|short_grass|tall_grass|fern))$/;

/**
 * Max Y of a block's collision shape, or undefined when it has none. Only blocks the generator
 * places are modelled exactly; anything unknown counts as a full block, which can only make the
 * check stricter, never let an unwalkable layout through.
 */
export function collisionTop(state: string): number | undefined {
  const { name, properties } = parseState(state);
  if (NO_COLLISION.test(name)) return undefined;
  if (name.endsWith("_slab")) return properties["type"] === "top" || properties["type"] === "double" ? 1 : 0.5;
  if (name.endsWith("_carpet")) return 0.0625;
  if (name === "minecraft:lantern" || name === "minecraft:soul_lantern") return properties["hanging"] === "true" ? 1 : 0.5625;
  return 1;
}

/** Walkability of a block volume in its own local coordinates, mirroring the mod's A* rules. */
export class Walk {
  constructor(private readonly volume: Volume) {}

  private inside(x: number, y: number, z: number): boolean {
    const v = this.volume;
    return x >= 0 && x < v.width && y >= 0 && y < v.height && z >= 0 && z < v.length;
  }

  /** Collision top of the block at (x, y, z); undefined for air, no-collision blocks and out-of-volume cells. */
  top(x: number, y: number, z: number): number | undefined {
    const id = this.volume.idAt(x, y, z);
    if (id === 0) return undefined;
    // Cached per palette id: big volumes call this millions of times with a few dozen distinct states.
    if (!this.tops.has(id)) this.tops.set(id, collisionTop(this.volume.stateOf(id)));
    return this.tops.get(id);
  }

  private readonly tops = new Map<number, number | undefined>();

  /** Feet height of a walkable cell, or undefined when an agent cannot stand there. */
  floor(x: number, y: number, z: number): number | undefined {
    if (!this.inside(x, y, z)) return undefined;
    let feetTop = this.top(x, y, z);
    if (feetTop === undefined) feetTop = 0;
    else if (feetTop > THIN) return undefined;
    if (this.top(x, y + 1, z) !== undefined) return undefined;
    if (feetTop === 0 && (this.top(x, y - 1, z) ?? 0) < STANDABLE) return undefined;
    return y + feetTop;
  }

  /** The walkable cell an agent at (x, y, z) stands in, searching one block up and down. */
  cellAt(x: number, y: number, z: number): [number, number, number] | undefined {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const cy = Math.floor(y + 0.01);
    for (const dy of [0, 1, -1]) if (this.floor(cx, cy + dy, cz) !== undefined) return [cx, cy + dy, cz];
    return undefined;
  }

  /** Every cell reachable from `start` with the mod's moves: 8 directions, no corner cutting, 1-block steps. */
  reachable(start: readonly [number, number, number]): Set<string> {
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const seen = new Set<string>([key(...start)]);
    const queue: [number, number, number][] = [[...start]];
    for (let head = 0; head < queue.length; head++) {
      const [x, y, z] = queue[head]!;
      for (const [dx, dz] of DIRS) {
        const diagonal = dx !== 0 && dz !== 0;
        for (const dy of diagonal ? [0] : [0, 1, -1]) {
          const [nx, ny, nz] = [x + dx, y + dy, z + dz];
          if (seen.has(key(nx, ny, nz)) || this.floor(nx, ny, nz) === undefined) continue;
          if (dy === 1 && this.top(x, y + 2, z) !== undefined) continue;
          if (diagonal && (this.floor(x + dx, y, z) === undefined || this.floor(x, y, z + dz) === undefined)) continue;
          seen.add(key(nx, ny, nz));
          queue.push([nx, ny, nz]);
        }
      }
    }
    return seen;
  }

  /**
   * The length of the shortest walk from `start` to every reachable cell, priced as the mod's A* prices it
   * (`GridPathfinder`): 1 a straight step, 1.414 a diagonal, 0.6 more for a step up or down.
   */
  distances(start: readonly [number, number, number]): Map<string, number> {
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
    const best = new Map<string, number>([[key(...start), 0]]);
    // A binary heap of [cost, x, y, z].
    const heap: [number, number, number, number][] = [[0, ...start]];
    const push = (e: [number, number, number, number]) => {
      heap.push(e);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (heap[p]![0] <= heap[i]![0]) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const [l, r] = [2 * i + 1, 2 * i + 2];
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };
    while (heap.length > 0) {
      const [g, x, y, z] = pop();
      if (g > best.get(key(x, y, z))!) continue;
      for (const [dx, dz] of DIRS) {
        const diagonal = dx !== 0 && dz !== 0;
        for (const dy of diagonal ? [0] : [0, 1, -1]) {
          const [nx, ny, nz] = [x + dx, y + dy, z + dz];
          if (this.floor(nx, ny, nz) === undefined) continue;
          if (dy === 1 && this.top(x, y + 2, z) !== undefined) continue;
          if (diagonal && (this.floor(x + dx, y, z) === undefined || this.floor(x, y, z + dz) === undefined)) continue;
          const cost = g + (diagonal ? Math.SQRT2 : 1) + (dy !== 0 ? 0.6 : 0);
          const k = key(nx, ny, nz);
          if (cost >= (best.get(k) ?? Infinity)) continue;
          best.set(k, cost);
          push([cost, nx, ny, nz]);
        }
      }
    }
    return best;
  }
}
