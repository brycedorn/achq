import { CAST_IDS, SHARED_STATIONS, validateLayout } from "./anchors.js";
import { type Design, YAW } from "./design.js";
import { type Advice, adviseDesign } from "./advice.js";
import { invalidState } from "./blocks.js";
import { renderDesign } from "./render.js";
import { blockOf, PlayerWalk } from "./player.js";
import { opaque, senseChecks } from "./sense.js";
import { collisionTop, Walk } from "./walk.js";
import { parseState } from "./schematic.js";

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
/** Whether a block has a full top face to stand on, as Minecraft's spawn search sees it (an approximation). */
function fullTop(state: string): boolean {
  const { name, properties } = parseState(state);
  if (name === "minecraft:air" || collisionTop(state) === undefined) return false;
  if (name.endsWith("_slab")) return properties["type"] === "top" || properties["type"] === "double";
  if (name.endsWith("_stairs")) return properties["half"] === "top";
  return !/(_pane|iron_bars|_fence|_fence_gate|_wall|_carpet|lantern|end_rod|chain|_trapdoor|_door|flower_pot|potted_|candle|lever|_button|pressure_plate|daylight_detector|ladder|_rail|torch|bell|lectern|brewing_stand|_leaves|agentcraft:)/.test(name);
}

/** Built-up ground this high or more is an embankment; less is the shoulder of a path benched into a slope. */
const EMBANKMENT = 4;

/** Each connected stretch of ground built up `EMBANKMENT` or more above the land, with its highest column. */
function embankments(raised: (x: number, z: number) => number, width: number, length: number) {
  const seen = new Set<number>();
  const out: { x: number; z: number; most: number; columns: number }[] = [];
  for (let z = 0; z < length; z++)
    for (let x = 0; x < width; x++) {
      if (seen.has(x + z * width) || raised(x, z) < EMBANKMENT) continue;
      const bank = { x, z, most: 0, columns: 0 };
      const todo = [[x, z] as const];
      seen.add(x + z * width);
      while (todo.length) {
        const [cx, cz] = todo.pop()!;
        const lift = raised(cx, cz);
        bank.columns++;
        if (lift > bank.most) Object.assign(bank, { x: cx, z: cz, most: lift });
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const [nx, nz] = [cx + dx, cz + dz];
            if (nx < 0 || nz < 0 || nx >= width || nz >= length || seen.has(nx + nz * width) || raised(nx, nz) < EMBANKMENT) continue;
            seen.add(nx + nz * width);
            todo.push([nx, nz]);
          }
      }
      out.push(bank);
    }
  return out;
}

/** Every check; with `advice`, also collects notes on taste that do not fail the design (`advice.ts`). */
export function checkDesign(design: Design, advice?: Advice[]): DesignProblem[] {
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
  const { volume, layout, conflicts, built, onPath } = rendered;
  if (advice) advice.push(...adviseDesign(design, rendered));

  for (const p of validateLayout(layout)) problem(p.anchor, p.message);

  for (const c of conflicts) problem(c.second, `overwrites a block of part '${c.first}' at ${c.cell.join(", ")}`);

  // Cameras see something: not from inside a block, and not at a wall right in front of them. Their eye and view
  // are the anchor's position and yaw and pitch (Minecraft's: yaw 0 looks south, positive pitch looks down).
  for (const [name, a] of Object.entries(layout.anchors)) {
    if (!name.startsWith("cam_")) continue;
    const at = (x: number, y: number, z: number) => volume.get(Math.floor(x), Math.floor(y), Math.floor(z));
    const inside = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < volume.width && y < volume.height && z < volume.length;
    if (inside(a.x, a.y, a.z) && opaque(at(a.x, a.y, a.z))) {
      problem(name, `the camera is inside ${at(a.x, a.y, a.z)}`);
      continue;
    }
    const [yaw, pitch] = [(a.yaw * Math.PI) / 180, (a.pitch * Math.PI) / 180];
    const dir = [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    for (let d = 0.1; d <= 2; d += 0.1) {
      const [x, y, z] = [a.x + dir[0]! * d, a.y + dir[1]! * d, a.z + dir[2]! * d];
      if (inside(x, y, z) && opaque(at(x, y, z))) {
        problem(name, `the camera looks straight into ${at(x, y, z)} ${d.toFixed(1)} blocks away: turn it, or move it back`);
        break;
      }
    }
  }

  // Every block is one the game knows, as written: Minecraft loads anything else as air, without a word.
  for (let id = 1; id < volume.paletteSize; id++) {
    const wrong = invalidState(volume.stateOf(id));
    if (wrong) problem("blocks", wrong);
  }

  // The land looks like land: no trail or river carried on an embankment.
  for (const bank of embankments(rendered.raised, volume.width, volume.length))
    problem("embankment", `the ground is built up ${bank.most} blocks above the land at ${bank.x}, ${bank.z} (${bank.columns} columns): a trail or river there stands on an embankment no landscape has. Leave out its \`y\` so it follows the ground, or move it`);

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
  /** Seat blocks, which a player only has to walk up to. */
  const seats = new Map<string, [number, number, number]>();

  for (const [name, a] of spots) {
    const [x, y, z] = cellOf(a);
    if (isSeat(name, x, y, z)) {
      seats.set(name, [x, y, z]);
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

  // Minecraft puts a new player on the first block with a full top face looking down from the sky over the spawn
  // (`PlayerSpawnFinder.getLevelRespawnPos`), not at the spawn itself: a roof over it means arriving on the roof.
  // Panes, bars, slabs and other partial blocks let the search fall through.
  if (spawn) {
    const [sx, sy, sz] = [Math.floor(spawn.x), Math.floor(spawn.y + 0.01), Math.floor(spawn.z)];
    for (let y = volume.height - 1; y >= sy; y--) {
      const state = volume.get(sx, y, sz);
      if (state.includes("water") || state.includes("lava")) break;
      if (fullTop(state)) {
        if (y + 1 !== sy)
          problem("spawn", `new players will arrive on top of ${state} at y ${y + 1}, not at the spawn: open the column above it, or use panes, bars or slabs there`);
        break;
      }
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

  // A player must be able to walk it too: from the spawn to every spot and every place the design names, and back,
  // without jumping.
  if (spawn) {
    const places = new Map<string, readonly [number, number, number]>([...targets, ...seats]);
    for (const t of design.walk?.to ?? []) places.set(t.name, t.at);
    // Both ends of every trail, standing on its surface (or the stair on it), not on a roof built over it.
    for (const part of design.parts)
      if (part.type === "terrain")
        part.trails.forEach((t, i) => {
          const own = new Set([t.surface, t.steps].filter((b) => b !== undefined));
          for (const [end, [px, pz]] of [["start", t.points[0]!], ["end", t.points[t.points.length - 1]!]] as const) {
            const [x, z] = [Math.round(px), Math.round(pz)];
            let y = volume.height - 1;
            while (y >= 0 && !own.has(parseState(volume.get(x, y, z)).name)) y--;
            if (y >= 0) places.set(`${part.id} trail ${i + 1} ${end}`, [x, y + 1, z]);
          }
        });
    // The walk keeps to the HQ and the places named, with room round them.
    const b = layout.bounds;
    const xs = [...places.values()].map((p) => p[0]).concat(b ? [b.minX, b.maxX] : [0, volume.width - 1]);
    const zs = [...places.values()].map((p) => p[2]).concat(b ? [b.minZ, b.maxZ] : [0, volume.length - 1]);
    const pad = 6;
    const player = new PlayerWalk(volume, [
      Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...zs) - pad),
      Math.min(volume.width - 1, Math.max(...xs) + pad), Math.min(volume.length - 1, Math.max(...zs) + pad),
    ]);
    const start = player.standAt(...cellOf(spawn));
    if (!start) problem("spawn", "a player has nowhere to stand at the spawn");
    else {
      const { there, back } = player.explore(start);
      for (const [name, [x, y, z]] of places) {
        // On the spot; at a seat, on it or beside it.
        const near = seats.has(name) ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
        const at = [...there.entries()].filter(([, s]) => near.some(([dx, dz]) => PlayerWalk.over(s, x + dx!, y, z + dz!))).map(([k]) => k);
        if (at.some((k) => back.has(k))) continue;
        if (at.length > 0) {
          problem(name, `a player can walk from the spawn to ${x}, ${y}, ${z} but not back without jumping`);
          continue;
        }
        // Where the walk got closest, to show where it is cut off.
        let closest: [number, number, number] | undefined;
        let best = Infinity;
        for (const s of there.values()) {
          const [bx, by, bz] = blockOf(s);
          const d = Math.hypot(bx - x, (by - y) * 2, bz - z);
          if (d < best) [best, closest] = [d, [bx, by, bz]];
        }
        problem(name, `a player cannot walk from the spawn to ${x}, ${y}, ${z} without jumping; the walk gets closest at ${closest!.join(", ")}`);
      }

      // Guarded drops: wherever a player can walk off a built floor or a path into a fall that hurts, there must be a
      // railing or a wall. Open hillside and natural cliffs are left as they are; stepping off into water is safe.
      const edges = new Map<string, number>();
      /** A trail's own surface: its top block (or the stair on it), not the hillside the trail is cut into. */
      const pathTop = (x: number, y: number, z: number) =>
        onPath(x, z) && volume.get(x, y, z) !== "minecraft:air" && (y + 1 >= volume.height || volume.get(x, y + 1, z) === "minecraft:air" || /_stairs/.test(volume.get(x, y, z)));
      // From every place a player stands (the middle of them over the floor), out over the rim of the floor for up to two
      // blocks, any way they can go (a gap in a railing may take a zigzag to get through), to where they would fall.
      const RIM = 8;
      for (const s of there.values()) {
        // On a built floor or a path: the block under the middle of them, not one their box just overlaps.
        const [ux, uy, uz] = [Math.floor(s.qx / 4), Math.ceil(s.f - 1e-6) - 1, Math.floor(s.qz / 4)];
        if (!player.centred(s) || player.climbing(s) || !(built(ux, uy, uz) || pathTop(ux, uy, uz))) continue;
        let fall: number | undefined;
        const seen = new Set<string>([`${s.qx},${s.qz}`]);
        let ring = [s];
        for (let depth = 0; depth <= RIM && fall === undefined && ring.length > 0; depth++) {
          const next: (typeof s)[] = [];
          for (const at of ring) {
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              fall ??= player.drop(at, dx, dz);
              const n = player.move(at, dx, dz);
              // Along the rim only: not back onto a floor (a place of its own), up or down a step, or onto a ladder.
              if (!n || n.f !== s.f || player.centred(n) || player.climbing(n) || seen.has(`${n.qx},${n.qz}`)) continue;
              seen.add(`${n.qx},${n.qz}`);
              next.push(n);
            }
          }
          ring = next;
        }
        if (fall !== undefined) {
          const k = blockOf(s).join(",");
          edges.set(k, Math.max(edges.get(k) ?? 0, fall));
        }
      }
      // One report per stretch of edge.
      const seen = new Set<string>();
      for (const k of [...edges.keys()].sort()) {
        if (seen.has(k)) continue;
        const stretch = [k];
        seen.add(k);
        for (let i = 0; i < stretch.length; i++) {
          const [x, y, z] = stretch[i]!.split(",").map(Number) as [number, number, number];
          for (let dx = -1; dx <= 1; dx++)
            for (let dz = -1; dz <= 1; dz++) {
              const n = `${x + dx},${y},${z + dz}`;
              if (edges.has(n) && !seen.has(n)) {
                seen.add(n);
                stretch.push(n);
              }
            }
        }
        const fall = Math.max(...stretch.map((e) => edges.get(e)!));
        const deep = Number.isFinite(fall) ? `${Math.floor(fall)} blocks` : "nothing below";
        problem("drop", `an unguarded drop (${deep}) beside ${stretch[0]!.split(",").join(", ")}${stretch.length > 1 ? ` and ${stretch.length - 1} more blocks along the edge` : ""}: add a railing or a wall`);
      }

      // What a person expects without thinking: paths lead somewhere, doors open onto somewhere, nothing floats.
      for (const p of senseChecks(design, rendered, player, there)) problem(p.where, p.message);
    }
  }

  return problems;
}
