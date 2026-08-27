# The HUD backlog — what is done, and what is left

Asked for on 27 August 2026. **Most of it is built.** This file now records what
shipped, what was deliberately not built and why, and what is genuinely left.

---

## Done

### Elements — twenty of them, all drawn

| | |
|---|---|
| First eleven | fps, cps, ping, keystrokes, coords, potion effects, and the five armour slots |
| Second nine | day counter, clock, playtime, memory, combo counter, totem counter, TNT countdown, reach display, PvP info |

Each has its own options, declared in `mc/hud.js` and carried in the document.
Each exists on all three sides: the launcher's HUD screen arranges it, the
Tweaks list switches it, the mod draws it.

### Features — the second noun

`sprint`, `sneak`, `zoom`, `snaplook`, `hitbox`, `chunks`. A feature is **on or
off, a key, and its own options** — no anchor, no colour, no scale. It reuses the
element option machinery and the same top-level `optSpec`, so the menu builds a
feature's rows exactly the way it builds an element's.

- **Behaviours** (`Behaviours.java`): toggle sprint, toggle sneak, zoom, snap
  look. Each undoes itself when switched off, on key release, and when the world
  goes away.
- **World overlays** (`Overlays.java`): hitboxes and chunk borders, through
  Fabric's `WorldRenderEvents`.

---

## NOT built, and why — read this before starting any of them

### The four that need a MIXIN

A mixin is a build-time weave into somebody else's compiled class. It needs its
own config and refmap, it fails in ways that are hard to read, and it breaks
differently on every Minecraft version. **This mod has none**, and `hudcheck`
asserts that — deliberately, so adding the first one is a decision somebody
makes on purpose rather than drifts into.

| | what it would take |
|---|---|
| **Freelook** | The camera's yaw and pitch have to come apart from the player's. `Camera` computes both from the entity; nothing outside it can intervene. |
| **Hit colours** | The damage flash is a hard-coded tint inside the entity renderer. |
| **Scoreboard** | Vanilla draws the sidebar itself. Our own version can read the scores and draw them anywhere — but vanilla's still draws, so you get two. Cancelling vanilla's is the mixin. |
| **Inventory sorter** | Not strictly a mixin, but it needs to send slot-click packets in the right order and a button in a screen somebody else owns. Fiddly, and a wrong packet order desyncs an inventory. |

If mixins are ever added, do it once and deliberately: add the config, add ONE
mixin, launch the game, and only then write the second.

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
