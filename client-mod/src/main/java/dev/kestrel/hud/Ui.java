package dev.kestrel.hud;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;

/**
 * THE MENU'S FURNITURE — panel, row, toggle, stepper, button.
 *
 * <p>Drawn by hand rather than assembled from {@code ButtonWidget} and
 * friends. Vanilla's widgets carry vanilla's look: the beveled nine-slice
 * button, the highlight on hover, the 20px height. Kestrel's screens are
 * square-cornered, thin-bordered and 14px to a row, and a menu that
 * configures a Kestrel HUD while wearing Minecraft's chrome would read as two
 * products in one window. The reference that settled it is NoRisk's Host
 * World dialog in {@code hud-inspos/} — the closest of the three to the
 * launcher's own visual language.
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

    /** the panel itself: square corners, one thin line, nearly opaque */
    static void panel(DrawContext ctx, int x, int y, int w, int h) {
        ctx.fill(x, y, x + w, y + h, Paint.PANEL);
        border(ctx, x, y, w, h, Paint.REGION);
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
     *  Sodium heads its groups inside the scrolling pane rather than making
     *  each one a separate screen */
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
       Lunar's is a full-width button that turns GREEN when the mod is on.
       Kestrel has one accent and green appears nowhere in the palette, so
       this reads as ON rather than as APPROVED: the accent fills the pill,
       and the word sits on it in the ink meant for that ground (--on-go).
       Off is the ordinary raised control with muted text — a state, not an
       alarm. */
    static final int TOGGLE_W = 26;
    static final int TOGGLE_H = 11;

    static void toggle(DrawContext ctx, TextRenderer tr, int x, int y, boolean on, boolean hover, boolean enabled) {
        int fill = !enabled ? Paint.RAISE : on ? (hover ? Paint.GO_HI : Paint.ACCENT) : (hover ? Paint.HOVER : Paint.RAISE);
        ctx.fill(x, y, x + TOGGLE_W, y + TOGGLE_H, fill);
        border(ctx, x, y, TOGGLE_W, TOGGLE_H, !enabled ? Paint.FAINT : on ? Paint.ACCENT : Paint.DEFINE);
        int ink = !enabled ? Paint.FAINT : on ? Paint.ON_GO : Paint.MUTE;
        centred(ctx, tr, on ? "ON" : "OFF", x, TOGGLE_W, y + 2, ink);
    }

    /* ── the stepper ──────────────────────────────────────────────────────
       NoRisk's `< INVITE ONLY >` for an enum, and it is right at this size: a
       dropdown needs a second surface and a second click for a choice between
       two words, and two words fit. Returns nothing; the screen decides what
       a click on which half means. */
    static final int STEP_ARROW = 9;

    static void stepper(DrawContext ctx, TextRenderer tr, int x, int y, int w, int h,
                        String value, boolean hoverLeft, boolean hoverRight) {
        ctx.fill(x, y, x + w, y + h, Paint.RAISE);
        border(ctx, x, y, w, h, Paint.DEFINE);
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
        ctx.fill(x, y, x + BOX, y + BOX, hover ? Paint.HOVER : Paint.RAISE);
        border(ctx, x, y, BOX, BOX, on ? Paint.ACCENT : Paint.DEFINE);
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
        ctx.fill(x, y, x + w, y + h, fill);
        border(ctx, x, y, w, h, primary ? Paint.ACCENT : Paint.DEFINE);
        centred(ctx, tr, label, x, w, y + (h - 8) / 2, primary ? Paint.ON_GO : hover ? Paint.VALUE : Paint.BODY);
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
