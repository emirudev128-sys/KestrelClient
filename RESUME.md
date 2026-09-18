# Kestrel — where the project stands

A privacy-first Minecraft launcher. Electron shell, plain HTML/CSS/JS renderer, no framework, no
build step. **It downloads and launches Minecraft, installs mod loaders and mods, and ships a Fabric
client mod that draws a fully configurable HUD.**

    npm start

---

## THE SESSION THAT STARTS HERE

**The in-game menu has just been rebuilt, and the user has not seen it in game yet.** It was
redesigned in a browser mockup (link below), signed off there, ported to the mod, built, checked and
installed into their `1-21-4-fabric` instance. Their next message is most likely a screenshot of it.

**What the mockup could not prove, and a screenshot will:**

- **The panel-only blur** (`PanelBlur.java`) — framebuffer blits around vanilla's own blur pass. If the
  whole screen is blurred, or nothing is, or the canvas in the middle is black, it is here.
- **Text on its capitals** (`Type.java`) — placed from the rule that a TrueType baseline sits 7 font
  pixels below the draw position, read out of the game's bytecode. If every label is high or low by
  the same amount, the constant is wrong, not the design.
- **Crisp type.** Every text size has its own font definition because glyphs are sampled
  nearest-neighbour. Blurry or ragged text means a definition is missing or the density is wrong.
- **Rebinding a feature key** from the Features tab, which also writes Minecraft's `options.txt`.
- **Caxton.** The instance now has Caxton (MIT, fetched from Modrinth), and every Kestrel font has a
  `caxton_providers` twin sized to match (`scale_factor = size * ascender / 7000`). If text is still
  ragged, check the log for Caxton failing to load its native library — then the plain fonts are used.
- **Item icons** for armour and totems (the game's item renderer, so resource packs apply), **the
  mouse** in keystrokes, and **HUD text centred on its capitals** in every row. Row heights changed
  (an icon row is 16, the mouse row 14), so elements are a little taller than before.
- **Keystrokes:** every row centred (W over S, the mouse under it) and the spacebar drawn as a key —
  a line with its ends turned up — across the plate. **Durability** reads like advanced tooltips,
  `225 / 363`; the bar is gone and a stored `"bar"` reads as the number. **Potion effects** can show
  the effect's icon instead of its name (`icons`), from the game's sprite atlas.
- **The launcher's status bar** reads real free space for the drive the library lives on
  (`system:disk`, `fs.statfs`); it said a fixed "41.6 GB free on C:" before.
- **The launcher's own fonts ship in `ui/fonts`** (variable Archivo and Azeret Mono, OFL) and the CSP's
  `font-src` is 'self' — it no longer fetches them from Google on every start.
- **The HUD's Kestrel font is Archivo Medium**, size 10 — the face the launcher's HUD preview uses
  (`.hel-t`, `--w-med`) — with tabular figures under Caxton. It was Azeret Mono Bold, and the player saw
  a different HUD in game from the one the launcher showed.

**The latest round fixed what the user found broken in the features. It is built, checked and
installed in `1-21-4-fabric`; none of it has been seen in game yet:**

- **Toggle sprint turns off.** The latch re-asserted `latched || binding.isPressed()` every tick, and
  `isPressed()` answers what it was last told — so once on, the binding held itself down forever.
  Now the latch only holds the key down, and the press that unlatches sets the binding to the
  physical key once (`InputUtil.isKeyPressed`) and stops the sprint. Same for sneak.
- **Zoom works.** It set the FOV option to a quarter of 70; that option only takes 30–110 and
  replaces anything else with its DEFAULT, so a 4x zoom came out at exactly 70. Zoom now sets
  `GameRenderer.zoom`, which scales the projection — opened by **the mod's one access widener**
  (`kestrel-hud.accesswidener`, one field; not a mixin). Eased per frame on `WorldRenderEvents.START`;
  the hand is hidden while zoomed (it goes through the same projection); the mouse slows by the cube
  root, because sensitivity is cubic.
- **Hitbox and chunk border colours** — a third option type, `colour` (`#RRGGBB`), declared in
  `mc/hud.js`, written into `optSpec` with `"type": "colour"`, drawn in the Features tab as the
  element style's swatch row. Both default to the amber they were before.
- **Chunk corners are drawn once.** Walking nine chunks drew each shared corner twice, amber and dark
  grey, which is the black-and-yellow the user saw. Neighbours are now the same colour, fainter.
- **See-through walls** around your chunk (`walls`), in a render layer built from Minecraft's own
  phases with the depth write left out, so water behind a wall still draws.
- **The TNT timer is on the TNT.** It was the `tnt` HUD element; it is a feature now (`tnt`, World
  group), drawn over each primed TNT like a name tag, and **on by default** — the only feature that
  is, because the element it replaced was.
- **Line thickness** for hitboxes and chunk borders — the fourth option type, `number`, which carries
  its own `min` / `max` / `step` / `unit` in `optSpec`. The launcher snaps and clamps (1–10 px, step
  0.5); the Features tab draws it as the Size-style slider. Pixels are 1080p pixels scaled with the
  window, vanilla's own rule, so the default 2.5 is exactly the width the lines had. Drawn through
  one render layer per thickness, built from vanilla's line phases with the width swapped.
- **Freelook** (`Freelook.java`, default **U** — the user's pick) — the mod's first mixins, two of them:
  the camera takes freelook's rotation instead of the player's (both yaw and pitch reads in
  `Camera.update`, the minecart path included), and the mouse turns that camera instead of the
  player. Switches to third person if you were in first, and puts the view back. Targets were
  verified in the intermediary jar (`class_4184.method_19321`, `class_1297.method_5872`); a wrong one
  would crash at startup with `defaultRequire: 1`, so if the game will not start, look here first.
- **Hold or toggle, per feature** — a `mode` enum (`hold` / `toggle`, label "Mode") on sprint, sneak,
  zoom and freelook, each defaulting to what it did before: sprint and sneak toggle, zoom and freelook
  hold. Snap look has none. The Features tab rule reads "While U held" or "When U pressed" from it.
  If Minecraft's own Sprint/Sneak "Toggle" setting is on, the Kestrel key just flips vanilla's latch.
- **Hit colour** (`HitColour.java`, feature `hitcolour`) — repaints the top half of Minecraft's 16×16
  overlay texture (the hurt flash, vanilla `0xB2FF0000`) and uploads it on the tick, only on change;
  `colour` + `strength` (0–100%, 30 = vanilla's alpha exactly). A second access-widener field, no mixin.
- **Scoreboard element** — the objective vanilla would show, same order and team decoration, as a
  plate; `title` / `numbers` / `colours`. A `FILL` run right-aligns the numbers. Vanilla's sidebar is
  hidden while it is on by wrapping `IdentifiedLayer.SCOREBOARD` (Fabric HUD layer API), no mixin.
  The user's stored modules have Scoreboard off, so it does nothing until switched on.
- **Inventory sorter** (`Sorter.java`, feature `sorter`, key **R**, off by default) — in a chest,
  shulker, barrel, hopper or dispenser it sorts the container; anywhere else your inventory (hotbar
  optional). Left clicks only, planned by `SortPlan` (no Minecraft classes), which `SortCheck` runs
  against 1000 random chests with vanilla click rules — plus a broken control that must fail. Key in
  screens arrives through Fabric's `ScreenKeyboardEvents`; a focused search box is skipped.
- **Waypoints** (`Waypoints.java` + `WaypointsPanel.java`, feature `waypoints`, key **B**, off by default)
  — per world (`sp:<save folder>` / `mp:<address>`) and per dimension, in the mod-only
  `config/kestrel-waypoints.json` (Gson, written to a temp file and moved into place). Death marked
  once on the transition. Beam = two crossed see-through planes in the walls layer; label pulled to at
  most 48 blocks along the line and scaled with distance, see-through. Menu: colour, rename (Enter keeps,
  Esc cancels, a click elsewhere keeps), hide, remove, add here.
- **Minimap element** (`Minimap.java`, module Minimap — stored off for the user) — top-block map colours
  shaded against the column to the north, a 256×256 texture one pixel a block, shifted in memory as the
  player moves with only the new edge read, 24 rows refreshed a tick, uploaded only when a pixel changed.
  Ceiling dimensions read down from the player. `rotate` (north marker when on), `zoom` near/normal/far,
  `others`, `waypoints`, `depth` (see the depth round). Drawn as a `MAP` run inside the plate with a scissor.
- **World map** (`WorldMap.java` + `MapTab.java`, feature `worldmap`, key **M**, ON by default) — a third
  editor tab. `WorldMap` reads chunks the client already holds into 256-block tiles kept for the
  session, uploaded only while the map is open (see the latest round for how chunks are found now). Drag pans,
  scroll zooms about the cursor (¼×–8×), click pins, right-click adds a waypoint; waypoints listed on the
  left (press a distance to centre on it). M again, Esc or Done closes.
- **Polish round:** plate default 42% (was 72%; `migrateStyle`/`styleRev` moves stored 72s once, persisted
  by `mc/index.js`); Minecraft-font text drops its trailing spacing pixel from plate widths; plates of
  icon rows (armour, totems, minimap) pad 2px on every side; minimap: hillshade lit from the north-west,
  water darker with depth, soft edge instead of outline, smaller arrow, dots placed to sub-pixel; the
  editor remembers tab, selection, scroll and map zoom.
- **ZOOM NEVER WORKED BECAUSE OF A KEY CONFLICT.** 1.21.4's `KeyBinding.KEY_TO_BINDINGS` is key → ONE
  binding; C is vanilla's Save Toolbar Activator, so zoom's binding never got a press. Every feature key
  now goes through `Behaviours.presses()`/`held()`, which also read the physical key (no screen open) and
  count a press once. The access-widener zoom itself was fine.
- **Round after the world map:** smooth triangles/dots/colour wheel via `Shapes` (GUI-layer triangles,
  self-wound against culling); minimap cave view underground (sky light 0 for a second), gentle shading,
  no edge shadow, off-map waypoints on the edge, zoom on = / - through far/normal/near/close; waypoints
  added at typed coordinates, rows show coordinates and distance in their colour, a row opens a name +
  X/Y/Z + colour-wheel editor (`Chrome.field`, `Chrome.wheel`, one active `EditorScreen.fieldId`);
  in-world labels shrink to 55% by 250 blocks, then a see-through dot; scroll panels clamp in the wheel
  handler (no overscroll stutter).
- **Overview + what the pointer is over (built, checked, not yet seen in game)** — the user asked for
  both. `Overview.java` (no Minecraft): 1 px = 4 blocks, an overview tile = 16 full tiles; drawn when
  `zoom < 0.5` or when the window would need more than `MAX_TILES - 16` full tiles (large screens at
  ½×). It only mirrors the full tiles: each chunk read is folded in, a full tile back from disk is
  folded whole, and an overview region that shows nothing of a full tile that has a file is mended from
  disk while the map is open (`Place.known` = overview files ∪ wherever a full file exists — so maps
  saved before overviews get them). Surface cells are averages; cave cells are the highest FLOOR, then
  OPEN, then SOLID — never averaged. Layers are now 4 (`MapFiles.SURFACE/CAVES/..._OVERVIEW`), own LRU
  pool of 96. **Biomes:** `BiomePlane.java` (no Minecraft) — per full tile, 64×64 cells of 4 blocks, ids
  by name; filled per chunk read from `chunk.getBiomeForNoiseGen` (surface height, or cave floor + 1);
  saved in the tile file, **format version 2** (v1 still reads). `WorldMap.probe()` → `Spot{biome,
  block, y}`: biome from the tile (brought from disk if need be) so it works anywhere explored; block
  and surface height from the live world, so only where loaded. `MapTab`: the biome's name beside the
  pointer (hidden while dragging) and Cursor (x y z when known) / Biome / Block rows in the panel.
  `tools/hudroundtrip/MapCheck` now covers files v1/v2, biomes and the overview (50 checks).
- **The world map is kept between games (built, checked, not yet seen in game)** — the user found
  every restart lost it. `MapFiles.java` (no Minecraft in it; `tools/hudroundtrip/MapCheck` tests it)
  writes one gzipped file per 256-block tile, `<instance>/minecraft/kestrel-map/<safe world>/<safe
  dimension>/surface|caves/<x>_<z>.kmap`, on one background thread from a copy, temp file then atomic
  move; a tile asked for while its write waits is read from the copy. `WorldMap` saves what changed
  every 30 s, on leaving a world or dimension, and on `CLIENT_STOPPING` (then waits up to 5 s). Only
  the current place is in memory now (96 tiles, LRU; the open map reads tiles in view from disk, 3 ms
  a frame, never evicting one on screen). Names: letters/digits/dots/dashes + CRC32. Local only.
- **Depth round (built, checked, not yet seen in game)** — the user found the cave view not working
  and the nether map buggy and laggy:
  - **`Terrain.java` reads for both maps**, from the chunk's own sections (`Reader`: one chunk lookup
    per column run, an empty section passed 16 blocks at a time) instead of a world lookup per block.
    The cave decision is `CaveScan.java`, with no Minecraft in it, so `tools/hudroundtrip/CaveCheck`
    runs it against known columns (lava sea 40 down, pit, rock, lake, glass, world ends) and 100,000
    random columns read stepped vs block by block.
  - **Holes:** open space is now followed 96 blocks (was 24) and past that drawn `DEEP`; only an
    unloaded chunk is nothing. The nether's lava sea was the worst of it.
  - **After the user saw it:** "looks better in nether", but lava and netherrack blended (lava's map
    colour is pure red; shaded with depth it became netherrack's dark red) — lava now has its own id
    (`CaveScan.LAVA_ID` 250) and colour (`Terrain.LAVA`, orange, dimmed at most 20% by depth, also on
    the surface view). And rock in the cave view is now CLEAR (was a flat dark shade), at the user's
    ask, so only the caves are drawn.
  - **Underground** = two opaque full cubes over the head within 24, held 20 ticks (reset at once on a
    new world/dimension) — it was sky light 0, which most caves near an opening never reach.
  - **Depth option on both maps:** minimap element `depth`, world map feature `layer` (two names, one
    spec table): `auto` (caves while underground) / `surface` / `caves`; the nether is always caves.
    The Map tab header has the control (over the map's corner when the window is narrow).
  - **World map keeps two pictures per place** (surface; caves as `CaveScan` packed readings with the
    floor height) and lights the caves at upload for the player's current feet, so areas read at other
    heights do not show seams. Caves are read only while shown.
  - **Clocks, not counts:** world map reads 1 ms a tick (4 ms open), uploads as tiles are drawn (2 ms a
    frame, nearest the middle first); the minimap re-reads in 16×16 squares middle-first for 1 ms a
    tick, shifts in place (no per-step arrays), and a view/height change re-reads rather than blanks.
- **Round before (folders, teleport, map fixes; built, checked, not yet seen in game):**
  - **Black squares on the map after a death** were chunks never read: the old sweep visited the
    chunks around the player 3 a tick, so a chunk that loaded and unloaded between visits stayed a
    hole. `WorldMap.register()` now queues every chunk on `ClientChunkEvents.CHUNK_LOAD` and reads an
    unread chunk on `CHUNK_UNLOAD` before it goes; a slow sweep stays for blocks that change.
  - **The nether wiped the overworld map.** One picture per world+dimension now (`Place`, up to 4,
    least recently visited dropped); leaving one destroys its GPU textures but keeps its colours, and
    a re-uploaded tile gets a fresh texture id. 48 tiles per place (about 1,770 blocks square, 12 MB).
  - The player arrow scales with zoom on both maps (minimap `3.2 × clamp(√zoom, 0.6, 1.35)`, map
    `7 × clamp(zoom/2, 0.45, 1.4)`).
  - **Waypoint folders** — `Point.folder` ("" = none, old files read fine). Folders first, alphabetical,
    shut/open per world for the session, a square that hides/shows all, rename (to nothing = unfile);
    a waypoint's editor has a Folder box plus one-press chips for existing folders and `take out`.
  - **Teleport** — in the waypoint editor and the map inspector; offered only when
    `player.hasPermissionLevel(2)` (cheats/operator), sends `execute in <dim> run tp @s x y z` with
    `sendChatCommand`, then closes the menu. The ONLY command the mod sends; `KestrelHudClient`'s
    header now says honestly that the sorter's clicks and this teleport reach the server, on a press.
  - A click inside the text box being typed into no longer reverts it (`EditorScreen.closedId`).
- **Keystrokes have room between rows** — a `SPACER` run, 3 unscaled pixels, between W, A S D, the
  mouse and the spacebar. The plate grows to fit; it is measured, not drawn over.
- **Features now survive a launch.** `hud.sync()` merged a game-written document back as elements,
  modules and style — never features — and the store replaces `hud` whole, so every launch wrote
  every feature at its default: whatever was switched on in game was off again next time. Found by
  reading the config after the user's launch. The merge now takes the features the document names,
  and drops element names the launcher no longer declares (the old `tnt`). A launcher window opened
  before this fix still has the old code in memory — restart it.

**The launcher's own HUD screen still draws armour and totems as words** — it cannot read a
player's resource packs the way the game can.

**Earlier jars are backed up** in that session's scratchpad: `kestrel-hud-0.1.0.previous.jar` (the card-grid
menu), `kestrel-hud-0.1.0.editor-v1.jar` (the new editor before icons, mouse and Caxton),
`kestrel-hud-0.1.0.editor-v2.jar` (before centred keystrokes, durability numbers and effect icons),
`kestrel-hud-0.1.0.editor-v3.jar` (the Kestrel HUD font still Azeret Mono Bold), `kestrel-hud-0.1.0.editor-v4.jar`
(before the feature fixes: toggle sprint stuck on, zoom through the FOV option, TNT as a HUD plate),
`kestrel-hud-0.1.0.editor-v5.jar` (before line thickness and keystrokes spacing), `kestrel-hud-0.1.0.editor-v6.jar`
(before freelook — the last jar with no mixins; put it back if the game will not start),
`kestrel-hud-0.1.0.editor-v7.jar` (freelook on Z, before hold/toggle modes), `editor-v8.jar` (before hit
colour and the scoreboard), `editor-v9.jar` (before the inventory sorter), `editor-v10.jar` (before waypoints), `editor-v11.jar` (before the minimap), `editor-v12.jar` (before the world map and the polish round), `editor-v13.jar` (before the zoom key fix, shapes, cave view and waypoint editing), `editor-v14.jar` (before waypoint folders, teleport and the per-dimension map), `editor-v15.jar` (before the depth round: Terrain, CaveScan, the Depth options), `editor-v16.jar` (the depth round with dark rock and red lava, before clear rock and orange lava), `editor-v17.jar` (before the map was kept between games), `editor-v18.jar` (before the overview and the biome/block readout).

### The loop, end to end

    # 1. build  (neither gradle nor JDK 21 is on PATH; `java` on PATH is 1.8 and will not do)
    $env:JAVA_HOME = (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Filter "jdk-21*")[0].FullName
    $g = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.14.3-bin" -Recurse -Filter gradle.bat)[0].FullName
    & $g -p client-mod build

    # 2. verify
    node tools/hudcheck.mjs        # 302 assertions; the last thirty-one run the COMPILED mod

    # 3. hand over  client-mod/build/libs/kestrel-hud-0.1.0.jar
    #    ONLY that file. Not -sources.jar: it has an unexpanded ${version} and Fabric warns.

Gradle 9.2.0 is in that dists folder too and loom 1.9.2 refuses to load under it — take **8.14.3**.
The game locks the jar while it runs; check no `javaw`/`java` running KnotClient before copying.

### You can read their machine. Test the path, do not assume

`%APPDATA%/Kestrel` **is readable from the shell.** An earlier RESUME said in bold that it was not,
and a whole session was wasted quoting that instead of running one `Test-Path`. After they play:

    $i = "$env:APPDATA\Kestrel\instances\1-21-4-fabric\minecraft"
    Get-Content "$i\config\kestrel-hud.json"                     # what the mod wrote back
    Select-String -Path "$i\logs\latest.log" -Pattern "Kestrel"  # its own log lines
    Select-String -Path "$i\logs\latest.log" -Pattern "ERROR|Exception"

That is how the eleven-vs-twenty bug was found, and how the round trip was finally proved.
**Reading to verify is free. Writing there is theirs — ask before installing anything.**

### Where the visual knobs are

Lengths are **design pixels**: one screen pixel at 1080p, and exactly the mockup's units doubled.

| feedback about | file | what to change |
|---|---|---|
| transparency, colours, group colours | `Glass.java` | `PANEL` `RAISE` `HOVER` `WELL` `LINE` `TINT`, the group hues |
| panel sizes and spacing | `Glass.java` | `MARGIN` `GUTTER` `TOP` `BOTTOM` `LEFT_W` `RIGHT_W` `ROW` `PAD` |
| a text size or weight | `Type.java` + `assets/kestrel-hud/font/menu/` | a `Role`; a new size needs its own `.json` and `_2x.json` |
| chips, keycaps, sliders, swatches, on/off | `Chrome.java` | one method per control |
| the module list, canvas, element settings | `ElementsTab.java` | `left`, `canvas`, `settings` |
| the feature rules and key map | `FeaturesTab.java` | `rules`, `keys`, `settings` |
| the blur | `PanelBlur.java` | vanilla's radius comes from the player's own blur option |
| HUD plate itself | `Paint.java` | `PLATE` `EDGE` `PAD_X` `PAD_Y` `LINE` `GAP` `STACK_GAP` |
| what an element says | `HudElements.java` | one `case` per element, LIVE and SAMPLE |
| magnet feel | `ElementsTab.java` | `pull()`: 5 GUI px, insets 2.6% / 4.2% |

**The mockup** is at `https://claude.ai/artifact/2GqQsKuDWtxUY5FmKgtxTQ` — the menu at the user's
window size, opened on their real config, with the proportions and transparency on sliders and a
"Save for Claude" button that stores the slider values (read them back with the Artifact tool's
`read_db`, collection `workbench`, doc `values`). Settle proportions there **without a build**, then
port the numbers, doubled.

---

## Design rules already settled — do not undo these without being asked

Each is asserted by `hudcheck`, so breaking one fails a check rather than shipping.

- **MIXINS ONLY FOR FREELOOK.** Everything else goes through supported Fabric entry points and one
  access widener. Freelook's two mixins (`CameraMixin`, `EntityMixin`) are inert unless it is on, and
  `hudcheck` fails on a third — read `docs/hud-backlog.md` before adding one.
- **NO SHADOWS.** Every `drawText` passes `false`. Minecraft draws a shadow as a hard offset copy of
  every glyph — the look the plate exists to avoid. This was reverted once already.
- **HAIRLINES AND SQUARE CORNERS on the menu** — the user's choice, reversing the earlier "no
  outlines, rounded corners" rule. Depth under the edges is still the alpha ladder: panel 43%, row
  64%, hover 79%, well 81% **composited** — compare composited values, never raw alphas.
- **ON/OFF IS A SQUARE**, amber or dim, with no track, no word and no border. Picked from four designs.
- **ONE SCREEN, AT ITS OWN SCALE.** The editor lays out in design pixels from the framebuffer, never
  from the GUI scale, and replaced three screens that are deleted, not kept beside it.
- **ONLY THE PANELS ARE BLURRED.** The world between them stays sharp; the user asked for exactly that.
- **TEXT IS CENTRED ON ITS CAPITALS**, and every text size has its own font definition at both
  densities. Every bundled face is a static instance — a variable one renders Thin.
- **NOTHING IN A MENU MOVES.** Every preview is `HudElements.SAMPLE`, fixed text.
- **The HUD plate stays square by default**; the player can round it. The menu is square regardless.
- **Do not name other launchers, clients or reference projects anywhere in this repo.** Design notes
  carry the reasoning on their own terms — `docs/hud-menu-design.md` is the model. `hud-inspos/`
  stays gitignored.

**The user's dialled-in values** (do not "improve" these; they were set by eye against the real
game): panel 43%, rows 37%, hover 63%, well 46%.

---

## The three languages, and the file between them

The HUD exists in three places that cannot see each other:

    ui/index.html + ui/scripts/app.js   the screen a player arranges it on
    mc/hud.js                           what the launcher writes to disk
    client-mod/…/HudConfig.java         what the game reads back

Nothing links them at build time. **`node tools/hudcheck.mjs` is what notices** — 201 assertions,
the last twenty running the COMPILED mod against a document the launcher just wrote, then reading
back what it wrote. Only that stage catches a locale-formatted number, a broken escape, or a parser
that loses a sign.

### The contract: `<instance>/minecraft/config/kestrel-hud.json`, version 6

```
{ "version": 6, "rev": 20, "by": "launcher",
  "style":    { "corners": "sharp", "font": "minecraft" },
  "optSpec":  { "compass": { "label": "Show the compass" },
                "wear": { "label": "Durability", "vals": ["number","percent","none"] },
                "colour": { "label": "Colour", "type": "colour" }, … },
  "elements": { "fps": { "on": true, "module": "FPS", "label": "FPS",
                         "anchor": "tl", "x": 2.6, "y": 4.2, "scale": 1,
                         "plate": true, "plateColour": "#0A0E13", "plateAlpha": 72,
                         "textColour": "#F1F4F7", "textAlpha": 100,
                         "opts": { … } } },
  "features": { "zoom": { "on": true, "label": "Zoom", "desc": "…",
                          "key": "KEY_C", "opts": { "amount": "4x" } } } }
```

**Two nouns, and the distinction is load-bearing.**

- An **element** is a plate of text at one of nine anchors, with an offset, a scale and a style.
  Nineteen.
- A **feature** is on-or-off, a key, and its own options. No anchor, no scale, no plate. Seven.

Forcing a feature into `elements` would put `plateAlpha` on a toggle-sprint and show a colour picker
to somebody opening the options for Zoom.

**Traps, every one of which has already bitten:**

- **Iterate the DECLARATION, never the stored settings.** `build()` walked `settings.hud.elements`
  and nine elements never reached the game. It walks `ELEMENTS` now, falling back to
  `ELEMENT_STOCK` — which mirrors the markup's `data-` attributes and is asserted to match.
- **Percentages may be NEGATIVE.** Against a centre or middle anchor the offset runs both ways from
  the middle; the stock layout has one (`helmet` at `mr` / `-9.6`). Both sides clamp `-100..100`.
  Clamping at zero silently dropped that element into the centre for months.
- **Visibility arrives resolved.** The launcher groups elements into MODULES ("Armor status" owns
  five) and writes a plain `on` per element. The mod never needs to know what a module is to draw.
- **The mod has no vocabulary.** `module`, `label`, `desc` and the whole `optSpec` travel in the
  document. Add an option in `mc/hud.js` and it appears in the in-game menu **with no Java
  changing**. Never give the mod a label table — that rule is what the design rests on.
- **One option name means one thing.** `optSpec` is one global table shared by elements AND
  features. `hudcheck` asserts no name is used twice with a different type or label; that caught
  `unit` being a switch on ping and an enum on memory.
- **The parser walks MATCHING braces.** It used `indexOf('}')`, correct only while an element was
  flat. `opts` is nested, so the first `}` is now that object's.

### Two writers, and neither erases the other

`by` says who wrote it last; `rev` counts up. The mod stamps `"game"`; on the next launch
`hud.sync()` reads FIRST, folds a game-written document back into `settings.hud`, persists it, and
only then rewrites — stamped `"launcher"` again, which makes the import happen exactly once.

**The decision rests on `by` alone, not on comparing revs.** `settings.hud` is one GLOBAL object and
the config is PER INSTANCE, so revs across instances are not a total order: edit in-game in A, launch
B, return to A, and a rev comparison silently discards A's edit.

---

## What is in the mod

| file | what it is |
|---|---|
| `KestrelHudClient` | entrypoint, keybind, the live HUD render callback |
| `HudConfig` | the contract: hand-rolled parser and writer, no JSON library |
| `HudElements` | what each element says — LIVE values or fixed SAMPLE text |
| `HudRenderer` | geometry and drawing, forward AND inverse (the editor needs both) |
| `Paint` | the HUD plate's colours and metrics |
| `EditorScreen` | **Right Shift** — the one editor: state, layout, input, save on close |
| `ElementsTab` / `FeaturesTab` | the two tabs: list, canvas or rules, settings |
| `Chrome` | top bar, hint bar, and every control both tabs share |
| `Glass` / `Type` | the menu's surfaces and measurements; its fonts, placed on cap height |
| `PanelBlur` | blurs only what sits behind a panel, and gives the canvas the sharp world |
| `Behaviours` | sprint, sneak, zoom, snap look — and their keys, rebindable from the menu; zoom through the one access widener |
| `Overlays` | hitboxes, chunk borders (and their walls) and the TNT timer, in the world render pass |
| `Clicks` / `Combat` / `Session` | the state the counters need |

**Nineteen elements:** fps, cps, ping, keystrokes, coords, potion effects, helmet/chest/legs/boots/held,
day, clock, playtime, memory, combo, totems, reach, pvp.

**Seven features:** sprint, sneak, zoom, snaplook, hitbox, chunks, tnt — **all off by default except
the TNT timer**, so the user will see nothing from the rest until they switch one on in the menu.

---

## What works, verified end to end

| | proof |
|---|---|
| **Vanilla / Fabric / Forge / NeoForge** | all launch; NeoForge 1.21.1 into a world, processors run |
| **Mods** | installed through the UI, hash-checked, dependencies resolved |
| **Modpacks** | `.mrpack` end to end — 50 files, 55 overrides |
| **Accounts** | a real Microsoft sign-in, 16 September 2026, once Mojang allow-listed the Azure app; tokens never leave the main process |
| **The HUD draws in-game** | confirmed on screen |
| **The menu runs in-game** | opened repeatedly, saved revisions 9 → 20, **no exceptions in the log** |
| **The magnet works** | a drag landed at `tc` with `x: 0` — it caught the centre line exactly |
| **The round trip** | the compiled mod read a launcher document, edited it, wrote it back; the launcher imported it exactly once |
| **Packaging** | `Kestrel-0.5.0-Setup.exe`, 106 MB, launches from its own asar |

**Still never seen on screen:** the feature fixes listed at the top of this file — the chunk walls and
the TNT timer especially, which is the part a compiler cannot check at all, since a render pass either
draws or it does not. Hitboxes and chunk borders themselves HAVE been seen: the user reported their
colours mixing.

**Online play works** — the user launched with their Microsoft account and joined a server on
16 September 2026; the game log shows the connection and no session errors. Until the sign-in
worked, every launch was offline: the Play
button hard-coded it and `mc/index.js` threw on a real account. Now Play uses the account marked
active on Accounts (`launchOpts()` in `app.js`), `msauth.js`'s `launchSession()` hands over the
token (renewed first if under an hour is left), and a line of game output that repeats the token is
masked. `tools/sessioncheck.mjs` proves all of it without a real account. **What it cannot prove:**
the game opening with the real skin and joining an online-mode server. Java 8 versions still refuse
a real token by design — see the header of `mc/launch.js`.

---

## New instances get a performance set

Created with `perf: 'pending'`; the first launch installs **Sodium, Lithium, FerriteCore and Entity
Culling** from pinned Modrinth ids in `mc/perf.js` — plus **Caxton** for the HUD's type, gated to Fabric
and to 64-bit Windows and Linux, where its native library ships. That is what makes "more frames" a claim this
launcher can honestly make — the engine doing the work is Sodium's, installed by name, visible in the
mods list, removable like anything else.

**ABSENT MEANS OFF, and that is the safety property.** Only `store.create()` sets the flag — NOT
`clean()`, which also runs on `update()` and `seed()` and would have marked all thirty-nine existing
instances. Retro-fitting mods into somebody's tuned setup is the failure that loses trust in a
launcher's mods folder for good. Modpack imports pass `'off'`: a pack states its own list.

**The user's own `1-21-4-fabric` instance predates the flag** (`perf: ""`), so it had none of the set.
On 18 September 2026 they asked for Sodium "as default", were told it already is for new instances, and
chose to have the whole set put into that instance: done by calling `perf.fill()` from a script (the
launcher's own plan + sha1-checked install; Store and ContentStore read from disk on every call, so a
second process is safe while the launcher is open). It now has Sodium 0.6.13, Lithium 0.15.3,
FerriteCore 7.1.3 and Entity Culling 1.10.5 beside Caxton, Fabric API and the HUD mod — 7 mods; the
flag was left as it was. **The HUD mod has not been seen running with Sodium yet**: the world overlays
(hitboxes, chunk borders, waypoint beams, TNT timer) and the panel blur are what to look at first.
There is still no button that adds the set to an existing instance; Browse installs them by name.

Degrades rather than failing — `NO_BUILD` is caught per mod. Verified live: Fabric 1.21.4 gives 5 of 5,
Fabric 1.16.5 gives 4, NeoForge 1.21.1 gives 4, Forge 1.20.1 gives 2, 1.8.9 gives 0.

---

## Verify it yourself

    node tools/hudcheck.mjs          the HUD contract across three languages (201)
    node tools/perfcheck.mjs         the default set: ids, gates, the flag (33)
    node tools/perfcheck.mjs live    ... and ask Modrinth whether any of it exists
    node tools/clicktest.mjs         every control, does it respond (337)
    node tools/audit.mjs ui          the design standard
    node tools/phase3check.mjs       download/launch security assertions
    node tools/sessioncheck.mjs      online vs offline launch, and where the token goes (35)
    node tools/phase4check.mjs       loader merge rules
    node tools/phase5check.mjs       content install
    node tools/packcheck.mjs         what the packaged build contains
    bash  tools/scan.sh              Electronegativity + semgrep + npm audit + token containment

**`packcheck` fails 2 of 47 and it is not a bug** — `mc/deps.js` and `mc/hud.js` are absent from the
asar in `dist/`, built before either existed. Rebuild with `npm run dist`.

Stronger than any of those: run it with **Wireshark** open. It talks to Microsoft, Mojang, Modrinth
and nothing else.

**Watch out for the Bash heredoc.** It collapses `\\` to `\`, which has silently broken three
regexes and two `console.log` calls in this project. Write patch scripts to a file with the Write
tool and run them, rather than piping a heredoc into `python`.

---

## Next, after the feedback

1. **Cache the HUD render.** It rebuilds every string every frame — `config.names()` allocates a
   fresh list per frame just to iterate — and there are now twenty elements in that loop. The
   cheapest real win left; see the end of `docs/hud-backlog.md`.
2. **`docs/hud-backlog.md`** — what is left, including the three items that still need a mixin.
3. **Five dead switches** in the Tweaks list: Chat, Compass, Crosshair, Level head, Nick hider. Build
   them or delete the rows. A switch that does nothing is worse than an absent feature.
4. **The instance detail screen** still shows fixture data describing some other instance.
5. **CurseForge `.zip` packs**, **code signing** (a purchase, not a config change).

---

## Never commit

The real `auth.config.json` (gitignored; read the value with
`node -e "console.log(require('./auth.config.json').clientId)"`), anything under `%APPDATA%/Kestrel`,
the user's Minecraft username, or **local paths containing the Windows username** — that last was
committed once here and caught before it was pushed. `hud-inspos/`, `shots/`, `ref/`, `variants/`
and `docs/round*-judgement.json` are gitignored; `docs/screenshots/` is not.

**Grep for the VALUE, not the filename.** A filename check proves a filename is absent. The old
client id is still readable in history at `a46edfd` — that app is dead, but the lesson is why
`packcheck` holds this standard for the packaged build.

**Repo:** https://github.com/emirudev128-sys/KestrelClient — **all rights reserved**, source-available
for verification only. NOT open source; do not reintroduce MIT.

**Current branch:** `hud-per-element-style`, on GitHub with **no PR yet** — `git status` says whether
anything local is still unpushed; a count written here goes stale the moment it is committed. The
user wants to be happy with the menu before a PR is opened. `gh` is not installed on this machine —
pushing works, opening the PR needs their browser.
