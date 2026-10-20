"""Author designs/snowy-chalet/v7.json: v6 with the AgentCraft mod's own blocks, bound so they come alive.

v6 used vanilla stand-ins (black concrete monitors, lecterns). v7 swaps in the mod's blocks and sets
their bindings the way the mod's studio HQ builder does (`mod/src/main/java/dev/agentcraft/hq/StudioHqBuilder.java`):
a 3 x 2 monitor wall per desk bound to the agent, a status lamp on top bound to `agent:<id>`, a memory
archive bound `shared`, a console terminal, a merge station with its `merge` lamp, CI lamps `ci:#1..#3`
by the test bench, the decision podium with its `decisions` lamp, the `goal:atrium` lamp (its block
entity is the goal hologram) and a task board. The terrain, trees and village are unchanged.

Run from the repository root:  python tools/make-snowy-chalet-v7.py .
"""
import json
import sys

root = sys.argv[1]
v6 = json.load(open(f"{root}/designs/snowy-chalet/v6.json", encoding="utf-8"))
FEET = v6["floorY"] + 1  # 73: the layer agents stand in

MONITOR = "agentcraft:monitor[facing=north,lit=true]"
LAMP_IDLE = "agentcraft:status_lamp[status=idle]"
LAMP_OFF = "agentcraft:status_lamp[status=off]"

parts = []
for p in v6["parts"]:
    p = json.loads(json.dumps(p))
    pid = p["id"]
    if pid in ("desks-front", "desks-back"):
        p["screen"] = {"block": MONITOR, "width": 3, "height": 2}
        p["lamp"] = LAMP_IDLE
        if pid == "desks-back":
            p["at"] = [p["at"][0] - 1, p["at"][1]]  # tove's desk was against the east wall: no room for a 3-wide screen
    elif pid == "library":
        p["block"], p["binding"] = "agentcraft:memory_archive[facing=north]", "shared"
    elif pid == "terminal":
        p["block"] = "agentcraft:console_terminal[facing=north]"
    elif pid == "mergestation":
        p["block"] = "agentcraft:merge_station[facing=north,active=false]"
    elif pid == "podium":
        p["block"] = "agentcraft:decision_podium[facing=north,open=false]"
    elif pid == "task-wall":
        p["block"] = "agentcraft:task_board[facing=east]"
    parts.append(p)

    if pid == "task-wall":
        # The status lamps that belong to stations, placed after the building so they sit on it.
        merge = next(q for q in v6["parts"] if q["id"] == "mergestation")["at"]
        bench = next(q for q in v6["parts"] if q["id"] == "testbench")["at"]
        podium = next(q for q in v6["parts"] if q["id"] == "podium")["at"]
        atrium = next(q for q in v6["parts"] if q["id"] == "atrium")["at"]
        parts += [
            {"type": "device", "id": "merge-lamp", "at": [merge[0], FEET + 1, merge[1] + 1], "block": LAMP_OFF, "binding": "merge"},
            *[
                {"type": "device", "id": f"ci-lamp-{n}", "at": [bench[0] - 2 + n, FEET + 3, bench[1] - 2], "block": LAMP_IDLE, "binding": f"ci:#{n}"}
                for n in (1, 2, 3)
            ],
            {"type": "device", "id": "decisions-lamp", "at": [podium[0], FEET + 3, podium[1]], "block": LAMP_OFF, "binding": "decisions"},
            {"type": "device", "id": "goal-lamp", "at": [atrium[0], FEET, atrium[1]], "block": LAMP_IDLE, "binding": "goal:atrium"},
        ]

design = {k: v for k, v in v6.items() if k != "parts"}
design["version"] = 7

lines = ["{"]
for k, v in design.items():
    lines.append(f'  "{k}": {json.dumps(v, separators=(", ", ": "))},')
lines.append('  "parts": [')
for i, p in enumerate(parts):
    comma = "," if i < len(parts) - 1 else ""
    if p["type"] == "terrain":
        g = p.pop("grid")
        head = json.dumps(p, separators=(", ", ": "))
        rows = ",\n".join("        " + json.dumps(r, separators=(",", ":")) for r in g)
        lines.append("    " + head[:-1] + ', "grid": [\n' + rows + "\n    ]}" + comma)
    else:
        lines.append("    " + json.dumps(p, separators=(", ", ": ")) + comma)
lines += ["  ]", "}"]
open(f"{root}/designs/snowy-chalet/v7.json", "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("wrote v7 with", len(parts), "parts")
