# Builder brief — Kestrel launcher shell

("Kestrel" is a working name. It appears in the titlebar and nowhere else, so it is cheap to change.)

## What this is

A desktop launcher for Minecraft, for players who left Lunar Client over its privacy policy and
want what it did well: open it, pick a version, play. Shell only — no mods wired up yet, but the
shell must have a place for everything in docs/launcher-ia.md so nothing gets bolted on later.

The audience is PvP and performance players. They are on Windows, on a mouse, often on a second
monitor, and they open this app to leave it. Nothing here is browsed for pleasure. No store, no
cosmetics, no premium tier, no upsell — that absence is the product.

## The bar

**Linear's desktop app.** Reference screenshots, already captured at 2x:

    ref/linear-app-01.png   sidebar + issue view + right panel, large
    ref/linear-home.png     full app chrome in context
    ref/linear-plan.png     ref/linear-build.png   further app surfaces

Look at them. Do not work from a description of them. Real values pulled from the live DOM:
ground `#08090A`, ink `#F7F8F8`, Inter Variable + Berkeley Mono, radii clustered 2-8px, type
steps at 10/11/12/13/14/15/16/17/18/20/24px.

We are beating it, not cloning it. Copying Linear's indigo `#5e6ad2` or its exact greys is a loss,
not a win — the critic is told to treat a clone as a failure.

**Structural references only** (what a launcher contains, never how it should look):
ref/modrinth-app.png, ref/lunar-home.png, ref/prism.png, and docs/launcher-ia.md.

## Read before building

- **docs/rubric.md** — this is what the critic scores against. Sections A (hard fails),
  B (craft bar), C (must not read as Claude), D (must not read as a web page in a window), E (copy).
- **docs/launcher-ia.md** — the screen and control inventory, from launcher source code.

## Hard constraints

Banned hex families, no exceptions:

    Claude clay     #D97757 #C96442 #C6613F #C46849 #CC785C  and any terracotta/coral primary
    AI purple       #6366F1 #4f46e5 #7c3aed #8B5CF6 #A855F7 #A78BFA
    Linear indigo   #5e6ad2                                   (cloning the bar)
    Modrinth green  #00D845 #1bd96a
    Cream grounds   #FAF9F5 #F9F9F7 #F5F4ED #F0EEE6

Banned outright: gradients of any kind; emoji; drop shadows on cards; a single uniform radius;
a centered max-width content column inside the window; icon-in-rounded-square chips; coloured
left-border stripes; stat-tile rows; pill eyebrows above headings.

Required:

- **Cool or truly neutral dark ground.** Not warm charcoal. Our neutrals must not carry a
  yellow-green hue — that is Claude's whole surface language.
- **A surface ladder** of real lightness steps, plus **two** border strengths for two jobs.
  Elevation comes from tone, not shadow.
- **A five-step text ramp** — ink / body / metadata / disabled / lowest — each with a distinct role.
- **A radius ladder** tied to element scale. Nested radius = outer minus padding.
- **One accent**, used as punctuation and for one primary action. Not as a fill across the UI.
  A second accent must be more than 20deg OKLCH hue away or it is one colour wearing two names.
- **Type with a decision in it.** Not Inter or Geist at 400/600. Tracking scales with size:
  negative at display sizes, positive at 11-12px labels. Tabular numerals wherever digits align.
  Google Fonts only (it is the one host that loads), with a real fallback stack.
- **Custom icons**, drawn as inline SVG at a consistent stroke, optically adjusted per glyph.
  No lucide/heroicons defaults, and never Sparkles/Zap/Rocket/Shield.
- **Pointer-sized rows**, 28-36px. 44px targets are a touch guideline and cost us half the list.
- **One oversized moment per view.** Squint at 25%: if nothing is obviously most important, fail.
- **prefers-reduced-motion** honoured. Motion durations tied to travel distance, not one global 300ms.

## Optical detail the critic will look for

The Play control has a triangle in it. Centre it by **centroid, not bounding box**, or it reads
left-heavy. Circles need ~112.8% of an equal-width square to carry the same weight. Icons align
to x-height, not to their box.

## Copy

Sentence case. Domain verbs. "Install Fabric 0.16.9", never "Effortlessly manage your modpacks".
Banned: seamless, effortless, empower, harness, unlock, elevate, supercharge, all-in-one.
Errors say what broke and what to do about it. Buttons say exactly what will happen.

## Output contract

Plain HTML/CSS/JS, no framework, no build step, no npm dependencies — it has to run from
`ui/index.html` over http and later drop into Electron unchanged.

    ui/index.html          one document, screens shown/hidden by the hash router
    ui/styles/tokens.css   the whole design system as custom properties, nothing else
    ui/styles/app.css      components and screens
    ui/scripts/app.js      hash routing and interaction state
    ui/icons/              inline SVG symbols

Screens are addressed by hash: `#play`, `#instances`, `#instance`, `#settings`, `#accounts`,
`#states`. `ui/scripts/app.js` must set `document.documentElement.dataset.screen` from the hash
so screenshots can target one screen at a time.

Populate with real-looking content: real Minecraft version numbers (1.21.4, 1.20.1, 1.8.9),
real loader names and versions (Fabric 0.16.9, NeoForge 21.1.72), plausible playtimes and dates.
Never lorem, never "Acme", never placeholder avatars.

## How to check your own work

    node tools/shootui.mjs <prefix> play instances settings

writes `shots/<prefix>-<screen>.png` at 1280x800 @2x and prints any console errors. Look at your
own screenshot next to ref/linear-app-01.png before you hand it over. If yours looks emptier,
softer, or more rounded than the bar, it is not done.

---

## Product thesis (added after the Lunar research — read docs/lunar.md)

**Lunar removed decisions rather than organising them.** That is why it felt effortless, and it is
the standard every screen here is held to. Before adding a control, ask whether the app could
decide instead.

Concretely, for every round after the first:

- **Auto-detect is the default path; the manual control lives behind Advanced.** Java runtime
  especially — Lunar ships no Java path picker at all in the normal flow, and that single omission
  is most of its reputation. We keep the control (power users need it) but nobody else meets it.
- **One `Advanced` toggle** gates expert rows inside the normal settings list, each marked with a
  badge. Not a separate expert UI, not a second settings tree.
- **The primary action states the full current selection.** The launch control says what will
  start — version, loader, instance — so the user never looks elsewhere to confirm.
- **The launch control is also the status display.** Its states are Play / Install and play /
  Downloading with percentage / Running / Stop / Repair. Not a button plus a separate progress bar.
- **RAM is a slider with a recommendation action and a remaining-memory readout**, not a number
  field. Warn past ~75% of system RAM rather than silently allowing it.
- **Logs are a real destination**, with search, level filter, autoscroll toggle, a copyable session
  header, and a redact toggle for anyone streaming.

**What we do not build, ever:** an ad slot, a store tab, promoted servers, a subscription tier,
cosmetics, or a second identity system layered on the Minecraft account. Every one of those is a
documented Lunar complaint, and their absence is the product.

**Privacy page claims, and no more:** no ad slot, no data-broker sharing, no behavioural
profiling, analytics off by default, source you can read. We win on what we verifiably do not do.
Do not write copy calling Lunar spyware — it is not supportable and it is not needed.

---

## Round 2 correction — how the default screen is composed

Round 1 lost on this, and the instruction that caused it was ours. The brief said "design the
unhappy paths first", and all three builders rendered every unhappy path onto the default view at
once. Three critics independently called it out. Both halves are true and they must be held
together:

**Design every state. Show one.**

- `#play` is **one ordinary moment**: a normal Tuesday. Nothing is broken. At most one thing is
  quietly mid-download. No Java error, no failed files, no mirror retry, no offline toggle, and no
  idle launch-state ladder — all at the same time, on the screen the user sees most.
- Every other state gets its **own route** under `#states`, built to the same standard and
  screenshotted on its own: `#states/empty`, `#states/downloading`, `#states/failed`,
  `#states/no-java`, `#states/offline`, `#states/running`, `#states/crashed`.
- An instance list is **a person's library**, not a demo matrix. Real libraries are lopsided: most
  rows are boring and identical, two or three get played constantly, several were installed once
  and abandoned. Exactly one row of each possible status is a fixture, and it reads as one.

## Additional hard constraints from round 1

- **The tracked all-caps micro-label may appear in at most two roles in the whole app.** Not as the
  default treatment for every label. Pick which two roles earn it and justify them in your report.
- **Only data a launcher actually holds.** No median FPS, no 1% lows, no ping columns, no mirror
  regions, no "SLOT 01". If you would have to invent the plumbing that produces a number, cut it.
- **No fact twice in one view.** If the version is in the header, it is not also in the spec row
  and the status bar. Round 1 printed the same four facts twice within 60px.
- **Custom icons, and this time actually.** Two of three round-1 variants shipped stock Lucide and
  the critics named the glyphs. Draw them, at sizes that differ by role, optically adjusted.
- **Not teal.** Two of three variants independently landed on Tailwind teal — the reflex swatch
  once purple is banned. Pick an accent you can give a reason for, and put the reason in your
  report. Still banned: clay/coral, indigo/violet, Linear's #5e6ad2, Modrinth green.
- **Write the tabular-numeral rule down, then follow it exactly.** Round 1 set "1.2 GB to download"
  in mono and "Update available" beside it in proportional, in the same column, ~30 times.
- **A chart has an axis and a scale, or it is not a chart.** No micro-bars of near-identical length
  used to fill panel height.
- **No filled-plus-outlined button pair sitting adjacent.** Secondary actions are not outlined
  twins of the primary.
- **Semantically different panels get different shapes.** Three unrelated panels stacked as the
  same label-left/value-right row at the same pitch is a template, not a design.

---

## Required flows (added by the user, round 3 onward)

These are not optional and the shell must show a real place for each. Build them as designed
screens, not stubs.

### 1. Create a profile / instance

A `New instance` flow reachable from the rail and from the empty state. Fields, in order:
name, icon, **Minecraft version** (with Release / Snapshot / Old beta / Old alpha filters),
**mod loader as a button row** — Vanilla, Fabric, Forge, NeoForge, Quilt, in that order, which is
what both GDLauncher and CurseForge use — then loader version, then group. Latest stable loader
version preselected. Nothing else on the first screen; everything else is editable afterwards.

Per the product thesis: **no Java choice in this flow.** The launcher picks the runtime for the
version. That decision is exactly the kind Lunar removed and it is most of why it felt effortless.

### 2. Import mods into a profile — has to be genuinely easy

This is the flow that has to feel better than every competitor, so it gets real design attention:

- **Drag and drop a .jar anywhere onto the instance** and it installs, with a drop target that
  appears on drag-over rather than sitting there permanently. Dropping a jar for the wrong loader
  or MC version must say so immediately and offer the fix, not fail silently after the fact.
- **A Mods tab per instance**: enable/disable toggles per mod, version, loader, file size, update
  available, and the ability to select several and act on them at once. Open mods folder.
- **Add from disk** and **add from a URL** as explicit buttons, not hidden in a menu.
- **Import a whole profile**: `.mrpack`, CurseForge `.zip`, and from another launcher on the
  machine (Lunar itself supports importing from Modrinth, CurseForge, Prism, MultiMC, GDLauncher,
  ATLauncher — matching that list is a real switching argument for us).
- **Duplicate an instance** so people can fork a working setup before breaking it.

Mod *browsing* from Modrinth/CurseForge is a later phase — but the shell must already have the
place it lives, so it is not bolted on. Design the tab with a browse entry point that is currently
inert rather than absent.

### 3. Server profiles — pending confirmation

Paper is server software, not a client mod loader, so it does not belong in the loader row above.
If local server management is wanted, it is a separate instance *type* with its own detail screen
(console, properties, players, plugins) — which is how GDLauncher Carbon and Prism both model it.
Do not build this until it is confirmed.

---

## Modules — the in-game mods, and where they live

This is the Lunar feature the user actually misses: the built-in client modules. Minimap, compass,
FPS, CPS, keystrokes, armor status, coordinates, potion effects, zoom, toggle-sprint. Lunar
advertises "60+ modifications" and this is most of what people mean when they say Lunar had
everything. It needs a real home in the shell, not a stub.

### Naming — keep the two unambiguous

Two different things would both be called "mods" by someone arriving from Lunar:

- **Mods** = `.jar` files you install into an instance. Fabric, Forge, NeoForge, Quilt.
  Already built at `#mods`.
- **Modules** = built into Kestrel. Nothing to install, nothing to update, no loader to match.
  New, at `#modules`.

The Modules screen should say so in one line rather than making people infer it. Someone coming
from Lunar will look for "Mods" and find both — the distinction has to be legible on arrival.

### Scope model

Global defaults, per-instance override — the same model as every other setting in the app, so it
is learned once. A module configured on the Play screen applies everywhere; an instance can
override it. Do not invent a second scope model for this one feature.

### `#modules` — the list

- Rail item **Modules**, between Instances and Servers.
- Category sidebar. HUD, Gameplay, Visual, Chat, and a clearly-labelled group for the
  server-specific ones so nobody wonders why an option does nothing on their server.
- Search across module names *and their settings* — the thing people actually fail at is finding
  which module owns a setting.
- Per-row: enable toggle, name, one line of what it does, and a marker when its settings have been
  changed from the default. That last one is what makes a long list navigable.
- Selecting a row opens its settings beside the list. Do not use a modal — a modal makes comparing
  two modules impossible, which is exactly what people do here.

### Per-module settings

Most HUD modules share a spine: enabled, scale, text style (shadow / outline / plain), background
and its opacity, colour, and a "show when" condition. Build that spine once as a component and let
each module add only its own options — a minimap adds zoom, shape, rotation, waypoints, entity
dots; a coordinates readout adds which axes and whether to show the biome.

Because the spine repeats, **the module-specific options must be visually separated from it**, or
every module's settings pane looks identical and the screen becomes the uniform-grey-texture
failure that rubric G1 already caught once.

### `#modules-hud` — the layout editor

The most interesting screen in the app and the one worth the most care. A preview of the game
screen with the enabled HUD elements placed on it, draggable.

- Drag to move, with snapping to edges, centre lines, and to other elements — with the alignment
  guide visible only while it is snapping.
- Scale handle per element. Right-click for that element's settings and a reset.
- Elements that would overlap must say so rather than silently stacking.
- A resolution selector, because a layout tuned at 1920x1080 breaks on a different aspect, and
  every competitor gets this wrong.
- Reset-this-element and reset-everything, both undoable.

### Presets

Save a HUD layout and the module configuration together as a named preset, switch between them,
export and import. This is what people ask for and no launcher does well: one layout for PvP, one
for building, one for recording.

### On flexibility generally

The user wants this **somewhat flexible, not infinitely configurable**. The line:

- Per-instance overrides for anything that reasonably differs per instance. Yes.
- An Advanced tier inside the normal settings list, gated by one toggle, holding JVM args, Java
  path, launch hooks, environment variables. Yes — this already exists in the brief.
- A raw config file, a CLI, a plugin API, an about:config escape hatch. **No.** Not now.

Auto-detect stays the default path everywhere. The flexibility is there when someone goes looking
for it; it is never the thing a new user meets first.

---

## The launcher is neutral about what it runs

A general-purpose launcher loads the jar you point it at. Prism, MultiMC, ATLauncher and HMCL all
work this way; it is the norm, not the exception. Kestrel does the same.

**What that means concretely, and all of it is UI-visible:**

- **No allowlist and no blocklist.** Any `.jar` in the mods folder loads. The launcher does not
  maintain a list of approved mods, does not check names against one, and does not refuse to run
  something because of what it is called or what it contains.
- **Nothing about your mods is sent anywhere.** No server-facing mod-disclosure API. This is a
  concrete difference from Lunar: their Apollo plugin includes an InstalledMods API that lets a
  server query which Lunar mods a player has. We have no equivalent because we have no
  server-facing surface at all.
- **No client-side anticheat**, no process enumeration, no scanning of anything outside the
  instance folder. This is the same category of clause that caused Lunar's privacy problem in the
  first place — see docs/lunar.md.
- **The wrong-loader warning is advice, not enforcement.** When a jar does not match the instance's
  loader or version, say so and offer the fix — and always leave "load it anyway" available. The
  existing copy on `#mods` already does this correctly; keep it that way. Never silently refuse.
- **"Kestrel leaves anything else in there alone"** — the line already in the mods footer is the
  policy in one sentence. It stays.

**Where the line actually is.** Being neutral about what the user runs is not the same as building
features whose only purpose is defeating a server's anticheat — process hiding, signature spoofing,
injection helpers, detection-evasion tooling. That is a different product and it is not what is
being asked for here. Kestrel runs what you give it and stays out of the way; it does not go on to
help hide it from someone else's server.

**One factual caveat that belongs in the UI, not in marketing.** Not reporting from the launcher
does not make anything undetectable — servers run their own anticheat and will still detect and ban
whatever they detect and ban. The Privacy page should say what Kestrel does not send. It should not
imply anything about what a server can or cannot see, because that is not ours to promise.

---

## Theming — dark, light, and configurable palettes

Confirmed by the user: both themes, plus user-configurable palettes. This is a real architectural
requirement, not a coat of paint, and it changes how tokens must be written.

### The rule that makes this possible

**Every colour in the app comes from a semantic token. No component ever names a hex.**
Components ask for `--s-pane`, `--ink`, `--line-region`, `--go`. They never ask for `#12151B`.
A palette is then nothing but a set of values for those tokens, and swapping palettes cannot break
a component because no component knows what a palette is.

This is mostly already true in `variants/c3/styles/tokens.css` — the job is to enforce it with an
audit rather than assume it. Grep for hex literals outside tokens.css; every hit is a bug.

### Light is not an inversion

The dark palette was tuned around a cold near-black ground with a warm 9.5:1 accent. Flipping the
lightness values produces a light theme that is technically legible and visually dead. Light needs
its own decisions:

- The surface ladder inverts direction but not spacing — on light, the *raised* surface is usually
  lighter and the ground is the mid value, which is the opposite relationship.
- Hairlines have to get *stronger* relative to the ground; a 1px line that reads correctly on
  near-black disappears on near-white.
- The gold accent at 9.5:1 on dark drops to roughly 1.8:1 on a light ground and becomes unusable
  for text — the accent needs a darker variant for light mode, and the token that carries text on
  the accent flips from near-black to near-white.
- Shadows do real work on light and almost none on dark. This is the one place a light theme is
  allowed to reach for elevation the dark theme does not use.

Judge the light theme as its own piece, against a light-mode reference. Do not assume the dark
verdict transfers.

### Configurable palettes — curated, with an escape hatch

A free colour picker on every token produces ugly, illegible results and a support burden. The
model instead:

- **Ship four or five curated palettes**, each designed and judged as a whole: a name, a ground
  family, and an accent. Both a light and a dark variant per palette.
- **Let the user override the accent** from a constrained set, or a picker that *validates* —
  showing the measured contrast against the pane and refusing, or warning, below the threshold the
  accent needs to do its jobs (it carries a 56px label, a 6px dot and a 2px rail; that range is
  exactly why a low-contrast accent breaks).
- **Show what changed.** A palette the user has modified says so, and offers reset — the
  "modified from default" marker already specced for the Modules list, reused here.
- Export and import a palette as a small file, so people can share them. This is the cheap version
  of a theming system and it is most of the value.

### What this does not become

No arbitrary CSS injection, no user stylesheets, no plugin-supplied themes. Those turn every future
UI change into someone's broken theme, and the app cannot be judged against a bar if the bar moves
per install.

### Consequence for the gauntlet

The Play screen is currently judged in dark. Once light ships, the blind comparison runs on both,
and a piece is not won until it wins in both themes. Add light-mode reference captures of the bar.

---

## The product name is a value, not a string

Confirmed: "Kestrel" stays for now, but it has to be trivially changeable — there is a name
collision with ASP.NET's web server and that may force a rename later. Renaming must be one edit,
not a find-and-replace across the UI.

**Single source of truth**, in `scripts/brand.js`:

    export const BRAND = { name: 'Kestrel', version: '0.4.2', folder: '.kestrel' };

Rules:

- **No component markup contains the product name.** Anywhere it appears as a bare label — the
  titlebar, the about screen — the element carries `data-brand="name"` and is filled at render.
- **Prose that mentions the product uses a placeholder.** The strings already written into the UI
  bake the name in: *"Kestrel found Temurin 8u442 at..."*, *"Hide Kestrel until it exits"*,
  *"Kestrel leaves anything else in there alone"*. Those move into a string table as
  `"{name} leaves anything else in there alone"` and are interpolated once.
- **The instance folder path is derived too** — `...\.kestrel\instances\` is shown in the UI and
  must come from `BRAND.folder`, not a literal.
- **Verify by substitution.** Set the name to something obviously different, rebuild the
  screenshots, and confirm nothing anywhere still says Kestrel. That check is the deliverable, not
  the constant itself.

Keep it a plain object, not a settings screen. This is build-time configurability so a rename is
cheap, not a user-facing option.

---

## Modules — corrections and detail from the Lunar research

Source of truth: `lunarclient.dev/apollo/developers/mods/<modid>` — Lunar's own server-API docs,
101 mod pages, each with real option keys, types, defaults and slider ranges. Build against those,
not against paraphrase. (Their marketing says "65+" on one page and "75+" on another; Apollo lists
101 ids.)

### Two corrections to the spec above

1. **There is no opacity slider. Alpha lives in the colour picker.** Backgrounds default to
   `#6F000000` (~44% black), borders to `#9F000000`. The picker needs an alpha channel and a
   **chroma (animated rainbow) mode**, and the settings pane must not carry a separate opacity
   control. My earlier spec said "background and its opacity" — wrong.
2. **Sub-elements are first-class.** `MOVE_ARMOR_INDIVIDUALLY` and `MOVE_CHILDREN_INDIVIDUALLY`
   let one module decompose into several independently-positioned pieces. **Position belongs to an
   element, not to a module.** Get this into the data model now; retrofitting it is painful.

### The shared HUD spine — build once, verbatim

Recurs across nearly every HUD module: `ENABLED` · `SCALE` (0.25-5.0, default 1.0) ·
`TEXT_SHADOW` · `BACKGROUND` + `BACKGROUND_COLOR` · `BORDER` + `BORDER_THICKNESS` (0.5-3.0) +
`BORDER_COLOR` · `TEXT_COLOR` · `SHOW_WHILE_TYPING` · `BRACKETS` + `BRACKET_COLOR` ·
`STATIC_BACKGROUND_WIDTH`/`HEIGHT` (pins a fixed box so the HUD does not jitter as digits change) ·
`REVERSE_ORDER`.

Then per module only its own options. Armor Status adds a six-stop durability colour ramp; Minimap
adds zoom, rotate-with-player, marker sizes, waypoint distance; Ping adds spike thresholds and a
four-stop colour ramp; Keystrokes adds pressed/unpressed colour pairs and a fade delay.

### What Lunar does NOT have — our openings

All verified absent, and all cheap:

- **No categories at all.** Lunar's mod list is flat. Every article describing "HUD / PvP /
  Performance" tabs is fabricating. Our category sidebar is a genuine improvement, not a copy.
- **No alignment guides, no grid, no numeric position inspector, no reset-all.** Reset is
  per-element only.
- **No preset export and no share codes.** Sharing a Lunar layout means zipping
  `%appdata%/.minecraft/config/lunar/` and hand-editing `profile_manager.json`. A cottage industry
  of "share your profile" threads exists purely because of this. **Exportable presets with a share
  code is the single clearest opening in the whole feature.**
- **The menu inherits Minecraft's GUI scale and gets cut off.** This is the top recurring complaint,
  across years: "only 2 and a half rows of mods", settings unreachable. The fix is a hidden toggle
  called "Use Minecraft GUI Scale". Ours is a launcher window — it must scale independently and be
  resizable, and that alone answers the loudest complaint about the feature.
- **Overlapping HUD elements with no resolution.** Our overlap warning is a real fix.

### The HUD editor — how Lunar actually does it

**It is not a separate mode.** The HUD is live and directly manipulable while the mods menu is
open; you drag the menu panel aside and move elements underneath. Only enabled modules appear as
drag targets. Confirmed interactions: mod snapping, CTRL+click multi-select, a corner scaling box,
CTRL+Z / CTRL+Y undo-redo, arrow keys for precise movement, right-click to reset an element's
relative position, hold right-click ~1s to drag it out of the snap bounding box. A **Movement
Helper** panel in the bottom-left lists the shortcuts. It saves automatically — no apply button.

**Positions are relative and anchored, not absolute pixels**, so a layout survives a resolution
change. Keep that.

**Where to deviate:** right-click is overloaded for both "reset" and "escape snapping", which is
fiddly. Split them.

### Steal from OneConfig

The open-source unified mod-config layer, and the best-documented prior art:

- **Pages -> Categories -> Subcategories**, with each option sized single- or double-width. A
  simple, effective layout primitive.
- **Dependency declarations**: irrelevant options **grey out rather than disappear**, so the shape
  of the panel stays stable and people can see why something is unavailable.
- **Example mode**: while dragging, HUD elements render static representative values instead of
  live ones, so numbers do not churn under the cursor. Small, excellent, copy it.

---

## Instance cards — CurseForge's structure, our style

The user supplied two CurseForge screenshots, resting and hovered. This is the structure to take,
and the styling explicitly NOT to take.

### What the reference does

**Resting:** a portrait card on a dark surface. Cover art fills the top, roughly square. A small
dark translucent pill sits on the art's **top-right corner** carrying a mark and a version string
(`5.10.16`). Under the art, a title on one line, **truncated with an ellipsis** when it does not
fit ("DeceasedCraft - Urban ..."). Under that, a muted secondary line ("By TqLxQuanZ").

**Hovered:** the art **dims**, and a control row appears at the foot of the card — a small square
secondary button on the left (a swap glyph, meaning change version), a wide filled **Play** button
taking most of the width, and a **chevron** on the right opening the rest of the actions. The card
grows slightly taller to make room; the title and author stay put.

### What we take, and what we change

Take: the shape, the art-first hierarchy, the corner badge, the truncating title, the
reveal-on-hover control row, and the split Play + chevron.

Do not take: the orange (`#F16436`-ish) — our primary is the gold already in `--go`. Do not take
the soft 12px-ish radii — we have a radius ladder and the card belongs on it. Do not take the
drop shadow; our elevation is tonal, and a grid of shadowed cards is exactly what the standard
rules out. Do not take the pill's blur.

### Our second line is not "By"

Most instances here are the user's own forks, and they have no author. Inventing one would be the
same failure section F names. So the secondary line carries what actually identifies the instance:
**loader and version** for an instance the user made, **the author** only for an imported pack that
genuinely has one. Same slot, honest content.

### The badge

CurseForge badges the *modpack* version. Ours badges the **Minecraft version** — that is what a
player picks a card by — with the loader as a mark beside it. Keep the top-right corner placement.

### Where it goes

1. **`#instances`** — the card grid becomes the default view. Keep the table we already built as a
   **list view behind a toggle**: the table is better for comparing playtime and loader across 23
   instances, and it was judged good. A grid is right when identity is visual, a table when you are
   comparing values. Ship both, remember the choice.
2. **`#play`, under "Recent"** — the same card, in a single row, replacing the recent table rows.
   The row scrolls horizontally if it overflows rather than wrapping.

The card is one component used in both places. Do not build it twice — that is the exact failure
the coherence critic named when the instance table had two encodings.

### Rules the card must not break

- The hover control row must not shift the layout of neighbouring cards. Reserve the space or
  overlay it.
- The Play button on a card and the Play button on the Play screen are the same product action, so
  they must read as the same treatment at two scales, not as two different buttons.
- Keyboard: a card must be focusable and its actions reachable without a mouse. Hover-only controls
  must also appear on focus.
- The art is content, not state. It must not be the only thing distinguishing two instances, since
  most of this library is forks that share one image.
