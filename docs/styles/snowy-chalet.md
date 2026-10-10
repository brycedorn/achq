# Style: snowy alpine chalet

Reference images: `references/snowy-chalet/` (five photos and concept renders). This note turns what they show into rules the generator can follow. Edit it when taste changes; designs of this style read from it.

## What the references share

1. **A steep gable roof**, about 45 degrees or steeper, carrying a thick cap of snow. The roof edge is trimmed in a dark material, so the snow reads as a white shape outlined in dark timber.
2. **One tall glazed gable end facing the view.** The glass runs from the floor to the apex of the roof and is broken by a grid of slim dark mullions (vertical every 3 to 4 blocks, a horizontal transom every 3 to 4 rows). This is the signature element of the building and the "back" in this project.
3. **A deck in front of the glass**, level with the floor, with a railing (timber balusters or dark frame), standing out over the slope on posts. The roof overhangs part of it.
4. **Warm against cold.** The interior glows orange and gold (lanterns, fire, wood) against a blue-white exterior of snow, dusk sky and distant peaks. The glass is the lit face of the building.
5. **Honey and dark timber inside**, with exposed rafters, beams and a vaulted ceiling. Cozy, not grand: low furniture, a hearth, soft light.
6. **Stone and timber exterior**: a base of grey fieldstone (or dark timber on the modern ones), timber above, a stone chimney with a snow cap.
7. **Snow-laden spruce trees** close to the building, mountains behind, and in three of the five images a **village with lit windows far below** in the valley.
8. **Steep ground.** The building sits on a slope; the deck side drops away.

## Per image

| Image | What to take from it |
| --- | --- |
| `c1954...upscaled.jpg` (dusk, modern) | Glazed gable with dark mullion grid, honey-coloured soffit and cladding under a dark fascia, black chimney, cantilevered deck on posts with a slim railing, snow-capped stone steps, spruces left and right. Best reference for the glass wall and the lit interior. |
| `hero-val-disere-chalet-dusk.webp` (rustic) | Stone base with weathered timber above, exposed rafter tails and brackets under a heavy snow roof, timber balustrade, fireplace visible through the glazing, chimney with a snow cap, village lights below, spruces in the foreground. Best reference for materials and the view. |
| `hot-tub-steaming...jpg` (log chalet) | Orange-brown logs, a steep roof with a thick snow edge, a dormer, a deck with a fence railing and a steaming hot tub, misty valley behind. A tub on the deck is a good cozy detail. |
| `images.jpg` (cliff concept, night) | The deck and a glass-panel railing cantilevered over a cliff, a stone chimney with smoke, a glazed two-storey gable, the whole valley town below in lights, snow, spruces. Best reference for the cliff-edge setting and the town lights. |
| `istockphoto-1796437070...jpg` (twin A-frames) | Dark steep roofs with glazed A-frame ends, orange glow, snowy spruce forest. Reference for roof steepness and the silhouette against trees. |

## Decisions for this project

- **One storey, vaulted.** A single open hall under a gable roof, open to the rafters. No upper floor. Timber beams cross the hall; lanterns hang from them.
- **The back faces south** (+Z): the glazed gable and the deck. **The front faces north** (-Z): a stone-and-timber wall, the door, and later the path down to the town.
- **Agents sit at the glass.** Desks face the view, staggered in two rows, so every agent has the valley in front of them. The lounge sits round the stone fireplace on the east wall.
- **Mood:** blue hour, snowing lightly, warm light inside. Lighting comes from lanterns, a fire and glowing glass, not from daylight.

## Block palette

| Role | Block | Notes |
| --- | --- | --- |
| Roof body (underside seen from inside) | `spruce_stairs` | Honey timber ceiling, stepped. |
| Roof snow cap | `smooth_quartz_stairs`, `snow_block` at the ridge | White; `quartz` is the whitest stairs available. Two layers thick so the snow reads heavy. |
| Fascia and gable edge | `dark_oak_stairs` | The dark outline around the white roof. |
| Walls, upper | `spruce_planks` | |
| Walls, lower course and chimney | `stone_bricks`, with `cobblestone` and `andesite` mixed in | Fieldstone look: mix three greys, no regular pattern. |
| Corner posts, beams, rafters | `stripped_spruce_log`, `spruce_log` | Exposed. |
| Glass | `glass` | Clear; tint adds nothing at this scale. |
| Mullions | `dark_oak_planks` or `dark_oak_log` | Dark, slim. |
| Floor | `spruce_planks`, `dark_oak_planks` for the deck | |
| Railing | `spruce_fence` | Balusters; glass panes for a modern variant. |
| Light | `lantern`, `campfire[lit=true]`, `shroomlight` | Warm only. Avoid `sea_lantern` and `glowstone` (too white). |
| Trees | `spruce_log`, `spruce_leaves`, `snow_block` caps | Cone shape, snow on the upper surfaces. |
| Ground | `snow_block`, `stone`, `packed_ice` sparingly | Rock showing through on the steepest face. |
| Town lights (far) | `lantern` or `shroomlight` in small clusters on dark ground | Distance: small, warm, dense near a central church. |

## Proportions

- **Width of the hall** about 15 blocks outer; the roof half-width then sets the height (45 degrees: 7.5 rises). Anything much wider needs a shallower roof or a second ridge.
- **Eave height** 4 blocks above the floor; a lower eave makes the roof dominate, which is how the references look.
- **Overhang** 1 block at the sides, 3 blocks over the deck at the back.
- **Glass grid:** vertical mullions every 3 blocks, a transom every 4 rows.
- **Deck** about as deep as a third of the hall, the full width of the hall plus 3 blocks each side.

## Things to avoid

- A flat or shallow roof, which reads as a hut or a modern house.
- Gabled walls with no glazing; the glass wall is the point.
- White light: it makes the interior look like an office. Everything inside should be amber.
- Dense interiors. These are cozy but open: a vaulted hall with a few clusters of furniture.
- Symmetry. Stagger the desks, vary the stone, keep the trees uneven.
