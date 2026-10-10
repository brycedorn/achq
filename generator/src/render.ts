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

/**
 * Render a design into a block volume and its anchors file. Coordinates are local (x east, y up,
 * z south, floor block at y=0, feet at y=1) until the paste origin is added to the anchors.
 * Parts are applied in list order, which fixes the palette and anchor order, so output is deterministic.
 */
export function renderDesign(design: Design, { origin }: Placement): { volume: Volume; layout: Layout; conflicts: Conflict[] } {
  const [width, height, length] = design.size;
  const v = new Volume(width, height, length);
  const [ox, oy, oz] = origin;
  const anchors: Layout["anchors"] = {};
  const put = (anchor: string, x: number, y: number, z: number, yaw: number, pitch = 0) => {
    anchors[anchor] = { x: ox + x, y: oy + y, z: oz + z, yaw, pitch };
  };
  /** A standing spot at the centre of block column (x, z), feet on the floor surface. */
  const spot = (anchor: string, x: number, z: number, look: Direction) => put(anchor, x + 0.5, 1, z + 0.5, YAW[look]);
  /**
   * A seat: a bottom-half stairs block at the anchor cell, back away from the way the agent looks.
   * The cell to the agent's right must stay free floor, which the layouts guarantee by spacing.
   */
  const seat = (anchor: string, x: number, z: number, look: Direction, block: string) => {
    set(x, 1, z, `${block}[facing=${OPPOSITE[look]},half=bottom]`);
    spot(anchor, x, z, look);
  };

  // Parts write through `set`/`fill` so overlapping parts are reported, not silently overwritten.
  // The shell is written directly: parts may deliberately replace wall or floor cells.
  const claims = new Map<number, string>();
  const conflicts: Conflict[] = [];
  let current = "shell";
  const set = (x: number, y: number, z: number, state: string) => {
    const key = x + width * (z + length * y);
    const owner = claims.get(key);
    if (owner !== undefined && owner !== current) conflicts.push({ cell: [x, y, z], first: owner, second: current });
    claims.set(key, current);
    v.set(x, y, z, state);
  };
  const fill = (a: readonly [number, number, number], b: readonly [number, number, number], state: string) => {
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++)
        for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) set(x, y, z, state);
  };

  const { shell } = design;
  v.fill([0, 0, 0], [width - 1, 0, length - 1], shell.floor);
  v.fill([0, height - 2, 0], [width - 1, height - 2, length - 1], shell.roof);
  const top = height - 3;
  for (const [a, b] of [
    [[0, 1, 0], [width - 1, top, 0]],
    [[0, 1, length - 1], [width - 1, top, length - 1]],
    [[0, 1, 0], [0, top, length - 1]],
    [[width - 1, 1, 0], [width - 1, top, length - 1]],
  ] as const) {
    v.fill(a, b, shell.wall);
  }
  if (shell.glassSouth) v.fill([1, 2, length - 1], [width - 2, top, length - 1], shell.glass);
  v.fill([shell.doorX, 1, 0], [shell.doorX, 2, 0], AIR);
  spot("entrance", shell.doorX, 1, "south");
  spot("spawn", shell.doorX, 2, "south");

  const render = (part: Part): void => {
    current = part.id;
    switch (part.type) {
      case "spot":
        spot(part.anchor, part.at[0], part.at[1], part.look);
        break;
      case "deskRow": {
        const [x0, deskZ] = part.at;
        part.agents.forEach((agent, i) => {
          const x = x0 + part.spacing * i;
          set(x, 1, deskZ, part.desk);
          set(x, 2, deskZ, part.monitor);
          seat(`desk_${agent}`, x, deskZ - 1, "south", part.chair);
          put(`monitor_${agent}`, x + 0.5, 2.5, deskZ, YAW.north);
        });
        break;
      }
      case "station":
        set(part.at[0], 1, part.at[1] + 1, part.block);
        spot(part.station, part.at[0], part.at[1], "south");
        break;
      case "seatedTable":
        fill([part.table.from[0], 1, part.table.from[1]], [part.table.to[0], 1, part.table.to[1]], part.table.block);
        part.seats.forEach(([x, z, look], i) => seat(slot(part.station, i + 1), x, z, look, part.chair));
        break;
      case "lanternGrid":
        for (const x of part.xs) for (const z of part.zs) set(x, part.y, z, part.block);
        break;
      case "podium":
        set(part.at[0], 1, part.at[1], part.block);
        put("decision_podium", part.at[0] + 0.5, 2, part.at[1] + 0.5, YAW.north);
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
    }
  };
  design.parts.forEach(render);

  const layout: Layout = {
    layout: design.name,
    revision: design.version,
    bounds: { minX: ox, minY: oy, minZ: oz, maxX: ox + width - 1, maxY: oy + height - 1, maxZ: oz + length - 1 },
    anchors,
  };
  return { volume: v, layout, conflicts };
}
