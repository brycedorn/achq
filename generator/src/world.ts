import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, deflateSync } from "node:zlib";
import { ANCHORS_FILE, serializeLayout, type Layout } from "./anchors.js";
import { type Design } from "./design.js";
import { byte, compound, encodeNbt, float, int, intArray, list, long, type Nbt, packIndices, str } from "./nbt.js";
import { renderDesign } from "./render.js";
import { parseState } from "./schematic.js";

/**
 * Minecraft 26.3, as read from a save it wrote (`docs/SPEC.md`, "World save format"). A save written for
 * another version needs these and the chunk layout below checked again.
 */
export const DATA_VERSION = 5023;
const GAME_VERSION = "26.3";
const STORAGE_VERSION = 19133;
const MIN_Y = -64;
const SECTIONS = 24; // y -64 to 319

/** The name AgentCraft gives its HQ world and opens on start (`HqWorld.LEVEL_NAME`, `AutoWorld`). */
export const HQ_LEVEL_NAME = "AgentCraft HQ";

/** AgentCraft's superflat meadow (`AutoWorld`): grass top at y=64, so the world outside the design matches. */
const FLAT_LAYERS: readonly [string, number][] = [
  ["minecraft:bedrock", 1],
  ["minecraft:stone", 124],
  ["minecraft:dirt", 3],
  ["minecraft:grass_block", 1],
];

/** Blocks that need a block entity to work; each gets one, with any fields the design set (such as `binding`). */
const ENTITY_BLOCKS = new Set([
  "minecraft:chiseled_bookshelf", "minecraft:decorated_pot",
  "minecraft:lectern", "minecraft:campfire", "minecraft:soul_campfire", "minecraft:chest", "minecraft:barrel", "minecraft:bell",
  "agentcraft:monitor", "agentcraft:task_board", "agentcraft:decision_podium", "agentcraft:merge_station",
  "agentcraft:status_lamp", "agentcraft:console_terminal", "agentcraft:memory_archive",
]);

/** Banners of every colour share one block entity type. */
const BANNER = /_banner$/;

export type WorldResult = { dir: string; chunks: number; regions: number; layout: Layout };

/**
 * Write a complete, ready-to-open world save for AgentCraft: the design placed at `origin` on AgentCraft's
 * superflat meadow, its atmosphere (biome, weather, time) baked in, the anchors file, and the marker that
 * tells AgentCraft the world is set up (without it, AgentCraft resets the time, weather and spawn on the
 * first start). Because the anchors file is present, AgentCraft does not auto-build its own studio HQ.
 *
 * The folder is named after `levelName` (AgentCraft opens the folder called "AgentCraft HQ"). Light and
 * heightmaps are left for the game to compute when the chunks first load.
 */
export function writeWorld(design: Design, origin: readonly [number, number, number], outDir: string, levelName = HQ_LEVEL_NAME): WorldResult {
  const [ox, oy, oz] = origin;
  const [w, h, l] = design.size;
  if (oy < MIN_Y || oy + h - 1 > MIN_Y + SECTIONS * 16 - 1) throw new Error(`the design spans y ${oy} to ${oy + h - 1}; the world allows ${MIN_Y} to ${MIN_Y + SECTIONS * 16 - 1}`);
  const { volume, layout } = renderDesign(design, { origin });
  const dir = join(outDir, levelName);
  const regionDir = join(dir, "dimensions", "minecraft", "overworld", "region");
  mkdirSync(regionDir, { recursive: true });
  mkdirSync(join(dir, "data", "minecraft"), { recursive: true });

  const biome = design.atmosphere?.biome ?? "minecraft:plains";
  const seaBiome = design.atmosphere?.seaBiome;
  const sea = design.surroundings?.sea;
  const layers = sea ? seaLayers(oy, sea.level, sea.floor) : FLAT_LAYERS;
  const outsideBiome = sea && seaBiome ? seaBiome : biome;
  const flatAt = (y: number): string => {
    let top = MIN_Y - 1;
    for (const [block, height] of layers) {
      top += height;
      if (y <= top) return block;
    }
    return "minecraft:air";
  };

  // Chunks: every chunk column the design touches, each written whole (the meadow under and round the design).
  const [cx0, cx1, cz0, cz1] = [Math.floor(ox / 16), Math.floor((ox + w - 1) / 16), Math.floor(oz / 16), Math.floor((oz + l - 1) / 16)];
  const regions = new Map<string, Map<number, Buffer>>();
  let chunkCount = 0;
  /** The biome of the column at (x, z): the sea biome where its surface is water, when the design has one. */
  const columnBiome = (x: number, z: number): string => {
    const [vx, vz] = [x - ox, z - oz];
    if (vx < 0 || vx >= w || vz < 0 || vz >= l) return outsideBiome;
    if (!seaBiome) return biome;
    for (let vy = h - 1; vy >= 0; vy--) {
      const id = volume.idAt(vx, vy, vz);
      if (id !== 0) return parseState(volume.stateOf(id)).name === "minecraft:water" ? seaBiome : biome;
    }
    return outsideBiome;
  };
  for (let cz = cz0; cz <= cz1; cz++)
    for (let cx = cx0; cx <= cx1; cx++) {
      // Biomes are kept per 4 x 4 x 4 cell; one per column of cells, sampled at the cell's middle.
      const cellBiomes: string[] = [];
      for (let bz = 0; bz < 4; bz++) for (let bx = 0; bx < 4; bx++) cellBiomes.push(columnBiome(cx * 16 + bx * 4 + 2, cz * 16 + bz * 4 + 2));
      const biomePalette = [...new Set(cellBiomes)];
      const biomes: Record<string, Nbt> = { palette: list("string", biomePalette.map((b) => str(b))) };
      if (biomePalette.length > 1) {
        const cells = Array.from({ length: 64 }, (_, i) => biomePalette.indexOf(cellBiomes[i % 16]!));
        biomes["data"] = { t: "longArray", v: packIndices(cells, Math.ceil(Math.log2(biomePalette.length))) };
      }
      const sections: Nbt[] = [];
      const entities: Nbt[] = [];
      for (let s = 0; s < SECTIONS; s++) {
        const sy = MIN_Y / 16 + s;
        const palette: string[] = [];
        const index = new Map<string, number>();
        const cells = new Uint16Array(4096);
        for (let ly = 0; ly < 16; ly++)
          for (let lz = 0; lz < 16; lz++)
            for (let lx = 0; lx < 16; lx++) {
              const [x, y, z] = [cx * 16 + lx, sy * 16 + ly, cz * 16 + lz];
              const [vx, vy, vz] = [x - ox, y - oy, z - oz];
              let state = flatAt(y);
              if (vx >= 0 && vx < w && vy >= 0 && vy < h && vz >= 0 && vz < l) {
                const id = volume.idAt(vx, vy, vz);
                if (id !== 0) {
                  state = volume.stateOf(id);
                  const name = parseState(state).name;
                  if (ENTITY_BLOCKS.has(name) || BANNER.test(name)) {
                    const fields = volume.dataAt(vx, vy, vz) ?? {};
                    const extra = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "id").map(([k, v]) => [k, str(v)]));
                    entities.push(compound({ components: compound({}), keepPacked: byte(0), x: int(x), y: int(y), z: int(z), id: str(fields["id"] ?? (BANNER.test(name) ? "minecraft:banner" : name)), ...extra }));
                  }
                }
              }
              let i = index.get(state);
              if (i === undefined) {
                i = palette.length;
                palette.push(state);
                index.set(state, i);
              }
              cells[(ly * 16 + lz) * 16 + lx] = i;
            }
        const blockStates: Record<string, Nbt> = { palette: list("compound", palette.map(paletteEntry)) };
        if (palette.length > 1) blockStates["data"] = { t: "longArray", v: packIndices(cells, Math.max(4, Math.ceil(Math.log2(palette.length)))) };
        sections.push(compound({ block_states: compound(blockStates), biomes: compound(biomes), Y: byte(sy) }));
      }
      const chunk = compound({
        Status: str("minecraft:full"),
        zPos: int(cz),
        block_entities: list("compound", entities),
        yPos: int(MIN_Y / 16),
        LastUpdate: long(0),
        structures: compound({ References: compound({}), starts: compound({}) }),
        InhabitedTime: long(0),
        xPos: int(cx),
        sections: list("compound", sections),
        isLightOn: byte(0), // the game lights the chunk when it first loads
        block_ticks: list("end", []),
        PostProcessing: list("list", Array.from({ length: SECTIONS }, () => list("end", []))),
        DataVersion: int(DATA_VERSION),
        fluid_ticks: list("end", []),
      });
      const key = `${Math.floor(cx / 32)}.${Math.floor(cz / 32)}`;
      if (!regions.has(key)) regions.set(key, new Map());
      regions.get(key)!.set((cz & 31) * 32 + (cx & 31), deflateSync(encodeNbt(chunk)));
      chunkCount++;
    }
  for (const [key, chunks] of regions) writeFileSync(join(regionDir, `r.${key}.mca`), regionFile(chunks));

  // World metadata: what the game writes for a new world, with the design's spawn and atmosphere.
  const spawn = layout.anchors["spawn"];
  const [sx, sy, sz] = spawn ? [Math.floor(spawn.x), Math.floor(spawn.y), Math.floor(spawn.z)] : [ox, oy + 1, oz];
  const gz = (n: Nbt) => gzipSync(encodeNbt(n));
  writeFileSync(join(dir, "level.dat"), gz(compound({ Data: compound({
    difficulty_settings: compound({ difficulty: str("peaceful"), hardcore: byte(0), locked: byte(0) }),
    Time: long(0),
    version_history: list("int", [int(DATA_VERSION)]),
    GameType: int(1),
    ServerBrands: list("string", [str("vanilla")]),
    version: int(STORAGE_VERSION),
    LastPlayed: long(0),
    spawn: compound({ pos: intArray([sx, sy, sz]), pitch: float(0), dimension: str("minecraft:overworld"), yaw: float(spawn?.yaw ?? 0) }),
    Version: compound({ Snapshot: byte(0), Series: str("main"), Id: int(DATA_VERSION), Name: str(GAME_VERSION) }),
    LevelName: str(levelName),
    initialized: byte(1),
    WasModded: byte(1),
    DataVersion: int(DATA_VERSION),
    allowCommands: byte(1),
    DataPacks: compound({ Enabled: list("string", [str("vanilla")]), Disabled: list("string", []) }),
  }) })));
  const weather = design.atmosphere?.weather ?? "clear";
  const hold = 1_000_000_000; // ticks; AgentCraft also stops the weather cycle (`advance_weather` off)
  writeFileSync(join(dir, "data", "minecraft", "weather.dat"), gz(compound({
    data: compound({ rain_time: int(hold), raining: byte(weather !== "clear"), thundering: byte(weather === "thunder"), thunder_time: int(hold), clear_weather_time: int(0) }),
    DataVersion: int(DATA_VERSION),
  })));
  writeFileSync(join(dir, "data", "minecraft", "world_clocks.dat"), gz(compound({
    data: compound({ "minecraft:overworld": compound({ total_ticks: long(design.atmosphere?.time ?? 12000) }), "minecraft:the_end": compound({ total_ticks: long(0) }) }),
    DataVersion: int(DATA_VERSION),
  })));
  writeFileSync(join(dir, "data", "minecraft", "world_gen_settings.dat"), gz(compound({
    data: compound({
      bonus_chest: byte(0),
      seed: long(design.seed),
      generate_structures: byte(0),
      dimensions: compound({
        "minecraft:overworld": compound({
          generator: compound({
            settings: compound({
              features: byte(0),
              biome: str(outsideBiome),
              layers: list("compound", layers.map(([block, height]) => compound({ block: str(block), height: int(height) }))),
              structure_overrides: list("string", []),
              lakes: byte(0),
            }),
            type: str("minecraft:flat"),
          }),
          type: str("minecraft:overworld"),
        }),
        "minecraft:the_nether": compound({
          generator: compound({ settings: str("minecraft:nether"), biome_source: compound({ preset: str("minecraft:nether"), type: str("minecraft:multi_noise") }), type: str("minecraft:noise") }),
          type: str("minecraft:the_nether"),
        }),
        "minecraft:the_end": compound({
          generator: compound({ settings: str("minecraft:end"), biome_source: compound({ type: str("minecraft:the_end") }), type: str("minecraft:noise") }),
          type: str("minecraft:the_end"),
        }),
      }),
    }),
    DataVersion: int(DATA_VERSION),
  })));

  writeFileSync(join(dir, ANCHORS_FILE), serializeLayout(layout));
  // AgentCraft treats a world without this marker as new and resets its time, weather and spawn.
  writeFileSync(join(dir, "agentcraft-world.json"), `${JSON.stringify({ createdBy: "achq", design: design.name, version: design.version })}\n`);
  return { dir, chunks: chunkCount, regions: regions.size, layout };
}

/**
 * Flat layers for open sea round a design placed at height `oy`: water from the design's bottom layer up to
 * its layer `level`, on two layers of `floor`, on stone.
 */
function seaLayers(oy: number, level: number, floor: string): [string, number][] {
  if (oy - 2 <= MIN_Y + 1) throw new Error(`a design with sea round it must sit above y ${MIN_Y + 3}; its origin is at y ${oy}`);
  return [
    ["minecraft:bedrock", 1],
    ["minecraft:stone", oy - 2 - (MIN_Y + 1)],
    [floor, 2],
    ["minecraft:water", level + 1],
  ];
}

/** A palette entry as 26.3 writes it: `{id, properties}`, properties only when the state has some. */
function paletteEntry(state: string): Nbt {
  const { name, properties } = parseState(state);
  const entry: Record<string, Nbt> = { id: str(name) };
  if (Object.keys(properties).length > 0) entry["properties"] = compound(Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, str(v)])));
  return compound(entry);
}

/**
 * An Anvil region file: 1024 4-byte locations (sector offset, sector count), 1024 timestamps, then each
 * chunk as length, compression type 2 (zlib) and data, padded to whole 4 KiB sectors.
 */
function regionFile(chunks: Map<number, Buffer>): Buffer {
  const header = Buffer.alloc(8192);
  const bodies: Buffer[] = [];
  let sector = 2;
  for (const [i, data] of [...chunks].sort((a, b) => a[0] - b[0])) {
    const record = Buffer.alloc(5 + data.length);
    record.writeUInt32BE(data.length + 1);
    record[4] = 2;
    data.copy(record, 5);
    const sectors = Math.ceil(record.length / 4096);
    if (sectors > 255) throw new Error(`chunk ${i} is ${record.length} bytes, more than a region file can hold`);
    header.writeUInt32BE((sector << 8) | sectors, i * 4);
    const padded = Buffer.alloc(sectors * 4096);
    record.copy(padded);
    bodies.push(padded);
    sector += sectors;
  }
  return Buffer.concat([header, ...bodies]);
}
