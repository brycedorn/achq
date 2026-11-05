import { type Design } from "./design.js";
import { type Rendered } from "./render.js";
import { parseState } from "./state.js";

/**
 * Advice on taste, not rules: a design is not wrong for any of it, so `check` prints these as notes and passes. A
 * personal touch (a potted plant, a decorated pot, a banner) used over and over close together reads as
 * stamped; and some things do not belong where the design is set (an open flame in space, snow in the tropics).
 */
export type Advice = { where: string; message: string };

/** Personal touches: things a person picks one by one, which look stamped when repeated (not table candles, which a
 * restaurant sets alike). */
const TOUCH = /^minecraft:(potted_\w+|decorated_pot|\w*banner|flower_pot)$/;
/** How many of one touch, within `NEAR` blocks of each other, read as stamped. */
const MANY = 4;
const NEAR = 6;

/** Things that do not belong in a setting, by what gives the setting away. */
const OUT_OF_PLACE: { when: (d: Design) => boolean; setting: string; blocks: RegExp; why: string }[] = [
  { when: (d) => d.surroundings?.void === true, setting: "in space", blocks: /^minecraft:(\w*candle|campfire|soul_campfire|torch|wall_torch|fire|lantern|soul_lantern)$/, why: "no open flame where there is no air to spare" },
  { when: (d) => d.surroundings?.void === true, setting: "in space", blocks: /^minecraft:(snow|snow_block|powder_snow|water)$/, why: "it would not stay put" },
  { when: (d) => /desert|savanna|jungle|badlands|beach|warm_ocean|mangrove/.test(d.atmosphere?.biome ?? ""), setting: "somewhere warm", blocks: /^minecraft:(snow|snow_block|powder_snow|ice|packed_ice|blue_ice)$/, why: "snow and ice melt there" },
  { when: (d) => /snowy|frozen|ice|grove|jagged|cold/.test(d.atmosphere?.biome ?? ""), setting: "somewhere cold", blocks: /^minecraft:(cactus|potted_cactus|dead_bush|sugar_cane|bamboo|cocoa|melon|jungle_leaves)$/, why: "it does not grow in the cold" },
];

export function adviseDesign(design: Design, rendered: Rendered): Advice[] {
  const { volume: v, built } = rendered;
  const out: Advice[] = [];
  const touches = new Map<string, [number, number, number][]>();
  const misplaced = new Map<string, [string, string, [number, number, number]]>();
  const rules = OUT_OF_PLACE.filter((r) => r.when(design));
  // Only the palette entries that could matter, worked out once each.
  const interesting = new Map<number, { state: string; name: string; touch: boolean; rules: typeof rules }>();
  for (let id = 1; id < v.paletteSize; id++) {
    const state = v.stateOf(id);
    const name = parseState(state).name;
    const hit = { state, name, touch: TOUCH.test(name), rules: rules.filter((r) => r.blocks.test(name)) };
    if (hit.touch || hit.rules.length > 0) interesting.set(id, hit);
  }
  if (interesting.size > 0)
    for (let y = 0; y < v.height; y++)
      for (let z = 0; z < v.length; z++)
        for (let x = 0; x < v.width; x++) {
          const hit = interesting.get(v.idAt(x, y, z));
          if (!hit || !built(x, y, z)) continue;
          if (hit.touch) touches.set(hit.state, [...(touches.get(hit.state) ?? []), [x, y, z]]);
          for (const r of hit.rules) if (!misplaced.has(`${r.setting}:${hit.name}`)) misplaced.set(`${r.setting}:${hit.name}`, [r.setting, r.why, [x, y, z]]);
        }

  // Stamped touches: one exact block, MANY or more within NEAR of each other.
  for (const [state, cells] of touches) {
    const seen = new Set<number>();
    cells.forEach((c, i) => {
      if (seen.has(i)) return;
      const group = cells.map((d, j) => [d, j] as const).filter(([d]) => Math.max(Math.abs(d[0] - c[0]), Math.abs(d[1] - c[1]), Math.abs(d[2] - c[2])) <= NEAR);
      if (group.length < MANY) return;
      for (const [, j] of group) seen.add(j);
      out.push({ where: "repetition", message: `${group.length} of ${parseState(state).name} within ${NEAR} blocks of ${c.join(", ")}: vary them, so they read as picked, not stamped` });
    });
  }
  for (const [key, [setting, why, at]] of misplaced) out.push({ where: "setting", message: `${key.split(":").slice(1).join(":")} at ${at.join(", ")} ${setting}: ${why}` });
  out.push(...flatWalls(rendered), ...lowRooms(rendered));
  return out;
}

const AIR = "minecraft:air";
/** A full, opaque block of building material (not glass, not a partial block). */
const solidWall = (s: string) => s !== AIR && !/glass|_pane|_stairs|_slab|_fence|_wall\b|_wall\[|_trapdoor|_door|leaves|water|lava|carpet|lantern|torch|bars|chain|rod/.test(s);

/**
 * Flat walls (docs/styles/building-techniques.md, rule 1): an outside wall that is one block in one plane, at least
 * `WIDE` across and `TALL` high with nothing in front of it, reads as cardboard. Outside means open sky above the air in
 * front of it.
 */
const WIDE = 9;
const TALL = 4;
function flatWalls({ volume: v, built }: Rendered): Advice[] {
  const out: Advice[] = [];
  const { width: W, height: H, length: L } = v;
  const idx = (x: number, y: number, z: number) => x + W * (z + L * y);
  const get = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L ? AIR : v.get(x, y, z));
  const wallIds = new Map<number, boolean>();
  const isWall = (id: number) => {
    if (!wallIds.has(id)) wallIds.set(id, id !== 0 && solidWall(v.stateOf(id)));
    return wallIds.get(id)!;
  };
  /** Open to the sky: nothing above all the way up (a hollow under the ground is not outside). */
  const sky = (x: number, y: number, z: number) => {
    for (let t = y + 1; t < H; t++) if (v.idAt(x, t, z) !== 0) return false;
    return true;
  };
  const seen = new Uint8Array(W * H * L);
  for (const [bit, dx, dz] of [[1, 1, 0], [2, -1, 0], [4, 0, 1], [8, 0, -1]] as const) {
    const open = (x: number, z: number) => x < 0 || z < 0 || x >= W || z >= L;
    const face = (a: number, b: number, c: number, id: number) =>
      a >= 0 && b >= 0 && c >= 0 && a < W && b < H && c < L && v.idAt(a, b, c) === id && (open(a + dx, c + dz) || (v.idAt(a + dx, b, c + dz) === 0 && sky(a + dx, b, c + dz))) && built(a, b, c);
    for (let y = 0; y < H; y++)
      for (let z = 0; z < L; z++)
        for (let x = 0; x < W; x++) {
          const id = v.idAt(x, y, z);
          if (!isWall(id) || seen[idx(x, y, z)]! & bit || !face(x, y, z, id)) continue;
          // The connected face of this one block in this plane: along the wall and up.
          const [ux, uz] = [dz, dx];
          const todo: [number, number, number][] = [[x, y, z]];
          seen[idx(x, y, z)]! |= bit;
          let [lo, hi, bottom, top, n] = [Infinity, -Infinity, Infinity, -Infinity, 0];
          while (todo.length > 0) {
            const [a, b, c] = todo.pop()!;
            n++;
            const along = a * ux + c * uz;
            [lo, hi, bottom, top] = [Math.min(lo, along), Math.max(hi, along), Math.min(bottom, b), Math.max(top, b)];
            for (const [na, nb, nc] of [[a + ux, b, c + uz], [a - ux, b, c - uz], [a, b + 1, c], [a, b - 1, c]] as const) {
              if (!face(na, nb, nc, id) || seen[idx(na, nb, nc)]! & bit) continue;
              seen[idx(na, nb, nc)]! |= bit;
              todo.push([na, nb, nc]);
            }
          }
          const [w, h] = [hi - lo + 1, top - bottom + 1];
          if (w >= WIDE && h >= TALL && n >= 0.85 * w * h)
            out.push({ where: "flat wall", message: `${w} by ${h} of ${parseState(get(x, y, z)).name} in one plane at ${x}, ${y}, ${z}: break it up with posts, a plinth, set-back windows or a change of material` });
        }
  }
  return out;
}

/** Rooms only 2 high (rule 16): a dozen or more floor cells with a ceiling right over a person's head. */
function lowRooms({ volume: v, built }: Rendered): Advice[] {
  const wallIds = new Map<number, boolean>();
  const isWall = (id: number) => {
    if (!wallIds.has(id)) wallIds.set(id, id !== 0 && solidWall(v.stateOf(id)));
    return wallIds.get(id)!;
  };
  const low = new Set<string>();
  for (let y = 1; y < v.height - 2; y++)
    for (let z = 0; z < v.length; z++)
      for (let x = 0; x < v.width; x++)
        if (v.idAt(x, y, z) === 0 && v.idAt(x, y + 1, z) === 0 && isWall(v.idAt(x, y + 2, z)) && isWall(v.idAt(x, y - 1, z)) && built(x, y - 1, z) && built(x, y + 2, z))
          low.add(`${x},${y},${z}`);
  const out: Advice[] = [];
  const seen = new Set<string>();
  for (const k of low) {
    if (seen.has(k)) continue;
    const group = [k];
    seen.add(k);
    for (let i = 0; i < group.length; i++) {
      const [x, y, z] = group[i]!.split(",").map(Number) as [number, number, number];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = `${x + dx!},${y},${z + dz!}`;
        if (low.has(n) && !seen.has(n)) {
          seen.add(n);
          group.push(n);
        }
      }
    }
    if (group.length >= 12) out.push({ where: "low room", message: `a room only 2 high at ${group[0]!.split(",").join(", ")} (${group.length} blocks of floor): give it a ceiling at least 3 above the floor` });
  }
  return out;
}
