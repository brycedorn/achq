"""Author designs/lighthouse/v1.json: a lighthouse and its keeper's cottage on a rocky island at sunset.

A white tower banded in red stands at the west end of a grassy island, on the cliff edge, with the keeper's cottage
joined to its foot. The office is laid out the way a lighthouse is used:
- the cottage: a hall from the front door to the tower, the kitchen with its big table (meetings) on one side, the
  parlour with armchairs round the fire (the lounge) on the other;
- the foot of the tower is the keeper's office: the log books (the library), the telegraph (the terminal), and the
  user's podium;
- a stair winds up the inside of the wall, a flight to each landing, and each landing has two desks;
- the watch room under the lantern holds the test bench, the merge station and the task board;
- the lantern room at the top holds the goal projector as the lighthouse's lens, its hologram up under the dome.
Outside: a slate-roofed cottage, a walled garden, a path down the cliff to a jetty and a boat, sea stacks, and the
mainland's cliffs across the water to the north.

Run from the repository root:  python tools/make-lighthouse-v1.py .
"""

import json
import math
import os
import random
import sys

root = sys.argv[1]

W, H, L = 192, 88, 192
SEA = 24  # layer of the sea surface
G = 40  # the island's top: floor layer of the cottage and the foot of the tower; feet stand at 41
TX, TZ = 72, 92  # the tower's axis
T_TOP = G + 25  # the lantern room's floor
R0, R1 = 6.5, 5.0  # the tower's radius at its foot and at the top: rooms 9 to 11 across, a keeper's scale
ROUND = 0.35  # as in the generator's shapes.ts: how far past the radius a cell centre may be and still count

WHITE = "minecraft:white_concrete"
RED = "minecraft:red_concrete"
BLACK = "minecraft:polished_blackstone"
PLANKS = "minecraft:spruce_planks"
STONE = "minecraft:stone_bricks"
FLAG = "minecraft:polished_andesite"
GLASS = "minecraft:glass"
COPPER = "minecraft:oxidized_cut_copper"
CHAIR = "minecraft:spruce_stairs"
ARMCHAIR = "minecraft:dark_oak_stairs"


def box(id, a, b, block, over=None):
    p = {"type": "box", "id": id, "from": list(a), "to": list(b), "block": block}
    if over:
        p["over"] = over
    return p


def cell(id, x, y, z, block, over=None):
    return box(id, (x, y, z), (x, y, z), block, over)


# ---------------------------------------------------------------- the tower's plan, cell by cell
def radius_at(y, y0=G, y1=T_TOP, r0=R0, r1=R1):
    """The tower's radius at layer y, computed exactly as the cylinder part does."""
    return r0 + (r1 - r0) * ((y - y0) / (y1 - y0))


def inside(p, q, r):
    return p * p + q * q <= (r + ROUND) * (r + ROUND)


def interior(r):
    """Cells of a disc of radius r that are not on its edge: the room inside the wall."""
    reach = math.ceil(r) + 2
    return {(p, q) for p in range(-reach, reach + 1) for q in range(-reach, reach + 1)
            if inside(p, q, r) and inside(p + 1, q, r) and inside(p - 1, q, r) and inside(p, q + 1, r) and inside(p, q - 1, r)}


def edge(r):
    reach = math.ceil(r) + 2
    return {(p, q) for p in range(-reach, reach + 1) for q in range(-reach, reach + 1) if inside(p, q, r)} - interior(r)


def disc_rows(id, y, cells, block, over):
    """A floor over `cells` (offsets from the axis), one box per row of z."""
    rows = {}
    for p, q in cells:
        rows.setdefault(q, []).append(p)
    out = []
    for q in sorted(rows):
        xs = sorted(rows[q])
        # split a row where it is broken (a stairwell)
        start = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == prev + 1:
                prev = x
                continue
            out.append(box(f"{id}-{q}-{start}", (TX + start, y, TZ + q), (TX + prev, y, TZ + q), block, over))
            if x is not None:
                start = prev = x
    return out


# The stair: one flight up the wall to each landing, turning a quarter round each time (north wall going west, west
# wall going south, south wall going east, east wall going north), so it winds up the tower. Five steps make the five
# blocks from floor to floor: the fifth is set into the floor above, flush with it, so each flight runs straight on
# into the next. The floor above has a well over the steps below it, for head room.
FLIGHT = {
    "north": (lambda c, j: (j, -c), "west"),
    "west": (lambda c, j: (-c, -j), "south"),
    "south": (lambda c, j: (-j, c), "east"),
    "east": (lambda c, j: (c, j), "north"),
}
LEVELS = [G, G + 5, G + 10, G + 15, G + 20, T_TOP]  # floor layers: office, three desk landings, watch room, lantern
SIDES = ["north", "west", "south", "east", "north"]  # the flight up from each level
CHORD = 3  # how far from the axis the flights run
START = 2  # where each flight starts along its wall, a step on from where the last one came up


def flight(level):
    """The five steps up from `level` (offsets and layer; the last in the next floor), their facing, and the well."""
    at, facing = FLIGHT[SIDES[level]]
    y = LEVELS[level]
    steps = [(*at(CHORD, START - i), y + 1 + i) for i in range(5)]
    well = [(dx, dz) for dx, dz, _ in steps[1:4]]
    return steps, facing, well

tower = [
    # The foot: a plinth of dressed stone where the ground falls away, then the tower, tapering as it rises.
    {"type": "cylinder", "id": "plinth", "axis": "y", "center": [TX, TZ], "from": G - 6, "to": G, "radius": R0 + 0.6, "shell": STONE,
     "carve": False, "caps": {"from": False, "to": False}},
    {"type": "cylinder", "id": "tower", "axis": "y", "center": [TX, TZ], "from": G, "to": T_TOP, "radius": R0, "radiusEnd": R1, "shell": WHITE,
     # Small windows on the diagonals at each level, then two red bands, each centred on a floor: inside, the band
     # shows only as a red skirting above the floor and a cornice below it.
     # The watch room's sit a block lower, clear of the cornice under the gallery.
     "windows": [*[{"angle": a, "along": [y + 2, y + 3] if k < 4 else [y + 1, y + 2], "block": GLASS} for k, y in enumerate(LEVELS[:5]) for a in ([36, 54], [126, 144])],
                 {"along": [LEVELS[2] - 1, LEVELS[2] + 1], "block": RED}, {"along": [LEVELS[4] - 1, LEVELS[4] + 1], "block": RED}],
     "caps": {"from": True, "to": True, "block": "minecraft:smooth_stone"}, "over": ["plinth"]},
]

# Floors: flagstones at the foot, boards on the landings, each with its stairwell left open.
floors = []
for k, y in enumerate(LEVELS[:5]):
    cells = interior(radius_at(y))
    if k > 0:
        below, _, well = flight(k - 1)
        cells -= set(well) | {below[4][:2]}
    floors += disc_rows(f"floor-{k}", y, cells, FLAG if k == 0 else PLANKS, ["tower"])
stairs = []
stringers = []
for k in range(5):
    steps, facing, _ = flight(k)
    stairs += [cell(f"step-{k}-{i}", TX + dx, y, TZ + dz, f"minecraft:spruce_stairs[facing={facing},half=bottom]") for i, (dx, dz, y) in enumerate(steps)]
    # A stringer under the flight: an upside-down stair beneath each step, so the steps are one solid flight, not
    # blocks that only touch at their corners.
    back = {"north": "south", "south": "north", "east": "west", "west": "east"}[facing]
    stringers += [cell(f"stringer-{k}-{i}", TX + dx, y - 1, TZ + dz, f"minecraft:spruce_stairs[facing={back},half=top]") for i, (dx, dz, y) in enumerate(steps) if i > 0]
# The last step and the well into the lantern room are cut through the gallery floor, once it is laid.
lantern_entry = [{**stairs.pop(), "over": ["gallery"]}]
lantern_entry += [cell(f"lantern-well-{i}", TX + dx, T_TOP, TZ + dz, "minecraft:air") for i, (dx, dz) in enumerate(flight(4)[2])]

# The top: a black gallery with a railing round the lantern, the glazed lantern, a copper dome, a vent and a vane.
GALLERY_R = 8.5  # a walkway two blocks wide round the lantern
LANTERN_R = 5
rail = []
def closed(cells):
    """A railing's cells with every diagonal step filled in on its inner side: bars or fences that meet only at a
    corner leave a gap a player walks through."""
    out = set(cells)
    for p, q in sorted(cells):
        for dp, dq in ((1, 1), (1, -1)):
            if (p + dp, q + dq) in cells and (p + dp, q) not in out and (p, q + dq) not in out:
                out.add(min((p + dp, q), (p, q + dq), key=lambda c: math.hypot(*c)))
    return out


ring = closed(edge(GALLERY_R))
for p, q in sorted(ring):
    links = {d: (p + dx, q + dz) in ring for d, (dx, dz) in {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0)}.items()}
    state = ",".join(f"{d}={'true' if v else 'false'}" for d, v in links.items())
    rail.append(cell(f"rail-{p}-{q}", TX + p, T_TOP + 1, TZ + q, f"minecraft:iron_bars[{state}]"))
top = [
    # The gallery stands on a cornice stepping out over three courses from the tower's face.
    *[part for k, outer in enumerate((5.6, 6.9, 8.0), start=1)
      for part in disc_rows(f"cornice-{k}", T_TOP - 4 + k,
                            {(p, q) for p in range(-9, 10) for q in range(-9, 10) if inside(p, q, outer) and not inside(p, q, radius_at(T_TOP - 4 + k))}, BLACK, None)],
    {"type": "cylinder", "id": "gallery", "axis": "y", "center": [TX, TZ], "from": T_TOP, "to": T_TOP, "radius": GALLERY_R, "shell": BLACK,
     "carve": False, "caps": {"from": True, "to": True, "block": "minecraft:smooth_stone"}, "over": ["tower"]},
    *rail,
    {"type": "cylinder", "id": "lantern", "axis": "y", "center": [TX, TZ], "from": T_TOP + 1, "to": T_TOP + 4, "radius": LANTERN_R, "shell": BLACK,
     "windows": [{"angle": [12, 78], "along": [T_TOP + 2, T_TOP + 4], "block": GLASS}, {"angle": [102, 168], "along": [T_TOP + 2, T_TOP + 4], "block": GLASS}],
     "caps": {"from": False, "to": False}},
    {"type": "sphere", "id": "dome", "center": [TX, T_TOP + 5, TZ], "radius": LANTERN_R, "half": "up", "shell": COPPER},
    cell("vent", TX, T_TOP + 11, TZ, BLACK),
    box("vane", (TX, T_TOP + 12, TZ), (TX, T_TOP + 13, TZ), "minecraft:lightning_rod[facing=up]"),
    # A door in the west side of the lantern, out onto the gallery and the sunset.
    cell("gallery-door", TX - LANTERN_R, T_TOP + 1, TZ, "minecraft:spruce_door[facing=west,half=lower,hinge=left,open=false]", over=["lantern"]),
    cell("gallery-door-top", TX - LANTERN_R, T_TOP + 2, TZ, "minecraft:spruce_door[facing=west,half=upper,hinge=left,open=false]", over=["lantern"]),
]

# Banisters round each stairwell, on the floor it opens in: every side of the well, corners too (fences that meet only
# at a corner leave a gap), but the top step and the cells either side of it, the way on and off the stair.
banisters = []
banister_cells = {}
for k in range(5):
    steps, _, well = flight(k)
    y = LEVELS[k + 1]
    floor_cells = interior(radius_at(y)) if k < 4 else interior(LANTERN_R)
    rail = {(dx + ox, dz + oz) for dx, dz in well for ox in (-1, 0, 1) for oz in (-1, 0, 1)}  # corners too: no gaps
    head = steps[4][:2]
    rail = {c for c in rail if c in floor_cells and c not in well and abs(c[0] - head[0]) + abs(c[1] - head[1]) > 1}
    banister_cells[k + 1] = rail
    for p, q in sorted(rail):
        links = ",".join(f"{d}={'true' if (p + ox, q + oz) in rail else 'false'}" for d, (ox, oz) in
                         (("east", (1, 0)), ("north", (0, -1)), ("south", (0, 1)), ("west", (-1, 0))))
        banisters.append(cell(f"banister-{k}-{p}-{q}", TX + p, y + 1, TZ + q, f"minecraft:spruce_fence[{links},waterlogged=false]"))

# ---------------------------------------------------------------- the cottage
CX0, CX1 = 81, 91  # outer walls, west and east
CZ0, CZ1 = 83, 101  # outer walls, north and south (the gable ends)
HALL = (91, 93)  # the hall runs west from the front door to the tower
cottage = [
    box("cottage-footing", (CX0, G - 4, CZ0), (CX1, G, CZ1), STONE),
    box("cottage-floor", (CX0 + 1, G, CZ0 + 1), (CX1 - 1, G, CZ1 - 1), PLANKS, over=["cottage-footing"]),
    box("wall-west", (CX0, G + 1, CZ0 + 1), (CX0, G + 5, CZ1 - 1), WHITE),
    box("wall-east", (CX1, G + 1, CZ0 + 1), (CX1, G + 5, CZ1 - 1), WHITE),
    {"type": "gableEnd", "id": "gable-north", "z": CZ0, "x": [CX0, CX1], "y0": G + 1, "eaveY": G + 5, "overhang": 1, "kind": "solid",
     "fill": WHITE, "glass": GLASS, "frame": WHITE, "every": 2, "transomEvery": 2},
    {"type": "gableEnd", "id": "gable-south", "z": CZ1, "x": [CX0, CX1], "y0": G + 1, "eaveY": G + 5, "overhang": 1, "kind": "solid",
     "fill": WHITE, "glass": GLASS, "frame": WHITE, "every": 2, "transomEvery": 2},
    box("ceiling", (CX0 + 1, G + 5, CZ0 + 1), (CX1 - 1, G + 5, CZ1 - 1), PLANKS),
    {"type": "gableRoof", "id": "roof", "x": [CX0, CX1], "z": [CZ0, CZ1], "eaveY": G + 5, "overhang": 1,
     "body": "minecraft:deepslate_tile_stairs", "snow": "minecraft:deepslate_tile_stairs", "trim": "minecraft:polished_blackstone_stairs",
     "ridgeBody": "minecraft:deepslate_tiles", "ridgeSnow": "minecraft:deepslate_tile_slab[type=bottom]"},
    # Partitions either side of the hall, with doorways at the east end.
    box("wall-kitchen", (CX0 + 1, G + 1, HALL[0] - 1), (CX1 - 1, G + 4, HALL[0] - 1), WHITE),
    box("wall-parlour", (CX0 + 1, G + 1, HALL[1] + 1), (CX1 - 1, G + 4, HALL[1] + 1), WHITE),
    box("door-kitchen", (CX1 - 2, G + 1, HALL[0] - 1), (CX1 - 2, G + 2, HALL[0] - 1), "minecraft:air"),
    # The back door, from the kitchen out to the garden.
    cell("back-door", 89, G + 1, CZ0, "minecraft:spruce_door[facing=north,half=lower,hinge=left,open=false]", over=["gable-north"]),
    cell("back-door-top", 89, G + 2, CZ0, "minecraft:spruce_door[facing=north,half=upper,hinge=left,open=false]", over=["gable-north"]),
    box("door-parlour", (CX1 - 2, G + 1, HALL[1] + 1), (CX1 - 2, G + 2, HALL[1] + 1), "minecraft:air"),
    box("front-door", (CX1, G + 1, 92), (CX1, G + 2, 92), "minecraft:air"),
    # The passage between the cottage and the tower, under the eaves of the cottage roof.
    box("passage", (TX + 7, G, HALL[0] - 1), (CX0, G + 4, HALL[1] + 1), WHITE, over=["tower", "plinth", "cottage-footing", "wall-west"]),
    box("passage-floor", (TX + 7, G, HALL[0]), (CX0, G, HALL[1]), PLANKS, over=["passage"]),
    box("passage-way", (TX + 5, G + 1, HALL[0]), (CX0, G + 3, HALL[1]), "minecraft:air"),
]

# ---------------------------------------------------------------- the office
LAMP_IDLE = "agentcraft:status_lamp[status=idle]"
LAMP_OFF = "agentcraft:status_lamp[status=off]"
DESK = "minecraft:spruce_slab"
MONITOR_FACING = {"south": "north", "north": "south", "east": "west", "west": "east"}


def desk(agent, level, side):
    """A desk against the wall on `side` of a landing, the keeper looking out at it."""
    dx, dz = {"north": (0, -4), "south": (0, 4), "east": (4, 0), "west": (-4, 0)}[side]
    return {"type": "deskRow", "id": f"desk-{agent}", "floor": LEVELS[level], "at": [TX + dx, TZ + dz], "spacing": 4, "agents": [agent], "look": side,
            "desk": DESK, "monitor": "minecraft:black_concrete", "chair": CHAIR,
            "screen": {"block": f"agentcraft:monitor[facing={MONITOR_FACING[side]},lit=true]", "width": 3, "height": 2}, "lamp": LAMP_IDLE}


office = [
    # The way in: the spawn on the path outside the front door, the entrance just inside it.
    {"type": "spot", "id": "spawn", "anchor": "spawn", "at": [CX1 + 2, 92], "look": "west"},
    {"type": "spot", "id": "entrance", "anchor": "entrance", "at": [CX1 - 2, 92], "look": "west"},
    # Kitchen: the big table, a chair at each end and two down each side.
    {"type": "seatedTable", "id": "meeting", "station": "meeting", "chair": CHAIR,
     "table": {"from": [84, 86], "to": [87, 88], "block": "minecraft:spruce_slab[type=top]"},
     "seats": [[83, 87, "east"], [88, 87, "west"], [84, 85, "south"], [87, 85, "south"], [84, 89, "north"], [87, 89, "north"]]},
    # Parlour: armchairs round a low table, facing the fire.
    {"type": "seatedTable", "id": "lounge", "station": "lounge", "chair": ARMCHAIR,
     "table": {"from": [85, 97], "to": [87, 98], "block": "minecraft:dark_oak_slab[type=bottom]"},
     "seats": [[84, 97, "east"], [84, 99, "east"], [88, 97, "west"], [88, 99, "west"], [85, 95, "south"], [87, 95, "south"]]},
    # The foot of the tower: the log books and the telegraph by the south wall, the podium by the west wall.
    {"type": "station", "id": "library", "station": "library", "at": [TX - 2, TZ + 3], "look": "south", "block": "agentcraft:memory_archive[facing=north]", "binding": "shared"},
    {"type": "station", "id": "terminal", "station": "terminal", "at": [TX + 2, TZ + 3], "look": "south", "block": "agentcraft:console_terminal[facing=north]"},
    {"type": "spot", "id": "user", "anchor": "user", "at": [TX - 5, TZ], "look": "east"},
    {"type": "podium", "id": "podium", "at": [TX - 4, TZ], "block": "agentcraft:decision_podium[facing=west,open=false]"},
    {"type": "device", "id": "decisions-lamp", "at": [TX - 4, G + 4, TZ], "block": LAMP_OFF, "binding": "decisions"},
    # Three landings, two desks on each, on the walls the stair leaves free.
    desk("marlow", 1, "south"), desk("juniper", 1, "east"),
    desk("kit", 2, "east"), desk("wren", 2, "north"),
    desk("rowan", 3, "north"), desk("tove", 3, "west"),
    # The watch room: the test bench and the merge station on the south side, the task board on the west wall.
    {"type": "station", "id": "testbench", "station": "testbench", "floor": LEVELS[4], "at": [TX - 1, TZ + 2], "look": "south", "block": "minecraft:lectern"},
    {"type": "station", "id": "mergestation", "station": "mergestation", "floor": LEVELS[4], "at": [TX + 1, TZ + 2], "look": "south",
     "block": "agentcraft:merge_station[facing=north,active=false]"},
    {"type": "device", "id": "merge-lamp", "at": [TX + 1, LEVELS[4] + 2, TZ + 3], "block": LAMP_OFF, "binding": "merge"},
    *[{"type": "device", "id": f"ci-lamp-{i + 1}", "at": [TX - 2 + i, LEVELS[4] + 4, TZ + 4], "block": LAMP_IDLE, "binding": f"ci:#{i + 1}"} for i in range(3)],
    {"type": "taskWall", "id": "task-wall", "x": TX - 4, "z": [TZ - 1, TZ + 1], "y": [LEVELS[4] + 2, LEVELS[4] + 3], "block": "agentcraft:task_board[facing=east]", "facing": "east"},
    # The lantern: the lens on its pedestal in the middle, the goal lamp at its heart.
    cell("lens-pedestal", TX, T_TOP + 1, TZ, "minecraft:waxed_copper_block"),
    cell("lens", TX, T_TOP + 2, TZ, "minecraft:sea_lantern"),
    {"type": "device", "id": "goal-lamp", "at": [TX, T_TOP + 3, TZ], "block": LAMP_IDLE, "binding": "goal:atrium"},
    {"type": "spot", "id": "atrium", "anchor": "goal_atrium", "floor": T_TOP, "at": [TX, TZ + 2], "look": "north"},
]

# ---------------------------------------------------------------- finishing details
shelf_rng = random.Random(7)


def books(facing):
    slots = ",".join(f"slot_{i}_occupied={'true' if shelf_rng.random() < 0.65 else 'false'}" for i in range(6))
    return f"minecraft:chiseled_bookshelf[facing={facing},{slots}]"


def facing_in(p, q):
    """The side of a cell against the tower wall that faces the room."""
    return ("west" if p > 0 else "east") if abs(p) >= abs(q) else ("north" if q > 0 else "south")


def by_wall(level, a0, a1):
    """Cells of a level that stand against the tower wall, between bearings a0 and a1 (degrees: 0 east, 90 south)."""
    room = interior(radius_at(LEVELS[level] + 1))
    out = []
    for p, q in sorted(room):
        if all((p + dx, q + dz) in room for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            continue
        a = math.degrees(math.atan2(q, p))
        if a0 <= a <= a1 or a0 <= a + 360 <= a1:
            out.append((p, q))
    return out


def along_wall(id, level, a0, a1, block, height=1):
    """Furniture against the tower wall: `block` a function of the facing, or a block for every cell."""
    y = LEVELS[level] + 1
    out = []
    for p, q in by_wall(level, a0, a1):
        if (p, q) in banister_cells.get(level, ()):
            continue
        b = block(facing_in(p, q)) if callable(block) else block
        out.append(box(f"{id}-{p}-{q}", (TX + p, y, TZ + q), (TX + p, y + height - 1, TZ + q), b))
    return out


details = [
    # The keeper's office: log books on shelves round the south-west and north-west walls, a lantern overhead.
    *along_wall("log-shelves", 0, 110, 160, books, 2),
    *along_wall("chart-shelves", 0, 200, 245, books, 2),
    # Lanterns hung from each ceiling, as keepers lit them; the stores and keepsakes of each landing by its walls.
    *[cell(f"tower-lamp-{k}", TX, LEVELS[k] + 4, TZ, "minecraft:lantern[hanging=true]") for k in range(5)],
    *along_wall("oil-store", 1, 290, 320, "minecraft:barrel[facing=up]"),
    *along_wall("kit-chest", 1, 110, 130, "minecraft:chest[facing=north]"),
    *along_wall("bunk-books", 2, 25, 45, books, 2),
    *along_wall("bunk-plant", 2, 205, 215, "minecraft:potted_fern"),
    *along_wall("sea-chest", 3, 290, 310, "minecraft:barrel[facing=up]"),
    *along_wall("rope-store", 3, 120, 140, "minecraft:barrel[facing=up]"),
    # The watch room: the chart table, the logbook shelf, the fog bell's pull.
    *along_wall("chart-table", 4, 290, 305, "minecraft:cartography_table"),
    *along_wall("watch-books", 4, 25, 40, books, 2),
    cell("watch-bell", TX - 2, LEVELS[4] + 4, TZ - 2, "minecraft:bell[attachment=ceiling,facing=north]"),

    # The cottage. Windows: panes in the side walls and the north gable, a fanlight over the front door.
    *[box(f"window-{side}-{z0}", (x, G + 2, z0), (x, G + 3, z0 + 2), "minecraft:glass_pane[north=true,south=true]", over=[f"wall-{side}"])
      for side, x in (("west", CX0), ("east", CX1)) for z0 in (85, 96)],
    box("window-north", (85, G + 2, CZ0), (87, G + 3, CZ0), "minecraft:glass_pane[east=true,west=true]", over=["gable-north"]),
    box("fanlight", (CX1, G + 3, 92), (CX1, G + 3, 92), "minecraft:glass_pane[north=true,south=true]", over=["wall-east"]),
    # Kitchen: the range and stores along the east wall, a sink, a lamp over the table.
    box("counter", (90, G + 1, 84), (90, G + 1, 86), "minecraft:spruce_slab[type=top]"),
    cell("range", 90, G + 1, 88, "minecraft:smoker[facing=west,lit=true]"),
    cell("sink", 90, G + 1, 87, "minecraft:water_cauldron[level=3]"),
    cell("crockery", 90, G + 2, 84, "minecraft:decorated_pot[facing=west]"),
    cell("bread-bin", 90, G + 2, 85, "minecraft:barrel[facing=west]"),
    box("kitchen-dresser", (82, G + 1, 84), (82, G + 2, 85), "minecraft:barrel[facing=east]"),
    cell("kitchen-lamp", 86, G + 4, 87, "minecraft:lantern[hanging=true]"),
    cell("hall-lamp", 86, G + 4, 92, "minecraft:lantern[hanging=true]"),
    cell("hall-chest", 82, G + 1, 91, "minecraft:chest[facing=east]"),
    cell("hall-plant", 82, G + 1, 93, "minecraft:potted_azalea_bush"),
    # Parlour: the fire in the south gable, its chimney up through the roof, a rug, shelves, a lamp.
    box("hearth", (84, G + 1, 100), (88, G + 3, 100), STONE),
    box("mantel", (84, G + 4, 100), (88, G + 4, 100), "minecraft:spruce_slab[type=bottom]"),
    box("chimney", (85, G + 1, CZ1), (87, G + 12, CZ1 + 1), STONE, over=["gable-south", "roof"]),
    box("flue", (86, G + 2, CZ1), (86, G + 12, CZ1), "minecraft:air"),
    box("firebox", (86, G + 1, 100), (86, G + 2, 100), "minecraft:air"),
    cell("fire", 86, G + 1, CZ1, "minecraft:campfire[lit=true,facing=north]", over=["chimney"]),
    *[cell(f"rug-{x}-{z}", x, G + 1, z, "minecraft:red_carpet") for x, z in [(84, 96), (85, 96), (86, 96), (87, 96), (88, 96), (84, 98), (88, 98), (85, 99), (86, 99), (87, 99)]],
    box("parlour-shelves", (82, G + 1, 99), (82, G + 2, 100), books("east")),  # beside the window, not in front of it
    cell("parlour-lamp", 86, G + 4, 97, "minecraft:lantern[hanging=true]"),
    cell("parlour-plant", 90, G + 1, 95, "minecraft:potted_fern"),

    # Outside: a bench by the door, lamp posts down the path, the fog bell on the cliff, a walled garden.
    cell("door-bench", CX1 + 1, G + 1, 95, "minecraft:spruce_stairs[facing=west,half=bottom]"),
    cell("door-bench-2", CX1 + 1, G + 1, 96, "minecraft:spruce_stairs[facing=west,half=bottom]"),
    *[box(f"lamp-post-{i}", (x, G + 1, z), (x, G + 2, z), "minecraft:dark_oak_fence") for i, (x, z) in enumerate([(CX1 + 3, 90), (101, 96)])],
    *[cell(f"lamp-{i}", x, G + 3, z, "minecraft:lantern") for i, (x, z) in enumerate([(CX1 + 3, 90), (101, 96)])],
    box("bell-frame", (TX - 3, G + 1, TZ + 9), (TX - 3, G + 3, TZ + 9), "minecraft:dark_oak_fence"),
    box("bell-frame-2", (TX + 1, G + 1, TZ + 9), (TX + 1, G + 3, TZ + 9), "minecraft:dark_oak_fence"),
    box("bell-beam", (TX - 3, G + 4, TZ + 9), (TX + 1, G + 4, TZ + 9), "minecraft:dark_oak_slab[type=bottom]"),
    cell("fog-bell", TX - 1, G + 3, TZ + 9, "minecraft:bell[attachment=ceiling,facing=east]"),
]

# The walled kitchen garden north of the cottage: a dry-stone wall, beds of vegetables, a gate to the cottage.
GX0, GX1, GZ0, GZ1 = 82, 96, 70, 80
garden = [
    *[box(f"garden-wall-{i}", a, b, "minecraft:mossy_cobblestone") for i, (a, b) in enumerate([
        ((GX0, G + 1, GZ0), (GX1, G + 1, GZ0)), ((GX0, G + 1, GZ0 + 1), (GX0, G + 1, GZ1)), ((GX1, G + 1, GZ0 + 1), (GX1, G + 1, GZ1)),
        ((GX0 + 1, G + 1, GZ1), (88, G + 1, GZ1)), ((90, G + 1, GZ1), (GX1 - 1, G + 1, GZ1))])],
    # Beds either side of the path down the middle.
    *[box(f"bed-{z}-{x0}", (x0, G, z), (x1, G, z), "minecraft:farmland[moisture=7]") for z in range(GZ0 + 2, GZ1 - 1, 2) for x0, x1 in ((GX0 + 2, 88), (90, GX1 - 2))],
    *[box(f"crop-{z}-{x0}", (x0, G + 1, z), (x1, G + 1, z), crop) for z, crop in zip(range(GZ0 + 2, GZ1 - 1, 2),
      ["minecraft:potatoes[age=7]", "minecraft:carrots[age=7]", "minecraft:beetroots[age=3]", "minecraft:wheat[age=6]"]) for x0, x1 in ((GX0 + 2, 88), (90, GX1 - 2))],
    # The path runs from the kitchen's back door, through the gate, down between the beds to a bench by the far wall.
    box("garden-path", (89, G, GZ0 + 2), (89, G, GZ1 + 2), "minecraft:gravel"),
    cell("garden-bench", 89, G + 1, GZ0 + 1, "minecraft:spruce_stairs[facing=north,half=bottom]"),
    cell("water-butt", GX1 - 1, G + 1, GZ1 - 1, "minecraft:water_cauldron[level=3]"),
    cell("compost", GX0 + 1, G + 1, GZ1 - 1, "minecraft:composter[level=5]"),
]

# ---------------------------------------------------------------- the island
rng = random.Random(5)


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


IX, IZ = 92, 96  # the island's middle


def island_radius(a):
    return 34 + 4 * math.sin(3 * a + 1.0) + 2.5 * math.sin(5 * a + 2.2) + 1.5 * math.sin(9 * a + 0.4)


def coast(x):
    """The mainland's shore across the strait, along the north of the volume."""
    return 24 + 8 * math.sin(x / 26 + 0.6) + 4 * math.sin(x / 11)


def ground(x, z):
    a = math.atan2(z - IZ, x - IX)
    d = math.hypot(x - IX, z - IZ) / island_radius(a)
    if d < 0.74:
        h = G + 1.2 * math.sin(x / 9) * math.cos(z / 11) * smoothstep((0.74 - d) / 0.2) - 1.5 * smoothstep((d - 0.55) / 0.19)
    elif d < 1.0:
        t = (d - 0.74) / 0.26
        h = G - 1.5 - (G - 1.5 - (SEA - 3)) * t ** 2.2  # grassy shoulder, then the cliff
    else:
        h = SEA - 3 - 9 * smoothstep((d - 1.0) * 2.5)
    # The mainland: rolling hills over cliffs.
    inland = coast(x) - z
    if inland > -6:
        land = SEA + 16 + 4 * math.sin(x / 17) * math.cos(z / 13) + 0.25 * max(inland, 0)
        cliff = SEA - 8 + (land - SEA + 8) * smoothstep((inland + 6) / 10)
        h = max(h, cliff)
    return min(max(h, 4.0), 80.0)


N = 97
grid = [[round(ground(c * (W - 1) / (N - 1), r * (L - 1) / (N - 1)), 1) for c in range(N)] for r in range(N)]

# The path from the front door across the island and down the east cliff to the jetty, in two zigzags.
JETTY = (128, 112)
path_pts = [(CX1 + 1, 92), (104, 94), (114, 100), (121, 96), (126, 104), (JETTY[0] - 2, JETTY[1])]
path_y = [[0, G], [0.2, G], [0.38, G - 3], [0.58, SEA + 9], [0.8, SEA + 4], [1, SEA + 1]]

terrain = {
    "type": "terrain", "id": "island", "x": [0, W - 1], "z": [0, L - 1], "grid": grid,
    "noise": {"amplitude": 1.2, "scale": 7},
    "ridged": {"amplitude": 3, "scale": 9, "above": SEA + 2},
    # Sea stacks off the island: tall, flat-topped, sheer.
    "peaks": [{"at": [150, 146], "height": 32, "radius": 8, "sharpness": 0.15}, {"at": [138, 160], "height": 24, "radius": 5, "sharpness": 0.18},
              {"at": [40, 150], "height": 30, "radius": 8, "sharpness": 0.15}, {"at": [32, 84], "height": 20, "radius": 5, "sharpness": 0.2},
              {"at": [160, 80], "height": 18, "radius": 6, "sharpness": 0.2}],
    "flats": [{"x": [TX - 8, GX1 + 2], "z": [GZ0 - 2, CZ1 + 4], "y": G, "margin": 5}],
    "trails": [{"points": [list(p) for p in path_pts], "y": path_y, "width": 2, "margin": 2, "surface": "minecraft:gravel", "steps": "minecraft:cobblestone_stairs",
                "parapet": "minecraft:mossy_cobblestone_wall"}],
    "sea": {"level": SEA, "bed": "minecraft:gravel", "beach": {"block": "minecraft:gravel", "above": 1}},
    "depth": 6,
    "surface": "minecraft:grass_block", "rock": "minecraft:stone", "rockAlt": "minecraft:tuff", "base": "minecraft:stone", "rockSlope": 3,
}

jetty = [
    box("jetty", (JETTY[0] - 2, SEA - 4, JETTY[1] - 1), (JETTY[0] + 8, SEA + 1, JETTY[1] + 1), STONE),
    box("jetty-top", (JETTY[0] - 2, SEA + 1, JETTY[1] - 1), (JETTY[0] + 8, SEA + 1, JETTY[1] + 1), "minecraft:smooth_stone", over=["jetty"]),
    *[cell(f"bollard-{i}", JETTY[0] + x, SEA + 2, JETTY[1] + s, "minecraft:polished_blackstone_wall") for i, (x, s) in enumerate([(2, 1), (7, 1), (7, -1)])],
    {"type": "hull", "id": "boat", "bow": "east", "stern": JETTY[0], "length": 9, "center": JETTY[1] + 4, "beam": 5,
     "keelY": SEA - 1, "deckY": SEA + 1, "bowLength": 4, "shell": "minecraft:blue_concrete", "deck": PLANKS,
     "stripes": [{"y": SEA + 1, "block": WHITE}]},
]

cameras = [
    # From the sea to the south-east, the tower against the sunset; from the jetty, looking up; on the path to the door.
    {"type": "camera", "id": "hero", "name": "hero", "at": [150.5, G + 4, 124.5], "yaw": 112, "pitch": -5},
    {"type": "camera", "id": "jetty-view", "name": "jetty", "at": [JETTY[0] + 6.5, SEA + 3, JETTY[1] + 6.5], "yaw": 113, "pitch": -24},
    {"type": "camera", "id": "approach", "name": "approach", "at": [100.5, G + 2.6, 94.5], "yaw": 95, "pitch": 0},
    {"type": "camera", "id": "gallery-view", "name": "gallery", "at": [TX - 6.5, T_TOP + 2.6, TZ + 0.5], "yaw": -100, "pitch": 18},
    {"type": "camera", "id": "kitchen-view", "name": "kitchen", "at": [CX1 - 1.5, G + 3.4, 84.5], "yaw": 45, "pitch": 25},
    {"type": "camera", "id": "parlour-view", "name": "parlour", "at": [CX1 - 1.5, G + 3.4, 95.5], "yaw": 45, "pitch": 25},
    {"type": "camera", "id": "office-view", "name": "office", "at": [TX + 5.5, G + 3, TZ + 0.5], "yaw": 90, "pitch": 15},
    *[{"type": "camera", "id": f"landing-{k}", "name": f"landing-{k}", "at": [TX - 2.5, LEVELS[k] + 3.4, TZ - 2.5], "yaw": -45, "pitch": 25} for k in (1, 2, 3)],
    {"type": "camera", "id": "watch-view", "name": "watch", "at": [TX + 3.5, LEVELS[4] + 3.4, TZ + 1.5], "yaw": 100, "pitch": 25},
    {"type": "camera", "id": "lantern-view", "name": "lantern", "at": [TX + 2.5, T_TOP + 2.6, TZ + 2.5], "yaw": 135, "pitch": 10},
]

design = {
    "name": "lighthouse",
    "version": 1,
    "seed": 5,
    "size": [W, H, L],
    "floorY": G,
    "shell": {"kind": "none"},
    "atmosphere": {"biome": "minecraft:plains", "seaBiome": "minecraft:cold_ocean", "weather": "clear", "time": 12400},
    "surroundings": {"sea": {"level": SEA, "floor": "minecraft:gravel"}},
    # A player must be able to walk all of it without jumping: every room, out round the gallery, down to the jetty.
    "walk": {"to": [{"name": "gallery", "at": [TX - LANTERN_R - 2, T_TOP + 1, TZ]}, {"name": "jetty", "at": [JETTY[0] + 3, SEA + 2, JETTY[1]]}]},
    "parts": [terrain, *tower, *floors, *stairs, *stringers, *top, *lantern_entry, *banisters, *cottage, *office, *details, *garden, *jetty, *cameras],
}

out = f"{root}/designs/lighthouse/v1.json"
parts = design.pop("parts")
lines = ["{"]
for k, v in design.items():
    lines.append(f'  "{k}": {json.dumps(v, separators=(", ", ": "))},')
lines.append('  "parts": [')
for i, p in enumerate(parts):
    comma = "," if i < len(parts) - 1 else ""
    if p["type"] == "terrain":
        p = dict(p)
        g = p.pop("grid")
        head = json.dumps(p, separators=(", ", ": "))
        rows = ",\n".join("        " + json.dumps(r, separators=(",", ":")) for r in g)
        lines.append("    " + head[:-1] + ', "grid": [\n' + rows + "\n    ]}" + comma)
    else:
        lines.append("    " + json.dumps(p, separators=(", ", ": ")) + comma)
lines += ["  ]", "}"]
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print(f"wrote {out} with {len(parts)} parts")
