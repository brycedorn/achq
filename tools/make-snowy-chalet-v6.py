"""Author designs/snowy-chalet/v6.json: the chalet (taken from v3) on a mountain shoulder above a river valley.

The design file is the source of truth; this script is how v6 was produced and how to re-tune it. It computes the
terrain height grid from the shape of the valley (a river line, walls that rise away from it, scattered peaks and
hills), the elevation profiles of the path and the streams, and writes the JSON.

Run from the repository root:  python tools/make-snowy-chalet-v6.py .
"""

import json
import math
import random
import sys

root = sys.argv[1]
v3 = json.load(open(f"{root}/designs/snowy-chalet/v3.json", encoding="utf-8"))

W, H, L = 480, 176, 512
DX, DY, DZ = 57, 34, 85  # the v3 chalet moves to the north-west shoulder: door at (130, 100), floor layer 72


def shift(part):
    p = json.loads(json.dumps(part))
    t = p["type"]
    if t == "box":
        p["from"] = [p["from"][0] + DX, p["from"][1] + DY, p["from"][2] + DZ]
        p["to"] = [p["to"][0] + DX, p["to"][1] + DY, p["to"][2] + DZ]
    elif t == "gableRoof":
        p["x"] = [p["x"][0] + DX, p["x"][1] + DX]
        p["z"] = [p["z"][0] + DZ, p["z"][1] + DZ]
        p["eaveY"] += DY
    elif t == "gableEnd":
        p["x"] = [p["x"][0] + DX, p["x"][1] + DX]
        p["z"] += DZ
        p["y0"] += DY
        p["eaveY"] += DY
    elif t == "deck":
        p["x"] = [p["x"][0] + DX, p["x"][1] + DX]
        p["z"] = [p["z"][0] + DZ, p["z"][1] + DZ]
        p["y"] += DY
        p["posts"]["bottom"] = 40
    elif t == "fireplace":
        p["wallX"] += DX
        p["z"] += DZ
        p["top"] += DY
    elif t == "lanternGrid":
        p["xs"] = [x + DX for x in p["xs"]]
        p["zs"] = [z + DZ for z in p["zs"]]
        p["y"] += DY
    elif t in ("spot", "station", "podium", "deskRow"):
        p["at"] = [p["at"][0] + DX, p["at"][1] + DZ]
    elif t == "seatedTable":
        p["table"]["from"] = [p["table"]["from"][0] + DX, p["table"]["from"][1] + DZ]
        p["table"]["to"] = [p["table"]["to"][0] + DX, p["table"]["to"][1] + DZ]
        p["seats"] = [[s[0] + DX, s[1] + DZ, s[2]] for s in p["seats"]]
    elif t == "taskWall":
        p["x"] += DX
        p["z"] = [p["z"][0] + DZ, p["z"][1] + DZ]
        p["y"] = [p["y"][0] + DY, p["y"][1] + DY]
    elif t == "camera":
        p["at"] = [p["at"][0] + DX, p["at"][1] + DY, p["at"][2] + DZ]
    elif t == "trees":
        p["at"] = [[x + DX, z + DZ] for x, z in p["at"]]
    else:
        raise SystemExit(f"unhandled part type {t}")
    return p


building = [shift(p) for p in v3["parts"] if p["type"] not in ("terrain", "trees", "village") and p["id"] not in ("vista", "town")]
garden = shift(next(p for p in v3["parts"] if p["id"] == "garden"))

# ---------------------------------------------------------------- the shape of the valley
RIVER = [(100, 175), (115, 215), (150, 250), (185, 262), (225, 300), (255, 345), (300, 372), (350, 372), (395, 400), (420, 445), (440, 490), (445, 511)]
RIVER_Y = [(0, 30), (0.15, 24), (0.35, 16), (0.55, 11), (0.75, 8), (1, 5)]  # water level by fraction of the river's length


def profile_at(profile, t):
    for (t0, y0), (t1, y1) in zip(profile, profile[1:]):
        if t <= t1:
            return y0 + (y1 - y0) * (t - t0) / (t1 - t0) if t1 > t0 else y1
    return profile[-1][1]


def sample_line(points, step=2.0):
    total = sum(math.dist(a, b) for a, b in zip(points, points[1:]))
    out, before = [], 0.0
    for a, b in zip(points, points[1:]):
        n = math.dist(a, b)
        s = 0.0
        while s < n:
            out.append((a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n, (before + s) / total))
            s += step
        before += n
    out.append((points[-1][0], points[-1][1], 1.0))
    return out


river_samples = sample_line(RIVER)


def nearest_river(x, z):
    best = min(river_samples, key=lambda s: (s[0] - x) ** 2 + (s[1] - z) ** 2)
    return math.hypot(best[0] - x, best[1] - z), profile_at(RIVER_Y, best[2])


rng = random.Random(6)
CHALET = (130, 100)
TOWN = (310, 326)

# Scattered mountains: different heights and widths all over, none in the river corridor, on the chalet shelf or in the town basin.
peaks = []
tries = 0
while len(peaks) < 46 and tries < 5000:
    tries += 1
    x, z = rng.uniform(0, W), rng.uniform(0, L)
    d, _ = nearest_river(x, z)
    if d < 90 or math.dist((x, z), CHALET) < 90 or math.dist((x, z), TOWN) < 110:
        continue
    peaks.append({"at": [round(x), round(z)], "height": round(rng.uniform(22, 75)), "radius": round(rng.uniform(32, 85)), "sharpness": round(rng.uniform(1.4, 2.2), 1)})
# A big massif behind the chalet, and a few hills on the valley floor, kept off the line of sight to the town.
peaks.append({"at": [130, 25], "height": 48, "radius": 125, "sharpness": 1.6})
peaks.append({"at": [60, 140], "height": 30, "radius": 70, "sharpness": 1.8})
hills = [(205, 205, 22, 26), (255, 232, 26, 30), (180, 330, 18, 24), (350, 240, 24, 34), (385, 330, 20, 28), (120, 300, 26, 36), (420, 380, 30, 40), (60, 420, 34, 46), (300, 450, 22, 30), (240, 420, 28, 34)]
for x, z, h, r in hills:
    peaks.append({"at": [x, z], "height": h, "radius": r, "sharpness": 1.6})


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def ground(x, z):
    """The shape of the ground, before noise and the carved features."""
    d, level = nearest_river(x, z)
    e = level + 3 + 0.26 * max(0.0, d - 14) ** 1.12
    edge = min(x, W - 1 - x, z, L - 1 - z)
    e += 55 * smoothstep((110 - edge) / 110) * smoothstep(d / 70)  # a rim of mountains round the world, open where the river leaves
    for pk in peaks:
        dd = math.hypot(x - pk["at"][0], z - pk["at"][1])
        if dd < pk["radius"]:
            e += pk["height"] * (1 - dd / pk["radius"]) ** pk["sharpness"] * smoothstep(d / 50)
    return min(max(e, 0.0), 160.0)


COLS, ROWS = 33, 33
grid = [[round(ground(c * (W - 1) / (COLS - 1), r * (L - 1) / (ROWS - 1)), 1) for c in range(COLS)] for r in range(ROWS)]

# The peaks are already in the grid, so the terrain part only needs the shape; keep it compact.
terrain = {
    "type": "terrain", "id": "mountain", "x": [0, W - 1], "z": [0, L - 1], "grid": grid,
    "ridged": {"amplitude": 18, "scale": 26, "above": 55},
    "noise": {"amplitude": 2.0, "scale": 9},
    "flat": {"x": [109, 151], "z": [93, 120], "y": 72, "margin": 6},
    "flats": [{"x": [255, 365], "z": [294, 358], "y": 12, "margin": 24, "shape": "ellipse", "ripple": 0.5}],
    "rivers": [
        {   # the main river: from a spring in the mountains below the chalet, away across the valley to the south-east
            "points": [list(p) for p in RIVER], "y": [list(p) for p in RIVER_Y], "width": 9, "depth": 3, "margin": 6, "open": [[0.1, 0.9]],
            "bed": "minecraft:gravel", "ice": "minecraft:packed_ice",
        },
    ],
    "trails": [],
    "depth": 6,
    "surface": "minecraft:snow_block", "rock": "minecraft:stone", "rockAlt": "minecraft:andesite", "base": "minecraft:stone",
    "rockSlope": 3,
}


def descend(points, floor_y=None, max_slope=0.42):
    """A height profile for a path: it follows the ground, never climbs, and never drops faster than max_slope."""
    ys, cum = [], [0.0]
    for a, b in zip(points, points[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    total = cum[-1]
    y = None
    for p, c in zip(points, cum):
        e = ground(p[0], p[1])
        if y is None:
            y = e
        else:
            y = min(y, max(e, ys[-1][1] - max_slope * (c - ys[-1][2]) * total / total))
        ys.append((c / total, y, c))
    return [[round(t, 3), round(y, 1)] for t, y, _ in ys]


path_pts = [(130, 97), (130, 94), (152, 94), (172, 112), (165, 150), (190, 188), (222, 206), (250, 238), (272, 272), (300, 302), (312, 334), (296, 336)]
path_y = descend(path_pts)
path_y[0][1] = path_y[1][1] = 72  # the shelf
street_y = 12
terrain["trails"] = [
    {"points": [list(p) for p in path_pts], "y": path_y, "width": 3, "margin": 5, "surface": "minecraft:gravel",
     "lamps": {"every": 16, "post": "minecraft:spruce_fence", "lantern": "minecraft:lantern"}},
    {"points": [[262, 336], [362, 336]], "y": [[0, street_y], [1, street_y]], "width": 3, "margin": 2, "surface": "minecraft:gravel",
     "lamps": {"every": 12, "post": "minecraft:spruce_fence", "lantern": "minecraft:lantern"}},
]

# Frozen streams coming off the mountains into the river.
for pts in ([(250, 150), (236, 205), (200, 258)], [(60, 215), (92, 250), (120, 232), (150, 252)]):
    ys = descend(pts, max_slope=0.3)
    d, level = nearest_river(*pts[-1])
    ys[-1][1] = round(level)
    for i in range(len(ys) - 2, -1, -1):
        ys[i][1] = max(ys[i][1], ys[i + 1][1])
    terrain["rivers"].append({"points": [list(p) for p in pts], "y": ys, "width": 5, "depth": 2, "margin": 4, "open": [], "bed": "minecraft:gravel", "ice": "minecraft:packed_ice"})

bridge_y = 10
bridge = [
    {"type": "box", "id": "bridge-deck", "from": [326, bridge_y + 1, 362], "to": [330, bridge_y + 1, 382], "block": "minecraft:spruce_planks"},
    {"type": "box", "id": "bridge-rail-west", "from": [326, bridge_y + 2, 362], "to": [326, bridge_y + 2, 382], "block": "minecraft:spruce_fence"},
    {"type": "box", "id": "bridge-rail-east", "from": [330, bridge_y + 2, 362], "to": [330, bridge_y + 2, 382], "block": "minecraft:spruce_fence"},
    {"type": "lanternGrid", "id": "bridge-lights", "xs": [326, 330], "zs": [362, 382], "y": bridge_y + 3, "block": "minecraft:lantern"},
]
village = {
    "type": "village", "id": "village", "style": "varied", "on": "mountain", "at": [310, 332], "church": [310, 312],
    "radius": 58, "houses": 80, "lodges": 0.2, "chimneys": True,
    "wall": "minecraft:spruce_planks", "accent": "minecraft:dark_oak_planks", "stone": "minecraft:stone_bricks",
    "roof": "minecraft:smooth_quartz_stairs", "ridge": "minecraft:snow_block", "light": "minecraft:shroomlight",
    "post": "minecraft:spruce_fence", "lantern": "minecraft:lantern",
}
forest = {
    "type": "trees", "id": "forest", "on": "mountain", "dead": 0.08,
    "scatter": {"x": [0, W - 1], "z": [0, L - 1], "count": 6500, "treeline": 80, "maxSlope": 2, "spacing": 5, "taper": 14,
                "clusters": {"scale": 30, "threshold": -0.25}, "exclude": [[95, 70, 170, 150], [250, 285, 372, 372]]},
    "trunk": "minecraft:spruce_log", "leaves": "minecraft:spruce_leaves[persistent=true]", "snow": "minecraft:snow_block",
    "minHeight": 8, "maxHeight": 13,
}
rocks = {
    "type": "boulders", "id": "rocks", "on": "mountain",
    "scatter": {"x": [0, W - 1], "z": [0, L - 1], "count": 800, "treeline": 100, "maxSlope": 2, "spacing": 9, "taper": 10,
                "clusters": {"scale": 40, "threshold": 0.0}, "exclude": [[95, 70, 170, 150]]},
    "minSize": 1, "maxSize": 4,
    "blocks": ["minecraft:stone", "minecraft:andesite", "minecraft:cobblestone"], "snow": "minecraft:snow_block",
}
cameras = [
    {"type": "camera", "id": "vista", "name": "vista", "at": [127.5, 75.5, 125.5], "yaw": 0, "pitch": 12},
    {"type": "camera", "id": "river", "name": "river", "at": [131, 75.5, 126], "yaw": 314, "pitch": 9},
    {"type": "camera", "id": "town", "name": "town", "at": [190, 110, 200], "yaw": 322, "pitch": 18},
    {"type": "camera", "id": "exterior", "name": "exterior", "at": [215, 70, 250], "yaw": 305, "pitch": 3},
    {"type": "camera", "id": "bridge", "name": "bridge", "at": [328, 15, 392], "yaw": 180, "pitch": 4},
]

parts = [terrain] + building + cameras + [garden] + bridge + [village, forest, rocks]

lines = ["{", '  "name": "snowy-chalet",', '  "version": 6,', '  "seed": 6,', f'  "size": [{W}, {H}, {L}],',
         f'  "floorY": {v3["floorY"] + DY},', '  "shell": { "kind": "none" },',
         '  "atmosphere": { "biome": "minecraft:snowy_taiga", "weather": "rain", "time": 12500 },', '  "parts": [']
for i, p in enumerate(parts):
    if p["type"] == "terrain":
        g = p.pop("grid")
        head = json.dumps(p, separators=(", ", ": "))
        rows = ",\n".join("        " + json.dumps(r, separators=(",", ":")) for r in g)
        # put the grid on its own lines so the file stays readable
        lines.append('    ' + head[:-1] + ', "grid": [\n' + rows + "\n    ]}" + ("," if i < len(parts) - 1 else ""))
    else:
        lines.append("    " + json.dumps(p, separators=(", ", ": ")) + ("," if i < len(parts) - 1 else ""))
lines += ["  ]", "}"]
open(f"{root}/designs/snowy-chalet/v6.json", "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("wrote v6 with", len(parts), "parts;", len(peaks), "peaks folded into the grid")
