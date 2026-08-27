# The in-game menu — the design, and why each part is the way it is

The brief was: *"open, close, configure them in game"*, *"HUD moving elements freely"*, *"don't
forget magnet while moving"* — and later, per element: *"if I go to coordinates I should be able to
make that one bigger while keeping others the same"*, remove the background box, change its
transparency, change the colour of the text or the box.

Reference screenshots the user supplied are in **`hud-inspos/`**, which is **gitignored and stays
that way** — they are other people's product UI and do not belong in a public repository. Neither do
descriptions of them. **This file records the decisions on their own terms**: what was built, what
was rejected, and the reason in each case, so the reasoning survives without carrying anybody else's
name into a repo that anyone can read.

---

## The shape

**Right Shift opens it, in a world.** Escape closes it, like every other Minecraft screen. It is
registered through the ordinary keybinding API, so it appears in Minecraft's own Controls screen and
can be rebound — more than a hard-coded key check in a tick handler would have given anyone.

**Two modes, not one screen.** Toggling things and dragging things want different screens: a panel
in the middle of the display is exactly the wrong thing to have on top of what you are positioning.
So the menu toggles and configures, and `EDIT HUD LAYOUT` drops into a separate screen with the
panel gone and the HUD alone on screen.

**A grid of cards, one per module.** The first build was a list of rows with a toggle on the right.
It worked, and it was sent back after testing. The card is right for a reason worth stating plainly:
**enable and configure are two different controls, and a row with one toggle has nowhere to put the
second one.** Each card carries `OPTIONS` and `ENABLED`.

**A card is a MODULE, not an element.** "Armor status" owns five elements and the launcher's own
screen switches them together. Five armour cards would be a second model of visibility disagreeing
with the first. Where a module owns more than one element, the options screen steps between them
with `< HELMET >`.

**Every card draws the real element, not an icon.** The obvious thing was a small glyph per module.
Drawing the element itself — through the same renderer the world uses, at whatever colour,
transparency and plate setting it currently has — makes the grid a contact sheet of your own HUD, so
a colour change shows up before you close the menu. An invented icon would have been more work and
told you less.

**The HUD stays drawn while the menu is open.** It is what you are configuring. Flipping a module
off should show you the element vanishing from the corner it was in; that is the whole reason to do
this in the game rather than in the launcher, where it was already possible.

## The per-element screen

`OPTIONS` opens one element: size, anchor, show-the-box, box colour, box opacity, text colour, text
opacity, and the compass — which lives here rather than in the whole-HUD section, since it means
something on exactly one element.

**The preview lets the world through.** "Does this plate read at 30%" is a question about the world.
A preview on flat grey answers a different question.

**Colour comes from swatches.** No wheel — that needs a shader. No hex field — that needs a focus
model and a validation state for a value that is wrong most of the time you are typing it. Fourteen
squares: Kestrel's own four first, so "put it back how it was" is one click, then Minecraft's chat
colours, which are the ones players already have names for.

**Alpha is a slider; everything else is a stepper.** Transparency is the one genuinely continuous
value on these screens — nobody wants 72 rather than 71, they want "fainter than that", and the only
way to say that is to drag it and watch. The number is still shown, because two elements set to
"about the same" by eye cannot be made identical later without it.

**Size is a slider here and a wheel in the layout editor.** Both write the same field. The wheel is
right when the element is under your cursor and you are judging it against its neighbours; the
slider is right when you are looking at one thing and want 1.75 exactly.

## The magnet

Asked for by name. What it snaps to, in priority order — the thing that survives longest first:

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

**Green for the enabled state.** The conventional answer is a button that turns green. Kestrel has
one accent and green appears nowhere in its palette; an enabled state should read as *on*, not as
*approved*.

**A blur behind the panel.** Blur is a shader pass whose API has moved in every recent Minecraft
version, and it would have to be re-checked at every version bump for a visual nicety. A fill works,
and the world stays legible behind it, which was the point.

**Collapsible sections.** Worth it at four groups. This has two and ten rows, and a disclosure
triangle over five rows costs a click to see what already fits on screen.

**Single guillemets in the stepper.** `‹ SHARP ›` reads better than `< SHARP >` and is exactly the
kind of character that comes out as a missing-glyph box under some resource packs. A control whose
arrows might not render is not a control.

**Vanilla's `ButtonWidget` and friends.** They carry vanilla's look — the beveled nine-slice button,
the 20px height. Kestrel's screens are square-cornered, thin-bordered and 14px to a row, and a menu
that configures a Kestrel HUD while wearing Minecraft's chrome would read as two products in one
window.

**Invented sample data for the elements that are not drawn yet.** A plate reading `21 ms` on top of
the world is indistinguishable from a ping display that works, and you would find out it never
appears in-world by closing the editor. The muted label cannot be mistaken for a reading, and the
card says `not drawn yet` outright.

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

## Still not drawn

Nine of the eleven elements are arranged, carried, listed, toggled and styleable — and not drawn in
the world. The cards say so on the rows they cannot honour, and the layout editor shows those
elements as their own label in the muted ink. `HudElements.of()` is the single place to add each.
