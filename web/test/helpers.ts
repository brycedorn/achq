import { World } from "../src/world.js";

/** A small world from a list of blocks; everything else is air. */
export function makeWorld(size: [number, number, number], blocks: [number, number, number, string][]): World {
  const palette = ["minecraft:air"];
  const [w, h, l] = size;
  const cells = new Uint16Array(w * h * l);
  for (const [x, y, z, state] of blocks) {
    let id = palette.indexOf(state);
    if (id === -1) id = palette.push(state) - 1;
    cells[x + z * w + y * w * l] = id;
  }
  return new World({ name: "test", size, palette, anchors: {} }, cells);
}

/** Every block in a box, inclusive. */
export function fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, state: string): [number, number, number, string][] {
  const out: [number, number, number, string][] = [];
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, y, z, state]);
  return out;
}
