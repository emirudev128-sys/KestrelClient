# Kestrel — where the project stands

A privacy-first Minecraft launcher. Electron shell, plain HTML/CSS/JS renderer, no framework and no
build step. **It downloads and launches Minecraft, installs mod loaders, and installs mods.**

    npm start

## READ THIS FIRST — how the last session actually went wrong

**Your shell and the user's app do not share `%APPDATA%.`** The project folder IS shared — code
edits reach them instantly, `git pull` says "already up to date" because it is the same working
tree — but `%APPDATA%/Kestrel` is not. Instances you create with a script go into YOUR data folder
and the user never sees them. An hour went into "why can't I see the HUD Test instance"; the answer
was that it was never on their machine.

So: **never say "verified on your machine" about anything under `%APPDATA%`.** Code checks are real.
Instances, worlds, mods, HUD config and launches are not, unless you inspected the user's own
running app over a debug port they started.

**When a prototype is being made real, grep the SYMPTOM, not the action.** Six "Open folder" controls
existed. Grepping for the handler found one; grepping for the placeholder string `"Would open"`
found five, plus one with no `data-act` at all that could not even reach a handler. The same class
of bug hit the launch buttons: `currentInstance()` answered "the row marked current, or failing that
the FIRST row", so every card launched 1.21.4 Fabric.

**The user is right more often than the theory is.** Three times a reported bug was explained away
as a stale window or a misclick, and three times it was real.

## The client mod

    cd client-mod && gradle build      # JDK 21 + Gradle 8; loom 1.9.2 (1.17 needs Gradle 9.5)
    -> build/libs/kestrel-hud-0.1.0.jar

**Neither `gradle` nor a JDK 21 is on PATH on this machine**, and there is no `gradlew` wrapper in
the project, so that line does not run as written. Gradle 8.14.3 is in the wrapper cache under
`%USERPROFILE%\.gradle\wrapper\dists\gradle-8.14.3-bin\<hash>\gradle-8.14.3\bin\gradle.bat` (the
hash is a directory name — list the folder to find it), and the JDK is Adoptium 21 under
`%ProgramFiles%\Eclipse Adoptium`. In PowerShell:

    $env:JAVA_HOME = (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Filter "jdk-21*")[0].FullName
    $g = (Get-ChildItem "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.14.3-bin" -Recurse -Filter gradle.bat)[0].FullName
    & $g -p client-mod build

`java` on PATH is 1.8, which will not compile this. Gradle 9.2.0 is also in that dists folder and
loom 1.9.2 refuses to load under it — take the 8.14.3 one. `tools/hudcheck.mjs` finds the JDK on its
own (JAVA_HOME, then PATH, then Adoptium) and says so when it cannot.

Paths are written with `%USERPROFILE%` rather than spelled out because this repository is public and
a home directory names its owner — the same rule as the rest of the never-commit list at the bottom.

Install by copying that jar into `<instance>/minecraft/mods/`. Fabric API installs itself now
(mc/deps.js reads what the jars declare). Verified on 1.21.4: builds, loads, draws.

**The contract** is one file, `<instance>/config/kestrel-hud.json`, **version 4**, written by
`mc/hud.js` and read AND WRITTEN by `HudConfig.java`. `tools/hudcheck.mjs` asserts the three
languages agree — markup, JS, Java — in 121 assertions, the last twenty of which run the compiled
mod against a document the launcher just wrote and read back what it wrote. Positions are percentages
against nine anchors, plus a scale; visibility is resolved launcher-side from the seven MODULES
(Armor status owns five elements); `module` and `label` travel in the document so the in-game menu
has no vocabulary of its own.

**Version 4 added PER-ELEMENT STYLE**: `plate` (is there a box at all), `plateColour`, `plateAlpha`,
`textColour`, `textAlpha`. Corners and font stay whole-HUD — three sharp plates and one rounded one
is still a mistake — but colour, transparency and the box are per element, because picking ONE
element out of the rest is the entire reason anybody opens the menu. **Every default is the old
hard-coded constant to the byte** (`#0A0E13` at 72% is `Paint.PLATE`, `#F1F4F7` is `Paint.VALUE`),
so an unstyled HUD is pixel-identical to before.

The label tone used to be a second hard-coded grey (`#929497`). Two hard-coded greys cannot survive
somebody picking red, so a label is now its element's own colour at 58% alpha — which over the
default plate blends to `#909294`, the grey it replaces. The ACCENT (low fps, the compass letter)
deliberately does NOT follow the element colour: it marks the case worth noticing, and a "worth
noticing" the same colour as everything around it has stopped noticing anything.

## Phase 2 is built: the in-game menu

**Right Shift opens it, in a world.** `HudMenuScreen` is **a grid of cards, one per module**, each
with its own `OPTIONS` and `ENABLED`. The first version was a list of rows with a toggle on the
right; it worked and it was not what was asked for. The card is right because **enable and configure
are two different controls**, and a row with one toggle has nowhere to put the second.

**Every card draws the real element** — actual colours, actual transparency, actual plate setting,
through the same renderer the world uses. The grid is a contact sheet of your HUD. An invented icon
would have been more work and told you less.

`OPTIONS` opens **`HudElementScreen`**: size (slider), anchor, show-the-box, box colour, box
opacity, text colour, text opacity, and the compass on coords. A live preview sits at the top with
the WORLD showing through behind it, because "does this read at 30%" is a question about the world
and a preview on flat grey answers a different one. Where a module owns more than one element
(Armor status owns five) a `< HELMET >` stepper moves between them.

`EDIT HUD LAYOUT` drops into `HudLayoutScreen`: the HUD alone on screen with drag, **magnet
snapping**, wheel-to-scale, arrow-nudge and Alt to suppress the magnet. Both sub-screens hand back
to the menu, and the menu is the single exit — so a whole session of dragging, toggling and
recolouring produces exactly one write, and opening the menu to look at it produces none.

The magnet snaps, in this order: the nine anchors (flush, the launcher's stock 2.6%/4.2% inset, and
the centre lines), then other elements' leading edges, trailing edges, centres, and the two positions
that sit one element directly beside or beneath another. Five pixels of pull, and a guide line is
drawn at whatever it caught on.

**Files:** `HudMenuScreen`, `HudElementScreen`, `HudLayoutScreen`, `Ui` (the furniture — panel,
card, stepper, checkbox, slider, colour swatches, gear — drawn by hand rather than from
`ButtonWidget`, because vanilla's widgets carry vanilla's look), plus `HudRenderer` and `HudElements`
split out of the render callback so the live HUD, the cards, the preview and the editor all draw
from ONE source. An editor arranging boxes of a different width from the ones the game will draw is
an editor that lies.

**Colour is picked from swatches, not a wheel or a hex field.** A hex field needs a focus model and a
validation state for a value that is wrong most of the time you are typing it; a wheel needs a
shader. Fourteen squares: Kestrel's own four first, so "put it back" is a click, then Minecraft's
chat colours, which are the ones players already have names for.

**`HudElements.Run` carries a ROLE, not a colour** (`VALUE`/`LABEL`/`ACCENT`). It used to carry a
resolved colour, which was fine while the colours were two constants — but a run that had already
decided it was `#F1F4F7` cannot be repainted when somebody picks red.

**Reference screenshots the user supplied live in `hud-inspos/`**, which is gitignored and stays
that way — they are other people's product UI. Look at them before touching the visuals; do not
describe them, name them or quote them in anything tracked. `docs/hud-menu-design.md` holds the
design decisions on their own terms, with the reasoning and without the attributions, which is the
form they belong in for a public repository.

### The ownership question, settled

**The user chose read-back with provenance.** The document carries `rev` and `by`. The mod stamps
`by: "game"`; on the next launch `hud.sync()` reads first, folds a game-written document back into
`settings.hud`, persists that through the store, and only then writes — stamped `by: "launcher"`
again, which is what makes an edit import exactly once. Verified both directions with the real
compiled jar's classes, including the second launch importing nothing.

**One refinement on the proposal as it was put to the user:** the decision rests on `by` alone, NOT
on "is this rev newer than the one we last wrote". `settings.hud` is one GLOBAL object and the config
file is PER INSTANCE, so revs across instances are not a total order — edit in-game in A, launch B,
return to A, and a rev comparison discards A's edit silently. `rev` stays for the log line.

### The launcher screen was write-only, and that had to be fixed to ship this

`saveHud()` wrote `settings.hud` and **nothing ever read it back**. `ST` was built from the markup's
`data-` attributes at startup ([app.js:1289](ui/scripts/app.js:1289)) and `host.settings.get()` was
never called for the HUD at all — so the launcher forgot its own layout every session, and the first
drag on that screen wrote the STOCK arrangement over whatever had been set in game.

Version 4 made that fatal rather than annoying: `store.js` merges patches at the top level only, so
`{hud: …}` swapped the whole object and every per-element colour, transparency and plate setting went
with it. One drag in the launcher and an evening's work in game was gone, with a "Saved" flashing to
confirm it.

Both halves fixed. `loadHud()` reads the stored layout into `ST` at startup and the stored module
state into `MODG` (via the same field `eff()` reads, not through `setVal()`, which would mark every
row dirty — dirty means *changed from default*, not *restored from disk*). `saveHud()` now reads,
lays this screen's four fields over what is stored, and writes back: `a/x/y/s` are what it owns and
may overwrite; everything else travels through untouched.

### A bug this turned up

Both sides clamped percentages to `0..100`. A centre or middle anchor offsets in **both** directions
from the middle — the HUD screen's own `place()` writes `top: calc(50% + Y%)` — and the stock layout
has one, `helmet` at `mr` / `-9.6`. So every launch was writing that element as `0`, dropping the
helmet icon into the vertical centre of the screen. Invisible only because the mod does not draw
armour yet. Both sides clamp `-100..100` now, and hudcheck asserts the markup's own negative offset
survives the trip.


## What works, verified end to end on this machine

| | proof |
|---|---|
| **Vanilla launch** | 1.8.9 — 770 files, 146 MB, 19.8 s to running. Second launch: 0 bytes, 0.8 s. |
| **Fabric** | 1.16.5 launched — `Loading Minecraft 1.16.5 with Fabric Loader 0.19.3` |
| **Forge (legacy)** | 1.8.9 launched — `Forge Mod Loader version 11.15.1.2318 loading` |
| **NeoForge** | 1.21.1 **launched** — processors run, patched jar built, loaded into a world on Java 21 |
| **Forge (modern)** | 1.20.1 47.4.23 installed — 6 processors run, 2 output digests verified |
| **Mods** | Sodium installed through the UI, launched, `- sodium 0.2.0+build.4` in the log |
| **Dependencies** | REI planned 3 and installed 3, each hash-checked |
| **Disable** | `.jar.disabled` — next launch logged 56 mods instead of 57 |
| **Accounts** | Microsoft device-code flow, real client id, tokens never leave the main process |
| **Client mod** | `kestrel-hud` **draws in-game**, confirmed on screen by the user: fps and coords on a plate |
| **HUD wiring** | The screen's layout persists and reaches the mod: 11 elements, 6 anchors, scales intact |
| **HUD round trip** | The **compiled** mod read a launcher document, edited it, wrote it back; the launcher took the edit and, on the next launch, imported nothing. Negative offsets, fractional scales and a non-ASCII label all intact |
| **Modpacks** | Fabulously Optimized (.mrpack) planned and installed — 50 files sha1-checked, 55 overrides |
| **Packaging** | `Kestrel-0.5.0-Setup.exe`, 106 MB. The packaged app launches and runs out of its own asar. |

## Architecture

    main.js        window, IPC, session hardening (CSP, permission denial)
    preload.js     the contextBridge - named functions only
    store.js       %APPDATA%/Kestrel - instances as folders
    msauth.js      the six-request Microsoft chain, main process only
    accounts.js    accounts.json, credential half sealed with safeStorage
    auth-config.js client id resolution + the Azure/Mojang procedure
    mc/            paths, net, unzip, version, install, java, launch, loaders, content,
                   processors (Forge/NeoForge installer processors), modpack (.mrpack)
    ui/            the renderer - index.html, styles/, scripts/, icons/
    client-mod/    the Fabric mod: reads config/kestrel-hud.json, draws the HUD
    electron-builder.yml  what ships, as an allow-list, and the NSIS options
    build/         icon.ico and icon.png, generated from the mark in the icon set

**Security posture.** `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, a CSP with no
inline script and no eval, all permissions denied, an exact-match download host allow-list, SHA
verification on every downloaded file, zip-slip guards, path containment proved rather than assumed,
and no token on a command line (the launcher refuses rather than leaking on Java 8).

## Verify it yourself

    node tools/clicktest.mjs      every control, does it respond
    node tools/audit.mjs ui       the design standard
    node tools/phase3check.mjs    download/launch security assertions (33)
    node tools/phase4check.mjs    loader merge rules (60)
    node tools/phase4check.mjs modern   ... and really install + launch NeoForge 1.21.1 (83)
    node tools/phase5check.mjs    content install
    node tools/hudcheck.mjs       the HUD contract across markup, JS and Java (121)
    node tools/packcheck.mjs      what the packaged build actually contains (47)
    bash  tools/scan.sh           Electronegativity + semgrep + npm audit + token containment

Stronger than any of those: run it with **Wireshark** open. It talks to Microsoft, Mojang, Modrinth
and nothing else.

## Not finished

- **Update checking reports but does not apply** — installing the newer version replaces the file.
- **Mojang has not approved the Azure application** for the Minecraft scopes, so the final token
  exchange will 403 until they do. Form: https://aka.ms/mce-reviewappid
- **Only two HUD elements are DRAWN (fps, coords).** The screen arranges eleven, the launcher writes
  eleven, and the menu now lists and toggles all seven modules — the nine undrawn ones are marked
  `not drawn yet` on their row, and the layout editor shows them as their own label in the muted ink
  rather than as invented sample data. Positioning them works; they just do not appear in-world.
  That is the next piece and it is Java: `HudElements.of()` is the one place to add each.
- **THE CARD GRID AND THE OPTIONS SCREEN HAVE NOT BEEN SEEN.** The first menu was tested by the user
  and sent back; this replaces it, compiles, and its contract is proved end to end against the
  compiled classes — but nothing can drive Minecraft into a world unattended, so no pixel of the
  cards, the swatches, the sliders or the preview strip has been looked at. Card sizes (76x62, three
  across), the 14-colour palette and the preview strip height are all picked blind.
- `HudRenderCallback` is **deprecated** in Fabric's 1.21.4 API (`-Xlint:deprecation` names it, and it
  is the only warning in the build). It still works — it is what has been drawing on screen — but a
  future API version will drop it for `HudLayerRegistrationCallback`. Left alone deliberately: it is
  the one part of this that is confirmed working by eye.

## Where things stand (last session)

**Packaging is done.** `npm run icon && npm run dist` produces `dist/Kestrel-0.5.0-Setup.exe`, 106 MB,
per-user NSIS, unsigned. `electron-builder.yml` holds the whole configuration and the reasoning.
The packaged build was launched and inspected live over CDP rather than assumed: the renderer loads
from `app.asar/ui/index.html`, `brand.js` imports as an ES module from *inside* the archive (the
`readFileSync` fallback in `main.js` was never reached), 969 CSS rules resolve, and the instance
list renders from the real store. What was NOT done: the installer has not been run through a clean
install on a fresh machine, and nothing is code signed.

**`package.json` was wrong on three counts** and is fixed. It declared `"license": "ISC"` against an
all-rights-reserved LICENSE, it was still named `mc-launcher`, and it carried Playwright as a
*runtime* dependency — which would have put the whole browser automation stack inside the
installer. There are now **zero runtime dependencies**, and `packcheck` asserts it.

**The version is in two places now** — `package.json` (electron-builder reads it) and `BRAND.version`
(the UI reads it). Bump both. `packcheck` fails if they diverge, which is the only reason two
places is tolerable.

**A packaged build deliberately carries no client id** and starts in demo mode. `auth.config.json`
is excluded from `files:`, so an installer built from this repo cannot leak it. To sign in from an
installed copy, put `auth.config.json` in `%APPDATA%\Kestrel\` — `auth-config.js` looks there
first, which is what that ordering was always for.

**Modpacks install, and the Import screen is wired to it.** `mc/modpack.js` reads a `.mrpack`,
plans it, and installs it as a new instance. The picker is opened in the MAIN process — `pack.choose()`
takes no argument at all, so the renderer cannot name a file to read any more than it can name a url
to download — and `pack.install()` hands back only the plan id. Verified: Fabulously Optimized
installed end to end (50 files, 55 overrides), and a bogus plan id round-trips through IPC and comes
back refused. NOT covered by a test: the `dialog.showOpenDialog` seam itself, which needs a human to
click. CurseForge `.zip` is a different manifest and is refused by name.

**Modern Forge and NeoForge work now.** `mc/processors.js` runs the installer's processors — a JVM
per processor, in order, with the `data` block resolved for the client side. NeoForge 1.21.1 was
installed and **launched into a world**; Forge 1.20.1 installs and its declared output digests are
verified. Three things worth knowing before touching it:

- **The ordering is load-bearing.** The processors patch the vanilla client jar, so they cannot run
  in `installLoader` — that is called *before* the vanilla install, because the profile is what
  names the libraries to fetch. They run at the end of `Game.install()`. `pwarn` is cleared only if
  a processor actually ran, and `pjar` on the record is how a later session finds the installer.
- **NeoForge publishes no output digests at all** — zero across its ten processors, where Forge
  1.20.1 declares two. So for NeoForge the six JVMs exit 0 and nothing has verified they wrote
  anything. `runProcessors` therefore checks the `PATCHED` artefact exists and is non-empty
  regardless, and the log says which case it is in rather than implying verification happened.
- **`-DignoreList` had to be corrected at launch.** Modern Forge/NeoForge run through
  BootstrapLauncher, which moves everything on the classpath to the MODULE path except the
  filenames in that list. Their profiles write `${name}.jar`, guessing the launcher names the game
  jar after the version being launched. This one does not — `jar` means the client jar is the
  PARENT's, so `1.21.1.jar` went on the classpath, was not ignored, and collided with the patched
  `minecraft` module: `ResolutionException: Modules _1._21._1 and minecraft export package
  net.minecraft.data`. `mc/launch.js` appends the real basename to the list.

**The User-Agent is fixed.** It used to send `Kestrel/1.0 (+https://github.com/kestrel-launcher)` —
an organisation that does not exist, and a version the product had not been on for months. It now
sends `Kestrel/0.4.2 (+https://github.com/emirudev128-sys/KestrelClient)`, built once by
`BRAND.userAgent` in `brand.js` and handed to `mc/net.js` through `Game` at startup, so the version
cannot drift again. `BRAND.repo` still derives its repository half from the product name — the
rename-is-one-edit property survives — but the OWNER is written out, because a GitHub account is not
a product name and deriving it is what produced a plausible URL nobody could visit. `net.js` keeps a
versionless fallback for the harness scripts, which require it with no Electron and no brand.
Nine assertions in `phase3check` cover it, including the wiring, not just the pieces.

**Repo:** https://github.com/emirudev128-sys/KestrelClient — pushed, one commit, `main`.
**Licence:** all rights reserved, source-available for verification only. NOT open source.
Do not reintroduce MIT. The history was deliberately squashed so no MIT commit exists.

**Azure client id** lives in `auth.config.json`, which is **gitignored**, and it is not written down
anywhere else — not here, not in a commit message, not in a PR. `auth.config.example.json` ships
with a placeholder. Read the live value with
`node -e "console.log(require('./auth.config.json').clientId)"` rather than keeping a copy of it in
a document.

**Why that sentence changed.** The previous version of this file stated the id inline — inside the
very paragraph explaining that it is kept out of git — and this repository is public, so it was
readable by anyone from commit `a46edfd` onward. `.gitignore` covered the filename and everybody
took that for the whole story. The app has since been re-registered and the old id is dead, but the
lesson stands: a filename check proves a filename is absent, and only searching for the VALUE
proves the value is. `tools/packcheck.mjs` already holds that standard for the packaged build.

Sign-in reaches Microsoft and Xbox Live but the final Minecraft exchange will 403 until Mojang
approves the app at https://aka.ms/mce-reviewappid — the app was re-registered, so that approval
has to be requested again, with the repo URL rather than `localhost`.

**Never commit:** the real `auth.config.json`, anything under `%APPDATA%/Kestrel`, the user's
Minecraft username (fixture data says `Player`), or local paths containing the Windows username.
`shots/`, `ref/`, `variants/` and `kestrel.html` are gitignored; `docs/screenshots/` is not, and
holds the three README images.

**Demo data:** nine instances named by version and mod setup (`1.21.4 Fabric`, `1.20.1 Fabric copy`,
`1.8.9 Forge`, `All the Mods 10`, …). They are deliberately repetitive — the `1.20.1` pair is
identical but for the name. Do not make each one demonstrate a different feature; that failure mode
has been caught five times and is written up in `docs/rubric.md`.

## Also true right now

- `dist/` holds a 0.5.0 installer built BEFORE the modpack work, the HUD wiring and every fix since.
  Rebuild with `npm run dist && npm run packcheck` before giving it to anyone. **`packcheck` fails 2
  of 47 because of this** — `mc/deps.js` and `mc/hud.js` are not in that asar, because the installer
  was built at 20:42 and those files landed at 00:05 and 21:13. Not a packaging bug; a stale build.
- The Azure app was re-registered. The new client id is in `auth.config.json` (gitignored) and
  **nowhere else** — the user asked explicitly that it never be pushed. The old one is dead but
  still readable in history at `a46edfd`; `RESUME.md` no longer names any id.
- Mojang approval has to be requested again for the new app, with the repo URL rather than
  `localhost`.
- The instance detail screen (`#screen-instance`) shows its identity and launches correctly now,
  but its mod list, session history and sizes are still the prototype fixture describing some other
  instance. A screen that shows wrong data confidently.

## Sensible next steps

1. **Press Right Shift in a world and look at it.** The menu is written, compiled and its contract is
   proved; its appearance and the feel of the magnet are not. Build the jar, copy it into an
   instance's `minecraft/mods/`, launch, load a world. Everything after this is guesswork until then.
   (The previous version of this list said "persist the HUD screen's layout" — that was already done;
   `saveHud()` in `ui/scripts/app.js` has been writing it for some time. Do not redo it.)
2. **The other nine elements in the mod.** `HudElements.of()` is the single place: return runs for
   `ping`, `cps`, `potion`, `keys` and the five armour slots, and delete the name from the
   placeholder path. The menu rows stop saying `not drawn yet` on their own, because that string is
   driven by `HudElements.drawn()`.
3. **CurseForge packs** — `.mrpack` is done; their `.zip` export is a different manifest, needs an
   API key, and has a redistribution story worth reading before it is written.
4. **Code signing** — SmartScreen warns on every first run until the binary is signed by a
   certificate with reputation behind it. That is a purchase, not a config change.

## How to work on this

Small change: build it, run `node tools/clicktest.mjs`, fix, re-test. ~15-20 min.
Anything touching the design system, a new component, or multiple window sizes: 40 min, say so up
front. Do not attach a judging pass unless asked. Always run `bash tools/scan.sh` after touching
`main.js`, `preload.js` or anything in `mc/`.
