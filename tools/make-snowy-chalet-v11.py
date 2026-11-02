"""Author designs/snowy-chalet/v11.json: v10 with stairs on the path down to the village.

v10's path had no `steps`, so each one-block rise was a full block to jump, and the walk check did not try trails.
v11 puts a stair on every rise and asks for both ends of every trail to be walked to and back (`walk.trails`).

Run from the repository root:  python tools/make-snowy-chalet-v11.py .
"""
import json
import sys

root = sys.argv[1]
v10 = json.load(open(f"{root}/designs/snowy-chalet/v10.json", encoding="utf-8"))

parts = []
for p in v10["parts"]:
    p = json.loads(json.dumps(p))
    if p["type"] == "terrain":
        p["trails"][0]["steps"] = "minecraft:cobblestone_stairs"
    parts.append(p)

design = {k: v for k, v in v10.items() if k != "parts"}
design["version"] = 11
design["walk"] = {"to": [], "trails": True}

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
open(f"{root}/designs/snowy-chalet/v11.json", "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("wrote v11 with", len(parts), "parts")
