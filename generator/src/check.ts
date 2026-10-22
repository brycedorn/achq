import { CAST_IDS, SHARED_STATIONS, validateLayout } from "./anchors.js";
import { type Design, YAW } from "./design.js";
import { renderDesign } from "./render.js";
import { Walk } from "./walk.js";

export type DesignProblem = { where: string; message: string };

const MIN_SLOT_SPACING = 1.6;
/** By the anchor contract these anchors are chairs (`mod/FEATURES.md`). */
const SEAT_NAMES = /^(desk_|lounge|meeting)/;
/** Anchors that are points on blocks or cameras, not places an agent stands (the mod's `HqCheck.NOT_SPOTS`). */
const NOT_SPOTS = new Set(["task_wall", "decision_podium", "goal_atrium"]);

/** Whether an anchor is a place an agent stands: the mod's `HqCheck.isSpot`. */
export function isSpot(name: string): boolean {
  return !name.startsWith("cam_") && !name.startsWith("monitor_") && !name.startsWith("seat_") && !NOT_SPOTS.has(name) && name !== "spawn";
}

const LOOKING = Object.fromEntries(Object.entries(YAW).map(([dir, yaw]) => [yaw, dir])) as Record<number, string>;
const OPPOSITE: Record<string, string> = { south: "north", north: "south", east: "west", west: "east" };

/**
 * Everything that makes a design bad even though it parses: the anchor contract, overlapping parts,
 * seats the mod cannot use, crowded slots, unsafe standing spots, and unreachable stations. The spot,
 * seat and reachability rules follow the mod's own `dev.hq.check` (`HqCheck`) and the agents' seat
 * logic (`Seats`). Rendered at origin 0,0,0, so anchor coordinates equal local block coordinates.
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
  const spots = Object.entries(layout.anchors).filter(([name]) => isSpot(name));
  const cellOf = (a: { x: number; y: number; z: number }) => [Math.floor(a.x), Math.floor(a.y + 0.01), Math.floor(a.z)] as const;

  /** A seat block at the anchor: bottom stairs, a bottom slab, or anything 0.3 to 0.7 high. User spots never sit. */
  const isSeat = (name: string, x: number, y: number, z: number): boolean => {
    if (name.startsWith("user") || name === "podium_user") return false;
    const state = volume.get(x, y, z);
    if (/_stairs\[/.test(state)) return state.includes("half=bottom");
    if (/_slab(\[|$)/.test(state)) return !/type=(top|double)/.test(state);
    const top = walk.top(x, y, z);
    return top !== undefined && top >= 0.3 && top <= 0.7;
  };

  /** The cell an agent steps into a seat from: its right-hand side, then the left, behind, in front (the mod's `Seats.approach`). */
  const approach = (x: number, y: number, z: number, yaw: number): [number, number, number] | undefined => {
    const rad = (yaw * Math.PI) / 180;
    const dx = Math.round(-Math.sin(rad));
    const dz = Math.round(Math.cos(rad));
    for (const [ox, oz] of [[-dz, dx], [dz, -dx], [-dx, -dz], [dx, dz]] as const) {
      for (const dy of [0, 1, -1]) if (walk.floor(x + ox, y + dy, z + oz) !== undefined) return [x + ox, y + dy, z + oz];
    }
    return undefined;
  };

  /** Where reachability is measured to: a seat's step-in cell, or the cell an agent stands in. */
  const targets = new Map<string, [number, number, number]>();

  for (const [name, a] of spots) {
    const [x, y, z] = cellOf(a);
    if (isSeat(name, x, y, z)) {
      const look = LOOKING[a.yaw];
      const state = volume.get(x, y, z);
      if (look !== undefined && /_stairs\[/.test(state) && !state.includes(`facing=${OPPOSITE[look]!}`)) {
        problem(name, `stairs should face ${OPPOSITE[look]!} for an agent looking ${look}, found ${state}`);
      }
      if (walk.top(x, y + 1, z) !== undefined) problem(name, `no head room above the seat at ${x}, ${y + 1}, ${z}`);
      const from = approach(x, y, z, a.yaw);
      if (!from) problem(name, "seat with no free side to step in from");
      else targets.set(name, from);
      continue;
    }
    if (SEAT_NAMES.test(name)) problem(name, `should be a seat (bottom stairs, a bottom slab or a 0.3 to 0.7 high block), found ${volume.get(x, y, z)}`);
    if ((walk.top(x, y - 1, z) ?? 0) < 0.9) problem(name, `nothing solid under the feet at ${x}, ${y}, ${z}`);
    if (walk.floor(x, y, z) === undefined) problem(name, `no room to stand at ${x}, ${y}, ${z}`);
    const cell = walk.cellAt(a.x, a.y, a.z);
    if (cell) targets.set(name, cell);
  }

  // Slots of one station must not crowd each other: nameplates are up to 3 blocks wide.
  const stations = new Map<string, [string, number, number][]>();
  for (const [name, a] of spots) {
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

  // Off-shift agents wait in the lounge, so it needs a slot for every agent in the cast (`mod/FEATURES.md`).
  const lounge = spots.filter(([name]) => name === "lounge" || /^lounge_\d+$/.test(name)).length;
  if (lounge > 0 && lounge < CAST_IDS.length) problem("lounge", `has ${lounge} slots; the lounge needs one per agent (${CAST_IDS.length})`);

  // The player arrives at `spawn`, so it must be somewhere to stand.
  const spawn = layout.anchors["spawn"];
  if (spawn && !walk.cellAt(spawn.x, spawn.y, spawn.z)) problem("spawn", "the spawn spot is not walkable");

  // The goal lamp projects its hologram card about 3.5 blocks above itself (`StatusLampRenderer.HOLO_Y`, a card up
  // to about 2 blocks tall): a ceiling or anything solid 3 or 4 blocks over the lamp cuts through it.
  for (const part of design.parts) {
    if (part.type !== "device" || part.binding !== "goal:atrium") continue;
    const [x, y, z] = part.at;
    for (const dy of [3, 4]) {
      const top = walk.top(x, y + dy, z);
      if (top !== undefined && !/glass|lantern/.test(volume.get(x, y + dy, z)))
        problem(part.id, `the goal hologram needs open space 3 to 4 blocks above the lamp, but ${volume.get(x, y + dy, z)} is at ${x}, ${y + dy}, ${z}; lower the lamp (it can sit under the floor) or give it a higher ceiling`);
    }
  }

  // Every spot must be walkable from `entrance` and from `lounge`, as the mod checks, with its movement rules.
  for (const from of ["entrance", "lounge"]) {
    const start = targets.get(from);
    if (!start) continue; // a missing or broken anchor is already reported above
    const reach = walk.reachable(start);
    for (const [name] of spots) {
      if (name === from) continue;
      const target = targets.get(name);
      if (target && !reach.has(target.join(","))) problem(name, `cannot be reached from ${from}`);
    }
  }

  return problems;
}
