package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;

/**
 * THE MENU'S SURFACES AND MEASUREMENTS.
 *
 * <p>Every value here was settled in the browser mockup first and is copied
 * rather than re-argued. Lengths are DESIGN PIXELS: one screen pixel on a
 * 1080p display, and exactly the mockup's units doubled, so a number in the
 * mockup's tuning panel maps to a number here by multiplying by two.
 *
 * <p><b>HAIRLINES AND SQUARE CORNERS.</b> The earlier menu separated surfaces
 * by transparency alone and rounded everything; the player chose the opposite
 * for this one. Every panel, row, chip and keycap carries a one-pixel edge,
 * and nothing is rounded. The alphas under those edges are still the ones the
 * player dialled in game: panel 43%, rows 37%, hovered 63%, wells 46%.
 *
 * <p><b>ON/OFF IS A SQUARE.</b> No track, no word, no border: amber when on,
 * dim when off. Chosen from four designs in the mockup.
 */
final class Glass {

    private Glass() { }

    /* ── the frame ──────────────────────────────────────────────────────── */
    static final int MARGIN = 32;     /* screen edge to every panel */
    static final int GUTTER = 20;     /* between two panels */
    static final int TOP = 64;        /* the top bar */
    static final int BOTTOM = 36;     /* the hint bar */
    static final int LEFT_W = 328;    /* the module list */
    static final int RIGHT_W = 384;   /* the settings panel */
    static final int ROW = 28;        /* a list row, a settings row */
    static final int PAD = 20;        /* inside a panel, sideways */
    static final int PAD_TOP = 18;    /* inside a panel, from the top */

    /* ── ink ────────────────────────────────────────────────────────────── */
    static final int INK = 0xFFF1F4F7;
    static final int BODY = 0xFFCDCFD3;
    static final int META = 0xFF929497;
    static final int MUTE = 0xFF7A7D81;
    static final int GO = 0xFFE3B439;       /* the one warm thing: selection, on, primary */
    static final int GO_HI = 0xFFF5C64E;
    static final int SAVED = 0xFF6FB35A;    /* status, not an accent */
    static final int CLASH = 0xFFD9806E;

    /* ── surfaces ───────────────────────────────────────────────────────── */
    static final int PANEL = argb(0x12151B, 43);
    static final int RAISE = argb(0x1B1F25, 37);
    static final int HOVER = argb(0x25292E, 63);
    static final int WELL = argb(0x040609, 46);
    static final int LINE = argb(0xF1F4F7, 10);
    static final int LINE_STRONG = argb(0xF1F4F7, 22);
    static final int THIRD = argb(0xF1F4F7, 7);
    static final int PRESSED_SEG = argb(0xF1F4F7, 9);
    static final int KEYCAP = argb(0xF1F4F7, 5);
    static final float TINT = 14f;          /* a group's colour in its rows, percent */

    /* ── the groups: muted, and kept away from amber ─────────────────────── */
    static final int PERFORMANCE = 0xFF78A6D6;
    static final int INPUT = 0xFFA792DB;
    static final int WORLD = 0xFF86B36F;
    static final int SESSION = 0xFF5DB5AE;
    static final int COMBAT = 0xFFD9806E;
    static final int GEAR = 0xFFC98BBE;
    static final int OTHER = 0xFF929497;

    static int argb(int rgb, int percent) {
        return (Math.round(percent * 2.55f) << 24) | (rgb & 0xFFFFFF);
    }

    /** the same colour at a fraction of its alpha */
    static int faded(int argb, float f) {
        int a = Math.max(4, Math.round(((argb >>> 24) & 0xFF) * f));
        return (a << 24) | (argb & 0xFFFFFF);
    }

    /** CSS color-mix(in srgb, top pct%, under), alpha included — what the mockup's rows use */
    static int mix(int top, float pct, int under) {
        float p = Math.max(0f, Math.min(1f, pct / 100f));
        float at = ((top >>> 24) & 0xFF) / 255f, au = ((under >>> 24) & 0xFF) / 255f;
        float a = p * at + (1f - p) * au;
        if (a <= 0f) return 0;
        int r = channel(top, under, 16, p, at, au, a);
        int g = channel(top, under, 8, p, at, au, a);
        int b = channel(top, under, 0, p, at, au, a);
        return (Math.round(a * 255f) << 24) | (r << 16) | (g << 8) | b;
    }

    private static int channel(int top, int under, int shift, float p, float at, float au, float a) {
        float ct = (top >> shift) & 0xFF, cu = (under >> shift) & 0xFF;
        return Math.max(0, Math.min(255, Math.round((p * at * ct + (1f - p) * au * cu) / a)));
    }

    static void fill(DrawContext ctx, float x, float y, float w, float h, int argb) {
        if (w <= 0 || h <= 0) return;
        ctx.fill(Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h), argb);
    }

    /** a one-pixel edge inside the rectangle, with no corner drawn twice */
    static void edge(DrawContext ctx, float x, float y, float w, float h, int argb) {
        int x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
        if (x1 - x0 < 2 || y1 - y0 < 2) return;
        ctx.fill(x0, y0, x1, y0 + 1, argb);
        ctx.fill(x0, y1 - 1, x1, y1, argb);
        ctx.fill(x0, y0 + 1, x0 + 1, y1 - 1, argb);
        ctx.fill(x1 - 1, y0 + 1, x1, y1 - 1, argb);
    }

    static void box(DrawContext ctx, float x, float y, float w, float h, int fill, int edge) {
        fill(ctx, x, y, w, h, fill);
        edge(ctx, x, y, w, h, edge);
    }

    static void panel(DrawContext ctx, float x, float y, float w, float h) {
        box(ctx, x, y, w, h, PANEL, LINE);
    }

    /** two on, two off — for an element that is switched off but still placeable */
    static void dashed(DrawContext ctx, float x, float y, float w, float h, int argb) {
        int x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
        for (int i = x0; i < x1; i += 4) {
            ctx.fill(i, y0, Math.min(i + 2, x1), y0 + 1, argb);
            ctx.fill(i, y1 - 1, Math.min(i + 2, x1), y1, argb);
        }
        for (int j = y0; j < y1; j += 4) {
            ctx.fill(x0, j, x0 + 1, Math.min(j + 2, y1), argb);
            ctx.fill(x1 - 1, j, x1, Math.min(j + 2, y1), argb);
        }
    }

    /** on/off: a ten-pixel square centred on the point */
    static void dot(DrawContext ctx, float cx, float cy, boolean on, boolean hover) {
        int c = on ? (hover ? GO_HI : GO) : argb(0xF1F4F7, hover ? 42 : 24);
        fill(ctx, Math.round(cx) - 5, Math.round(cy) - 5, 10, 10, c);
    }

    /* ── two small marks, drawn from pixels ──────────────────────────────── */
    private static final String[] RING = {
        "..####..",
        ".#....#.",
        "#......#",
        "#......#",
        "#......#",
        "#......#",
        ".#....#.",
        "..####.."
    };

    /** the filter field's search mark */
    static void ring(DrawContext ctx, float x, float y, int argb) {
        stamp(ctx, RING, Math.round(x), Math.round(y), argb);
    }

    private static final String[] TICK = {
        "..........##",
        ".........##.",
        "........##..",
        ".......##...",
        "##....##....",
        ".##..##.....",
        "..####......",
        "...##......."
    };

    /** DONE's check mark */
    static void tick(DrawContext ctx, float x, float y, int argb) {
        stamp(ctx, TICK, Math.round(x), Math.round(y), argb);
    }

    private static void stamp(DrawContext ctx, String[] rows, int x, int y, int argb) {
        for (int j = 0; j < rows.length; j++) {
            String r = rows[j];
            int i = 0;
            while (i < r.length()) {
                if (r.charAt(i) != '#') { i++; continue; }
                int s = i;
                while (i < r.length() && r.charAt(i) == '#') i++;
                ctx.fill(x + s, y + j, x + i, y + j + 1, argb);
            }
        }
    }
}
