import { type Design, type Direction, type Part } from "./design.js";
import { type Volume } from "./schematic.js";

type Vec3 = readonly [number, number, number];
type Pt = readonly [number, number];
type Of<T extends Part["type"]> = Extract<Part, { type: T }>;

/** The ground of one terrain part, for the parts that stand on it. */
export type Ground = {
  /** Layer of the top block of a column, or undefined outside the terrain. */
  height: (x: number, z: number) => number | undefined;
  /** Columns kept clear of trees and buildings: trails, streets and rivers, with a margin. */
  keepClear: Set<number>;
};

/** What the renderer gives landscape parts to work with. */
export type Ctx = {
  design: Design;
  v: Volume;
  /** Write a block as the current part (claimed, so overlaps are reported). */
  set: (x: number, y: number, z: number, state: string) => void;
  fill: (a: Vec3, b: Vec3, state: string) => void;
  /** Whether a part, not the ground, has placed a block here. */
  claimed: (x: number, y: number, z: number) => boolean;
  ground: Map<string, Ground>;
};

const colKey = (x: number, z: number) => x + z * 100_000;
const FLIP: Record<Direction, Direction> = { north: "south", south: "north", east: "west", west: "east" };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Height at fraction `t` of a line, from `[fraction, height]` pairs. */
function elevation(profile: readonly (readonly [number, number])[], t: number): number {
  const first = profile[0]!;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < profile.length; i++) {
    const [t1, y1] = profile[i]!;
    const [t0, y0] = profile[i - 1]!;
    if (t <= t1) return t1 === t0 ? y1 : lerp(y0, y1, (t - t0) / (t1 - t0));
  }
  return profile[profile.length - 1]![1];
}

/** Deterministic hash of two integers and a seed to [0, 1). */
export function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function valueNoise(x: number, z: number, seed: number): number {
  const [ix, iz] = [Math.floor(x), Math.floor(z)];
  const [u, w] = [smooth(x - ix), smooth(z - iz)];
  const at = (a: number, b: number) => hash2(ix + a, iz + b, seed) * 2 - 1;
  const top = at(0, 0) * (1 - u) + at(1, 0) * u;
  const bottom = at(0, 1) * (1 - u) + at(1, 1) * u;
  return top * (1 - w) + bottom * w;
}

/** Bilinear sample of `grid` (rows along Z, columns along X) at fractions (u, w) of its extent. */
function sampleGrid(grid: number[][], u: number, w: number): number {
  const rows = grid.length;
  const cols = grid[0]!.length;
  const [fr, fc] = [Math.min(Math.max(w, 0), 1) * (rows - 1), Math.min(Math.max(u, 0), 1) * (cols - 1)];
  const [r0, c0] = [Math.floor(fr), Math.floor(fc)];
  const [r1, c1] = [Math.min(r0 + 1, rows - 1), Math.min(c0 + 1, cols - 1)];
  const [dr, dc] = [fr - r0, fc - c0];
  const g = (r: number, c: number) => grid[r]![c]!;
  return (g(r0, c0) * (1 - dc) + g(r0, c1) * dc) * (1 - dr) + (g(r1, c0) * (1 - dc) + g(r1, c1) * dc) * dr;
}

/** A point on a polyline: position, arc length from the start, fraction of the whole, and the left-hand normal. */
type Sample = { x: number; z: number; s: number; t: number; nx: number; nz: number };

/** Sample a polyline every half block. */
function sampleLine(points: readonly Pt[], step = 0.5): Sample[] {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) total += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  const out: Sample[] = [];
  let before = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    const [dx, dz] = [(bx - ax) / len, (bz - az) / len];
    for (let s = 0; s < len; s += step) out.push({ x: ax + dx * s, z: az + dz * s, s: before + s, t: (before + s) / total, nx: -dz, nz: dx });
    before += len;
  }
  const last = out[out.length - 1]!;
  out.push({ ...last, x: points[points.length - 1]![0], z: points[points.length - 1]![1], s: total, t: 1 });
  return out;
}

/** The box around a line's samples, grown by `pad`, so columns far from it can be skipped without measuring. */
function reach(samples: Sample[], pad: number) {
  let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const s of samples) {
    x0 = Math.min(x0, s.x);
    x1 = Math.max(x1, s.x);
    z0 = Math.min(z0, s.z);
    z1 = Math.max(z1, s.z);
  }
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}

/** The sample nearest to (x, z) and its distance. */
function nearest(samples: Sample[], x: number, z: number): { d: number; sample: Sample } {
  let best = samples[0]!;
  let bestD = Infinity;
  for (const s of samples) {
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { d: Math.sqrt(bestD), sample: best };
}

// ---------- terrain ----------

export function terrain(ctx: Ctx, part: Of<"terrain">): void {
  const { design, v } = ctx;
  const { width, height, length } = v;
  const [x0, x1] = part.x;
  const [z0, z1] = part.z;
  const cols = x1 - x0 + 1;
  const rows = z1 - z0 + 1;

  const trails = part.trails.map((t) => {
    const samples = sampleLine(t.points);
    return { t, samples, box: reach(samples, t.width / 2 + t.margin + 1) };
  });
  const rivers = part.rivers.map((r) => {
    const samples = sampleLine(r.points);
    return { r, samples, box: reach(samples, r.width / 2 + r.margin + 1) };
  });
  const within = (b: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  const trailAt = new Map<number, (typeof part.trails)[number]>();
  const waterAt = new Map<number, { river: (typeof part.rivers)[number]; level: number; frozen: boolean }>();
  const keepClear = new Set<number>();
  const flats = [...(part.flat ? [part.flat] : []), ...part.flats];

  const heights: number[][] = [];
  for (let z = z0; z <= z1; z++) {
    const row: number[] = [];
    for (let x = x0; x <= x1; x++) {
      const key = colKey(x, z);
      let h = sampleGrid(part.grid, (x - x0) / Math.max(x1 - x0, 1), (z - z0) / Math.max(z1 - z0, 1));
      for (const pk of part.peaks) {
        const d = Math.hypot(x - pk.at[0], z - pk.at[1]);
        if (d < pk.radius) h += pk.height * Math.pow(1 - d / pk.radius, pk.sharpness);
      }
      if (part.ridged) {
        // Crags: ridged noise, fading in with altitude so the valleys stay smooth.
        const { amplitude, scale, above } = part.ridged;
        const ridge = 1 - Math.abs(valueNoise(x / scale, z / scale, design.seed + 7));
        const fade = Math.min(Math.max((h - above) / above, 0), 1);
        h += amplitude * ridge * ridge * fade * fade * (3 - 2 * fade);
      }
      h += valueNoise(x / part.noise.scale, z / part.noise.scale, design.seed) * part.noise.amplitude;

      // Level areas: the strongest one wins, exactly level inside and blending out over its margin.
      let level: { y: number; weight: number; ripple: number } | undefined;
      for (const f of flats) {
        let d: number;
        if (f.shape === "ellipse") {
          const [cx, cz] = [(f.x[0] + f.x[1]) / 2, (f.z[0] + f.z[1]) / 2];
          const [rx, rz] = [Math.max((f.x[1] - f.x[0]) / 2, 0.5), Math.max((f.z[1] - f.z[0]) / 2, 0.5)];
          const n = Math.hypot((x - cx) / rx, (z - cz) / rz);
          d = n <= 1 ? 0 : (n - 1) * Math.min(rx, rz);
        } else {
          d = Math.hypot(Math.max(f.x[0] - x, 0, x - f.x[1]), Math.max(f.z[0] - z, 0, z - f.z[1]));
        }
        const weight = d <= 0 ? 1 : d >= f.margin ? 0 : 1 - d / f.margin;
        if (weight > (level?.weight ?? 0)) level = { y: f.y, weight, ripple: f.ripple };
      }
      if (level) {
        h = level.weight >= 1 ? level.y : h * (1 - level.weight) + level.y * level.weight;
        if (level.ripple !== 0) h += valueNoise(x / 5, z / 5, design.seed + 3) * level.ripple * level.weight;
      }

      // Trails: a graded bench cut into the ground, rising or falling evenly from one end to the other.
      trails.forEach(({ t, samples, box }) => {
        if (!within(box, x, z)) return;
        const { d, sample } = nearest(samples, x, z);
        const half = t.width / 2;
        if (d > half + t.margin) return;
        const y = elevation(t.y, sample.t);
        const w = d <= half ? 1 : smooth(1 - (d - half) / Math.max(t.margin, 1e-9));
        h = h * (1 - w) + y * w;
        if (d <= half) trailAt.set(key, t);
        if (d <= half + 2) keepClear.add(key);
      });

      // Rivers: a channel below the water level, with banks just above it.
      rivers.forEach(({ r, samples, box }) => {
        if (!within(box, x, z)) return;
        const { d, sample } = nearest(samples, x, z);
        const half = r.width / 2;
        if (d > half + r.margin) return;
        const level = Math.round(elevation(r.y, sample.t));
        if (d <= half) {
          h = level - r.depth;
          const open = r.open.some(([a, b]) => sample.t >= a && sample.t <= b);
          const nearEdge = x <= 1 || z <= 1 || x >= width - 2 || z >= length - 2;
          waterAt.set(key, { river: r, level, frozen: !open || nearEdge });
        } else {
          const w = smooth(1 - (d - half) / Math.max(r.margin, 1e-9));
          h = h * (1 - w) + (level + 1) * w;
        }
        if (d <= half + 2) keepClear.add(key);
      });

      const top = Math.max(0, Math.min(height - 1, Math.round(h)));
      // Nothing grows or is built in the sea or right at its edge.
      if (part.sea && top <= part.sea.level) keepClear.add(key);
      row.push(top);
    }
    heights.push(row);
  }

  ctx.ground.set(part.id, { height: (x, z) => heights[z - z0]?.[x - x0], keepClear });

  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const [r, c] = [z - z0, x - x0];
      const h = heights[r]![c]!;
      const around = [heights[r]![Math.max(c - 1, 0)]!, heights[r]![Math.min(c + 1, cols - 1)]!, heights[Math.max(r - 1, 0)]![c]!, heights[Math.min(r + 1, rows - 1)]![c]!];
      const steep = Math.max(...around.map((n) => Math.abs(n - h))) >= part.rockSlope;
      const rock = hash2(x, z, design.seed) < 0.25 ? part.rockAlt : part.rock;
      // A shell reaches down to the lowest neighbouring column, so a cliff face is solid, not hollow.
      const bottom = part.depth === undefined ? 0 : Math.max(0, Math.min(h - part.depth + 1, ...around));
      const key = colKey(x, z);
      const water = waterAt.get(key);
      const trail = trailAt.get(key);
      const sea = part.sea;
      const underSea = sea !== undefined && !water && h < sea.level;
      const beach = sea?.beach && !steep && h >= sea.level && h <= sea.level + sea.beach.above ? sea.beach.block : undefined;
      for (let y = bottom; y <= h; y++) {
        // The ground is written straight to the volume: other parts may overwrite it freely.
        let block = y >= h - 2 ? (steep ? rock : part.surface) : part.base;
        if (water && y >= h - 1) block = water.river.bed;
        else if (trail && y >= h - 1) block = trail.surface;
        else if (underSea && !steep && y >= h - 1) block = sea.bed;
        else if (beach && y >= h - 2) block = beach;
        v.set(x, y, z, block);
      }
      if (water) for (let y = h + 1; y <= water.level; y++) v.set(x, y, z, water.frozen ? water.river.ice : water.river.water);
      if (underSea) for (let y = h + 1; y <= sea.level; y++) v.set(x, y, z, sea.water);
    }

  // Lamps along trails, alternating sides.
  for (const { t, samples } of trails) {
    if (!t.lamps) continue;
    let next = t.lamps.every / 2;
    let side = 1;
    for (const s of samples) {
      if (s.s < next) continue;
      next += t.lamps.every;
      const [lx, lz] = [Math.round(s.x + s.nx * side * (t.width / 2 + 1)), Math.round(s.z + s.nz * side * (t.width / 2 + 1))];
      side = -side;
      const h = heights[lz - z0]?.[lx - x0];
      if (h === undefined || h + 3 >= height) continue;
      ctx.set(lx, h + 1, lz, t.lamps.post);
      ctx.set(lx, h + 2, lz, t.lamps.post);
      ctx.set(lx, h + 3, lz, t.lamps.lantern);
    }
  }
}

// ---------- scattering: forests and boulders ----------

type Scatter = Of<"boulders">["scatter"];

/**
 * Pick sites for things that need `clearHeight` blocks of room within `clearRadius` columns: on gentle
 * ground below the tree line, away from trails and rivers, in clusters when asked, thinning towards the
 * tree line, and not where another part already stands. Deterministic.
 */
function scatterSites(ctx: Ctx, g: Ground, sc: Scatter, clearHeight: number, clearRadius: number): [number, number][] {
  const { design } = ctx;
  const out: [number, number][] = [];
  const used = new Set<string>();
  const spans = [sc.x[1] - sc.x[0] + 1, sc.z[1] - sc.z[0] + 1] as const;
  for (let attempt = 0; out.length < sc.count && attempt < sc.count * 12; attempt++) {
    const tx = sc.x[0] + Math.floor(hash2(attempt, 11, design.seed) * spans[0]);
    const tz = sc.z[0] + Math.floor(hash2(attempt, 12, design.seed) * spans[1]);
    const base = g.height(tx, tz);
    if (base === undefined || base > sc.treeline) continue;
    if (sc.exclude.some(([a, b, c, d]) => tx >= a && tx <= c && tz >= b && tz <= d)) continue;
    if (sc.clusters && valueNoise(tx / sc.clusters.scale, tz / sc.clusters.scale, design.seed + 31) < sc.clusters.threshold) continue;
    if (sc.taper > 0) {
      const thin = (sc.treeline - base) / sc.taper;
      if (thin < 1 && hash2(attempt, 13, design.seed) > thin) continue;
    }
    const slope = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs((g.height(tx + dx!, tz + dz!) ?? base) - base)));
    if (slope > sc.maxSlope) continue;
    let ok = true;
    for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) if (g.keepClear.has(colKey(tx + dx, tz + dz))) ok = false;
    // Nothing may already stand where it would: a building, a lamp post, another tree.
    for (let dx = -clearRadius; dx <= clearRadius && ok; dx++)
      for (let dz = -clearRadius; dz <= clearRadius && ok; dz++)
        for (let dy = 1; dy <= clearHeight && ok; dy++) if (ctx.claimed(tx + dx, base + dy, tz + dz)) ok = false;
    if (!ok) continue;
    const cell = `${Math.floor(tx / sc.spacing)},${Math.floor(tz / sc.spacing)}`;
    if (used.has(cell)) continue;
    used.add(cell);
    out.push([tx, tz]);
  }
  return out;
}

const inside = (v: Volume, x: number, y: number, z: number) => x >= 0 && x < v.width && y >= 0 && y < v.height && z >= 0 && z < v.length;

export function trees(ctx: Ctx, part: Of<"trees">): void {
  const { design, v, set } = ctx;
  const g = ctx.ground.get(part.on)!;
  const scattered = part.scatter ? scatterSites(ctx, g, part.scatter, part.maxHeight, 3) : [];
  const sites: { at: [number, number]; dead: boolean }[] = [
    ...part.at.map((at) => ({ at, dead: false })),
    ...scattered.map((at) => ({ at, dead: hash2(at[0], at[1], design.seed + 5) < part.dead })),
  ];
  const span = Math.max(part.maxHeight - part.minHeight + 1, 1);
  if (part.style !== "spruce") {
    for (const { at: [tx, tz] } of sites) {
      const base = g.height(tx, tz);
      if (base === undefined) throw new RangeError(`tree at ${tx}, ${tz} is outside the terrain '${part.on}'`);
      const size = part.minHeight + Math.floor(hash2(tx, tz, design.seed) * span);
      warmTree(ctx, part, tx, base, tz, size);
    }
    return;
  }
  // Tiers: each band widens, then steps back in, like a spruce. Index is depth below the tip.
  const TIERS = [0, 1, 2, 1, 2, 3, 2, 3, 3, 2];

  for (const { at: [tx, tz], dead } of sites) {
    const base = g.height(tx, tz);
    if (base === undefined) throw new RangeError(`tree at ${tx}, ${tz} is outside the terrain '${part.on}'`);
    const top = base + part.minHeight + Math.floor(hash2(tx, tz, design.seed) * span);

    if (dead) {
      // A bare trunk with a few stub branches, alternating direction.
      for (let y = base + 1; y <= top; y++) if (inside(v, tx, y, tz)) set(tx, y, tz, part.trunk);
      for (let k = 0; k < 3; k++) {
        const y = base + 3 + k * 2;
        if (y >= top) break;
        const dir = hash2(tx + k, tz, design.seed + 9) < 0.5 ? 1 : -1;
        const alongX = k % 2 === 0;
        const [bx, bz] = alongX ? [tx + dir, tz] : [tx, tz + dir];
        const log = `${part.trunk}[axis=${alongX ? "x" : "z"}]`;
        if (inside(v, bx, y, bz)) set(bx, y, bz, log);
        const [ex, ez] = alongX ? [bx + dir, bz] : [bx, bz + dir];
        if (hash2(tx, tz + k, design.seed + 10) < 0.5 && inside(v, ex, y + 1, ez)) set(ex, y + 1, ez, log);
      }
      continue;
    }

    const radius = (y: number) => TIERS[Math.min(top - y, TIERS.length - 1)]!;
    for (let y = base + 2; y <= top; y++) {
      const r = radius(y);
      const above = y < top ? radius(y + 1) : -1; // radius of the layer over this one
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          const [x, z] = [tx + dx, tz + dz];
          if (!inside(v, x, y, z)) continue;
          // Snow rests on the top of each tier: cells with no leaves above them.
          const exposed = dx * dx + dz * dz > above * above + 1;
          set(x, y, z, exposed ? (part.snow ?? part.leaves) : part.leaves);
        }
    }
    for (let y = base + 1; y < top; y++) if (inside(v, tx, y, tz)) set(tx, y, tz, part.trunk); // the tip stays leaves
  }
}

/** One cypress, stone pine or olive, `size` blocks tall, standing on the ground at `base`. */
function warmTree(ctx: Ctx, part: Of<"trees">, tx: number, base: number, tz: number, size: number): void {
  const { design, v, set } = ctx;
  const leaf = (x: number, y: number, z: number) => {
    if (inside(v, x, y, z) && !ctx.claimed(x, y, z)) set(x, y, z, part.leaves);
  };
  const log = (x: number, y: number, z: number, axis = "y") => {
    if (inside(v, x, y, z)) set(x, y, z, axis === "y" ? part.trunk : `${part.trunk}[axis=${axis}]`);
  };
  const top = base + size;
  for (let y = base + 1; y <= top; y++) if (ctx.claimed(tx, y, tz)) return; // a house or a post is in the way
  const r = (salt: number) => hash2(tx + salt, tz - salt, design.seed + 61);
  if (part.style === "cypress") {
    // A dark flame: one wide in the middle, a plus shape low down, a single spire at the top.
    for (let y = base + 1; y <= top - 2; y++) log(tx, y, tz);
    for (let y = base + 2; y <= top; y++) {
      const fromTop = top - y;
      leaf(tx, y, tz);
      if (fromTop >= 2) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) leaf(tx + dx, y, tz + dz);
      if (fromTop >= 4 && y <= base + Math.ceil(size * 0.55))
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) if (r(y) < 0.5) leaf(tx + dx, y, tz + dz);
    }
    return;
  }
  if (part.style === "pine") {
    // A bare trunk that leans a little, then a wide flat crown: a full disc with a narrower one on top.
    const [lx, lz] = r(1) < 0.5 ? [r(2) < 0.5 ? 1 : -1, 0] : [0, r(3) < 0.5 ? 1 : -1];
    const bend = base + Math.round(size * 0.55);
    let [x, z] = [tx, tz];
    for (let y = base + 1; y <= top; y++) {
      if (y === bend) [x, z] = [x + lx, z + lz];
      log(x, y, z);
    }
    const radius = 3 + Math.floor(r(4) * 2);
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        const d = dx * dx + dz * dz;
        if (d <= radius * radius + 1 && r(dx * 7 + dz) > 0.08) leaf(x + dx, top, z + dz);
        if (d <= (radius - 1) * (radius - 1)) leaf(x + dx, top + 1, z + dz);
        if (d <= 2 && d > 0) log(x + dx, top, z + dz, dx !== 0 ? "x" : "z"); // branches under the crown
      }
    return;
  }
  // Olive: a short, thick trunk that forks, under a rounded crown that does not quite close.
  const trunkTop = base + Math.max(2, Math.round(size * 0.4));
  for (let y = base + 1; y <= trunkTop; y++) log(tx, y, tz);
  const radius = Math.max(2, Math.round(size * 0.45));
  const cy = trunkTop + Math.round(radius * 0.6);
  for (let dy = -Math.round(radius * 0.6); dy <= Math.round(radius * 0.8); dy++)
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        const n = (dx * dx + dz * dz) / (radius * radius) + (dy * dy) / ((radius * 0.75) * (radius * 0.75));
        if (n <= 1 && hash2(tx + dx * 3 + dy, tz + dz * 5, design.seed + 67) > 0.18) leaf(tx + dx, cy + dy, tz + dz);
      }
  for (let y = trunkTop + 1; y < cy; y++) log(tx, y, tz);
}

export function boulders(ctx: Ctx, part: Of<"boulders">): void {
  const { design, v, set } = ctx;
  const g = ctx.ground.get(part.on)!;
  const span = Math.max(part.maxSize - part.minSize + 1, 1);
  for (const [bx, bz] of scatterSites(ctx, g, part.scatter, part.maxSize + 1, part.maxSize + 1)) {
    const base = g.height(bx, bz)!;
    const r = part.minSize + Math.floor(hash2(bx, bz, design.seed + 41) * span);
    const ry = Math.max(1, Math.round(r * 0.75));
    // A squashed sphere, half sunk in the ground, with snow on top of each column.
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        let topJ = -1;
        for (let j = 0; j < ry; j++) {
          const n = (dx * dx + dz * dz) / (r * r) + ((j + 0.5) * (j + 0.5)) / (ry * ry);
          if (n <= 1) topJ = j;
        }
        for (let j = 0; j <= topJ; j++) {
          const [x, y, z] = [bx + dx, base + 1 + j, bz + dz];
          if (!inside(v, x, y, z)) continue;
          const rock = part.blocks[Math.floor(hash2(x + y * 7, z, design.seed + 43) * part.blocks.length)]!;
          set(x, y, z, j === topJ ? part.snow : rock);
        }
      }
  }
}

// ---------- village ----------

export function village(ctx: Ctx, part: Of<"village">): void {
  if (part.style === "explorable" && !part.interior) throw new Error(`village '${part.id}' is explorable but has no 'interior'`);
  if (part.style === "classic") villageClassic(ctx, part);
  else villageVaried(ctx, part);
}

function villageVaried(ctx: Ctx, part: Of<"village">): void {
  const { design, set, fill } = ctx;
  const g = ctx.ground.get(part.on)!;
  const [cx, cz] = part.at;
  const taken: [number, number, number, number][] = [];
  const near = (x0: number, z0: number, x1: number, z1: number, margin: number) =>
    taken.some((r) => x0 <= r[2] + margin && x1 >= r[0] - margin && z0 <= r[3] + margin && z1 >= r[1] - margin);
  /** Lowest and highest ground over a footprint and its border, or undefined if it meets a trail, river or the edge. */
  const survey = (x0: number, z0: number, x1: number, z1: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = x0 - 1; x <= x1 + 1; x++)
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        const h = g.height(x, z);
        if (h === undefined || g.keepClear.has(colKey(x, z))) return undefined;
        // Not where another part, such as a bridge or a lamp post, already stands.
        for (let dy = 1; dy <= 4; dy++) if (ctx.claimed(x, h + dy, z)) return undefined;
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    return { lo, hi };
  };
  /** A stone plinth under the footprint, filling the slope up to the level of the floor. */
  const plinth = (x0: number, z0: number, x1: number, z1: number, top: number) => {
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const h = g.height(x, z)!;
        if (h < top) fill([x, h + 1, z], [x, top, z], part.stone);
      }
  };
  const lit = (x: number, y: number, z: number) => set(x, y, z, part.light);

  // The church: a nave, a tower at its north end with a snow spire, and glowing slits.
  {
  const [cx, cz] = part.church ?? part.at;
  const site = survey(cx - 2, cz - 4, cx + 2, cz + 8);
  if (site && site.hi - site.lo <= 2) {
    const g0 = site.hi;
    plinth(cx - 2, cz - 4, cx + 2, cz + 8, g0);
    fill([cx - 2, g0 + 1, cz + 1], [cx + 2, g0 + 5, cz + 8], part.stone);
    fill([cx - 2, g0 + 1, cz - 4], [cx + 2, g0 + 11, cz], part.stone);
    for (let k = 0; k <= 1; k++) {
      fill([cx - 2 + k, g0 + 6 + k, cz + 1], [cx - 2 + k, g0 + 6 + k, cz + 8], `${part.roof}[facing=east,half=bottom]`);
      fill([cx + 2 - k, g0 + 6 + k, cz + 1], [cx + 2 - k, g0 + 6 + k, cz + 8], `${part.roof}[facing=west,half=bottom]`);
    }
    fill([cx, g0 + 7, cz + 1], [cx, g0 + 7, cz + 8], part.ridge);
    fill([cx - 2, g0 + 12, cz - 4], [cx + 2, g0 + 12, cz], part.ridge);
    fill([cx - 1, g0 + 13, cz - 3], [cx + 1, g0 + 13, cz - 1], part.ridge);
    set(cx, g0 + 14, cz - 2, part.ridge);
    fill([cx, g0 + 15, cz - 2], [cx, g0 + 16, cz - 2], part.post);
    set(cx, g0 + 17, cz - 2, part.lantern);
    for (const z of [cz + 2, cz + 6]) {
      lit(cx - 2, g0 + 3, z);
      lit(cx + 2, g0 + 3, z);
    }
    for (const y of [g0 + 8, g0 + 9]) {
      lit(cx, y, cz - 4);
      lit(cx - 2, y, cz - 2);
      lit(cx + 2, y, cz - 2);
    }
    taken.push([cx - 2, cz - 4, cx + 2, cz + 8]);
  }
  }

  type House = {
    at: (u: number, w: number) => [number, number];
    a: number;
    b: number;
    half: number;
    base: number;
    wallH: number;
    wall: string;
    alongZ: boolean;
    lodge: boolean;
    rand: (salt: number) => number;
  };
  /**
   * Make a house one can walk into (`style: "explorable"`): hollow it out, lay a floor and a ceiling, close
   * the gables, open a door at the downhill end with steps up from the ground, glaze the windows, and put
   * in a hanging lantern, a table with chairs and a lit candle, and a barrel.
   */
  const furnish = ({ at, a, b, half, base, wallH, wall, alongZ, lodge, rand }: House) => {
    const inner = part.interior!;
    const eave = base + wallH + 1;
    const put = (u: number, w: number, y: number, state: string) => {
      const [x, z] = at(u, w);
      set(x, y, z, state);
    };
    // Unit steps across (+u) and along (+w) the ridge, as compass directions.
    const plusU: Direction = alongZ ? "east" : "south";
    const plusW: Direction = alongZ ? "south" : "east";
    for (let u = 1; u < a - 1; u++)
      for (let w = 1; w < b - 1; w++) {
        put(u, w, base, inner.floor);
        for (let y = base + 1; y <= base + wallH; y++) put(u, w, y, "minecraft:air");
        put(u, w, eave, inner.floor); // the ceiling
      }
    // The gable ends, which the roof leaves open, and the eave row between the lowest roof stairs.
    for (let k = 0; k < half; k++)
      for (let u = k + 1; u < a - 1 - k; u++)
        for (const w of [0, b - 1]) put(u, w, eave + k, wall);
    // The door at the end where the ground is lower, with steps down to it.
    const ground = (u: number, w: number) => g.height(...at(u, w)) ?? base;
    const front = ground(half, -1) <= ground(half, b) ? 0 : b - 1;
    const out = front === 0 ? -1 : 1;
    const outward: Direction = front === 0 ? FLIP[plusW] : plusW;
    put(half, front, base + 1, "minecraft:air");
    put(half, front, base + 2, "minecraft:air");
    put(half, front, base, inner.floor);
    const drop = Math.min(base - ground(half, front + out), 4);
    for (let i = 1; i <= drop; i++) {
      const y = base + 1 - i;
      const [x, z] = at(half, front + out * i);
      if (ctx.claimed(x, y, z) || ctx.claimed(x, y + 1, z)) break;
      set(x, y, z, `${inner.step}[facing=${FLIP[outward]},half=bottom]`);
      for (let yy = (g.height(x, z) ?? y) + 1; yy < y; yy++) set(x, yy, z, part.stone);
    }
    // Windows: both long sides, and the front either side of the door on wide houses.
    for (const w of [2, b - 3]) {
      put(0, w, base + 2, inner.glass);
      put(a - 1, w, base + 2, inner.glass);
    }
    if (a >= 7) for (const u of [half - 2, half + 2]) put(u, front, base + 2, inner.glass);
    // A lantern from the ceiling, a table away from the door with a chair either side, and a barrel.
    const back = front === 0 ? b - 3 : 2; // the row of the table
    put(half, Math.floor(b / 2), base + wallH, inner.light);
    put(half, back, base + 1, inner.table);
    put(half, back, base + 2, inner.candle);
    put(half - 1, back, base + 1, `${inner.chair}[facing=${FLIP[plusU]},half=bottom]`);
    put(half + 1, back, base + 1, `${inner.chair}[facing=${plusU},half=bottom]`);
    put(1, front === 0 ? 1 : b - 2, base + 1, "minecraft:barrel[facing=up]");
    if (lodge && rand(30) < 0.7) put(a - 2, front === 0 ? 1 : b - 2, base + 1, "minecraft:flower_pot");
  };

  // Houses. `a` is the width across the ridge (odd), `b` the length along it.
  const ry = Math.round(part.radius * 0.7);
  let placed = 0;
  for (let attempt = 0; placed < part.houses && attempt < part.houses * 50; attempt++) {
    const rand = (salt: number) => hash2(attempt, salt, design.seed);
    const lodge = rand(20) < part.lodges;
    const a = lodge ? 9 : 5 + 2 * Math.floor(rand(21) * 2);
    const b = (lodge ? 7 : 5) + Math.floor(rand(22) * 2);
    const alongZ = rand(27) < 0.5;
    const [sx, sz] = alongZ ? [a, b] : [b, a];
    const x0 = cx - part.radius + Math.floor(rand(23) * (2 * part.radius + 1));
    const z0 = cz - ry + Math.floor(rand(24) * (2 * ry + 1));
    if (Math.hypot(x0 + sx / 2 - cx, (z0 + sz / 2 - cz) / 0.7) > part.radius) continue;
    const [x1, z1] = [x0 + sx - 1, z0 + sz - 1];
    if (near(x0, z0, x1, z1, lodge ? 3 : 2)) continue;
    const s = survey(x0, z0, x1, z1);
    if (!s || s.hi - s.lo > 3) continue;

    const base = s.hi;
    const wallH = lodge ? 4 : 3;
    const half = (a - 1) / 2;
    const eave = base + wallH + 1;
    const ridgeY = eave + half - 1;
    /** World position of a point `u` across the ridge and `w` along it. */
    const at = (u: number, w: number): [number, number] => (alongZ ? [x0 + u, z0 + w] : [x0 + w, z0 + u]);

    plinth(x0, z0, x1, z1, base);
    const wall = part.accent && rand(28) < 0.4 ? part.accent : part.wall;
    fill([x0, base + 1, z0], [x1, base + wallH, z1], wall);
    if (lodge) fill([x0, base + 1, z0], [x1, base + 1, z1], part.stone); // a stone first course
    for (let k = 0; k < half; k++) {
      if (alongZ) {
        fill([x0 + k, eave + k, z0], [x0 + k, eave + k, z1], `${part.roof}[facing=east,half=bottom]`);
        fill([x1 - k, eave + k, z0], [x1 - k, eave + k, z1], `${part.roof}[facing=west,half=bottom]`);
      } else {
        fill([x0, eave + k, z0 + k], [x1, eave + k, z0 + k], `${part.roof}[facing=south,half=bottom]`);
        fill([x0, eave + k, z1 - k], [x1, eave + k, z1 - k], `${part.roof}[facing=north,half=bottom]`);
      }
    }
    if (alongZ) fill([x0 + half, ridgeY, z0], [x0 + half, ridgeY, z1], part.ridge);
    else fill([x0, ridgeY, z0 + half], [x1, ridgeY, z0 + half], part.ridge);

    if (part.style === "explorable") {
      furnish({ at, a, b, half, base, wallH, wall, alongZ, lodge, rand });
    } else {
      // Glowing windows: the front, and the sides some of the time.
      const front = lodge ? [half - 2, half + 2] : [half];
      for (const u of front) {
        const [wx, wz] = at(u, 0);
        lit(wx, base + (lodge ? 3 : 2), wz);
      }
      if (rand(25) < 0.6) lit(at(0, 2)[0], base + 2, at(0, 2)[1]);
      if (rand(26) < 0.6) lit(at(a - 1, b - 3)[0], base + 2, at(a - 1, b - 3)[1]);
    }
    // A street lamp at the front corner.
    const [lx, lz] = at(-1, -1);
    fill([lx, base + 1, lz], [lx, base + 2, lz], part.post);
    set(lx, base + 3, lz, part.lantern);
    // A stone chimney through the roof on lodges and some cottages.
    if (part.chimneys && (lodge || rand(29) < 0.35)) {
      const [hx, hz] = at(half, b - 2);
      fill([hx, base + wallH + 1, hz], [hx, ridgeY + 2, hz], part.stone);
      set(hx, ridgeY + 3, hz, part.ridge);
    }
    taken.push([x0, z0, x1, z1]);
    placed++;
  }
}

/**
 * The first village layout, kept exactly as it was so designs saved with it (`style: "classic"`, the
 * default) render the same blocks as before: level footprints only, every house with the ridge along Z.
 */
function villageClassic(ctx: Ctx, part: Of<"village">): void {
  const { design, set, fill } = ctx;
    const surface = ctx.ground.get(part.on)!.height;
    const [cx, cz] = part.at;
    const taken: [number, number, number, number][] = [];
    const free = (x0: number, z0: number, x1: number, z1: number) => !taken.some((r) => x0 <= r[2] + 2 && x1 >= r[0] - 2 && z0 <= r[3] + 2 && z1 >= r[1] - 2);
    /** The ground height when the whole footprint is level, else undefined. */
    const level = (x0: number, z0: number, x1: number, z1: number) => {
      const g = surface(x0, z0);
      if (g === undefined) return undefined;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (surface(x, z) !== g) return undefined;
      return g;
    };
    const lit = (x: number, y: number, z: number) => set(x, y, z, part.light);

    // The church: a nave, a tower at its north end with a snow spire, and glowing slits.
    const g0 = level(cx - 2, cz - 4, cx + 2, cz + 8);
    if (g0 !== undefined) {
      fill([cx - 2, g0 + 1, cz + 1], [cx + 2, g0 + 5, cz + 8], part.stone);
      fill([cx - 2, g0 + 1, cz - 4], [cx + 2, g0 + 11, cz], part.stone);
      for (let k = 0; k <= 1; k++) {
        fill([cx - 2 + k, g0 + 6 + k, cz + 1], [cx - 2 + k, g0 + 6 + k, cz + 8], `${part.roof}[facing=east,half=bottom]`);
        fill([cx + 2 - k, g0 + 6 + k, cz + 1], [cx + 2 - k, g0 + 6 + k, cz + 8], `${part.roof}[facing=west,half=bottom]`);
      }
      fill([cx, g0 + 7, cz + 1], [cx, g0 + 7, cz + 8], part.ridge);
      fill([cx - 2, g0 + 12, cz - 4], [cx + 2, g0 + 12, cz], part.ridge);
      fill([cx - 1, g0 + 13, cz - 3], [cx + 1, g0 + 13, cz - 1], part.ridge);
      set(cx, g0 + 14, cz - 2, part.ridge);
      fill([cx, g0 + 15, cz - 2], [cx, g0 + 16, cz - 2], part.post);
      set(cx, g0 + 17, cz - 2, part.lantern);
      for (const z of [cz + 2, cz + 6]) {
        lit(cx - 2, g0 + 3, z);
        lit(cx + 2, g0 + 3, z);
      }
      for (const y of [g0 + 8, g0 + 9]) {
        lit(cx, y, cz - 4);
        lit(cx - 2, y, cz - 2);
        lit(cx + 2, y, cz - 2);
      }
      taken.push([cx - 2, cz - 4, cx + 2, cz + 8]);
    }

    // Houses: ridge along Z, a glowing window in the front and a street lamp beside the door.
    let placed = 0;
    for (let attempt = 0; placed < part.houses && attempt < part.houses * 40; attempt++) {
      const w = 5 + 2 * Math.floor(hash2(attempt, 21, design.seed) * 2);
      const d = 5 + Math.floor(hash2(attempt, 22, design.seed) * 2);
      const x0 = cx - part.radius + Math.floor(hash2(attempt, 23, design.seed) * (2 * part.radius + 1));
      const z0 = cz - Math.round(part.radius * 0.7) + Math.floor(hash2(attempt, 24, design.seed) * (2 * Math.round(part.radius * 0.7) + 1));
      if (Math.hypot(x0 + w / 2 - cx, (z0 + d / 2 - cz) / 0.7) > part.radius) continue;
      const [x1, z1] = [x0 + w - 1, z0 + d - 1];
      if (!free(x0, z0, x1, z1)) continue;
      const g = level(x0 - 1, z0 - 1, x1 + 1, z1 + 1);
      if (g === undefined) continue;
      fill([x0, g + 1, z0], [x1, g + 3, z1], part.wall);
      const centre = x0 + (w - 1) / 2;
      for (let k = 0; k < (w - 1) / 2; k++) {
        fill([x0 + k, g + 4 + k, z0], [x0 + k, g + 4 + k, z1], `${part.roof}[facing=east,half=bottom]`);
        fill([x1 - k, g + 4 + k, z0], [x1 - k, g + 4 + k, z1], `${part.roof}[facing=west,half=bottom]`);
      }
      fill([centre, g + 4 + (w - 1) / 2 - 1, z0], [centre, g + 4 + (w - 1) / 2 - 1, z1], part.ridge);
      lit(centre, g + 2, z0);
      if (hash2(attempt, 25, design.seed) < 0.6) lit(x0, g + 2, z0 + 2);
      if (hash2(attempt, 26, design.seed) < 0.6) lit(x1, g + 2, z1 - 2);
      fill([x0 - 1, g + 1, z0 - 1], [x0 - 1, g + 2, z0 - 1], part.post);
      set(x0 - 1, g + 3, z0 - 1, part.lantern);
      taken.push([x0, z0, x1, z1]);
      placed++;
    }
}
