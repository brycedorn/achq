import { type Direction, type Part } from "./design.js";
import { type Ctx, hash2, valueNoise } from "./landscape.js";

type Hillside = Extract<Part, { type: "hillside" }>;
type Beach = Extract<Part, { type: "beach" }>;

const AIR = "minecraft:air";
const FLIP: Record<Direction, Direction> = { north: "south", south: "north", east: "west", west: "east" };
const colKey = (x: number, z: number) => x + z * 100_000;

/**
 * A building's own frame: `u` along its front (0 to `len` - 1), `w` from the front wall (0) to the back
 * (`dep` - 1), the front facing `front`. Negative `w` is outside, in front.
 */
function frame(front: Direction, cx: number, cz: number, len: number, dep: number) {
  const u0 = Math.floor(len / 2);
  const w0 = Math.floor(dep / 2);
  const at = (u: number, w: number): [number, number] => {
    switch (front) {
      case "south":
        return [cx - u0 + u, cz + w0 - w];
      case "north":
        return [cx + u0 - u, cz - w0 + w];
      case "east":
        return [cx + w0 - w, cz + u0 - u];
      case "west":
        return [cx - w0 + w, cz - u0 + u];
    }
  };
  // The compass directions of +u and +w (into the building).
  const plusU: Direction = { south: "east", north: "west", east: "north", west: "south" }[front] as Direction;
  const inward = FLIP[front];
  return { at, plusU, minusU: FLIP[plusU], inward };
}

/** Render a hill town (see `hillsidePart` in design.ts). */
export function hillside(ctx: Ctx, part: Hillside): void {
  const { design } = ctx;
  const g = ctx.ground.get(part.on)!;
  const seed = design.seed + 101;
  const taken: [number, number, number, number][] = [];

  /** How close the nearest lane is, up to `r` columns away (Infinity beyond). */
  const laneDistance = (x: number, z: number, r: number) => {
    let best = Infinity;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (g.keepClear.has(colKey(x + dx, z + dz))) best = Math.min(best, Math.hypot(dx, dz));
    return best;
  };
  const height = (x: number, z: number) => g.height(x, z);

  if (part.church) church(ctx, part, part.church, taken);

  let placed = 0;
  for (let attempt = 0; placed < part.houses && attempt < part.houses * 60; attempt++) {
    const r = (salt: number) => hash2(attempt, salt, seed);
    // A site inside an irregular edge, denser near the middle and along the lanes.
    const angle = r(1) * Math.PI * 2;
    const edge = part.radius * (0.7 + 0.45 * (valueNoise(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, seed + 3) + 1) / 2);
    const dist = Math.sqrt(r(2)) * edge;
    const cx = Math.round(part.at[0] + Math.cos(angle) * dist);
    const cz = Math.round(part.at[1] + Math.sin(angle) * dist * 0.85);
    const lane = laneDistance(cx, cz, 9);
    const keep = (lane <= 9 ? 1 : 0.35) * Math.pow(1 - dist / edge, 0.4);
    if (r(3) > keep) continue;

    // Along the contour: the front faces down the slope.
    const h0 = height(cx, cz);
    if (h0 === undefined) continue;
    const gx = (height(cx + 3, cz) ?? h0) - (height(cx - 3, cz) ?? h0);
    const gz = (height(cx, cz + 3) ?? h0) - (height(cx, cz - 3) ?? h0);
    const front: Direction = Math.abs(gz) >= Math.abs(gx) ? (gz <= 0 ? "south" : "north") : gx <= 0 ? "east" : "west";
    const big = r(4) < 0.3;
    const len = big ? 9 + Math.floor(r(5) * 3) : 6 + Math.floor(r(5) * 3);
    const dep = big ? 7 : 5 + Math.floor(r(6) * 2);
    const f = frame(front, cx, cz, len, dep);

    // Survey the footprint and a border: no lanes, sea or other buildings, and not too steep.
    let lo = Infinity;
    let hi = -Infinity;
    const heights: number[] = [];
    let ok = true;
    let xs0 = Infinity, xs1 = -Infinity, zs0 = Infinity, zs1 = -Infinity;
    for (let u = -1; u <= len && ok; u++)
      for (let w = -1; w <= dep && ok; w++) {
        const [x, z] = f.at(u, w);
        const h = height(x, z);
        if (h === undefined || g.keepClear.has(colKey(x, z))) ok = false;
        else {
          for (let dy = 1; dy <= 6 && ok; dy++) if (ctx.claimed(x, h + dy, z)) ok = false;
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          if (u >= 0 && u < len && w >= 0 && w < dep) heights.push(h);
          [xs0, xs1, zs0, zs1] = [Math.min(xs0, x), Math.max(xs1, x), Math.min(zs0, z), Math.max(zs1, z)];
        }
      }
    if (!ok || hi - lo > part.maxSlope) continue;
    if (taken.some((t) => xs0 <= t[2] + 1 && xs1 >= t[0] - 1 && zs0 <= t[3] + 1 && zs1 >= t[1] - 1)) continue;
    heights.sort((a, b) => a - b);
    const floor = heights[Math.floor(heights.length / 2)]!;
    house(ctx, part, f, len, dep, floor, r);
    taken.push([xs0, zs0, xs1, zs1]);
    placed++;
  }
}

type Frame = ReturnType<typeof frame>;

function house(ctx: Ctx, part: Hillside, f: Frame, len: number, dep: number, floor: number, r: (salt: number) => number): void {
  const { set } = ctx;
  const g = ctx.ground.get(part.on)!;
  const inner = part.interior;
  const pick = <T>(list: readonly T[], salt: number): T => list[Math.min(Math.floor(r(salt) * list.length), list.length - 1)]!;
  const put = (u: number, w: number, y: number, state: string) => {
    const [x, z] = f.at(u, w);
    set(x, y, z, state);
  };
  /** Place outside the footprint only where nothing else stands. */
  const putFree = (u: number, w: number, y: number, state: string) => {
    const [x, z] = f.at(u, w);
    if (!ctx.claimed(x, y, z) && (g.height(x, z) ?? -1) < y) set(x, y, z, state);
  };
  const ground = (u: number, w: number) => g.height(...f.at(u, w)) ?? floor;
  const wall = pick(part.walls, 10);
  const roof = pick(part.roofs, 11);
  const shutter = pick(part.shutters, 12);
  const storeys = len >= 7 && r(13) < part.twoStorey ? 2 : 1;
  const wallTop = floor + 4 * storeys;
  const outer = (u: number, w: number) => u === 0 || u === len - 1 || w === 0 || w === dep - 1;
  const quoins = r(14) < 0.35;

  // What lies under the floor: on the downhill side a lower storey of wall down to the ground.
  for (let u = 0; u < len; u++)
    for (let w = 0; w < dep; w++) {
      const h = ground(u, w);
      for (let y = h + 1; y < floor; y++) put(u, w, y, outer(u, w) ? wall : part.stone);
      if (h >= floor) for (let y = floor + 1; y <= h; y++) put(u, w, y, AIR); // cut into the hill
    }
  // Walls, floors and ceilings, hollow inside.
  for (let u = 0; u < len; u++)
    for (let w = 0; w < dep; w++)
      for (let y = floor; y <= wallTop; y++) {
        if (outer(u, w)) {
          const corner = (u === 0 || u === len - 1) && (w === 0 || w === dep - 1);
          put(u, w, y, quoins && corner ? part.stone : wall);
        } else put(u, w, y, (y - floor) % 4 === 0 ? inner.floor : AIR);
      }

  // The front door, a stone lintel, and the way up to it.
  const doorU = 1 + Math.floor(r(15) * (len - 2));
  put(doorU, 0, floor + 1, `${part.door}[facing=${FLIP[f.inward]},half=lower,hinge=left,open=false]`);
  put(doorU, 0, floor + 2, `${part.door}[facing=${FLIP[f.inward]},half=upper,hinge=left,open=false]`);
  put(doorU, 0, floor + 3, part.stone);
  const drop = floor - ground(doorU, -1);
  if (drop <= 0) {
    for (let y = floor + 1; y <= floor + 3; y++) putFree(doorU, -1, y, AIR);
  } else if (drop === 1) {
    putFree(doorU, -1, floor, `${inner.step}[facing=${f.inward},half=bottom]`);
  } else {
    // A landing at the door and steps down along the front, the way island houses climb.
    putFree(doorU, -1, floor, part.stone);
    for (let y = ground(doorU, -1) + 1; y < floor; y++) putFree(doorU, -1, y, part.stone);
    const dir = doorU + drop <= len ? 1 : -1;
    const up = dir > 0 ? f.minusU : f.plusU;
    for (let i = 1; i < drop; i++) {
      const u = doorU + dir * i;
      const y = floor - i;
      putFree(u, -1, y, `${inner.step}[facing=${up},half=bottom]`);
      for (let yy = ground(u, -1) + 1; yy < y; yy++) putFree(u, -1, yy, part.stone);
    }
  }
  // A cellar door into a tall lower storey.
  const below = floor - ground(len - 2 - (doorU === len - 2 ? 1 : 0), -1);
  if (below >= 4) {
    const cu = doorU === len - 2 ? len - 3 : len - 2;
    const base = ground(cu, -1);
    put(cu, 0, base + 1, `${part.door}[facing=${FLIP[f.inward]},half=lower,hinge=right,open=false]`);
    put(cu, 0, base + 2, `${part.door}[facing=${FLIP[f.inward]},half=upper,hinge=right,open=false]`);
  }

  // Windows with open shutters on the front, plainer ones round the sides and back.
  const shutterAt = (u: number, y: number) => putFree(u, -1, y, `${shutter}[facing=${FLIP[f.inward]},half=bottom,open=true]`);
  for (let s = 0; s < storeys; s++) {
    const y = floor + 2 + 4 * s;
    for (let u = 1 + (r(16) < 0.5 ? 0 : 1); u < len - 1; u += 2) {
      if (s === 0 && Math.abs(u - doorU) <= 0) continue;
      put(u, 0, y, inner.glass);
      shutterAt(u - 1, y);
      shutterAt(u + 1, y);
    }
    for (let u = 2; u < len - 2; u += 3) put(u, dep - 1, y, inner.glass);
    put(0, Math.floor(dep / 2), y, inner.glass);
    put(len - 1, Math.floor(dep / 2), y, inner.glass);
  }

  // A balcony on two-storey houses: a slab on brackets, a railing, a door out of the upper room.
  if (storeys === 2 && r(17) < 0.6) {
    const bu = Math.max(1, Math.min(len - 4, doorU - 1));
    for (let u = bu; u < bu + 3; u++) {
      putFree(u, -1, floor + 4, `${inner.table.replace(/\[.*/, "")}[type=top]`);
      putFree(u, -1, floor + 5, `${shutter}[facing=${f.inward},half=bottom,open=true]`);
    }
    put(bu + 1, 0, floor + 5, AIR);
    put(bu + 1, 0, floor + 6, AIR);
    putFree(bu, -1, floor + 6, pick(part.pots, 18));
  }

  // The roof.
  if (r(19) < part.flat) {
    // Flat, with a parapet and a terrace: a vine-covered pergola over a table, or pots along the edge.
    for (let u = 0; u < len; u++) for (let w = 0; w < dep; w++) if (!outer(u, w)) put(u, w, wallTop, part.terrace);
    for (let u = 0; u < len; u++) for (let w = 0; w < dep; w++) if (outer(u, w)) put(u, w, wallTop + 1, wall);
    if (r(20) < 0.6 && len >= 6 && dep >= 5) {
      const [a, b] = [1, Math.min(4, len - 2)];
      for (const [u, w] of [[a, 1], [b, 1], [a, dep - 2], [b, dep - 2]] as const) {
        put(u, w, wallTop + 1, part.fence);
        put(u, w, wallTop + 2, part.fence);
      }
      for (let u = a; u <= b; u++) for (let w = 1; w <= dep - 2; w++) if (r(21 + u * 7 + w) < 0.8) put(u, w, wallTop + 3, part.flowers);
      const tu = Math.floor((a + b) / 2);
      put(tu, Math.floor(dep / 2), wallTop + 1, inner.table);
      put(tu - 1, Math.floor(dep / 2), wallTop + 1, `${inner.chair}[facing=${f.minusU},half=bottom]`);
    } else {
      for (const [u, w] of [[1, 1], [len - 2, 1], [1, dep - 2], [len - 2, dep - 2]] as const) if (r(22 + u + w) < 0.7) put(u, w, wallTop + 1, pick(part.pots, 23 + u));
    }
    // A way up: a ladder against the back wall, through a hatch.
    for (let y = wallTop - 3; y <= wallTop; y++) put(len - 2, dep - 2, y, `${inner.ladder}[facing=${FLIP[f.inward]}]`);
  } else {
    // A low hip roof of tile slabs, half a block up for each block in, overhanging the walls by one.
    for (let k = 0; ; k++) {
      const [ua, ub, wa, wb] = [-1 + k, len - k, -1 + k, dep - k];
      if (ub < ua || wb < wa) break;
      const y = wallTop + 1 + Math.floor(k / 2);
      const half = k % 2 === 0 ? "bottom" : "top";
      const last = ub - ua < 2 || wb - wa < 2;
      for (let u = ua; u <= ub; u++)
        for (let w = wa; w <= wb; w++) {
          const rim = u === ua || u === ub || w === wa || w === wb;
          if (!rim && !last) continue;
          const hip = (u === ua || u === ub) && (w === wa || w === wb);
          put(u, w, y, last ? part.ridge : hip && k > 0 ? `${part.ridge.replace(/\[.*/, "")}` : `${roof}[type=${half}]`);
        }
      if (last) break;
    }
  }

  // Bougainvillea up a front corner and over the door.
  if (r(24) < 0.4) {
    const cu = r(25) < 0.5 ? 0 : len - 1;
    for (let y = ground(cu, -1) + 1; y <= wallTop - 1; y++) putFree(cu, -1, y, part.flowers);
    for (let u = doorU - 1; u <= doorU + 1; u++) putFree(u, -1, floor + 3, part.flowers);
  }
  // Pots by the door when it opens at ground level.
  if (drop <= 0) {
    putFree(doorU - 1, -1, floor + 1, pick(part.pots, 26));
    if (r(27) < 0.5) putFree(doorU + 1, -1, floor + 1, pick(part.pots, 28));
  }

  // Inside: a lantern, a table with chairs and a candle, a rug, a barrel; a ladder up in two-storey houses.
  const mid = Math.floor(len / 2);
  const back = dep - 3 >= 1 ? dep - 3 : 1;
  put(mid, Math.floor(dep / 2), floor + 3, inner.light);
  if (mid - 1 >= 1 && mid + 1 <= len - 2) {
    put(mid, back, floor + 1, inner.table);
    put(mid, back, floor + 2, inner.candle);
    put(mid - 1, back, floor + 1, `${inner.chair}[facing=${f.minusU},half=bottom]`);
    put(mid + 1, back, floor + 1, `${inner.chair}[facing=${f.plusU},half=bottom]`);
  }
  put(1, dep - 2, floor + 1, "minecraft:barrel[facing=up]");
  if (len >= 7 && dep >= 6) {
    const rug = pick(inner.rugs, 29);
    for (let u = 1; u <= 2; u++) put(u, 1, floor + 1, rug);
  }
  if (storeys === 2) {
    const ladder = `${inner.ladder}[facing=${FLIP[f.inward]}]`;
    for (let y = floor + 1; y <= floor + 4; y++) put(len - 2, dep - 2, y, ladder);
    put(mid, Math.floor(dep / 2), floor + 7, inner.light);
    put(1, 1, floor + 5, pick(part.pots, 30));
    put(len - 3, dep - 2, floor + 5, "minecraft:barrel[facing=up]");
  }
}

/** The church: a nave with a pitched roof, a door and a round window, and a bell tower beside the front. */
function church(ctx: Ctx, part: Hillside, c: NonNullable<Hillside["church"]>, taken: [number, number, number, number][]): void {
  const { set } = ctx;
  const g = ctx.ground.get(part.on)!;
  const [len, dep] = [9, 15]; // across the front, and back along the nave
  const f = frame(c.facing, c.at[0], c.at[1], len, dep);
  const put = (u: number, w: number, y: number, state: string) => {
    const [x, z] = f.at(u, w);
    set(x, y, z, state);
  };
  let floor = -Infinity;
  for (let u = -1; u <= len + 5; u++) for (let w = -1; w <= dep; w++) floor = Math.max(floor, g.height(...f.at(u, w)) ?? floor);
  floor = Math.round(floor);
  const wall = c.wall;
  const top = floor + 7;
  const outer = (u: number, w: number) => u === 0 || u === len - 1 || w === 0 || w === dep - 1;
  for (let u = 0; u < len; u++)
    for (let w = 0; w < dep; w++) {
      const h = g.height(...f.at(u, w)) ?? floor;
      for (let y = h + 1; y < floor; y++) put(u, w, y, part.stone);
      for (let y = floor; y <= top; y++) put(u, w, y, outer(u, w) ? wall : y === floor ? part.stone : AIR);
    }
  // A pitched roof along the nave, closed at both ends.
  const half = (len - 1) / 2;
  for (let k = 0; k <= half + 1; k++) {
    const y = top + 1 + Math.floor(k / 2);
    const type = k % 2 === 0 ? "bottom" : "top";
    const tile = k === half + 1 ? part.ridge : `${part.roofs[0]}[type=${type}]`;
    for (let w = -1; w <= dep; w++) {
      put(k - 1, w, y, tile);
      put(len - k, w, y, tile);
    }
    for (let u = k; u <= len - 1 - k; u++) for (const w of [0, dep - 1]) for (let yy = top + 1; yy < y; yy++) put(u, w, yy, wall);
  }
  // The door, a round window above it, tall windows down the sides, an altar and benches.
  for (let y = floor + 1; y <= floor + 3; y++) for (let u = half - 1; u <= half + 1; u++) put(u, 0, y, AIR);
  put(half, 0, floor + 5, part.interior.glass);
  for (let w = 3; w < dep - 2; w += 3) for (const u of [0, len - 1]) for (let y = floor + 2; y <= floor + 5; y++) put(u, w, y, part.interior.glass);
  put(half, dep - 2, floor + 1, part.stone);
  put(half, dep - 2, floor + 2, part.interior.candle);
  for (let w = 3; w < dep - 4; w += 2)
    for (const u of [1, 2, len - 3, len - 2]) put(u, w, floor + 1, `${part.interior.chair}[facing=${FLIP[f.inward]},half=bottom]`);
  put(half, Math.floor(dep / 2), top, part.interior.light);
  // The bell tower beside the front: open arches at the top, a bell, a low pyramid cap.
  const [t0, t1] = [len + 1, len + 5];
  const towerTop = floor + 16;
  for (let u = t0; u <= t1; u++)
    for (let w = 0; w <= 4; w++) {
      const h = g.height(...f.at(u, w)) ?? floor;
      for (let y = h + 1; y < floor; y++) put(u, w, y, part.stone);
      const edge = u === t0 || u === t1 || w === 0 || w === 4;
      for (let y = floor; y <= towerTop; y++) put(u, w, y, edge ? (y % 5 === 0 ? part.stone : wall) : AIR);
    }
  for (let y = towerTop - 3; y <= towerTop - 1; y++) for (const [u, w] of [[t0 + 2, 0], [t0 + 2, 4], [t0, 2], [t1, 2]] as const) put(u, w, y, AIR);
  put(t0 + 2, 2, towerTop, part.stone);
  put(t0 + 2, 2, towerTop - 1, c.bell);
  for (let k = 0; k <= 2; k++) for (let u = t0 - 1 + k; u <= t1 + 1 - k; u++) for (let w = -1 + k; w <= 5 - k; w++) put(u, w, towerTop + 1 + k, k === 2 ? part.ridge : `${part.roofs[0]}[type=${k % 2 === 0 ? "bottom" : "top"}]`);
  let xs0 = Infinity, xs1 = -Infinity, zs0 = Infinity, zs1 = -Infinity;
  for (const [u, w] of [[-1, -1], [t1 + 1, dep]] as const) {
    const [x, z] = f.at(u, w);
    [xs0, xs1, zs0, zs1] = [Math.min(xs0, x), Math.max(xs1, x), Math.min(zs0, z), Math.max(zs1, z)];
  }
  taken.push([xs0, zs0, xs1, zs1]);
}

/** Render beach things (see `beachPart` in design.ts). */
export function beach(ctx: Ctx, part: Beach): void {
  const { set } = ctx;
  const g = ctx.ground.get(part.on)!;
  const free = (x: number, y: number, z: number) => !ctx.claimed(x, y, z);
  part.umbrellas.forEach(([x, z], i) => {
    const h = g.height(x, z);
    if (h === undefined) return;
    const color = part.colors[i % part.colors.length]!;
    for (let y = h + 1; y <= h + 4; y++) if (!free(x, y, z)) return; // a lamp or a boat is already there
    for (let y = h + 1; y <= h + 3; y++) set(x, y, z, part.pole);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const corner = dx !== 0 && dz !== 0;
        if (free(x + dx, h + (corner ? 3 : 4), z + dz)) set(x + dx, h + (corner ? 3 : 4), z + dz, (dx + dz) % 2 === 0 ? color : "minecraft:white_wool");
      }
    for (const dx of [-2, 2]) {
      const bh = g.height(x + dx, z);
      if (bh === undefined) continue;
      for (const dz of [0, 1]) if (free(x + dx, bh + 1, z + dz)) set(x + dx, bh + 1, z + dz, part.bed);
    }
  });
  part.boats.forEach(([x, z, dir], i) => {
    const h = g.height(x, z);
    if (h === undefined) return;
    const color = part.boatColors[i % part.boatColors.length]!;
    const [sx, sz] = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[dir] as [number, number];
    const [tx, tz] = [sz, sx];
    const y = h + 1;
    for (let s = -2; s <= 2; s++) {
      const end = Math.abs(s) === 2;
      const at = (t: number): [number, number] => [x + sx * s + tx * t, z + sz * s + tz * t];
      if (end) {
        const [ex, ez] = at(0);
        set(ex, y, ez, `${part.boatWood}_stairs[facing=${s > 0 ? FLIP[dir] : dir},half=bottom]`);
        continue;
      }
      for (const t of [-1, 1]) {
        const [bx, bz] = at(t);
        set(bx, y, bz, color);
      }
      const [mx, mz] = at(0);
      set(mx, y, mz, `${part.boatWood}_slab[type=bottom]`);
    }
  });
}
