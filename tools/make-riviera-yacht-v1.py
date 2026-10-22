"""Author designs/riviera-yacht/v1.json: a motor yacht moored stern-to the quay of a Mediterranean island town.

The office is laid out the way a yacht is used: the salon on the main deck is the workroom, three desks along each
side with their screens against the hull windows, the stations along the forward bulkhead, the user's podium in the
middle; stairs from the aft deck lead up to the upper deck, where the lounge sits aft in the open and the meeting
table under the hardtop.

The yacht is shaped, not boxed: a hull that narrows and rakes at the bow, and a superstructure of `deckhouse` tiers
with rounded noses, raked windscreens and rounded corners (a long low deckhouse, an upper deck overhanging the aft
deck on steel poles, a flybridge with its own windscreen under a hardtop, a radar arch).

The island has a wide bay on its south side. The town grows up the slope from the harbour the way island towns do:
along switchback lanes, houses following the contours with lower storeys where the hill falls away, a church with a
bell tower on its piazza, restaurants along a curving promenade, a beach with umbrellas and boats pulled up on the
sand, fishing boats in the harbour, a lighthouse on the headland, olive groves and cypresses. Open sea all round
(`surroundings.sea`), so the horizon is water.

Run from the repository root:  python tools/make-riviera-yacht-v1.py .
"""

import json
import math
import os
import random
import sys

root = sys.argv[1]

W, H, L = 384, 128, 384
SEA = 24  # layer of the sea surface
FLOOR = 28  # the yacht's main deck
F = FLOOR
CX = 192  # the yacht's centre line
STERN, LENGTH, BEAM = 224, 62, 17  # transom at z 224, bow tip at z 285
HW = 6  # half-width of the deckhouse: walls at x 186 and 198, a walkway either side
Z0, Z1 = STERN + 10, STERN + 28  # aft and forward salon walls, z 234 and 252
X0, X1 = CX - HW, CX + HW
QUAY = SEA + 2

def box(id, a, b, block, over=None):
    p = {"type": "box", "id": id, "from": list(a), "to": list(b), "block": block}
    if over:
        p["over"] = over
    return p


def z(s):
    """The z of a point `s` blocks forward of the transom."""
    return STERN + s


def tier(id, s0, s1, y, height, half, **kw):
    """A deckhouse tier in the yacht's hull space."""
    return {"type": "deckhouse", "id": id, "bow": "south", "stern": STERN, "center": CX, "from": s0, "to": s1, "y": y, "height": height,
            "halfWidth": half, **kw}


WHITE = "minecraft:white_concrete"
TEAK = "minecraft:jungle_planks"
QUARTZ_STAIRS = "minecraft:smooth_quartz_stairs"
TRIM = "minecraft:smooth_quartz_slab[type=bottom]"
TINT = "minecraft:gray_stained_glass"
POLE = "minecraft:end_rod[facing=up]"  # slim stainless poles


def seat(look):
    return f"{QUARTZ_STAIRS}[facing={ {'north': 'south', 'south': 'north', 'east': 'west', 'west': 'east'}[look] },half=bottom]"


def U(look):
    """A sofa or chair seat (stairs) for someone looking `look`."""
    return seat(look)


# A yacht of about 62 by 17: room for six desks and a podium in the salon without echoing.
yacht = [
    {"type": "hull", "id": "hull", "bow": "south", "stern": STERN, "length": LENGTH, "center": CX, "beam": BEAM, "keelY": SEA - 5, "deckY": F,
     "bowLength": 22, "shell": WHITE, "deck": TEAK,
     "stripes": [{"y": SEA, "block": "minecraft:blue_concrete"},
                 {"y": SEA + 2, "block": "minecraft:black_concrete", "along": [10, 40]},
                 {"y": SEA + 3, "block": "minecraft:black_concrete", "along": [14, 36]}],
     "rail": {"block": "minecraft:white_stained_glass_pane", "gaps": [[0, 0]]}},
    box("underwater-lights", (CX - 3, SEA - 2, STERN), (CX + 3, SEA - 2, STERN), "minecraft:sea_lantern", over=["hull"]),
    # The main deckhouse: the salon and, forward of it, the wheelhouse under a long raked windscreen.
    tier("deckhouse", 10, 44, F + 1, 4, HW, taper=14, radius=2, rake=1, open=True, wall=WHITE, roof=WHITE, slope=QUARTZ_STAIRS, trim=TRIM,
         windows={"rows": [F + 2, F + 3], "block": TINT}),
    box("salon-floor", (X0 + 1, F, Z0 + 1), (X1 - 1, F, Z1 - 1), "minecraft:birch_planks", over=["hull"]),
    box("salon-aft", (X0 + 2, F + 1, Z0), (X1 - 2, F + 4, Z0), TINT, over=["deckhouse"]),
    box("salon-door", (CX - 1, F + 1, Z0), (CX + 1, F + 2, Z0), "minecraft:air", over=["salon-aft"]),
    box("salon-fwd", (X0 + 1, F + 1, Z1), (X1 - 1, F + 4, Z1), TINT, over=["deckhouse"]),
    box("salon-fwd-door", (CX, F + 1, Z1), (CX, F + 2, Z1), "minecraft:air", over=["salon-fwd"]),
    box("helm", (CX - 2, F + 1, z(39)), (CX + 2, F + 1, z(39)), "minecraft:black_concrete"),
    box("helm-screens", (CX - 1, F + 2, z(39)), (CX + 1, F + 2, z(39)), "minecraft:black_stained_glass"),
    box("helm-seats", (CX - 1, F + 1, z(37)), (CX + 1, F + 1, z(37)), U("south")),
    # The upper deck: teak, edged in white, overhanging the aft deck on two poles.
    tier("upper-deck", 3, 42, F + 5, 1, HW + 1, taper=12, radius=4, wall=WHITE, roof=TEAK, slope=QUARTZ_STAIRS, trim=WHITE),
    *[box(f"pole-{i}", (x, F + 1, z(7)), (x, F + 4, z(7)), POLE) for i, x in enumerate([X0 - 1, X1 + 1])],
    # The flybridge: a glass coaming, a windscreen and helm at the front, a hardtop on poles, a radar arch.
    tier("coaming", 5, 40, F + 6, 1, HW, taper=11, radius=3, open=True, wall="minecraft:white_stained_glass", roof=WHITE, slope=QUARTZ_STAIRS, trim=TRIM),
    tier("fly-screen", 33, 39, F + 6, 2, HW - 1, taper=6, rake=1, open=True, wall=WHITE, roof=WHITE, slope=QUARTZ_STAIRS, trim=TRIM,
         windows={"rows": [F + 7], "block": "minecraft:black_stained_glass"}, over=["coaming"]),
    box("fly-screen-open", (CX - 4, F + 6, z(33)), (CX + 4, F + 7, z(33)), "minecraft:air", over=["fly-screen"]),
    box("fly-helm", (CX - 2, F + 6, z(36)), (CX + 2, F + 6, z(36)), "minecraft:black_concrete"),
    box("fly-helm-seats", (CX - 1, F + 6, z(34)), (CX + 1, F + 6, z(34)), U("south")),
    tier("hardtop", 16, 33, F + 10, 1, HW - 0.5, taper=8, radius=3, wall=WHITE, roof=WHITE, slope=QUARTZ_STAIRS, trim=TRIM),
    *[box(f"hardtop-pole-{i}", (x, F + 6, z(s)), (x, F + 9, z(s)), POLE) for i, (x, s) in enumerate([(CX - 4, 18), (CX + 4, 18), (CX - 3, 31), (CX + 3, 31)])],
    tier("radar-arch", 23, 26, F + 11, 2, 1.5, rake=1, wall=WHITE, roof=WHITE, slope=QUARTZ_STAIRS, trim=TRIM),
    box("radar", (CX - 1, F + 13, z(23)), (CX + 1, F + 13, z(23)), "minecraft:smooth_quartz_slab[type=bottom]"),
    box("antenna-1", (CX - 1, F + 11, z(22)), (CX - 1, F + 13, z(22)), POLE),
    box("antenna-2", (CX + 1, F + 11, z(22)), (CX + 1, F + 12, z(22)), "minecraft:lightning_rod"),
    # A wet bar to starboard under the hardtop, by the dining table.
    box("wet-bar", (X1 - 1, F + 6, z(25)), (X1 - 1, F + 6, z(29)), "minecraft:smooth_quartz_slab[type=top]"),
    box("bar-stock", (X1 - 1, F + 7, z(26)), (X1 - 1, F + 7, z(26)), "minecraft:barrel[facing=up]"),
    box("bar-plant", (X1 - 1, F + 7, z(29)), (X1 - 1, F + 7, z(29)), "minecraft:potted_azalea_bush"),
    # The aft deck: a sofa and table to port, facing the quay, the stairs to starboard.
    box("aft-sofa", (X0 + 1, F + 1, z(2)), (CX - 2, F + 1, z(2)), U("south")),
    box("aft-sofa-side", (X0 + 1, F + 1, z(3)), (X0 + 1, F + 1, z(5)), U("east")),
    box("aft-table", (X0 + 3, F + 1, z(4)), (CX - 3, F + 1, z(5)), "minecraft:jungle_slab[type=top]"),
    box("aft-plant", (X0 + 4, F + 2, z(4)), (X0 + 4, F + 2, z(4)), "minecraft:potted_red_tulip"),
    # Stairs from the aft deck up through the overhang, rising forward along the starboard side.
    *[box(f"stairs-{k}", (X1 - 1, F + k, z(1 + k)), (X1, F + k, z(1 + k)), "minecraft:jungle_stairs[facing=south,half=bottom]",
          over=["upper-deck"] if k == 5 else None) for k in range(1, 6)],
    box("stairwell", (X1 - 1, F + 5, z(3)), (X1, F + 5, z(5)), "minecraft:air", over=["upper-deck"]),
    box("stair-head", (X1 - 3, F + 6, z(4)), (X1 + 1, F + 6, z(9)), "minecraft:air", over=["coaming"]),
    # The swim platform below the open transom, steps up, and the passerelle to the quay.
    box("swim-platform", (X0, F - 2, STERN - 4), (X1, F - 2, STERN - 1), TEAK),
    box("swim-steps", (CX - 1, F - 1, STERN - 2), (CX + 1, F - 1, STERN - 2), "minecraft:jungle_stairs[facing=south,half=bottom]"),
    box("swim-steps-2", (CX - 1, F, STERN - 1), (CX + 1, F, STERN - 1), "minecraft:jungle_stairs[facing=south,half=bottom]"),
    box("passerelle", (CX - 1, F - 2, STERN - 10), (CX + 1, F - 2, STERN - 5), "minecraft:smooth_quartz_slab[type=top]"),
    # The foredeck: a sunpad with pillows, and the anchor windlass.
    box("bow-sunpad", (CX - 3, F + 1, z(46)), (CX + 3, F + 1, z(50)), "minecraft:white_wool"),
    box("bow-pillows", (CX - 3, F + 2, z(46)), (CX + 3, F + 2, z(46)), "minecraft:light_blue_carpet"),
    box("windlass", (CX, F + 1, z(56)), (CX, F + 1, z(56)), "minecraft:iron_block"),
    box("anchor-chain", (CX, F + 1, z(57)), (CX, F + 1, z(59)), "minecraft:iron_chain[axis=z]"),
]

# ---------------------------------------------------------------- the office
SCREEN = {"width": 3, "height": 2}
LAMP_IDLE = "agentcraft:status_lamp[status=idle]"
LAMP_OFF = "agentcraft:status_lamp[status=off]"
UP = F + 5  # the upper deck's floor layer

# The lounge: a U-shaped settee wrapping a coffee table, open aft to the view. Every other cushion is a place to
# sit (slots must be 1.6 apart); agents step in from the walkway behind the settee.
LZ = z(11)  # the back of the U
lounge_sofa = [
    box("settee-back", (CX - 3, UP + 1, LZ), (CX + 3, UP + 1, LZ), U("north")),
    box("settee-port", (CX - 4, UP + 1, LZ - 4), (CX - 4, UP + 1, LZ - 1), U("east")),
    box("settee-starboard", (CX + 4, UP + 1, LZ - 4), (CX + 4, UP + 1, LZ - 1), U("west")),
    box("settee-corner-port", (CX - 4, UP + 1, LZ), (CX - 4, UP + 1, LZ), U("north")),
    box("settee-corner-starboard", (CX + 4, UP + 1, LZ), (CX + 4, UP + 1, LZ), U("north")),
]
office = [
    # Main deck, the salon: three desks along each side, screens against the hull windows, agents looking out.
    {"type": "deskRow", "id": "desks-port", "at": [X0 + 1, Z0 + 4], "spacing": 4, "agents": ["marlow", "juniper", "kit"], "look": "west",
     "desk": "minecraft:smooth_quartz_slab", "monitor": "minecraft:black_concrete", "chair": "minecraft:jungle_stairs",
     "screen": {"block": "agentcraft:monitor[facing=east,lit=true]", **SCREEN}, "lamp": LAMP_IDLE},
    {"type": "deskRow", "id": "desks-starboard", "at": [X1 - 1, Z0 + 4], "spacing": 4, "agents": ["wren", "rowan", "tove"], "look": "east",
     "desk": "minecraft:smooth_quartz_slab", "monitor": "minecraft:black_concrete", "chair": "minecraft:jungle_stairs",
     "screen": {"block": "agentcraft:monitor[facing=west,lit=true]", **SCREEN}, "lamp": LAMP_IDLE},
    # The way in, and the user at the podium in the middle of the room, the goal beyond it.
    {"type": "spot", "id": "entrance", "anchor": "entrance", "at": [CX, Z0 + 1], "look": "south"},
    {"type": "spot", "id": "spawn", "anchor": "spawn", "at": [CX, Z0 + 2], "look": "south"},
    {"type": "spot", "id": "user", "anchor": "user", "at": [CX, Z0 + 6], "look": "south"},
    {"type": "podium", "id": "podium", "at": [CX, Z0 + 7], "block": "agentcraft:decision_podium[facing=north,open=false]"},
    {"type": "spot", "id": "atrium", "anchor": "goal_atrium", "at": [CX, Z0 + 10], "look": "south"},
    {"type": "device", "id": "decisions-lamp", "at": [CX, F + 4, Z0 + 7], "block": LAMP_OFF, "binding": "decisions"},
    # The goal projector is set into the deck under a glass panel, so its hologram floats at eye height under the ceiling.
    {"type": "device", "id": "goal-lamp", "at": [CX, F - 1, Z0 + 10], "block": LAMP_IDLE, "binding": "goal:atrium", "over": ["hull"]},
    box("goal-glass", (CX, F, Z0 + 10), (CX, F, Z0 + 10), "minecraft:glass", over=["salon-floor"]),
    # The stations along the forward bulkhead, either side of the door to the wheelhouse.
    {"type": "station", "id": "library", "station": "library", "at": [CX - 4, Z1 - 2], "block": "agentcraft:memory_archive[facing=north]", "binding": "shared"},
    {"type": "station", "id": "terminal", "station": "terminal", "at": [CX - 2, Z1 - 2], "block": "agentcraft:console_terminal[facing=north]"},
    {"type": "station", "id": "testbench", "station": "testbench", "at": [CX + 2, Z1 - 2], "block": "minecraft:lectern"},
    {"type": "station", "id": "mergestation", "station": "mergestation", "at": [CX + 4, Z1 - 2], "block": "agentcraft:merge_station[facing=north,active=false]"},
    {"type": "device", "id": "merge-lamp", "at": [CX + 4, F + 2, Z1 - 1], "block": LAMP_OFF, "binding": "merge"},
    # The task board on the aft bulkhead beside the doors, the CI lamps on the other side.
    {"type": "taskWall", "id": "task-wall", "x": [CX + 2, CX + 4], "z": Z0 + 1, "y": [F + 2, F + 4], "block": "agentcraft:task_board[facing=south]", "facing": "south"},
    *[{"type": "device", "id": f"ci-lamp-{i + 1}", "at": [CX - 4 + i, F + 4, Z0 + 1], "block": LAMP_IDLE, "binding": f"ci:#{i + 1}"} for i in range(3)],
    {"type": "lanternGrid", "id": "salon-lights", "xs": [CX - 3, CX + 3], "zs": [Z0 + 4, Z0 + 9, Z0 + 14], "y": F + 4, "block": "minecraft:lantern[hanging=true]"},
    # Upper deck, aft: the lounge, the settee round a low table.
    *lounge_sofa,
    {"type": "seatedTable", "id": "lounge", "station": "lounge", "floor": UP, "chair": QUARTZ_STAIRS,
     "table": {"from": [CX - 2, LZ - 3], "to": [CX + 2, LZ - 2], "block": "minecraft:jungle_slab"},
     "seats": [[CX - 4, LZ - 4, "east"], [CX - 4, LZ - 2, "east"], [CX + 4, LZ - 4, "west"], [CX + 4, LZ - 2, "west"],
               [CX - 1, LZ, "north"], [CX + 1, LZ, "north"]],
     "over": [b["id"] for b in lounge_sofa]},
    # Upper deck, under the hardtop: an alfresco dining table running fore and aft, a chair at each end.
    {"type": "seatedTable", "id": "meeting", "station": "meeting", "floor": UP, "chair": "minecraft:birch_stairs",
     "table": {"from": [CX - 1, z(21)], "to": [CX, z(24)], "block": "minecraft:jungle_slab[type=top]"},
     "seats": [[CX - 1, z(20), "south"], [CX, z(25), "north"], [CX - 2, z(22), "east"], [CX - 2, z(24), "east"],
               [CX + 1, z(21), "west"], [CX + 1, z(23), "west"]]},
    {"type": "lanternGrid", "id": "meeting-lights", "xs": [CX - 1, CX], "zs": [z(21), z(24)], "y": F + 9, "block": "minecraft:lantern[hanging=true]"},
    box("table-flowers", (CX - 1, UP + 2, z(22)), (CX - 1, UP + 2, z(22)), "minecraft:potted_flowering_azalea_bush"),
]

# ---------------------------------------------------------------- finishing details
# Built the way detail builders work: relief instead of flat surfaces (crown trim, sills, cabinet fronts), warm light,
# and nothing without a reason to be there: books where people work, plants where people sit, a bar where people eat.
shelf_rng = random.Random(23)


def books(facing):
    """A chiseled bookshelf, half full in a different way each time, as real shelves are."""
    slots = ",".join(f"slot_{i}_occupied={'true' if shelf_rng.random() < 0.6 else 'false'}" for i in range(6))
    return f"minecraft:chiseled_bookshelf[facing={facing},{slots}]"


DESK_Z = [Z0 + 4, Z0 + 8, Z0 + 12]  # the desks along each side, with their lamps above
BETWEEN = [Z0 + 2, Z0 + 6, Z0 + 10, Z0 + 14]  # the gaps beside and between them
details = [
    # Salon: a low bookcase with a plant in each gap between the desks, along both hull walls.
    *[box(f"bookcase-port-{i}", (X0 + 1, F + 1, zz), (X0 + 1, F + 1, zz), books("east")) for i, zz in enumerate(BETWEEN)],
    *[box(f"bookcase-starboard-{i}", (X1 - 1, F + 1, zz), (X1 - 1, F + 1, zz), books("west")) for i, zz in enumerate(BETWEEN)],
    *[box(f"bookcase-plant-{i}", (x, F + 2, zz), (x, F + 2, zz), pot)
      for i, (x, zz, pot) in enumerate([(X0 + 1, BETWEEN[0], "minecraft:potted_fern"), (X0 + 1, BETWEEN[2], "minecraft:potted_azalea_bush"),
                                         (X1 - 1, BETWEEN[1], "minecraft:potted_flowering_azalea_bush"), (X1 - 1, BETWEEN[3], "minecraft:potted_fern")])],
    *[box(f"bookcase-candle-{i}", (x, F + 2, zz), (x, F + 2, zz), "minecraft:white_candle[candles=2,lit=true]")
      for i, (x, zz) in enumerate([(X0 + 1, BETWEEN[1]), (X0 + 1, BETWEEN[3]), (X1 - 1, BETWEEN[0]), (X1 - 1, BETWEEN[2])])],
    # Salon: crown trim where the walls meet the ceiling, broken only by the desk lamps.
    *[box(f"crown-{side}-{zz}", (x, F + 4, zz), (x, F + 4, zz), f"{QUARTZ_STAIRS}[facing={face},half=top]")
      for side, x, face in [("port", X0 + 1, "west"), ("starboard", X1 - 1, "east")] for zz in range(Z0 + 2, Z1) if zz not in DESK_Z],
    # Salon: a sideboard by the door under the CI lamps (barrel cabinets, a candle and a plant on top), and a low
    # bookcase under the task board.
    box("sideboard", (CX - 4, F + 1, Z0 + 1), (CX - 2, F + 1, Z0 + 1), "minecraft:barrel[facing=south]"),
    box("sideboard-plant", (CX - 4, F + 2, Z0 + 1), (CX - 4, F + 2, Z0 + 1), "minecraft:potted_azalea_bush"),
    box("sideboard-candle", (CX - 2, F + 2, Z0 + 1), (CX - 2, F + 2, Z0 + 1), "minecraft:white_candle[candles=3,lit=true]"),
    *[box(f"board-books-{i}", (x, F + 1, Z0 + 1), (x, F + 1, Z0 + 1), books("south")) for i, x in enumerate(range(CX + 2, CX + 5))],
    # Salon: runners down the aisle, either side of the podium and the goal projector.
    box("runner-aft", (CX - 1, F + 1, Z0 + 3), (CX + 1, F + 1, Z0 + 5), "minecraft:light_gray_carpet"),
    box("runner-fwd", (CX - 1, F + 1, Z0 + 12), (CX + 1, F + 1, Z1 - 3), "minecraft:light_gray_carpet"),
    # Wheelhouse: a chart table and a bookcase of pilot books, a lantern over them.
    box("chart-table", (CX + 3, F + 1, Z1 + 3), (CX + 3, F + 1, Z1 + 3), "minecraft:cartography_table"),
    box("pilot-books", (CX - 3, F + 1, Z1 + 3), (CX - 3, F + 1, Z1 + 3), books("east")),
    box("wheelhouse-light", (CX, F + 4, Z1 + 4), (CX, F + 4, Z1 + 4), "minecraft:lantern[hanging=true]"),
    box("wheelhouse-floor", (X0 + 2, F, Z1 + 1), (X1 - 2, F, Z1 + 8), "minecraft:birch_planks", over=["hull"]),
    box("pilot-settee", (X0 + 2, F + 1, Z1 + 5), (X0 + 2, F + 1, Z1 + 7), U("east")),
    box("pilot-side-table", (X0 + 2, F + 1, Z1 + 4), (X0 + 2, F + 1, Z1 + 4), "minecraft:jungle_slab[type=top]", over=["pilot-books"]),
    box("pilot-plant", (X0 + 2, F + 2, Z1 + 4), (X0 + 2, F + 2, Z1 + 4), "minecraft:potted_fern"),
    box("helm-throttles", (CX - 1, F + 2, z(39)), (CX - 1, F + 2, z(39)), "minecraft:lever[face=floor,facing=south,powered=false]", over=["helm-screens"]),
    # Upper deck lounge: a rug inside the settee, planters behind it.
    *[box(f"lounge-rug-{i}", a, b, "minecraft:white_carpet") for i, (a, b) in enumerate([
        ((CX - 3, UP + 1, LZ - 4), (CX + 3, UP + 1, LZ - 4)), ((CX - 3, UP + 1, LZ - 1), (CX + 3, UP + 1, LZ - 1)),
        ((CX - 3, UP + 1, LZ - 3), (CX - 3, UP + 1, LZ - 2)), ((CX + 3, UP + 1, LZ - 3), (CX + 3, UP + 1, LZ - 2))])],
    box("lounge-planter-port", (X0 + 1, UP + 1, LZ + 1), (X0 + 1, UP + 1, LZ + 1), "minecraft:potted_flowering_azalea_bush"),
    box("lounge-planter-starboard", (X1 - 1, UP + 1, LZ + 1), (X1 - 1, UP + 1, LZ + 1), "minecraft:potted_azalea_bush"),
    # Upper deck, to port under the hardtop: a daybed facing the sea, with pillows.
    box("daybed", (X0 + 1, UP + 1, z(25)), (X0 + 2, UP + 1, z(28)), "minecraft:white_wool"),
    box("daybed-pillows", (X0 + 1, UP + 2, z(25)), (X0 + 2, UP + 2, z(25)), "minecraft:light_blue_carpet"),
    box("daybed-throw", (X0 + 1, UP + 2, z(28)), (X0 + 2, UP + 2, z(28)), "minecraft:light_gray_carpet"),
    # Upper deck bar: stools along the counter, a lantern and a pot on it.
    *[box(f"bar-stool-{i}", (X1 - 2, UP + 1, z(s)), (X1 - 2, UP + 1, z(s)), "minecraft:dark_oak_fence") for i, s in enumerate([26, 28])],
    *[box(f"bar-seat-{i}", (X1 - 2, UP + 2, z(s)), (X1 - 2, UP + 2, z(s)), "minecraft:heavy_weighted_pressure_plate") for i, s in enumerate([26, 28])],
    box("bar-lantern", (X1 - 1, UP + 2, z(27)), (X1 - 1, UP + 2, z(27)), "minecraft:lantern"),
    box("bar-jar", (X1 - 1, UP + 2, z(28)), (X1 - 1, UP + 2, z(28)), "minecraft:decorated_pot[facing=west]"),
    # Flybridge helm: throttles.
    box("fly-throttles", (CX - 1, UP + 2, z(36)), (CX + 1, UP + 2, z(36)), "minecraft:lever[face=floor,facing=south,powered=false]"),
    # The aft deck: an ensign on a staff at the stern, a planter by the sofa.
    box("ensign-staff", (X0 + 1, F + 1, z(1)), (X0 + 1, F + 2, z(1)), POLE),
    box("ensign", (X0 + 1, F + 3, z(1)), (X0 + 1, F + 3, z(1)), "minecraft:blue_banner[rotation=8]"),
    box("aft-planter", (X0 + 1, F + 1, z(6)), (X0 + 1, F + 1, z(6)), "minecraft:potted_flowering_azalea_bush"),
    # Mooring lines from the quay bollards to the stern quarters.
    *[box(f"mooring-{i}", (x, QUAY + 1, 213), (x, QUAY + 1, STERN - 1), "minecraft:iron_chain[axis=z]") for i, x in enumerate([CX - 8, CX + 8])],
]


# ---------------------------------------------------------------- the island
rng = random.Random(1)
C = (192, 176)  # island centre
R = 168  # island radius, before the bay and the wobble


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


wobble = [rng.uniform(-1, 1) for _ in range(16)]


def outline(x, zz):
    """Distance inland from the island's outer shore, which wobbles a little around a circle."""
    theta = math.atan2(zz - C[1], x - C[0])
    k = (theta / (2 * math.pi)) * 16
    i = int(math.floor(k)) % 16
    f = k - math.floor(k)
    radius = R + 9 * (wobble[i] * (1 - smoothstep(f)) + wobble[(i + 1) % 16] * smoothstep(f))
    return radius - math.hypot(x - C[0], zz - C[1])


def shore(x):
    """The z of the bay's shore: 205 behind the quay, curving south to the headlands."""
    return 205 + 0.0045 * (x - CX) ** 2


def folds(x, zz):
    """Spurs and gullies running down the hillside, so it is not a smooth bowl."""
    return math.sin(x / 17 + 0.6) * math.sin(zz / 23 + 1.9) + 0.6 * math.sin((x + zz) / 11 + 0.3) * math.cos((x - zz) / 29)


PEAKS = [((192, 62), 58, 95), ((112, 104), 42, 66), ((276, 96), 46, 72), ((236, 40), 30, 50), ((146, 44), 34, 55), ((318, 196), 26, 50),
         ((66, 206), 24, 50), ((150, 128), 12, 30), ((246, 126), 14, 34)]


def ground(x, zz):
    bay = shore(x) - zz
    inland = min(bay, outline(x, zz))
    gentle = math.exp(-(((x - CX) / 105) ** 2))  # 1 behind the beach, falling off towards the cliffy headlands
    if inland >= 0:
        slope = 0.12 * min(inland, 12) + 0.42 * max(inland - 12, 0)  # a beach, then the town's slope
        cliff = 14 * smoothstep(inland / 7) + 0.35 * inland
        h = SEA + 1 + gentle * slope + (1 - gentle) * cliff
        h += 4 * folds(x, zz) * smoothstep((inland - 14) / 30)
        for (px, pz), ph, pr in PEAKS:
            dd = math.hypot(x - px, zz - pz)
            if dd < pr:
                h += ph * (1 - dd / pr) ** 1.7 * smoothstep(inland / 50)
    else:
        out = -inland
        h = SEA - 1 - (gentle * 0.33 * out + (1 - gentle) * (3 + 0.6 * out))
    return min(max(h, 4.0), 118.0)


N = 97
grid = [[round(ground(c * (W - 1) / (N - 1), r * (L - 1) / (N - 1)), 1) for c in range(N)] for r in range(N)]


def lane(id, points, start=None, width=3, surface="minecraft:smooth_sandstone", lamps=13):
    """A lane graded between the ground heights at its corners (or `start` at the first)."""
    total, run = sum(math.dist(a, b) for a, b in zip(points, points[1:])), 0.0
    prof = [[0, start if start is not None else round(ground(*points[0]), 1)]]
    for a, b in zip(points, points[1:]):
        run += math.dist(a, b)
        prof.append([round(run / total, 3), round(ground(*b), 1)])
    out = {"points": [list(p) for p in points], "y": prof, "width": width, "margin": 2, "surface": surface}
    if lamps:
        out["lamps"] = {"every": lamps, "post": "minecraft:dark_oak_fence", "lantern": "minecraft:lantern"}
    return out


# The promenade follows the curve of the bay; the lanes climb from it in switchbacks.
PROM = [(x, round(shore(x) - 8)) for x in range(138, 247, 9)]
CHURCH = (190, 122)
LANES = [
    {**lane("promenade", PROM, start=QUAY, width=9, surface="minecraft:smooth_stone", lamps=12), "y": [[0, QUAY], [1, QUAY]]},
    lane("centre", [(198, 194), (172, 180), (210, 162), (178, 145), (196, 133)], start=QUAY),
    lane("west", [(166, 195), (140, 178), (162, 160), (146, 143), (176, 134)], start=QUAY),
    lane("east", [(226, 195), (252, 179), (230, 161), (246, 145), (210, 134)], start=QUAY),
    lane("top", [(176, 134), (196, 132), (210, 134)]),
]
CHURCH_Y = round(ground(*CHURCH))

terrain = {
    "type": "terrain", "id": "island", "x": [0, W - 1], "z": [0, L - 1], "grid": grid,
    "noise": {"amplitude": 1.5, "scale": 8},
    "ridged": {"amplitude": 10, "scale": 22, "above": 62},
    # Only the church has a levelled piazza; everything else sits on the hillside as it is.
    "flats": [{"x": [CHURCH[0] - 14, CHURCH[0] + 18], "z": [CHURCH[1] - 12, CHURCH[1] + 10], "y": CHURCH_Y, "margin": 6, "shape": "ellipse", "ripple": 0.3}],
    "trails": LANES,
    "sea": {"level": SEA, "bed": "minecraft:sand", "beach": {"block": "minecraft:sand", "above": 2}},
    "depth": 6,
    "surface": "minecraft:grass_block", "rock": "minecraft:stone", "rockAlt": "minecraft:calcite", "base": "minecraft:stone", "rockSlope": 3,
}

harbour = [
    box("quay", (176, 4, 202), (208, QUAY, 213), "minecraft:stone_bricks"),
    box("quay-top", (176, QUAY, 202), (208, QUAY, 213), "minecraft:smooth_stone", over=["quay"]),
    box("quay-edge", (176, QUAY, 213), (208, QUAY, 213), "minecraft:smooth_stone_slab[type=double]", over=["quay", "quay-top"]),
    *[box(f"bollard-{i}", (x, QUAY + 1, 212), (x, QUAY + 1, 212), "minecraft:polished_blackstone_wall") for i, x in enumerate([178, 184, 200, 206])],
    box("crates", (204, QUAY + 1, 204), (205, QUAY + 1, 204), "minecraft:barrel[facing=up]"),
]
# Fishing boats moored either side of the quay, each its own colour.
for i, (x, color) in enumerate([(166, "minecraft:blue_concrete"), (172, "minecraft:red_concrete"), (214, "minecraft:green_concrete"), (220, "minecraft:light_blue_concrete")]):
    harbour.append({"type": "hull", "id": f"gozzo-{i}", "bow": "south", "stern": round(shore(x)) + 3, "length": 9, "center": x, "beam": 5,
                    "keelY": SEA - 1, "deckY": SEA + 1, "bowLength": 4, "shell": WHITE, "deck": "minecraft:spruce_planks",
                    "stripes": [{"y": SEA + 1, "block": color}]})


def eatery(id, xc, wall, pillar, awning):
    z1 = round(shore(xc) - 8 - 4.5)
    return {"type": "restaurant", "id": id, "x": [xc - 5, xc + 5], "z": [z1 - 9, z1], "y": QUAY, "facing": "south", "bay": 3, "terrace": 4,
            "wall": wall, "pillar": pillar, "roof": "minecraft:terracotta", "floor": "minecraft:terracotta",
            "terraceFloor": "minecraft:smooth_stone", "glass": "minecraft:glass", "awning": [awning, "minecraft:white_wool"],
            "table": "minecraft:spruce_slab[type=top]", "chair": "minecraft:dark_oak_stairs", "light": "minecraft:lantern[hanging=true]",
            "candle": "minecraft:white_candle[candles=3,lit=true]", "counter": "minecraft:dark_oak_planks",
            "post": "minecraft:dark_oak_fence", "lantern": "minecraft:lantern", "over": ["island"]}


restaurants = [
    eatery("trattoria", 152, "minecraft:white_terracotta", "minecraft:smooth_sandstone", "minecraft:blue_wool"),
    eatery("osteria", 168, "minecraft:white_concrete", "minecraft:smooth_sandstone", "minecraft:red_wool"),
    eatery("taverna", 216, "minecraft:yellow_terracotta", "minecraft:white_concrete", "minecraft:green_wool"),
    eatery("gelateria", 232, "minecraft:white_concrete", "minecraft:smooth_sandstone", "minecraft:yellow_wool"),
]

town = {
    "type": "hillside", "id": "town", "on": "island", "at": [194, 158], "radius": 92, "houses": 150, "maxSlope": 10,
    "walls": ["minecraft:white_concrete", "minecraft:white_concrete", "minecraft:calcite", "minecraft:smooth_quartz", "minecraft:white_terracotta",
              "minecraft:white_terracotta", "minecraft:smooth_sandstone", "minecraft:yellow_terracotta", "minecraft:pink_terracotta"],
    "stone": "minecraft:smooth_sandstone",
    "roofs": ["minecraft:brick_slab", "minecraft:resin_brick_slab", "minecraft:resin_brick_slab"], "ridge": "minecraft:bricks",
    "flat": 0.3, "twoStorey": 0.45, "terrace": "minecraft:terracotta", "door": "minecraft:spruce_door",
    "shutters": ["minecraft:warped_trapdoor", "minecraft:warped_trapdoor", "minecraft:spruce_trapdoor", "minecraft:dark_oak_trapdoor"],
    "flowers": "minecraft:flowering_azalea_leaves[persistent=true]",
    "pots": ["minecraft:potted_red_tulip", "minecraft:potted_poppy", "minecraft:potted_azure_bluet", "minecraft:potted_fern",
             "minecraft:potted_azalea_bush", "minecraft:potted_flowering_azalea_bush", "minecraft:potted_cactus"],
    "fence": "minecraft:dark_oak_fence",
    "interior": {"floor": "minecraft:spruce_planks", "glass": "minecraft:glass", "table": "minecraft:spruce_slab[type=top]",
                 "chair": "minecraft:spruce_stairs", "light": "minecraft:lantern[hanging=true]", "candle": "minecraft:candle[candles=2,lit=true]",
                 "step": "minecraft:smooth_sandstone_stairs", "rugs": ["minecraft:red_carpet", "minecraft:blue_carpet", "minecraft:orange_carpet"],
                 "ladder": "minecraft:ladder"},
    "church": {"at": list(CHURCH), "facing": "south", "wall": "minecraft:white_terracotta", "bell": "minecraft:bell[attachment=ceiling,facing=north]"},
}

# The beach either side of the quay: umbrellas just above the water, boats pulled up on the sand.
umbrellas = [[x, round(shore(x) - 2)] for x in list(range(141, 172, 7)) + list(range(214, 246, 7))]
beach = {
    "type": "beach", "id": "beach", "on": "island", "umbrellas": umbrellas,
    "colors": ["minecraft:blue_wool", "minecraft:orange_wool", "minecraft:light_blue_wool", "minecraft:red_wool", "minecraft:yellow_wool"],
    "pole": "minecraft:birch_fence", "bed": "minecraft:white_carpet",
    "boats": [[x, round(shore(x) - 1), "south"] for x in (137, 249)],
    "boatColors": ["minecraft:blue_concrete", "minecraft:red_concrete"], "boatWood": "minecraft:spruce",
}

# A lighthouse on the east headland, banded white and red, with a lit lantern room.
LX = 318
LZ = round(shore(LX) - 7)
LY = round(ground(LX, LZ))
lighthouse = []
ring = [(dx, dz) for dx in range(-2, 3) for dz in range(-2, 3) if abs(dx) + abs(dz) <= 3]
for level in range(LY - 3, LY + 16):
    block = "minecraft:red_concrete" if level > LY and (level - LY) % 6 in (4, 5) else WHITE
    lighthouse.append(box(f"lighthouse-{level}", (LX - 2, level, LZ - 1), (LX + 2, level, LZ + 1), block))
    lighthouse.append(box(f"lighthouse-{level}-b", (LX - 1, level, LZ - 2), (LX + 1, level, LZ - 2), block))
    lighthouse.append(box(f"lighthouse-{level}-c", (LX - 1, level, LZ + 2), (LX + 1, level, LZ + 2), block))
lighthouse += [
    box("lantern-room", (LX - 1, LY + 16, LZ - 1), (LX + 1, LY + 18, LZ + 1), "minecraft:glass"),
    box("lantern", (LX, LY + 17, LZ), (LX, LY + 17, LZ), "minecraft:sea_lantern", over=["lantern-room"]),
    box("lantern-cap", (LX - 2, LY + 19, LZ - 2), (LX + 2, LY + 19, LZ + 2), "minecraft:red_concrete"),
    box("lantern-cap-2", (LX - 1, LY + 20, LZ - 1), (LX + 1, LY + 20, LZ + 1), "minecraft:red_concrete"),
    box("lantern-vane", (LX, LY + 21, LZ), (LX, LY + 22, LZ), "minecraft:lightning_rod"),
]

town_zone = [104, 80, 286, 215]  # where the town grows: no forest there
everywhere = {"x": [0, W - 1], "z": [0, L - 1]}
avenue = []  # cypresses either side of the last climb to the church
for (ax, az), (bx, bz) in [((178, 145), (196, 133)), ((176, 134), (186, 132))]:
    n = int(math.dist((ax, az), (bx, bz)) // 4)
    for i in range(n + 1):
        t = i / max(n, 1)
        px, pz = ax + (bx - ax) * t, az + (bz - az) * t
        nx, nz = -(bz - az), bx - ax
        d = math.hypot(nx, nz)
        for side in (-1, 1):
            avenue.append([round(px + side * 3.5 * nx / d), round(pz + side * 3.5 * nz / d)])
grove = [[x + (3 if (zz // 7) % 2 else 0), zz] for x in range(62, 120, 7) for zz in range(186, 236, 7)]
trees = [
    {"type": "trees", "id": "avenue", "on": "island", "style": "cypress", "at": avenue,
     "trunk": "minecraft:spruce_log", "leaves": "minecraft:spruce_leaves[persistent=true]", "minHeight": 10, "maxHeight": 12},
    {"type": "trees", "id": "grove", "on": "island", "style": "olive", "at": grove,
     "trunk": "minecraft:oak_log", "leaves": "minecraft:oak_leaves[persistent=true]", "minHeight": 4, "maxHeight": 6},
    {"type": "trees", "id": "cypresses", "on": "island", "style": "cypress",
     "scatter": {**everywhere, "count": 700, "treeline": 100, "maxSlope": 2, "spacing": 6, "taper": 15,
                 "clusters": {"scale": 24, "threshold": 0.1}, "exclude": [town_zone]},
     "trunk": "minecraft:spruce_log", "leaves": "minecraft:spruce_leaves[persistent=true]", "minHeight": 8, "maxHeight": 13},
    {"type": "trees", "id": "pines", "on": "island", "style": "pine",
     "scatter": {**everywhere, "count": 500, "treeline": 90, "maxSlope": 2, "spacing": 9, "taper": 12,
                 "clusters": {"scale": 40, "threshold": -0.1}, "exclude": [town_zone]},
     "trunk": "minecraft:spruce_log", "leaves": "minecraft:spruce_leaves[persistent=true]", "minHeight": 7, "maxHeight": 11},
    {"type": "trees", "id": "olives", "on": "island", "style": "olive",
     "scatter": {**everywhere, "count": 1600, "treeline": 75, "maxSlope": 2, "spacing": 6,
                 "clusters": {"scale": 30, "threshold": -0.2}},
     "trunk": "minecraft:oak_log", "leaves": "minecraft:oak_leaves[persistent=true]", "minHeight": 4, "maxHeight": 6},
]
# Gardens between the houses: small olive and lemon trees, cypresses, and flowering shrubs.
town_box = {"x": [town_zone[0], town_zone[2]], "z": [town_zone[1], town_zone[3]]}
trees += [
    {"type": "trees", "id": "gardens", "on": "island", "style": "olive",
     "scatter": {**town_box, "count": 500, "treeline": 90, "maxSlope": 4, "spacing": 5},
     "trunk": "minecraft:oak_log", "leaves": "minecraft:oak_leaves[persistent=true]", "minHeight": 4, "maxHeight": 5},
    {"type": "trees", "id": "garden-cypresses", "on": "island", "style": "cypress",
     "scatter": {**town_box, "count": 160, "treeline": 90, "maxSlope": 4, "spacing": 7},
     "trunk": "minecraft:spruce_log", "leaves": "minecraft:spruce_leaves[persistent=true]", "minHeight": 7, "maxHeight": 10},
]
shrubs = {
    "type": "boulders", "id": "shrubs", "on": "island",
    "scatter": {**town_box, "count": 900, "treeline": 90, "maxSlope": 4, "spacing": 3},
    "minSize": 1, "maxSize": 2,
    "blocks": ["minecraft:azalea_leaves[persistent=true]", "minecraft:oak_leaves[persistent=true]", "minecraft:flowering_azalea_leaves[persistent=true]"],
    "snow": "minecraft:flowering_azalea_leaves[persistent=true]",
}
rocks = {
    "type": "boulders", "id": "rocks", "on": "island",
    "scatter": {**everywhere, "count": 400, "treeline": 110, "maxSlope": 3, "spacing": 10, "exclude": [town_zone]},
    "minSize": 1, "maxSize": 3, "blocks": ["minecraft:stone", "minecraft:calcite", "minecraft:andesite"], "snow": "minecraft:calcite",
}

cameras = [
    {"type": "camera", "id": "vista", "name": "vista", "at": [CX - 2.5, F + 2.6, z(7) + 0.5], "yaw": 180, "pitch": -8},
    {"type": "camera", "id": "salon", "name": "salon", "at": [CX + 0.5, F + 3.4, Z0 + 1.5], "yaw": 0, "pitch": 18},
    {"type": "camera", "id": "lounge-view", "name": "lounge", "at": [CX + 0.5, UP + 3.4, z(4) + 0.5], "yaw": 0, "pitch": 22},
    {"type": "camera", "id": "meeting-view", "name": "meeting", "at": [CX + 4.5, UP + 3.4, z(17) + 0.5], "yaw": 30, "pitch": 24},
    {"type": "camera", "id": "goal-view", "name": "goal", "at": [CX + 0.5, F + 2.6, Z0 + 3.5], "yaw": 0, "pitch": 0},
    {"type": "camera", "id": "wheelhouse-view", "name": "wheelhouse", "at": [CX + 0.5, F + 2.8, Z1 + 1.5], "yaw": 0, "pitch": 12},
    {"type": "camera", "id": "stairs", "name": "stairs", "at": [CX - 2.5, F + 3, z(1) + 0.5], "yaw": -35, "pitch": -5},
    {"type": "camera", "id": "yacht", "name": "yacht", "at": [CX + 30.5, F + 6, z(34) + 0.5], "yaw": 110, "pitch": 8},
    {"type": "camera", "id": "exterior", "name": "exterior", "at": [262.5, F + 14, 330.5], "yaw": 142, "pitch": 7},
    {"type": "camera", "id": "town-view", "name": "town", "at": [196.5, CHURCH_Y + 6, CHURCH[1] + 14.5], "yaw": 0, "pitch": 18},
    {"type": "camera", "id": "quay-view", "name": "quay", "at": [206.5, QUAY + 2.6, 208.5], "yaw": 150, "pitch": -6},
]

design = {
    "name": "riviera-yacht",
    "version": 1,
    "seed": 11,
    "size": [W, H, L],
    "floorY": FLOOR,
    "shell": {"kind": "none"},
    "atmosphere": {"biome": "minecraft:savanna", "seaBiome": "minecraft:warm_ocean", "weather": "clear", "time": 3000},
    "surroundings": {"sea": {"level": SEA, "floor": "minecraft:sand"}},
    "parts": [terrain, *harbour, *restaurants, town, *yacht, *office, *details, *lighthouse, beach, *trees, shrubs, rocks, *cameras],
}

out = f"{root}/designs/riviera-yacht/v1.json"
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
