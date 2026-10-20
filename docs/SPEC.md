# ACHQ — Spec

A generator that turns a prompt or concept into an AgentCraft-compatible HQ: a building shell plus the anchors the mod needs to run agents inside it. The first test case is a snowy mountain chalet with views of a mountain range; the goal is the pipeline, not one building.

## North star

The user describes an HQ ("a snowy chalet in the mountains with views of a mountain range") and gets back a build file and an anchors file. A small loader added to the mod places the build and installs the anchors; the build file also works with WorldEdit or a vanilla structure block. The agents then sit at the desks, walk between stations, and spawn the player where the layout says, with no hand-fixing. The user then tests the world and gives feedback ("more desk spacing", "move the library next to the fireplace"), and the generator revises that same design instead of starting over. Each revision is a new numbered version, so any earlier one can be regenerated. Nothing the generator does requires changing existing upstream mod code.

## Architecture

```
prompt / concept                      Generator (Node 22 + TypeScript)
 (planned: Claude)  ───────────────>   ├─ Office builder: shell, fixtures, anchors (today: one fixed office)
                                       ├─ Volume: block grid -> Sponge v3 .schem writer
                                       └─ Validator: anchor contract + bounds
                                                  │
                          ┌───────────────────────┴──────────────────────┐
                          v                                              v
                    office.schem                              agentcraft-anchors.json
                          │ WorldEdit //paste                            │ copied into the world folder
                          v                                              v
              Minecraft 26.3 world  <───── AgentCraft mod (Fabric, Java 25), unmodified, reads anchors
```

- **Anchors are hard constraints.** Desks, monitors, stations, and spawn are tracked data the mod reads back for agent motion and the player start. The generator fixes them first and generates only the look around them.
- **The mod is untouched.** `mod/` is the reference implementation and test target. The files that read anchors, `HqClientFeature.java` and `AgentManager.java`, are the coupling points to watch when merging upstream.
- **The design file is the source of truth.** A design is a plain JSON description of the HQ (rooms, fixtures, materials, anchor placements). The schematic and the anchors are rendered from it and are never edited directly. A prompt creates a design, and feedback produces the next version of it. Designs are saved as `designs/<name>/v<N>.json` and are committed.
- **Local coordinates, then an origin.** The office is built in local coordinates (x east, y up, z south). A paste origin is added when anchors are written, because the mod stores absolute world positions.
- Transport: none. Output is plain files. The anchors file is `agentcraft-anchors.json` in the world folder, loaded only in the world the mod treats as the HQ world (`AgentCraft HQ`).

## Anchor contract (v1), source of truth is `mod/src/main/java/dev/agentcraft/layout/`

`AnchorNames.java` defines the names, `Anchors.java` the JSON, `Anchor.java` the meaning of each coordinate. The generator mirrors them in `generator/src/anchors.ts`. If they disagree, the Java wins.

File shape: `{ "layout": string, "revision": int, "bounds"?: {minX..maxZ}, "anchors": { name: {x, y, z, yaw, pitch} } }`. `yaw` and `pitch` default to 0. Coordinates are rounded to 3 decimals by the mod.

Yaw follows Minecraft: 0 = facing +Z (south), 90 = -X (west), 180 = -Z (north), -90 = +X (east).

Meaning of `x, y, z` by anchor kind:
- Agent spots and stations (`desk_*`, shared stations, `entrance`, `spawn`): where the feet stand. `yaw` is the facing.
- Block surfaces (`monitor_*`, `task_wall`, `decision_podium`): centre of the surface. `yaw` is the direction the front faces.
- Cameras (`cam_*`): eye position. `yaw` and `pitch` are the view direction.

Required names:
- `desk_<agentId>` and `monitor_<agentId>` for each agent in the cast: `marlow`, `juniper`, `kit`, `wren`, `rowan`, `tove` (from the mod's `cast.json`).
- Shared stations: `library`, `terminal`, `testbench`, `mergestation`, `meeting`, `lounge`, `user`. Extra slots are `<station>_2` and up.
- Fixtures: `task_wall`, `decision_podium`, `goal_atrium`, `entrance`, `spawn`.
- Extra names (such as `cam_overview`) are allowed.

## Practicality requirements (non-negotiable)

1. **Contract first**: a layout missing a required anchor, or with an anchor outside its bounds, fails validation and is never written as "ok".
2. **Deterministic**: the same design version and origin give byte-identical output. Randomness, when added, takes a seed stored in the design.
3. **Revisable**: a revision changes only what the feedback asks for. Fixtures the feedback did not mention keep their positions, so a tweak does not move the whole building.
4. **Additive mod changes only**: new code goes in its own package (`dev.agentcraft.achq`), and existing upstream files are left alone, so upstream merges stay easy. WorldEdit is never a required dependency; `.schem` and `.nbt` are outputs for people who have it.
5. **Standing spots are safe**: every agent spot has a solid block under it and two air blocks above it.
6. **Reachable**: a path exists from `entrance` and from `lounge` to every place an agent stands (to a seat's step-in cell for seats), as the mod's own `dev.hq.check` (`HqCheck`) measures it. Spots are every anchor except cameras, `monitor_*`, `seat_*`, `task_wall`, `decision_podium`, `goal_atrium` and `spawn` (the mod's `isSpot`). A seat is bottom stairs, a bottom slab or a block 0.3 to 0.7 high, and agents step in from its right-hand side, then the left, behind, in front (`Seats.approach`). Enforced by `check`, using the same movement rules as the mod's `GridPathfinder` (8 directions, no corner cutting, 1-block steps; floor needs a collision top of at least 0.9). Agents can climb any 1-block ledge, including furniture, so a wall must be 3 high to stop them.
7. **Round-trip tested**: `.schem` and `.nbt` output is parsed back in tests, not only written. Saved versions render byte-identically: `test/golden.test.ts` holds a fingerprint of every version's `.nbt`, so a code change that would alter an old version fails.
8. **Readable output**: one command prints what was written and whether the layout validates.
9. **Licensing**: MIT, same as upstream. The name ACHQ does not claim to be the official project.

## Generator

Commands (from `generator/`):
- `npm run generate -- --design <name> [--version N] --origin x,y,z --out <dir>` renders `designs/<name>/v<N>.json` (latest when no version) to `<name>.schem`, `<name>.nbt` and `agentcraft-anchors.json`, then validates. Large volumes leave air out of the `.nbt` (above 250,000 cells), so the area must already be clear.
- `npm run check -- --design <name> [--version N]` runs every design check: the anchor contract, parts overwriting each other, parts outside the volume, seats (bottom stairs facing right, free right-hand cell, head room), slot spacing of at least 1.6, standing spots, and reachability from `spawn`. `generate` runs the same checks first and writes nothing if any fail.
- `npm run preview -- --design <name> [--version N] [--port N]` serves a 3D viewer at `http://localhost:5173/` (three.js, no build step, no Minecraft assets). It shows blocks as flat-coloured boxes with the real shapes of slabs, stairs and lanterns, the anchors with facing arrows and optional labels, a walkable-floor overlay (green reachable, red not), the check results, a layer slider (`Roof off` is the default cutaway), and fixed views (iso, plan, four elevations). The scene is rebuilt from the design file on every request and the page polls, so editing the JSON updates the view within a second. Changes to the TypeScript (new parts, renderer fixes) need the server restarted. View state lives in the URL hash (`#view=top&walk=1&labels=1&cut=3`), so any view can be linked or scripted. Flat colours are enough to judge massing, layout, sightlines and seats; they cannot judge how real textures look together.
- `play` (or `play.cmd` at the repo root, which works where PowerShell blocks scripts) does the whole in-game try in one go: writes the files, copies the `.nbt` and the anchors into the HQ world, starts `gradlew runClient` with the studio autobuild off, waits for the world through the mod's DevBridge (`ws://127.0.0.1:7879`, on by default in dev runs), runs the setup commands with `dev.command`, takes a screenshot through `cam_vista` into `artifacts/shots/`, and leaves the game running with the player at `spawn`. Defaults: `snowy-chalet`, latest version, origin `40,64,40`. The game must be closed first. Verified 2026-10-20 with v7: placed in 8 seconds.
- `generate` keeps the air inside the HQ's box (the agents' anchors plus 12 blocks round, 4 below, 16 above) even when it leaves air out elsewhere, so re-placing a newer version over an older one rewrites the building exactly while the landscape stays sparse. Blocks built by hand inside that box are overwritten, which is the v1 rule.
- `generate` also writes `<name>.commands.txt` and prints the commands to run in game (place the structure, and apply the design's atmosphere if it has one).
- `npm run validate -- <agentcraft-anchors.json>` checks a layout file.

Planned commands (not built):
- `design new <name> "<prompt>"` creates `designs/<name>/v1.json`.
- `design revise <name> "<feedback>"` reads the latest version and writes the next one.

**Design file.** `src/design.ts` holds the zod schema. A design is a name, version, seed, size, a `shell` (materials, door, glass wall) and a list of **parts**, each with a unique `id` that a revision can target. Part types: `deskRow`, `station`, `seatedTable`, `lanternGrid`, `podium`, `taskWall`, `camera`, `spot`, and for buildings `box` (air carves), `gableRoof` (timber underside plus snow cap), `gableEnd` (solid or glazed with mullions), `deck` (railing and posts) and `fireplace` (stone body, hollow chimney, lit campfire), `terrain` (a height field from a coarse grid plus seeded noise, with a flat shelf, rock on steep ground and snow elsewhere; ground is never claimed, so any part may overwrite it) and `trees` (tiered snow-laden spruces standing on a terrain part, listed or scattered as a forest up to a tree line, clipped at the volume edge) and `village` (a church and small houses with glowing windows and street lamps, on level ground). Terrain also takes `peaks`, ridged `crags` that fade in with altitude, several `flats` (rectangles or ellipses, optionally rippled) and a shell `depth`. It can cut `trails` (a graded bench along a polyline, following a height profile, with lamp posts) and `rivers` (a channel with gravel bed and banks, open water along chosen stretches, frozen elsewhere and always at the volume edge so water cannot run out of a pasted structure). Trees take `clusters` (clearings), a `taper` towards the tree line and a `dead` fraction; `boulders` scatter snow-capped rocks; the village has a `varied` style (lodges, accent walls, chimneys, plinths on slopes, a church placed apart) beside the original `classic` one, which older designs keep so they render unchanged. Landscape code lives in `generator/src/landscape.ts`. The shell is either the original box or `{"kind":"none"}`, where the parts build everything. `floorY` sets the floor layer so a foundation fits below it. A part may overwrite another only if it lists that part's id in `over`; `check` reports any other overwrite. Each part renders its blocks and its anchors (`src/render.ts`), and `seatedTable` and `deskRow` always emit seats that follow the seat contract. Parts apply in list order, which fixes palette and anchor order, so output is deterministic. Directions are names (`south`, ...), not yaw.

Style notes live in `docs/styles/` (first: `snowy-chalet.md`, written from the images in `references/`). A design of a style reads its note.

Current designs: `designs/snowy-chalet/v6.json` (480 x 176 x 512: the chalet high on a north-west shoulder facing south, a river that starts in the mountains below it and winds away to the south-east, a village in a bend of the river about 270 blocks off to the right, a path from the front door down to its street, a frozen tributary, scattered mountains of many heights, and thousands of spruces; the town is off the line of sight and only seen in the distance, so the client needs a view distance of about 20 chunks or more to see it). v3 (160 x 128 x 176, valley with the town straight ahead) is the version tested in game; v4 and v5 are intermediate steps. `tools/make-snowy-chalet-v6.py` produces v6 from v3's chalet. and `designs/test-office/v1.json`, a 25 x 8 x 19 office. Stone-brick box, glass south wall, a door on the north wall, six desks with chairs and monitors, four lectern stations, a six-seat meeting table, a six-seat lounge, lanterns, a task wall, a podium, an atrium, and a spawn. Monitors, lecterns and the podium are vanilla stand-ins because the mod's own blocks are not placed yet. Verified in game: paste origin, anchors on solid ground, seats, lighting.

Schematic format: Sponge v3, gzipped NBT, block index `x + z*Width + y*Width*Length`, varint block data. Written by hand with `prismarine-nbt` because `prismarine-schematic` is unlikely to know Minecraft 26.3. `DataVersion` defaults to 4325 (about 1.21.5); WorldEdit upgrades older versions and rejects newer ones.

## Iteration loop

1. `design new` turns a prompt into `v1.json`. `generate` renders it, and you paste it and test in game.
2. You give feedback, in plain words or by editing the JSON by hand. `design revise` writes `v2.json`, changing only what the feedback touches.
3. Render again and re-paste. Each version records its bounds, so the old footprint can be cleared first with WorldEdit (`//set 0` over the previous bounds). Without that, blocks the new version dropped stay behind.
4. The anchors file's `revision` goes up with each version, and every version stays on disk, so you can go back.

**Hand edits in the world.** Re-pasting overwrites any block you placed by hand inside the bounds. The v1 rule: the design file wins. A tweak you want to keep goes back in as feedback, or you make it after the last paste. The mod's own HQ builder keeps player changes by comparing against a stored plan (`FEATURES.md`); a tool that reads a hand-edited region back into the design, through a WorldEdit export, is a later option and is not designed yet.

## Build approach: don't place every block by hand

1. **WorldEdit**: bulk fills, copy-paste, replace, undo. The import path for generated schematics.
2. **Schematics**: pre-built structures from the community, imported with WorldEdit or Litematica.
3. **Structure blocks**: vanilla save and paste, e.g. design one agent pod and clone it per agent.
4. **MCEdit successors / WorldPainter**: edit the save file outside the game. WorldPainter leans toward terrain.
5. **MagicaVoxel pipeline**: model in MagicaVoxel, convert to a schematic, import with WorldEdit. Design before touching the live world. Not walked through yet.

## AI generation: prompt to schematic

| Tool | What it does |
| --- | --- |
| [Promptcraft](https://github.com/cgoulart35/Promptcraft) | Claude Code plugin; describe a build in conversation, get a `.schem` pasted directly. Conversational and iterative. |
| [Minecraft Builder MCP server](https://github.com/joshdevous/minecraft-builder-claude-mcp-server) | Natural language to WorldEdit-compatible `.schem` via Claude, no API costs. |
| [Structmatic](https://structmatic.com/) | Web tool: text or an existing schematic in, 3D studio to adjust, schematic out. |
| [BlockGPT](https://blockgpt.ai/) | Text to structure; exports `.schematic`, `.litematic`, or `.nbt`. |
| [Schematic Helper](https://schematichelper.com/) | Prompt to `.schem`. |

These tools generate decoration with no knowledge of anchors. The plan is to feed AgentCraft's anchor, spawn, and desk data in as constraints, or to generate the shell with them and then run the result through this project's validator.

## First example: snowy mountain chalet

The chalet is the first design to build. It is a timber-and-stone lodge on a snowy slope, with a glass-fronted main hall facing a mountain range. Desks line the windows so each agent has the view, the lounge sits around a stone fireplace, and the entrance has a small porch with a snow-dusted roof.

What it adds beyond a plain building:
- **Terrain.** The range is generated terrain, not a built shape. A noise heightmap gives ridges, with snow and stone blocks above a snow line and spruce on the lower slopes. The build volume is much larger than the chalet: hundreds of blocks across, millions of blocks in total.
- **Distance.** Render distance is 16 chunks (256 blocks) in the dev client, so the visible range has to sit inside that. Far peaks are drawn as larger, simpler shapes.
- **Snow.** Snow layers and powder snow on roofs, ledges and slopes. A fresh world is superflat (grass at y=64), so the slope is built up from there.
- **Warmth.** Lanterns, a fireplace and warm light inside against the cold outside.

The terrain and the building are separate parts of the design, so a revision can change the range without moving the desks.

## Other scene concepts: cliff overlooking the ocean

1. **Glass-walled research station**: half-carved into the cliff face, half-cantilevered over the water. Each agent's workspace gets a different ocean view.
2. **Lighthouse and dock cluster**: a tall central tower as the coordination hub, small satellite studios along the cliff edge joined by rope bridges, roughly one per agent.
3. **Sunken amphitheater**: carved into the cliff top, open-air, ocean backdrop. A gathering or standup space more than individual offices.
4. **Greenhouse / observatory**: heavy glass, a reflecting pool mirroring the sky, a contemplative feel.

These come after the chalet.

## Polish backlog (for when the scene is finalized)

Vanilla "hacks" that sell a scene without new blocks. None of this is built; each needs a quick in-game test first, and the confidence notes say how sure I am that it works as described.

- **Chimney smoke** (confident). A lit `campfire` makes a smoke column; with a hay bale under it (`signal_fire`) the column is tall. The fireplace already has a campfire in the firebox; a second one capped on the chimney top, or a hollow flue above the fire, is the thing to try. Village houses could get small chimneys the same way, so the town smokes at night.
- **Steam and mist** (needs testing). Hot-tub steam and valley mist can come from campfire smoke or from particles; a lit campfire cannot be waterlogged, so a tub needs the fire hidden beside or under it. A waterfall-like mist at the cliff base is the same idea.
- **Real waterfalls** (needs testing). Flowing water from a source high on a cliff. Whether water placed from a structure file keeps flowing needs checking.
- **Bubble columns** (confident). `soul_sand` under water pushes bubbles up; `magma_block` pulls down. A bubbling tub or spring.
- **Ambient particles from a generated datapack** (fairly confident). A world datapack with a ticking function can emit `particle` commands (smoke over the chimney, mist in the valley, drifting snow) at fixed positions. The generator could write this datapack next to the structure file, with positions taken from the design. This avoids needing the mod loader for effects.
- **Atmosphere** (built, untested in game). Vanilla has no snow weather as such: snow is rain in a cold biome, and the HQ world is a plains meadow, so rain there falls as water. A design can set `atmosphere: {biome, weather, time}`, and `generate` writes and prints the in-game commands for it: force-load the area, `/place template`, raise `max_block_modifications` (the mod pins it at 1,000,000 and re-applies that at every start), `/fillbiome` over the whole box with a cold biome such as `minecraft:snowy_taiga`, `/time set`, `/weather rain`, and `/forceload remove all`. The mod already holds weather and time still (`advance_weather` and `advance_time` off) and sets `max_snow_accumulation_height` to 0, so snow falls without piling up. Caveats: the cold biome lets open water freeze over time (lanterns nearby prevent it), and a custom biome with its own sky and fog colours, from a datapack, is the next step if the stock ones are not right.
- **Light without blocks** (confident). Invisible `light` blocks (levels 0 to 15) place glow exactly where wanted, such as warm pools under the eaves or the windows of distant houses, without a visible lantern.
- **Soft shapes** (confident). `snow` layers, carpets, trapdoors, chains and candles for thin details: snow banks along the deck, shutters, candlelit sills.
- **Display entities** (needs testing). Vanilla `block_display`, `item_display` and `text_display` entities can be scaled and rotated freely, which would let a roof, a sign or a distant peak be any shape. Structure files can carry entities, but how a `.nbt` loader handles them is untested.
- **Distant mountains** (design question). Beyond the render distance of about 256 blocks, peaks must be simple large shapes, possibly built with display entities or very low-detail terrain.

## Fork policy

This is a standalone project, not a contribution back to AgentCraft. It is a fork of [blendi-remade/agentcraft](https://github.com/blendi-remade/agentcraft) so upstream fixes can still be pulled, as the SandboxServers and elliotnex forks do. Other forks of note: [SandboxServers/agentcraft](https://github.com/SandboxServers/agentcraft) (publishes the anchors), [elliotnex/agentcraft](https://github.com/elliotnex/agentcraft) (a town of projects, any model), [larattalabs/agentcraft-worlds](https://github.com/larattalabs/agentcraft-worlds) (one building per repository).

The anchor data is not an isolated config: the mod's Java reads it directly, so there is no clean upstream PR that would freeze it into a reference file. When rebasing, check `HqClientFeature.java` and `AgentManager.java` first.

## Repo layout

```
generator/    TypeScript toolkit (Node 22, vitest, zod, prismarine-nbt); viewer/ is the browser preview page (three.js)
designs/      saved design versions, designs/<name>/v<N>.json
mod/          AgentCraft Fabric mod (Gradle, Java 25, MC 26.3), reference and test target
docs/         SPEC.md (this file)
```

## Open questions

- **Paste origin**: for the vanilla `.nbt` with a structure block, the min corner lands where expected (verified). For `.schem` with WorldEdit it depends on how `Offset` is read. Untested.
- **`DataVersion`**: 4325 is a guess, but a structure block loaded the `.nbt` with it. The real value for 26.3 is unknown.
- **WorldEdit availability**: no confirmed build for Minecraft 26.3, which is why it is not a dependency. Until the mod loader exists, small builds use a vanilla structure block (the `.nbt` output), which has a size limit per load. I believe it is 48 blocks per axis; this is not verified.
- **Mod loader**: a `/achq load <design> [version]` command that would place a build in chunks over many ticks, clear the previous version's bounds first, and install the anchors file in the same step. No longer needed for placement (see Terrain size); what is left is convenience: clearing the old version before a re-place (large templates leave out air, so blocks from the previous version stay) and installing the anchors file. Not built.
- **Mod blocks** (built in the generator, untested in game): every AgentCraft station block (`agentcraft:monitor`, `status_lamp`, `task_board`, `decision_podium`, `merge_station`, `console_terminal`, `memory_archive`) saves one string field, `binding`. The generator stores it as block entity data and writes it into the `.nbt` (`nbt` compound) and the `.schem` (Sponge block entities). `deskRow` takes a `screen` (a 3 x 2 monitor wall bound to the agent, as the studio does) and a `lamp` (bound `agent:<id>`); `station` and `podium` take a `binding`; a `device` part places one bound block, usually a lamp (`merge`, `decisions`, `goal:atrium`, `ci:#1`, `beacon`). Monitor and task board panels get their `up`/`down`/`left`/`right` connection flags set from their neighbours in a final pass, as the mod's `PanelBlock.connect` does (left is the clockwise side of the facing). v7 of the chalet uses all of this. Whether `HqWorldDriver` picks up blocks placed from a template the same way as builder-placed ones is the thing to confirm in game.
- **Seats**: the generator now places a bottom-half stairs block at every `desk_*`, `lounge*` and `meeting*` anchor with a free cell on the right (tested). Whether the mod's agents sit and walk correctly is not yet confirmed in game with agents running.
- **Reachability**: implemented in `generator/src/walk.ts` as a mirror of `GridPathfinder.java`. Only blocks the generator places have exact collision heights; unknown blocks count as full blocks. Not yet compared against the mod on a real world.
- **Hand edits**: whether to read hand-built changes back into the design, or keep the design file as the only source of truth. The second is the v1 rule.
- **Design format**: decided as parts with ids (see Generator). Open: a raw `fill` part type for one-offs, and a terrain section for the chalet.
- **Terrain size**: v6 is 43 million cells and about 1 million blocks; its `.nbt` is 5 MB and generates in 5 seconds, and the preview draws it. **Verified in game (2026-10-10):** `/place template minecraft:snowy-chalet 40 64 40` places the whole 480 x 176 x 512 template in the HQ world after force-loading the area in 16 x 16 chunk tiles, and the `/fillbiome` over the same box was accepted. So large builds do not need tiles or the mod loader to be placed. A mountain range in one schematic is a very large paste. WorldEdit has block-change limits, and the HQ world game rule is capped at 1,000,000 block modifications (`mod/DEV.md`). The paste may need to be split into tiles, or the terrain written another way.
- **Claude-driven step**: how it feeds anchors in as constraints.

## Definition of done for v1

- `npm run generate` writes a schematic and an anchors file for the snowy chalet, and the layout validates.
- Pasting the schematic at the origin puts the building where the anchors say it is, verified in game.
- `/agentcraft anchors` in the HQ world lists the generated layout, and teleporting to `spawn` and a desk lands on safe ground.
- Agents run in the generated office: they reach their desks and stations.
- A prompt, not hand-written code, can produce a second office that also passes validation.
- One round of feedback ("move the library to the east end") yields a `v2` that moves only the library, still validates, and can be pasted over `v1` after clearing its bounds.
