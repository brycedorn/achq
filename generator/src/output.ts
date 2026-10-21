import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANCHORS_FILE, type Layout, serializeLayout } from "./anchors.js";
import { type Design } from "./design.js";
import { renderDesign } from "./render.js";
import { hqBox, setupCommands } from "./setup.js";

/** Volumes above this many cells get no `.schem`: it holds every cell and is built from a JavaScript array. */
const SCHEM_LIMIT = 4_000_000;

export type Outputs = {
  /** Paths written, by kind. */
  nbt: string;
  anchors: string;
  commands: string;
  schem?: string;
  layout: Layout;
  /** The chat commands to bring the design to life in game, in order. */
  setup: string[];
};

/**
 * Render a design at a world origin and write what the game needs into `out`: `<name>.nbt`, the
 * anchors file, `<name>.commands.txt`, and `<name>.schem` when the volume is small enough. Large
 * structures leave air out except inside the HQ, so re-placing a newer version rewrites the building.
 */
export function writeOutputs(design: Design, origin: readonly [number, number, number], out: string): Outputs {
  const { volume, layout } = renderDesign(design, { origin });
  mkdirSync(out, { recursive: true });
  const files: Outputs = {
    nbt: join(out, `${design.name}.nbt`),
    anchors: join(out, ANCHORS_FILE),
    commands: join(out, `${design.name}.commands.txt`),
    layout,
    setup: setupCommands(design, origin),
  };
  if (volume.width * volume.height * volume.length <= SCHEM_LIMIT) {
    files.schem = join(out, `${design.name}.schem`);
    writeFileSync(files.schem, volume.toSchem());
  }
  writeFileSync(files.nbt, volume.toStructure(undefined, undefined, hqBox(layout, origin, design.size)));
  writeFileSync(files.anchors, serializeLayout(layout));
  writeFileSync(files.commands, files.setup.join("\n") + "\n");
  return files;
}
