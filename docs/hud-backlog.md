# The HUD backlog — what the client mod is still missing

Asked for on 27 August 2026, to be built **after** the nine already-arranged elements are drawn.
Nothing here is started. This file exists so the list survives the session it was given in, and so
the next person picks it up knowing what it costs rather than reading twenty words and guessing.

---

## The list, as given

> toggle sprint/sneak, day counter, waypoints, minimap, zoom, hit colors, scoreboard, combo counter,
> tnt countdown, player reach display, clock, playtime, freelook, totem counter, snap look, hitbox,
> chunk borders, pvp info, inventory sorter, memory usage

---

## THE THING TO NOTICE FIRST: most of these are not HUD elements

The contract (`config/kestrel-hud.json`, v4) models one kind of thing — an **element**: a plate of
text placed against one of nine anchors, with an offset, a scale, and per-element style. Every one
of the eleven that exist today is that.

**Half of this list is not that.** A toggle-sprint has no anchor. Zoom has a keybind and a field of
view, not a position. Hitbox lines are drawn in the WORLD, in 3D, not on the HUD plane. Trying to
express those as elements would put `anchor` and `plateAlpha` on things that have neither, and the
first person to open the options screen for "Zoom" would find a colour picker.

So the list splits three ways, and the split is the design work:

### 1. Real HUD elements — the contract already fits

These are text on a plate at an anchor. They need `HudElements.of()` to produce runs and nothing
else; the menu, the layout editor, the styling and the round trip all work the moment they exist.

| | needs |
|---|---|
| **Day counter** | `world.getTimeOfDay() / 24000` |
| **Clock** | the system clock; a real-time clock while you play |
| **Playtime** | session elapsed — the launcher already mints a `since` at spawn |
| **Memory usage** | `Runtime.totalMemory() - freeMemory()`; see the caching note below |
| **Combo counter** | consecutive hits landed, with a decay timer |
| **Totem counter** | count of totems in inventory + offhand |
| **TNT countdown** | fuse ticks of the nearest primed TNT — needs a per-entity readout, not one line |
| **Player reach display** | distance to the last player hit; contested, see below |
| **PvP info** | a composite (opponent health, gaps eaten, pots) — really several elements |
| **Scoreboard** | ALREADY NAMED in the Tweaks screen. Reposition/restyle the vanilla sidebar |

### 2. Behaviours — no anchor, no plate, a keybind and a setting

These do not belong in `elements` at all. They need a **second section in the contract**, something
like `"features": { "zoom": { "on": true, "key": "C", "amount": 4 } }` — and a second kind of row in
the menu that has no position and no colour.

| | note |
|---|---|
| **Toggle sprint / sneak** | ALREADY NAMED in the Tweaks screen. Needs a HUD tag too (`[Sprinting]`) |
| **Zoom** | ALREADY NAMED. FOV change on a held key |
| **Freelook** | look around without turning; a camera rotation decoupled from the player's |
| **Snap look** | instant 180 / fixed-angle turn on a key |
| **Inventory sorter** | a button in the inventory screen; not a HUD thing at all |
| **Hit colors** | tints the damage flash; a render tweak with one colour setting |

### 3. World overlays — drawn in 3D, not on the HUD plane

Different render event entirely (world render, not `HudRenderCallback`), different maths, depth
testing, and no anchor. Closer to a rendering feature than to the HUD.

| | note |
|---|---|
| **Hitbox** | vanilla has F3+B; the value here is styling and per-entity filtering |
| **Chunk borders** | vanilla has F3+G; same |
| **Waypoints** | a beacon in the world PLUS a marker on the HUD edge PLUS storage per world |
| **Minimap** | ALREADY NAMED in the Tweaks screen. The biggest single item on this list by far — chunk sampling, a texture, a cache, per-world storage, and it is the one thing here that can itself cost FPS |

---

## What the launcher already names

The Tweaks screen (`#screen-modules`) lists **sixteen** modules. Only **seven** reach the HUD —
`hud.js`'s `ELEMENT_MODULE` covers FPS, CPS, Ping, Keystrokes, Coordinates, Potion effects and Armor
status. The other nine are rows in a list that are wired to nothing:

    Chat   Compass   Crosshair   Level head   Minimap   Nick hider   Scoreboard   Toggle sprint   Zoom

Four of those (**Minimap, Scoreboard, Toggle sprint, Zoom**) are on this backlog. **They already have
a name and a switch in the launcher** — which means `hudModules()` is already reporting their state
into `settings.hud.modules`, and has been all along. Whatever gets built for them should adopt the
name that is already on screen rather than inventing a second one, and `tools/hudcheck.mjs` should
grow an assertion the day any of them becomes real.

The remaining five — Chat, Compass, Crosshair, Level head, Nick hider — are not on this list and are
worth a decision of their own: build, or remove the row. A switch that does nothing is worse than an
absent feature, and there are five of them.

---

## Two things worth deciding before any of it is written

**The contract needs a second noun.** `elements` cannot hold a behaviour. Adding `features` is not
hard, but it touches all three languages and the menu needs a row type with no position — so it is
worth doing once, deliberately, rather than growing sideways out of the first behaviour somebody
implements.

**Some of these cost frames.** A minimap samples chunks and uploads a texture; a memory readout that
calls `Runtime` every frame allocates; hitboxes add draw calls per entity. The HUD's own render path
already rebuilds every string every frame — see the caching item in the research notes — and that
should be fixed BEFORE ten more elements are added to it, not after.

---

## Ordering

1. **The nine already arranged** — ping, cps, potion, keystrokes and the five armour slots. They are
   already in the contract, on the cards, and marked `not drawn yet`. Finishing them closes a gap
   that is currently visible to the user.
2. **Cache the HUD render** before widening it.
3. **The easy elements** from group 1 — day counter, clock, playtime, memory, totem counter. Each is
   a few lines in `HudElements.of()` and needs no contract change.
4. **The `features` section**, then the behaviours in group 2.
5. **World overlays** and, last and separately, the minimap.
