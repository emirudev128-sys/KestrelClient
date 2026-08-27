package dev.kestrel.hud;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;

import java.util.List;

/**
 * WHERE AN ELEMENT GOES, AND WHAT IT LOOKS LIKE WHEN IT GETS THERE.
 *
 * <p>The geometry lived inside the render callback until a layout editor
 * needed the same answers. Both now ask this: the live HUD to draw, the
 * editor to draw AND to work backwards from a dragged pixel to the anchor and
 * percentage that would put it there. Keeping the forward and inverse maps in
 * one file is the point — they are the same formula read in two directions,
 * and an editor that computes a position by a different route from the
 * renderer is an editor whose preview drifts from the result.
 */
final class HudRenderer {

    private HudRenderer() { }

    /** a placed element, kept so the next one can avoid sitting on it */
    static final class Box {
        final double x, y, w, h;
        Box(double x, double y, double w, double h) { this.x = x; this.y = y; this.w = w; this.h = h; }
        boolean hits(Box o) {
            return x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y;
        }
        boolean holds(double px, double py) {
            return px >= x && px < x + w && py >= y && py < y + h;
        }
        double cx() { return x + w / 2.0; }
        double cy() { return y + h / 2.0; }
    }

    /** the unscaled width of a row of runs, padding included */
    static int width(TextRenderer tr, List<HudElements.Run> runs) {
        int inner = 0;
        for (int i = 0; i < runs.size(); i++) {
            inner += tr.getWidth(runs.get(i).text);
            if (i < runs.size() - 1) inner += Paint.GAP;
        }
        return inner + Paint.PAD_X * 2;
    }

    /** the unscaled height of any element: one line and its padding */
    static int height() {
        return Paint.LINE + Paint.PAD_Y * 2;
    }

    /* ── forward: anchor + percentage -> pixels ────────────────────────────
       The anchor decides what x and y MEAN. The offset runs inward from the
       edge it names, and the element's own size comes off a right or bottom
       anchor so the box stays on screen. Against a centre or middle anchor
       the offset runs both ways from the middle, which is why a negative
       percentage is a real value here and not a mistake to clamp away. */
    static Box box(HudConfig.Element el, int w, int h, int sw, int sh) {
        double bw = w * el.scale;
        double bh = h * el.scale;
        double ox = sw * el.x / 100.0;
        double oy = sh * el.y / 100.0;
        char vert = el.anchor.charAt(0);
        char horiz = el.anchor.charAt(1);

        double px = horiz == 'l' ? ox : horiz == 'r' ? sw - ox - bw : (sw - bw) / 2.0 + ox;
        double py = vert == 't' ? oy : vert == 'b' ? sh - oy - bh : (sh - bh) / 2.0 + oy;
        return new Box(px, py, bw, bh);
    }

    /* ── inverse: pixels -> anchor + percentage ────────────────────────────
       Used only by the editor. Two steps, because they answer different
       questions: which anchor should this element BELONG to, and what offset
       from that anchor lands it exactly where the cursor left it. */

    /** WHICH THIRD OF THE SCREEN THE ELEMENT'S CENTRE IS IN. An element in
     *  the top-left corner should be anchored top-left, so that a player on a
     *  wider monitor finds it in the corner rather than a fixed number of
     *  pixels from an edge that has moved. Chosen from the CENTRE rather than
     *  a corner so the answer does not flip while an element straddles a
     *  boundary with one edge either side of it. */
    static String anchorAt(double cx, double cy, int sw, int sh) {
        char h = cx < sw / 3.0 ? 'l' : cx > sw * 2.0 / 3.0 ? 'r' : 'c';
        char v = cy < sh / 3.0 ? 't' : cy > sh * 2.0 / 3.0 ? 'b' : 'm';
        return new String(new char[] { v, h });
    }

    /** The offset, as a percentage, that puts a box of this size at exactly
     *  this pixel against this anchor. Read the three cases beside the three
     *  in {@link #box}: each one is that line solved for {@code ox}. */
    static double[] offsetOf(String anchor, double px, double py, double bw, double bh, int sw, int sh) {
        char vert = anchor.charAt(0);
        char horiz = anchor.charAt(1);
        double ox = horiz == 'l' ? px : horiz == 'r' ? sw - px - bw : px - (sw - bw) / 2.0;
        double oy = vert == 't' ? py : vert == 'b' ? sh - py - bh : py - (sh - bh) / 2.0;
        return new double[] { sw == 0 ? 0 : ox / sw * 100.0, sh == 0 ? 0 : oy / sh * 100.0 };
    }

    /* ── NOTHING SITS ON TOP OF ANYTHING ──────────────────────────────────
       Two elements sent to the same corner used to overlap into an unreadable
       smear. The second one now moves clear of the first — downward, because
       a HUD reads as a column and pushing sideways would walk it off a
       right-hand anchor.

       A BOTTOM ANCHOR PUSHES UPWARD instead: at the bottom of the screen
       "underneath the last one" means further from the edge, not off it. The
       guard bounds the search so a pathological config cannot spin.

       THE EDITOR DOES NOT CALL THIS, and that is deliberate. Stacking is what
       rescues a layout nobody is looking at; while you are dragging, an
       element that jumps out from under the cursor to avoid a neighbour is
       fighting you. The editor shows the overlap, you move it. */
    static Box avoid(Box box, List<Box> placed, boolean upward) {
        Box at = box;
        for (int guard = 0; guard < 16; guard++) {
            Box clash = null;
            for (Box o : placed) { if (at.hits(o)) { clash = o; break; } }
            if (clash == null) break;
            double ny = upward ? clash.y - at.h - Paint.STACK_GAP : clash.y + clash.h + Paint.STACK_GAP;
            at = new Box(at.x, ny, at.w, at.h);
        }
        return at;
    }

    /** keeps a box on screen whatever the config or the drag asked for */
    static Box onScreen(Box b, int sw, int sh) {
        double x = Math.max(0, Math.min(b.x, sw - b.w));
        double y = Math.max(0, Math.min(b.y, sh - b.h));
        return new Box(x, y, b.w, b.h);
    }

    /* ── drawing one element ──────────────────────────────────────────────
       Takes the element's Style rather than a pile of colours, because the
       plate, its transparency and the text tone are one decision made in one
       place and passing them separately is how three of the four end up
       agreeing and the fourth does not. */
    static void draw(DrawContext ctx, TextRenderer tr, List<HudElements.Run> runs,
                     double px, double py, int w, int h, double scale,
                     boolean rounded, HudConfig.Style st) {
        ctx.getMatrices().push();
        ctx.getMatrices().translate(px, py, 0);
        if (scale != 1.0) ctx.getMatrices().scale((float) scale, (float) scale, 1.0f);

        /* NO PLATE IS A REAL CHOICE, not a plate at zero alpha. Turning it
           off skips the outline too — an element with an invisible box and a
           visible 1px frame around it is the worst of both, and it is what
           "remove the background" would have produced if the flag had only
           been wired to the fill. */
        if (st.plate) plate(ctx, w, h, rounded, st);

        int x = Paint.PAD_X;
        for (HudElements.Run r : runs) {
            /* NO SHADOW OVER A PLATE: it already holds the text apart from
               the world, and over a plate a shadow is a smeared second copy
               of every glyph — blur pretending to be depth.

               WITHOUT A PLATE THE SHADOW COMES BACK, because it is the only
               thing left holding white text off snow. That is what vanilla
               does and why it does it; dropping the box is a choice about
               looks, not a licence to be unreadable. */
            ctx.drawText(tr, r.text, x, Paint.PAD_Y,
                HudElements.colourOf(r.role, st), !st.plate);
            x += tr.getWidth(r.text) + Paint.GAP;
        }
        ctx.getMatrices().pop();
    }

    /* ── the plate ─────────────────────────────────────────────────────────
       SHARP IS THE DEFAULT, because Minecraft's own interface is square:
       every vanilla panel, tooltip and inventory slot has a hard corner, so a
       square plate is the one that looks like it belongs on that screen.

       ROUNDED is the same rectangle with its four corner pixels omitted,
       drawn as three fills instead of one. Minecraft has no rounded-rectangle
       primitive, and faking one with a texture would mean shipping an asset
       for a single pixel. */
    static void plate(DrawContext ctx, int w, int h, boolean rounded, HudConfig.Style st) {
        int fill = st.plateArgb();
        int edge = st.edgeArgb();
        if (!rounded) {
            ctx.fill(0, 0, w, h, fill);
            ctx.fill(0, 0, w, 1, edge);
            ctx.fill(0, h - 1, w, h, edge);
            ctx.fill(0, 1, 1, h - 1, edge);
            ctx.fill(w - 1, 1, w, h - 1, edge);
            return;
        }
        ctx.fill(1, 0, w - 1, 1, fill);
        ctx.fill(0, 1, w, h - 1, fill);
        ctx.fill(1, h - 1, w - 1, h, fill);

        ctx.fill(1, 0, w - 1, 1, edge);
        ctx.fill(1, h - 1, w - 1, h, edge);
        ctx.fill(0, 1, 1, h - 1, edge);
        ctx.fill(w - 1, 1, w, h - 1, edge);
    }

    /** a 1px outline around an already-placed box, in screen pixels rather
     *  than the element's own scaled space — an outline that scaled with the
     *  element would be four pixels thick on a 4x element */
    static void outline(DrawContext ctx, Box b, int colour) {
        int x0 = (int) Math.round(b.x), y0 = (int) Math.round(b.y);
        int x1 = (int) Math.round(b.x + b.w), y1 = (int) Math.round(b.y + b.h);
        ctx.fill(x0 - 1, y0 - 1, x1 + 1, y0, colour);
        ctx.fill(x0 - 1, y1, x1 + 1, y1 + 1, colour);
        ctx.fill(x0 - 1, y0, x0, y1, colour);
        ctx.fill(x1, y0, x1 + 1, y1, colour);
    }
}
