package dev.kestrel.hud;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.DrawContext;

import java.util.List;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.IntConsumer;

/**
 * THE BARS AND THE CONTROLS BOTH TABS SHARE.
 *
 * <p>Every control here draws itself AND records where it can be pressed, in
 * the same call, so the two can never disagree. Sizes are the mockup's doubled:
 * a keycap is 22 tall, a value chip 24, a segmented choice 22, the on/off
 * square 10 with a 26-pixel target around it.
 */
final class Chrome {

    private Chrome() { }

    static final int[] PALETTE = {
        0xF1F4F7, 0xCDCFD3, 0x929497, 0xE3B439,
        0x0A0E13, 0xFF5555, 0xFFAA00, 0xFFFF55,
        0x55FF55, 0x55FFFF, 0x5555FF, 0xFF55FF,
        0xAA00AA, 0x00AA00
    };

    /* ── the top bar ────────────────────────────────────────────────────── */
    static void top(EditorScreen s, DrawContext ctx) {
        float x = s.top[0], y = s.top[1], w = s.top[2], h = s.top[3];
        float cy = y + h / 2f;
        Glass.panel(ctx, x, y, w, h);

        /* the mark, the word, and the file this menu edits */
        float mx = x + 22;
        Glass.edge(ctx, mx, cy - 8, 16, 16, Glass.INK);
        Glass.fill(ctx, mx + 8, cy + 0, 5, 5, Glass.GO);
        float after = Type.draw(ctx, s.tr(), Type.WORD, "Kestrel", mx + 34, cy, Glass.INK);
        float sep = after + 18;
        Glass.fill(ctx, sep, y + 16, 1, h - 32, Glass.LINE);
        HudConfig cfg = s.config;
        int on = 0;
        for (String n : cfg.names()) { HudConfig.Element e = cfg.get(n); if (e != null && e.on) on++; }
        int fon = 0;
        for (String id : cfg.featureNames()) { Feature f = cfg.feature(id); if (f != null && f.on) fon++; }
        Type.draw(ctx, s.tr(), Type.FILE, "kestrel-hud.json", sep + 18, cy - 7, Glass.INK);
        Type.draw(ctx, s.tr(), Type.META, "rev " + cfg.revision() + " · " + on + " of " + cfg.count()
            + " elements on · " + fon + " of " + cfg.featureNames().size() + " features", sep + 18, cy + 10, Glass.MUTE);

        /* THE TABS ARE CENTRED ON THE BAR, whatever sits either side of them */
        String[] tabs = { "Elements", "Features" };
        float gap = 40;
        float total = gap;
        for (String t : tabs) total += Type.width(s.tr(), Type.TAB, t);
        float tx = x + (w - total) / 2f;
        for (int i = 0; i < tabs.length; i++) {
            float tw = Type.width(s.tr(), Type.TAB, tabs[i]);
            boolean selected = (i == 1) == s.onFeatures;
            boolean hover = s.over(tx - 10, y, tw + 20, h);
            Type.draw(ctx, s.tr(), Type.TAB, tabs[i], tx, cy, selected ? Glass.INK : hover ? Glass.BODY : Glass.META);
            if (selected) Glass.fill(ctx, tx, y + h - 17, tw, 3, Glass.GO);
            final boolean features = i == 1;
            s.onClick(tx - 10, y, tw + 20, h, () -> {
                if (s.onFeatures != features) { s.onFeatures = features; s.click(); }
            });
            tx += tw + gap;
        }

        /* DONE, and the key that opens this, to its left */
        float textW = Type.width(s.tr(), Type.PRIMARY, "Done");
        float bw = 20 + 12 + 10 + textW + 20, bh = 34;
        float bx = x + w - 22 - bw, by = cy - bh / 2f;
        boolean hoverDone = s.over(bx, by, bw, bh);
        Glass.box(ctx, bx, by, bw, bh, Glass.argb(0xE3B439, hoverDone ? 22 : 12), Glass.argb(0xE3B439, 70));
        Glass.tick(ctx, bx + 20, cy - 4, Glass.GO);
        Type.draw(ctx, s.tr(), Type.PRIMARY, "Done", bx + 42, cy, Glass.GO);
        s.onClick(bx, by, bw, bh, s::close);

        String key = KestrelHudClient.menuKeyLabel();
        float capsW = Type.width(s.tr(), Type.CAPS, "Menu");
        float keyW = Type.width(s.tr(), Type.KEY, key) + 16;
        float gw = 14 + capsW + 12 + keyW + 6;
        float gx = bx - 12 - gw;
        Glass.box(ctx, gx, by, gw, bh, Glass.WELL, Glass.LINE);
        Type.draw(ctx, s.tr(), Type.CAPS, "Menu", gx + 14, cy, Glass.META);
        kcap(s, ctx, key, gx + 14 + capsW + 12, cy, false);
    }

    /* ── the hint bar ───────────────────────────────────────────────────── */
    static void bottom(EditorScreen s, DrawContext ctx) {
        float x = s.bottom[0], y = s.bottom[1], w = s.bottom[2], h = s.bottom[3];
        float cy = y + h / 2f;
        Glass.panel(ctx, x, y, w, h);
        String[][] hints = s.rebinding
            ? new String[][] { { "any key", "sets it" }, { "backspace", "clears it" }, { "esc", "cancels" } }
            : s.onFeatures
                ? new String[][] { { "click", "select" }, { "backspace", "clears a key while changing" }, { "esc", "save and close" } }
                : new String[][] { { "click", "select" }, { "drag", "move" }, { "alt", "free placement" }, { "esc", "save and close" } };
        float hx = x + 16;
        for (String[] hint : hints) {
            hx += kcap(s, ctx, hint[0], hx, cy, false) + 10;
            hx = Type.draw(ctx, s.tr(), Type.HINT, hint[1], hx, cy, Glass.MUTE) + 26;
        }
        String version = FabricLoader.getInstance().getModContainer(KestrelHudClient.MOD_ID)
            .map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("");
        String status = "saves to this instance · kestrel-hud " + version;
        float sx = Type.drawRight(ctx, s.tr(), Type.PILL, status, x + w - 16, cy, Glass.META);
        Glass.fill(ctx, sx - 10 - 7, cy - 3.5f, 7, 7, Glass.SAVED);
    }

    /* ── the change log, the last section of both inspectors ─────────────── */
    static final float CHANGES_H = 148;

    static void changes(EditorScreen s, DrawContext ctx, float x, float y, float w) {
        Glass.fill(ctx, x + 1, y, w - 2, 1, Glass.LINE);
        float px = x + Glass.PAD, pw = w - 2 * Glass.PAD;
        float hy = y + Glass.PAD_TOP;
        Type.draw(ctx, s.tr(), Type.CAPS, "Changes", px, hy + 6, Glass.META);
        float clearW = Type.width(s.tr(), Type.META, "clear");
        boolean hover = s.over(px + pw - clearW - 6, hy - 4, clearW + 12, 20);
        Type.drawRight(ctx, s.tr(), Type.META, "clear", px + pw, hy + 6, hover ? Glass.BODY : Glass.MUTE);
        s.onClick(px + pw - clearW - 6, hy - 4, clearW + 12, 20, s.changes::clear);

        List<String[]> log = s.changes;
        float ly = hy + 12 + 16;
        int from = Math.max(0, log.size() - 5);
        if (log.isEmpty()) {
            Type.draw(ctx, s.tr(), Type.META, "nothing changed yet", px, ly, Glass.MUTE);
            return;
        }
        for (int i = from; i < log.size(); i++) {
            String[] line = log.get(i);
            float tx = Type.draw(ctx, s.tr(), Type.META, line[0], px, ly, Glass.MUTE) + 14;
            Type.draw(ctx, s.tr(), Type.META, Type.fit(s.tr(), Type.META, line[1], px + pw - tx), tx, ly, Glass.META);
            ly += 19.5f;
        }
    }

    /** a section's caps heading, with an optional figure on the right */
    static void heading(EditorScreen s, DrawContext ctx, String caps, String right, float x, float y, float w) {
        Type.draw(ctx, s.tr(), Type.CAPS, caps, x, y + 6, Glass.META);
        if (right != null) Type.drawRight(ctx, s.tr(), Type.META, right, x + w, y + 6, Glass.MUTE);
    }

    /** a settings row's label */
    static void label(EditorScreen s, DrawContext ctx, String text, float x, float cy) {
        Type.draw(ctx, s.tr(), Type.LABEL, text, x, cy, Glass.BODY);
    }

    /* ── controls ───────────────────────────────────────────────────────── */

    /** a key, drawn as a key; returns its width */
    static float kcap(EditorScreen s, DrawContext ctx, String text, float x, float cy, boolean lit) {
        float w = Type.width(s.tr(), Type.KEY, text) + 16;
        Glass.box(ctx, x, cy - 11, w, 22, lit ? Glass.argb(0xE3B439, 10) : Glass.KEYCAP,
            lit ? Glass.GO : Glass.LINE_STRONG);
        Type.draw(ctx, s.tr(), Type.KEY, text, x + 8, cy, lit ? Glass.GO : Glass.INK);
        return w;
    }

    /** a value in a well; returns its width */
    static float chip(EditorScreen s, DrawContext ctx, String text, float x, float cy, int ink) {
        float w = Type.width(s.tr(), Type.VALUE, text) + 20;
        Glass.box(ctx, x, cy - 12, w, 24, Glass.WELL, Glass.LINE_STRONG);
        Type.draw(ctx, s.tr(), Type.VALUE, text, x + 10, cy, ink);
        return w;
    }

    static float chipWidth(EditorScreen s, String text) {
        return Type.width(s.tr(), Type.VALUE, text) + 20;
    }

    /** a value in a well that does something when pressed; returns its width */
    static float chipButton(EditorScreen s, DrawContext ctx, String text, float x, float cy, int ink, Runnable r) {
        float w = chipWidth(s, text);
        boolean hover = s.over(x, cy - 12, w, 24);
        Glass.box(ctx, x, cy - 12, w, 24, Glass.WELL, hover ? Glass.GO : Glass.LINE_STRONG);
        Type.draw(ctx, s.tr(), Type.VALUE, text, x + 10, cy, ink);
        s.onClick(x, cy - 12, w, 24, r);
        return w;
    }

    /** one of several, right-aligned; returns the left edge */
    static float seg(EditorScreen s, DrawContext ctx, String[] labels, int selected, float right, float cy, IntConsumer pick) {
        float total = 0;
        float[] widths = new float[labels.length];
        for (int i = 0; i < labels.length; i++) {
            widths[i] = Type.width(s.tr(), Type.VALUE, labels[i]) + 20;
            total += widths[i];
        }
        float x = right - total, y = cy - 11;
        Glass.fill(ctx, x, y, total, 22, Glass.WELL);
        float cx = x;
        for (int i = 0; i < labels.length; i++) {
            boolean on = i == selected;
            boolean hover = s.over(cx, y, widths[i], 22);
            if (on) Glass.fill(ctx, cx, y, widths[i], 22, Glass.PRESSED_SEG);
            if (i > 0) Glass.fill(ctx, cx, y, 1, 22, Glass.LINE);
            Type.draw(ctx, s.tr(), Type.VALUE, labels[i], cx + 10, cy, on ? Glass.INK : hover ? Glass.BODY : Glass.MUTE);
            final int index = i;
            s.onClick(cx, y, widths[i], 22, () -> { if (index != selected) pick.accept(index); });
            cx += widths[i];
        }
        Glass.edge(ctx, x, y, total, 22, Glass.LINE);
        return x;
    }

    /** on/off: the square, with a target bigger than what you can see */
    static void dot(EditorScreen s, DrawContext ctx, float cx, float cy, boolean on, Runnable flip) {
        boolean hover = s.over(cx - 13, cy - 13, 26, 26);
        Glass.dot(ctx, cx, cy, on, hover);
        s.onClick(cx - 13, cy - 13, 26, 26, flip);
    }

    /** a one-pixel-thick slider that fills in amber; returns its height */
    static float slider(EditorScreen s, DrawContext ctx, float x, float y, float w, double value,
                        DoubleConsumer set, Runnable done) {
        float v = (float) Math.max(0, Math.min(1, value));
        float ty = y + 8;
        Glass.fill(ctx, x, ty, w * v, 2, Glass.GO);
        Glass.fill(ctx, x + w * v, ty, w - w * v, 2, Glass.LINE_STRONG);
        Glass.fill(ctx, Math.round(x + w * v) - 1, ty - 6, 3, 14, Glass.INK);
        s.onDrag(x - 6, y - 2, w + 12, 20, () -> new EditorScreen.Drag() {
            @Override
            public void move(float px, float py, boolean alt) {
                set.accept(Math.max(0, Math.min(1, (px - x) / w)));
            }

            @Override
            public void end() {
                done.run();
            }
        });
        return 18;
    }

    /** the two ends of a slider's scale; returns its height */
    static float ticks(EditorScreen s, DrawContext ctx, float x, float y, float w, String lo, String hi) {
        Type.draw(ctx, s.tr(), Type.TICK, lo, x, y + 5, Glass.MUTE);
        Type.drawRight(ctx, s.tr(), Type.TICK, hi, x + w, y + 5, Glass.MUTE);
        return 12;
    }

    /** fourteen colours across the column; returns the swatch size */
    static float swatches(EditorScreen s, DrawContext ctx, float x, float y, float w, int selectedRgb, IntConsumer pick) {
        int n = PALETTE.length;
        float size = (float) Math.floor((w - (n - 1) * 4) / n);
        for (int i = 0; i < n; i++) {
            float sx = x + i * (size + 4);
            Glass.fill(ctx, sx, y, size, size, 0xFF000000 | PALETTE[i]);
            Glass.edge(ctx, sx, y, size, size, Glass.argb(0xF1F4F7, 22));
            if ((selectedRgb & 0xFFFFFF) == PALETTE[i]) Glass.edge(ctx, sx - 3, y - 3, size + 6, size + 6, Glass.INK);
            final int rgb = PALETTE[i];
            s.onClick(sx - 2, y - 2, size + 4, size + 4, () -> pick.accept(rgb));
        }
        return size;
    }

    static final String[] ANCHORS = { "tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br" };

    /** the nine anchors as a grid, right-aligned; returns its left edge */
    static float anchors(EditorScreen s, DrawContext ctx, String current, float right, float cy, Consumer<String> pick) {
        float cell = 13, gap = 3, size = cell * 3 + gap * 2;
        float x0 = right - size, y0 = cy - size / 2f;
        for (int i = 0; i < 9; i++) {
            float cx = x0 + (i % 3) * (cell + gap), cyy = y0 + (i / 3) * (cell + gap);
            boolean on = ANCHORS[i].equals(current);
            boolean hover = s.over(cx, cyy, cell, cell);
            if (on) Glass.fill(ctx, cx, cyy, cell, cell, Glass.GO);
            else Glass.edge(ctx, cx, cyy, cell, cell, hover ? Glass.BODY : Glass.LINE_STRONG);
            final String a = ANCHORS[i];
            s.onClick(cx, cyy, cell, cell, () -> { if (!a.equals(current)) pick.accept(a); });
        }
        return x0;
    }

    static String anchorName(String a) {
        switch (a) {
            case "tl": return "top left";
            case "tc": return "top centre";
            case "tr": return "top right";
            case "ml": return "middle left";
            case "mc": return "centre";
            case "mr": return "middle right";
            case "bl": return "bottom left";
            case "bc": return "bottom centre";
            case "br": return "bottom right";
            default: return a;
        }
    }
}
