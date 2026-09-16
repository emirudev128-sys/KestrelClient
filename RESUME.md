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

**The launcher's own HUD screen still draws armour and totems as words** — it cannot read a
player's resource packs the way the game can.

**Earlier jars are backed up** in that session's scratchpad: `kestrel-hud-0.1.0.previous.jar` (the card-grid
menu), `kestrel-hud-0.1.0.editor-v1.jar` (the new editor before icons, mouse and Caxton),
`kestrel-hud-0.1.0.editor-v2.jar` (before centred keystrokes, durability numbers and effect icons),
`kestrel-hud-0.1.0.editor-v3.jar` (the Kestrel HUD font still Azeret Mono Bold).

### The loop, end to end

    # 1. build  (neither gradle nor JDK 21 is on PATH; `java` on PATH is 1.8 and will not do)
    $env:JAVA_HOME = (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Filter "jdk-21*")[0].FullName
    $g = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.14.3-bin" -Recurse -Filter gradle.bat)[0].FullName
    & $g -p client-mod build

    # 2. verify
    node tools/hudcheck.mjs        # 201 assertions; the last twenty run the COMPILED mod

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

- **NO MIXINS.** Everything goes through supported Fabric entry points. Four backlog items need one;
  read `docs/hud-backlog.md` before adding the first.
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
                "wear": { "label": "Durability", "vals": ["bar","percent","none"] }, … },
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
  Twenty.
- A **feature** is on-or-off, a key, and its own options. No anchor, no colour, no scale. Six.

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
| `Behaviours` | sprint, sneak, zoom, snap look — and their keys, rebindable from the menu |
| `Overlays` | hitboxes and chunk borders, in the world render pass |
| `Clicks` / `Combat` / `Session` | the state the counters need |

**Twenty elements:** fps, cps, ping, keystrokes, coords, potion effects, helmet/chest/legs/boots/held,
day, clock, playtime, memory, combo, totems, tnt, reach, pvp.

**Six features:** sprint, sneak, zoom, snaplook, hitbox, chunks — **all off by default**, so the user
will see nothing from them until they switch one on in the menu.

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

**Still never seen on screen:** the nine new elements, the six features, and the **world overlays** —
which is the part a compiler cannot check at all, since a render pass either draws or it does not.

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
2. **`docs/hud-backlog.md`** — what is left, including the four items that need a mixin and why none
   was added.
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
