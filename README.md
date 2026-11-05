# ACHQ

[![CI](https://github.com/brycedorn/achq/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/brycedorn/achq/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/brycedorn/achq/badges/coverage.json)](https://github.com/brycedorn/achq/actions/workflows/ci.yml)
[![tests](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/brycedorn/achq/badges/tests.json)](https://github.com/brycedorn/achq/actions/workflows/ci.yml)
[![node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Minecraft](https://img.shields.io/badge/Minecraft-26.3-62B47A)](https://www.minecraft.net)
[![license](https://img.shields.io/github/license/brycedorn/achq)](LICENSE)

Generates custom HQ worlds for [AgentCraft](https://github.com/blendi-remade/agentcraft), the Fabric mod that runs Claude agents as NPCs in a walkable Minecraft studio.

AgentCraft builds one fixed studio. ACHQ takes a design file and writes a ready-to-open AgentCraft HQ world instead: the terrain, the building, the mod's working blocks (desk monitors, task board, decision podium, stations) and the `agentcraft-anchors.json` that tells AgentCraft where agents sit, walk and spawn. Five designs so far: a snowy mountain chalet in a river valley (`snowy-chalet`); a motor yacht moored at a Mediterranean island town (`riviera-yacht`), with the office in its salon and a walkable town on the hillside; a modular space station over a night-side planet (`orbital-station`), with a sun, a ringed gas giant, moons and an asteroid belt in the sky; a lighthouse on a rocky island at sunset (`lighthouse`), with desks on the landings of its winding stair, the goal projector as its lens, and a gallery to walk round the top; and a rainforest treehouse in misty rain (`jungle-treehouse`), three cabins in giant emergent trees above the canopy joined by sagging rope bridges, with a stair round one trunk down to the forest floor and a switchback trail to a jetty on the river.

ACHQ only generates the world. It is not affiliated with the AgentCraft project.

## What you need

- **Node.js 22 or newer** (`node -v`).
- **AgentCraft**, either installed in a Minecraft launcher profile (Minecraft 26.3 with Fabric) or run from source with `gradlew runClient`. This repo carries a copy of the mod in `mod/` that you can run if you have **Java 25** (see [Run AgentCraft from this repo](#run-agentcraft-from-this-repo)).

## Quick start

```bash
git clone https://github.com/brycedorn/achq.git
cd achq
npm run setup
```

Close Minecraft, then import the chalet into the `saves` folder of the Minecraft that runs AgentCraft:

```bash
npm run import -- --saves "<your saves folder>"
```

Start AgentCraft. It opens the `AgentCraft HQ` world, which is now the chalet.

Your own HQ world is not deleted: it is renamed to `AgentCraft HQ (backup <date time>)` in the same folder. To put it back, close Minecraft and run:

```bash
npm run restore -- --saves "<your saves folder>"
```

### Which saves folder?

| How you run AgentCraft | Saves folder |
| --- | --- |
| Minecraft launcher, Windows | `%APPDATA%\.minecraft\saves` |
| Minecraft launcher, macOS | `~/Library/Application Support/minecraft/saves` |
| Minecraft launcher, Linux | `~/.minecraft/saves` |
| Other launchers (Prism, MultiMC, CurseForge) | the instance's `saves` folder (or `.minecraft/saves` inside it) |
| AgentCraft from source (`gradlew runClient`) | `<agentcraft checkout>/mod/run/saves` |
| This repo's `mod/` | `mod/run/saves` |

Relative paths are read from the repo root. To skip `--saves` every time, set `ACHQ_SAVES` to the folder. Running `npm run import` without either prints the launcher folder for your platform.

### Import options

```bash
npm run import -- --saves <folder> --design riviera-yacht                 # the yacht
npm run import -- --saves <folder> --design orbital-station               # the space station
npm run import -- --saves <folder> --design lighthouse                    # the lighthouse
npm run import -- --saves <folder> --design jungle-treehouse              # the jungle treehouse
npm run import -- --saves <folder> --save <world folder>               # a world save you already wrote
npm run world                                                           # only write the save, to out/worlds/
```

## Run AgentCraft from this repo

With Java 25 installed, this starts Minecraft with the mod, opens the generated chalet and takes a screenshot through the deck camera (`artifacts/shots/`):

```bash
npm run play -- --save
```

The first start downloads Minecraft and Gradle and can take several minutes. When you are done, close the game and run `npm run play -- --restore` to get back the HQ world that was there before.

The agents themselves need AgentCraft's Foreman (the agent orchestrator), which is part of upstream AgentCraft and not this repo. Without it the world and its blocks work, and desk screens say the Foreman is not running.

## Making designs

A design is a JSON file, `designs/<name>.json`, changed in place as it improves; git keeps its history. The generator's improvements reach every design at once, and a fingerprint test makes any change to a design's blocks deliberate.

```bash
npm run preview -- --design snowy-chalet            # 3D preview in the browser, reloads on edits
npm run web                                         # walk a design in first person in the browser, no Minecraft
npm run check -- --design snowy-chalet              # every rule AgentCraft depends on
npm test                                            # the full test suite
npm run coverage                                    # the test suite with a coverage table
```

`check` covers what the mod needs to run agents in the world: every required anchor, a seat at each desk, a monitor facing it, stations agents can walk to from the entrance and the lounge, and a lounge with a place for each agent. It also walks the design as a player, who cannot jump up a full block the way agents do: every room and every place the design names has to be walkable from the spawn and back, and every drop that would hurt beside a floor or a path needs a railing or a wall, and both ends of every path have to be walkable there and back. It also looks for land no landscape has, such as a path or a stream carried on an embankment. Writing a world also stops on anything Minecraft cannot hold (height, chunk size). The rules and AgentCraft's limits are in [docs/SPEC.md](docs/SPEC.md).

`npm run web` is an early first-person walk-through: pick a design, click to lock the mouse, then WASD to move, space to jump, ctrl to sprint and F to fly. It shares the generator's block shapes, so you collide with what the walk checks assume. Blocks it does not know yet are drawn as cubes in a made-up color; `npm --prefix web run fallbacks` lists them per design.

## The anchor contract

AgentCraft reads the layout from `agentcraft-anchors.json` in the world folder: a name, a revision, bounds, and named anchors. Names are defined in [`AnchorNames.java`](mod/src/main/java/dev/agentcraft/layout/AnchorNames.java). A generated HQ writes at least:

| Anchor | Meaning |
| --- | --- |
| `desk_<agentId>` | Feet spot at an agent's desk, facing the monitor. One per agent. |
| `monitor_<agentId>` | Center of that agent's monitor screen. |
| `library`, `terminal`, `testbench`, `mergestation`, `meeting`, `lounge`, `user` | Shared stations. Extra slots are `<station>_2` and up. |
| `task_wall`, `decision_podium`, `goal_atrium` | Fixed fixtures. |
| `entrance`, `spawn` | Main door and player start. |

Extra anchors (such as `cam_<name>` camera spots) are fine.

## Repo layout

- `generator/`: the TypeScript generator, preview and checks. The root `npm run` scripts call into it.
- `web/`: the browser walk-through (Vite and three.js). It imports the generator's source directly.
- `designs/`: design files, one folder per design.
- `mod/`: a copy of the AgentCraft Fabric mod, kept as the reference for the anchor contract and as a test target.
- `docs/SPEC.md`: how the generator works, the rules it checks, and AgentCraft's limits.
- `docs/agentcraft-integration.md`: a proposal for loading ACHQ worlds from inside AgentCraft.
- `play.cmd`: a Windows shortcut for `npm run play` while developing designs.

## License

MIT, same as AgentCraft. See [LICENSE](LICENSE).
