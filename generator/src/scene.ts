import { checkDesign, type DesignProblem } from "./check.js";
import { type Anchor } from "./anchors.js";
import { type Design } from "./design.js";
import { renderDesign } from "./render.js";
import { Walk } from "./walk.js";

/** Everything the browser viewer needs, in local block coordinates. JSON-serialisable. */
export type Scene = {
  name: string;
  version: number;
  size: [number, number, number];
  /** Distinct block states, indexed by the fourth number of each `cells` entry. */
  palette: string[];
  /** Flat `x, y, z, paletteIndex` quadruples for every non-air block. */
  cells: number[];
  anchors: Record<string, Anchor>;
  /** Flat `x, y, z, feetHeight, reachable` quintuples for every cell an agent can stand in. */
  walkable: number[];
  problems: DesignProblem[];
  /** The highest layer that still shows the interior with the roof removed, or null when there is no roof. */
  roofCut: number | null;
  /** Whether the design has ground, in which case the viewer starts with everything shown. */
  hasTerrain: boolean;
};

function roofCut(design: Design): number | null {
  const eaves = design.parts.flatMap((p) => (p.type === "gableRoof" ? [p.eaveY] : []));
  if (eaves.length > 0) return Math.min(...eaves);
  return design.shell.kind === "box" ? design.size[1] - 3 : null;
}

/** Blocks that do not hide the faces of their neighbours. Everything else is treated as a full opaque cube. */
const NOT_OPAQUE = /(_slab|_stairs|_fence|_fence_gate|_wall|_pane|_door|_trapdoor|_carpet|_leaves|_glass|glass$|lantern|campfire|water|lava|lectern|torch|chain|:snow$|:ice$|:light$)/;

export function buildScene(design: Design): Scene {
  const { volume, layout } = renderDesign(design, { origin: [0, 0, 0] });

  // Blocks buried inside solid ground, with an opaque block on all six sides, can never be seen and are
  // left out, which keeps a large landscape to its surface.
  const opaque = Array.from({ length: volume.paletteSize }, (_, id) => id !== 0 && !NOT_OPAQUE.test(volume.stateOf(id)));
  const hidden = (x: number, y: number, z: number) =>
    opaque[volume.idAt(x - 1, y, z)]! && opaque[volume.idAt(x + 1, y, z)]! && opaque[volume.idAt(x, y - 1, z)]! &&
    opaque[volume.idAt(x, y + 1, z)]! && opaque[volume.idAt(x, y, z - 1)]! && opaque[volume.idAt(x, y, z + 1)]!;

  const palette: string[] = [];
  const index = new Map<string, number>();
  const cells: number[] = [];
  for (const [x, y, z, state] of volume.blocks()) {
    if (hidden(x, y, z)) continue;
    let id = index.get(state);
    if (id === undefined) {
      id = palette.length;
      palette.push(state);
      index.set(state, id);
    }
    cells.push(x, y, z, id);
  }

  const walk = new Walk(volume);
  const spawn = layout.anchors["spawn"];
  const start = spawn && walk.cellAt(spawn.x, spawn.y, spawn.z);
  const reach = start ? walk.reachable(start) : new Set<string>();
  // The walkable overlay only matters around where agents stand, so a big landscape is not scanned.
  const spots = Object.entries(layout.anchors).filter(([name]) => !name.startsWith("cam_"));
  const margin = 8;
  const xs = spots.map(([, a]) => a.x);
  const zs = spots.map(([, a]) => a.z);
  const [x0, x1] = [Math.max(Math.floor(Math.min(...xs)) - margin, 0), Math.min(Math.ceil(Math.max(...xs)) + margin, volume.width - 1)];
  const [z0, z1] = [Math.max(Math.floor(Math.min(...zs)) - margin, 0), Math.min(Math.ceil(Math.max(...zs)) + margin, volume.length - 1)];
  const walkable: number[] = [];
  for (let y = 0; y < volume.height; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const feet = walk.floor(x, y, z);
        if (feet !== undefined) walkable.push(x, y, z, feet, reach.has(`${x},${y},${z}`) ? 1 : 0);
      }

  return {
    name: design.name,
    version: design.version,
    size: [...design.size],
    palette,
    cells,
    anchors: layout.anchors,
    walkable,
    problems: checkDesign(design),
    roofCut: roofCut(design),
    hasTerrain: design.parts.some((p) => p.type === "terrain"),
  };
}
