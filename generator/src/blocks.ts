import { parseState } from "./state.js";

/**
 * What a block state looks like and what a player bumps into, for code outside Minecraft (the walk checks and the
 * browser). Anything not listed is a full cube, which only makes walking stricter.
 */

/** How far a player steps up without jumping, how tall and how wide a player is. */
export const STEP = 0.6;
export const HEIGHT = 1.8;
export const HALF_WIDTH = 0.3;

/** A solid box, in block units; `standable` when its top can be stood on. */
export type Shape = { x0: number; z0: number; x1: number; z1: number; lo: number; hi: number; standable: boolean };

const full = (lo: number, hi: number, standable = true): Shape => ({ x0: 0, z0: 0, x1: 1, z1: 1, lo, hi, standable });
const centred = (r: number, lo: number, hi: number, standable = true): Shape => ({ x0: 0.5 - r, z0: 0.5 - r, x1: 0.5 + r, z1: 0.5 + r, lo, hi, standable });

/** A post `r` from the middle (when `post`) and an arm `a` wide out to each joined side: bars, panes, fences, walls. */
function postAndArms(p: Record<string, string>, r: number, a: number, hi: number, post: boolean): Shape[] {
  const out: Shape[] = post ? [centred(r, 0, hi, false)] : [];
  const joined = (d: string) => p[d] !== undefined && p[d] !== "false" && p[d] !== "none";
  if (joined("north")) out.push({ x0: 0.5 - a, x1: 0.5 + a, z0: 0, z1: 0.5, lo: 0, hi, standable: false });
  if (joined("south")) out.push({ x0: 0.5 - a, x1: 0.5 + a, z0: 0.5, z1: 1, lo: 0, hi, standable: false });
  if (joined("west")) out.push({ x0: 0, x1: 0.5, z0: 0.5 - a, z1: 0.5 + a, lo: 0, hi, standable: false });
  if (joined("east")) out.push({ x0: 0.5, x1: 1, z0: 0.5 - a, z1: 0.5 + a, lo: 0, hi, standable: false });
  return out;
}

/** No collision for a player: they walk through plants and signs, open doors, climb ladders. */
const NONE = /(_button|_sign|_pressure_plate|_banner|_door|chain|ladder|vine|short_grass|tall_grass|torch|redstone_wire|potatoes|carrots|beetroots|wheat|_sapling|tripwire|:air|:cave_air|:void_air|:light)$/;
const FLUID = /^minecraft:(water|lava|bubble_column)$/;

/** The solid boxes of a block, in its own coordinates (0 to 1 across, and up from its base). */
export function shapes(state: string): Shape[] {
  const { name, properties: p } = parseState(state);
  if (name.endsWith("flower_pot") || name.startsWith("minecraft:potted_")) return [centred(0.1875, 0, 0.375)];
  if (name === "minecraft:fern" || NONE.test(name)) return [];
  if (FLUID.test(name)) return [full(0, 1, false)];
  if (name.endsWith("_trapdoor")) return p["open"] === "true" ? [] : [p["half"] === "top" ? full(0.8125, 1) : full(0, 0.1875)];
  if (name.endsWith("_slab")) return [p["type"] === "top" ? full(0.5, 1) : full(0, p["type"] === "double" ? 1 : 0.5)];
  if (name.endsWith("_stairs")) {
    // The tall half is on the side the stair faces: the way up.
    const half = ({ north: { z1: 0.5 }, south: { z0: 0.5 }, west: { x1: 0.5 }, east: { x0: 0.5 } } as Record<string, Partial<Shape>>)[p["facing"] ?? "north"] ?? {};
    const top = p["half"] === "top";
    return [top ? full(0.5, 1) : full(0, 0.5), { ...full(top ? 0 : 0.5, top ? 0.5 : 1), ...half }];
  }
  if (name.endsWith("_carpet")) return [full(0, 0.0625)];
  if (name.endsWith("_fence_gate")) return p["open"] === "true" ? [] : [full(0, 1.5, false)];
  if (name.endsWith("_fence")) return postAndArms(p, 0.125, 0.125, 1.5, true);
  if (name.endsWith("_wall")) return postAndArms(p, 0.25, 0.1875, 1.5, p["up"] !== "false");
  if (name.endsWith("_pane") || name === "minecraft:iron_bars") return postAndArms(p, 0.0625, 0.0625, 1, true);
  if (name === "minecraft:end_rod" || name === "minecraft:lightning_rod") return [centred(0.125, 0, 1, false)];
  if (name === "minecraft:lantern" || name === "minecraft:soul_lantern")
    return [p["hanging"] === "true" ? centred(0.1875, 0.0625, 0.625, false) : centred(0.1875, 0, 0.5625)];
  if (name === "minecraft:bell") return [centred(0.25, 0.25, 1, false)];
  if (name.endsWith("campfire")) return [full(0, 0.4375)];
  if (name === "minecraft:daylight_detector") return [full(0, 0.375)];
  if (name.endsWith("chest")) return [centred(0.4375, 0, 0.875)];
  if (name === "minecraft:farmland") return [full(0, 0.9375)];
  return [full(0, 1)];
}

/** A drawn box `[x0, y0, z0, x1, y1, z1]` in block units. */
export type Box = readonly [number, number, number, number, number, number];

const CUBE: Box = [0, 0, 0, 1, 1, 1];
const toBox = (s: Shape): Box => [s.x0, s.lo, s.z0, s.x1, Math.min(s.hi, 1), s.z1];

/** A wall panel `depth` sixteenths thick at the back of its block; the front faces `facing` (the mod's `PanelBlock`). */
function panel(facing: string | undefined, depth: number): Box {
  const d = depth / 16;
  const boxes: Record<string, Box> = { north: [0, 0, 1 - d, 1, 1, 1], south: [0, 0, 0, 1, 1, d], east: [0, 0, 0, d, 1, 1], west: [1 - d, 0, 0, 1, 1, 1] };
  return boxes[facing ?? "north"] ?? boxes["north"]!;
}

const SWING: Record<string, string> = { north: "east", east: "south", south: "west", west: "north" };

/** Plants and other thin things a player walks through: a small upright box so they still show. */
const SMALL_PLANT = /(short_grass|tall_grass|fern|_sapling|flower|dandelion|poppy|orchid|allium|bluet|tulip|daisy|cornflower|lily_of_the_valley|wheat|carrots|potatoes|beetroots|bush|dead_bush|sweet_berry)$/;

/** The boxes a block is drawn with. Empty for air and for things too small to matter. */
export function renderBoxes(state: string): Box[] {
  const { name, properties: p } = parseState(state);
  if (/:(air|cave_air|void_air|light|barrier|structure_void)$/.test(name)) return [];
  if (name === "agentcraft:monitor") return [panel(p["facing"], 5)];
  if (name === "agentcraft:task_board") return [panel(p["facing"], 3)];
  if (name === "agentcraft:decision_podium") return [[0.125, 0, 0.125, 0.875, 0.125, 0.875], [0.25, 0.125, 0.25, 0.75, 0.6875, 0.75], [0.03, 0.6875, 0.06, 0.97, 0.94, 1]];
  if (name === "agentcraft:console_terminal") return [[0, 0, 0, 1, 0.5625, 1], [0.0625, 0.5625, 0.53, 0.9375, 1, 0.84]];
  if (name === "minecraft:water" || name === "minecraft:lava") return [[0, 0, 0, 1, 0.875, 1]];
  if (name === "minecraft:snow") return [[0, 0, 0, 1, Number(p["layers"] ?? "1") / 8, 1]];
  if (name === "minecraft:lectern") return [[0, 0, 0, 1, 0.125, 1], [0.25, 0.125, 0.25, 0.75, 0.8, 0.75], [0, 0.8, 0, 1, 1, 1]];
  if (name.endsWith("_door")) {
    // A closed door is a thin slab on the side it faces from; an open one swings to its hinge side. Close enough.
    const facing = p["facing"] ?? "north";
    return [panel(p["open"] === "true" ? SWING[facing] : facing, 3)];
  }
  if (name === "minecraft:ladder" || name.endsWith("_wall_sign") || name.endsWith("_wall_banner")) return [panel(p["facing"], 1)];
  if (name === "minecraft:vine") return [];
  if (name.endsWith("torch") || name.endsWith("_wall_torch")) return [[0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625]];
  if (name.endsWith("chain")) {
    const axis = p["axis"] ?? "y";
    return [axis === "x" ? [0, 0.4375, 0.4375, 1, 0.5625, 0.5625] : axis === "z" ? [0.4375, 0.4375, 0, 0.5625, 0.5625, 1] : [0.4375, 0, 0.4375, 0.5625, 1, 0.5625]];
  }
  if (name.endsWith("candle")) return [[0.375, 0, 0.375, 0.625, 0.375, 0.625]];
  if (name.endsWith("_sign") || name.endsWith("_banner")) return [[0.4375, 0, 0.4375, 0.5625, 0.6, 0.5625], [0, 0.6, 0.4375, 1, 1, 0.5625]];
  if (name.endsWith("_button")) return [[0.3125, 0, 0.375, 0.6875, 0.125, 0.625]];
  if (name.endsWith("_pressure_plate")) return [[0.0625, 0, 0.0625, 0.9375, 0.0625, 0.9375]];
  if (SMALL_PLANT.test(name)) return [[0.3, 0, 0.3, 0.7, 0.6, 0.7]];
  if (name.endsWith("_pane") || name === "minecraft:iron_bars") return paneBoxes(p);
  // Fences, gates and walls are drawn a block tall; their 1.5 collision height only stops jumping over them.
  return shapes(state).map(toBox);
}

/**
 * A pane as at most two boxes, one running north-south and one east-west, instead of a post plus arms: overlapping
 * boxes with faces in the same plane flicker where the see-through faces fight over depth.
 */
function paneBoxes(p: Record<string, string>): Box[] {
  const [lo, hi] = [0.4375, 0.5625];
  const joined = (d: string) => p[d] === "true";
  const ns = joined("north") || joined("south");
  const ew = joined("east") || joined("west");
  const out: Box[] = [];
  if (ns || !ew) out.push([lo, 0, joined("north") ? 0 : lo, hi, 1, joined("south") ? 1 : hi]);
  if (ew) out.push([joined("west") ? 0 : lo, 0, lo, joined("east") ? 1 : hi, 1, hi]);
  return out;
}

/** True when a block is drawn as one whole cube. */
export function isCube(boxes: readonly Box[]): boolean {
  return boxes.length === 1 && boxes[0]!.every((v, i) => v === CUBE[i]);
}

/** Drawn see-through, in a separate pass. */
const TRANSPARENT = /(glass|glass_pane|:ice|:water|:iron_bars)$/;
/** Blocks that hide their faces toward a neighbour of the same kind (glass beside glass, water beside water). */
const SELF_CULLING = /(glass|:ice|:water|:lava)$/;
/** Lit from inside: drawn at full color, without shading. */
const EMISSIVE = /:(lantern|soul_lantern|glowstone|sea_lantern|shroomlight|jack_o_lantern|torch|wall_torch|soul_torch|campfire|soul_campfire|end_rod|lava|redstone_lamp|copper_bulb|waxed_copper_bulb|monitor|status_lamp|glow_panel|beacon|candle|[a-z_]+_candle|[a-z]+_froglight)$/;

/** Everything the browser needs to draw one block state, worked out once per palette entry. */
export type BlockLook = {
  boxes: Box[];
  /** A whole opaque cube: hides the faces of its neighbours and darkens their corners. */
  occludes: boolean;
  transparent: boolean;
  /** Non-zero for kinds that hide shared faces with themselves; equal numbers are the same kind. */
  cullGroup: number;
  emissive: boolean;
  /** sRGB, 0 to 255. */
  color: readonly [number, number, number];
};

const groups = new Map<string, number>();
function cullGroup(name: string): number {
  if (!SELF_CULLING.test(name)) return 0;
  // All glass joins up with all glass.
  const kind = name.endsWith("glass") ? "glass" : name;
  let g = groups.get(kind);
  if (g === undefined) groups.set(kind, (g = groups.size + 1));
  return g;
}

export function blockLook(state: string): BlockLook {
  const { name, properties } = parseState(state);
  const boxes = renderBoxes(state);
  const transparent = TRANSPARENT.test(name);
  const lit = EMISSIVE.test(name) && properties["lit"] !== "false";
  return {
    boxes,
    occludes: isCube(boxes) && !transparent && !SELF_CULLING.test(name),
    transparent,
    cullGroup: cullGroup(name),
    emissive: lit,
    color: colorOf(name),
  };
}

const DYES: Record<string, string> = {
  white: "#e9ecec", orange: "#f07613", magenta: "#bd44b3", light_blue: "#3aafd9", yellow: "#f8c527", lime: "#70b919",
  pink: "#ed8dac", gray: "#3e4447", light_gray: "#8e8e86", cyan: "#158991", purple: "#792aac", blue: "#35399d",
  brown: "#724728", green: "#546d1b", red: "#a12722", black: "#080a0f",
};

const COLORS: Record<string, string> = {
  oak_planks: "#b8945f", spruce_planks: "#7a5a34", birch_planks: "#d7c98c", dark_oak_planks: "#42301a",
  crimson_planks: "#7b2f47", warped_planks: "#2b6e6a", jungle_planks: "#a97d55", acacia_planks: "#a8582f",
  cherry_planks: "#e4b6bd", mangrove_planks: "#7a3a3d", bamboo_planks: "#c4b04a", pale_oak_planks: "#e3d9cf",
  oak_log: "#6d5530", spruce_log: "#3b2a17", birch_log: "#d5cdb5", dark_oak_log: "#2c2013",
  stone: "#7f7f7f", stone_bricks: "#7a7a7a", smooth_stone: "#9e9e9e", cobblestone: "#808080", deepslate: "#4f4f52",
  andesite: "#888888", granite: "#956a56", diorite: "#c8c8c8", bricks: "#96534a", sandstone: "#dccf96",
  snow_block: "#f4f8f8", snow: "#f4f8f8", powder_snow: "#f0f5f5", ice: "#8fb2f0", packed_ice: "#7da5e8",
  spruce_leaves: "#2f5a2a", oak_leaves: "#4a7a2e", grass_block: "#6a9a40", dirt: "#7a5535", gravel: "#857f7c", sand: "#dbcf9b",
  water: "#3a6fd8", lava: "#e8641a", bookshelf: "#7a5a34", lectern: "#a77f4c", crafting_table: "#8d6b3d",
  shroomlight: "#f0a040", glowstone: "#f5d98a", sea_lantern: "#cfe7e3", lantern: "#f6c244", soul_lantern: "#58c7d1", campfire: "#c9742a",
  stripped_spruce_log: "#9c7a44", stripped_oak_log: "#b8945f", stripped_dark_oak_log: "#4a3520", stripped_birch_log: "#d7c98c",
  smooth_quartz: "#ece8e0", quartz_block: "#ece8e0", quartz: "#ece8e0", white_concrete: "#e9ecec",
  spruce_fence: "#7a5a34", dark_oak_fence: "#42301a", oak_fence: "#b8945f", birch_fence: "#d7c98c",
  mossy_cobblestone: "#6e7f62", stone_brick: "#7a7a7a", cobbled_deepslate: "#4a4a4d", polished_andesite: "#8b8b8b",
  "agentcraft:monitor": "#3b8fd0", "agentcraft:status_lamp": "#8fe3ff", "agentcraft:task_board": "#ece4cf",
  "agentcraft:decision_podium": "#8a5a2b", "agentcraft:merge_station": "#6b4a2b", "agentcraft:console_terminal": "#3a3f48",
  "agentcraft:memory_archive": "#6a4a2a", "agentcraft:memory_catalog": "#7a5634", "agentcraft:glow_panel": "#f4f1e6",
  "agentcraft:walnut_panel": "#5b3a22", "agentcraft:walnut_trim": "#4a2e1a", "agentcraft:oak_parquet": "#b8945f",
  glass: "#bfe3ee", tinted_glass: "#3a3340", barrel: "#7a5a34", copper_block: "#c06a4e", cut_copper: "#c06a4e",
  iron_block: "#d8d8d8", gold_block: "#f6d03e", obsidian: "#15101f", netherrack: "#6b3030",
  calcite: "#dfe0dc", smooth_sandstone: "#e0d6a8", terracotta: "#985e43", white_terracotta: "#d1b2a1", yellow_terracotta: "#ba8523",
  pink_terracotta: "#a14e4e", resin_brick: "#c7612f", resin_bricks: "#c7612f", jungle_leaves: "#3f7a2a", azalea_leaves: "#5d7a2b",
  flowering_azalea_leaves: "#8a5f8f", dark_oak_leaves: "#2f5222", end_rod: "#f0ece4", warped_trapdoor: "#2b6e6a",
  deepslate_tiles: "#38383c", deepslate_tile: "#38383c", polished_blackstone: "#2e2a30", tuff: "#6c6d66",
  oxidized_cut_copper: "#4fa38b", waxed_copper_block: "#c06a4e", iron_bars: "#6d6d6d",
  jungle_log: "#5a4526", jungle_wood: "#5a4526", stripped_jungle_log: "#b98a5e", stripped_jungle_wood: "#b98a5e",
  vine: "#2f6e1e", cocoa: "#a8692e", bamboo: "#6f9a2a", bamboo_mosaic: "#c9b24c", short_grass: "#5f9a3a", tall_grass: "#5f9a3a",
  fern: "#4f8a32", large_fern: "#4f8a32", melon: "#6f9a2a", coarse_dirt: "#6b4c33", mud: "#3c3837", clay: "#a0a6b4",
  mangrove_log: "#55432b",
};

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** A steady made-up color for a block with no entry, so unknown blocks are still told apart. */
function hashColor(name: string): [number, number, number] {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // HSL with saturation 0.35 and lightness 0.5, as the viewer does.
  const hue = (h % 360) / 60;
  const c = 0.35;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const [r, g, b] = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  const m = 0.5 - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Whether a block name has a color of its own (directly, through its base block, or a dye), not a made-up one. */
export function hasColor(name: string): boolean {
  return colorEntry(name) !== undefined;
}

function colorEntry(name: string): string | undefined {
  const short = name.replace(/^minecraft:/, "");
  if (COLORS[short]) return COLORS[short];
  if (COLORS[name]) return COLORS[name];
  const base = short.replace(/_(stairs|slab|wall|fence|fence_gate|button|pressure_plate|trapdoor|door|pane|carpet|wall_sign|sign)$/, "");
  for (const k of [base, `${base}_planks`, `${base}s`, `${base}_block`]) if (COLORS[k]) return COLORS[k];
  for (const dye of Object.keys(DYES).sort((a, b) => b.length - a.length)) if (short.startsWith(`${dye}_`)) return DYES[dye];
  return undefined;
}

/** The sRGB color of a block, by name. */
export function colorOf(name: string): [number, number, number] {
  const hex = colorEntry(name);
  return hex ? rgb(hex) : hashColor(name);
}
