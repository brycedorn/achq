# Loading ACHQ worlds from AgentCraft

Today ACHQ hands AgentCraft a finished world save: `npm run import` puts it in a `saves` folder as `AgentCraft HQ` and sets the old one aside. That works with AgentCraft unchanged, but it swaps whole worlds, needs the game closed, and the user has to find their `saves` folder. This note proposes two small changes to AgentCraft that would make ACHQ worlds a normal, supported input. Neither is needed for ACHQ to work; they make it simpler to use.

File references are to the copy of the mod in `mod/`, which tracks upstream.

## What AgentCraft does today

- `AutoWorld` (client) opens the save folder `AgentCraft HQ` on the first title screen, or creates a flat meadow world of that name.
- `HqWorld.isHq` treats a world as the HQ when its level name is `AgentCraft HQ` and it is not hardcore. Without the marker `agentcraft-world.json` it resets time, weather and spawn as for a new world.
- `HqFeature` runs the default `HqBuilder` on start when no layout is saved, and `/agentcraft hq [builder] [force]` runs any builder registered in `HqBuilders`.
- The layout (`agentcraft-anchors.json` in the world folder) is what agents use: every required anchor plus `bounds`.

An ACHQ save already satisfies all of this: the right level name, the marker, a saved layout (so no studio build), and the mod's blocks with their bindings.

## Proposal 1: seed the HQ world from a folder (smallest change)

Add one setting, `AGENTCRAFT_HQ_SEED=<path>` (or `-Dagentcraft.hq.seed=<path>`), read by `AutoWorld.openOrCreate`:

- When the `AgentCraft HQ` world does not exist and the setting points at a world save, copy that save in as `AgentCraft HQ` and open it, instead of creating the meadow.
- When the world exists, do nothing different. Replacing an existing world stays an explicit step (`npm run import`), so nobody loses a world by setting an environment variable.

About 20 lines in `AutoWorld.java`, with the usual `System.getProperty` then `System.getenv` lookup that `HqFeature.autobuild` uses. With it, a new user does:

```bash
npm run world                                   # writes out/worlds/snowy-chalet-v7/AgentCraft HQ
AGENTCRAFT_HQ_SEED="<achq>/out/worlds/snowy-chalet-v7/AgentCraft HQ" ./gradlew runClient
```

Good for first-time setup and for testing; it does not help someone who already has an HQ world.

## Proposal 2: an HQ builder that loads an ACHQ package (the real entrypoint)

AgentCraft already has the extension point: an `HqBuilder` registered in `HqBuilders` runs from `/agentcraft hq <id>` and publishes its anchors. Add one builder, `file`, that loads a package from disk into the current HQ world:

```
/agentcraft hq file snowy-chalet          # loads <game dir>/agentcraft/hqs/snowy-chalet/
```

An ACHQ package is a folder ACHQ writes (`npm run package`, to be added):

| File | Contents |
| --- | --- |
| `hq.json` | name, design version, origin, size, the data version it was written for, and the atmosphere (biome, time, weather) |
| `structure.nbt` | the build as a vanilla structure template, mod blocks and their `binding` included |
| `agentcraft-anchors.json` | the layout, in world coordinates for the given origin |

The builder:

1. Force-loads the area in tiles of at most 16 x 16 chunks (the `/forceload` limit).
2. Places the template with `StructureTemplate.placeInWorld`, the same call `/place template` uses. Templates are not capped by `max_block_modifications`: a 43 million cell template placed in 8 seconds in testing.
3. Sets the biome over the box, the time and the weather from `hq.json` (as `HqWorld.applyRules` already holds them).
4. Returns the layout from `agentcraft-anchors.json` through `Anchors.Builder`, so publishing, the pathfinder `bounds` and the HQ checks work as for the built-in studio.

This keeps the player's world, needs no restart, and makes a package something people can share as a folder or zip. The work is one new class plus registration in `HqFeature`; the file format is ACHQ's to keep stable.

Open points for that PR:

- **Clearing.** A large template leaves out air to stay small, so loading over an existing build leaves old blocks behind. The builder should clear the previous package's box (from the saved layout's bounds) before placing, in ticks, since `/fill` is capped.
- **Data version.** Structure templates go through the game's data fixers, so an older package still loads after a Minecraft update. `hq.json` should carry the data version so the builder can warn about packages from a newer game.
- **Where packages live.** `<game dir>/agentcraft/hqs/` keeps them out of world folders and makes them available to every world.

## Recommendation

Do Proposal 2 when we are ready to open a PR upstream: it is the one that turns "swap your world folder" into "type one command", and it fits the builder registry AgentCraft already has. Proposal 1 is worth including in the same PR because it is tiny and makes a first run of AgentCraft with an ACHQ world a single command. Until then, `npm run import` is the supported path.
