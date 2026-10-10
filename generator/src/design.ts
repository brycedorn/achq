import { z } from "zod";

export const DIRECTIONS = ["south", "west", "north", "east"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Minecraft yaw: 0 = +Z (south), 90 = -X (west), 180 = -Z (north), -90 = +X (east). */
export const YAW: Record<Direction, number> = { south: 0, west: 90, north: 180, east: -90 };

const block = z.string().min(1);
const direction = z.enum(DIRECTIONS);
const int = z.number().int();
const cell = z.tuple([int, int]);
const cell3 = z.tuple([int, int, int]);
const point = z.tuple([z.number(), z.number(), z.number()]);
const seat = z.tuple([int, int, direction]);

/**
 * Fields every part has. `over` lists ids of parts this one may overwrite on purpose, such as a
 * chimney passing through a roof. Overwriting any other part's blocks is a design problem.
 */
const common = { id: z.string().min(1), over: z.array(z.string()).default([]) };

/** A bare agent spot, such as `user` or `goal_atrium`: where the feet stand and which way they face. */
const spotPart = z.object({ ...common, type: z.literal("spot"), anchor: z.string(), at: cell, look: direction });

/** One desk per agent along +X: desk slab and monitor at `at`, chair one cell north of the desk, facing it. */
const deskRowPart = z.object({
  ...common,
  type: z.literal("deskRow"),
  at: cell,
  spacing: z.number().int().positive(),
  agents: z.array(z.string()).min(1),
  desk: block,
  monitor: block,
  chair: block,
});

/** A lectern station: the agent stands at `at`, the lectern is one cell south. */
const stationPart = z.object({ ...common, type: z.literal("station"), station: z.string(), at: cell, block });

/** A table with numbered seats. Slot 1 is `<station>`, slot n is `<station>_n`, in list order. */
const seatedTablePart = z.object({
  ...common,
  type: z.literal("seatedTable"),
  station: z.string(),
  table: z.object({ from: cell, to: cell, block }),
  chair: block,
  seats: z.array(seat).min(1),
});

/** Hanging lanterns on a grid, at height `y` (absolute). */
const lanternGridPart = z.object({
  ...common,
  type: z.literal("lanternGrid"),
  xs: z.array(int),
  zs: z.array(int),
  y: int,
  block,
});

const podiumPart = z.object({ ...common, type: z.literal("podium"), at: cell, block });

/** A board on a west-side wall: `z` and `y` are inclusive ranges, and the anchor faces east. */
const taskWallPart = z.object({ ...common, type: z.literal("taskWall"), x: int, z: cell, y: cell, block });

const cameraPart = z.object({ ...common, type: z.literal("camera"), name: z.string(), at: point, yaw: z.number(), pitch: z.number() });

/** An inclusive box of one block state. Air carves: it removes blocks without counting as an overwrite. */
const boxPart = z.object({ ...common, type: z.literal("box"), from: cell3, to: cell3, block });

/**
 * A gable roof with its ridge along Z, two layers thick: a timber underside (`body` stairs) and a snow
 * cap (`snow` stairs) one block up. `x` is the outer wall extent (an odd number of columns, so the ridge
 * is on a column), `z` the roof extent along the ridge, `eaveY` the layer of the lowest timber row. The
 * edge rows at both ends use `trim` for the timber, which outlines the white roof in dark wood.
 */
const gableRoofPart = z.object({
  ...common,
  type: z.literal("gableRoof"),
  x: cell,
  z: cell,
  eaveY: int,
  overhang: int.nonnegative(),
  body: block,
  snow: block,
  trim: block,
  ridgeBody: block,
  ridgeSnow: block,
});

/**
 * The wall under one end of a gable roof, in the plane `z`. Rows start at `y0`, are rectangular up to
 * `eaveY`, then follow the roof slope to the apex. Glazed ends are glass broken by `frame` mullions
 * (every `every` columns from the centre) and transoms (every `transomEvery` rows).
 */
const gableEndPart = z.object({
  ...common,
  type: z.literal("gableEnd"),
  z: int,
  x: cell,
  y0: int,
  eaveY: int,
  overhang: int.nonnegative(),
  kind: z.enum(["glazed", "solid"]),
  fill: block,
  glass: block,
  frame: block,
  every: z.number().int().positive(),
  transomEvery: z.number().int().positive(),
});

/** A platform with a railing on chosen sides and posts down to `bottom` under the edges. */
const deckPart = z.object({
  ...common,
  type: z.literal("deck"),
  x: cell,
  z: cell,
  y: int,
  planks: block,
  rail: z.object({ block, sides: z.array(direction) }),
  posts: z.object({ block, every: z.number().int().positive(), bottom: int }),
});

/**
 * A stone fireplace in a side wall. `wallX` is the outer face of the wall, `faces` the side the room is
 * on. The body is `depth` deep and `2 * halfWidth + 1` wide; above `bodyHeight` it narrows to a chimney
 * up to `top`. The firebox holds a lit campfire behind an opening in the front face.
 */
const fireplacePart = z.object({
  ...common,
  type: z.literal("fireplace"),
  wallX: int,
  faces: z.enum(["west", "east"]),
  z: int,
  depth: z.number().int().min(3),
  halfWidth: z.number().int().positive(),
  bodyHeight: z.number().int().min(3),
  top: int,
  stone: block,
  cap: block,
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
  boxPart,
  gableRoofPart,
  gableEndPart,
  deckPart,
  fireplacePart,
]);

const boxShell = z.object({
  kind: z.literal("box"),
  floor: block,
  wall: block,
  glass: block,
  roof: block,
  /** X of the 1 x 2 doorway in the north wall; `entrance` and `spawn` are placed just inside it. */
  doorX: int,
  /** Whether the south wall is glass above the first row. */
  glassSouth: z.boolean(),
});

/** No generated shell: the parts build everything, including `entrance` and `spawn`. */
const noShell = z.object({ kind: z.literal("none") });

/** Designs written before shells had a kind are box shells. */
const shellSchema = z.preprocess(
  (value) => (typeof value === "object" && value !== null && !("kind" in value) ? { ...value, kind: "box" } : value),
  z.discriminatedUnion("kind", [boxShell, noShell]),
);

export const designSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  /** Reserved: any randomness added later must draw from this. */
  seed: int.default(0),
  size: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  /** Layer of the floor blocks; feet stand at `floorY + 1`. Layers below hold foundations and posts. */
  floorY: int.nonnegative().default(0),
  shell: shellSchema,
  parts: z.array(partSchema),
});

export type Design = z.infer<typeof designSchema>;
export type Part = z.infer<typeof partSchema>;
/** A part as written in a design file, before defaults such as `over` are filled in. */
export type PartInput = z.input<typeof partSchema>;

export function parseDesign(json: unknown): Design {
  const design = designSchema.parse(json);
  const seen = new Set<string>();
  for (const part of design.parts) {
    if (seen.has(part.id)) throw new Error(`duplicate part id '${part.id}'`);
    seen.add(part.id);
  }
  for (const part of design.parts) {
    for (const target of part.over) if (!seen.has(target)) throw new Error(`part '${part.id}' overrides unknown part '${target}'`);
  }
  return design;
}
