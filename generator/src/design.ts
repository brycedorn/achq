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
/** The layer of the floor this part stands on, when it is not the design's `floorY` (an upper deck, a mezzanine). */
const floor = { floor: int.optional() };

/** A bare agent spot, such as `user` or `goal_atrium`: where the feet stand and which way they face. */
const spotPart = z.object({ ...common, ...floor, type: z.literal("spot"), anchor: z.string(), at: cell, look: direction });

/**
 * One desk per agent: desk slab and monitor at `at`, the chair one cell behind it, the agent looking `look`
 * (south by default) at the monitor. Desks run along +X when looking south or north, along +Z when looking
 * east or west.
 * With `screen`, the monitor is instead a `width` x `height` wall of that block (an AgentCraft
 * `agentcraft:monitor` facing north) on a desk as wide, every block bound to the agent's id, and `lamp`
 * (an `agentcraft:status_lamp`) sits on top, bound to `agent:<id>`: the mod then shows each agent's log
 * and state there.
 */
const deskRowPart = z.object({
  ...common,
  type: z.literal("deskRow"),
  at: cell,
  spacing: z.number().int().positive(),
  agents: z.array(z.string()).min(1),
  desk: block,
  monitor: block,
  chair: block,
  screen: z
    .object({ block, width: z.number().int().positive().refine((n) => n % 2 === 1, "width must be odd, so the screen centres on the desk"), height: z.number().int().positive() })
    .optional(),
  lamp: block.optional(),
  look: direction.default("south"),
  ...floor,
});

/**
 * A station: the agent stands at `at`, the block (a lectern, or an AgentCraft console terminal, memory
 * archive or merge station facing north) is one cell south. `binding` is stored on the block for the mod,
 * such as `shared` on a memory archive.
 */
const stationPart = z.object({ ...common, ...floor, type: z.literal("station"), station: z.string(), at: cell, block, binding: z.string().optional(), look: direction.default("south") });

/** A table with numbered seats. Slot 1 is `<station>`, slot n is `<station>_n`, in list order. */
const seatedTablePart = z.object({
  ...common,
  ...floor,
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

const podiumPart = z.object({ ...common, ...floor, type: z.literal("podium"), at: cell, block, binding: z.string().optional() });

/**
 * A single block, usually an AgentCraft status lamp, with an optional `binding` the mod reads: `merge`,
 * `decisions`, `goal`, `goal:atrium`, `beacon`, `ci:#1`, `agent:<id>` (see `mod/FEATURES.md`).
 */
const devicePart = z.object({ ...common, type: z.literal("device"), at: cell3, block, binding: z.string().optional() });

/**
 * A board on a wall, facing `facing` (east by default, a board on a west-side wall). Facing east or west it
 * takes the wall's `x` and a `z` range; facing north or south, the wall's `z` and an `x` range. `y` is an
 * inclusive range.
 */
const taskWallPart = z.object({ ...common, type: z.literal("taskWall"), x: z.union([int, cell]), z: z.union([int, cell]), y: cell, block, facing: direction.default("east") });

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

/**
 * Ground: a height field over `x` and `z`, bilinearly interpolated from `grid` (rows run along Z,
 * columns along X, each evenly spaced over the range), plus seeded value noise. Heights are the layer
 * of the top block. Inside a `flat` area the ground is exactly level, blending back to the grid over
 * `margin` blocks, so a building sits on a shelf. Trails and rivers are then cut into it. Steep ground
 * shows `rock`; gentle ground shows `surface`. Ground is never claimed: any other part may overwrite it.
 */
const flatRect = z.object({
  x: cell,
  z: cell,
  y: int,
  margin: int.nonnegative(),
  /** An ellipse inscribed in the box blends more naturally than a rectangle. */
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  /** Gentle bumps added inside the area (zero keeps it exactly level). */
  ripple: z.number().default(0),
});
const peak = z.object({ at: cell, height: z.number(), radius: z.number().positive(), sharpness: z.number().positive().default(1.5) });
const polyline = z.array(z.tuple([z.number(), z.number()])).min(2);
/** Heights along a line: `[fraction of its length, height]` pairs, joined by straight segments. */
const profile = z.array(z.tuple([z.number().min(0).max(1), z.number()])).min(2);

/**
 * A path or street along `points`. The ground under it follows the height profile `y`, `width` wide,
 * blending into the hillside over `margin` blocks, which cuts a bench into a slope. `lamps` puts a post and a lantern at its edge every `every` blocks, alternating sides.
 */
const trail = z.object({
  points: polyline,
  y: profile,
  width: z.number().positive(),
  margin: z.number().nonnegative(),
  surface: block,
  lamps: z.object({ every: z.number().positive(), post: block, lantern: block }).optional(),
});

/**
 * A river along `points`, its water surface following the height profile `y`, `depth` deep and
 * `width` wide, with banks blending over `margin`. It is frozen (`ice` all the way down) except along
 * the `open` stretches, given as fractions of its length. Water never touches the volume edge, which
 * would let it run out of a pasted structure, so the ends are always frozen.
 */
const river = z.object({
  points: polyline,
  y: profile,
  width: z.number().positive(),
  depth: z.number().int().positive(),
  margin: z.number().nonnegative(),
  open: z.array(z.tuple([z.number(), z.number()])).default([]),
  bed: block,
  ice: block,
  water: block.default("minecraft:water"),
});

/**
 * The sea: every column whose ground is below `level` is filled with water up to it, over a `bed` of sand
 * or gravel. With `beach`, gentle ground up to `above` layers over the water shows the beach block. Unlike
 * rivers, the sea may reach the volume edge: it is meant for world saves whose surroundings are sea at the
 * same level (`surroundings.sea`), so nothing can run out.
 */
const sea = z.object({
  level: int,
  bed: block,
  water: block.default("minecraft:water"),
  beach: z.object({ block, above: int.nonnegative() }).optional(),
});

const terrainPart = z.object({
  ...common,
  type: z.literal("terrain"),
  x: cell,
  z: cell,
  grid: z.array(z.array(z.number())).min(2),
  noise: z.object({ amplitude: z.number(), scale: z.number().positive() }).default({ amplitude: 0, scale: 6 }),
  /** Peaks added on top of the grid: `height` at the centre falling to nothing at `radius`. */
  peaks: z.array(peak).default([]),
  /** Ridged noise that roughens high ground into crags; it fades in above the height `above`. */
  ridged: z.object({ amplitude: z.number(), scale: z.number().positive(), above: z.number().positive() }).optional(),
  flat: flatRect.optional(),
  /** More level areas, such as a village on the valley floor. Where they overlap, the strongest wins. */
  flats: z.array(flatRect).default([]),
  trails: z.array(trail).default([]),
  rivers: z.array(river).default([]),
  sea: sea.optional(),
  /** Solid blocks below the surface. Omit for solid down to layer 0; a number makes a shell (cliffs stay closed). */
  depth: z.number().int().positive().optional(),
  surface: block,
  rock: block,
  rockAlt: block.default("minecraft:andesite"),
  base: block,
  /** The ground counts as steep, and shows rock, where a neighbouring column differs by this much. */
  rockSlope: z.number().int().positive().default(2),
});

/**
 * Where to scatter things over the ground of a terrain part: `count` sites inside `x` and `z`, on
 * ground below `treeline` that is no steeper than `maxSlope`, at least `spacing` apart, outside the
 * `exclude` rectangles `[x0, z0, x1, z1]`. `clusters` groups them with value noise (sites need noise
 * above `threshold`), leaving clearings. `taper` thins them out towards the tree line.
 */
const scatterSchema = z.object({
  x: cell,
  z: cell,
  count: z.number().int().positive(),
  treeline: int,
  maxSlope: z.number().int().nonnegative().default(1),
  spacing: z.number().int().positive().default(4),
  exclude: z.array(z.tuple([int, int, int, int])).default([]),
  clusters: z.object({ scale: z.number().positive(), threshold: z.number() }).optional(),
  /** Density thins out over this many blocks below the tree line (0 keeps it even). */
  taper: z.number().nonnegative().default(0),
});

/**
 * Snow-laden spruce trees standing on the ground of another part: those listed in `at`, and a forest
 * scattered by `scatter`. A fraction `dead` of the scattered trees are bare, with a few stub branches.
 * Trees keep clear of paths, streets and rivers, and are clipped at the volume edge.
 */
const treesPart = z.object({
  ...common,
  type: z.literal("trees"),
  on: z.string(),
  /**
   * `spruce`: tiered, snow on each tier (the default). `cypress`: a tall narrow column. `pine`: a stone pine,
   * a bare trunk under a flat umbrella crown. `olive`: short and round. Only spruce uses `snow` and `dead`.
   */
  style: z.enum(["spruce", "cypress", "pine", "olive"]).default("spruce"),
  at: z.array(cell).default([]),
  scatter: scatterSchema.optional(),
  dead: z.number().min(0).max(1).default(0),
  trunk: block,
  leaves: block,
  snow: block.optional(),
  minHeight: z.number().int().min(4),
  maxHeight: z.number().int().min(4),
});

/** Snow-capped boulders, `minSize` to `maxSize` blocks across, scattered like trees. */
const bouldersPart = z.object({
  ...common,
  type: z.literal("boulders"),
  on: z.string(),
  scatter: scatterSchema,
  minSize: z.number().int().min(1),
  maxSize: z.number().int().min(1),
  blocks: z.array(block).min(1),
  snow: block,
});

/**
 * A snowy village on ground of another part: a church at `at`, and up to `houses` houses within
 * `radius`. Houses are cottages, or with `lodges` set (a fraction) larger lodges; some use the `accent`
 * wall; `chimneys` adds stone chimneys. Each has a glowing window and a street lamp, and stands on a
 * stone plinth where the ground slopes a little. Houses keep off trails, streets and rivers.
 */
const villagePart = z.object({
  ...common,
  type: z.literal("village"),
  on: z.string(),
  /** The middle of the village; houses are placed within `radius` of it. */
  at: cell,
  /** Where the church stands, when not at `at`. */
  church: cell.optional(),
  radius: z.number().int().positive(),
  houses: z.number().int().nonnegative(),
  /**
   * "classic" is the first layout (level ground only, ridges along Z); "varied" adds the options below;
   * "explorable" is varied with houses one can walk into, furnished from `interior`.
   */
  style: z.enum(["classic", "varied", "explorable"]).default("classic"),
  wall: block,
  accent: block.optional(),
  lodges: z.number().min(0).max(1).default(0),
  chimneys: z.boolean().default(false),
  stone: block,
  roof: block,
  ridge: block,
  light: block,
  post: block,
  lantern: block,
  /** For explorable villages: floor and ceiling, window glass, a table and chairs (stairs), a hanging light, a candle for the table, and stairs for front steps. */
  interior: z.object({ floor: block, glass: block, table: block, chair: block, light: block, candle: block, step: block }).optional(),
});

/**
 * A restaurant facing `facing` on level ground, its floor at layer `y`, over the footprint `x` by `z`.
 * The front is an open arcade (pillars every `bay` columns) to walk in through; inside are tables with a
 * candle and a chair either side, a lantern over each, and a bar along the back. A `terrace` that many rows
 * deep runs along the front under an `awning` striped in its two blocks, with tables and lamp posts.
 */
const restaurantPart = z.object({
  ...common,
  type: z.literal("restaurant"),
  x: cell,
  z: cell,
  y: int,
  facing: direction,
  bay: z.number().int().min(2).default(3),
  terrace: z.number().int().nonnegative().default(4),
  wall: block,
  pillar: block,
  roof: block,
  floor: block,
  terraceFloor: block,
  glass: block,
  awning: z.tuple([block, block]),
  table: block,
  chair: block,
  light: block,
  candle: block,
  counter: block,
  post: block,
  lantern: block,
});

/**
 * A boat's hull, solid, its bow pointing `bow`. The transom is at `stern` (a coordinate along the bow
 * direction) and the hull runs `length` blocks from it; `center` is the centre line across, `beam` the
 * width at the deck (odd). Sections narrow from the deck down to the keel, and over the last `bowLength`
 * blocks the hull narrows to a point while the keel rises, which rakes the bow. The top layer, `deckY`, is
 * `deck` inside a `shell` gunwale. `stripes` paint the outer face of a layer, over `along` (a range of
 * distance from the stern) when given. A `rail` stands on the deck edge, except over `gaps` (ranges of
 * distance from the stern, for a gangway); panes and fences in it are joined to each other.
 */
const hullPart = z.object({
  ...common,
  type: z.literal("hull"),
  bow: direction,
  stern: int,
  length: z.number().int().min(4),
  center: int,
  beam: z.number().int().positive().refine((n) => n % 2 === 1, "beam must be odd, so the hull has a centre line"),
  keelY: int,
  deckY: int,
  bowLength: z.number().int().positive(),
  shell: block,
  deck: block,
  stripes: z.array(z.object({ y: int, block, along: cell.optional() })).default([]),
  rail: z.object({ block, gaps: z.array(cell).default([]) }).optional(),
});

/**
 * One tier of a boat's superstructure, placed in the same hull space as a `hull` (bow direction, `stern`,
 * `center`): from `from` to `to` blocks from the stern, layers `y` up for `height`, `halfWidth` either side
 * of the centre line. Its plan narrows to a rounded nose over the last `taper` blocks and has its aft
 * corners rounded to `radius`; each layer up, the front draws back by `rake` (a raked windscreen), the aft
 * end by `aftRake` and the sides by `tumble`. Walls are hollow. Where a wall top is exposed it becomes a
 * `slope` stair rising towards the part, or a `trim` slab, so the outline steps smoothly; `windows` rows
 * use glass, also where they slope (stepped glass) unless they name `slope` stairs. The top layer is the `roof` (edged in `trim`), unless `open`,
 * when it is just more wall, such as a coaming.
 */
const deckhousePart = z.object({
  ...common,
  type: z.literal("deckhouse"),
  bow: direction,
  stern: int,
  center: int,
  from: z.number(),
  to: z.number(),
  y: int,
  height: z.number().int().positive(),
  halfWidth: z.number().positive(),
  taper: z.number().nonnegative().default(0),
  radius: z.number().nonnegative().default(0),
  rake: z.number().default(0),
  aftRake: z.number().default(0),
  tumble: z.number().default(0),
  open: z.boolean().default(false),
  wall: block,
  roof: block,
  slope: block,
  trim: block,
  windows: z.object({ rows: z.array(int), block, slope: block.optional() }).optional(),
});

/**
 * A hill town that grows over the ground of a terrain part around `at`, out to about `radius` (an
 * irregular edge), thickest along the lanes (the terrain's trails). Each house runs along the contour with
 * its door downhill; where the slope falls away the house gains a lower storey down to the ground, so it
 * sits into the hillside instead of on a levelled terrace. Houses mix the `walls` colours, have low-pitched
 * tile hip roofs (`roofs` slabs) or, a fraction `flat` of them, flat roofs with a terrace; some have two
 * storeys and a balcony. Details: open `shutters`, bougainvillea (`flowers`), potted plants, outside steps,
 * and furnished rooms one can walk into. A `church` with a bell tower stands on its own spot.
 */
const hillsidePart = z.object({
  ...common,
  type: z.literal("hillside"),
  on: z.string(),
  at: cell,
  radius: z.number().int().positive(),
  houses: z.number().int().nonnegative(),
  /** The biggest rise across a house's footprint; steeper sites are left alone. */
  maxSlope: z.number().int().positive().default(7),
  walls: z.array(block).min(1),
  stone: block,
  roofs: z.array(block).min(1),
  ridge: block,
  flat: z.number().min(0).max(1).default(0.3),
  twoStorey: z.number().min(0).max(1).default(0.4),
  terrace: block,
  door: block,
  shutters: z.array(block).min(1),
  flowers: block,
  pots: z.array(block).min(1),
  fence: block,
  interior: z.object({ floor: block, glass: block, table: block, chair: block, light: block, candle: block, step: block, rugs: z.array(block).min(1), ladder: block }),
  church: z.object({ at: cell, facing: direction, wall: block, bell: block }).optional(),
});

/**
 * Things on a beach, standing on the ground of a terrain part: striped `umbrellas` (with a pair of sunbeds
 * each) in the `colors`, and small rowing `boats` pulled up on the sand, bows pointing the given way.
 */
const beachPart = z.object({
  ...common,
  type: z.literal("beach"),
  on: z.string(),
  umbrellas: z.array(cell).default([]),
  colors: z.array(block).min(1),
  pole: block,
  bed: block,
  boats: z.array(z.tuple([int, int, direction])).default([]),
  boatColors: z.array(block).min(1),
  boatWood: z.string(),
});

/**
 * A cylinder along `axis`, hollow inside (carved to air unless `carve` is false), from `from` to `to` along
 * the axis, its centre line at `center` (the other two coordinates: y and z for an X cylinder, x and y for Z,
 * x and z for Y). `radiusEnd`, when given, tapers it linearly into a cone frustum. The wall is one block of
 * `shell`. `windows` glaze the wall where the angle from the top (0) round to the bottom (180) is in `angle`,
 * over `along`; for a Y cylinder `along` alone picks the heights. `floor` lays a floor inside at `offset`
 * from the centre (horizontal cylinders). `ribs` ring the outside every `every` blocks; `caps` close the ends.
 */
const cylinderPart = z.object({
  ...common,
  type: z.literal("cylinder"),
  axis: z.enum(["x", "y", "z"]),
  center: cell,
  from: int,
  to: int,
  radius: z.number().positive(),
  radiusEnd: z.number().positive().optional(),
  shell: block,
  carve: z.boolean().default(true),
  windows: z.array(z.object({ angle: z.tuple([z.number(), z.number()]).optional(), along: cell.optional(), block })).default([]),
  /** `alt` lays the floor in 2 x 2 tiles of the two blocks, like deck plating. */
  floor: z.object({ offset: int, block, alt: block.optional() }).optional(),
  ribs: z.object({ every: z.number().int().positive(), block }).optional(),
  /** A fraction `amount` of the wall's plain cells use one of `blocks` instead: hull panels, patched and varied. */
  patches: z.object({ blocks: z.array(block).min(1), amount: z.number().min(0).max(1) }).optional(),
  caps: z.object({ from: z.boolean().default(true), to: z.boolean().default(true), block: block.optional() }).default({ from: true, to: true }),
});

/**
 * A sphere, or the half of one that faces `half`: a shell of `shell`, glazed with `glass` between a frame of
 * meridians every `meridians` degrees and a ring at the equator when given, hollow inside (unless `carve` is
 * false). `floor` lays a floor inside at `offset` from the centre, with `glassFrom` glazing it from that
 * offset along the facing direction, or towards the south for a full sphere (a glass floor to look down through).
 */
const spherePart = z.object({
  ...common,
  type: z.literal("sphere"),
  center: cell3,
  radius: z.number().positive(),
  half: z.enum(["full", "up", "down", "north", "south", "east", "west"]).default("full"),
  shell: block,
  glass: block.optional(),
  meridians: z.number().positive().optional(),
  carve: z.boolean().default(true),
  floor: z.object({ offset: int, block, glass: block.optional(), glassFrom: int.optional() }).optional(),
});

export const partSchema = z.discriminatedUnion("type", [
  cylinderPart,
  spherePart,
  hullPart,
  deckhousePart,
  hillsidePart,
  beachPart,
  restaurantPart,
  spotPart,
  deskRowPart,
  stationPart,
  seatedTablePart,
  lanternGridPart,
  podiumPart,
  devicePart,
  taskWallPart,
  cameraPart,
  boxPart,
  gableRoofPart,
  gableEndPart,
  deckPart,
  fireplacePart,
  terrainPart,
  treesPart,
  bouldersPart,
  villagePart,
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

/**
 * The mood of the place, applied in game with commands rather than blocks: a `biome` over the whole area
 * (a cold one makes rain fall as snow, tints the sky and water), the `weather`, and the time of day.
 * Vanilla has no snow weather as such: snow is rain in a cold biome.
 */
const atmosphereSchema = z.object({
  biome: block.optional(),
  /** In world saves, the biome over columns whose surface is water (a warm ocean turns the water turquoise). */
  seaBiome: block.optional(),
  weather: z.enum(["clear", "rain", "thunder"]).optional(),
  /** Ticks into the day: 0 sunrise, 6000 noon, 12000 sunset, 13000 dusk, 18000 midnight. */
  time: z.number().int().nonnegative().optional(),
});

export const designSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  /** Reserved: any randomness added later must draw from this. */
  seed: int.default(0),
  size: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  /** Layer of the floor blocks; feet stand at `floorY + 1`. Layers below hold foundations and posts. */
  floorY: int.nonnegative().default(0),
  shell: shellSchema,
  atmosphere: atmosphereSchema.optional(),
  /**
   * What lies around the design in a world save. Omitted, it is AgentCraft's meadow (its grass top at world
   * y 64). `sea` makes it open sea instead, its surface at layer `level` of the design
   * and its floor `floor`, out to the horizon: the terrain's own sea should meet it at the same level.
   */
  surroundings: z
    .object({
      sea: z.object({ level: int.nonnegative(), floor: block.default("minecraft:sand") }).optional(),
      /** Nothing at all round the design: open sky in every direction (a void world). */
      void: z.boolean().optional(),
      /**
       * A planet far below, written straight into the world save: a sphere of `radius` whose top is at layer
       * `top` of the design (usually far below it) over the column `center`, out to `extent` blocks. Oceans,
       * shallows, land, desert, mountains and ice come from noise; a cloud layer floats `clouds` above the
       * surface; `cities` (a fraction of land) glow on the night side.
       */
      planet: z
        .object({
          center: cell,
          top: int,
          radius: z.number().positive(),
          extent: z.number().int().positive(),
          seaLevel: z.number().min(0).max(1).default(0.55),
          clouds: z.number().int().positive().default(5),
          cities: z.number().min(0).max(1).default(0.01),
        })
        .optional(),
      /**
       * Other bodies in the sky, written into the world save: spheres at `center` (design coordinates), striped in
       * `bands` from top to bottom, pocked with `craters` when given, ringed when given a `ring` (a flat annulus,
       * tilted by `tilt` blocks up per block east). Keep them within render distance (about 190 blocks).
       */
      bodies: z
        .array(
          z.object({
            center: cell3,
            radius: z.number().positive(),
            bands: z.array(block).min(1),
            craters: block.optional(),
            ring: z.object({ inner: z.number().positive(), outer: z.number().positive(), blocks: z.array(block).min(1), tilt: z.number().default(0) }).optional(),
          }),
        )
        .default([]),
      /** A belt of `count` rocks, `minSize` to `maxSize` across, round `center` at `radius` (give or take `spread`), between heights `y`. */
      asteroids: z
        .object({ center: cell, radius: z.number().positive(), spread: z.number().nonnegative(), y: cell, count: z.number().int().positive(),
          minSize: z.number().positive(), maxSize: z.number().positive(), blocks: z.array(block).min(1) })
        .optional(),
    })
    .optional(),
  /** Where the design goes in the world unless told otherwise (the corner at its layer 0). Default 0, 64, 0. */
  origin: z.tuple([int, int, int]).optional(),
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
  const terrains = new Set(design.parts.filter((p) => p.type === "terrain").map((p) => p.id));
  for (const part of design.parts) {
    if ((part.type === "trees" || part.type === "village" || part.type === "boulders" || part.type === "hillside" || part.type === "beach") && !terrains.has(part.on)) throw new Error(`${part.type} '${part.id}' stands on '${part.on}', which is not a terrain part`);
    if (part.type === "taskWall" && (part.facing === "east" || part.facing === "west" ? typeof part.x !== "number" || typeof part.z === "number" : typeof part.z !== "number" || typeof part.x === "number"))
      throw new Error(`taskWall '${part.id}': facing east or west takes an x and a z range; facing north or south, a z and an x range`);
    if (part.type === "trees" && part.at.length === 0 && !part.scatter) throw new Error(`trees '${part.id}' have neither 'at' nor 'scatter'`);
    for (const target of part.over) if (!seen.has(target)) throw new Error(`part '${part.id}' overrides unknown part '${target}'`);
  }
  return design;
}
