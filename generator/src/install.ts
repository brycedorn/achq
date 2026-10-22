import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { HQ_LEVEL_NAME } from "./world.js";

type Say = (s: string) => void;

/** Your own HQ world, set aside while another is installed: `AgentCraft HQ (backup <time>)`. */
const BACKUP_PREFIX = `${HQ_LEVEL_NAME} (backup `;

/** A folder name for now in local time, safe on every platform: `2026-10-21 14-05-09`. */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Where the standard Minecraft launcher keeps saves on this platform (it may not exist). */
export function launcherSaves(): string {
  if (process.platform === "win32") return join(process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), ".minecraft", "saves");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "minecraft", "saves");
  return join(homedir(), ".minecraft", "saves");
}

/** Whether a world was written by ACHQ (its AgentCraft marker says so), rather than being someone's own. */
function generated(world: string): boolean {
  try {
    return JSON.parse(readFileSync(join(world, "agentcraft-world.json"), "utf8")).createdBy === "achq";
  } catch {
    return false;
  }
}

/** A folder name in `dir` like `<base> (<label> <time>)`, numbered when that one is taken. */
function freeName(dir: string, base: string, label: string): string {
  const name = `${base} (${label} ${stamp()})`;
  if (!existsSync(join(dir, name))) return name;
  for (let n = 2; ; n++) if (!existsSync(join(dir, `${name.slice(0, -1)} ${n})`))) return `${name.slice(0, -1)} ${n})`;
}

/** Rename, explaining the usual cause when it fails: the game has the world open. */
function move(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") throw new Error(`could not move '${from}': it is in use. Close Minecraft and try again.`);
    throw e;
  }
}

/**
 * Install a generated world save as the HQ world in a `saves` folder: an existing `AgentCraft HQ` is
 * first renamed to `AgentCraft HQ (backup <time>)` (never deleted), then the save is copied in. A world
 * ACHQ generated is set aside as `AgentCraft HQ (achq <time>)` instead, so `restoreWorld` skips it and
 * always brings back the world that was someone's own. Returns the backup's name, if one was made.
 */
export function installWorld(save: string, savesDir: string, say: Say): string | undefined {
  if (!existsSync(join(save, "level.dat"))) throw new Error(`'${save}' is not a world save (no level.dat). Write one with 'npm run world' first.`);
  if (!existsSync(savesDir)) {
    // A game that has never run has no saves folder yet; a missing parent is more likely a wrong path.
    if (!existsSync(dirname(savesDir))) throw new Error(`no saves folder at '${savesDir}'. Pass the 'saves' folder of the Minecraft that runs AgentCraft.`);
    mkdirSync(savesDir);
    say(`created '${savesDir}'`);
  }
  const target = join(savesDir, HQ_LEVEL_NAME);
  let backup: string | undefined;
  if (existsSync(target)) {
    if (generated(target)) {
      const kept = freeName(savesDir, HQ_LEVEL_NAME, "achq");
      move(target, join(savesDir, kept));
      say(`set the generated HQ world there aside as '${kept}'`);
    } else {
      backup = freeName(savesDir, HQ_LEVEL_NAME, "backup");
      move(target, join(savesDir, backup));
      say(`set the existing HQ world aside as '${backup}'`);
    }
  }
  cpSync(save, target, { recursive: true });
  say(`installed '${resolve(save)}' as '${target}'`);
  return backup;
}

/**
 * Undo `installWorld`: the newest `AgentCraft HQ (backup ...)` becomes the HQ world again, and the
 * installed one is kept as `AgentCraft HQ (achq <time>)`. Nothing is deleted.
 */
export function restoreWorld(savesDir: string, say: Say): void {
  const backups = existsSync(savesDir)
    ? readdirSync(savesDir).filter((n) => n.startsWith(BACKUP_PREFIX)).sort((a, b) => statSync(join(savesDir, b)).mtimeMs - statSync(join(savesDir, a)).mtimeMs)
    : [];
  const newest = backups[0];
  if (!newest) throw new Error(`no backup to restore: no '${BACKUP_PREFIX}...)' folder in '${savesDir}'`);
  const target = join(savesDir, HQ_LEVEL_NAME);
  if (existsSync(target)) {
    const kept = freeName(savesDir, HQ_LEVEL_NAME, "achq");
    move(target, join(savesDir, kept));
    say(`kept the installed world as '${kept}'`);
  }
  move(join(savesDir, newest), target);
  say(`restored '${newest}' as the HQ world${backups.length > 1 ? ` (${backups.length - 1} older backup${backups.length > 2 ? "s" : ""} left in place)` : ""}`);
}
