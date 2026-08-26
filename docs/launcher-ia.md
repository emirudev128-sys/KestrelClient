# Launcher information architecture — what the shell must contain

Sourced from MultiMC's Qt source, SKlauncher's shipped en_US language file, and FTB-App's Vue
source, plus Modrinth App and Prism. Labels below are verbatim from those products where quoted.

## Three nav archetypes

| | MultiMC / Prism | SKlauncher 3.2 | FTB App / Modrinth |
|---|---|---|---|
| Nav | No nav. One window + modal dialogs | Sidebar + tabbed right pane | Icon rail router (60px) |
| Default screen | Instance grid | News tab | Dashboard: recents + featured |
| Instance list | Central grouped icon grid | The sidebar itself | Card grid under `Library` |
| Version + loader | Patch-list editor page | One `Version` dropdown, Vanilla/Modded categories | Slide-over + Modloader selector |
| Play | Right vertical toolbar `Launch` | Per-row `Play` in sidebar | Instance header button |
| Accounts | Top-toolbar menu → dialog | Sidebar `Switch User` | Bottom-of-rail popover |
| Logs | `Minecraft Log` page + console | `Launcher Log` / `Game Output` tabs | Running-instance route |

**Our call:** icon rail, because it is the only one that survives a resizable desktop window
without dead space, and it is what Lunar users already have in their fingers. But the rail must
carry labels, not icon-only-with-tooltips — FTB's own docs concede an expandable version is wanted.

## Settings scope model

FTB's is the right one and it is explicit in their source: a global **Instance Defaults** page
seeds new instances, and each instance then overrides. MultiMC does the same with per-group
checkboxes. SKlauncher has no override system at all — every installation carries a full config,
which means changing your Java path means editing every profile. Avoid that.

## Minimum surface area for a shell with no mods wired up

**Rail:** Play · Instances · Servers · Accounts · Settings. Account block pinned at the bottom.
Running-instance indicator. No shop link, no merch, no premium badge — that is the whole point.

**Play** — the default screen. Last-played instance with its version and loader, a primary Play
control, and the launch state machine visible: `Idle → Preparing → Downloading → Installing →
Launching → Playing`, plus `Play offline` and a `Kill` state while running.

**Instances** — a list, not a card grid. Per row: name, Minecraft version, loader + loader version,
last played, playtime, and a per-row play affordance. Grouping, search, sort by last-played/name.

**Instance detail** — Overview · Versions · Settings · Worlds · Screenshots · Logs.
Versions is where Minecraft version and mod loader are chosen together, categorised
Vanilla / Modded and typed Release / Snapshot / Old beta / Old alpha.

**Accounts** — Microsoft sign-in, offline profile, account list with the active one marked, add
and remove. One identity system, not two.

**Settings** — Launcher (theme, language, close-behaviour, update channel) · Instance defaults
(RAM, resolution, Java path, JVM args, launcher visibility) · Java (detected runtimes, browse,
test) · Downloads (concurrency, mirror) · Storage (instance location, folders) · Privacy ·
About. Privacy gets a real page with plain language about what leaves the machine — given why
this project exists, it is a feature, not boilerplate.

**Controls that must exist somewhere:** RAM allocation (slider + numeric, min 1024 MB, clamped to
system RAM), resolution (width / height / fullscreen), Java executable path with auto-detect and
test, JVM arguments, game directory, launcher visibility on launch, console/log view, crash report
view with a copyable path.

## Unhappy paths that must be designed, not bolted on

No instances yet · no accounts signed in · download in progress with per-file detail · download
failed and retryable · Java not found · version manifest unreachable / offline · instance already
running · game crashed with a report to open. Per the rubric, these are where a launcher lives.

---

## Addendum — GDLauncher Carbon and CurseForge (read from Carbon's source + string catalog)

Two more archetypes, and several controls worth stealing outright.

**Carbon has no sidebar at all** — 60px top bar (logo/back, centered search, Settings, News, accounts)
plus a right-hand **ad column** that shrinks the content region to `calc(100vw - adWidth)`. CurseForge
is a left icon rail where Minecraft is one game among many, with a gear pinned bottom-left.
Both dedicate persistent chrome to monetisation. We have none to place, which is worth an explicit
design beat rather than just an absence.

### Controls worth taking

- **Java path tagging.** Carbon tags every detected runtime `[LOCAL]` (auto-detected),
  `[MANAGED]` (downloaded by the launcher), `[CUSTOM]` (user-added). Three words that remove all
  the ambiguity from the single most confusing setting in any launcher. Take this.
- **Java profiles** mapping Java versions to Minecraft versions, so 1.8.9 and 1.21.4 each get the
  right runtime without the user thinking about it.
- **Explicit override switches.** Every per-instance block is gated by a switch whose help text
  says what it overrides — "Overrides the global-defined game resolution". The global/instance
  relationship is stated in the UI, not left to be inferred. Plus a genuinely thoughtful checkbox:
  *"Prepend global Java arguments before instance extra Java arguments"*.
- **RAM slider warns past ~75-80% of system RAM** rather than silently allowing it.
- **Launcher action on game launch**: None / Minimize / Close / Hide / Quit — one dropdown instead
  of the three separate checkboxes other launchers use.
- **Concurrent downloads 1-20** as a real setting.
- **Loader picker as a button row**, not a dropdown. Both products order it
  Vanilla · Forge · NeoForge · Fabric · Quilt.
- **Tile density 1-5** (Compact / Comfortable / Large) and **Group by** folders / game version /
  modloader. Density as a first-class control fits a launcher with many instances.
- **Logs as a session sidebar + content split**, not a single scrolling dump.

### Deliberately not taking

Ad rails, "TRY FEATURED MODPACK", Discover carousels, monthly themes, premium-only themes,
affiliate server-rental tabs, and second identity systems layered on the Minecraft account.
That list is most of what fills a modern launcher's chrome, and removing it is the product.
