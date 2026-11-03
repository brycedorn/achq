import { type Part } from "./design.js";
import { type Ctx, type Ground, hash2, valueNoise } from "./landscape.js";

type Of<T extends Part["type"]> = Extract<Part, { type: T }>;
type Cell = [number, number, number];

const AIR = "minecraft:air";
const SIDES = [[1, 0, "east", "west"], [-1, 0, "west", "east"], [0, 1, "south", "north"], [0, -1, "north", "south"]] as const;

/**
 * One rainforest tree (`jungle`, `giant` or `bush`) of `size` blocks standing on the ground at `base`. Leaves, limbs
 * and vines keep out of what a part has built and out of the `clear` boxes; a giant's trunk passes through floors
 * and roofs (which it lists in `over`).
 */
export function rainforestTree(ctx: Ctx, part: Of<"trees">, g: Ground, tx: number, base: number, tz: number, size: number): void {
  const { design, v, set } = ctx;
  const seed = design.seed + 71;
  const r = (salt: number) => hash2(tx * 31 + salt, tz * 17 - salt, seed);
  const inside = (x: number, y: number, z: number) => x >= 0 && x < v.width && y >= 0 && y < v.height && z >= 0 && z < v.length;
  const cleared = (x: number, y: number, z: number) => part.clear.some(([x0, y0, z0, x1, y1, z1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1);
  const free = (x: number, y: number, z: number) => inside(x, y, z) && !ctx.claimed(x, y, z) && !cleared(x, y, z);
  const leaves: Cell[] = [];
  const logs = new Map<string, Cell>();
  const ownLeaves = new Set<string>();
  const leaf = (x: number, y: number, z: number) => {
    if (!free(x, y, z) || v.get(x, y, z) !== AIR) return;
    set(x, y, z, part.leaves);
    leaves.push([x, y, z]);
    ownLeaves.add(`${x},${y},${z}`);
  };
  /** A log of a limb or a small trunk: it gives way to anything built, but not to its own tree's leaves. */
  const limb = (x: number, y: number, z: number, axis = "y") => {
    if (!inside(x, y, z) || cleared(x, y, z) || (ctx.claimed(x, y, z) && !ownLeaves.has(`${x},${y},${z}`))) return;
    set(x, y, z, axis === "y" ? part.trunk : `${part.trunk}[axis=${axis}]`);
    logs.set(`${x},${y},${z}`, [x, y, z]);
  };
  /** A log of a giant's trunk: it goes through floors and roofs. */
  const trunk = (x: number, y: number, z: number) => {
    if (!inside(x, y, z)) return;
    set(x, y, z, part.trunk);
    logs.set(`${x},${y},${z}`, [x, y, z]);
  };
  /** Down to the ground from layer `y` in a column, so nothing stands on air where the ground falls away. */
  const footing = (x: number, y: number, z: number, put: (x: number, y: number, z: number) => void) => {
    const h = g.height(x, z);
    if (h === undefined) return;
    for (let t = Math.min(y, base); t > h; t--) put(x, t, z);
  };
  /** A rough, flattened ball of leaves. */
  const blob = (cx: number, cy: number, cz: number, rx: number, ry: number, salt: number) => {
    const R = Math.ceil(rx);
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++)
      for (let dx = -R; dx <= R; dx++)
        for (let dz = -R; dz <= R; dz++) {
          const n = (dx * dx + dz * dz) / (rx * rx) + (dy * dy) / (ry * ry);
          if (n > 1) continue;
          if (n > 0.55 && hash2(cx + dx * 7 + dy * 3, cz + dz * 5 - dy, seed + salt) < 0.3) continue;
          leaf(cx + dx, cy + dy, cz + dz);
        }
  };
  /** A limb from (x, y, z) heading `ang` radians round from east, `len` long, rising `rise` per block; returns its end. */
  const branch = (x: number, y: number, z: number, ang: number, len: number, rise: number): Cell => {
    const [ux, uz] = [Math.cos(ang), Math.sin(ang)];
    const axis = Math.abs(ux) >= Math.abs(uz) ? "x" : "z";
    const end: Cell = [x, y, z];
    for (let s = 0; s <= len; s += 0.5) {
      const c: Cell = [Math.round(x + ux * s), Math.round(y + rise * s), Math.round(z + uz * s)];
      // One axis at a time, so every log of the limb meets the last one face to face.
      for (const k of [0, 2, 1] as const)
        while (end[k] !== c[k]) {
          end[k] += Math.sign(c[k] - end[k]);
          limb(...end, k === 1 ? "y" : axis);
        }
    }
    return end;
  };

  const top = base + size;
  if (part.style === "bush") {
    limb(tx, base + 1, tz);
    blob(tx, base + 1, tz, 1.6 + r(1) * 1.2, 1.3, 1);
  } else if (part.style === "jungle") {
    // A tall straight trunk (2 x 2 when the tree is big), lumpy crowns at the top and on a branch or two below.
    const wide = size >= 14;
    const cols: [number, number][] = wide ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]];
    for (let y = base + 1; y <= top - 1; y++) for (const [dx, dz] of cols) limb(tx + dx, y, tz + dz);
    for (const [dx, dz] of cols) footing(tx + dx, base, tz + dz, limb);
    const c = wide ? 0.5 : 0;
    blob(Math.round(tx + c), top, Math.round(tz + c), (wide ? 4 : 3) + r(2), 2 + r(3) * 0.8, 2);
    const arms = 1 + Math.floor(r(4) * 2);
    for (let k = 0; k < arms; k++) {
      const ang = r(10 + k) * Math.PI * 2;
      const y = base + Math.round(size * (0.55 + r(20 + k) * 0.2));
      const end = branch(tx, y, tz, ang, 2 + r(30 + k) * 2, 0.5);
      blob(end[0], end[1] + 1, end[2], 2.2 + r(40 + k), 1.5, 3 + k);
    }
  } else {
    // A giant: a trunk tapering from `girth`, buttress fins round its foot, limbs fanning out under a broad crown.
    const girth = part.girth ?? Math.max(2, size / 14);
    const crownAt = base + Math.round(size * 0.78);
    for (let y = base + 1; y <= crownAt + 2; y++) {
      const rad = girth * (1 - 0.3 * ((y - base) / size));
      const R = Math.ceil(rad);
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) if (dx * dx + dz * dz <= rad * rad + rad) trunk(tx + dx, y, tz + dz);
    }
    const R0 = Math.ceil(girth);
    for (let dx = -R0; dx <= R0; dx++) for (let dz = -R0; dz <= R0; dz++) if (dx * dx + dz * dz <= girth * girth + girth) footing(tx + dx, base, tz + dz, trunk);
    // Buttresses: thin fins that start high on the trunk and run down and out to the ground.
    const fins = 4 + Math.floor(r(5) * 2);
    for (let k = 0; k < fins; k++) {
      const ang = ((k + r(50 + k) * 0.6) / fins) * Math.PI * 2;
      const [ux, uz] = [Math.cos(ang), Math.sin(ang)];
      const reach = girth + 3 + r(60 + k) * 3;
      const tall = Math.round(size * (0.12 + r(70 + k) * 0.06));
      for (let s = girth; s <= reach; s += 0.5) {
        const [x, z] = [Math.round(tx + ux * s), Math.round(tz + uz * s)];
        const h = g.height(x, z);
        if (h === undefined) continue;
        const up = base + Math.round(tall * Math.pow(1 - (s - girth) / (reach - girth + 0.5), 1.6));
        for (let y = h + 1; y <= up; y++) limb(x, y, z);
      }
    }
    // Limbs, then the crown: one broad cap over the trunk and a ball of leaves at the end of every limb.
    const arms = 5 + Math.floor(r(6) * 3);
    for (let k = 0; k < arms; k++) {
      const ang = ((k + r(80 + k) * 0.5) / arms) * Math.PI * 2;
      const y = crownAt - 2 + Math.round(r(90 + k) * 4);
      const end = branch(tx, y, tz, ang, girth + size * (0.16 + r(100 + k) * 0.08), 0.45);
      blob(end[0], end[1] + 1, end[2], 4 + r(110 + k) * 2.5, 2 + r(120 + k) * 0.8, 10 + k);
    }
    blob(tx, crownAt + 4, tz, girth + 5 + r(7) * 2, 2.6, 30);
  }

  // Leaves that touch nothing are trimmed, so a crown cut by a clear box leaves no stray blocks.
  const touching = ([x, y, z]: Cell) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => inside(x + a!, y + b!, z + c!) && v.get(x + a!, y + b!, z + c!) !== AIR);
  for (const c of leaves) if (v.get(...c) === part.leaves && !touching(c)) set(...c, AIR);

  // Vines down the sides of the crowns, each attached to its leaf and hanging straight down.
  if (part.vines && part.style !== "bush") {
    const { amount, length, block } = part.vines;
    for (const [x, y, z] of leaves) {
      if (v.get(x, y, z) !== part.leaves) continue;
      for (const [dx, dz, , face] of SIDES) {
        const [vx, vz] = [x + dx, z + dz];
        if (hash2(vx * 13 + y, vz * 7 - y, seed + 5) >= amount) continue;
        if (!free(vx, y, vz) || v.get(vx, y, vz) !== AIR || !(free(vx, y - 1, vz) && v.get(vx, y - 1, vz) === AIR)) continue;
        const state = `${block}[east=${face === "east"},north=${face === "north"},south=${face === "south"},up=false,west=${face === "west"}]`;
        const hang = 1 + Math.floor(hash2(vx, vz, seed + 6 + y) * length);
        for (let t = 0; t < hang && free(vx, y - t, vz) && v.get(vx, y - t, vz) === AIR; t++) set(vx, y - t, vz, state);
      }
    }
  }

  // Cocoa pods on the trunk faces near the ground, facing the log they hang from.
  if (part.cocoa > 0 && part.style !== "bush") {
    for (const [x, y, z] of logs.values()) {
      if (y > base + 8 || y < base + 2) continue;
      for (const [dx, dz, , face] of SIDES) {
        const [cx, cz] = [x + dx, z + dz];
        if (hash2(cx * 3 + y, cz * 11, seed + 9) >= part.cocoa || !free(cx, y, cz) || v.get(cx, y, cz) !== AIR) continue;
        set(cx, y, cz, `minecraft:cocoa[age=2,facing=${face}]`);
      }
    }
  }
}

/** Low plants scattered over the ground (see `plants` in `design.ts`). */
export function plants(ctx: Ctx, part: Of<"plants">): void {
  const { design, v, set } = ctx;
  const g = ctx.ground.get(part.on)!;
  const total = part.kinds.reduce((s, k) => s + k.weight, 0);
  const inside = (x: number, y: number, z: number) => x >= 0 && x < v.width && y >= 0 && y < v.height && z >= 0 && z < v.length;
  const open = (x: number, y: number, z: number) => inside(x, y, z) && v.get(x, y, z) === AIR && !ctx.claimed(x, y, z);
  for (let z = part.z[0]; z <= part.z[1]; z++)
    for (let x = part.x[0]; x <= part.x[1]; x++) {
      if (hash2(x, z, design.seed + 201) >= part.density) continue;
      if (part.exclude.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d)) continue;
      if (part.clusters && valueNoise(x / part.clusters.scale, z / part.clusters.scale, design.seed + 203) < part.clusters.threshold) continue;
      const h = g.height(x, z);
      if (h === undefined || g.keepClear.has(x + z * 100_000)) continue;
      const slope = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs((g.height(x + dx!, z + dz!) ?? h) - h)));
      if (slope > part.maxSlope || !open(x, h + 1, z) || /water|ice|lava/.test(v.get(x, h, z)) || v.get(x, h, z) === AIR) continue;
      let pick = hash2(x, z, design.seed + 202) * total;
      const kind = part.kinds.find((k) => (pick -= k.weight) < 0) ?? part.kinds[part.kinds.length - 1]!;
      if (kind.form === "single") set(x, h + 1, z, kind.block);
      else if (kind.form === "double") {
        if (!open(x, h + 2, z)) continue;
        set(x, h + 1, z, `${kind.block}[half=lower]`);
        set(x, h + 2, z, `${kind.block}[half=upper]`);
      } else {
        const [lo, hi] = kind.height;
        const tall = lo + Math.floor(hash2(x, z, design.seed + 204) * (hi - lo + 1));
        let y = h + 1;
        for (; y <= h + tall && open(x, y, z); y++) set(x, y, z, y === h + tall && kind.top ? kind.top : kind.block);
      }
    }
}
