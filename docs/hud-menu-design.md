# The in-game menu — what the references actually showed

**LOOK AT THE SCREENSHOTS, NOT AT THIS FILE.** They are in **`hud-inspos/`** at the repository root
— gitignored, because they are other people's product UI and do not belong in a public repo, but
present on the machine. Open them first; this file is a reading of them, and a reading is not the
thing. Where the two disagree, the images win.

What follows is what was taken from each, so the reasoning behind Phase 2 is recoverable if the
folder is ever empty.

The brief was: *"inspired by mod menus and Lunar Client"*, *"open, close, configure them in game"*,
*"HUD moving elements freely"*, *"don't forget magnet while moving"*.

---

## 1. Lunar Client — the mod list

A centred dark panel over a **blurred** game, with the world still visible behind it.

- **Left rail: profiles.** `Default`, `UHC`, `Hypixel Skyblock`, `Survival`, each with a pencil to
  rename, and `SAVE AS NEW PROFILE` pinned at the bottom. A separate `EDIT HUD LAYOUT` button sits
  below that — **the layout editor is a distinct mode, not a tab.**
- **Filter row across the top:** `ALL` `NEW` `HUD` `SERVER` `MECHANIC`, plus grid/list toggles and a
  search field. So the list is expected to get long enough to need filtering.
- **The body is a grid of cards**, three across. Each card is an icon, a name, then two controls:
  `OPTIONS` (with a gear) and a full-width **`ENABLED`** button in green. One click to toggle, one
  click to configure — the two are never the same control.
- **The HUD is still drawn while the menu is open**, around the panel: FPS top-left, coordinates
  top-right with a compass letter, potion effects on the left, a `[Sprinting]` tag. You can see what
  you are configuring.

**What to take:** the enable/configure split per element; the world visible behind; the layout
editor as its own mode; the HUD staying drawn while you configure it.

**What not to take:** the green. Kestrel has one accent (`--go`) and green appears nowhere in the
palette. An enabled state should read as *on*, not as *approved*.

## 2. Sodium / Iris — the settings screen

A left rail of sections (`General`, `Quality`, `Performance`, `Advanced`) and a right pane of rows.

- Every row is **label left, value right**, and the value is the control — `20 Chunks`, `Bright`,
  `3x`, a checkbox, `Unlimited`. No sliders competing with numbers.
- Sections are headed inline (`◆ General`, `◆ Quality`) inside the scrolling pane rather than being
  separate screens.
- `Apply` and `Done` sit bottom-right, with **Apply greyed out until something changes.**
- The left rail groups by MOD, not by section: `Sodium 0.8.2` with General/Quality/Performance/
  Advanced under it, then `Iris 1.10.4` with Shader Packs/Settings under that. Each mod brings its
  own sections. A search field spans the top.

**What to take:** the label-left / value-right row, which is exactly what Kestrel's own settings
screens already do; and disabling a commit button until there is something to commit.

## 3. NoRisk — the Host World dialog

The smallest and most Kestrel-like of the three.

- A titled panel with an `X`, **collapsible groups** (`WORLD OPTIONS ⌄`, `NORISK CLIENT OPTIONS ⌄`),
  a slider paired with a numeric field, checkboxes, and a `‹ INVITE ONLY ›` stepper for an enum.
- Two full-width actions stacked at the bottom.
- Square corners, thin borders, generous line height. **This is the closest to the launcher's own
  visual language.**

**What to take:** the enum stepper (`‹ SHARP ›` / `‹ ROUNDED ›` reads better than a dropdown at this
size), collapsible groups, and the square-cornered panel — which is what Phase 1 just made the HUD
plates default to.

---

## What this means for Kestrel's menu

**Right Shift opens it.** Escape closes it, like every other Minecraft screen.

**Two modes, not one screen.** Lunar separates the mod list from `EDIT HUD LAYOUT`, and it is right:
toggling things and dragging things want different screens. Toggle/configure in the panel; drag with
the panel gone and the HUD alone on screen.

**The palette is Kestrel's**, not Lunar's. `Paint.java` already holds the values; the menu should use
the same plate, edge, ink and meta so the menu and the HUD it configures look like one thing.

**Magnet snapping**, which the user asked for specifically. What it should snap to, roughly in
priority order:

1. the nine anchors already in the contract — dragging near a corner should *land* on that anchor
   rather than at some x/y that happens to be close to it, because anchors are what the config
   stores and what survives a resolution change;
2. the edges of other elements, so a stack lines up;
3. screen centre lines.

A snap threshold of a few pixels, and it should be possible to hold a modifier to suppress it — a
magnet you cannot switch off is a magnet that fights you.

**Configure what Phase 1 added:** corners (sharp/rounded), font (Minecraft/Kestrel), compass on
coords, and per-element anchor, offset and scale.

## The blocker to settle first

The mod only reads the config today; `mc/hud.js` rewrites it from `settings.hud` on **every launch**.
An in-game editor that saves a layout would have it clobbered the next time the launcher starts.

Proposed, and **not yet agreed with the user**: the launcher reads the file back into `settings.hud`
before writing, so in-game edits flow back to the HUD screen and the two stay in sync. Ask before
building on it — it inverts the "the launcher owns the settings" rule that the whole contract was
designed around.
