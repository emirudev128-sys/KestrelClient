# The in-game menu — the design, and why each part is the way it is

The brief was: *"open, close, configure them in game"*, *"HUD moving elements freely"*, *"don't
forget magnet while moving"* — and later, per element: *"if I go to coordinates I should be able to
make that one bigger while keeping others the same"*, remove the background box, change its
transparency, change the colour of the text or the box.

**The current menu was designed in a browser mockup first and ported only once the user had signed
it off.** The mockup is a clickable replica at the user's own window size, built from the mod's
tables and the user's real config, with every proportion and transparency on a slider. Reference
screenshots the user supplied stay out of the repository (`hud-inspos/` is gitignored); **this file
records the decisions on their own terms**, so the reasoning survives without carrying anybody
else's name into a repo that anyone can read.

---

## The shape

**Right Shift opens it, in a world.** Escape, DONE and Right Shift again all close it, and all three
save through the same one write. It is registered through the ordinary keybinding API, so it appears
in Minecraft's own Controls screen and can be rebound.

**One screen where there were three.** The earlier menu was a grid of cards, a separate options
screen and a separate layout screen, and a player moved between them to do one thing. Now it is one
editor: a top bar with two tabs, the modules down the left, a picture of the screen in the middle
with the HUD on it, the selected element's settings on the right, and the keys along the bottom.
Selecting, styling and placing an element happen without changing screens.

**Hairlines and square corners — chosen, and reversing the earlier rule.** The earlier menu
separated surfaces by transparency alone and rounded every corner, and both were deliberate. For
this one the user chose, from a mockup with both options on the table, a one-pixel edge on every
panel, row, chip and keycap and no rounding anywhere. The transparency ladder survived underneath:
panel 43%, rows 37%, hovered 63%, wells 46% — the values the user dialled in game — composite to 43,
64, 79 and 81%.

**Modules are grouped and colour-coded.** Performance, Input, World, Session, Combat, Gear: a small
square in the group's colour heads each group, and the rows carry a faint wash of it. The colours
are muted and kept well away from amber, which stays the one accent — selection, on, and the primary
action — so a group can never be mistaken for a state. Each row's leading tag is the anchor the
module sits at (`TL`, `MR`), which is information, not decoration.

**A row is a MODULE, not an element.** "Armor status" owns five elements and the launcher switches
them together. The settings panel steps between them with a `Part` control.

**On/off is a square.** Amber when on, dim when off; no track, no word, no border. It was chosen from
four designs placed side by side in the mockup. Its click target is 26 pixels around a 10-pixel mark.

**Features read as rules.** A feature is on or off, a key, and its options — no anchor, colour or
scale — so the Features tab sets each one out the way it behaves: `WHEN [V] PRESSED → TOGGLE
SPRINT`, `WHILE [C] HELD → ZOOM [4x]`, `WHILE ON → OUTLINE ENTITIES`. A key chip in the rule is
pressed to rebind it; a column beside the rules lists the keys in use and says when two features
want the same one.

## The canvas

**It is the real screen, small.** The unblurred frame is scaled into the middle panel and every
element is drawn over it by the renderer the world uses, at the position the world would put it. An
element switched off stays on the canvas, faint and dashed — it is how you find it to switch it back.
`fit` shows the whole screen; `1 : 1` shows true size around the selected element.

**The live HUD steps aside while the editor is open.** The canvas draws the whole HUD; a live copy
peeking out between the panels would be two of everything.

## How it is drawn

**At its own scale, not the GUI scale.** Everything is laid out in design pixels — one screen pixel
at 1080p, two on a screen 1600 pixels tall or more — and scaled once into Minecraft's GUI space. The
menu is the same size at GUI scale 2 and GUI scale 4, and every hairline is exactly one pixel.

**Only what sits behind a panel is blurred.** Vanilla's menu blur covers the whole frame. The frame is
copied, blurred with vanilla's own pass, copied again and put back, and only the panel rectangles are
pasted from the blurred copy — framebuffer blits, no shader of ours and no mixin. The world between
the panels stays sharp, and the same unblurred copy is what the canvas shows.

**Kestrel's two typefaces, a font definition per size.** Archivo for words, Azeret Mono for labels,
values and keys — the launcher's own pair. Minecraft samples glyph textures nearest-neighbour, so a
face scaled to a size it was not rasterised at breaks up; every size the menu uses has its own
definition at that size, with a double-density twin. Every face is a static instance: a variable font
renders at its default instance, which for these is Thin.

**Text is centred on its capitals.** A TrueType baseline sits 7 font pixels below where it is drawn,
and both faces keep more room below the baseline than above the capitals, so a label centred by its
line box sits visibly high. Each label is placed from the font's own cap height (0.686 em for
Archivo, 0.698 for Azeret Mono). The mockup had the same fault and the same fix.

**Nothing in the menu moves.** Every element is drawn from fixed sample text. A live fps counter in a
preview flickers and changes width while you are trying to align it.

## The magnet

Asked for by name, and carried over whole from the old layout screen to the canvas. What it snaps to, in priority order — the thing that survives longest first:

1. **The nine anchors** — flush to an edge, on a centre line, or at the stock inset the default
   layout uses. These are what the config actually stores, so landing *on* one means the element is
   still in the corner on somebody else's monitor rather than at a pixel count that happened to look
   right on this one.
2. **The edges of other elements** — leading edges, trailing edges, centres, and the two positions
   that sit an element directly beside or beneath another with one gap between, so a stack lines up.
3. **Screen centre lines**, for the same reason as the first.

Five pixels of pull, a guide line drawn at whatever it caught on, and **Alt suppresses it** — a
magnet you cannot switch off is a magnet that fights you, and the one place you always need it off
is the one place snapping is strongest, next to something else.

**Nothing stacks itself in the editor.** The live HUD pushes a colliding element clear of its
neighbour; the editor does not. Automatic stacking rescues a layout nobody is watching. While you
are dragging, an element that jumps out from under the cursor is one you cannot place.

## What was rejected, and why

**Green for on.** Kestrel has one accent, amber, and an on state should read as *on*, not as
*approved*.

**Vanilla's `ButtonWidget` and friends.** They carry vanilla's look — the bevelled button, the 20px
height. A menu that configures a Kestrel HUD while wearing Minecraft's chrome reads as two products
in one window.

**One font, scaled to every size.** Cheaper to ship and broken on screen: nearest-neighbour sampling
turns a scaled glyph's strokes ragged. Seventeen small font definitions cost nothing at runtime.

**Blurring the whole frame.** Vanilla's default and the one-line version — and it blurs the world the
HUD is being arranged against everywhere, including the gaps between panels, which the user asked to
stay sharp.

**Drawing at the GUI scale.** The number a player picked for Minecraft's own buttons would decide how
big this menu is, and at GUI scale 4 a three-panel editor does not fit a 1080p screen at all.

**Numbering the rows.** A leading `01`, `02` is a common look and it would have encoded nothing: the
modules are not a sequence. The tag in that position is the anchor instead.

## The ownership question, settled

The mod used to only read the config; `mc/hud.js` rewrote it from `settings.hud` on **every launch**,
so an in-game editor that saved a layout would have had it clobbered at the next start.

**The user chose read-back with provenance.** The document carries `rev` and `by`. The mod stamps
`by: "game"`; on the next launch `hud.sync()` reads first, folds a game-written document back into
`settings.hud`, and only then writes — stamped `by: "launcher"` again, which is what makes the
import happen exactly once.

**One refinement on the proposal as it was put.** The obvious rule is "import if the file's rev is
newer than the one we last wrote", and that has a hole: `settings.hud` is ONE global object while the
config file is PER INSTANCE, so revs across instances are not a total order. Edit in-game in instance
A, launch B, come back to A, and A's rev is behind the number the launcher moved on to — the edit
would be silently discarded. So the decision rests on `by` alone. `rev` stays for the log line and
for ordering within one instance.

This did NOT invert "the launcher owns the settings", which was the worry. The launcher still owns
every default, every name and every word a player reads: `module` and `label` travel in the document
so the mod has no vocabulary of its own, and a twelfth element added to the HUD screen appears in
the in-game menu with no Java changing. What the mod gained is an *editor for the document*, not a
second model of it.

## Per-element style, and the constant that had to go

Version 4 added `plate`, `plateColour`, `plateAlpha`, `textColour`, `textAlpha` per element. Corners
and font stay whole-HUD — three sharp plates and one rounded one is not a configuration, it is a
mistake — but colour and the box are per element, because picking **one** element out of the rest is
the entire reason anybody opens this menu.

**Every default is the old hard-coded constant to the byte**, so an unstyled HUD is pixel-identical
to what it was before the fields existed.

**The label tone had to stop being a constant.** The typography of this HUD is that the VALUE is
what you glance at and the LABEL only says what it is, and one weight of one bitmap font cannot
express that — so it was two hard-coded greys. Two hard-coded greys cannot survive somebody picking
red. A label is now its element's own colour at 58% alpha, which over the default plate blends to
`#909294` — the grey it replaces. The ACCENT does *not* follow: it marks the case worth noticing,
and a "worth noticing" the same colour as everything around it has stopped noticing anything.

## Two bugs this work turned up

**Percentages were clamped to `0..100` on both sides.** Against a centre or middle anchor the offset
runs both ways from the middle — the HUD screen's own `place()` writes `top: calc(50% + Y%)` — and
the stock layout has one, `helmet` at `mr` / `-9.6`. Every launch was writing that element as `0`,
dropping the helmet icon into the vertical centre. Invisible only because the mod does not draw
armour yet. Both sides clamp `-100..100` now.

**The launcher's HUD screen was write-only.** `saveHud()` wrote `settings.hud` and nothing ever read
it back: `ST` was built from the markup's `data-` attributes and `host.settings.get()` was never
called for the HUD at all. The launcher forgot its own layout every session, and the first drag on
that screen wrote the stock arrangement over whatever had been set in game. Per-element style made
that fatal rather than annoying, since `store.js` merges at the top level only and `{hud: …}` swapped
the whole object. `loadHud()` now reads at startup and `saveHud()` merges instead of replacing.

## Two more bugs, found by building the mockup

**The memory preview moved.** Its sample read the live heap, so it changed every frame the menu was
open — the one preview that broke the rule the samples exist for. It shows fixed numbers now.

**The potion preview ignored "Show time left".** Switching it off changed nothing you could see. The
sample honours it the way the live rows do.
