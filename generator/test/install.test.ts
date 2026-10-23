import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installWorld, launcherSaves, restoreWorld } from "../src/install.js";

const HQ = "AgentCraft HQ";
const quiet = () => {};

/** A fake world folder: a level.dat holding `tag`, so tests can tell worlds apart. */
function world(dir: string, tag: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "level.dat"), tag);
  return dir;
}
const tagOf = (dir: string) => readFileSync(join(dir, "level.dat"), "utf8");

let root: string;
let saves: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "achq-install-"));
  saves = join(root, "saves");
  mkdirSync(saves);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("installWorld", () => {
  it("copies the save in as the HQ world when there is none", () => {
    const backup = installWorld(world(join(root, "gen"), "generated"), saves, quiet);
    expect(backup).toBeUndefined();
    expect(tagOf(join(saves, HQ))).toBe("generated");
    expect(existsSync(join(root, "gen", "level.dat"))).toBe(true); // copied, not moved
  });

  it("sets an existing HQ world aside instead of overwriting it", () => {
    world(join(saves, HQ), "mine");
    const backup = installWorld(world(join(root, "gen"), "generated"), saves, quiet);
    expect(backup).toMatch(/^AgentCraft HQ \(backup \d{4}-\d\d-\d\d \d\d-\d\d-\d\d\)$/);
    expect(tagOf(join(saves, backup!))).toBe("mine");
    expect(tagOf(join(saves, HQ))).toBe("generated");
  });

  it("sets a generated HQ world aside without making it the one to restore", () => {
    world(join(saves, HQ), "older generated");
    writeFileSync(join(saves, HQ, "agentcraft-world.json"), JSON.stringify({ createdBy: "achq" }));
    world(join(saves, `${HQ} (backup 2026-01-01 00-00-00)`), "mine");
    expect(installWorld(world(join(root, "gen"), "generated"), saves, quiet)).toBeUndefined();
    expect(readdirSync(saves).some((n) => n.startsWith(`${HQ} (achq `))).toBe(true);
    restoreWorld(saves, quiet);
    expect(tagOf(join(saves, HQ))).toBe("mine");
  });

  it("refuses something that is not a world save, or a missing saves folder", () => {
    mkdirSync(join(root, "empty"));
    expect(() => installWorld(join(root, "empty"), saves, quiet)).toThrow(/no level.dat/);
    expect(() => installWorld(world(join(root, "gen"), "g"), join(root, "nope", "saves"), quiet)).toThrow(/no saves folder/);
  });

  it("creates the saves folder of a game that has not run yet", () => {
    installWorld(world(join(root, "gen"), "generated"), join(root, "fresh"), quiet);
    expect(tagOf(join(root, "fresh", HQ))).toBe("generated");
  });
});

describe("restoreWorld", () => {
  it("puts the newest backup back and keeps the installed world", () => {
    world(join(saves, HQ), "generated");
    const old = world(join(saves, `${HQ} (backup 2026-01-01 00-00-00)`), "older");
    const newer = world(join(saves, `${HQ} (backup 2026-02-01 00-00-00)`), "mine");
    utimesSync(old, new Date("2026-01-01"), new Date("2026-01-01"));
    utimesSync(newer, new Date("2026-02-01"), new Date("2026-02-01"));

    restoreWorld(saves, quiet);
    expect(tagOf(join(saves, HQ))).toBe("mine");
    const names = readdirSync(saves);
    expect(names).toContain(`${HQ} (backup 2026-01-01 00-00-00)`);
    const kept = names.find((n) => n.startsWith(`${HQ} (achq `));
    expect(kept && tagOf(join(saves, kept))).toBe("generated");
  });

  it("undoes installWorld", () => {
    world(join(saves, HQ), "mine");
    installWorld(world(join(root, "gen"), "generated"), saves, quiet);
    restoreWorld(saves, quiet);
    expect(tagOf(join(saves, HQ))).toBe("mine");
  });

  it("says so when there is nothing to restore", () => {
    expect(() => restoreWorld(saves, quiet)).toThrow(/no backup to restore/);
  });
});

describe("launcherSaves", () => {
  const platform = process.platform;
  const appdata = process.env["APPDATA"];
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
    if (appdata === undefined) delete process.env["APPDATA"];
    else process.env["APPDATA"] = appdata;
  });
  const on = (p: string) => Object.defineProperty(process, "platform", { value: p });

  it("finds the launcher's saves folder on each platform", () => {
    on("win32");
    process.env["APPDATA"] = join("C:", "Users", "someone", "AppData", "Roaming");
    expect(launcherSaves()).toBe(join("C:", "Users", "someone", "AppData", "Roaming", ".minecraft", "saves"));
    delete process.env["APPDATA"];
    expect(launcherSaves()).toBe(join(homedir(), "AppData", "Roaming", ".minecraft", "saves"));
    on("darwin");
    expect(launcherSaves()).toBe(join(homedir(), "Library", "Application Support", "minecraft", "saves"));
    on("linux");
    expect(launcherSaves()).toBe(join(homedir(), ".minecraft", "saves"));
  });
});

describe("setting worlds aside", () => {
  let root: string;
  let saves: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "achq-aside-"));
    saves = join(root, "saves");
    mkdirSync(saves);
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  });
  const world = (dir: string, tag: string) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "level.dat"), tag);
    return dir;
  };

  it("numbers a backup when one with the same time is already there", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
    world(join(saves, "AgentCraft HQ (backup 2026-01-02 03-04-05)"), "earlier");
    world(join(saves, "AgentCraft HQ"), "mine");
    expect(installWorld(world(join(root, "gen"), "generated"), saves, () => {})).toBe("AgentCraft HQ (backup 2026-01-02 03-04-05 2)");
    expect(readFileSync(join(saves, "AgentCraft HQ (backup 2026-01-02 03-04-05)", "level.dat"), "utf8")).toBe("earlier");
  });

  it("says nothing can be restored from a saves folder that does not exist", () => {
    expect(() => restoreWorld(join(root, "missing"), () => {})).toThrow(/no backup to restore/);
  });

  // Windows will not rename a folder while a file in it is open, which is what a running game does.
  it.runIf(process.platform === "win32")("explains a world that is in use instead of failing obscurely", () => {
    world(join(saves, "AgentCraft HQ"), "mine");
    const handle = openSync(join(saves, "AgentCraft HQ", "level.dat"), "r");
    try {
      expect(() => installWorld(world(join(root, "gen"), "generated"), saves, () => {})).toThrow(/in use\. Close Minecraft/);
    } finally {
      closeSync(handle);
    }
  });
});
