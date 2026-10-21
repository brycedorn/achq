import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Design } from "./design.js";
import { writeOutputs } from "./output.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOD_DIR = join(REPO, "mod");
/** The world the mod opens on start (`AutoWorld`) and treats as the HQ. */
export const WORLD_DIR = join(MOD_DIR, "run", "saves", "AgentCraft HQ");
const OUT_DIR = join(MOD_DIR, "run", "achq-test");
const LOG = join(MOD_DIR, "run", "achq-play.log");
/** The mod's DevBridge: on by default in `gradlew runClient`, localhost only (`ClientEnv.DEV_PORT`). */
const BRIDGE = "ws://127.0.0.1:7879";

type Reply = Record<string, unknown>;

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

/** Wait for the game to start and finish loading the HQ world, then return a connection to it. */
async function waitForGame(timeoutMs: number, say: (s: string) => void, exited: () => number | undefined): Promise<Bridge> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  let bridge: Bridge | undefined;
  let waited = 0;
  while (!bridge) {
    if (Date.now() > deadline) throw new Error(`the game did not start in ${Math.round(timeoutMs / 60_000)} minutes; see ${LOG}`);
    const code = exited();
    if (code !== undefined) throw new Error(`the game stopped while starting (exit code ${code}). The end of ${LOG}:\n${logTail()}`);
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

export type PlayOptions = {
  origin: readonly [number, number, number];
  /** Start the game (default) or only write and install the files. */
  launch: boolean;
  /** Take a screenshot through `cam_vista` (or the first camera) when everything is placed. */
  screenshot: boolean;
  say: (s: string) => void;
};

/**
 * Everything it takes to try a design in game, in one go: write the files, copy them into the HQ
 * world, start Minecraft (`gradlew runClient`, upstream studio autobuild off), wait for the world,
 * run the setup commands through the mod's DevBridge, take a screenshot, and leave the game running
 * with the player at `spawn`. The game must be closed when this starts, because the anchors file is
 * only read when the world loads.
 */
export async function play(design: Design, opts: PlayOptions): Promise<void> {
  const { say } = opts;

  if (await Bridge.connect(1_500).then((b) => (b?.close(), b !== undefined))) {
    throw new Error("Minecraft is already running. Close it (quit to title, then close the window) and run this again: the anchors file is only read when the world loads.");
  }
  if (!existsSync(WORLD_DIR)) {
    throw new Error(`no HQ world at ${WORLD_DIR}. Start the game once to create it (cd mod; gradlew.bat runClient), close it, and run this again.`);
  }

  say(`1/5 writing '${design.name}' v${design.version} at ${opts.origin.join(",")}...`);
  const out = writeOutputs(design, opts.origin, OUT_DIR);

  say("2/5 copying it into the HQ world...");
  const structures = join(WORLD_DIR, "generated", "minecraft", "structure");
  mkdirSync(structures, { recursive: true });
  copyFileSync(out.nbt, join(structures, `${design.name}.nbt`));
  copyFileSync(out.anchors, join(WORLD_DIR, "agentcraft-anchors.json"));
  if (!opts.launch) {
    say(`done. In game, run the commands in ${out.commands}`);
    return;
  }

  say(`3/5 starting Minecraft (this can take a few minutes; log: ${LOG})...`);
  const log = openSync(LOG, "a");
  // By full path: with NoDefaultCurrentDirectoryInExePath set (as it can be), cmd does not run programs from the current folder.
  const game = spawn("cmd.exe", ["/c", join(MOD_DIR, "gradlew.bat"), "runClient"], {
    cwd: MOD_DIR,
    env: { ...process.env, AGENTCRAFT_HQ_AUTOBUILD: "0" },
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  let exitCode: number | undefined;
  game.on("exit", (code) => (exitCode = code ?? -1));
  game.unref(); // the game keeps running after this script ends
  const bridge = await waitForGame(20 * 60_000, say, () => exitCode);

  say("4/5 placing the build and applying the atmosphere...");
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

  if (opts.screenshot) {
    const camera = "cam_vista" in out.layout.anchors ? "cam_vista" : Object.keys(out.layout.anchors).find((n) => n.startsWith("cam_"));
    if (camera) {
      say(`5/5 screenshot from ${camera} (keep the mouse still for a moment)...`);
      try {
        await bridge.request("dev.camera", { anchor: camera }, 30_000);
        const shot = await bridge.request("dev.screenshot", { name: `${design.name}-v${design.version}-${camera.slice(4)}`, waitChunks: true, chunkTimeoutMs: 180_000 }, 300_000);
        say(`  saved ${String(shot["path"])}`);
      } catch (e) {
        // The build is placed either way; a missed screenshot (often the mouse moving the camera) is not worth stopping for.
        say(`  no screenshot: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await bridge.request("dev.release", { mode: "creative" }, 20_000).catch(() => undefined);
      }
    }
  }
  const spawnAt = out.layout.anchors["spawn"];
  if (spawnAt) await bridge.request("dev.command", { cmd: `/tp @s ${spawnAt.x} ${spawnAt.y} ${spawnAt.z}` }, 30_000);
  bridge.close();
  say("done: the game is running with you at the chalet's spawn.");
}
