import { readFileSync } from "node:fs";
import { parseLayout, validateLayout } from "./anchors.js";
import { checkDesign } from "./check.js";
import { loadDesign } from "./designs.js";
import { writeOutputs } from "./output.js";
import { play } from "./play.js";
import { startPreview } from "./preview.js";

const USAGE = `usage:
  cli validate <agentcraft-anchors.json>
  cli check --design <name> [--version <n>]
  cli preview --design <name> [--version <n>] [--port <n>]
  cli generate --design <name> [--version <n>] --origin <x,y,z> --out <dir>
  cli play [--design <name>] [--version <n>] [--origin <x,y,z>] [--no-launch] [--no-shot]
       (defaults: snowy-chalet, latest version, origin 40,64,40)`;

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

function designFromFlags(args: string[], fallback?: string): ReturnType<typeof loadDesign> {
  const name = flag(args, "design") ?? fallback;
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
  const files = writeOutputs(design, parseOrigin(flag(rest, "origin")), out);
  const written = [files.schem, files.nbt, files.anchors, files.commands].filter((f) => f !== undefined).map((f) => f.split(/[\\/]/).pop());
  console.log(`wrote ${written.join(", ")} to ${out}${files.schem ? "" : " (no .schem: volume too large)"}`);
  report(files.layout);
  const lines = files.setup.map((c) => `  ${c}`).join("\n");
  console.log(`\nIn game, with the files copied into the world (also saved as ${design.name}.commands.txt):\n${lines}`);
} else if (command === "play") {
  const design = designFromFlags(rest, "snowy-chalet");
  requireClean(design);
  try {
    await play(design, {
      origin: parseOrigin(flag(rest, "origin") ?? "40,64,40"),
      launch: !rest.includes("--no-launch"),
      screenshot: !rest.includes("--no-shot"),
      say: (s) => console.log(s),
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
} else {
  console.error(USAGE);
  process.exit(2);
}
