"""Author designs/snowy-chalet/v9.json: v8 with its mountain streams following the ground.

In v8 the two streams coming down the mountain had height profiles of three or four points, nearly straight lines
from top to bottom. The mountainside is concave (steep up high, gentle lower down), so those lines ran up to 34
blocks above the slope, and the river carving raised the ground to meet them: a ridge with a frozen channel on top,
like an aqueduct. Their paths also ran across the slope, one starting on a ridge crest. v9 drops their profiles, so
they follow the ground instead (a groove cut into the slope, never rising downstream), and routes them the way water
would run from the same sources. The valley river keeps its profile: it already sits just below the valley floor.

Run from the repository root:  python tools/make-snowy-chalet-v9.py .
"""
import json
import sys

root = sys.argv[1]
v8 = json.load(open(f"{root}/designs/snowy-chalet/v8.json", encoding="utf-8"))

# Where water runs from each stream's source: steepest descent over the bare v8 terrain, smoothed over 9 x 9 blocks so
# noise bumps don't trap it, until it meets the valley river. A point every 10 blocks.
STREAMS = [
    [[250, 150], [243, 158], [235, 166], [227, 174], [219, 182], [211, 190], [203, 196], [193, 197], [185, 205], [177, 213],
     [169, 221], [168, 231], [171, 240], [167, 248], [163, 252]],
    [[60, 215], [70, 215], [80, 215], [90, 215], [99, 210], [108, 209], [111, 212]],
]

parts = []
for p in v8["parts"]:
    p = json.loads(json.dumps(p))
    if p["type"] == "terrain":
        for river, points in zip(p["rivers"][1:], STREAMS):  # the two mountain streams; the first is the valley river
            del river["y"]
            river["points"] = points
    parts.append(p)

design = {k: v for k, v in v8.items() if k != "parts"}
design["version"] = 9

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
open(f"{root}/designs/snowy-chalet/v9.json", "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("wrote v9 with", len(parts), "parts")
