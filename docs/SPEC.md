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
6. **Reachable**: a path exists from `spawn` to every desk and station. Not enforced yet.
7. **Round-trip tested**: `.schem` output is parsed back in tests, not only written.
8. **Readable output**: one command prints what was written and whether the layout validates.
9. **Licensing**: MIT, same as upstream. The name ACHQ does not claim to be the official project.

## Generator

Commands (from `generator/`):
- `npm run generate -- --design <name> [--version N] --origin x,y,z --out <dir>` renders `designs/<name>/v<N>.json` (latest when no version) to `office.schem`, `office.nbt` and `agentcraft-anchors.json`, then validates.
- `npm run validate -- <agentcraft-anchors.json>` checks a layout file.

Planned commands (not built):
- `design new <name> "<prompt>"` creates `designs/<name>/v1.json`.
- `design revise <name> "<feedback>"` reads the latest version and writes the next one.

**Design file.** `src/design.ts` holds the zod schema. A design is a name, version, seed, size, a `shell` (materials, door, glass wall) and a list of **parts**, each with a unique `id` that a revision can target. Part types: `deskRow`, `station`, `seatedTable`, `lanternGrid`, `podium`, `taskWall`, `camera`, `spot`. Each part renders its blocks and its anchors (`src/render.ts`), and `seatedTable` and `deskRow` always emit seats that follow the seat contract. Parts apply in list order, which fixes palette and anchor order, so output is deterministic. Directions are names (`south`, ...), not yaw.

Current design: `designs/test-office/v1.json`, a 25 x 8 x 19 office. Stone-brick box, glass south wall, a door on the north wall, six desks with chairs and monitors, four lectern stations, a six-seat meeting table, a six-seat lounge, lanterns, a task wall, a podium, an atrium, and a spawn. Monitors, lecterns and the podium are vanilla stand-ins because the mod's own blocks are not placed yet. Verified in game: paste origin, anchors on solid ground, seats, lighting.

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

## Fork policy

This is a standalone project, not a contribution back to AgentCraft. It is a fork of [blendi-remade/agentcraft](https://github.com/blendi-remade/agentcraft) so upstream fixes can still be pulled, as the SandboxServers and elliotnex forks do. Other forks of note: [SandboxServers/agentcraft](https://github.com/SandboxServers/agentcraft) (publishes the anchors), [elliotnex/agentcraft](https://github.com/elliotnex/agentcraft) (a town of projects, any model), [larattalabs/agentcraft-worlds](https://github.com/larattalabs/agentcraft-worlds) (one building per repository).

The anchor data is not an isolated config: the mod's Java reads it directly, so there is no clean upstream PR that would freeze it into a reference file. When rebasing, check `HqClientFeature.java` and `AgentManager.java` first.

## Repo layout

```
generator/    TypeScript toolkit (Node 22, vitest, zod, prismarine-nbt)
designs/      saved design versions, designs/<name>/v<N>.json
mod/          AgentCraft Fabric mod (Gradle, Java 25, MC 26.3), reference and test target
docs/         SPEC.md (this file)
```

## Open questions

- **Paste origin**: for the vanilla `.nbt` with a structure block, the min corner lands where expected (verified). For `.schem` with WorldEdit it depends on how `Offset` is read. Untested.
- **`DataVersion`**: 4325 is a guess, but a structure block loaded the `.nbt` with it. The real value for 26.3 is unknown.
- **WorldEdit availability**: no confirmed build for Minecraft 26.3, which is why it is not a dependency. Until the mod loader exists, small builds use a vanilla structure block (the `.nbt` output), which has a size limit per load. I believe it is 48 blocks per axis; this is not verified.
- **Mod loader**: a `/achq load <design> [version]` command that places a build from a file in chunks over many ticks, clears the previous version's bounds first, and installs the anchors file in the same step. Not built; the design of the file it reads is open.
- **Mod blocks**: `mod/FEATURES.md` says the mod's own blocks carry a binding string (monitor = agent id, status lamp = `agent:<id>`, and so on) that the HQ builder sets, and `HqWorldDriver` drives their state. A generated office with vanilla stand-ins probably shows no live monitors or lamps. Whether anchors alone are enough for agent movement is untested.
- **Seats**: the generator now places a bottom-half stairs block at every `desk_*`, `lounge*` and `meeting*` anchor with a free cell on the right (tested). Whether the mod's agents sit and walk correctly is not yet confirmed in game with agents running.
- **Reachability**: how to check a walkable path from spawn to every anchor. The mod's `GridPathfinder.java` is the reference.
- **Hand edits**: whether to read hand-built changes back into the design, or keep the design file as the only source of truth. The second is the v1 rule.
- **Design format**: decided as parts with ids (see Generator). Open: a raw `fill` part type for one-offs, and a terrain section for the chalet.
- **Terrain size**: a mountain range in one schematic is a very large paste. WorldEdit has block-change limits, and the HQ world game rule is capped at 1,000,000 block modifications (`mod/DEV.md`). The paste may need to be split into tiles, or the terrain written another way.
- **Claude-driven step**: how it feeds anchors in as constraints.

## Definition of done for v1

- `npm run generate` writes a schematic and an anchors file for the snowy chalet, and the layout validates.
- Pasting the schematic at the origin puts the building where the anchors say it is, verified in game.
- `/agentcraft anchors` in the HQ world lists the generated layout, and teleporting to `spawn` and a desk lands on safe ground.
- Agents run in the generated office: they reach their desks and stations.
- A prompt, not hand-written code, can produce a second office that also passes validation.
- One round of feedback ("move the library to the east end") yields a `v2` that moves only the library, still validates, and can be pasted over `v1` after clearing its bounds.
