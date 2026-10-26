import { type Design } from "./design.js";
import { type Rendered } from "./render.js";
import { parseState } from "./schematic.js";
import { blockOf, PlayerWalk, shapes, type Spot } from "./player.js";

/**
 * Things a person expects of a place without thinking about it, checked so a design does not get them wrong: a path
 * leads somewhere (a door, a gate, a jetty, a bench), a door opens onto somewhere to stand, and nothing floats.
 */
export type SenseProblem = { where: string; message: string };

/** Blocks a path is made of, when a part lays it (trails are known from the terrain). */
const PATH = /^minecraft:(gravel|dirt_path|coarse_dirt|packed_mud)$/;
/** Things a path can sensibly end at: a seat, a store, a well or a lamp, a bell, a gate. */
const STOP = /(_stairs|_slab|cauldron|barrel|composter|chest|bell|lantern|_fence|_fence_gate|potted_|flower_pot|decorated_pot|lectern|campfire|_wall)$/;
const STEP: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

const isAir = (s: string) => s === "minecraft:air" || s === "minecraft:cave_air";
const isFluid = (s: string) => /^minecraft:(water|lava)/.test(s);
const solid = (s: string) => !isAir(s) && !isFluid(s);

export function senseChecks(design: Design, rendered: Rendered, player: PlayerWalk, there: Map<string, Spot>): SenseProblem[] {
  const { volume: v, built } = rendered;
  const out: SenseProblem[] = [];
  const get = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= v.width || y >= v.height || z >= v.length ? "minecraft:air" : v.get(x, y, z));
  const name = (s: string) => parseState(s).name;
  // Where players stand, by block and half block of height, for quick lookups.
  const standing = new Set<string>();
  for (const s of there.values()) standing.add(`${Math.floor(s.qx / 4)},${Math.floor(s.f * 2 + 1e-6)},${Math.floor(s.qz / 4)}`);
  /** Whether a player stands in the block (x, z) with their feet within the block layer `y` (or half a block below). */
  const reached = (x: number, y: number, z: number) => [2 * y - 1, 2 * y, 2 * y + 1].some((h) => standing.has(`${x},${h},${z}`));
  /** The top of the ground or floor in a column at about layer y: the layer of the block stood on. */
  const surface = (x: number, z: number, y: number) => {
    for (let t = y + 2; t >= y - 3; t--) if (solid(get(x, t, z)) && !solid(get(x, t + 1, z))) return t;
    return undefined;
  };

  // Paths lead somewhere: each end arrives at a door or doorway, a gate, a floor (a jetty, a porch), another path, or
  // something to stop at; not at a blank wall, and not out in the open.
  const ends: { where: string; x: number; z: number; dir: [number, number]; y: number; own?: string }[] = [];
  for (const part of design.parts) {
    if (part.type === "terrain")
      part.trails.forEach((t, i) => {
        const pts = t.points;
        for (const [a, b] of [[pts[0]!, pts[1]!], [pts[pts.length - 1]!, pts[pts.length - 2]!]] as const) {
          const [x, z] = [Math.round(a[0]), Math.round(a[1])];
          const [dx, dz] = [a[0] - b[0], a[1] - b[1]];
          const dir: [number, number] = Math.abs(dx) >= Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
          const y = surface(x, z, Math.round(t.y[a === pts[0] ? 0 : t.y.length - 1]![1]));
          if (y !== undefined) ends.push({ where: `${part.id} trail ${i + 1}`, x, z, dir, y, own: `${part.id}:${i}` });
        }
      });
    // A path laid as a line of path blocks, one wide.
    if (part.type === "box" && PATH.test(part.block) && part.from[1] === part.to[1] && (part.from[0] === part.to[0]) !== (part.from[2] === part.to[2])) {
      const alongX = part.from[2] === part.to[2];
      const [a, b] = alongX ? [part.from[0], part.to[0]] : [part.from[2], part.to[2]];
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      for (const [c, sign] of [[lo, -1], [hi, 1]] as const) {
        const [x, z] = alongX ? [c, part.from[2]] : [part.from[0], c];
        ends.push({ where: part.id, x, z, dir: alongX ? [sign, 0] : [0, sign], y: part.from[1] });
      }
    }
  }
  /** Whether a column is part of some path: a trail, or path blocks laid on the ground. */
  const pathAt = (x: number, z: number, y: number) => rendered.onPath(x, z) || PATH.test(get(x, y, z));
  for (const e of ends) {
    const [nx, nz] = [e.x + e.dir[0], e.z + e.dir[1]];
    // Running on into another path (a junction, or a lane meeting the street) is a path that goes somewhere. Two and
    // three blocks on, past the reach of this path's own width.
    if ([2, 3].some((k) => {
      const [ax, az] = [e.x + e.dir[0] * k, e.z + e.dir[1] * k];
      const y = surface(ax, az, e.y);
      return y !== undefined && pathAt(ax, az, y);
    })) continue;
    // ...or into another trail beside it (a lane meeting the street at its side).
    let meets = false;
    for (let dx = -3; dx <= 3 && !meets; dx++)
      for (let dz = -3; dz <= 3 && !meets; dz++) {
        const other = rendered.pathOf(e.x + dx, e.z + dz);
        meets = other !== undefined && other !== e.own;
      }
    if (meets) continue;
    const feet = e.y + 1;
    const ahead = [get(nx, feet, nz), get(nx, feet + 1, nz)];
    // Around the end and the cell ahead, at foot height: a door, a gate, something to stop at.
    const near: string[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) near.push(get(e.x + dx, feet, e.z + dz), get(nx + dx, feet, nz + dz));
    if (near.some((s) => /_door$|_fence_gate$/.test(name(s)) || STOP.test(name(s)))) continue;
    if (ahead.every((s) => !solid(s))) {
      // A doorway: open ahead, wall either side of it.
      const [sx, sz] = [e.dir[1], e.dir[0]];
      const walled = solid(get(nx + sx, feet, nz + sz)) && solid(get(nx - sx, feet, nz - sz)) && solid(get(nx + sx, feet + 1, nz + sz));
      const floor = surface(nx, nz, e.y);
      const onFloor = floor !== undefined && Math.abs(floor - e.y) <= 1 && built(nx, floor, nz) && !PATH.test(get(nx, floor, nz));
      if (walled || onFloor) continue;
      out.push({ where: e.where, message: `the path ends in the open at ${e.x}, ${feet}, ${e.z}: lead it to a door, a gate or a jetty, or end it at something (a bench, a well)` });
    } else {
      out.push({ where: e.where, message: `the path runs into a wall at ${nx}, ${feet}, ${nz}: give the wall a door or a gate there, or end the path before it` });
    }
  }

  // Doors lead somewhere: a player who reaches one side of a door can stand on the other.
  for (let y = 0; y < v.height; y++)
    for (let z = 0; z < v.length; z++)
      for (let x = 0; x < v.width; x++) {
        const s = v.get(x, y, z);
        if (!s.includes("_door[") || !s.includes("half=lower") || !built(x, y, z)) continue;
        const f = /facing=(\w+)/.exec(s)?.[1] ?? "north";
        const [dx, dz] = STEP[f]!;
        // Judged only where a player gets to one side of it: a door out of the walked area is someone else's.
        const sides = [1, -1].map((side) => [x + dx * side, z + dz * side] as const);
        const ok = sides.map(([sx, sz]) => reached(sx, y, sz));
        if (ok.some(Boolean))
          sides.forEach(([sx, sz], i) => {
            if (!ok[i]) out.push({ where: "door", message: `the door at ${x}, ${y}, ${z} opens onto ${sx}, ${y}, ${sz}, where no one can stand or walk to` });
          });
      }

  // Nothing floats: what hangs has something above it, what stands has something under it, and no built block is on
  // its own in the air.
  const floating: string[] = [];
  for (let y = 0; y < v.height; y++)
    for (let z = 0; z < v.length; z++)
      for (let x = 0; x < v.width; x++) {
        const s = v.get(x, y, z);
        if (isAir(s) || !(built(x, y, z) || rendered.natural(x, y, z))) continue; // a tree's branches must not float either
        const { name: n, properties: p } = parseState(s);
        const below = get(x, y - 1, z);
        const above = get(x, y + 1, z);
        let need: "below" | "above" | undefined;
        if (/^minecraft:(soul_)?lantern$/.test(n)) need = p["hanging"] === "true" ? "above" : "below";
        else if (n === "minecraft:bell") need = p["attachment"] === "ceiling" ? "above" : p["attachment"] === "floor" ? "below" : undefined;
        else if (/(_carpet|flower_pot|_pressure_plate|_rail|candle)$/.test(n) || n.startsWith("minecraft:potted_") || (/_door$/.test(n) && p["half"] === "lower")) need = "below";
        else if (/^minecraft:(wheat|carrots|potatoes|beetroots)$/.test(n)) {
          if (name(below) !== "minecraft:farmland") out.push({ where: "crop", message: `${n} at ${x}, ${y}, ${z} needs farmland under it` });
          continue;
        }
        if (need === "below" && !solid(below)) out.push({ where: "support", message: `${n} at ${x}, ${y}, ${z} has nothing under it` });
        if (need === "above" && !solid(above)) out.push({ where: "support", message: `${n} at ${x}, ${y}, ${z} hangs from nothing` });
        if (need) continue;
        const touching = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => !isAir(get(x + a!, y + b!, z + c!)));
        if (!touching) floating.push(`${n} at ${x}, ${y}, ${z}`);
      }
  for (const f of floating.slice(0, 10)) out.push({ where: "floating", message: `${f} floats, touching nothing` });
  if (floating.length > 10) out.push({ where: "floating", message: `and ${floating.length - 10} more blocks float, touching nothing` });

  // The places a player stands on built floors (the middle of them over it), each once per block.
  const stands = new Map<string, [number, number, number]>();
  for (const s of there.values()) {
    if (!player.centred(s) || player.climbing(s)) continue;
    const under = player.support(s).find(([x, y, z]) => built(x, y, z));
    if (!under) continue;
    const at = blockOf(s);
    stands.set(at.join(","), at);
  }
  const report = (where: string, cells: [number, number, number][], say: (at: string, more: string) => string) => {
    for (const group of stretches(cells)) {
      const more = group.length > 1 ? ` and ${group.length - 1} more blocks around it` : "";
      out.push({ where, message: say(group[0]!.join(", "), more) });
    }
  };

  // Lit rooms: indoors, wherever a player can stand, some lamp's light reaches. At block light 0 mobs spawn.
  if (stands.size > 0) {
    const light = blockLight(v, [...stands.values()]);
    const dark: [number, number, number][] = [];
    for (const [x, y, z] of stands.values()) {
      let roofed = false;
      for (let t = y + 2; t <= y + 8 && t < v.height && !roofed; t++) roofed = opaque(get(x, t, z)); // a ceiling, not a far overhang
      // Where a mob could appear: dark, under a roof, with two blocks of air (not a doorway, which a door fills).
      if (roofed && light(x, y, z) === 0 && isAir(get(x, y, z)) && isAir(get(x, y + 1, z))) dark.push([x, y, z]);
    }
    report("dark", dark, (at, more) => `it is dark (block light 0) at ${at}${more}: mobs can spawn there; give the room a lamp`);
  }

  // Seats face something: a table or desk, a fire, a window, other seats or open space, not a blank wall.
  const turned: [number, number, number][] = [];
  for (let y = 1; y < v.height - 2; y++)
    for (let z = 0; z < v.length; z++)
      for (let x = 0; x < v.width; x++) {
        const s = v.get(x, y, z);
        if (!s.includes("_stairs[") || !s.includes("half=bottom") || !built(x, y, z)) continue;
        const f = /facing=(\w+)/.exec(s)?.[1] ?? "north";
        const [dx, dz] = STEP[f]!;
        const same = (t: string) => t.includes("_stairs[") && t.includes("half=bottom") && t.includes(`facing=${f}`);
        // A seat stands on a floor with room over it, and is not a step: of a flight, or up onto higher ground.
        if (!opaque(get(x, y - 1, z)) || solid(get(x, y + 1, z))) continue;
        if (same(get(x + dx, y + 1, z + dz)) || same(get(x - dx, y - 1, z - dz))) continue;
        if (solid(get(x + dx, y, z + dz)) && !solid(get(x + dx, y + 1, z + dz))) continue;
        // Its sitter looks away from its back: within two blocks, at the seat and at eye level.
        const ahead = [1, 2].flatMap((k) => [get(x - dx * k, y, z - dz * k), get(x - dx * k, y + 1, z - dz * k)]);
        if (ahead.some((t) => solid(t) && !boring(t))) continue;
        if ([1, 2].some((k) => boring(get(x - dx * k, y + 1, z - dz * k)))) turned.push([x, y, z]);
      }
  for (const [x, y, z] of turned) out.push({ where: "seat", message: `the seat at ${x}, ${y}, ${z} faces a blank wall: turn it to a table, a fire, a window or the view` });

  // Windows look out: glass with open air on one side must have a line of sight through it, straight or (in a curved
  // wall, which steps) diagonal, not a solid block right against it on every line.
  const blind: [number, number, number][] = [];
  /** Seen past: anything but a full opaque block (a handrail, a desk, a lamp, more glass). */
  const clearView = (t: string) => !opaque(t);
  for (let y = 0; y < v.height; y++)
    for (let z = 0; z < v.length; z++)
      for (let x = 0; x < v.width; x++) {
        const s = v.get(x, y, z);
        if (!/glass/.test(s) || !built(x, y, z)) continue;
        const lines = [[1, 0], [0, 1], [1, 1], [1, -1]].map(([ax, az]) => [get(x + ax!, y, z + az!), get(x - ax!, y, z - az!)] as const);
        const facesAir = lines.slice(0, 2).some(([a, b]) => !solid(a) || !solid(b));
        if (facesAir && !lines.some(([a, b]) => clearView(a) && clearView(b))) blind.push([x, y, z]);
      }
  report("window", blind, (at, more) => `the window at ${at}${more} looks straight into a solid block: move what is against it, or the window`);

  // Stairs arrive somewhere open: a clear block to stand in at the foot and at the head of every flight.
  for (let y = 1; y < v.height - 3; y++)
    for (let z = 0; z < v.length; z++)
      for (let x = 0; x < v.width; x++) {
        const s = v.get(x, y, z);
        if (!s.includes("_stairs[") || !s.includes("half=bottom") || !built(x, y, z)) continue;
        const f = /facing=(\w+)/.exec(s)?.[1] ?? "north";
        const [dx, dz] = STEP[f]!;
        const same = (t: string) => t.includes("_stairs[") && t.includes("half=bottom") && t.includes(`facing=${f}`);
        const up = same(get(x + dx, y + 1, z + dz));
        const down = same(get(x - dx, y - 1, z - dz));
        if (up === down) continue; // the middle of a flight, or a lone stair (a seat, a step)
        if (!reached(x, y, z)) continue; // a roof's rows of stairs, not a flight anyone walks
        // The foot: room to stand in front of the first step. The head: room to step off the last one.
        const [cx, cy, cz] = down ? [x + dx, y + 1, z + dz] : [x - dx, y, z - dz];
        if (solid(get(cx, cy, cz)) || solid(get(cx, cy + 1, cz)))
          out.push({ where: "stairs", message: `the stairs at ${x}, ${y}, ${z} ${down ? "arrive at" : "start at"} ${get(cx, cy, cz) !== "minecraft:air" ? get(cx, cy, cz) : get(cx, cy + 1, cz)} (${cx}, ${cy}, ${cz}): leave a clear block there` });
      }

  // Buildings sit on the ground: no floor a player stands on with a gap of a block or three under it over open ground.
  const lifted: [number, number, number][] = [];
  for (const [x, y, z] of stands.values()) {
    const floor = y - 1;
    if (solid(get(x, floor - 1, z))) continue;
    for (let d = 2; d <= 4; d++) {
      const t = get(x, floor - d, z);
      if (isFluid(t)) break;
      if (solid(t)) {
        if (!built(x, floor - d, z)) lifted.push([x, floor, z]);
        break;
      }
    }
  }
  // A floor on posts is fine: within three blocks, under the same floor, a built column (a post, a foundation wall)
  // reaches all the way down to the ground. A floor reaching further out than that over open ground hangs in the air.
  const post = (x: number, y: number, z: number) => {
    if (!built(x, y - 1, z)) return false;
    for (let t = y - 1; t >= 0; t--) {
      const s = get(x, t, z);
      if (!solid(s)) return false;
      if (!built(x, t, z) || isFluid(get(x, t - 1, z))) return true;
    }
    return true;
  };
  const propped = (x: number, y: number, z: number) => {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (built(x + dx, y, z + dz) && post(x + dx, y, z + dz)) return true;
    return false;
  };
  const unpropped = stretches(lifted.filter(([x, y, z]) => !propped(x, y, z)));
  report("ground", unpropped.flat(), (at, more) => `the floor at ${at}${more} stands over a gap above the ground: build it down to the ground, or put it on posts`);

  return out;
}

/** Light each block gives off, as Minecraft has it. */
function emits(state: string): number {
  const { name: n, properties: p } = parseState(state);
  if (/^minecraft:(sea_lantern|glowstone|shroomlight|jack_o_lantern|beacon|lava|conduit|.*froglight)$/.test(n) || n === "minecraft:lantern") return 15;
  if (n === "minecraft:campfire") return p["lit"] === "false" ? 0 : 15;
  if (n === "minecraft:redstone_lamp") return p["lit"] === "true" ? 15 : 0;
  if (n === "minecraft:end_rod" || n === "minecraft:torch" || n === "minecraft:wall_torch") return 14;
  if (/^minecraft:(smoker|furnace|blast_furnace)$/.test(n)) return p["lit"] === "true" ? 13 : 0;
  if (/^minecraft:soul_(lantern|campfire|torch|wall_torch)$/.test(n)) return 10;
  if (/candle$/.test(n)) return p["lit"] === "true" ? 3 * Number(p["candles"] ?? 1) : 0;
  return 0;
}

/** Whether a block stops light (and is a solid wall): a full, opaque cube. */
function opaque(state: string): boolean {
  if (!solid(state) || /glass|ice$|leaves|agentcraft:|chest|cauldron|composter|lectern|decorated_pot|farmland|bell/.test(state)) return false;
  const s = shapes(state);
  return s.length === 1 && s[0]!.x0 === 0 && s[0]!.x1 === 1 && s[0]!.z0 === 0 && s[0]!.z1 === 1 && s[0]!.lo === 0 && s[0]!.hi === 1;
}

/** A plain wall: an opaque block of building material (stone, wood, concrete), nothing to look at. */
function boring(state: string): boolean {
  return opaque(state) && /(concrete|terracotta|planks|bricks|stone|_log|_wood|wool|quartz|deepslate|blackstone|sandstone|calcite|andesite|diorite|granite|tuff|copper|dirt|grass_block|snow_block|prismarine|purpur|basalt|obsidian|clay|mud)/.test(state) && !/bookshelf|lamp|lantern|glass/.test(state);
}

/**
 * Block light in the box round `around` (with room for light to reach in from 15 blocks away): from every lamp, falling
 * by one a block, stopped by opaque blocks. Returns the light at a block (0 outside the box).
 */
function blockLight(v: Rendered["volume"], around: [number, number, number][]): (x: number, y: number, z: number) => number {
  const pad = 16;
  const x0 = Math.max(0, Math.min(...around.map((a) => a[0])) - pad);
  const x1 = Math.min(v.width - 1, Math.max(...around.map((a) => a[0])) + pad);
  const z0 = Math.max(0, Math.min(...around.map((a) => a[2])) - pad);
  const z1 = Math.min(v.length - 1, Math.max(...around.map((a) => a[2])) + pad);
  const [w, h, l] = [x1 - x0 + 1, v.height, z1 - z0 + 1];
  const level = new Uint8Array(w * h * l);
  const idx = (x: number, y: number, z: number) => x - x0 + w * (z - z0 + l * y);
  const stops = new Map<number, boolean>();
  const blocked = (x: number, y: number, z: number) => {
    const id = v.idAt(x, y, z);
    if (!stops.has(id)) stops.set(id, opaque(v.stateOf(id)));
    return stops.get(id)!;
  };
  const queue: number[] = [];
  for (let y = 0; y < h; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const id = v.idAt(x, y, z);
        if (id === 0) continue;
        const e = emits(v.stateOf(id));
        if (e > 0) {
          level[idx(x, y, z)] = e;
          queue.push(x, y, z);
        }
      }
  for (let head = 0; head < queue.length; head += 3) {
    const [x, y, z] = [queue[head]!, queue[head + 1]!, queue[head + 2]!];
    const next = level[idx(x, y, z)]! - 1;
    if (next <= 0) continue;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const [nx, ny, nz] = [x + dx, y + dy, z + dz];
      if (nx < x0 || nx > x1 || ny < 0 || ny >= h || nz < z0 || nz > z1) continue;
      const i = idx(nx, ny, nz);
      if (level[i]! >= next || blocked(nx, ny, nz)) continue;
      level[i] = next;
      queue.push(nx, ny, nz);
    }
  }
  return (x, y, z) => (x < x0 || x > x1 || z < z0 || z > z1 || y < 0 || y >= h ? 0 : level[idx(x, y, z)]!);
}

/** Cells grouped into stretches that touch (sideways or diagonally, at the same height). */
function stretches(cells: [number, number, number][]): [number, number, number][][] {
  const left = new Map(cells.map((c) => [c.join(","), c]));
  const out: [number, number, number][][] = [];
  for (const [k, c] of [...left.entries()].sort()) {
    if (!left.has(k)) continue;
    left.delete(k);
    const group = [c];
    for (let i = 0; i < group.length; i++) {
      const [x, y, z] = group[i]!;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const n = `${x + dx},${y},${z + dz}`;
          const m = left.get(n);
          if (m) {
            left.delete(n);
            group.push(m);
          }
        }
    }
    out.push(group);
  }
  return out;
}

