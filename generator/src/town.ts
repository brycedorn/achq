import { type Direction, type Part } from "./design.js";
import { type Ctx } from "./landscape.js";

type Restaurant = Extract<Part, { type: "restaurant" }>;

const AIR = "minecraft:air";
const FLIP: Record<Direction, Direction> = { north: "south", south: "north", east: "west", west: "east" };

/**
 * Render a restaurant (see `restaurantPart` in design.ts). Positions are worked out with `u` along the
 * front (0 to width - 1) and `w` from the front wall (0) to the back wall (depth - 1); the terrace is at
 * negative `w`, outside.
 */
export function restaurant(ctx: Ctx, part: Restaurant): void {
  const { set } = ctx;
  const [x0, x1] = part.x;
  const [z0, z1] = part.z;
  const acrossX = part.facing === "south" || part.facing === "north";
  const width = acrossX ? x1 - x0 + 1 : z1 - z0 + 1;
  const depth = acrossX ? z1 - z0 + 1 : x1 - x0 + 1;
  const at = (u: number, w: number): [number, number] => {
    switch (part.facing) {
      case "south":
        return [x0 + u, z1 - w];
      case "north":
        return [x0 + u, z0 + w];
      case "east":
        return [x1 - w, z0 + u];
      case "west":
        return [x0 + w, z0 + u];
    }
  };
  const put = (u: number, w: number, y: number, state: string) => {
    const [x, z] = at(u, w);
    set(x, y, z, state);
  };
  const plusU: Direction = acrossX ? "east" : "south";
  const { y } = part;
  const top = y + 4; // the last layer inside; the roof is above it

  // Shell: floor, walls, a flat roof with a parapet.
  for (let u = 0; u < width; u++)
    for (let w = 0; w < depth; w++) {
      const edge = u === 0 || u === width - 1 || w === depth - 1;
      put(u, w, y, edge ? part.wall : part.floor);
      for (let yy = y + 1; yy <= top; yy++) put(u, w, yy, edge ? part.wall : AIR);
      put(u, w, top + 1, part.roof);
      if (u === 0 || u === width - 1 || w === 0 || w === depth - 1) put(u, w, top + 2, part.wall);
    }
  // The front: an open arcade, pillars every `bay` columns under a lintel.
  for (let u = 0; u < width; u++) {
    const pillar = u === 0 || u === width - 1 || u % part.bay === 0;
    for (let yy = y + 1; yy < top; yy++) put(u, 0, yy, pillar ? part.pillar : AIR);
    put(u, 0, top, part.wall);
  }
  // Side windows.
  for (let w = 2; w < depth - 2; w += 2)
    for (const u of [0, width - 1]) {
      put(u, w, y + 2, part.glass);
      put(u, w, y + 3, part.glass);
    }

  /** A table with a candle, a chair either side along the front, and a light above when indoors. */
  const table = (u: number, w: number, light: boolean) => {
    put(u, w, y + 1, part.table);
    put(u, w, y + 2, part.candle);
    put(u - 1, w, y + 1, `${part.chair}[facing=${FLIP[plusU]},half=bottom]`);
    put(u + 1, w, y + 1, `${part.chair}[facing=${plusU},half=bottom]`);
    if (light) put(u, w, top, part.light);
  };
  /** A table for four: two tops side by side, a chair on each side of each, a candle and a light. */
  const tableForFour = (u: number, w: number) => {
    const towardBack = FLIP[part.facing]; // +w, into the room
    for (const du of [0, 1]) {
      put(u + du, w, y + 1, part.table);
      put(u + du, w - 1, y + 1, `${part.chair}[facing=${part.facing},half=bottom]`);
      put(u + du, w + 1, y + 1, `${part.chair}[facing=${towardBack},half=bottom]`);
    }
    put(u, w, y + 2, part.candle);
    put(u, w, top, part.light);
  };
  // Tables inside, clear of the arcade and the bar: tables for two by the windows, tables for four in the middle.
  for (let w = 2, row = 0; w <= depth - 5; w += 3, row++)
    for (let u = 2, i = 0; u + 1 <= width - 2; u += 4, i++) {
      if ((row + i) % 2 === 1 && w - 1 >= 1 && w + 1 <= depth - 4 && u + 1 <= width - 2) tableForFour(u, w);
      else table(u, w, true);
    }
  // The bar along the back, with barrels behind it and a light over each end.
  for (let u = 2; u <= width - 3; u++) put(u, depth - 3, y + 1, part.counter);
  for (const u of [1, width - 2]) put(u, depth - 2, y + 1, "minecraft:barrel[facing=up]");
  put(2, depth - 3, y + 2, part.candle);
  put(width - 3, depth - 3, y + 2, part.candle);
  for (const u of [2, width - 3]) put(u, depth - 3, top, part.light);

  if (part.terrace === 0) return;
  // The terrace: paving, tables, a striped awning sloping out from the lintel, lamp posts at its edge.
  const T = part.terrace;
  for (let w = -T; w <= -1; w++)
    for (let u = 0; u < width; u++) {
      put(u, w, y, part.terraceFloor);
      for (let yy = y + 1; yy <= top; yy++) put(u, w, yy, AIR);
    }
  for (let w = -1; w >= -(T - 1); w--)
    for (let u = 0; u < width; u++) put(u, w, w >= -2 ? top : top - 1, part.awning[u % 2]!);
  if (T >= 3) for (let u = 2; u + 1 <= width - 2; u += 4) table(u, -2, false);
  for (const u of [0, Math.floor(width / 2), width - 1]) {
    put(u, -T, y + 1, part.post);
    put(u, -T, y + 2, part.post);
    put(u, -T, y + 3, part.lantern);
  }
}
