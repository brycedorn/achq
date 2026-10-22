import { type Direction, type Part } from "./design.js";
import { type Ctx } from "./landscape.js";
import { parseState } from "./schematic.js";

type Hull = Extract<Part, { type: "hull" }>;
type Deckhouse = Extract<Part, { type: "deckhouse" }>;

/** Blocks whose sides join their neighbours through `north`/`east`/`south`/`west` properties. */
const JOINS = /(_pane|_fence|iron_bars|_wall)$/;
const SIDES: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Hull space: `s` blocks from the transom towards the bow, `t` blocks across from the centre line. Returns
 * the volume column of a point, and the compass direction of a step `(ds, dt)`.
 */
export function hullSpace(bow: Direction, stern: number, center: number) {
  const sign = bow === "south" || bow === "east" ? 1 : -1;
  const alongZ = bow === "south" || bow === "north";
  const at = (s: number, t: number): [number, number] => (alongZ ? [center + t, stern + sign * s] : [stern + sign * s, center + t]);
  const toward = (ds: number, dt: number): Direction => {
    const [dx, dz] = alongZ ? [dt, sign * ds] : [sign * ds, dt];
    return dx > 0 ? "east" : dx < 0 ? "west" : dz > 0 ? "south" : "north";
  };
  return { at, toward };
}

/**
 * Render a hull (see `hullPart` in design.ts). Positions are worked out in hull space, then mapped to the
 * volume.
 */
export function hull(ctx: Ctx, part: Hull): void {
  const { set } = ctx;
  const { at } = hullSpace(part.bow, part.stern, part.center);
  const half = (part.beam - 1) / 2;
  const depth = Math.max(part.deckY - part.keelY, 1);
  const bowStart = part.length - part.bowLength;

  /** How far into the bow taper `s` is, from 0 (none) to 1 (the stem). */
  const bowFrac = (s: number) => (s <= bowStart ? 0 : (s - bowStart) / part.bowLength);
  /** The lowest layer of the hull at `s`: the keel, rising towards the bow. */
  const keel = (s: number) => part.keelY + Math.round((depth - 1) * Math.pow(bowFrac(s), 2));
  /** Half-width at `s` and layer `y`, before rounding. */
  const width = (s: number, y: number) => {
    const plan = half * (1 - Math.pow(bowFrac(s), 2)) + 0.5;
    const f = Math.min(Math.max((y - keel(s) + 1) / (part.deckY - keel(s) + 1), 0), 1);
    return plan * (0.4 + 0.6 * Math.sqrt(f));
  };
  const solid = (s: number, t: number, y: number) => s >= 0 && s < part.length && y >= keel(s) && y <= part.deckY && Math.abs(t) <= width(s, y) - 0.5;
  const stripe = (s: number, y: number) => part.stripes.find((st) => st.y === y && (!st.along || (s >= st.along[0] && s <= st.along[1])))?.block;

  for (let s = 0; s < part.length; s++)
    for (let y = keel(s); y <= part.deckY; y++)
      for (let t = -half; t <= half; t++) {
        if (!solid(s, t, y)) continue;
        // The outer face: a neighbouring cell across, along, or below is outside the hull.
        const outer = !solid(s, t - 1, y) || !solid(s, t + 1, y) || !solid(s - 1, t, y) || !solid(s + 1, t, y) || !solid(s, t, y - 1);
        const [x, z] = at(s, t);
        let block = part.shell;
        if (y === part.deckY && !outer) block = part.deck;
        else if (outer) block = stripe(s, y) ?? part.shell;
        set(x, y, z, block);
      }

  if (!part.rail) return;
  const { gaps } = part.rail;
  const open = (s: number) => gaps.some(([a, b]) => s >= a && s <= b);
  const railCells = new Set<string>();
  for (let s = 0; s < part.length; s++)
    for (let t = -half; t <= half; t++) {
      if (!solid(s, t, part.deckY) || open(s)) continue;
      const edge = !solid(s, t - 1, part.deckY) || !solid(s, t + 1, part.deckY) || !solid(s - 1, t, part.deckY) || !solid(s + 1, t, part.deckY);
      if (edge) railCells.add(at(s, t).join(","));
    }
  const { name } = parseState(part.rail.block);
  const joins = JOINS.test(name);
  for (const cell of railCells) {
    const [x, z] = cell.split(",").map(Number) as [number, number];
    let state = part.rail.block;
    if (joins) {
      const has = (dx: number, dz: number) => railCells.has(`${x + dx},${z + dz}`);
      state = `${name}[north=${has(0, -1)},east=${has(1, 0)},south=${has(0, 1)},west=${has(-1, 0)}]`;
    }
    set(x, part.deckY + 1, z, state);
  }
}

/** Render one tier of a superstructure (see `deckhousePart` in design.ts). */
export function deckhouse(ctx: Ctx, part: Deckhouse): void {
  const { set } = ctx;
  const { at, toward } = hullSpace(part.bow, part.stern, part.center);
  const top = part.y + part.height - 1;
  const solid = (s: number, t: number, y: number): boolean => {
    if (y < part.y || y > top) return false;
    const k = y - part.y;
    const front = part.to - part.rake * k;
    const aft = part.from + part.aftRake * k;
    if (s < aft - 1e-9 || s > front + 1e-9) return false;
    let hw = part.halfWidth - part.tumble * k;
    if (part.taper > 0) {
      const f = (s - (front - part.taper)) / part.taper;
      if (f > 0) hw *= Math.sqrt(Math.max(0, 1 - f * f));
    }
    const da = s - aft;
    if (part.radius > 0 && da < part.radius) hw -= part.radius - Math.sqrt(part.radius * part.radius - (part.radius - da) * (part.radius - da));
    return Math.abs(t) <= hw + 1e-9;
  };
  const windowRow = (y: number) => part.windows !== undefined && part.windows.rows.includes(y);
  const reach = Math.ceil(part.halfWidth);
  for (let y = part.y; y <= top; y++)
    for (let s = Math.floor(part.from); s <= Math.ceil(part.to); s++)
      for (let t = -reach; t <= reach; t++) {
        if (!solid(s, t, y)) continue;
        const boundary = SIDES.some(([ds, dt]) => !solid(s + ds, t + dt, y));
        const [x, z] = at(s, t);
        if (y === top && !part.open) {
          set(x, y, z, boundary ? part.trim : part.roof);
          continue;
        }
        if (!boundary) continue; // hollow
        if (!(part.open && y === top) && !solid(s, t, y + 1)) {
          // An exposed wall top: a stair rising towards the part where it continues above, else a slab edge.
          const inward = SIDES.find(([ds, dt]) => solid(s + ds, t + dt, y + 1));
          if (inward && windowRow(y) && !part.windows!.slope) set(x, y, z, part.windows!.block); // stepped glass
          else if (inward) {
            const stair = windowRow(y) ? part.windows!.slope! : part.slope;
            set(x, y, z, `${stair}[facing=${toward(inward[0], inward[1])},half=bottom]`);
          } else set(x, y, z, windowRow(y) ? part.windows!.block : part.trim);
          continue;
        }
        set(x, y, z, windowRow(y) ? part.windows!.block : part.wall);
      }
}
