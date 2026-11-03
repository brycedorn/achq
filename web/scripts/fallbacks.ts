// Lists the block states each design uses that the browser draws with a guess: a made-up color, or a full cube
// for a block whose name suggests it is not one. Run with `npm run fallbacks`.
import { hasColor, isCube, renderBoxes } from "../../generator/src/blocks.js";
import { listDesigns, loadDesign } from "../../generator/src/designs.js";
import { renderDesign } from "../../generator/src/render.js";
import { parseState } from "../../generator/src/state.js";

/** Names that are usually not whole cubes in Minecraft. */
const NOT_A_CUBE = /(bed|chest|pot|anvil|candle|head|skull|rod|pickle|bell|cauldron|hopper|grindstone|stonecutter|composter|scaffolding|pointed|cluster|_bud|coral|kelp|seagrass|lily_pad|mushroom$|rail|lever|repeater|comparator|frame|cake|banner|bookshelf_slab|brewing|enchanting|end_portal|table$|campfire|lectern|loom|smoker|ladder|button|daylight|carpet|flower|leaves_slab|sea_lantern_slab|trapdoor|pane)/;

for (const name of listDesigns()) {
  const { volume } = renderDesign(loadDesign(name), { origin: [0, 0, 0] });
  const ids = new Map<number, number>();
  for (const id of volume.ids) if (id !== 0) ids.set(id, (ids.get(id) ?? 0) + 1);
  // One line per block name: its variants (facing, slots) share a color and nearly always a shape.
  const blocks = new Map<string, { count: number; state: string }>();
  for (const [id, n] of ids) {
    const state = volume.stateOf(id);
    const block = parseState(state).name;
    const b = blocks.get(block);
    blocks.set(block, { count: (b?.count ?? 0) + n, state: b?.state ?? state });
  }
  const lines: string[] = [];
  for (const [block, { count, state }] of [...blocks].sort((a, b) => b[1].count - a[1].count)) {
    const why = [!hasColor(block) && "made-up color", isCube(renderBoxes(state)) && NOT_A_CUBE.test(block) && !block.endsWith("_leaves") && "full cube"].filter(Boolean);
    if (why.length > 0) lines.push(`  ${String(count).padStart(7)}  ${block}  (${why.join(", ")})`);
  }
  console.log(`${name}: ${lines.length === 0 ? "no fallbacks" : `${lines.length} blocks`}`);
  for (const l of lines) console.log(l);
}
