import { type Layout } from "./anchors.js";
import { type Design } from "./design.js";
import { type Box } from "./schematic.js";

/** A force-load covers at most 256 chunks per command, so large areas are split into 16 x 16 chunk tiles. */
const TILE_CHUNKS = 16;

type Origin = readonly [number, number, number];

/**
 * The commands to type in game to bring a generated design to life, in order: load the area, place
 * the structure, apply the design's atmosphere (cold biome, weather, time) and let the area unload.
 * Each line is a chat command. `size` and `origin` give the box the design fills in the world.
 */
export function setupCommands(design: Design, origin: Origin, template = `minecraft:${design.name}`): string[] {
  const [ox, oy, oz] = origin;
  const [w, h, l] = design.size;
  const [x1, y1, z1] = [ox + w - 1, oy + h - 1, oz + l - 1];
  const cells = w * h * l;
  const out: string[] = [];

  // Force-load the area, one tile of chunks at a time.
  const [cx0, cx1, cz0, cz1] = [Math.floor(ox / 16), Math.floor(x1 / 16), Math.floor(oz / 16), Math.floor(z1 / 16)];
  for (let cz = cz0; cz <= cz1; cz += TILE_CHUNKS)
    for (let cx = cx0; cx <= cx1; cx += TILE_CHUNKS) {
      const [ax, az] = [Math.max(cx * 16, ox), Math.max(cz * 16, oz)];
      const [bx, bz] = [Math.min((cx + TILE_CHUNKS) * 16 - 1, x1), Math.min((cz + TILE_CHUNKS) * 16 - 1, z1)];
      out.push(`/forceload add ${ax} ${az} ${bx} ${bz}`);
    }

  out.push(`/place template ${template} ${ox} ${oy} ${oz}`);

  const { atmosphere } = design;
  if (atmosphere?.biome) {
    // The HQ world caps block changes per command (1,000,000); a biome fill counts the whole box.
    out.push(`/gamerule max_block_modifications ${Math.max(cells, 1_000_000)}`);
    out.push(`/fillbiome ${ox} ${oy} ${oz} ${x1} ${y1} ${z1} ${atmosphere.biome}`);
  }
  if (atmosphere?.time !== undefined) out.push(`/time set ${atmosphere.time}`);
  if (atmosphere?.weather) out.push(`/weather ${atmosphere.weather}`);

  out.push("/forceload remove all");
  return out;
}

/** How far round the agents' anchors the HQ reaches: walls, deck and eaves sideways, foundation below, roof above. */
const HQ_MARGIN = { side: 12, below: 4, above: 16 };

/**
 * The HQ's own box in local coordinates: everything near where agents stand (all anchors except
 * cameras), with room for the walls, deck, foundation and roof. Large structures keep their air here
 * so re-placing a new version rewrites the building exactly, while the landscape round it stays sparse.
 */
export function hqBox(layout: Layout, origin: Origin, size: readonly [number, number, number]): Box | undefined {
  const spots = Object.entries(layout.anchors).filter(([n]) => !n.startsWith("cam_")).map(([, a]) => a);
  if (spots.length === 0) return undefined;
  const [ox, oy, oz] = origin;
  const clamp = (v: number, max: number) => Math.min(Math.max(Math.floor(v), 0), max - 1);
  const xs = spots.map((a) => a.x - ox);
  const ys = spots.map((a) => a.y - oy);
  const zs = spots.map((a) => a.z - oz);
  return [
    clamp(Math.min(...xs) - HQ_MARGIN.side, size[0]),
    clamp(Math.min(...ys) - HQ_MARGIN.below, size[1]),
    clamp(Math.min(...zs) - HQ_MARGIN.side, size[2]),
    clamp(Math.max(...xs) + HQ_MARGIN.side, size[0]),
    clamp(Math.max(...ys) + HQ_MARGIN.above, size[1]),
    clamp(Math.max(...zs) + HQ_MARGIN.side, size[2]),
  ];
}
