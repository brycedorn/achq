"""Author designs/snowy-chalet/v8.json: v7 made to pass the player and sense checks.

v8 is walked as a player (`walk`), so it has to pass what those checks ask of a place: no drop that hurts without a
railing, nothing floating, floors on the ground, paths that lead somewhere, and the rest (docs/SPEC.md, rules 7 to 9).

Run from the repository root:  python tools/make-snowy-chalet-v8.py .
"""
import json
import sys

root = sys.argv[1]
v7 = json.load(open(f"{root}/designs/snowy-chalet/v7.json", encoding="utf-8"))

FENCE = "minecraft:spruce_fence"


def fence(id, x, y, z, east=False, north=False, south=False, west=False):
    state = f"east={str(east).lower()},north={str(north).lower()},south={str(south).lower()},waterlogged=false,west={str(west).lower()}"
    return {"type": "box", "id": id, "from": [x, y, z], "to": [x, y, z], "block": f"{FENCE}[{state}]"}


parts = []
for p in v7["parts"]:
    p = json.loads(json.dumps(p))
    if p["id"] == "deck":
        p["rail"]["joined"] = True  # a railing, not a row of posts a player walks between
    elif p["type"] == "trees":
        p["tidy"] = True  # dead trees' branches joined, not floating at their tips
    elif p["id"] == "decisions-lamp":
        p["at"] = [129, 79, 108]  # hung from a roof beam, not floating over the podium
    elif p["id"] == "spawn":
        p["at"] = [130, 98]  # outside the front door, under the sky: arriving on the path, not on the roof
    elif p["type"] == "terrain":
        p["trails"][0]["points"][0] = [130, 99]  # the path runs right up to the front door
    parts.append(p)
    if p["id"] == "deck":
        # The deck reaches past the house at its north corners: rail those too, up against the house walls.
        parts += [fence("deck-rail-nw-1", 121, 73, 121, east=True, west=True), fence("deck-rail-nw-2", 122, 73, 121, east=True, west=True),
                  fence("deck-rail-ne-1", 138, 73, 121, east=True, west=True), fence("deck-rail-ne-2", 139, 73, 121, east=True, west=True),
                  # and close each corner, where the railing's end post would leave a gap onto the slope beside the deck
                  fence("deck-rail-nw-corner", 120, 73, 120, south=True), fence("deck-rail-ne-corner", 140, 73, 120, south=True)]
    if p["type"] == "village":
        # Lamp posts where the village street ends, so it ends somewhere.
        for i, x in enumerate((261, 363)):
            parts += [{"type": "box", "id": f"street-end-post-{i}", "from": [x, 13, 337], "to": [x, 14, 337], "block": FENCE},
                      {"type": "box", "id": f"street-end-lamp-{i}", "from": [x, 15, 337], "to": [x, 15, 337], "block": "minecraft:lantern"}]

design = {k: v for k, v in v7.items() if k != "parts"}
design["version"] = 8
design["walk"] = {"to": []}

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
open(f"{root}/designs/snowy-chalet/v8.json", "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("wrote v8 with", len(parts), "parts")
