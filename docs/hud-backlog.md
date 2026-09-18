# The HUD backlog — what is done, and what is left

Asked for on 27 August 2026. **Most of it is built.** This file now records what
shipped, what was deliberately not built and why, and what is genuinely left.

---

## Done

### Elements — twenty-one of them, all drawn

| | |
|---|---|
| First eleven | fps, cps, ping, keystrokes, coords, potion effects, and the five armour slots |
| Second eight | day counter, clock, playtime, memory, combo counter, totem counter, reach display, PvP info |
| Minimap | the loaded world from above in map colours, shaded by height, or the caves at your height with the rock left clear and lava its own orange (Depth: auto, surface, caves; the nether is always caves); turns with you or keeps north up, four zooms, other players and waypoints as dots. A 256×256 texture shifted as you move and re-read middle first for a millisecond a tick |
| Scoreboard | the server's sidebar as a plate — title, numbers and the server's colours each switchable. While it is on, vanilla's sidebar is not drawn: its HUD layer is wrapped through Fabric's layer API, no mixin |

The TNT countdown was the ninth. It moved into the world as a feature — a plate
in a corner cannot say which of four primed blocks is the one about to go.

Each has its own options, declared in `mc/hud.js` and carried in the document.
Each exists on all three sides: the launcher's HUD screen arranges it, the
Tweaks list switches it, the mod draws it.

### Features — the second noun

`sprint`, `sneak`, `zoom`, `snaplook`, `freelook`, `hitbox`, `chunks`, `tnt`, `hitcolour`, `sorter`, `waypoints`, `worldmap`. A feature is
**on or off, a key, and its own options** — no anchor, no scale, no plate. It reuses the
element option machinery and the same top-level `optSpec`, so the menu builds a
feature's rows exactly the way it builds an element's.

- **Behaviours** (`Behaviours.java`): toggle sprint, toggle sneak, zoom, snap
  look, freelook. Each undoes itself when switched off, on key release, and when
  the world goes away. Sprint, sneak, zoom and freelook each have a **Mode** —
  hold or toggle — defaulting to how they worked before it existed.
- **Freelook** (`Freelook.java`) has the mod's only two mixins, in
  `dev.kestrel.hud.mixin`: `CameraMixin` gives the camera freelook's yaw and
  pitch in place of the player's, `EntityMixin` sends mouse movement to that
  camera instead of the player. Both do nothing unless freelook is on, neither
  redirects or overwrites, and `hudcheck` fails on a third.
- **Inventory sorter** (`Sorter.java`, `SortPlan.java`): R sorts the open
  container, or your inventory anywhere else — by ordinary left clicks, planned
  by `SortPlan`, which has no Minecraft in it so `tools/hudroundtrip/SortCheck`
  runs it against a thousand random chests with vanilla's click rules.
- **Waypoints** (`Waypoints.java`, `WaypointsPanel.java`): B marks where you
  stand; a death is marked automatically. Kept per world — the save folder in
  singleplayer, the address on a server — and per dimension, in the mod's own
  `config/kestrel-waypoints.json`. A crossed see-through beam, and a label that
  is pulled inside the far plane and scaled so it reads at any distance. Listed
  in the Features tab and beside the map: colour, rename, coordinates, hide,
  remove, filed in folders (shut or open, hidden or shown together), and a
  teleport that is only offered when the server lets the player use `/tp` —
  the one command the mod ever sends, and only on a press.
- **World map** (`WorldMap.java`, `MapTab.java`): M opens the menu on a Map
  tab showing every chunk you have loaded, kept between games in the instance's
  kestrel-map folder, never asking for one — each
  chunk read as it loads, or on its way out if it was not yet — with a picture
  kept per world and dimension, so the nether does not wipe the overworld, and
  the same Depth choice as the minimap — the caves kept as floor heights and lit
  for where you stand; a four-blocks-to-a-pixel overview for the furthest zoom,
  so everything explored shows at once; the biome under the pointer anywhere you
  have been, and the block where the chunk is loaded; add waypoints by
  right-clicking it, manage them beside it.
- **World overlays** (`Overlays.java`): hitboxes and chunk borders — each in a
  colour picked in the menu, chunk borders optionally with see-through walls —
  and the TNT timer over every primed TNT, through Fabric's `WorldRenderEvents`.
- **Zoom and hit colour go through the access widener**, not mixins: it opens
  `GameRenderer.zoom`, the projection scale — the field of view option rejects
  anything under 30 degrees — and `OverlayTexture.texture`, whose top half is
  the hurt flash that hit colour repaints.

---

## NOT built, and why — read this before starting any of them


A mixin is a build-time weave into somebody else's compiled class. It fails in
ways that are hard to read, and it breaks differently on every Minecraft version.
**This mod has exactly two, both freelook's** — added once the game could be
tested, after the targets were checked against the game's own bytecode — and
`hudcheck` fails on a third, so the next one is a decision somebody makes on
purpose rather than drifts into.

Adding one: put it in the existing config, keep it inert unless its feature is
on, prefer a value modification or a cancellable inject to a redirect, check the
target in the intermediary jar, and launch the game before writing the next.

### Nothing from the original list is left

Every item asked for on 27 August is built. What is worth watching instead: the
two maps are the one thing here that can cost frames. Both now read on a clock,
not a count — the minimap a millisecond a tick, the world map one (four while
open) and two a frame to send tiles to the GPU — and read blocks from the chunk's
own sections, which is what the nether needed. If they show up in a profiler,
those budgets (`Minimap.BUDGET_NS`, `WorldMap.READ_NS`, `UPLOAD_NS`) are the dials.

---

## Still true about the launcher's own list

The Tweaks screen names modules the HUD does not wire. After this work the
unwired ones are:

    Chat   Compass   Crosshair   Level head   Nick hider

Five switches attached to nothing. They want a decision of their own — build, or
delete the row. **A switch that does nothing is worse than an absent feature.**
(`Minimap`, `Scoreboard`, `Toggle sprint` and `Zoom` were on this list before;
the last two are now real, and the first two are in the "not built" table above
with reasons.)

---

## The performance note that still stands

The HUD rebuilds every string every frame — `config.names()` allocates a fresh
list per frame just to iterate, and each element allocates a list, its runs, its
`Text` objects and any `String.format`. That was worth fixing before ten more
elements joined the loop; there are now **nine more in it**. Caching the rows at
10–20 Hz rather than per frame is the single cheapest thing left.

See the research note in the session history: this is exactly what other clients'
"HUD caching" settings exist to do.
