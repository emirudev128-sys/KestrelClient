package dev.kestrel.hud;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;

/**
 * THE MENU'S FURNITURE — panel, row, toggle, stepper, button.
 *
 * <p>Drawn by hand rather than assembled from {@code ButtonWidget} and
 * friends. Vanilla's widgets carry vanilla's look: the beveled nine-slice
 * button, the highlight on hover, the 20px height. A menu that configures a
 * Kestrel HUD while wearing Minecraft's chrome would read as two products in
 * one window, so the furniture here is Kestrel's own — thin borders, a 14px
 * row, and corners softened by a few pixels.
 *
 * <p><b>THE CORNERS ARE THE ONE PLACE THIS PARTS FROM THE HUD.</b> A plate
 * drawn into the world defaults to square, because Minecraft's own panels and
 * tooltips are square and a plate should look like it belongs on that screen.
 * A menu is not on that screen — it IS the screen while it is open — and at
 * 350 pixels across a hard corner reads as unfinished. See {@link #roundRect},
 * which is where the interesting half of that lives.
 *
 * <p><b>NO WIDGET OBJECTS, AND SO NO WIDGET STATE.</b> Every control here is
 * a function of a rectangle and a value: draw it from those, hit-test it
 * against the same rectangle. The screens compute their rectangles once, in
 * one method each, and both the render pass and the click handler read that
 * — which is the only way the thing you clicked and the thing you saw cannot
 * come apart.
 *
 * <p><b>ASCII ANGLE BRACKETS.</b> The stepper wants {@code ‹ SHARP ›} and
 * gets {@code &lt; SHARP &gt;}. Minecraft's font falls back to unifont for
 * anything outside its own sheet, and single guillemets are exactly the kind
 * of character that comes out as a missing-glyph box on some resource packs.
 * A control whose arrows might not render is not a control.
 */
final class Ui {

    private Ui() { }

    static boolean hit(double mx, double my, int x, int y, int w, int h) {
        return mx >= x && mx < x + w && my >= y && my < y + h;
    }

    /* ══ ROUNDED CORNERS, WITHOUT A ROUNDED-RECTANGLE PRIMITIVE ═══════════
       Minecraft has {@code fill}, which draws an axis-aligned rectangle, and
       nothing else. A rounded rectangle is therefore a STACK OF HORIZONTAL
       SPANS: the rows near an edge are inset, the rows in the middle are not.

       THE INSETS ARE TABLED FOR THE SIZES ACTUALLY USED, and that is a
       correction rather than a shortcut. The first version of this computed
       them straight off a circle — {@code r - sqrt(r² - dy²)} with
       {@code dy = r - row} — and the comment here claimed it produced 2, 1,
       1, 0 at r=4. It produces 4, 2, 1, 1: at row zero that {@code dy} lands
       on the TANGENT POINT of the circle, where its width is zero, so the top
       row gets inset by the whole radius and the corner reads as a notch
       bitten out of the panel rather than as a curve. Printing the four rows
       is what caught it; the arithmetic looked right.

       Two to four pixels is too few for a formula to choose well anyway —
       every pixel is a fifth of the corner, so the shape is a drawing
       decision, not a rounding of one. These four are the arcs a pixel artist
       would draw by hand. Anything larger falls through to the circle, now
       measured from the row's CENTRE ({@code dy = r - row - 0.5}), which is
       the fix the tabled cases also embody.

       Cost is 2r+1 fills instead of 1. At r=4 that is nine rectangles for a
       panel drawn once a frame, which is not a number worth optimising. */
    private static final int MAX_R = 8;

    /** insets from the corner inward, one per row, for the radii in use */
    private static final int[][] ARC = {
        {},                 /* r=0 */
        { 1 },              /* r=1 — a single corner pixel off */
        { 2, 1 },           /* r=2 */
        { 2, 1, 1 },        /* r=3 */
        { 3, 2, 1, 1 }      /* r=4 */
    };

    static int inset(int r, int row) {
        if (r <= 0 || row >= r) return 0;
        if (r < ARC.length) return ARC[r][row];
        double dy = r - row - 0.5;
        double dx = r - Math.sqrt(Math.max(0.0, (double) r * r - dy * dy));
        return (int) Math.ceil(dx - 1e-9);
    }

    /** a filled rectangle with its corners taken off */
    static void roundRect(DrawContext ctx, int x, int y, int w, int h, int r, int colour) {
        int rr = Math.max(0, Math.min(Math.min(r, MAX_R), Math.min(w, h) / 2));
        if (rr == 0) { ctx.fill(x, y, x + w, y + h, colour); return; }
        for (int i = 0; i < rr; i++) {
            int in = inset(rr, i);
            ctx.fill(x + in, y + i, x + w - in, y + i + 1, colour);
            ctx.fill(x + in, y + h - 1 - i, x + w - in, y + h - i, colour);
        }
        ctx.fill(x, y + rr, x + w, y + h - rr, colour);
    }

    /** the 1px outline of that same shape, so a fill and its border agree
     *  about where the corner is — two different roundings on one rectangle
     *  is the failure this shares its inset table to avoid */
    static void roundBorder(DrawContext ctx, int x, int y, int w, int h, int r, int colour) {
        int rr = Math.max(0, Math.min(Math.min(r, MAX_R), Math.min(w, h) / 2));
        if (rr == 0) { border(ctx, x, y, w, h, colour); return; }
        for (int i = 0; i < rr; i++) {
            int in = inset(rr, i);
            int prev = i == 0 ? in : inset(rr, i - 1);
            /* the horizontal run of this row's step, top and bottom */
            ctx.fill(x + in, y + i, x + prev + 1, y + i + 1, colour);
            ctx.fill(x + w - prev - 1, y + i, x + w - in, y + i + 1, colour);
            ctx.fill(x + in, y + h - 1 - i, x + prev + 1, y + h - i, colour);
            ctx.fill(x + w - prev - 1, y + h - 1 - i, x + w - in, y + h - i, colour);
        }
        /* the straight sides between the corners */
        ctx.fill(x, y + rr, x + 1, y + h - rr, colour);
        ctx.fill(x + w - 1, y + rr, x + w, y + h - rr, colour);
    }

    /** fill and outline in one call, which is what almost every caller wants */
    static void surface(DrawContext ctx, int x, int y, int w, int h, int r, int fill, int edge) {
        roundRect(ctx, x, y, w, h, r, fill);
        roundBorder(ctx, x, y, w, h, r, edge);
    }

    /** the panel itself: softened corners, one thin line, glass */
    static void panel(DrawContext ctx, int x, int y, int w, int h) {
        surface(ctx, x, y, w, h, Paint.R_PANEL, Paint.PANEL, Paint.REGION);
    }

    static void border(DrawContext ctx, int x, int y, int w, int h, int colour) {
        ctx.fill(x, y, x + w, y + 1, colour);
        ctx.fill(x, y + h - 1, x + w, y + h, colour);
        ctx.fill(x, y + 1, x + 1, y + h - 1, colour);
        ctx.fill(x + w - 1, y + 1, x + w, y + h - 1, colour);
    }

    static void rule(DrawContext ctx, int x, int y, int w) {
        ctx.fill(x, y, x + w, y + 1, Paint.REGION);
    }

    static void left(DrawContext ctx, TextRenderer tr, String s, int x, int y, int colour) {
        ctx.drawText(tr, s, x, y, colour, false);
    }

    static void right(DrawContext ctx, TextRenderer tr, String s, int rightX, int y, int colour) {
        ctx.drawText(tr, s, rightX - tr.getWidth(s), y, colour, false);
    }

    static void centred(DrawContext ctx, TextRenderer tr, String s, int x, int w, int y, int colour) {
        ctx.drawText(tr, s, x + (w - tr.getWidth(s)) / 2, y, colour, false);
    }

    /** a section heading: the label in the accent over a rule, which is how
     *  a group is headed inline inside the scrolling pane rather than each
     *  one becoming a separate screen */
    static void heading(DrawContext ctx, TextRenderer tr, String s, int x, int y, int w) {
        ctx.drawText(tr, s, x, y, Paint.ACCENT, false);
        int after = x + tr.getWidth(s) + 5;
        if (after < x + w) ctx.fill(after, y + 3, x + w, y + 4, Paint.REGION);
    }

    /** the hover wash behind a whole row */
    static void rowHover(DrawContext ctx, int x, int y, int w, int h) {
        ctx.fill(x, y, x + w, y + h, Paint.HOVER);
    }

    /* ── the toggle ───────────────────────────────────────────────────────
       The conventional answer is a full-width button that turns GREEN when
       the thing is on. Kestrel has one accent and green appears nowhere in
       the palette, so this reads as ON rather than as APPROVED: the accent
       fills the pill, and the word sits on it in the ink meant for that
       ground (--on-go). Off is the ordinary raised control with muted text —
       a state, not an alarm. */
    static final int TOGGLE_W = 26;
    static final int TOGGLE_H = 11;

    static void toggle(DrawContext ctx, TextRenderer tr, int x, int y, boolean on, boolean hover, boolean enabled) {
        int fill = !enabled ? Paint.RAISE : on ? (hover ? Paint.GO_HI : Paint.ACCENT) : (hover ? Paint.HOVER : Paint.RAISE);
        surface(ctx, x, y, TOGGLE_W, TOGGLE_H, Paint.R_CTRL, fill,
            !enabled ? Paint.FAINT : on ? Paint.ACCENT : Paint.DEFINE);
        int ink = !enabled ? Paint.FAINT : on ? Paint.ON_GO : Paint.MUTE;
        centred(ctx, tr, on ? "ON" : "OFF", x, TOGGLE_W, y + 2, ink);
    }

    /* ── the stepper ──────────────────────────────────────────────────────
       A stepper rather than a dropdown, which is right at this size: a
       dropdown needs a second surface and a second click for a choice between
       two words, and two words fit. Returns nothing; the screen decides what
       a click on which half means. */
    static final int STEP_ARROW = 9;

    static void stepper(DrawContext ctx, TextRenderer tr, int x, int y, int w, int h,
                        String value, boolean hoverLeft, boolean hoverRight) {
        surface(ctx, x, y, w, h, Paint.R_CTRL, Paint.RAISE, Paint.DEFINE);
        centred(ctx, tr, "<", x, STEP_ARROW, y + (h - 8) / 2, hoverLeft ? Paint.ACCENT : Paint.MUTE);
        centred(ctx, tr, ">", x + w - STEP_ARROW, STEP_ARROW, y + (h - 8) / 2, hoverRight ? Paint.ACCENT : Paint.MUTE);
        centred(ctx, tr, value, x + STEP_ARROW, w - STEP_ARROW * 2, y + (h - 8) / 2, Paint.VALUE);
    }

    /* ── the checkbox ─────────────────────────────────────────────────────
       A tick, not a filled square: a filled amber square at 9px is a blob,
       and the eye reads a tick as "yes" at any size. Drawn as two strokes
       because there is no line primitive and a 9px tick is four fills. */
    static final int BOX = 9;

    static void check(DrawContext ctx, int x, int y, boolean on, boolean hover) {
        /* R_CTRL would eat a 9px box, so a checkbox keeps a single corner
           pixel off — enough to stop it reading as the one hard square left
           on the screen, not so much that the tick loses its ground */
        surface(ctx, x, y, BOX, BOX, 1, hover ? Paint.HOVER : Paint.RAISE,
            on ? Paint.ACCENT : Paint.DEFINE);
        if (!on) return;
        ctx.fill(x + 2, y + 4, x + 3, y + 6, Paint.ACCENT);
        ctx.fill(x + 3, y + 5, x + 4, y + 7, Paint.ACCENT);
        ctx.fill(x + 4, y + 4, x + 5, y + 6, Paint.ACCENT);
        ctx.fill(x + 5, y + 3, x + 6, y + 5, Paint.ACCENT);
        ctx.fill(x + 6, y + 2, x + 7, y + 4, Paint.ACCENT);
    }

    /* ── the button ───────────────────────────────────────────────────────
       PRIMARY is the accent filled; ordinary is the raised control. One
       primary per screen: the accent means "this is the way out of here", and
       two of them means neither does. */
    static void button(DrawContext ctx, TextRenderer tr, int x, int y, int w, int h,
                       String label, boolean hover, boolean primary) {
        int fill = primary ? (hover ? Paint.GO_HI : Paint.ACCENT) : (hover ? Paint.HOVER : Paint.RAISE);
        surface(ctx, x, y, w, h, Paint.R_CTRL, fill, primary ? Paint.ACCENT : Paint.DEFINE);
        centred(ctx, tr, label, x, w, y + (h - 8) / 2, primary ? Paint.ON_GO : hover ? Paint.VALUE : Paint.BODY);
    }

    /* ── the slider ───────────────────────────────────────────────────────
       For transparency, which is the one value here that is genuinely
       continuous. Every other value on these screens is a stepper — `SHARP`,
       an anchor, a checkbox — and that is right where the choices are few and
       each one means something. It is wrong for alpha: nobody wants 72 rather
       than 71, they want "fainter than that", and the only way to say that is
       to drag it and watch.

       THE NUMBER IS SHOWN ANYWAY, on the right, because two elements set to
       "about the same" by eye are two elements you cannot make identical
       later without one. */
    static final int SLIDER_H = 9;

    static void slider(DrawContext ctx, TextRenderer tr, int x, int y, int w, int value, boolean hover) {
        slider(ctx, tr, x, y, w, value, hover, clamp01(value) + "%");
    }

    /** the same track with the number written some other way — scale runs
     *  0.25..4 and reads as {@code x1.75}, but it is dragged like any other
     *  continuous value, so the control is the same and only the caption
     *  differs */
    static void slider(DrawContext ctx, TextRenderer tr, int x, int y, int w, int value,
                       boolean hover, String display) {
        int numW = 22;
        int track = w - numW;
        int mid = y + SLIDER_H / 2;
        ctx.fill(x, mid, x + track, mid + 1, Paint.DEFINE);
        int at = x + Math.round(track * clamp01(value) / 100f);
        ctx.fill(x, mid, at, mid + 1, hover ? Paint.GO_HI : Paint.ACCENT);
        /* a 3px knob, because a 1px one is a line you cannot aim at */
        ctx.fill(at - 1, y, at + 2, y + SLIDER_H, hover ? Paint.GO_HI : Paint.ACCENT);
        right(ctx, tr, display, x + w, y + 1, Paint.MUTE);
    }

    /** where a click at mx lands on that track, 0..100 */
    static int sliderValue(double mx, int x, int w) {
        int track = w - 22;
        if (track <= 0) return 0;
        double v = (mx - x) / track * 100.0;
        return v < 0 ? 0 : (v > 100 ? 100 : (int) Math.round(v));
    }

    static boolean overSlider(double mx, double my, int x, int y, int w) {
        /* a few pixels of slop above and below: a 9px target is a 9px target
           and the pointer in this game is not precise */
        return mx >= x - 2 && mx < x + w && my >= y - 2 && my < y + SLIDER_H + 2;
    }

    private static int clamp01(int v) { return v < 0 ? 0 : (v > 100 ? 100 : v); }

    /* ── the colour swatches ──────────────────────────────────────────────
       No picker, no hex field, no RGB spinners. A hex field needs a keyboard
       focus model and a validation state for a value that is wrong most of
       the time you are typing it; a wheel needs a shader. A row of squares is
       one click, and every square is a colour that actually looks right on a
       HUD over a world.

       THE FIRST FOUR ARE KESTREL'S OWN — ink, body, meta and the accent — so
       "put it back how it was" is a click rather than a memory test. The rest
       are Minecraft's own chat colours, which are the ones players already
       have names for. */
    static final int[] PALETTE = {
        0xF1F4F7, 0xCDCFD3, 0x929497, 0xE3B439,
        0x0A0E13, 0xFF5555, 0xFFAA00, 0xFFFF55,
        0x55FF55, 0x55FFFF, 0x5555FF, 0xFF55FF,
        0xAA00AA, 0x00AA00
    };
    static final int SWATCH = 11;
    static final int SWATCH_GAP = 2;
    static final int SWATCH_COLS = 7;

    static int swatchRows() {
        return (PALETTE.length + SWATCH_COLS - 1) / SWATCH_COLS;
    }

    static int swatchesH() {
        return swatchRows() * SWATCH + (swatchRows() - 1) * SWATCH_GAP;
    }

    static void swatches(DrawContext ctx, int x, int y, int selectedRgb, double mx, double my) {
        for (int i = 0; i < PALETTE.length; i++) {
            int sx = x + (i % SWATCH_COLS) * (SWATCH + SWATCH_GAP);
            int sy = y + (i / SWATCH_COLS) * (SWATCH + SWATCH_GAP);
            ctx.fill(sx, sy, sx + SWATCH, sy + SWATCH, 0xFF000000 | PALETTE[i]);
            boolean chosen = (selectedRgb & 0xFFFFFF) == PALETTE[i];
            boolean over = hit(mx, my, sx, sy, SWATCH, SWATCH);
            /* the chosen one is ringed in the accent, and in the ink when the
               chosen colour IS the accent — a ring the same colour as its
               swatch is not a ring */
            if (chosen) {
                border(ctx, sx - 1, sy - 1, SWATCH + 2, SWATCH + 2,
                    PALETTE[i] == 0xE3B439 ? Paint.VALUE : Paint.ACCENT);
            } else if (over) {
                border(ctx, sx, sy, SWATCH, SWATCH, Paint.VALUE);
            } else {
                border(ctx, sx, sy, SWATCH, SWATCH, Paint.REGION);
            }
        }
    }

    /** which swatch a click landed on, or -1 */
    static int swatchAt(double mx, double my, int x, int y) {
        for (int i = 0; i < PALETTE.length; i++) {
            int sx = x + (i % SWATCH_COLS) * (SWATCH + SWATCH_GAP);
            int sy = y + (i / SWATCH_COLS) * (SWATCH + SWATCH_GAP);
            if (hit(mx, my, sx, sy, SWATCH, SWATCH)) return PALETTE[i];
        }
        return -1;
    }

    /* ── the gear ─────────────────────────────────────────────────────────
       OPTIONS and ENABLED are two words of similar length in similar boxes,
       and the glyph is what tells them apart at a glance. Six teeth around a
       ring, drawn as fills — there is no vector primitive and shipping a
       texture for a 7px icon is not a trade worth making. */
    static void gear(DrawContext ctx, int x, int y, int ink, int ground) {
        ctx.fill(x + 2, y + 1, x + 5, y + 6, ink);
        ctx.fill(x + 1, y + 2, x + 6, y + 5, ink);
        ctx.fill(x, y + 3, x + 7, y + 4, ink);
        ctx.fill(x + 3, y, x + 4, y + 7, ink);
        /* THE HOLE IS PUNCHED IN WHATEVER IS BEHIND IT, which is why the
           ground is a parameter. Filling it with Paint.PANEL was right until
           the button under it got a hover state, at which point the gear kept
           a panel-coloured dot in the middle of a lighter button and read as
           a smudge rather than as a ring. */
        ctx.fill(x + 3, y + 3, x + 4, y + 4, ground);
    }

    /** the close control, top right of a panel — an X drawn as two diagonals
     *  for the same reason the tick is drawn: there is no glyph in the font
     *  that is reliably square at this size */
    static void close(DrawContext ctx, int x, int y, int size, boolean hover) {
        border(ctx, x, y, size, size, hover ? Paint.ACCENT : Paint.DEFINE);
        int ink = hover ? Paint.ACCENT : Paint.MUTE;
        for (int i = 2; i < size - 2; i++) {
            ctx.fill(x + i, y + i, x + i + 1, y + i + 1, ink);
            ctx.fill(x + size - 1 - i, y + i, x + size - i, y + i + 1, ink);
        }
    }
}
