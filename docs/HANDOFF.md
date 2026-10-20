# ACHQ handoff, 2026-10-10 (late evening), updated 2026-10-20

## Update, 2026-10-20

- Remote `main` has a new commit (`ec211b1`), apparently the merge of PR #2 (`chalet-terrain`). The local checkout was still on `chalet-terrain`: pull `main` and branch before committing.
- Built (uncommitted at the time of writing): the mod's own blocks with bindings (`deskRow.screen` and `lamp`, `station.binding`, `podium.binding`, the `device` part, panel connection flags, block entity data in `.nbt` and `.schem`); `check` aligned with the mod's `HqCheck` and `Seats` (spots, seats, step-in sides, reachability from `entrance` and `lounge`); `hqBox` so big structures keep air inside the HQ and re-placing rewrites the building; a golden test that pins every saved version's output; a Building view in the preview; `snowy-chalet` v7 (v6 with the mod's blocks bound; the back desk row moved one block west to fit tove's screen). 103 tests pass; every earlier version renders byte-identically.
- v7 output for the world at origin `40,64,40` was written to `mod/run/achq-test`. Untested in game: whether the monitors show logs and the lamps react to agents.
- `play.cmd` at the repo root does the whole in-game try (write, copy, launch, place, screenshot); verified with v7 (placed in 8 s). It calls `gradlew.bat` by full path because `NoDefaultCurrentDirectoryInExePath=1` is set in this environment.
- Needs the user: the interior's feel (six 3 x 2 screens make the hall read like a control room), and the in-game test of v7.

Written on the Windows machine at the end of a long session. This is context, not a task list: read it, then ask which task to do. `docs/SPEC.md` is the plan of record and has the detail.

Git state below is from `git status` and `git log` at the time of writing. Verify with `git status -sb` and `git log --oneline -5`.

## What ACHQ is

A generator that turns a design (JSON) into an AgentCraft-compatible HQ: a structure file (`.nbt`), an anchors file (`agentcraft-anchors.json`) the Fabric mod loads, and the in-game commands to place it. Repo: `brycedorn/achq`. The goal is the pipeline, not one building. First example: a snowy mountain chalet in a river valley.

## Repo state

- Branch `chalet-terrain`, last commit `f91eef3` ("add river, atmosphere; landscape-scale chalet"), pushed, working tree clean.
- Whether the PR for this branch is open or merged: unknown. Check on GitHub. The PR must target `brycedorn/achq` `main`, never `blendi-remade/agentcraft`.
- Layout: `generator/` (TypeScript, Node, vitest, zod, three.js for the viewer), `designs/` (saved versions), `docs/` (SPEC, styles, this file), `tools/` (authoring script), `mod/` (upstream Fabric mod, untouched).
- 77 tests pass, typecheck is clean, `npm.cmd run check` passes for `test-office` and `snowy-chalet`.

## What exists

- `generator/src/design.ts`: zod schema. A design is a name, version, seed, size, `floorY`, a `shell` (`box` or `none`), an optional `atmosphere`, and a list of parts with unique ids. A part may overwrite another only if it lists that id in `over`.
- Part types: `deskRow`, `station`, `seatedTable`, `lanternGrid`, `podium`, `taskWall`, `camera`, `spot`, `box` (air carves), `gableRoof`, `gableEnd`, `deck`, `fireplace`, `terrain`, `trees`, `boulders`, `village`.
- `render.ts` renders a design to a `Volume` plus anchors. `landscape.ts` holds terrain (peaks, ridged crags, rect and ellipse flats, graded trails with lamps, rivers open or frozen), the forest (clusters, taper, dead trees), boulders and the village (`classic` and `varied` styles).
- `check.ts` + `walk.ts`: every design check (anchor contract, overlaps, seats, slot spacing, standing spots, reachability from `spawn` with the mod's pathfinder rules). `generate` refuses to write if any fail.
- `setup.ts`: the in-game commands for a design (force-load tiles, `/place template`, block limit, `/fillbiome`, `/time set`, `/weather`).
- `preview.ts` + `viewer/`: a three.js viewer at `http://localhost:5173/` with camera buttons per `cam_*` anchor, a layer slider, a walkable overlay, and URL-hash views.
- Designs: `test-office/v1` (the original placeholder office) and `snowy-chalet/v1..v6`. v6 is the current world (480 x 176 x 512). v3 is the smaller version first tested in game. v4 and v5 are intermediate. `docs/styles/snowy-chalet.md` is the style note from the reference images (kept local, gitignored).
- `tools/make-snowy-chalet-v6.py` produces v6 from v3's chalet. Run from the repo root: `python tools/make-snowy-chalet-v6.py .`

## Verified in game (2026-10-10)

- `/place template minecraft:snowy-chalet 40 64 40` placed the whole v6 (5 MB, 43 million cells, about 1 million blocks) after `/forceload add` in 16 x 16 chunk tiles. `/fillbiome` over the same box was accepted. The user reported the scene looks great. Large builds do NOT need tiles or the mod loader to be placed.
- Structure files go in `<world>/generated/minecraft/structure/` (singular `structure`). The anchors file goes in the world root. Both are read at world load, so close the game before copying.
- The mod's HQ world: superflat meadow, grass top at y=64, `advance_time` and `advance_weather` off, `max_snow_accumulation_height` 0, `max_block_modifications` pinned to 1,000,000 at every start (raise it with `/gamerule max_block_modifications <n>` before a big fill). Snow is rain in a cold biome, so v6 sets `snowy_taiga`.
- The old office is still in that world at x 0 to 24, z 0 to 18. v6 was placed at origin `40,64,40` so they do not overlap. v6 spawn is world `170.5 137 142.5`, the deck camera `167.5 139.5 165.5`.
- Stairs `facing` is the side the tall part is on (confirmed from the game's block model).

## Decisions made

- The design file is the source of truth. Saved versions are immutable and must keep rendering the same: old behaviour is kept as the default (for example `style: "classic"` for the village, `taper: 0`), and new behaviour is opt-in. v3 output is byte-identical to the file in the user's world.
- Water never touches the volume edge: rivers freeze near the edges so a pasted structure cannot leak water.
- Large `.nbt` files leave air out (above 250,000 cells); `.schem` is skipped above 4,000,000 cells. WorldEdit is never a dependency.
- Composition (user's direction): chalet high on a north-west shoulder facing south, a river starting below it and winding away to the south-east, the town off the line of sight (about 270 blocks, 40 degrees right) and visible only in the distance, mountains of many heights scattered through the valley. The user said "think bigger, like 8x"; interpreted as about 3 times in each horizontal direction.

## Known problems and open items

- Not yet confirmed: that rain falls as snow across the whole area (the user said the scene looks great but did not itemise it), and whether open river water freezes over time in the cold biome.
- Agents have not been run in the generated chalet. The interior is still the test office with vanilla stand-ins (black concrete monitors, lecterns). The mod's own bound blocks (monitor = agent id, status lamp = `agent:<id>`) are not placed. `StudioHqBuilder.java` and `HqWorldDriver.java` show how.
- The path and its walkability are untested in game.
- Look: the distant mountains read grey and low; the river is mostly hidden or frozen from the deck; the valley floor near the village is a flat basin; the village is a regular grid of similar cottages.
- Re-placing a newer version over an old one leaves the old blocks (large templates omit air). Use a fresh world or origin until a clear-first step exists.
- Polish backlog (smoke, steam, bubble columns, datapack particles, custom biome colours, light blocks, display entities) is in `docs/SPEC.md`, each item marked with how sure we are it works.
- The user suggested next: probably the interior (cozy timber loft feel, real furniture, fireplace glow, the mod's monitor blocks). Other options were the distant range, river visibility, an atmosphere pass, matching the reference photos from the same camera angles, and a clear-before-replace step.

## Gotchas

- Windows: use PowerShell, and `npm.cmd` instead of `npm` (script execution is disabled for `npm.ps1`). Do not change the execution policy.
- The preview server (`npm.cmd run preview -- --design snowy-chalet`) is a long-running node process. Stopping the npm wrapper does not stop it, and it does not reload TypeScript changes (design JSON edits are picked up live). To restart: close its tab, kill the `node.exe` whose command line contains `cli.ts preview`, confirm port 5173 is free, start it again. A request for `//` used to crash it; that is fixed and tested.
- Long Bash heredocs that embed Python with backticks and apostrophes have failed to parse. Write the script to a file and run it. Git Bash `/tmp` is not Python's `/tmp`; use a real Windows path.
- `mod/run/achq-test/` holds generated output: `office.nbt` and `office.schem` (old), a stale `snowy-chalet.schem` from v3, and the current v6 `.nbt`, anchors and `.commands.txt`. The world folder `mod/run/saves/AgentCraft HQ/` holds the placed world. `mod/run` is not tracked by git.
- The human does all git. Print commands for them instead of running write commands.
- No em dashes in any text. PR descriptions use two `##` sections, `Summary` then `Test Plan`, ending with the generated-by line.
- Check `git config user.email` before committing. Never commit a lockfile that points at a private registry. `generator/.npmrc` pins the public registry and is force-added (a global gitignore ignores `.npmrc`).
- The reference images in `references/` are stock photos and AI renders. They are gitignored on purpose: do not commit them.
- Project memory (outside the repo, in `~/.claude/projects/...achq/memory/`) has two notes: the polish backlog reminder and the Windows shell quirks.
