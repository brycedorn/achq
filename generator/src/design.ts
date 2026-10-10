import { z } from "zod";

export const DIRECTIONS = ["south", "west", "north", "east"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Minecraft yaw: 0 = +Z (south), 90 = -X (west), 180 = -Z (north), -90 = +X (east). */
export const YAW: Record<Direction, number> = { south: 0, west: 90, north: 180, east: -90 };

const block = z.string().min(1);
const direction = z.enum(DIRECTIONS);
const cell = z.tuple([z.number().int(), z.number().int()]);
const point = z.tuple([z.number(), z.number(), z.number()]);
const seat = z.tuple([z.number().int(), z.number().int(), direction]);

const id = z.string().min(1);

/** A bare agent spot, such as `user` or `goal_atrium`: where the feet stand and which way they face. */
const spotPart = z.object({ type: z.literal("spot"), id, anchor: z.string(), at: cell, look: direction });

/** One desk per agent along +X: desk slab and monitor at `at`, chair one cell north of the desk, facing it. */
const deskRowPart = z.object({
  type: z.literal("deskRow"),
  id,
  at: cell,
  spacing: z.number().int().positive(),
  agents: z.array(z.string()).min(1),
  desk: block,
  monitor: block,
  chair: block,
});

/** A lectern station: the agent stands at `at`, the lectern is one cell south. */
const stationPart = z.object({ type: z.literal("station"), id, station: z.string(), at: cell, block });

/** A table with numbered seats. Slot 1 is `<station>`, slot n is `<station>_n`, in list order. */
const seatedTablePart = z.object({
  type: z.literal("seatedTable"),
  id,
  station: z.string(),
  table: z.object({ from: cell, to: cell, block }),
  chair: block,
  seats: z.array(seat).min(1),
});

/** Hanging lanterns on a grid, at height `y` above the floor block. */
const lanternGridPart = z.object({
  type: z.literal("lanternGrid"),
  id,
  xs: z.array(z.number().int()),
  zs: z.array(z.number().int()),
  y: z.number().int(),
  block,
});

const podiumPart = z.object({ type: z.literal("podium"), id, at: cell, block });

/** A board on a west-side wall: `z` and `y` are inclusive ranges, and the anchor faces east. */
const taskWallPart = z.object({
  type: z.literal("taskWall"),
  id,
  x: z.number().int(),
  z: cell,
  y: cell,
  block,
});

const cameraPart = z.object({
  type: z.literal("camera"),
  id,
  name: z.string(),
  at: point,
  yaw: z.number(),
  pitch: z.number(),
});

export const partSchema = z.discriminatedUnion("type", [
  spotPart,
  deskRowPart,
  stationPart,
  seatedTablePart,
  lanternGridPart,
  podiumPart,
  taskWallPart,
  cameraPart,
]);

export const designSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  /** Reserved: any randomness added later must draw from this. */
  seed: z.number().int().default(0),
  size: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  shell: z.object({
    floor: block,
    wall: block,
    glass: block,
    roof: block,
    /** X of the 1 x 2 doorway in the north wall; `entrance` and `spawn` are placed just inside it. */
    doorX: z.number().int(),
    /** Whether the south wall is glass above the first row. */
    glassSouth: z.boolean(),
  }),
  parts: z.array(partSchema),
});

export type Design = z.infer<typeof designSchema>;
export type Part = z.infer<typeof partSchema>;

export function parseDesign(json: unknown): Design {
  const design = designSchema.parse(json);
  const seen = new Set<string>();
  for (const part of design.parts) {
    if (seen.has(part.id)) throw new Error(`duplicate part id '${part.id}'`);
    seen.add(part.id);
  }
  return design;
}
