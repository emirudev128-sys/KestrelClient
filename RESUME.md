# Kestrel — where the project stands

A privacy-first Minecraft launcher. Electron shell, plain HTML/CSS/JS renderer, no framework, no
build step. **It downloads and launches Minecraft, installs mod loaders and mods, and ships a Fabric
client mod that draws a fully configurable HUD.**

    npm start

---

## THE SESSION THAT STARTS HERE

**The user has just tested the HUD in game and is about to give visual feedback.** That is the whole
job: read what they say, change it, rebuild, hand back a jar. Everything below is arranged for that.

**They tested a build that was missing nine of the twenty elements.** `build()` walked the stored
settings instead of the declaration, so the nine newest never reached the game — the log said
`saved revision 20 (11 element(s))`. **This is fixed** (commit `dfe9b78`) but the fix landed AFTER
their test, so:

- Any feedback about elements is about **eleven** of them: fps, cps, ping, keystrokes, coords,
  potion effects and the five armour slots.
- They have **never seen** day counter, clock, playtime, memory, combo, totems, TNT, reach or PvP
  info — nor the six features, which *did* reach the file but were all switched off by default.
- **Build and hand them a fresh jar early**, so their next look is at the whole thing.

### The loop, end to end

    # 1. build  (neither gradle nor JDK 21 is on PATH; `java` on PATH is 1.8 and will not do)
    $env:JAVA_HOME = (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Filter "jdk-21*")[0].FullName
    $g = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.14.3-bin" -Recurse -Filter gradle.bat)[0].FullName
    & $g -p client-mod build

    # 2. verify
    node tools/hudcheck.mjs        # 184 assertions; the last twenty run the COMPILED mod

    # 3. hand over  client-mod/build/libs/kestrel-hud-0.1.0.jar
    #    ONLY that file. Not -sources.jar: it has an unexpanded ${version} and Fabric warns.

Gradle 9.2.0 is in that dists folder too and loom 1.9.2 refuses to load under it — take **8.14.3**.

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

| feedback about | file | what to change |
|---|---|---|
| menu transparency | `Paint.java` | `PANEL` `SCRIM` `RAISE` `HOVER` `ACTIVE` `WELL` — ARGB, alpha in the top byte |
| menu corners | `Paint.java` | `R_PANEL` `R_CARD` `R_WELL` `R_CTRL`; the arcs are `Ui.ARC` |
| card size / grid | `HudMenuScreen.java` | `CARD_W` `CARD_H` `CARD_GAP` `WELL_H` `BTN_H` `MAX_COLS` |
| options screen | `HudElementScreen.java` | `PANEL_W` `PREVIEW_H` `VALUE_W` |
| spacing rhythm | `Paint.java` | `ROW` `PANEL_PAD` `SECTION_GAP` |
| HUD plate itself | `Paint.java` | `PLATE` `EDGE` `PAD_X` `PAD_Y` `LINE` `GAP` `STACK_GAP` |
| what an element says | `HudElements.java` | one `case` per element, LIVE and SAMPLE |
| magnet feel | `HudLayoutScreen.java` | `SNAP` (5px), `INSET_X/Y` |

**There is a pixel-accurate mockup** of the menu at
`https://claude.ai/code/artifact/69a0c0f0-a7f8-40b3-8c68-5a4850aac95b` — built from the mod's own
constants, every proportion and alpha on a slider, with its own harness asserting it has not drifted
from the Java. Use it to settle proportions **without a build**. It cannot tell you whether the world
overlays render.

---

## Design rules already settled — do not undo these without being asked

Each is asserted by `hudcheck`, so breaking one fails a check rather than shipping.

- **NO MIXINS.** Everything goes through supported Fabric entry points. Four backlog items need one;
  read `docs/hud-backlog.md` before adding the first.
- **NO SHADOWS.** Every `drawText` passes `false`. Minecraft draws a shadow as a hard offset copy of
  every glyph — the look the plate exists to avoid. This was reverted once already.
- **NO OUTLINES on the menu.** Depth is the alpha ladder: panel 43%, card 64%, hover 79%, well 81%
  **composited**. A card at 37% over a 43% panel reads as 64% — compare composited values, never raw
  alphas. `roundBorder` was deleted rather than left unused.
- **NOTHING IN A MENU MOVES.** Every preview is `HudElements.SAMPLE`, fixed text. A live fps counter
  in a card flickers and changes width; in the layout editor that makes an element impossible to
  align.
- **The menu is softened; the HUD is not.** Menu corners are rounded; a HUD plate stays square
  because Minecraft's own panels are.
- **Do not name other launchers or clients anywhere in this repo.** Design notes carry the reasoning
  on their own terms — `docs/hud-menu-design.md` is the model. `hud-inspos/` stays gitignored.

**The user's dialled-in values** (do not "improve" these; they were set by eye against the real
game): panel 43%, scrim 0%, cards 37%, hover 63%, pressed 58%, well 46%, card gap 9.

---

## The three languages, and the file between them

The HUD exists in three places that cannot see each other:

    ui/index.html + ui/scripts/app.js   the screen a player arranges it on
    mc/hud.js                           what the launcher writes to disk
    client-mod/…/HudConfig.java         what the game reads back

Nothing links them at build time. **`node tools/hudcheck.mjs` is what notices** — 184 assertions,
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
| `Paint` / `Ui` | the palette, and the furniture: panel, card, stepper, slider, swatches |
| `HudMenuScreen` | **Right Shift** — a card grid of modules, plus feature rows |
| `HudElementScreen` | one element's options, or one feature's |
| `HudLayoutScreen` | drag with magnet snapping |
| `Behaviours` | sprint, sneak, zoom, snap look |
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
| **Accounts** | Microsoft device-code flow, tokens never leave the main process |
| **The HUD draws in-game** | confirmed on screen |
| **The menu runs in-game** | opened repeatedly, saved revisions 9 → 20, **no exceptions in the log** |
| **The magnet works** | a drag landed at `tc` with `x: 0` — it caught the centre line exactly |
| **The round trip** | the compiled mod read a launcher document, edited it, wrote it back; the launcher imported it exactly once |
| **Packaging** | `Kestrel-0.5.0-Setup.exe`, 106 MB, launches from its own asar |

**Still never seen on screen:** the nine new elements, the six features, and the **world overlays** —
which is the part a compiler cannot check at all, since a render pass either draws or it does not.

---

## New instances get a performance set

Created with `perf: 'pending'`; the first launch installs **Sodium, Lithium, FerriteCore and Entity
Culling** from pinned Modrinth ids in `mc/perf.js`. That is what makes "more frames" a claim this
launcher can honestly make — the engine doing the work is Sodium's, installed by name, visible in the
mods list, removable like anything else.

**ABSENT MEANS OFF, and that is the safety property.** Only `store.create()` sets the flag — NOT
`clean()`, which also runs on `update()` and `seed()` and would have marked all thirty-nine existing
instances. Retro-fitting mods into somebody's tuned setup is the failure that loses trust in a
launcher's mods folder for good. Modpack imports pass `'off'`: a pack states its own list.

Degrades rather than failing — `NO_BUILD` is caught per mod. Verified live: Fabric 1.21.4 and 1.16.5
give 4 of 4, NeoForge 1.21.1 gives 4 of 4, Forge 1.20.1 gives 2 of 4, 1.8.9 gives 0.

---

## Verify it yourself

    node tools/hudcheck.mjs          the HUD contract across three languages (184)
    node tools/perfcheck.mjs         the performance set: ids, gating, the flag (26)
    node tools/perfcheck.mjs live    ... and ask Modrinth whether any of it exists
    node tools/clicktest.mjs         every control, does it respond (337)
    node tools/audit.mjs ui          the design standard
    node tools/phase3check.mjs       download/launch security assertions
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

**Current branch:** `hud-per-element-style`, **14 commits ahead of `origin/main`, unpushed.** The
user wants to be happy with the menu before a PR is opened. `gh` is not installed on this machine —
pushing works, opening the PR needs their browser.
