import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { parse, simplify } from "prismarine-nbt";
import { describe, expect, it } from "vitest";

/** The generator folder, where npm runs the CLI from. */
const GEN = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(GEN, "node_modules", "tsx", "dist", "cli.mjs");

/** Run the CLI as `npm run` would: from the generator folder, with `INIT_CWD` the folder the user typed in. */
function cli(args: string[], env: Record<string, string | undefined> = {}, from = GEN) {
  const r = spawnSync(process.execPath, [TSX, "src/cli.ts", ...args], {
    cwd: GEN,
    env: { ...process.env, INIT_CWD: from, ACHQ_SAVES: undefined, ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const temp = () => mkdtempSync(join(tmpdir(), "achq-cli-"));

describe("the command line", () => {
  it("prints its usage and fails for an unknown command", () => {
    const r = cli(["frobnicate"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/usage:/);
    expect(r.err).toMatch(/cli import --saves/);
  });

  it("checks a design, passing it while warning about a roofed spawn", () => {
    const r = cli(["check", "--design", "test-office"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ok: 'test-office' v1 passes all checks/);
    expect(r.err).toMatch(/warning: spawn: new players will arrive on top of/);
  });

  it("fails cleanly for a design that does not exist", () => {
    const r = cli(["check", "--design", "no-such-design"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/no-such-design/);
  });

  it("generates the structure, anchors and commands, and validates the anchors file", () => {
    const out = temp();
    const r = cli(["generate", "--design", "test-office", "--origin", "0,64,0", "--out", out]);
    expect(r.code).toBe(0);
    for (const f of ["test-office.nbt", "test-office.schem", "agentcraft-anchors.json", "test-office.commands.txt"]) expect(existsSync(join(out, f))).toBe(true);
    expect(r.out).toMatch(/\/place template minecraft:test-office 0 64 0/);
    const v = cli(["validate", join(out, "agentcraft-anchors.json")]);
    expect(v.code).toBe(0);
    expect(v.out).toMatch(/^ok: 'test-office' rev 1, \d+ anchors/);
  });

  it("rejects an anchors file that is missing what AgentCraft needs", () => {
    const file = join(temp(), "agentcraft-anchors.json");
    writeFileSync(file, JSON.stringify({ layout: "bare", revision: 1, anchors: { spawn: { x: 0, y: 65, z: 0, yaw: 0, pitch: 0 } } }));
    const r = cli(["validate", file]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/entrance/);
  });

  it("explains a malformed origin", () => {
    const r = cli(["generate", "--design", "test-office", "--origin", "1,2", "--out", temp()]);
    expect(r.code).not.toBe(0);
    expect(r.err).toMatch(/--origin must be three integers/);
  });

  it("writes a world save, reading a relative --out from where the command was typed", () => {
    const here = temp();
    const r = cli(["world", "--design", "test-office", "--out", "worlds"], {}, here);
    expect(r.code).toBe(0);
    expect(existsSync(join(here, "worlds", "AgentCraft HQ", "level.dat"))).toBe(true);
  });

  it("places a world save where the design says, when it says", async () => {
    const out = temp();
    const r = cli(["world", "--design", "orbital-station", "--out", out]);
    expect(r.code).toBe(0);
    const level = simplify((await parse(gunzipSync(readFileSync(join(out, "AgentCraft HQ", "level.dat"))))).parsed) as { Data: { spawn: { pos: number[] } } };
    expect(level.Data.spawn.pos[1]).toBeGreaterThan(200); // in orbit, not on the meadow at 65
  });

  it("asks which saves folder to use, naming the launcher's, when none is given", () => {
    const r = cli(["import", "--design", "test-office"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/--saves <folder>/);
    expect(r.err).toMatch(/\.minecraft|minecraft/);
  });

  it("imports a world into a saves folder, keeps the old one, and restores it", () => {
    const root = temp();
    const saves = join(root, "saves");
    mkdirSync(join(saves, "AgentCraft HQ"), { recursive: true });
    writeFileSync(join(saves, "AgentCraft HQ", "level.dat"), "mine");
    const world = cli(["world", "--design", "test-office", "--out", join(root, "out")]);
    expect(world.code).toBe(0);

    const imp = cli(["import", "--saves", saves, "--save", join(root, "out", "AgentCraft HQ")]);
    expect(imp.code).toBe(0);
    expect(imp.out).toMatch(/set the existing HQ world aside as 'AgentCraft HQ \(backup /);
    expect(readFileSync(join(saves, "AgentCraft HQ", "level.dat")).length).toBeGreaterThan(100); // the real save

    const res = cli(["restore"], { ACHQ_SAVES: saves });
    expect(res.code).toBe(0);
    expect(readFileSync(join(saves, "AgentCraft HQ", "level.dat"), "utf8")).toBe("mine");
  });

  it("reports a failed import plainly", () => {
    const root = temp();
    const r = cli(["import", "--saves", join(root, "saves"), "--save", join(root, "not-a-world")]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/is not a world save/);
  });
});
