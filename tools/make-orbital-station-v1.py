"""Author designs/orbital-station/v1.json: a modular space station in orbit over a night-side planet.

Laid out the way a station is used, and at a station's scale: narrow modules (a 7-block deck, a 3-block aisle you
brush past the chairs in), each only as long as what it holds. Four modules meet at a small node, all on one deck so
agents can walk everywhere:
- the command module is the workroom: the airlock and lockers at one end, the user's podium by the way in, a glass
  floor strip looking straight down at the planet, then three desks along each wall;
- the lab holds the data archive, comms console, lab bench and engineering bay, the task board on its end wall;
- the wardroom has the dining table (meetings), a library wall and a galley;
- the observation bulb is a small glass sphere laid out as a viewing lounge: armchairs round the glass facing out, a
  clear aisle to the glass floor at the front, and the goal projector, its hologram under the dome.
Outside, at full scale: a truss with four big solar wings, radiators, an antenna dish, navigation lights. The station
floats in a void world at night (stars, the moon), a planet far below written into the world save
(`surroundings.planet`).

Run from the repository root:  python tools/make-orbital-station-v1.py .
"""

import json
import math
import os
import random
import sys

root = sys.argv[1]

W, H, L = 220, 64, 220
CY = 30  # the modules' centre line
R = 4  # module radius: a 7-wide deck, 6 high
F = CY - 2  # the deck's floor layer; feet stand at 29
C = 110  # the node, at the middle of the volume in x and z

WHITE = "minecraft:white_concrete"
GREY = "minecraft:light_gray_concrete"
DECK = "minecraft:light_gray_concrete"
STAR = "minecraft:gray_stained_glass"  # the upper windows, to the stars
NADIR = "minecraft:glass"  # windows looking down at the planet
LIGHT = "minecraft:sea_lantern"
PLATING = {"blocks": ["minecraft:smooth_quartz", "minecraft:white_terracotta", "minecraft:calcite"], "amount": 0.22}  # hull panels and blankets
QUARTZ_STAIRS = "minecraft:smooth_quartz_stairs"
RAIL = "minecraft:iron_chain"


def box(id, a, b, block, over=None):
    p = {"type": "box", "id": id, "from": list(a), "to": list(b), "block": block}
    if over:
        p["over"] = over
    return p


def seat(look, block=QUARTZ_STAIRS):
    return f"{block}[facing={ {'north': 'south', 'south': 'north', 'east': 'west', 'west': 'east'}[look] },half=bottom]"


def module(id, axis, frm, to, center, caps, extra_windows=(), over=None):
    p = {"type": "cylinder", "id": id, "axis": axis, "center": center, "from": frm, "to": to, "radius": R, "shell": WHITE,
         "windows": [{"angle": [30, 60], "block": STAR}, {"angle": [72, 108], "block": NADIR}, *extra_windows],
         "floor": {"offset": F - CY, "block": DECK, "alt": "minecraft:smooth_stone"},
         "ribs": {"every": 4, "block": GREY}, "patches": PLATING, "caps": caps}
    if over:
        p["over"] = over
    return p


# ---------------------------------------------------------------- the structure
NODE_R = 5.5  # room for a walkway ring round the hatch in the middle
CMD = (84, 106)  # command module, along x, west of the node: 21 inside
WARD = (114, 128)  # wardroom, along x, east: 13 inside
LAB = (96, 106)  # lab, along z, north: 9 inside
OBS = (114, 120)  # the short tube to the observation bulb, along z, south
BULB = (C, CY, 126)
BULB_R = 6
POD_Y = F - 5  # the cupola's rim, just under the node
structure = [
    module("command", "x", CMD[0], CMD[1], [CY, C], {"from": True, "to": False}, [{"angle": [160, 180], "along": [88, 104], "block": NADIR}]),
    module("wardroom", "x", WARD[0], WARD[1], [CY, C], {"from": False, "to": True}),
    module("lab", "z", LAB[0], LAB[1], [C, CY], {"from": True, "to": False}, over=["command", "wardroom"]),
    {"type": "cylinder", "id": "obs-tube", "axis": "z", "center": [C, CY], "from": OBS[0], "to": OBS[1], "radius": 3.5, "shell": WHITE,
     "floor": {"offset": F - CY, "block": DECK}, "ribs": {"every": 3, "block": GREY}, "caps": {"from": False, "to": False}},
    {"type": "sphere", "id": "bulb", "center": list(BULB), "radius": BULB_R, "shell": GREY, "glass": NADIR, "meridians": 60,
     "floor": {"offset": F - CY, "block": DECK, "glass": NADIR, "glassFrom": -BULB_R}, "over": ["obs-tube"]},  # all glass: look straight down
    box("bulb-door", (C - 1, F + 1, OBS[1] - 1), (C + 1, F + 3, OBS[1] + 1), "minecraft:air"),
    # The node: a small drum standing on end, joining the four modules, with a ring of windows and a skylight.
    {"type": "cylinder", "id": "node", "axis": "y", "center": [C, C], "from": F - 3, "to": CY + R + 1, "radius": NODE_R, "shell": WHITE,
     "windows": [{"along": [CY + 2, CY + 3], "block": STAR}], "caps": {"from": True, "to": True, "block": STAR}, "patches": PLATING,
     "over": ["command", "wardroom", "lab", "obs-tube"]},
    {"type": "cylinder", "id": "node-floor", "axis": "y", "center": [C, C], "from": F, "to": F, "radius": NODE_R, "shell": DECK, "carve": False,
     "over": ["node"]},
    # The middle of the node's floor is glass, lit from underneath, so you look down the shaft to the cupola.
    {"type": "cylinder", "id": "node-glass", "axis": "y", "center": [C, C], "from": F, "to": F, "radius": 2, "shell": NADIR, "carve": False,
     "over": ["node-floor"]},
    # Hatchways from the node into each module.
    box("hatch-west", (C - 7, F + 1, C - 1), (C - 4, F + 3, C + 1), "minecraft:air"),
    box("hatch-east", (C + 4, F + 1, C - 1), (C + 7, F + 3, C + 1), "minecraft:air"),
    box("hatch-north", (C - 1, F + 1, C - 7), (C + 1, F + 3, C - 4), "minecraft:air"),
    box("hatch-south", (C - 1, F + 1, C + 4), (C + 1, F + 3, C + 7), "minecraft:air"),
    # The cupola: a glass bowl hanging under the node, reached by a ladder down a shaft from a hatch in the node's
    # glass floor. The station's best view of the planet; agents walk round the hatch, people climb down.
    {"type": "cylinder", "id": "cupola-shaft", "axis": "y", "center": [C, C], "from": POD_Y + 1, "to": F - 1, "radius": 1.5, "shell": WHITE,
     "caps": {"from": False, "to": False}, "over": ["node"]},
    {"type": "sphere", "id": "cupola", "center": [C, POD_Y, C], "radius": 5, "half": "down", "shell": WHITE, "glass": NADIR, "meridians": 90},
    {"type": "cylinder", "id": "cupola-ceiling", "axis": "y", "center": [C, C], "from": POD_Y, "to": POD_Y, "radius": 5, "shell": WHITE, "carve": False,
     "over": ["cupola"]},
    {"type": "cylinder", "id": "cupola-floor", "axis": "y", "center": [C, C], "from": POD_Y - 3, "to": POD_Y - 3, "radius": 3.5, "shell": NADIR, "carve": False,
     "over": ["cupola"]},
    box("cupola-pole", (C, POD_Y - 2, C - 1), (C, POD_Y - 1, C - 1), "minecraft:smooth_quartz"),
    *[box(f"ladder-{y}", (C, y, C), (C, y, C), "minecraft:ladder[facing=south]",
          over=["cupola-ceiling"] if y == POD_Y else (["node-floor", "node-glass"] if y == F else None)) for y in range(POD_Y - 2, F + 1)],
    *[box(f"cupola-light-{i}", (C + dx, POD_Y, C + dz), (C + dx, POD_Y, C + dz), LIGHT, over=["cupola-ceiling"])
      for i, (dx, dz) in enumerate([(3, 0), (-3, 0), (0, 3), (0, -3), (2, 2), (-2, 2), (2, -2), (-2, -2)])],
    # The airlock at the west end and the docked capsule beyond it.
    box("airlock-door-lower", (CMD[0], F + 1, C), (CMD[0], F + 1, C), "minecraft:iron_door[facing=east,half=lower,hinge=left,open=false]", over=["command"]),
    box("airlock-door-upper", (CMD[0], F + 2, C), (CMD[0], F + 2, C), "minecraft:iron_door[facing=east,half=upper,hinge=left,open=false]", over=["command"]),
    {"type": "cylinder", "id": "docking-ring", "axis": "x", "center": [CY, C], "from": CMD[0] - 1, "to": CMD[0] - 1, "radius": 2.5,
     "shell": "minecraft:iron_block", "carve": False},
    {"type": "cylinder", "id": "capsule", "axis": "x", "center": [CY, C], "from": CMD[0] - 2, "to": CMD[0] - 11, "radius": 3,
     "radiusEnd": 1.8, "shell": WHITE, "windows": [{"angle": [55, 80], "block": STAR}], "caps": {"from": False, "to": True, "block": "minecraft:blackstone"}},
    *[box(f"capsule-wing-{s}", (CMD[0] - 8, CY, C + s * 4), (CMD[0] - 4, CY, C + s * 7), "minecraft:daylight_detector") for s in (-1, 1)],
]

# ---------------------------------------------------------------- outside: truss, solar wings, radiators, antenna
TRUSS_Y = CY + R + 8
outside = [
    box("mast", (C - 1, CY + R + 2, C - 1), (C + 1, TRUSS_Y - 1, C + 1), GREY),
    # An open lattice: four corner beams, braced sides you can see through, cross members every 4.
    *[box(f"truss-{i}", (x, y, 30), (x, y, 190), GREY) for i, (x, y) in enumerate([(C - 2, TRUSS_Y), (C + 2, TRUSS_Y), (C - 2, TRUSS_Y + 3), (C + 2, TRUSS_Y + 3)])],
    *[box(f"truss-strut-{zz}-{x}", (x, TRUSS_Y + 1, zz), (x, TRUSS_Y + 2, zz), "minecraft:iron_bars") for zz in range(32, 190, 4) for x in (C - 2, C + 2)],
    *[box(f"truss-cross-{zz}-{y}", (C - 1, y, zz), (C + 1, y, zz), GREY) for zz in range(32, 190, 8) for y in (TRUSS_Y, TRUSS_Y + 3)],
]
for i, zc in enumerate([40, 180]):
    # Each wing: a boom out from the truss, and panels of cells either side of it, in blankets with gaps.
    struts = [f"truss-strut-{zc}-{C - 2}", f"truss-strut-{zc}-{C + 2}"] if (zc - 32) % 4 == 0 else None
    outside.append(box(f"boom-{i}", (50, TRUSS_Y + 1, zc), (170, TRUSS_Y + 1, zc), "minecraft:iron_block", over=struts))
    for x0, x1 in [(52, 77), (80, 106), (114, 140), (143, 168)]:
        outside.append(box(f"panel-{i}-{x0}-n", (x0, TRUSS_Y + 1, zc - 5), (x1, TRUSS_Y + 1, zc - 1), "minecraft:daylight_detector"))
        outside.append(box(f"panel-{i}-{x0}-s", (x0, TRUSS_Y + 1, zc + 1), (x1, TRUSS_Y + 1, zc + 5), "minecraft:daylight_detector"))
    outside.append(box(f"nav-port-{i}", (50, TRUSS_Y + 2, zc), (50, TRUSS_Y + 2, zc), "minecraft:pearlescent_froglight"))
    outside.append(box(f"nav-starboard-{i}", (170, TRUSS_Y + 2, zc), (170, TRUSS_Y + 2, zc), "minecraft:verdant_froglight"))
outside += [
    # Radiators: white panels hung off the truss.
    *[box(f"radiator-{i}", (C + 3, TRUSS_Y - 5, z0), (C + 3, TRUSS_Y - 1, z0 + 8), WHITE) for i, z0 in enumerate([62, 74, 138, 150])],
    # The antenna dish on its own mast above the wardroom.
    box("dish-mast", (124, CY + R + 1, C), (124, CY + R + 4, C), "minecraft:iron_bars"),
    {"type": "sphere", "id": "dish", "center": [124, CY + R + 8, C], "radius": 3, "half": "down", "shell": WHITE},
    box("dish-feed", (124, CY + R + 5, C), (124, CY + R + 8, C), "minecraft:end_rod[facing=up]", over=["dish"]),
    box("beacon-light", (C, CY + R + 2, C), (C, CY + R + 2, C), LIGHT, over=["mast"]),
]

# ---------------------------------------------------------------- outside details
PIPE = "minecraft:lightning_rod"  # copper fluid lines
HANDRAIL = "minecraft:iron_chain"
greebles = [
    # Fluid lines along the upper flanks of the long modules, and handrails along their sides, as spacewalkers use.
    *[box(f"pipe-cmd-{s}", (CMD[0] + 2, CY + 3, C + s * 4), (CMD[1] - 3, CY + 3, C + s * 4), f"{PIPE}[facing=east]", over=["command"]) for s in (-1, 1)],
    *[box(f"pipe-ward-{s}", (WARD[0] + 3, CY + 3, C + s * 4), (WARD[1] - 1, CY + 3, C + s * 4), f"{PIPE}[facing=east]", over=["wardroom"]) for s in (-1, 1)],
    *[box(f"rail-cmd-{s}", (CMD[0] + 1, CY, C + s * 5), (CMD[1] - 3, CY, C + s * 5), f"{HANDRAIL}[axis=x]", over=["command"]) for s in (-1, 1)],
    *[box(f"rail-ward-{s}", (WARD[0] + 3, CY, C + s * 5), (WARD[1] - 1, CY, C + s * 5), f"{HANDRAIL}[axis=x]", over=["wardroom"]) for s in (-1, 1)],
    *[box(f"rail-lab-{s}", (C + s * 5, CY, LAB[0] + 1), (C + s * 5, CY, LAB[1] - 3), f"{HANDRAIL}[axis=z]", over=["lab"]) for s in (-1, 1)],
    # A robotic arm on top of the command module: a base, a boom up, an elbow, a long boom aft, a wrist and a grapple.
    box("arm-base", (100, CY + R + 1, C), (100, CY + R + 1, C), "minecraft:iron_block", over=["command"]),
    box("arm-boom-1", (100, CY + R + 2, C), (100, CY + R + 4, C), WHITE),
    box("arm-elbow", (100, CY + R + 5, C), (100, CY + R + 5, C), "minecraft:iron_block"),
    box("arm-boom-2", (90, CY + R + 5, C), (99, CY + R + 5, C), WHITE),
    box("arm-band", (95, CY + R + 5, C), (95, CY + R + 5, C), "minecraft:blue_concrete", over=["arm-boom-2"]),
    box("arm-wrist", (89, CY + R + 5, C), (89, CY + R + 5, C), "minecraft:iron_block"),
    box("arm-grapple", (89, CY + R + 4, C), (89, CY + R + 4, C), "minecraft:observer[facing=up]"),
    # The truss: a cable tray down its middle, and equipment boxes mounted along it.
    box("cable-tray", (C, TRUSS_Y + 1, 31), (C, TRUSS_Y + 1, 189), f"{HANDRAIL}[axis=z]", over=["boom-0", "boom-1"]),
    *[box(f"oru-{z0}", (C - 4, TRUSS_Y, z0 + 1), (C - 3, TRUSS_Y + 1, z0 + 3), "minecraft:light_gray_concrete") for z0 in (52, 92, 126, 162)],
    *[box(f"oru-panel-{z0}", (C - 5, TRUSS_Y + 1, z0 + 2), (C - 5, TRUSS_Y + 1, z0 + 2), "minecraft:iron_trapdoor[facing=west,half=bottom,open=true]") for z0 in (52, 92, 126, 162)],
    # Antennas off the module ends, strobes at the wing tips, thruster nozzles on the capsule.
    box("antenna-ward", (WARD[1] + 1, CY + 2, C), (WARD[1] + 2, CY + 2, C), "minecraft:end_rod[facing=east]"),
    box("antenna-ward-2", (WARD[1] + 1, CY - 1, C + 1), (WARD[1] + 1, CY - 1, C + 1), "minecraft:end_rod[facing=east]"),
    box("antenna-lab", (C, CY + 2, LAB[0] - 2), (C, CY + 2, LAB[0] - 1), "minecraft:end_rod[facing=north]"),
    *[box(f"strobe-{i}-{x}-{s}", (x, TRUSS_Y + 2, zc + s * 6), (x, TRUSS_Y + 2, zc + s * 6), "minecraft:end_rod[facing=up]")
      for i, zc in enumerate([40, 180]) for x in (50, 170) for s in (-1, 1)],
    *[box(f"thruster-{dy}-{dz}", (CMD[0] - 12, CY + dy, C + dz), (CMD[0] - 12, CY + dy, C + dz), "minecraft:cauldron") for dy, dz in [(1, 0), (-1, 0), (0, 1), (0, -1)]],
]

# ---------------------------------------------------------------- the office
SCREEN = {"width": 3, "height": 2}
LAMP_IDLE = "agentcraft:status_lamp[status=idle]"
LAMP_OFF = "agentcraft:status_lamp[status=off]"
DESK = "minecraft:smooth_quartz_slab"
CHAIR = "minecraft:polished_diorite_stairs"
DESKS_X = 95  # the first desk on each side; then every 4
office = [
    # Command module, west end: the way in by the airlock, the user's podium, the goal projector under the floor glass.
    {"type": "spot", "id": "entrance", "anchor": "entrance", "at": [CMD[0] + 2, C], "look": "east"},
    {"type": "spot", "id": "spawn", "anchor": "spawn", "at": [CMD[0] + 3, C], "look": "east"},
    # The podium faces back toward the airlock, where the user stands behind it looking down the module at the desks.
    {"type": "spot", "id": "user", "anchor": "user", "at": [88, C], "look": "east"},
    {"type": "podium", "id": "podium", "at": [89, C], "block": "agentcraft:decision_podium[facing=west,open=false]"},
    {"type": "device", "id": "decisions-lamp", "at": [89, F + 4, C], "block": LAMP_OFF, "binding": "decisions"},
    box("floor-window", (89, F, C), (104, F, C), NADIR, over=["command"]),
    # A hatch of glass panes in the roof over the spawn: Minecraft drops a new player on the first full block below
    # the sky, so without it they would arrive on the roof.
    box("spawn-hatch", (CMD[0] + 3, CY + R, C), (CMD[0] + 3, CY + R, C), "minecraft:white_stained_glass_pane[east=true,west=true]", over=["command"]),
    # Then three desks along each wall, screens on the hull, chairs at the aisle.
    {"type": "deskRow", "id": "desks-port", "at": [DESKS_X, C - 3], "spacing": 4, "agents": ["marlow", "juniper", "kit"], "look": "north",
     "desk": DESK, "monitor": "minecraft:black_concrete", "chair": CHAIR, "screen": {"block": "agentcraft:monitor[facing=south,lit=true]", **SCREEN}, "lamp": LAMP_IDLE, "over": ["command"]},  # lamps set into the hull
    {"type": "deskRow", "id": "desks-starboard", "at": [DESKS_X, C + 3], "spacing": 4, "agents": ["wren", "rowan", "tove"], "look": "south",
     "desk": DESK, "monitor": "minecraft:black_concrete", "chair": CHAIR, "screen": {"block": "agentcraft:monitor[facing=north,lit=true]", **SCREEN}, "lamp": LAMP_IDLE, "over": ["command"]},
    # Lab: a station at each corner, the task board on the end wall, CI lamps over the bench.
    {"type": "station", "id": "library", "station": "library", "at": [C - 2, 99], "look": "west", "block": "agentcraft:memory_archive[facing=east]", "binding": "shared"},
    {"type": "station", "id": "terminal", "station": "terminal", "at": [C - 2, 102], "look": "west", "block": "agentcraft:console_terminal[facing=east]"},
    {"type": "station", "id": "testbench", "station": "testbench", "at": [C + 2, 99], "look": "east", "block": "minecraft:lectern"},
    {"type": "station", "id": "mergestation", "station": "mergestation", "at": [C + 2, 102], "look": "east", "block": "agentcraft:merge_station[facing=west,active=false]"},
    {"type": "device", "id": "merge-lamp", "at": [C + 3, F + 2, 102], "block": LAMP_OFF, "binding": "merge"},
    {"type": "taskWall", "id": "task-wall", "x": [C - 2, C + 2], "z": LAB[0] + 1, "y": [F + 2, F + 4], "block": "agentcraft:task_board[facing=south]", "facing": "south"},
    *[{"type": "device", "id": f"ci-lamp-{i + 1}", "at": [C + 3, F + 3, 98 + i * 2], "block": LAMP_IDLE, "binding": f"ci:#{i + 1}"} for i in range(3)],
    # Wardroom: the dining table, fore and aft, a chair at each end.
    {"type": "seatedTable", "id": "meeting", "station": "meeting", "chair": CHAIR,
     "table": {"from": [119, C - 1], "to": [122, C + 1], "block": "minecraft:smooth_quartz_slab[type=top]"},
     "seats": [[118, C, "east"], [123, C, "west"], [119, C - 2, "south"], [122, C - 2, "south"], [119, C + 2, "north"], [122, C + 2, "north"]]},
]

# The observation bulb, laid out like a viewing lounge: a clear aisle from the door to the glass at the front, armchairs
# round the curved glass facing out at the view (two each side, two at the front on the glass floor), side tables
# between them, and the goal projector at the head of the aisle, its hologram under the dome.
BZ = BULB[2]
office += [
    {"type": "seatedTable", "id": "lounge", "station": "lounge", "chair": QUARTZ_STAIRS,
     "table": {"from": [C - 4, BZ - 1], "to": [C - 4, BZ], "block": "minecraft:smooth_quartz_slab[type=top]"},
     "seats": [[C - 4, BZ - 2, "west"], [C - 4, BZ + 1, "west"], [C + 4, BZ - 2, "east"], [C + 4, BZ + 1, "east"], [C - 2, BZ + 4, "south"], [C + 2, BZ + 4, "south"]]},
    box("lounge-table-east", (C + 4, F + 1, BZ - 1), (C + 4, F + 1, BZ), "minecraft:smooth_quartz_slab[type=top]"),
    {"type": "spot", "id": "atrium", "anchor": "goal_atrium", "at": [C, BZ + 2], "look": "south"},
    {"type": "device", "id": "goal-lamp", "at": [C, F + 2, BZ + 2], "block": LAMP_IDLE, "binding": "goal:atrium"},  # on its pedestal
]

# ---------------------------------------------------------------- finishing details
shelf_rng = random.Random(7)


def books(facing):
    slots = ",".join(f"slot_{i}_occupied={'true' if shelf_rng.random() < 0.6 else 'false'}" for i in range(6))
    return f"minecraft:chiseled_bookshelf[facing={facing},{slots}]"


# The node's floor markings: yellow and black banding round the glass hatch, then a darker ring out to the wall that
# leaves room for the hatchway stripes.
NODE_MARKS = []
for dx in range(-5, 6):
    for dz in range(-5, 6):
        r = math.hypot(dx, dz)
        if 2.35 < r <= 3.2:
            sector = int((math.degrees(math.atan2(dz, dx)) + 360) // 30)
            NODE_MARKS.append((dx, dz, "minecraft:yellow_concrete" if sector % 2 == 0 else "minecraft:black_concrete"))
        elif 3.6 < r <= 4.6 and not ((abs(dx) == 4 and abs(dz) <= 1) or (abs(dz) == 4 and abs(dx) <= 1)):
            NODE_MARKS.append((dx, dz, "minecraft:gray_concrete"))

details = [
    # Light strips along the crown of every module.
    *[box(f"light-command-{x}", (x, CY + R - 1, C), (x, CY + R - 1, C), LIGHT) for x in range(89, 105, 3)],
    *[box(f"light-wardroom-{x}", (x, CY + R - 1, C), (x, CY + R - 1, C), LIGHT) for x in range(116, 128, 3)],
    *[box(f"light-lab-{z}", (C, CY + R - 1, z), (C, CY + R - 1, z), LIGHT) for z in range(98, 106, 3)],
    # Running lights along the outside, so the station reads at night.
    *[box(f"run-light-cmd-{x}", (x, CY + R, C), (x, CY + R, C), LIGHT, over=["command"]) for x in range(88, 105, 8)],
    *[box(f"run-light-ward-{x}", (x, CY + R, C), (x, CY + R, C), LIGHT, over=["wardroom"]) for x in (118, 126)],
    *[box(f"run-light-lab-{z}", (C, CY + R, z), (C, CY + R, z), LIGHT, over=["lab"]) for z in (99,)],
    # Command module: lockers either side of the airlock, plants and books in the gaps between desks, handrails by the door.
    *[box(f"locker-{s}", (CMD[0] + 1, F + 1, C + s * 3), (CMD[0] + 2, F + 2, C + s * 3), "minecraft:barrel[facing=up]") for s in (-1, 1)],
    *[box(f"desk-plant-{i}", (x, F + 1, C + s * 3), (x, F + 1, C + s * 3), "minecraft:potted_fern") for i, (x, s) in enumerate([(DESKS_X + 2, -1), (DESKS_X + 6, 1)])],
    *[box(f"desk-books-{i}", (x, F + 1, C + s * 3), (x, F + 1, C + s * 3), books("south" if s < 0 else "north")) for i, (x, s) in enumerate([(DESKS_X + 2, 1), (DESKS_X + 6, -1)])],
    *[box(f"rail-entry-{s}", (CMD[0] + 3, F + 3, C + s * 3), (91, F + 3, C + s * 3), f"{RAIL}[axis=x]") for s in (-1, 1)],
    # Lab: a plant-growth rack on the wall by the node, a bench with an instrument.
    box("grow-rack", (C - 3, F + 1, 103), (C - 3, F + 1, 104), "minecraft:smooth_quartz_slab[type=top]"),
    box("grow-plants", (C - 3, F + 2, 103), (C - 3, F + 2, 104), "minecraft:potted_fern"),
    box("grow-light", (C - 3, F + 3, 103), (C - 3, F + 3, 104), "minecraft:verdant_froglight"),
    box("lab-bench", (C + 3, F + 1, 103), (C + 3, F + 1, 104), "minecraft:smooth_quartz_slab[type=top]"),
    box("microscope", (C + 3, F + 2, 103), (C + 3, F + 2, 103), "minecraft:brewing_stand"),
    # Wardroom: a library wall beyond the table, then the galley at the far end.
    *[box(f"library-{s}-{x}", (x, F + 1, C + s * 3), (x, F + 2, C + s * 3), books("south" if s < 0 else "north")) for s in (-1, 1) for x in (124, 125)],
    box("galley-counter", (126, F + 1, C - 2), (126, F + 1, C + 2), "minecraft:smooth_quartz_slab[type=top]"),
    box("galley-stores", (127, F + 1, C - 2), (127, F + 2, C + 2), "minecraft:barrel[facing=west]"),
    box("galley-light", (126, F + 2, C), (126, F + 2, C), "minecraft:end_rod[facing=up]"),  # no open flames on a station
    box("galley-jar", (126, F + 2, C - 1), (126, F + 2, C - 1), "minecraft:decorated_pot[facing=west]"),
    box("wardroom-plant", (116, F + 1, C - 3), (116, F + 1, C - 3), "minecraft:potted_flowering_azalea_bush"),
    *[box(f"rail-wardroom-{s}", (116, F + 3, C + s * 3), (123, F + 3, C + s * 3), f"{RAIL}[axis=x]") for s in (-1, 1)],
    # The node: planters between the hatchways.
    # The node: wayfinding stripes on the floor at each hatchway (blue to command, green to the lab, orange to the
    # wardroom, purple to the lounge), lights under the glass floor, a hatch lid.
    *[box(f"way-{name}", a, b, block, over=["node-floor"]) for name, a, b, block in [
        ("command", (C - 4, F, C - 1), (C - 4, F, C + 1), "minecraft:blue_concrete"),
        ("wardroom", (C + 4, F, C - 1), (C + 4, F, C + 1), "minecraft:orange_concrete"),
        ("lab", (C - 1, F, C - 4), (C + 1, F, C - 4), "minecraft:lime_concrete"),
        ("lounge", (C - 1, F, C + 4), (C + 1, F, C + 4), "minecraft:purple_concrete")]],
    *[box(f"floor-mark-{dx}-{dz}", (C + dx, F, C + dz), (C + dx, F, C + dz), block, over=["node-floor"]) for dx, dz, block in NODE_MARKS],
    *[box(f"under-light-{i}", (C + dx, F - 1, C + dz), (C + dx, F - 1, C + dz), LIGHT) for i, (dx, dz) in enumerate([(2, 0), (-2, 0), (0, 2), (0, -2)])],
    box("hatch-lid", (C, F + 1, C + 1), (C, F + 1, C + 1), "minecraft:iron_trapdoor[facing=south,half=bottom,open=true]"),
    # The cupola: a ring bench facing out over the planet.
    *[box(f"cupola-seat-{i}", (C + dx, POD_Y - 2, C + dz), (C + dx, POD_Y - 2, C + dz), seat(look))
      for i, (dx, dz, look) in enumerate([(3, 0, "east"), (-3, 0, "west"), (0, 3, "south"), (0, -3, "north")])],
    # Observation bulb: soft lamps by the door, a plant and a reading light on the side tables; the floor is all glass.
    *[box(f"lounge-lamp-{s}", (C + s * 3, F + 1, BZ - 4), (C + s * 3, F + 1, BZ - 4), "minecraft:ochre_froglight") for s in (-1, 1)],
    box("lounge-plant", (C - 4, F + 2, BZ - 1), (C - 4, F + 2, BZ - 1), "minecraft:potted_azalea_bush"),
    box("lounge-light", (C + 4, F + 2, BZ), (C + 4, F + 2, BZ), "minecraft:end_rod[facing=up]"),
    # The goal projector's pedestal: a quartz pillar on a flared, stepped base, light rods at its corners.
    box("pedestal", (C, F + 1, BZ + 2), (C, F + 1, BZ + 2), "minecraft:quartz_pillar[axis=y]"),
    *[box(f"pedestal-step-{face}", (C + dx, F + 1, BZ + 2 + dz), (C + dx, F + 1, BZ + 2 + dz), f"minecraft:smooth_quartz_stairs[facing={face},half=bottom]")
      for face, dx, dz in [("east", -1, 0), ("west", 1, 0), ("south", 0, -1), ("north", 0, 1)]],
    *[box(f"pedestal-rod-{dx}-{dz}", (C + dx, F + 1, BZ + 2 + dz), (C + dx, F + 1, BZ + 2 + dz), "minecraft:end_rod[facing=up]") for dx in (-1, 1) for dz in (-1, 1)],
]

cameras = [
    {"type": "camera", "id": "vista", "name": "vista", "at": [150.5, 56, 160.5], "yaw": 140, "pitch": 24},
    {"type": "camera", "id": "command-view", "name": "command", "at": [CMD[0] + 2.5, F + 3, C + 0.5], "yaw": -90, "pitch": 8},
    {"type": "camera", "id": "goal-view", "name": "goal", "at": [C + 0.5, F + 2.6, OBS[1] + 0.5], "yaw": 0, "pitch": -4},
    {"type": "camera", "id": "lab-view", "name": "lab", "at": [C + 0.5, F + 3, LAB[1] - 0.5], "yaw": 180, "pitch": 8},
    {"type": "camera", "id": "wardroom-view", "name": "wardroom", "at": [WARD[0] + 0.5, F + 3, C + 0.5], "yaw": -90, "pitch": 10},
    {"type": "camera", "id": "lounge-view", "name": "lounge", "at": [C + 0.5, F + 2.8, OBS[1] + 0.5], "yaw": 0, "pitch": 12},
    {"type": "camera", "id": "node-view", "name": "node", "at": [C - 3.5, F + 3, C - 3.5], "yaw": -45, "pitch": 40},
    {"type": "camera", "id": "cupola-view", "name": "cupola", "at": [C + 0.5, POD_Y - 0.5, C + 0.5], "yaw": 0, "pitch": 55},
    {"type": "camera", "id": "cupola-outside", "name": "cupola-outside", "at": [C + 22.5, POD_Y - 8, C + 18.5], "yaw": 130, "pitch": -12},
    # Hero angles: the station against the ringed giant, against the sun, and as a docking ship would see it.
    {"type": "camera", "id": "hero-view", "name": "hero", "at": [64.5, 50, 149.5], "yaw": 230, "pitch": 2},
    {"type": "camera", "id": "sunrise-view", "name": "sunrise", "at": [160.5, 45, 80.5], "yaw": 59, "pitch": 4},
    {"type": "camera", "id": "approach-view", "name": "approach", "at": [42.5, CY + 6, C + 14.5], "yaw": -110, "pitch": 8},
    {"type": "camera", "id": "hull-view", "name": "hull", "at": [104.5, CY + 9, C + 14.5], "yaw": 150, "pitch": 28},
    {"type": "camera", "id": "truss-view", "name": "truss", "at": [C + 12.5, TRUSS_Y + 8, 70.5], "yaw": 120, "pitch": 30},
    {"type": "camera", "id": "giant-view", "name": "giant", "at": [C + 0.5, CY + R + 3, C - 8.5], "yaw": -130, "pitch": -12},
    {"type": "camera", "id": "sun-view", "name": "sun", "at": [C - 8.5, CY + R + 3, C + 0.5], "yaw": 59, "pitch": -6},
    {"type": "camera", "id": "planet-view", "name": "planet", "at": [C + 0.5, F + 2.6, BULB[2] + 3.5], "yaw": 0, "pitch": 45},
]

design = {
    "name": "orbital-station",
    "version": 1,
    "seed": 3,
    "size": [W, H, L],
    "floorY": F,
    "shell": {"kind": "none"},
    "origin": [-C, 210, -C],
    "atmosphere": {"biome": "minecraft:the_void", "weather": "clear", "time": 18000},
    "surroundings": {
        "void": True,
        "planet": {"center": [C, C], "top": -95, "radius": 300, "extent": 330, "seaLevel": 0.53, "clouds": 5, "cities": 0.012},
        # The neighbourhood, all within render distance: a sun low on the horizon, a ringed gas giant high in the
        # sky, a grey cratered moon and a small red one, and a belt of rocks circling the station.
        "bodies": [
            {"center": [C - 150, 60, C + 90], "radius": 14, "bands": ["minecraft:shroomlight"], "craters": "minecraft:ochre_froglight"},
            {"center": [C + 130, 72, C - 110], "radius": 24,
             "bands": ["minecraft:white_terracotta", "minecraft:orange_terracotta", "minecraft:brown_terracotta", "minecraft:yellow_terracotta",
                       "minecraft:orange_terracotta", "minecraft:white_terracotta", "minecraft:light_gray_terracotta"],
             "ring": {"inner": 31, "outer": 42, "blocks": ["minecraft:smooth_sandstone", "minecraft:white_terracotta", "minecraft:light_gray_terracotta"], "tilt": 0.18}},
            {"center": [C - 60, 20, C - 150], "radius": 10, "bands": ["minecraft:light_gray_concrete", "minecraft:andesite"], "craters": "minecraft:gray_concrete"},
            {"center": [C + 150, -30, C + 80], "radius": 6, "bands": ["minecraft:red_terracotta", "minecraft:orange_terracotta", "minecraft:red_terracotta"],
             "craters": "minecraft:brown_terracotta"},
        ],
        "asteroids": {"center": [C, C], "radius": 120, "spread": 20, "y": [0, 50], "count": 70, "minSize": 2, "maxSize": 6,
                      "blocks": ["minecraft:tuff", "minecraft:cobbled_deepslate", "minecraft:andesite", "minecraft:blackstone", "minecraft:stone"]},
    },
    "parts": [*structure, *outside, *greebles, *office, *details, *cameras],
}

out = f"{root}/designs/orbital-station/v1.json"
parts = design.pop("parts")
lines = ["{"]
for k, v in design.items():
    lines.append(f'  "{k}": {json.dumps(v, separators=(", ", ": "))},')
lines.append('  "parts": [')
for i, p in enumerate(parts):
    lines.append("    " + json.dumps(p, separators=(", ", ": ")) + ("," if i < len(parts) - 1 else ""))
lines += ["  ]", "}"]
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print(f"wrote {out} with {len(parts)} parts")
