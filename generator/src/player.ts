import { HALF_WIDTH, HEIGHT, type Shape, shapes, STEP } from "./blocks.js";
import { parseState, type Volume } from "./schematic.js";

export { HALF_WIDTH, HEIGHT, shapes, STEP };

/**
 * Walking as a player does, not as an agent does. AgentCraft's agents hop up a whole block; a player walking (not
 * jumping) steps up at most 0.6 of a block, so a full block, or the tall back of a stair met from the wrong side, is
 * a wall. The player is what Minecraft makes them: a box 0.6 wide and 1.8 tall, here moved a quarter block at a time,
 * against the real shapes of blocks: the tall half of a stair, the thin post and arms of iron bars, panes, fences and
 * walls. So it finds a gap a player slips through (between two bars that only meet at a corner) as well as a ledge
 * too narrow to stand on (the low half of a stair beside a wall). Ladders are climbed and doors opened; water is not
 * walked through. As in the agents' check, a block it does not know is a full block, which only makes it stricter.
 */

/** A fall longer than this hurts a player (damage is the fall less 3): an edge with one must have a railing or a wall. */
export const DROP = 3;
/** The grid a player moves on: four positions to a block each way. */
const GRID = 4;
const EPS = 1e-6;

/** Where a player is: the middle of their box at (qx, qz) in quarter blocks, and the height of their feet. */
export type Spot = { qx: number; qz: number; f: number };
export const spotKey = (s: Spot) => `${s.qx},${s.qz},${s.f}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** The blocks the walk keeps to: `[x0, z0, x1, z1]`, inclusive. */
export type Area = [number, number, number, number];

type Column = { solids: Shape[]; ladders: Set<number> };

export class PlayerWalk {
  private readonly columns = new Map<number, Column>();
  private readonly shapeCache = new Map<number, { shapes: Shape[]; ladder: boolean }>();

  constructor(private readonly volume: Volume, private readonly area: Area) {}

  /** A block column: its solid boxes in absolute coordinates, and the layers that hold a ladder. */
  private column(x: number, z: number): Column {
    const k = x * 65536 + z;
    const hit = this.columns.get(k);
    if (hit) return hit;
    const col: Column = { solids: [], ladders: new Set() };
    if (x >= 0 && z >= 0 && x < this.volume.width && z < this.volume.length)
      for (let y = 0; y < this.volume.height; y++) {
        const id = this.volume.idAt(x, y, z);
        if (id === 0) continue;
        let s = this.shapeCache.get(id);
        if (!s) {
          const state = this.volume.stateOf(id);
          this.shapeCache.set(id, (s = { shapes: shapes(state), ladder: parseState(state).name === "minecraft:ladder" }));
        }
        if (s.ladder) col.ladders.add(y);
        for (const b of s.shapes) col.solids.push({ x0: x + b.x0, z0: z + b.z0, x1: x + b.x1, z1: z + b.z1, lo: y + b.lo, hi: y + b.hi, standable: b.standable });
      }
    this.columns.set(k, col);
    return col;
  }

  /** The extent of a player's box at (qx, qz), and the block columns it overlaps. */
  private box(qx: number, qz: number) {
    const [cx, cz] = [qx / GRID, qz / GRID];
    const b = { x0: cx - HALF_WIDTH, x1: cx + HALF_WIDTH, z0: cz - HALF_WIDTH, z1: cz + HALF_WIDTH };
    const blocks: [number, number][] = [];
    for (let x = Math.floor(b.x0); x <= Math.floor(b.x1 - EPS); x++) for (let z = Math.floor(b.z0); z <= Math.floor(b.z1 - EPS); z++) blocks.push([x, z]);
    return { ...b, blocks };
  }

  /** The solid boxes a player's box at (qx, qz) overlaps across (at any height), and whether a ladder is there at a layer. */
  private around(qx: number, qz: number): { solids: Shape[]; ladder: (y: number) => boolean } {
    const b = this.box(qx, qz);
    const cols = b.blocks.map(([x, z]) => this.column(x, z));
    const solids: Shape[] = [];
    for (const c of cols) for (const s of c.solids) if (s.x0 < b.x1 - EPS && s.x1 > b.x0 + EPS && s.z0 < b.z1 - EPS && s.z1 > b.z0 + EPS) solids.push(s);
    return { solids, ladder: (y) => cols.some((c) => c.ladders.has(y)) };
  }

  private static clear(solids: Shape[], a: number, b: number): boolean {
    return solids.every((s) => s.hi <= a + EPS || s.lo >= b - EPS);
  }

  /** The highest top among `solids` at most a step above `f`. */
  private static landing(solids: Shape[], f: number): Shape | undefined {
    let best: Shape | undefined;
    for (const s of solids) if (s.hi <= f + STEP + EPS && (!best || s.hi > best.hi)) best = s;
    return best;
  }

  private inArea(qx: number, qz: number): boolean {
    const [x0, z0, x1, z1] = this.area;
    return qx >= x0 * GRID && qx <= (x1 + 1) * GRID && qz >= z0 * GRID && qz <= (z1 + 1) * GRID;
  }

  /**
   * Where the feet come to rest with the box at (qx, qz), arriving with the feet at `f`: on the highest top under it
   * that is at most a step up, or held at `f` by a ladder (or just over its top rung, as climbing carries a player
   * past it onto the floor beside); undefined if that is water or a railing, or if there is no room to stand.
   */
  private rest(qx: number, qz: number, f: number): number | undefined {
    const { solids, ladder } = this.around(qx, qz);
    const best = PlayerWalk.landing(solids, f);
    const layer = Math.floor(f + EPS);
    let g: number;
    if ((ladder(layer) || ladder(layer - 1)) && (!best || best.hi < f)) g = f;
    else if (best && best.standable) g = best.hi;
    else return undefined;
    return PlayerWalk.clear(solids, g, g + HEIGHT) ? g : undefined;
  }

  /** Where a player at `s` gets to walking a quarter block in (dx, dz), if they can. */
  move(s: Spot, dx: number, dz: number): Spot | undefined {
    const [qx, qz] = [s.qx + dx, s.qz + dz];
    if (!this.inArea(qx, qz)) return undefined;
    const g = this.rest(qx, qz, s.f);
    // Stepping up, the head rises before the feet move on: there must be room overhead where they are too.
    if (g === undefined || (g > s.f && !PlayerWalk.clear(this.around(s.qx, s.qz).solids, s.f, g + HEIGHT))) return undefined;
    return { qx, qz, f: g };
  }

  /** Whether the middle of a player at `s` is over what they stand on, not out over an edge on its rim. */
  centred(s: Spot): boolean {
    const [cx, cz] = [s.qx / GRID, s.qz / GRID];
    const r = 0.1;
    return [[cx - r, cz - r], [cx + r, cz - r], [cx - r, cz + r], [cx + r, cz + r]].every(([x, z]) =>
      this.column(Math.floor(x!), Math.floor(z!)).solids.some((b) => b.standable && Math.abs(b.hi - s.f) < EPS && b.x0 <= x! && b.x1 >= x! && b.z0 <= z! && b.z1 >= z!),
    );
  }

  /** Every spot a player can get to from `s` in one move: a quarter block any of four ways, or a rung up or down a ladder. */
  next(s: Spot): Spot[] {
    const out: Spot[] = [];
    for (const [dx, dz] of DIRS) {
      const n = this.move(s, dx, dz);
      if (n) out.push(n);
    }
    const here = this.around(s.qx, s.qz);
    const layer = Math.floor(s.f + EPS);
    for (const [dy, rung] of [[1, layer], [-1, layer - 1]] as const) {
      if (!here.ladder(rung)) continue;
      const g = this.rest(s.qx, s.qz, s.f + dy);
      if (g === s.f + dy) out.push({ ...s, f: g });
    }
    return out;
  }

  /**
   * How far a player at `s` would fall walking a quarter block in (dx, dz), when nothing stops them: a drop of more
   * than `DROP` blocks onto something solid, or into the void. Undefined when it is less, when a wall or railing is in
   * the way, or when the landing is water or the fall passes a ladder.
   */
  drop(s: Spot, dx: number, dz: number): number | undefined {
    const [qx, qz] = [s.qx + dx, s.qz + dz];
    if (!this.inArea(qx, qz)) return undefined;
    const { solids, ladder } = this.around(qx, qz);
    const best = PlayerWalk.landing(solids, s.f);
    if (best && !best.standable) return undefined;
    const landing = best ? best.hi : -Infinity;
    if (!PlayerWalk.clear(solids, landing, s.f + HEIGHT)) return undefined;
    // Falling past a ladder is safe: a player catches it on the way down.
    for (let y = Math.floor(s.f + EPS); y >= Math.max(Math.floor(landing), 0); y--) if (ladder(y)) return undefined;
    const fall = s.f - landing;
    return fall > DROP + EPS ? fall : undefined;
  }

  /** Whether a player at `s` is on a ladder (or just over its top rung). */
  climbing(s: Spot): boolean {
    const layer = Math.floor(s.f + EPS);
    const { ladder } = this.around(s.qx, s.qz);
    return ladder(layer) || ladder(layer - 1);
  }

  /** Where a player put down in the middle of the block (x, z), with the feet at about `y`, comes to rest. */
  standAt(x: number, y: number, z: number): Spot | undefined {
    const [qx, qz] = [x * GRID + GRID / 2, z * GRID + GRID / 2];
    const f = this.rest(qx, qz, y + 0.5);
    return f === undefined ? undefined : { qx, qz, f };
  }

  /** Whether a spot has a player standing in the block (x, z), with the feet within the block layer `y`. */
  static over(s: Spot, x: number, y: number, z: number): boolean {
    return Math.floor(s.qx / GRID) === x && Math.floor(s.qz / GRID) === z && s.f >= y - 0.5 - EPS && s.f < y + 1 - EPS;
  }

  /** The blocks that hold a player at `s` up: under their box, with a top at their feet. */
  support(s: Spot): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (const b of this.around(s.qx, s.qz).solids)
      if (b.standable && Math.abs(b.hi - s.f) < EPS) out.push([Math.floor(b.x0 + EPS), Math.ceil(b.hi - EPS) - 1, Math.floor(b.z0 + EPS)]);
    return out;
  }

  /**
   * From `start`, every spot a player can walk to (`there`), and the keys of those they can also walk back from
   * (`back`): a drop they cannot climb takes them somewhere they cannot return from.
   */
  explore(start: Spot): { there: Map<string, Spot>; back: Set<string> } {
    const there = new Map<string, Spot>([[spotKey(start), start]]);
    const into = new Map<string, string[]>();
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const s = queue[head]!;
      const k = spotKey(s);
      for (const n of this.next(s)) {
        const nk = spotKey(n);
        const from = into.get(nk);
        if (from) from.push(k);
        else into.set(nk, [k]);
        if (!there.has(nk)) {
          there.set(nk, n);
          queue.push(n);
        }
      }
    }
    const back = new Set([spotKey(start)]);
    const todo = [...back];
    while (todo.length > 0)
      for (const p of into.get(todo.pop()!) ?? [])
        if (!back.has(p)) {
          back.add(p);
          todo.push(p);
        }
    return { there, back };
  }
}

/** The block a spot is in, for messages. */
export function blockOf(s: Spot): [number, number, number] {
  return [Math.floor(s.qx / 4), Math.floor(s.f + EPS), Math.floor(s.qz / 4)];
}
