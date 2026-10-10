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
};

export function buildScene(design: Design): Scene {
  const { volume, layout } = renderDesign(design, { origin: [0, 0, 0] });

  const palette: string[] = [];
  const index = new Map<string, number>();
  const cells: number[] = [];
  for (const [x, y, z, state] of volume.blocks()) {
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
  const walkable: number[] = [];
  for (let y = 0; y < volume.height; y++)
    for (let z = 0; z < volume.length; z++)
      for (let x = 0; x < volume.width; x++) {
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
  };
}
