# Kestrel — where the project stands

A privacy-first Minecraft launcher. Electron shell, plain HTML/CSS/JS renderer, no framework and no
build step. **It downloads and launches Minecraft, installs mod loaders, installs mods, and ships a
Fabric client mod that draws a configurable HUD.**

    npm start

---

## READ THIS FIRST

**Check a path before claiming anything about it, in either direction.** This section used to say in
bold that `%APPDATA%/Kestrel` was invisible from the shell. A whole session was spent quoting that
instead of testing it — refusing to look at the user's instances and saying so — and then one
`Test-Path` listed all thirty-nine of them, the installed jar with its byte count, the live
`config/kestrel-hud.json` and the game's own `latest.log`. **It is readable.** That lesson is worth
more than either answer: test, do not quote.

What it buys you is real end-to-end verification instead of "it compiles". After the user plays you
can read the config the mod wrote, see its `rev` and `by` stamp, and grep `logs/latest.log` for the
mod's own lines. That is how the round trip was finally proved.

**Writing there is the user's business.** Installing a jar, creating instances, editing their
config — ask. Reading to verify is free; changing their game is not.

**The user is right more often than the theory is.** Every visual bug reported in this project was
real, including one reported as "the sides look thicker, I thought that was the shadow" — which
turned out to be a border with no top or bottom edge at all.

**When a prototype is being made real, grep the SYMPTOM, not the action.** Six "Open folder"
controls existed; grepping for the handler found one, grepping for the placeholder string found
five. The same class of bug hit the launch buttons and the session clock.

---

## The three languages, and the file between them

The HUD exists in three places that cannot see each other:

    ui/index.html + ui/scripts/app.js   the screen a player arranges it on
    mc/hud.js                           what the launcher writes to disk
    client-mod/…/HudConfig.java         what the game reads back

Nothing links them at build time. **`node tools/hudcheck.mjs` is what notices** — 177 assertions,
and the last twenty run the COMPILED mod against a document the launcher just wrote, then read back
what it wrote. That is the only stage that can catch a locale-formatted number, a broken escape, or
a parser that loses a sign.

### The contract: `<instance>/minecraft/config/kestrel-hud.json`, version 6

```
{ "version": 6, "rev": 11, "by": "launcher",
  "style":    { "corners": "sharp", "font": "minecraft" },
  "optSpec":  { "compass": { "label": "Show the compass" }, … },
  "elements": { "fps": { "on": true, "module": "FPS", "label": "FPS",
                         "anchor": "tl", "x": 2.6, "y": 4.2, "scale": 1,
                         "plate": true, "plateColour": "#0A0E13", "plateAlpha": 72,
                         "textColour": "#F1F4F7", "textAlpha": 100 } },
  "features": { "zoom": { "on": true, "label": "Zoom", "desc": "…",
                          "key": "KEY_C", "opts": { "amount": "4x" } } } }
```

**Two nouns, and the distinction is load-bearing.**

- An **element** is a plate of text at one of nine anchors, with an offset, a scale and a style.
  Twenty of them.
- A **feature** is on-or-off, a key, and its own options. No anchor, no colour, no scale. Six.

Forcing a feature into `elements` would put `plateAlpha` on a toggle-sprint and show a colour picker
to somebody opening the options for Zoom.

**Things that will bite you if you do not know them:**

- **Percentages may be NEGATIVE.** Against a centre or middle anchor the offset runs both ways from
  the middle. The stock layout has one (`helmet` at `mr` / `-9.6`). Both sides clamp `-100..100`.
  Clamping at zero silently dropped that element into the centre for months.
- **Visibility arrives resolved.** The launcher groups elements into MODULES ("Armor status" owns
  five) and writes a plain `on` per element. The mod never needs to know what a module is to draw.
- **The mod has no vocabulary.** `module`, `label`, `desc` and the whole `optSpec` travel in the
  document. Add an option in `mc/hud.js` and it appears in the in-game menu **with no Java
  changing**. Do not give the mod a label table; that rule is what this design rests on.
- **One option name means one thing.** `optSpec` is a single global table shared by elements AND
  features, deduped by name. `hudcheck` asserts no name is used twice with a different type or
  label — that already caught `unit` being a switch on ping and an enum on memory.
- **The parser walks MATCHING braces.** It used `indexOf('}')`, correct only while an element was
  flat. `opts` is nested, so the first `}` is now that object's.

### Two writers, and neither erases the other

`by` says who wrote it last; `rev` counts up. The mod stamps `"game"`; on the next launch
`hud.sync()` reads FIRST, folds a game-written document back into `settings.hud`, persists it, and
only then rewrites — stamped `"launcher"` again, which is what makes the import happen exactly once.

**The decision rests on `by` alone, not on comparing revs.** `settings.hud` is one GLOBAL object and
the config is PER INSTANCE, so revs across instances are not a total order: edit in-game in A,
launch B, return to A, and a rev comparison silently discards A's edit.

---

## The client mod

    client-mod/  →  build/libs/kestrel-hud-0.1.0.jar

**Neither `gradle` nor a JDK 21 is on PATH, and there is no wrapper.** `java` on PATH is 1.8 and
will not compile this. In PowerShell:

    $env:JAVA_HOME = (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Filter "jdk-21*")[0].FullName
    $g = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.14.3-bin" -Recurse -Filter gradle.bat)[0].FullName
    & $g -p client-mod build

Gradle 9.2.0 is also in that dists folder and loom 1.9.2 refuses to load under it — take 8.14.3.
`tools/hudcheck.mjs` finds the JDK itself and says so when it cannot.

Install by copying **only** `kestrel-hud-0.1.0.jar` into `<instance>/minecraft/mods/`. Not the
`-sources.jar` — it carries an unexpanded `${version}` in its `fabric.mod.json` and Fabric warns
about it on every launch.

### What is in it

| file | what it is |
|---|---|
| `KestrelHudClient` | entrypoint, keybind, the live HUD render callback |
| `HudConfig` | the contract: hand-rolled parser and writer, no JSON library |
| `HudElements` | what each element says — LIVE values, or fixed SAMPLE text |
| `HudRenderer` | geometry and drawing, forward AND inverse (the editor needs both) |
| `Paint` / `Ui` | the palette, and the furniture: panel, card, stepper, slider, swatches |
| `HudMenuScreen` | Right Shift — a card grid of modules, plus feature rows |
| `HudElementScreen` | one element's options, or one feature's |
| `HudLayoutScreen` | drag with magnet snapping |
| `Behaviours` | sprint, sneak, zoom, snap look |
| `Overlays` | hitboxes and chunk borders, in the world render pass |
| `Clicks` / `Combat` / `Session` | the state the counters need |

**Design rules that are decisions, not accidents — each asserted by `hudcheck`:**

- **NO MIXINS.** Everything goes through supported Fabric entry points. Four backlog items need one;
  see `docs/hud-backlog.md` before adding the first.
- **NO SHADOWS.** Every `drawText` passes `false`. Minecraft draws a shadow as a hard offset copy of
  every glyph, which is the look the plate exists to avoid.
- **NO OUTLINES on the menu.** Depth is the alpha ladder — panel 43%, card 64%, hover 79%, well 81%
  COMPOSITED. `roundBorder` was deleted rather than left unused.
- **NOTHING IN A MENU MOVES.** Every preview is `HudElements.SAMPLE`, fixed text. A live fps counter
  in a card flickers and changes width; in the layout editor that makes an element impossible to
  align against its neighbours.
- **The menu is softened, the HUD is not.** Menu corners are rounded (panel 4, card 3, well 2,
  control 2); a HUD plate stays square because Minecraft's own panels are.

---

## What works, verified end to end

| | proof |
|---|---|
| **Vanilla / Fabric / Forge / NeoForge** | all launch; NeoForge 1.21.1 into a world, processors run |
| **Mods** | installed through the UI, hash-checked, dependencies resolved |
| **Modpacks** | `.mrpack` installed end to end — 50 files, 55 overrides |
| **Accounts** | Microsoft device-code flow, tokens never leave the main process |
| **The HUD draws in-game** | confirmed on screen by the user |
| **The in-game menu runs** | user opened it, dragged coords to top-centre, saved revs 9→11 |
| **The magnet works** | that drag landed at `tc` with `x: 0` — it caught the centre line exactly |
| **The round trip** | the compiled mod read a launcher document, edited it, wrote it back; the launcher imported it exactly once |
| **Packaging** | `Kestrel-0.5.0-Setup.exe`, 106 MB, launches from its own asar |

---

## New instances get a performance set

Created with `perf: 'pending'`; the first launch installs **Sodium, Lithium, FerriteCore and Entity
Culling** from pinned Modrinth ids in `mc/perf.js`. That is what makes "more frames" a claim this
launcher can actually make — the engine doing the work is Sodium's, installed by name, visible in
the mods list and removable like anything else.

**ABSENT MEANS OFF, and that is the safety property.** Only `store.create()` sets the flag — NOT
`clean()`, which also runs on `update()` and `seed()` and would have marked all thirty-nine existing
instances. Retro-fitting mods into somebody's tuned setup is the failure that loses trust in a
launcher's mods folder for good. Modpack imports pass `'off'`: a pack states its own list.

It degrades rather than failing — `NO_BUILD` is caught per mod. Verified live: Fabric 1.21.4 and
1.16.5 give 4 of 4, NeoForge 1.21.1 gives 4 of 4, Forge 1.20.1 gives 2 of 4, 1.8.9 gives 0.

---

## Verify it yourself

    node tools/hudcheck.mjs          the HUD contract across three languages (177)
    node tools/perfcheck.mjs         the performance set: ids, gating, the flag (26)
    node tools/perfcheck.mjs live    ... and ask Modrinth whether any of it exists
    node tools/clicktest.mjs         every control, does it respond (340)
    node tools/audit.mjs ui          the design standard
    node tools/phase3check.mjs       download/launch security assertions
    node tools/phase4check.mjs       loader merge rules
    node tools/phase5check.mjs       content install
    node tools/packcheck.mjs         what the packaged build contains
    bash  tools/scan.sh              Electronegativity + semgrep + npm audit + token containment

**`packcheck` fails 2 of 47 and it is not a bug** — `mc/deps.js` and `mc/hud.js` are absent from the
asar in `dist/`, which was built before either existed. Rebuild with `npm run dist`.

Stronger than any of those: run it with **Wireshark** open. It talks to Microsoft, Mojang, Modrinth
and nothing else.

---

## THE ONE THING NOBODY HAS DONE

**Almost nothing from the last two sessions has been seen on screen.** The menu was opened once, in
an earlier form. Since then: nine more elements, six features, world overlays, per-element options,
and the entire visual pass — glass panel, rounded corners, no borders, no shadows, static previews.

The world overlays are the part a compiler cannot check at all: a render pass either draws or it
does not. **Build the jar, copy it into an instance, load a world, press Right Shift.**

There is a pixel-accurate mockup of the menu at
`https://claude.ai/code/artifact/69a0c0f0-a7f8-40b3-8c68-5a4850aac95b`, built from the mod's own
constants with every proportion and alpha on a slider, and its own harness asserting it has not
drifted from the Java. Use it to settle proportions without a build — it cannot tell you whether the
overlays render.

---

## Next

1. **Look at it in game.** Everything below is guesswork until then.
2. **Cache the HUD render.** It rebuilds every string every frame — `config.names()` allocates a
   fresh list per frame just to iterate — and there are now twenty elements in that loop. This is the
   cheapest real win left; see the end of `docs/hud-backlog.md`.
3. **`docs/hud-backlog.md`** — what is left, including the four items that need a mixin and why none
   was added.
4. **Five dead switches** in the Tweaks list: Chat, Compass, Crosshair, Level head, Nick hider. Build
   them or delete the rows. A switch that does nothing is worse than an absent feature.
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

**Do not name other launchers or clients anywhere in this repository.** Design notes carry the
reasoning on their own terms; `docs/hud-menu-design.md` is the model. The reference screenshots in
`hud-inspos/` stay gitignored.

**Current branch:** `hud-per-element-style`, 13 commits ahead of `origin/main`, **unpushed** — the
user wants to see the menu in game before a PR is opened.
