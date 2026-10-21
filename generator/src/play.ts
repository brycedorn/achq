import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Layout } from "./anchors.js";
import { type Design } from "./design.js";
import { installWorld, restoreWorld } from "./install.js";
import { writeOutputs } from "./output.js";
import { HQ_LEVEL_NAME, writeWorld } from "./world.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOD_DIR = join(REPO, "mod");
const SAVES_DIR = join(MOD_DIR, "run", "saves");
/** The world the mod opens on start (`AutoWorld`) and treats as the HQ. */
export const WORLD_DIR = join(SAVES_DIR, HQ_LEVEL_NAME);
const OUT_DIR = join(MOD_DIR, "run", "achq-test");
const WORLDS_OUT = join(REPO, "out", "worlds");
const LOG = join(MOD_DIR, "run", "achq-play.log");
/** The mod's DevBridge: on by default in `gradlew runClient`, localhost only (`ClientEnv.DEV_PORT`). */
const BRIDGE = "ws://127.0.0.1:7879";

type Reply = Record<string, unknown>;
type Say = (s: string) => void;

/** A connection to the mod's DevBridge (`mod/src/client/java/dev/agentcraft/client/dev/DevBridge.java`). */
class Bridge {
  private next = 1;
  private readonly pending = new Map<string, { resolve: (r: Reply) => void; reject: (e: Error) => void }>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as Reply;
      const waiting = this.pending.get(String(msg["id"]));
      if (!waiting) return; // dev.hello and other unsolicited messages
      this.pending.delete(String(msg["id"]));
      if (msg["ok"] === false) waiting.reject(new Error(`${String(msg["type"])}: ${String(msg["error"])}`));
      else waiting.resolve(msg);
    });
    ws.addEventListener("close", () => {
      for (const p of this.pending.values()) p.reject(new Error("the game closed the connection"));
      this.pending.clear();
    });
  }

  /** Connect, or undefined when nothing answers within `timeoutMs`. */
  static connect(timeoutMs: number): Promise<Bridge | undefined> {
    return new Promise((done) => {
      const ws = new WebSocket(BRIDGE);
      const timer = setTimeout(() => {
        ws.close();
        done(undefined);
      }, timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        done(new Bridge(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        done(undefined);
      });
    });
  }

  request(type: string, fields: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<Reply> {
    const id = String(this.next++);
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${type}: no reply in ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs + 10_000);
      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolvePromise(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ id, type, timeoutMs, ...fields }));
    });
  }

  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The last lines of the game log, to show when it fails to start. */
function logTail(lines = 12): string {
  try {
    return readFileSync(LOG, "utf8").trimEnd().split(/\r?\n/).slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}

/** Stop unless Minecraft is closed: world files must not change under a running game. */
async function requireClosed(why: string): Promise<void> {
  if (await Bridge.connect(1_500).then((b) => (b?.close(), b !== undefined))) {
    throw new Error(`Minecraft is already running. Close it (quit to title, then close the window) and run this again: ${why}`);
  }
}

/** Start Minecraft (`gradlew runClient`, upstream studio autobuild off), wait for the HQ world to load, and connect. */
async function launch(say: Say): Promise<Bridge> {
  say(`starting Minecraft (this can take a few minutes; log: ${LOG})...`);
  const log = openSync(LOG, "a");
  // By full path: with NoDefaultCurrentDirectoryInExePath set (as it can be), cmd does not run programs from the current folder.
  // Through sh elsewhere: a fresh clone's gradlew may not be marked executable.
  const [shell, args] =
    process.platform === "win32" ? ["cmd.exe", ["/c", join(MOD_DIR, "gradlew.bat"), "runClient"]] : ["sh", [join(MOD_DIR, "gradlew"), "runClient"]];
  const game = spawn(shell, args, {
    cwd: MOD_DIR,
    env: { ...process.env, AGENTCRAFT_HQ_AUTOBUILD: "0" },
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  let exitCode: number | undefined;
  game.on("exit", (code) => (exitCode = code ?? -1));
  game.unref(); // the game keeps running after this script ends

  const started = Date.now();
  const deadline = started + 20 * 60_000;
  let bridge: Bridge | undefined;
  let waited = 0;
  while (!bridge) {
    if (Date.now() > deadline) throw new Error(`the game did not start in 20 minutes; see ${LOG}`);
    if (exitCode !== undefined) throw new Error(`the game stopped while starting (exit code ${exitCode}). The end of ${LOG}:\n${logTail()}`);
    bridge = await Bridge.connect(2_000);
    if (!bridge) {
      if (++waited % 10 === 0) say(`  still starting (${Math.round((Date.now() - started) / 1000)} s)...`);
      await sleep(3_000);
    }
  }
  say("  the game is up; waiting for the world to load...");
  for (;;) {
    if (Date.now() > deadline) throw new Error("the world did not finish loading");
    const state = await bridge.request("dev.state", {}, 10_000).catch(() => undefined);
    if (state?.["ready"] === true) return bridge;
    await sleep(2_000);
  }
}

/** Look through `cam_vista` (or the first camera) and save a screenshot; a miss is reported, not fatal. */
async function screenshot(bridge: Bridge, layout: Layout, name: string, say: Say): Promise<void> {
  const camera = "cam_vista" in layout.anchors ? "cam_vista" : Object.keys(layout.anchors).find((n) => n.startsWith("cam_"));
  if (!camera) return;
  say(`screenshot from ${camera} (keep the mouse still for a moment)...`);
  try {
    await bridge.request("dev.camera", { anchor: camera }, 30_000);
    const shot = await bridge.request("dev.screenshot", { name: `${name}-${camera.slice(4)}`, waitChunks: true, chunkTimeoutMs: 180_000 }, 300_000);
    say(`  saved ${String(shot["path"])}`);
  } catch (e) {
    // A missed screenshot (often the mouse moving the camera) is not worth stopping for.
    say(`  no screenshot: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await bridge.request("dev.release", { mode: "creative" }, 20_000).catch(() => undefined);
  }
}

export type PlayOptions = {
  origin: readonly [number, number, number];
  /** Start the game (default) or only write and install the files. */
  launch: boolean;
  /** Take a screenshot through `cam_vista` (or the first camera) when everything is in place. */
  screenshot: boolean;
  say: Say;
};

/**
 * Try a design in your HQ world, in one go: write the structure and anchors, copy them into the world,
 * start Minecraft, place the build and apply its atmosphere through the mod's DevBridge, take a
 * screenshot, and leave the game running with the player at `spawn`.
 */
export async function play(design: Design, opts: PlayOptions): Promise<void> {
  const { say } = opts;
  await requireClosed("the anchors file is only read when the world loads.");
  if (!existsSync(WORLD_DIR)) {
    throw new Error(`no HQ world at ${WORLD_DIR}. Start the game once to create it (cd mod; gradlew.bat runClient), close it, and run this again.`);
  }

  say(`writing '${design.name}' v${design.version} at ${opts.origin.join(",")}...`);
  const out = writeOutputs(design, opts.origin, OUT_DIR);

  say("copying it into the HQ world...");
  const structures = join(WORLD_DIR, "generated", "minecraft", "structure");
  mkdirSync(structures, { recursive: true });
  copyFileSync(out.nbt, join(structures, `${design.name}.nbt`));
  copyFileSync(out.anchors, join(WORLD_DIR, "agentcraft-anchors.json"));
  if (!opts.launch) {
    say(`done. In game, run the commands in ${out.commands}`);
    return;
  }

  const bridge = await launch(say);
  say("placing the build and applying the atmosphere...");
  for (const cmd of out.setup) {
    const slow = /^\/(place|fillbiome)\b/.test(cmd);
    const started = Date.now();
    const reply = await bridge.request("dev.command", { cmd }, slow ? 30 * 60_000 : 60_000);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const messages = (reply["messages"] as string[] | undefined) ?? [];
    // A command with nothing to do (the biome is already set, the clock already reads that time) reports failure; it is not one.
    const unchanged = reply["success"] === false && messages.some((m) => /no .* (were )?changed|already/i.test(m));
    const status = unchanged ? "same  " : reply["success"] === false ? "FAILED" : "ok    ";
    say(`  ${status} ${cmd}  (${secs} s)${messages.length ? `  ${messages.join(" | ")}` : ""}`);
  }
  if (opts.screenshot) await screenshot(bridge, out.layout, `${design.name}-v${design.version}`, say);
  const spawnAt = out.layout.anchors["spawn"];
  if (spawnAt) await bridge.request("dev.command", { cmd: `/tp @s ${spawnAt.x} ${spawnAt.y} ${spawnAt.z}` }, 30_000);
  bridge.close();
  say("done: the game is running with you at the chalet's spawn.");
}

/**
 * Try a generated world save, the way an AgentCraft user would: write it, set your HQ world aside as
 * `AgentCraft HQ (backup <time>)` (renamed, never deleted), put the generated one in its place, start
 * the game and take a screenshot. `restoreWorld` puts your world back.
 */
export async function playSave(design: Design, opts: PlayOptions): Promise<void> {
  const { say } = opts;
  await requireClosed("the world folder is about to be swapped.");

  say(`writing the world save for '${design.name}' v${design.version}...`);
  const result = writeWorld(design, opts.origin, join(WORLDS_OUT, `${design.name}-v${design.version}`));
  say(`  ${result.chunks} chunks in ${result.dir}`);

  mkdirSync(SAVES_DIR, { recursive: true });
  if (installWorld(result.dir, SAVES_DIR, say)) say("  (run 'play --restore' to put it back)");
  if (!opts.launch) return;

  const bridge = await launch(say);
  const anchors = await bridge.request("dev.command", { cmd: "/agentcraft anchors" }, 30_000);
  say(`  AgentCraft: ${((anchors["messages"] as string[] | undefined) ?? []).slice(0, 1).join("")}`);
  if (opts.screenshot) await screenshot(bridge, result.layout, `${design.name}-v${design.version}-save`, say);
  bridge.close();
  say("done: the game is running in the generated world. Close it, then run 'play --restore' to get your world back.");
}

/** Put your own HQ world back after `playSave` (see `install.ts`): the game must be closed. */
export async function restoreHq(say: Say): Promise<void> {
  await requireClosed("the world folder is about to be swapped.");
  restoreWorld(SAVES_DIR, say);
}
