import { type Layout } from "./anchors.js";
import { type Design, type Direction, type Part, YAW } from "./design.js";
import { Volume } from "./schematic.js";
import { boulders, type Ctx, type Ground, terrain, trees, village } from "./landscape.js";

const AIR = "minecraft:air";
const OPPOSITE: Record<Direction, Direction> = { south: "north", north: "south", east: "west", west: "east" };

/** Anchor name for slot `n` (1-based) of a station: `lounge`, `lounge_2`, ... */
const slot = (station: string, n: number) => (n === 1 ? station : `${station}_${n}`);

export type Placement = { origin: readonly [number, number, number] };

/** Two parts wrote different blocks to the same cell. The later part wins in the volume. */
export type Conflict = { cell: readonly [number, number, number]; first: string; second: string };

type Vec3 = readonly [number, number, number];

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
  const ground = new Map<string, Ground>();
  const ctx: Ctx = { design, v, set, fill, claimed, ground };

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
      case "terrain":
        terrain(ctx, part);
        break;
      case "trees":
        trees(ctx, part);
        break;
      case "boulders":
        boulders(ctx, part);
        break;
      case "village":
        village(ctx, part);
        break;
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
