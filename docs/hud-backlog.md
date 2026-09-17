# The HUD backlog — what is done, and what is left

Asked for on 27 August 2026. **Most of it is built.** This file now records what
shipped, what was deliberately not built and why, and what is genuinely left.

---

## Done

### Elements — nineteen of them, all drawn

| | |
|---|---|
| First eleven | fps, cps, ping, keystrokes, coords, potion effects, and the five armour slots |
| Second eight | day counter, clock, playtime, memory, combo counter, totem counter, reach display, PvP info |

The TNT countdown was the ninth. It moved into the world as a feature — a plate
in a corner cannot say which of four primed blocks is the one about to go.

Each has its own options, declared in `mc/hud.js` and carried in the document.
Each exists on all three sides: the launcher's HUD screen arranges it, the
Tweaks list switches it, the mod draws it.

### Features — the second noun

`sprint`, `sneak`, `zoom`, `snaplook`, `freelook`, `hitbox`, `chunks`, `tnt`. A feature is
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
- **World overlays** (`Overlays.java`): hitboxes and chunk borders — each in a
  colour picked in the menu, chunk borders optionally with see-through walls —
  and the TNT timer over every primed TNT, through Fabric's `WorldRenderEvents`.
- **Zoom goes through one access widener**, not a mixin: it opens
  `GameRenderer.zoom`, the projection scale. The field of view option could not
  do it — it rejects anything under 30 degrees and resets to its default.

---

## NOT built, and why — read this before starting any of them

### The three that need a MIXIN

A mixin is a build-time weave into somebody else's compiled class. It fails in
ways that are hard to read, and it breaks differently on every Minecraft version.
**This mod has exactly two, both freelook's** — added once the game could be
tested, after the targets were checked against the game's own bytecode — and
`hudcheck` fails on a third, so the next one is a decision somebody makes on
purpose rather than drifts into.

| | what it would take |
|---|---|
| **Hit colours** | The damage flash is a hard-coded tint inside the entity renderer. |
| **Scoreboard** | Vanilla draws the sidebar itself. Our own version can read the scores and draw them anywhere — but vanilla's still draws, so you get two. Cancelling vanilla's is the mixin. |
| **Inventory sorter** | Not strictly a mixin, but it needs to send slot-click packets in the right order and a button in a screen somebody else owns. Fiddly, and a wrong packet order desyncs an inventory. |

Adding one: put it in the existing config, keep it inert unless its feature is
on, prefer a value modification or a cancellable inject to a redirect, check the
target in the intermediary jar, and launch the game before writing the next.

### The two that are their own piece of work

- **Waypoints** — a beacon in the world, a marker on the HUD edge, and storage
  per world. The storage is the hard part: a waypoint belongs to a world, and
  "which world is this" is a different question on a server than in singleplayer.
- **Minimap** — the largest single item on the original list by a distance.
  Chunk sampling, a texture, a cache, per-world storage, and it is the one thing
  here that can itself cost frames. Worth building only when somebody wants to
  spend a session on it alone.

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
