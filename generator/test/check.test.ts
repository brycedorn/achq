import { describe, expect, it } from "vitest";
import { checkDesign } from "../src/check.js";
import { type Design, type Part, type PartInput, parseDesign } from "../src/design.js";
import { loadDesign } from "../src/designs.js";

const base = loadDesign("test-office");

/** The test office with its parts changed. */
function variant(change: (parts: (Part | PartInput)[]) => (Part | PartInput)[]): Design {
  return parseDesign({ ...base, parts: change([...base.parts]) });
}
const add = (...extra: PartInput[]) => (parts: (Part | PartInput)[]) => [...parts, ...extra];
const messages = (design: Design) => checkDesign(design).map((p) => `${p.where}: ${p.message}`).join("\n");

describe("checkDesign", () => {
  it("passes the test office", () => {
    expect(checkDesign(base)).toEqual([]);
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

  it("reports a seat whose right-hand cell is another chair, and slots that are too close", () => {
    const meeting = base.parts.find((p) => p.id === "meeting")!;
    if (meeting.type !== "seatedTable") throw new Error("expected seatedTable");
    const d = variant((parts) => parts.map((p) => (p.id === "meeting" ? { ...meeting, seats: [[4, 8, "south"], [3, 8, "south"]] } : p)) as Part[]);
    const found = messages(d);
    expect(found).toMatch(/meeting: the cell on the agent's right \(3, 1, 8\) must be free floor/);
    expect(found).toMatch(/meeting_2: only 1\.00 blocks from meeting/);
  });

  it("reports a chair that is not a stairs block", () => {
    const desks = base.parts.find((p) => p.id === "desks")!;
    if (desks.type !== "deskRow") throw new Error("expected deskRow");
    const d = variant((parts) => parts.map((p) => (p.id === "desks" ? { ...desks, chair: "minecraft:spruce_slab" } : p)) as Part[]);
    expect(messages(d)).toMatch(/desk_marlow: seat must be a bottom-half stairs block/);
  });

  it("reports stations that spawn cannot reach", () => {
    // A three-high wall splits the room east of the door. Lower walls would not: agents step over one block, and climb the podium to cross two.
    const wall: PartInput & { type: "taskWall" } = { type: "taskWall", id: "wall", x: 13, z: [1, 17], y: [1, 3], block: "minecraft:stone" };
    const found = messages(variant(add(wall)));
    expect(found).toMatch(/desk_tove: cannot be reached from spawn/);
    expect(found).toMatch(/mergestation: cannot be reached from spawn/);
    expect(found).not.toMatch(/desk_marlow|library/);
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
