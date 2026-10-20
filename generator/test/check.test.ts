import { describe, expect, it } from "vitest";
import { checkDesign, isSpot } from "../src/check.js";
import { type Design, type Part, type PartInput, parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";

const base = loadDesign("test-office");

/** The test office with its parts changed. */
function variant(change: (parts: (Part | PartInput)[]) => (Part | PartInput)[]): Design {
  return parseDesign({ ...base, parts: change([...base.parts]) });
}
const add = (...extra: PartInput[]) => (parts: (Part | PartInput)[]) => [...parts, ...extra];
const replace = (id: string, next: PartInput) => (parts: (Part | PartInput)[]) => parts.map((p) => (p.id === id ? next : p));
const messages = (design: Design) => checkDesign(design).map((p) => `${p.where}: ${p.message}`).join("\n");

describe("checkDesign", () => {
  it("passes the test office", () => {
    expect(checkDesign(base)).toEqual([]);
  });

  it("treats the same anchors as places to stand as the mod does", () => {
    for (const name of ["desk_kit", "lounge_3", "library", "user", "entrance"]) expect(isSpot(name), name).toBe(true);
    for (const name of ["spawn", "goal_atrium", "task_wall", "decision_podium", "monitor_kit", "seat_kit", "cam_overview"]) expect(isSpot(name), name).toBe(false);
  });

  it("reports parts that overwrite each other", () => {
    // A lantern placed on the first meeting chair's cell.
    const d = variant(add({ type: "lanternGrid", id: "clash", xs: [4], zs: [8], y: 1, block: "minecraft:lantern" }));
    expect(messages(d)).toMatch(/clash: overwrites a block of part 'meeting' at 4, 1, 8/);
  });

  it("reports a part that falls outside the volume", () => {
    const d = variant(add({ type: "station", id: "far", station: "library_2", at: [40, 5], block: "minecraft:lectern" }));
    expect(messages(d)).toMatch(/outside the 25 x 8 x 19 volume/);
  });

  it("accepts a seat blocked on the right, as agents step in from the first free side", () => {
    const meeting = base.parts.find((p) => p.id === "meeting")!;
    if (meeting.type !== "seatedTable") throw new Error("expected seatedTable");
    const found = messages(variant(replace("meeting", { ...meeting, seats: [[4, 8, "south"], [3, 8, "south"]] })));
    expect(found).not.toMatch(/free side/); // the chair at 4, 8 is blocked on its right but free on its left
    expect(found).toMatch(/meeting_2: only 1\.00 blocks from meeting/); // still too close for the nameplates
  });

  it("reports a seat with no free side to step in from", () => {
    // The desk is in front of desk_marlow's chair at 2, 1, 13; two-high stone closes the other three sides.
    const stone = "minecraft:stone";
    const d = variant(
      add(
        { type: "box", id: "w", from: [1, 1, 13], to: [1, 2, 13], block: stone },
        { type: "box", id: "e", from: [3, 1, 13], to: [3, 2, 13], block: stone },
        { type: "box", id: "n", from: [2, 1, 12], to: [2, 2, 12], block: stone },
      ),
    );
    expect(messages(d)).toMatch(/desk_marlow: seat with no free side to step in from/);
  });

  it("reports a chair that is not a seat, and accepts a bottom slab as one", () => {
    const desks = base.parts.find((p) => p.id === "desks")!;
    if (desks.type !== "deskRow") throw new Error("expected deskRow");
    const withChair = (chair: string) => messages(variant(replace("desks", { ...desks, chair })));
    expect(withChair("minecraft:stone")).toMatch(/desk_marlow: should be a seat/);
    expect(withChair("minecraft:spruce_slab")).not.toMatch(/desk_marlow/);
  });

  it("reports stations that cannot be reached from the entrance or the lounge", () => {
    // A three-high wall splits the room east of the door. Lower walls would not: agents step over one block, and climb the podium to cross two.
    const wall: PartInput & { type: "taskWall" } = { type: "taskWall", id: "wall", x: 13, z: [1, 17], y: [1, 3], block: "minecraft:stone" };
    const found = messages(variant(add(wall)));
    expect(found).toMatch(/desk_tove: cannot be reached from entrance/);
    expect(found).toMatch(/mergestation: cannot be reached from entrance/);
    expect(found).not.toMatch(/(desk_marlow|library): cannot be reached from entrance/);
    expect(found).toMatch(/desk_marlow: cannot be reached from lounge/); // the lounge is on the far side of the wall
    expect(messages(variant(add({ ...wall, y: [1, 1] })))).not.toMatch(/cannot be reached/);
  });

  it("reports a standing spot inside a solid block", () => {
    const d = variant(
      add(
        { type: "lanternGrid", id: "block", xs: [12], zs: [13], y: 1, block: "minecraft:stone" },
        { type: "spot", id: "buried", anchor: "user_2", at: [12, 13], look: "south" },
      ),
    );
    expect(messages(d)).toMatch(/user_2: no room to stand/);
  });
});
