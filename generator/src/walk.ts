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
    return this.inside(x, y, z) ? collisionTop(this.volume.get(x, y, z)) : undefined;
  }

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
}
