import { type Direction, type Part } from "./design.js";
import { type Ctx } from "./landscape.js";

type Of<T extends Part["type"]> = Extract<Part, { type: T }>;
type Cell = [number, number, number];

const AIR = "minecraft:air";
const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const DIR_OF = (dx: number, dz: number): Direction => (dx > 0 ? "east" : dx < 0 ? "west" : dz > 0 ? "south" : "north");
const isFence = (s: string) => /_fence(\[|$)/.test(s);

/** Join each fence in `cells` to the fences beside it, as the game does when they are placed by hand. */
function linkFences(ctx: Ctx, cells: Iterable<Cell>, rail: string, also: (x: number, y: number, z: number) => boolean = () => false): void {
  const { v } = ctx;
  const at = (x: number, y: number, z: number) => (x >= 0 && y >= 0 && z >= 0 && x < v.width && y < v.height && z < v.length ? v.get(x, y, z) : AIR);
  const joins = (x: number, y: number, z: number) => isFence(at(x, y, z)) || also(x, y, z);
  for (const [x, y, z] of cells) {
    if (!isFence(at(x, y, z))) continue;
    const name = at(x, y, z).replace(/\[.*$/, "") || rail;
    v.set(x, y, z, `${name}[east=${joins(x + 1, y, z)},north=${joins(x, y, z - 1)},south=${joins(x, y, z + 1)},waterlogged=false,west=${joins(x - 1, y, z)}]`);
  }
}

/** A rope bridge (see `bridge` in `design.ts`). */
export function bridge(ctx: Ctx, part: Of<"bridge">): void {
  const { set, v } = ctx;
  const [x0, y0, z0] = part.from;
  const [x1, y1, z1] = part.to;
  if (x0 !== x1 && z0 !== z1) throw new Error(`bridge '${part.id}' must run along X or along Z`);
  const alongX = z0 === z1;
  const n = Math.abs(alongX ? x1 - x0 : z1 - z0) + 1;
  const [ax, az] = alongX ? [Math.sign(x1 - x0) || 1, 0] : [0, Math.sign(z1 - z0) || 1];
  // Lanes run to the south of a bridge along X, to the east of one along Z; the rails stand one beyond them.
  const [cx, cz] = alongX ? [0, 1] : [1, 0];
  const cell = (i: number, k: number): [number, number] => [x0 + ax * i + cx * k, z0 + az * i + cz * k];

  // The deck's layer along the bridge: the straight line between the ends, less a parabola of `sag`, with no single
  // block left lower than both its neighbours.
  const h = Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return Math.round(y0 + (y1 - y0) * t - part.sag * 4 * t * (1 - t));
  });
  for (let pass = 0; pass < n; pass++)
    for (let i = 1; i < n - 1; i++) if (h[i - 1]! > h[i]! && h[i + 1]! > h[i]!) h[i] = Math.min(h[i - 1]!, h[i + 1]!);
  for (let i = 1; i < n; i++) if (Math.abs(h[i]! - h[i - 1]!) > 1) throw new Error(`bridge '${part.id}' rises more than a block at a time; make it longer or the ends closer in height`);

  // A stair on each cell whose neighbour along the bridge is a block higher, rising to it.
  const stair = h.map((y, i) => (h[i + 1] === y + 1 ? DIR_OF(ax, az) : h[i - 1] === y + 1 ? DIR_OF(-ax, -az) : undefined));
  /** The layer of the block a player stands on. */
  const surface = (i: number) => h[i]! + (stair[i] ? 1 : 0);

  // Room over the deck, and over the cell past each end (which opens the railing of what the bridge meets).
  for (let i = -1; i <= n; i++) {
    const j = Math.min(Math.max(i, 0), n - 1);
    for (let k = 0; k < part.width; k++) {
      const [x, z] = cell(i, k);
      for (let y = surface(j) + 1; y <= surface(j) + 3; y++) if (x >= 0 && z >= 0 && x < v.width && z < v.length && y < v.height) set(x, y, z, AIR);
    }
  }
  const rails: Cell[] = [];
  for (let i = 0; i < n; i++) {
    for (let k = -1; k <= part.width; k++) {
      const [x, z] = cell(i, k);
      set(x, h[i]!, z, part.deck);
      if (k >= 0 && k < part.width) {
        if (stair[i]) set(x, h[i]! + 1, z, `${part.steps}[facing=${stair[i]},half=bottom]`);
        continue;
      }
      const end = i === 0 || i === n - 1;
      const tall = surface(i) + 1;
      for (let y = h[i]! + 1; y <= tall; y++) {
        if (end && part.posts) set(x, y, z, part.posts);
        else {
          set(x, y, z, part.rail);
          rails.push([x, y, z]);
        }
      }
      if (part.lanterns && (end ? part.posts !== undefined : i % part.lanterns.every === 0 && (Math.floor(i / part.lanterns.every) % 2 === 0) === (k < 0)))
        set(x, tall + 1, z, part.lanterns.block);
    }
  }
  // Rails join each other, the end posts and the fences they meet.
  const posts = new Set<string>();
  if (part.posts) for (const i of [0, n - 1]) for (const k of [-1, part.width]) for (let y = h[i]! + 1; y <= surface(i) + 1; y++) posts.add(`${cell(i, k)[0]},${y},${cell(i, k)[1]}`);
  const near: Cell[] = [...rails];
  for (const i of [-1, n]) for (const k of [-1, part.width]) for (let y = surface(Math.min(Math.max(i, 0), n - 1)); y <= surface(Math.min(Math.max(i, 0), n - 1)) + 2; y++) near.push([cell(i, k)[0], y, cell(i, k)[1]]);
  linkFences(ctx, near, part.rail, (x, y, z) => posts.has(`${x},${y},${z}`));
}

/** A square spiral stair (see `spiral` in `design.ts`). */
export function spiral(ctx: Ctx, part: Of<"spiral">): void {
  const { set, v } = ctx;
  const [cx, cz] = part.center;
  const { inner: I, width: w } = part;
  if (part.top <= part.bottom) throw new Error(`spiral '${part.id}': top must be above bottom`);
  if (I < 2) throw new Error(`spiral '${part.id}': inner must be at least 2, so each side has a flight of stairs`);
  const order: Direction[] = part.turn === "clockwise" ? ["north", "east", "south", "west"] : ["north", "west", "south", "east"];
  /** The way a player walks down along a side: clockwise, along the north side eastwards. */
  const along = (side: Direction): [number, number] => {
    const [nx, nz] = STEP[side];
    return part.turn === "clockwise" ? [-nz, nx] : [nz, -nx];
  };
  const inside = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < v.width && y < v.height && z < v.length;
  const own = new Set<string>();
  const put = (x: number, y: number, z: number, state: string) => {
    if (!inside(x, y, z)) return;
    set(x, y, z, state);
    own.add(`${x},${y},${z}`);
  };
  /** Floors the stair is cut through: the layer of each opened block and the lowest a player stands below it. */
  const opened = new Map<string, [number, number, number, number]>();
  /** Room over a step for a player walking down it (1.8 tall), carved through anything built above. */
  const headroom = (x: number, y: number, z: number, low: number) => {
    for (let t = y + 1; t <= y + 3; t++) {
      if (!inside(x, t, z) || own.has(`${x},${t},${z}`)) continue;
      if (v.get(x, t, z) !== AIR && ctx.claimed(x, t, z)) opened.set(`${x},${t},${z}`, [x, t, z, low]);
      set(x, t, z, AIR);
    }
  };
  const rails: Cell[] = [];
  const rail = (x: number, y: number, z: number) => {
    for (const t of [y, y + 1]) {
      // Where the stair passes under a floor, the floor's own edge guards it.
      if (own.has(`${x},${t},${z}`) || ctx.claimed(x, t, z)) continue;
      put(x, t, z, part.rail);
      rails.push([x, t, z]);
    }
  };

  const n = 2 * I - 1;
  let L = part.top;
  let side = order.indexOf(part.start);
  let done = false;
  while (!done) {
    const s = order[side % 4]!;
    const [nx, nz] = STEP[s];
    const [ax, az] = along(s);
    const at = (p: number, q: number): [number, number] => [cx + ax * p + nx * q, cz + az * p + nz * q];
    const facing = DIR_OF(-ax, -az);
    for (let j = 0; j < n; j++) {
      const p = j - (I - 1);
      const y = L - j;
      const ground = y <= part.bottom;
      for (let q = I; q < I + w; q++) {
        const [x, z] = at(p, q);
        headroom(x, ground ? part.bottom : y, z, ground ? part.bottom + 1 : y + 0.5);
        if (ground) put(x, part.bottom, z, part.landing);
        else {
          put(x, y, z, `${part.steps}[facing=${facing},half=bottom]`);
          if (inside(x, y - 1, z) && v.get(x, y - 1, z) === AIR) put(x, y - 1, z, part.stringer);
        }
      }
      if (ground) done = true;
      else {
        const [x, z] = at(p, I + w);
        rail(x, y, z);
      }
    }
    if (done) break;
    // The corner landing, a block below the last step.
    L -= n;
    const ground = L <= part.bottom;
    const y = ground ? part.bottom : L;
    for (let p = I; p <= I + w; p++)
      for (let q = I; q <= I + w; q++) {
        const [x, z] = at(p, q);
        if (p < I + w && q < I + w) {
          headroom(x, y, z, y + 1);
          put(x, y, z, part.landing);
        } else if (!ground) rail(x, y, z);
      }
    // A lamp on the newel post at the outer corner of each landing.
    if (!ground && part.lamp) {
      const [x, z] = at(I + w, I + w);
      if (own.has(`${x},${y + 1},${z}`) && inside(x, y + 2, z) && v.get(x, y + 2, z) === AIR) put(x, y + 2, z, part.lamp);
    }
    if (ground) break;
    side++;
  }
  // Where the stair opens a floor, a rail on the floor's edge wherever the drop into the opening would hurt (over 3).
  for (const [x, t, z, low] of opened.values()) {
    if (t + 1 - low <= 3) continue;
    for (const [dx, dz] of Object.values(STEP)) {
      const [nx, nz] = [x + dx, z + dz];
      if (!inside(nx, t + 1, nz) || opened.has(`${nx},${t},${nz}`) || own.has(`${nx},${t},${nz}`)) continue;
      if (v.get(nx, t, nz) === AIR || !ctx.claimed(nx, t, nz) || v.get(nx, t + 1, nz) !== AIR) continue;
      put(nx, t + 1, nz, part.rail);
      rails.push([nx, t + 1, nz]);
    }
  }
  // The column inside: a ring of `core` just inside the stair, wherever nothing stands yet.
  for (let y = part.bottom; y <= part.top; y++)
    for (let dx = -(I - 1); dx <= I - 1; dx++)
      for (let dz = -(I - 1); dz <= I - 1; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== I - 1) continue;
        const [x, z] = [cx + dx, cz + dz];
        if (inside(x, y, z) && v.get(x, y, z) === AIR && !ctx.claimed(x, y, z)) put(x, y, z, part.core);
      }
  linkFences(ctx, rails, part.rail);
}
