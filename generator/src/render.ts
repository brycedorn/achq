import { type Layout } from "./anchors.js";
import { type Design, type Direction, type Part, YAW } from "./design.js";
import { Volume } from "./schematic.js";

const AIR = "minecraft:air";
const OPPOSITE: Record<Direction, Direction> = { south: "north", north: "south", east: "west", west: "east" };

/** Anchor name for slot `n` (1-based) of a station: `lounge`, `lounge_2`, ... */
const slot = (station: string, n: number) => (n === 1 ? station : `${station}_${n}`);

export type Placement = { origin: readonly [number, number, number] };

/** Two parts wrote different blocks to the same cell. The later part wins in the volume. */
export type Conflict = { cell: readonly [number, number, number]; first: string; second: string };

type Vec3 = readonly [number, number, number];

/** Deterministic hash of two integers and a seed to [0, 1). */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed + 1, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
function valueNoise(x: number, z: number, seed: number): number {
  const [ix, iz] = [Math.floor(x), Math.floor(z)];
  const [fx, fz] = [x - ix, z - iz];
  const ease = (t: number) => t * t * (3 - 2 * t);
  const [u, w] = [ease(fx), ease(fz)];
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

/**
 * Render a design into a block volume and its anchors file. Coordinates are local (x east, y up,
 * z south) until the paste origin is added to the anchors. Floor blocks are at `floorY`, so feet
 * stand at `floorY + 1`. Parts are applied in list order, which fixes the palette and anchor order,
 * so output is deterministic.
 */
export function renderDesign(design: Design, { origin }: Placement): { volume: Volume; layout: Layout; conflicts: Conflict[] } {
  const [width, height, length] = design.size;
  const v = new Volume(width, height, length);
  const [ox, oy, oz] = origin;
  const floorY = design.floorY;
  /** Layer of the feet of anyone standing on the floor. */
  const feet = floorY + 1;
  const anchors: Layout["anchors"] = {};
  const put = (anchor: string, x: number, y: number, z: number, yaw: number, pitch = 0) => {
    anchors[anchor] = { x: ox + x, y: oy + y, z: oz + z, yaw, pitch };
  };
  /** A standing spot at the centre of block column (x, z), feet on the floor surface. */
  const spot = (anchor: string, x: number, z: number, look: Direction) => put(anchor, x + 0.5, feet, z + 0.5, YAW[look]);

  // Parts write through `set`/`fill` so overlapping parts are reported, not silently overwritten.
  // The shell is written directly: parts may deliberately replace wall or floor cells.
  const claims = new Map<number, string>();
  const conflicts: Conflict[] = [];
  let current = "shell";
  let allowed: ReadonlySet<string> = new Set();
  const set = (x: number, y: number, z: number, state: string) => {
    const key = x + width * (z + length * y);
    if (state === AIR) {
      // Carving air removes whatever was there; it is never a conflict.
      v.set(x, y, z, state);
      claims.delete(key);
      return;
    }
    const owner = claims.get(key);
    if (owner !== undefined && owner !== current && !allowed.has(owner)) conflicts.push({ cell: [x, y, z], first: owner, second: current });
    claims.set(key, current);
    v.set(x, y, z, state);
  };
  /** Whether a part (not the ground) has placed a block at this cell. */
  const claimed = (x: number, y: number, z: number) => x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < length && claims.has(x + width * (z + length * y));
  const fill = (a: Vec3, b: Vec3, state: string) => {
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++)
        for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) set(x, y, z, state);
  };
  /**
   * A seat: a bottom-half stairs block at the anchor cell, back away from the way the agent looks.
   * The cell to the agent's right must stay free floor, which the layouts guarantee by spacing.
   */
  const seat = (anchor: string, x: number, z: number, look: Direction, block: string) => {
    set(x, feet, z, `${block}[facing=${OPPOSITE[look]},half=bottom]`);
    spot(anchor, x, z, look);
  };
  /** Stairs whose raised step is on side `facing` (the direction of ascent). */
  const stairs = (block: string, facing: Direction, half: "bottom" | "top" = "bottom") => `${block}[facing=${facing},half=${half}]`;

  const { shell } = design;
  if (shell.kind === "box") {
    v.fill([0, floorY, 0], [width - 1, floorY, length - 1], shell.floor);
    v.fill([0, height - 2, 0], [width - 1, height - 2, length - 1], shell.roof);
    const top = height - 3;
    for (const [a, b] of [
      [[0, feet, 0], [width - 1, top, 0]],
      [[0, feet, length - 1], [width - 1, top, length - 1]],
      [[0, feet, 0], [0, top, length - 1]],
      [[width - 1, feet, 0], [width - 1, top, length - 1]],
    ] as const) {
      v.fill(a, b, shell.wall);
    }
    if (shell.glassSouth) v.fill([1, feet + 1, length - 1], [width - 2, top, length - 1], shell.glass);
    v.fill([shell.doorX, feet, 0], [shell.doorX, feet + 1, 0], AIR);
    spot("entrance", shell.doorX, 1, "south");
    spot("spawn", shell.doorX, 2, "south");
  }

  /** Ground height of the top block, by terrain part id, as `(x, z) => layer`. */
  const ground = new Map<string, (x: number, z: number) => number | undefined>();

  const render = (part: Part): void => {
    switch (part.type) {
      case "spot":
        spot(part.anchor, part.at[0], part.at[1], part.look);
        break;
      case "deskRow": {
        const [x0, deskZ] = part.at;
        part.agents.forEach((agent, i) => {
          const x = x0 + part.spacing * i;
          set(x, feet, deskZ, part.desk);
          set(x, feet + 1, deskZ, part.monitor);
          seat(`desk_${agent}`, x, deskZ - 1, "south", part.chair);
          put(`monitor_${agent}`, x + 0.5, feet + 1.5, deskZ, YAW.north);
        });
        break;
      }
      case "station":
        set(part.at[0], feet, part.at[1] + 1, part.block);
        spot(part.station, part.at[0], part.at[1], "south");
        break;
      case "seatedTable":
        fill([part.table.from[0], feet, part.table.from[1]], [part.table.to[0], feet, part.table.to[1]], part.table.block);
        part.seats.forEach(([x, z, look], i) => seat(slot(part.station, i + 1), x, z, look, part.chair));
        break;
      case "lanternGrid":
        for (const x of part.xs) for (const z of part.zs) set(x, part.y, z, part.block);
        break;
      case "podium":
        set(part.at[0], feet, part.at[1], part.block);
        put("decision_podium", part.at[0] + 0.5, feet + 1, part.at[1] + 0.5, YAW.north);
        break;
      case "taskWall": {
        const [z0, z1] = part.z;
        const [y0, y1] = part.y;
        fill([part.x, y0, z0], [part.x, y1, z1], part.block);
        put("task_wall", part.x + 1, (y0 + y1 + 1) / 2, (z0 + z1 + 1) / 2, YAW.east);
        break;
      }
      case "camera":
        put(`cam_${part.name}`, part.at[0], part.at[1], part.at[2], part.yaw, part.pitch);
        break;
      case "box":
        fill(part.from, part.to, part.block);
        break;
      case "gableRoof": {
        const [x0, x1] = part.x;
        if ((x1 - x0) % 2 !== 0) throw new Error(`gableRoof '${part.id}': x must span an odd number of columns so the ridge is on one`);
        const centre = (x0 + x1) / 2;
        const rise = centre - 1 - (x0 - part.overhang); // rows of stairs on each side
        for (let z = part.z[0]; z <= part.z[1]; z++) {
          const edge = z === part.z[0] || z === part.z[1];
          const timber = edge ? part.trim : part.body;
          for (let k = 0; k <= rise; k++) {
            const y = part.eaveY + k;
            set(x0 - part.overhang + k, y, z, stairs(timber, "east"));
            set(x1 + part.overhang - k, y, z, stairs(timber, "west"));
            set(x0 - part.overhang + k, y + 1, z, stairs(part.snow, "east"));
            set(x1 + part.overhang - k, y + 1, z, stairs(part.snow, "west"));
          }
          set(centre, part.eaveY + rise, z, part.ridgeBody);
          set(centre, part.eaveY + rise + 1, z, part.ridgeSnow);
        }
        break;
      }
      case "gableEnd": {
        const [x0, x1] = part.x;
        const centre = (x0 + x1) / 2;
        for (let y = part.y0; y < design.size[1]; y++) {
          let left = x0;
          let right = x1;
          if (y >= part.eaveY) {
            const k = y - part.eaveY;
            left = x0 - part.overhang + k + 1;
            right = x1 + part.overhang - k - 1;
            if (left >= right) break; // the ridge cell itself belongs to the roof
          }
          for (let x = left; x <= right; x++) {
            if (part.kind === "solid") {
              set(x, y, part.z, part.fill);
              continue;
            }
            const frame = x === left || x === right || (x - centre) % part.every === 0 || (y - part.y0) % part.transomEvery === 0;
            set(x, y, part.z, frame ? part.frame : part.glass);
          }
        }
        break;
      }
      case "deck": {
        const [x0, x1] = part.x;
        const [z0, z1] = part.z;
        fill([x0, part.y, z0], [x1, part.y, z1], part.planks);
        const sides = new Set(part.rail.sides);
        for (let x = x0; x <= x1; x++)
          for (let z = z0; z <= z1; z++) {
            const onEdge =
              (sides.has("north") && z === z0) || (sides.has("south") && z === z1) || (sides.has("west") && x === x0) || (sides.has("east") && x === x1);
            if (onEdge) set(x, part.y + 1, z, part.rail.block);
            const post = (x === x0 || x === x1 || (x - x0) % part.posts.every === 0) && (z === z0 || z === z1 || (z - z0) % part.posts.every === 0);
            const perimeter = x === x0 || x === x1 || z === z0 || z === z1;
            if (post && perimeter) fill([x, part.posts.bottom, z], [x, part.y - 1, z], part.posts.block);
          }
        break;
      }
      case "terrain": {
        const [x0, x1] = part.x;
        const [z0, z1] = part.z;
        const cols = x1 - x0 + 1;
        const rows = z1 - z0 + 1;
        const heights: number[][] = [];
        for (let z = z0; z <= z1; z++) {
          const row: number[] = [];
          for (let x = x0; x <= x1; x++) {
            const u = (x - x0) / Math.max(x1 - x0, 1);
            const w = (z - z0) / Math.max(z1 - z0, 1);
            let h = sampleGrid(part.grid, u, w);
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
            let level: { y: number; weight: number } | undefined;
            for (const { x: fx, z: fz, y, margin } of [...(part.flat ? [part.flat] : []), ...part.flats]) {
              const d = Math.hypot(Math.max(fx[0] - x, 0, x - fx[1]), Math.max(fz[0] - z, 0, z - fz[1]));
              const weight = d <= 0 ? 1 : d >= margin ? 0 : 1 - d / margin;
              if (weight > (level?.weight ?? 0)) level = { y, weight };
            }
            if (level) h = level.weight >= 1 ? level.y : h * (1 - level.weight) + level.y * level.weight;
            row.push(Math.max(0, Math.min(height - 1, Math.round(h))));
          }
          heights.push(row);
        }
        ground.set(part.id, (x, z) => heights[z - z0]?.[x - x0]);
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) {
            const [r, c] = [z - z0, x - x0];
            const h = heights[r]![c]!;
            const around = [heights[r]![Math.max(c - 1, 0)]!, heights[r]![Math.min(c + 1, cols - 1)]!, heights[Math.max(r - 1, 0)]![c]!, heights[Math.min(r + 1, rows - 1)]![c]!];
            const steep = Math.max(...around.map((n) => Math.abs(n - h))) >= part.rockSlope;
            const rock = hash2(x, z, design.seed) < 0.25 ? part.rockAlt : part.rock;
            // A shell reaches down to the lowest neighbouring column, so a cliff face is solid, not hollow.
            const bottom = part.depth === undefined ? 0 : Math.max(0, Math.min(h - part.depth + 1, ...around));
            for (let y = bottom; y <= h; y++) {
              // The ground is written straight to the volume: other parts may overwrite it freely.
              v.set(x, y, z, y >= h - 2 ? (steep ? rock : part.surface) : part.base);
            }
          }
        break;
      }
      case "trees": {
        const surface = ground.get(part.on)!;
        const inside = (x: number, y: number, z: number) => x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < length;
        const sites: [number, number][] = [...part.at];
        if (part.scatter) {
          const sc = part.scatter;
          const used = new Set<string>();
          const spans = [sc.x[1] - sc.x[0] + 1, sc.z[1] - sc.z[0] + 1] as const;
          for (let attempt = 0; sites.length - part.at.length < sc.count && attempt < sc.count * 12; attempt++) {
            const tx = sc.x[0] + Math.floor(hash2(attempt, 11, design.seed) * spans[0]);
            const tz = sc.z[0] + Math.floor(hash2(attempt, 12, design.seed) * spans[1]);
            const g = surface(tx, tz);
            if (g === undefined || g > sc.treeline) continue;
            if (sc.exclude.some(([a, b, c, d]) => tx >= a && tx <= c && tz >= b && tz <= d)) continue;
            const slope = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs((surface(tx + dx!, tz + dz!) ?? g) - g)));
            if (slope > sc.maxSlope) continue;
            // Nothing may already stand where the tree would: a building, a lamp post, another tree.
            let clear = true;
            for (let dx = -3; dx <= 3 && clear; dx++)
              for (let dz = -3; dz <= 3 && clear; dz++)
                for (let dy = 1; dy <= part.maxHeight && clear; dy++) if (claimed(tx + dx, g + dy, tz + dz)) clear = false;
            if (!clear) continue;
            const cellKey = `${Math.floor(tx / sc.spacing)},${Math.floor(tz / sc.spacing)}`;
            if (used.has(cellKey)) continue;
            used.add(cellKey);
            sites.push([tx, tz]);
          }
        }
        for (const [tx, tz] of sites) {
          const base = surface(tx, tz);
          if (base === undefined) throw new RangeError(`tree at ${tx}, ${tz} is outside the terrain '${part.on}'`);
          const span = Math.max(part.maxHeight - part.minHeight + 1, 1);
          const top = base + part.minHeight + Math.floor(hash2(tx, tz, design.seed) * span);
          // Tiers: each band widens, then steps back in, like a spruce. Index is depth below the tip.
          const TIERS = [0, 1, 2, 1, 2, 3, 2, 3, 3, 2];
          const radius = (y: number) => TIERS[Math.min(top - y, TIERS.length - 1)]!;
          for (let y = base + 2; y <= top; y++) {
            const r = radius(y);
            const above = y < top ? radius(y + 1) : -1; // radius of the layer over this one
            for (let dx = -r; dx <= r; dx++)
              for (let dz = -r; dz <= r; dz++) {
                if (dx * dx + dz * dz > r * r + 1) continue;
                const [x, z] = [tx + dx, tz + dz];
                if (!inside(x, y, z)) continue;
                // Snow rests on the top of each tier: cells with no leaves above them.
                const exposed = dx * dx + dz * dz > above * above + 1;
                set(x, y, z, exposed ? part.snow : part.leaves);
              }
          }
          for (let y = base + 1; y < top; y++) if (inside(tx, y, tz)) set(tx, y, tz, part.trunk); // the tip stays leaves
        }
        break;
      }
      case "village": {
        const surface = ground.get(part.on)!;
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
        break;
      }
      case "fireplace": {
        // `d` points from the room into the wall.
        const d = part.faces === "west" ? 1 : -1;
        const front = part.faces === "west" ? part.wallX - part.depth + 1 : part.wallX + part.depth - 1;
        const zLow = part.z - part.halfWidth;
        const zHigh = part.z + part.halfWidth;
        const xs = (from: number, to: number): [number, number] => [front + d * from, front + d * to];
        const [bodyA, bodyB] = xs(0, part.depth - 1);
        fill([bodyA, feet, zLow], [bodyB, feet + part.bodyHeight - 1, zHigh], part.stone);
        const [flueA, flueB] = xs(1, part.depth - 1);
        fill([flueA, feet + part.bodyHeight, zLow], [flueB, part.top, zHigh], part.stone);
        fill([flueA, part.top + 1, zLow], [flueB, part.top + 1, zHigh], part.cap);
        fill([front, feet, part.z], [front, feet + 1, part.z], AIR); // the opening
        fill([front + d, feet + 1, part.z], [front + d, part.top, part.z], AIR); // the flue
        set(front + d, feet, part.z, "minecraft:campfire[lit=true]");
        break;
      }
    }
  };
  for (const part of design.parts) {
    current = part.id;
    allowed = new Set(part.over);
    render(part);
  }

  const layout: Layout = {
    layout: design.name,
    revision: design.version,
    bounds: { minX: ox, minY: oy, minZ: oz, maxX: ox + width - 1, maxY: oy + height - 1, maxZ: oz + length - 1 },
    anchors,
  };
  return { volume: v, layout, conflicts };
}
