import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANCHORS_FILE, parseLayout, serializeLayout, validateLayout } from "./anchors.js";
import { checkDesign } from "./check.js";
import { loadDesign } from "./designs.js";
import { startPreview } from "./preview.js";
import { renderDesign } from "./render.js";

const USAGE = `usage:
  cli validate <agentcraft-anchors.json>
  cli check --design <name> [--version <n>]
  cli preview --design <name> [--version <n>] [--port <n>]
  cli generate --design <name> [--version <n>] --origin <x,y,z> --out <dir>`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

function parseOrigin(raw: string | undefined): [number, number, number] {
  const parts = raw?.split(",").map(Number) ?? [];
  const [x, y, z] = parts;
  if (parts.length !== 3 || x === undefined || y === undefined || z === undefined || parts.some((n) => !Number.isInteger(n))) {
    throw new Error("--origin must be three integers: x,y,z");
  }
  return [x, y, z];
}

function report(layout: ReturnType<typeof parseLayout>): never | void {
  const problems = validateLayout(layout);
  if (problems.length === 0) {
    console.log(`ok: '${layout.layout}' rev ${layout.revision}, ${Object.keys(layout.anchors).length} anchors`);
    return;
  }
  for (const p of problems) console.error(`${p.anchor}: ${p.message}`);
  process.exit(1);
}

/** Print design problems and exit 1 when there are any. */
function requireClean(design: ReturnType<typeof loadDesign>): void {
  const problems = checkDesign(design);
  if (problems.length === 0) return;
  for (const p of problems) console.error(`${p.where}: ${p.message}`);
  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"} in '${design.name}' v${design.version}; nothing written`);
  process.exit(1);
}

function designFromFlags(args: string[]): ReturnType<typeof loadDesign> {
  const name = flag(args, "design");
  if (!name) throw new Error(USAGE);
  const version = flag(args, "version");
  return loadDesign(name, version === undefined ? undefined : Number(version));
}

const [command, ...rest] = process.argv.slice(2);

if (command === "validate" && rest[0]) {
  report(parseLayout(JSON.parse(readFileSync(rest[0], "utf8"))));
} else if (command === "preview") {
  const name = flag(rest, "design");
  if (!name) throw new Error(USAGE);
  const version = flag(rest, "version");
  const port = Number(flag(rest, "port") ?? 5173);
  loadDesign(name, version === undefined ? undefined : Number(version)); // fail fast on a bad name
  await startPreview(name, version === undefined ? undefined : Number(version), port);
  console.log(`preview of '${name}' at http://localhost:${port}/  (reload to pick up edits; Ctrl+C to stop)`);
} else if (command === "check") {
  const design = designFromFlags(rest);
  requireClean(design);
  console.log(`ok: '${design.name}' v${design.version} passes all checks`);
} else if (command === "generate") {
  const out = flag(rest, "out");
  if (!out) throw new Error(USAGE);
  const design = designFromFlags(rest);
  requireClean(design);
  const { volume, layout } = renderDesign(design, { origin: parseOrigin(flag(rest, "origin")) });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "office.schem"), volume.toSchem());
  writeFileSync(join(out, "office.nbt"), volume.toStructure());
  writeFileSync(join(out, ANCHORS_FILE), serializeLayout(layout));
  console.log(`wrote office.schem, office.nbt and ${ANCHORS_FILE} to ${out}`);
  report(layout);
} else {
  console.error(USAGE);
  process.exit(2);
}
