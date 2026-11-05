import { HALF_WIDTH, HEIGHT, type Shape, STEP } from "../../generator/src/blocks.js";

/**
 * A player as a box 0.6 wide and 1.8 tall, moved one axis at a time against the solid boxes of blocks (the same
 * shapes the generator's walk check uses). Steps up to 0.6 without jumping, climbs ladders. Pure: no three.js.
 */

export type Blocks = {
  shapesAt(x: number, y: number, z: number): readonly Shape[];
  isClimbable(x: number, y: number, z: number): boolean;
};

/** Feet position (middle of the box's base) and velocity, in blocks and blocks per second. */
export type Body = { pos: [number, number, number]; vel: [number, number, number]; onGround: boolean; flying: boolean };

/** Keys held, and the camera's turn about the vertical axis in radians (0 looks toward -z, as three.js does). */
export type Input = { forward: boolean; back: boolean; left: boolean; right: boolean; jump: boolean; sneak: boolean; sprint: boolean; yaw: number };

/** Close to Minecraft's, so designs feel the size they are in game. */
export const WALK = 4.3;
export const SPRINT = 5.6;
export const FLY = 11;
export const GRAVITY = 32;
export const JUMP = 8.4;
export const CLIMB = 2.4;
const TERMINAL = 78;
const EPS = 1e-6;

type Aabb = { min: [number, number, number]; max: [number, number, number] };

export function newBody(pos: [number, number, number]): Body {
  return { pos: [...pos], vel: [0, 0, 0], onGround: false, flying: false };
}

const boxAt = (pos: readonly number[]): Aabb => ({
  min: [pos[0]! - HALF_WIDTH, pos[1]!, pos[2]! - HALF_WIDTH],
  max: [pos[0]! + HALF_WIDTH, pos[1]! + HEIGHT, pos[2]! + HALF_WIDTH],
});

/** Solid boxes in world coordinates that could touch `box` grown by `grow` blocks on every side. */
function solidsNear(blocks: Blocks, box: Aabb, grow: number): Aabb[] {
  const out: Aabb[] = [];
  const x0 = Math.floor(box.min[0] - grow), x1 = Math.floor(box.max[0] + grow);
  // One block lower, for fences and walls whose collision reaches 1.5 up.
  const y0 = Math.floor(box.min[1] - grow) - 1, y1 = Math.floor(box.max[1] + grow);
  const z0 = Math.floor(box.min[2] - grow), z1 = Math.floor(box.max[2] + grow);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        for (const s of blocks.shapesAt(x, y, z)) out.push({ min: [x + s.x0, y + s.lo, z + s.z0], max: [x + s.x1, y + s.hi, z + s.z1] });
  return out;
}

/** How far `box` can move along `axis` (up to `delta`) before it touches one of `solids`. */
function clampMove(box: Aabb, solids: readonly Aabb[], axis: number, delta: number): number {
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  const [lo, hi, aLo, aHi, bLo, bHi] = [box.min[axis]!, box.max[axis]!, box.min[a]!, box.max[a]!, box.min[b]!, box.max[b]!];
  for (const s of solids) {
    if (s.min[a]! >= aHi - EPS || s.max[a]! <= aLo + EPS || s.min[b]! >= bHi - EPS || s.max[b]! <= bLo + EPS) continue;
    if (delta > 0 && s.min[axis]! >= hi - EPS) delta = Math.min(delta, s.min[axis]! - hi);
    else if (delta < 0 && s.max[axis]! <= lo + EPS) delta = Math.max(delta, s.max[axis]! - lo);
  }
  return delta;
}

function shift(box: Aabb, axis: number, by: number): void {
  box.min[axis]! += by;
  box.max[axis]! += by;
}

/** Move along x then z; returns how far it got on each. */
function slide(box: Aabb, solids: readonly Aabb[], dx: number, dz: number): [number, number] {
  const mx = clampMove(box, solids, 0, dx);
  shift(box, 0, mx);
  const mz = clampMove(box, solids, 2, dz);
  shift(box, 2, mz);
  return [mx, mz];
}

/** Advance the body by `dt` seconds. */
export function step(body: Body, input: Input, blocks: Blocks, dt: number): void {
  const [fx, fz] = [-Math.sin(input.yaw), -Math.cos(input.yaw)];
  const [rx, rz] = [Math.cos(input.yaw), -Math.sin(input.yaw)];
  let wx = 0, wz = 0;
  if (input.forward) { wx += fx; wz += fz; }
  if (input.back) { wx -= fx; wz -= fz; }
  if (input.right) { wx += rx; wz += rz; }
  if (input.left) { wx -= rx; wz -= rz; }
  const len = Math.hypot(wx, wz);
  const speed = body.flying ? FLY : input.sprint ? SPRINT : WALK;
  const [tx, tz] = len > 0 ? [(wx / len) * speed, (wz / len) * speed] : [0, 0];
  // Quick to respond on the ground, sluggish in the air.
  const k = 1 - Math.exp(-dt * (body.onGround || body.flying ? 20 : 3));
  body.vel[0] += (tx - body.vel[0]) * k;
  body.vel[2] += (tz - body.vel[2]) * k;

  const [px, py, pz] = body.pos;
  const climbing = !body.flying && (blocks.isClimbable(Math.floor(px), Math.floor(py), Math.floor(pz)) || blocks.isClimbable(Math.floor(px), Math.floor(py + 1), Math.floor(pz)));
  if (body.flying) body.vel[1] = input.jump ? FLY : input.sneak ? -FLY : 0;
  else if (climbing) body.vel[1] = input.jump || input.forward ? CLIMB : input.sneak ? -CLIMB : Math.max(body.vel[1] - GRAVITY * dt, -CLIMB);
  else {
    if (input.jump && body.onGround) body.vel[1] = JUMP;
    body.vel[1] = Math.max(body.vel[1] - GRAVITY * dt, -TERMINAL);
  }

  const [dx, dy, dz] = [body.vel[0] * dt, body.vel[1] * dt, body.vel[2] * dt];
  const start = boxAt(body.pos);
  const solids = solidsNear(blocks, start, Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) + STEP + 1);

  const box = boxAt(body.pos);
  const my = clampMove(box, solids, 1, dy);
  shift(box, 1, my);
  const landed = dy < 0 && my > dy + EPS;
  const [mx, mz] = slide(box, solids, dx, dz);
  let result = box;
  let [gotX, gotZ] = [mx, mz];

  // Blocked sideways while on the ground: try again lifted by up to a step, then settle back down.
  const blocked = Math.abs(mx - dx) > EPS || Math.abs(mz - dz) > EPS;
  if (blocked && (body.onGround || landed) && !body.flying) {
    const up = boxAt(body.pos);
    shift(up, 1, my);
    const lift = clampMove(up, solids, 1, STEP);
    shift(up, 1, lift);
    const [sx, sz] = slide(up, solids, dx, dz);
    shift(up, 1, clampMove(up, solids, 1, -lift));
    if (Math.hypot(sx, sz) > Math.hypot(mx, mz) + EPS) {
      result = up;
      [gotX, gotZ] = [sx, sz];
    }
  }

  body.pos = [result.min[0] + HALF_WIDTH, result.min[1], result.min[2] + HALF_WIDTH];
  if (Math.abs(gotX - dx) > EPS) body.vel[0] = 0;
  if (Math.abs(gotZ - dz) > EPS) body.vel[2] = 0;
  if (Math.abs(my - dy) > EPS) body.vel[1] = 0;
  // On the ground when something is right underfoot.
  const below = boxAt(body.pos);
  body.onGround = !body.flying && body.vel[1] <= 0 && clampMove(below, solids, 1, -0.01) > -0.01 + EPS;
}
