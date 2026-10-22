import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseLayout, validateLayout } from "./anchors.js";
import { checkDesign } from "./check.js";
import { loadDesign } from "./designs.js";
import { writeOutputs } from "./output.js";
import { play, playSave, restoreHq } from "./play.js";
import { startPreview } from "./preview.js";
import { installWorld, launcherSaves, restoreWorld } from "./install.js";
import { writeWorld } from "./world.js";

const USAGE = `usage:
  cli validate <agentcraft-anchors.json>
  cli check --design <name> [--version <n>]
  cli preview --design <name> [--version <n>] [--port <n>]
  cli generate --design <name> [--version <n>] --origin <x,y,z> --out <dir>
  cli import --saves <folder> [--design <name>] [--version <n>] [--save <world folder>]
       (write the world save and install it as AgentCraft's HQ world; the old one is kept as a backup)
  cli restore --saves <folder>
       (put the backed-up HQ world back)
  cli world [--design <name>] [--version <n>] [--origin <x,y,z>] [--out <dir>]
       (a ready-to-open AgentCraft HQ world save; defaults: snowy-chalet, latest, the design's origin or 0,64,0, ../out/worlds)
  cli play [--design <name>] [--version <n>] [--origin <x,y,z>] [--no-launch] [--no-shot]
       (place it in your HQ world; defaults: snowy-chalet, latest version, origin 40,64,40)
  cli play --save [--design <name>] [--version <n>] [--no-launch] [--no-shot] [--restart] [--cams a,b]
       (open a generated world save instead, setting your HQ world aside)
  cli play --restore
       (put your HQ world back after --save)`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

/** A path flag, read against the folder the command was typed in (npm runs scripts from generator/). */
function pathFlag(args: string[], name: string): string | undefined {
  const raw = flag(args, name);
  return raw === undefined ? undefined : resolve(process.env["INIT_CWD"] ?? process.cwd(), raw);
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
  const warnings: ReturnType<typeof checkDesign> = [];
  const problems = checkDesign(design, warnings);
  for (const w of warnings) console.warn(`warning: ${w.where}: ${w.message}`);
  if (problems.length === 0) return;
  for (const p of problems) console.error(`${p.where}: ${p.message}`);
  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"} in '${design.name}' v${design.version}; nothing written`);
  process.exit(1);
}

/** Where a world save puts the design: its own `origin`, else 0, 64, 0. */
function saveOrigin(design: ReturnType<typeof loadDesign>): string {
  return (design.origin ?? [0, 64, 0]).join(",");
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
} else if (command === "world") {
  const design = designFromFlags(rest, "snowy-chalet");
  requireClean(design);
  const out = pathFlag(rest, "out") ?? `../out/worlds/${design.name}-v${design.version}`;
  const started = Date.now();
  const result = writeWorld(design, parseOrigin(flag(rest, "origin") ?? saveOrigin(design)), out);
  console.log(`wrote the world save ${result.dir} (${result.chunks} chunks in ${result.regions} region files, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  report(result.layout);
  console.log("To use it: put the 'AgentCraft HQ' folder in place of the one in AgentCraft's saves folder (back yours up first).");
} else if (command === "import" || command === "restore") {
  // Put a world save in place as AgentCraft's HQ world (or undo that), on any platform.
  const fromEnv = process.env["ACHQ_SAVES"];
  const saves = pathFlag(rest, "saves") ?? (fromEnv ? resolve(fromEnv) : undefined);
  if (!saves) {
    console.error(
      [
        "say which 'saves' folder to use: --saves <folder> (or set ACHQ_SAVES). Usually one of:",
        `  ${launcherSaves()}   (the Minecraft launcher)`,
        "  <agentcraft checkout>/mod/run/saves   (AgentCraft run from source with gradlew runClient)",
        "Close Minecraft first.",
      ].join("\n"),
    );
    process.exit(2);
  }
  const say = (s: string) => console.log(s);
  try {
    if (command === "restore") {
      restoreWorld(saves, say);
    } else {
      let save = pathFlag(rest, "save");
      if (!save) {
        const design = designFromFlags(rest, "snowy-chalet");
        requireClean(design);
        save = writeWorld(design, parseOrigin(flag(rest, "origin") ?? saveOrigin(design)), `../out/worlds/${design.name}-v${design.version}`).dir;
      }
      const backup = installWorld(save, saves, say);
      say(`Done. Start AgentCraft: it opens the 'AgentCraft HQ' world.${backup ? " To undo: npm run restore -- --saves <the same folder>." : ""}`);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
} else if (command === "play") {
  const say = (s: string) => console.log(s);
  try {
    if (rest.includes("--restore")) {
      await restoreHq(say);
    } else {
      const design = designFromFlags(rest, "snowy-chalet");
      requireClean(design);
      const save = rest.includes("--save");
      await (save ? playSave : play)(design, {
        origin: parseOrigin(flag(rest, "origin") ?? (save ? saveOrigin(design) : "40,64,40")),
        launch: !rest.includes("--no-launch"),
        screenshot: !rest.includes("--no-shot"),
        restart: rest.includes("--restart"),
        cameras: flag(rest, "cams")?.split(","),
        say,
      });
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
} else {
  console.error(USAGE);
  process.exit(2);
}
