import { type Part } from "./design.js";
import { type Ctx, hash2 } from "./landscape.js";

type Cylinder = Extract<Part, { type: "cylinder" }>;
type Sphere = Extract<Part, { type: "sphere" }>;

const AIR = "minecraft:air";
const ROUND = 0.35; // how far past the radius a cell's centre may be and still count as inside: smooth, full circles

/**
 * Render a cylinder (see `cylinderPart` in design.ts). Each cross-section is a disk; the wall is the edge of
 * the disk (cells with a neighbour outside it), or the whole disk at a capped end.
 */
export function cylinder(ctx: Ctx, part: Cylinder): void {
  const { set } = ctx;
  const [c1, c2] = part.center;
  /** World cell for position `a` along the axis and (p, q) across it: p is up (y) for horizontal cylinders. */
  const at = (a: number, p: number, q: number): [number, number, number] => {
    switch (part.axis) {
      case "x":
        return [a, c1 + p, c2 + q];
      case "z":
        return [c1 + q, c2 + p, a];
      case "y":
        return [c1 + p, a, c2 + q];
    }
  };
  const [a0, a1] = [Math.min(part.from, part.to), Math.max(part.from, part.to)];
  const radiusAt = (a: number) => {
    if (part.radiusEnd === undefined || a1 === a0) return part.radius;
    const t = (a - part.from) / (part.to - part.from);
    return part.radius + (part.radiusEnd - part.radius) * t;
  };
  const inside = (p: number, q: number, r: number) => p * p + q * q <= (r + ROUND) * (r + ROUND);
  const angleOf = (p: number, q: number) => (Math.atan2(Math.abs(q), p) * 180) / Math.PI; // 0 up, 180 down
  const reach = Math.ceil(Math.max(part.radius, part.radiusEnd ?? 0)) + 2;

  for (let a = a0; a <= a1; a++) {
    const r = radiusAt(a);
    const capped = (a === part.from && part.caps.from) || (a === part.to && part.caps.to);
    const rib = part.ribs && (a - a0) % part.ribs.every === 0 && a !== a0 && a !== a1;
    for (let p = -reach; p <= reach; p++)
      for (let q = -reach; q <= reach; q++) {
        const [x, y, z] = at(a, p, q);
        if (!inside(p, q, r)) {
          if (rib && inside(p, q, r + 1)) set(x, y, z, part.ribs!.block);
          continue;
        }
        const edge = !inside(p + 1, q, r) || !inside(p - 1, q, r) || !inside(p, q + 1, r) || !inside(p, q - 1, r);
        if (edge || capped) {
          let block = capped && !edge ? (part.caps.block ?? part.shell) : part.shell;
          if (edge) {
            const ang = angleOf(p, q);
            const pane = part.windows.find((w) => (!w.angle || (ang >= w.angle[0] && ang <= w.angle[1])) && (!w.along || (a >= w.along[0] && a <= w.along[1])));
            if (pane && !capped) block = pane.block;
            else if (part.patches && hash2(x * 31 + y, z * 17 - y, 977) < part.patches.amount)
              block = part.patches.blocks[Math.floor(hash2(x, y * 13 + z, 991) * part.patches.blocks.length)]!;
          }
          set(x, y, z, block);
        } else {
          if (part.floor && p === part.floor.offset && part.axis !== "y") {
            const tile = part.floor.alt && (Math.floor(a / 2) + Math.floor(q / 2)) % 2 !== 0;
            set(x, y, z, tile ? part.floor.alt! : part.floor.block);
          }
          else if (part.carve) set(x, y, z, AIR);
        }
      }
  }
}

/** Render a sphere or half sphere (see `spherePart` in design.ts). */
export function sphere(ctx: Ctx, part: Sphere): void {
  const { set } = ctx;
  const [cx, cy, cz] = part.center;
  const r = part.radius;
  const R = Math.ceil(r) + 1;
  const inside = (dx: number, dy: number, dz: number) => dx * dx + dy * dy + dz * dz <= (r + ROUND) * (r + ROUND);
  /** The facing axis as a unit vector; "full" has none. */
  const axis: Record<string, [number, number, number]> = { up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
  const dir = axis[part.half];
  const kept = (dx: number, dy: number, dz: number) => !dir || dx * dir[0] + dy * dir[1] + dz * dir[2] >= 0;
  for (let dy = -R; dy <= R; dy++)
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (!inside(dx, dy, dz) || !kept(dx, dy, dz)) continue;
        const [x, y, z] = [cx + dx, cy + dy, cz + dz];
        const edge = !inside(dx + 1, dy, dz) || !inside(dx - 1, dy, dz) || !inside(dx, dy + 1, dz) || !inside(dx, dy - 1, dz) || !inside(dx, dy, dz + 1) || !inside(dx, dy, dz - 1);
        if (edge) {
          let block = part.shell;
          if (part.glass) {
            // Glass between the frame: meridians round the vertical axis, and a ring at the equator.
            const rho = Math.hypot(dx, dz);
            let frame = Math.abs(dy) < 0.5;
            if (part.meridians && rho > 1) {
              const phi = (Math.atan2(dz, dx) * 180) / Math.PI;
              const off = Math.abs(((phi % part.meridians) + part.meridians) % part.meridians);
              const gap = Math.min(off, part.meridians - off);
              if ((gap * Math.PI * rho) / 180 < 0.55) frame = true;
            }
            block = frame ? part.shell : part.glass;
          }
          set(x, y, z, block);
          continue;
        }
        if (part.floor && dy === part.floor.offset) {
          const along = dir ? dx * dir[0] + dz * dir[2] : dz; // a full sphere glazes its floor towards the south
          const glazed = part.floor.glass && part.floor.glassFrom !== undefined && along >= part.floor.glassFrom;
          set(x, y, z, glazed ? part.floor.glass! : part.floor.block);
        } else if (part.carve) set(x, y, z, AIR);
      }
}
