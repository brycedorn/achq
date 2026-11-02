"""Author designs/snowy-chalet/v10.json: v9 with the path down to the village following the ground.

The path's height profile in v9 was a few straight runs. Over its last stretch it stayed up at 35 while the hillside
fell away to the valley floor at 12, so the path was carried on an embankment up to 23 blocks high into the village.
It also stood 4 to 5 blocks proud in four other places. v10 drops the profile, so the path follows the ground: just
under it and no steeper than 0.6, cutting into the slope instead of standing on fill. v10 also asks for the
`natural` check, so an embankment is a design problem from now on, not a warning.

Run from the repository root:  python tools/make-snowy-chalet-v10.py .
"""
import json
import sys

root = sys.argv[1]
v9 = json.load(open(f"{root}/designs/snowy-chalet/v9.json", encoding="utf-8"))

parts = []
for p in v9["parts"]:
    p = json.loads(json.dumps(p))
    if p["type"] == "terrain":
        del p["trails"][0]["y"]  # the path from the chalet down to the village; the village street stays level
    parts.append(p)

design = {k: v for k, v in v9.items() if k != "parts"}
design["version"] = 10
design["natural"] = True

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
open(f"{root}/designs/snowy-chalet/v10.json", "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("wrote v10 with", len(parts), "parts")
