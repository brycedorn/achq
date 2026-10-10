import { SHARED_STATIONS, validateLayout } from "./anchors.js";
import { type Design, YAW } from "./design.js";
import { renderDesign } from "./render.js";
import { Walk } from "./walk.js";

export type DesignProblem = { where: string; message: string };

const MIN_SLOT_SPACING = 1.6;
const SEAT = /^(desk_|lounge|meeting)/;
/** Anchors where an agent's feet stand (not block surfaces or cameras). */
const STANDING = /^(desk_|lounge|meeting|library|terminal|testbench|mergestation|user|entrance|spawn|goal_atrium)/;

const LOOKING = Object.fromEntries(Object.entries(YAW).map(([dir, yaw]) => [yaw, dir])) as Record<number, string>;
const OPPOSITE: Record<string, string> = { south: "north", north: "south", east: "west", west: "east" };
/** The cell on an agent's right, by look direction. */
const RIGHT: Record<string, readonly [number, number]> = { south: [-1, 0], north: [1, 0], east: [0, 1], west: [0, -1] };

/**
 * Everything that makes a design bad even though it parses: the anchor contract, overlapping parts,
 * seats the mod cannot use, crowded slots, unsafe standing spots, and unreachable stations.
 * Rendered at origin 0,0,0, so anchor coordinates equal local block coordinates.
 */
export function checkDesign(design: Design): DesignProblem[] {
  const problems: DesignProblem[] = [];
  const problem = (where: string, message: string): void => {
    problems.push({ where, message });
  };

  let rendered: ReturnType<typeof renderDesign>;
  try {
    rendered = renderDesign(design, { origin: [0, 0, 0] });
  } catch (e) {
    return [{ where: "design", message: e instanceof RangeError ? `a part is outside the ${design.size.join(" x ")} volume: ${e.message}` : String(e) }];
  }
  const { volume, layout, conflicts } = rendered;

  for (const p of validateLayout(layout)) problem(p.anchor, p.message);

  for (const c of conflicts) problem(c.second, `overwrites a block of part '${c.first}' at ${c.cell.join(", ")}`);

  const walk = new Walk(volume);
  const standing = Object.entries(layout.anchors).filter(([name]) => STANDING.test(name));

  for (const [name, a] of standing) {
    const [x, y, z] = [Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)];
    if (SEAT.test(name)) {
      checkSeat(name, x, y, z, a.yaw);
      continue;
    }
    if ((walk.top(x, y - 1, z) ?? 0) < 0.9) problem(name, `nothing solid under the feet at ${x}, ${y}, ${z}`);
    if (walk.floor(x, y, z) === undefined) problem(name, `no room to stand at ${x}, ${y}, ${z}`);
  }

  function checkSeat(name: string, x: number, y: number, z: number, yaw: number): void {
    const look = LOOKING[yaw];
    if (look === undefined) return problem(name, `yaw ${yaw} is not a compass direction`);
    const state = volume.get(x, y, z);
    if (!/_stairs\[/.test(state) || !state.includes("half=bottom")) return problem(name, `seat must be a bottom-half stairs block, found ${state}`);
    if (!state.includes(`facing=${OPPOSITE[look]!}`)) problem(name, `stairs must face ${OPPOSITE[look]!} for an agent looking ${look}, found ${state}`);
    const [dx, dz] = RIGHT[look]!;
    const [rx, rz] = [x + dx, z + dz];
    const free = walk.floor(rx, y, rz) !== undefined && walk.top(rx, y, rz) === undefined;
    if (!free) problem(name, `the cell on the agent's right (${rx}, ${y}, ${rz}) must be free floor`);
    if (walk.top(x, y + 1, z) !== undefined) problem(name, `no head room above the seat at ${x}, ${y + 1}, ${z}`);
  }

  // Slots of one station must not crowd each other: nameplates are up to 3 blocks wide.
  const stations = new Map<string, [string, number, number][]>();
  for (const [name, a] of standing) {
    const base = name.replace(/_\d+$/, "");
    if (!(SHARED_STATIONS as readonly string[]).includes(base)) continue;
    stations.set(base, [...(stations.get(base) ?? []), [name, a.x, a.z]]);
  }
  for (const slots of stations.values()) {
    slots.forEach(([n1, x1, z1], i) => {
      for (const [n2, x2, z2] of slots.slice(i + 1)) {
        const d = Math.hypot(x1 - x2, z1 - z2);
        if (d < MIN_SLOT_SPACING) problem(n2, `only ${d.toFixed(2)} blocks from ${n1} (minimum ${MIN_SLOT_SPACING})`);
      }
    });
  }

  // Every standing anchor must be walkable from `spawn`, with the mod's own movement rules.
  const spawn = layout.anchors["spawn"];
  const start = spawn && walk.cellAt(spawn.x, spawn.y, spawn.z);
  if (!start) {
    problem("spawn", "the spawn spot is not walkable");
  } else {
    const reach = walk.reachable(start);
    for (const [name, a] of standing) {
      if (name === "spawn") continue;
      const cell = walk.cellAt(a.x, a.y, a.z);
      if (!cell) problem(name, "not on walkable ground");
      else if (!reach.has(cell.join(","))) problem(name, "cannot be reached from spawn");
    }
  }

  return problems;
}
