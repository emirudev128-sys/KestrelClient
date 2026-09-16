package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.UnaryOperator;

/**
 * THE ELEMENTS TAB: modules on the left, the screen in the middle, settings
 * on the right.
 *
 * <p><b>THE MIDDLE IS THE REAL SCREEN, SMALL.</b> {@link PanelBlur} scales the
 * unblurred frame into the canvas, and every element is drawn over it by the
 * same renderer the world uses, at the position the world would put it. Drag
 * one and it moves with the layout editor's magnet — screen edges, insets, the
 * centre line and every other element's edges — and Alt frees it. The anchor
 * is re-chosen from where it lands, by the third its centre sits in.
 *
 * <p><b>A ROW IS A MODULE, NOT AN ELEMENT.</b> "Armor status" owns five
 * elements and the launcher switches them together; the settings panel steps
 * between them with a Part control instead of listing five rows.
 */
final class ElementsTab {

    private ElementsTab() { }

    /* ── the groups the list is sorted into ─────────────────────────────── */
    private static final String[] ORDER = {
        "fps", "ping", "memory", "cps", "keys", "coords", "day", "clock", "playtime",
        "combo", "reach", "pvp", "totems", "tnt", "helmet", "chest", "legs", "boots", "held", "potion"
    };
    private static final String[] GROUP_NAMES = { "Performance", "Input", "World", "Session", "Combat", "Gear", "Other" };
    private static final int[] GROUP_HUES = {
        Glass.PERFORMANCE, Glass.INPUT, Glass.WORLD, Glass.SESSION, Glass.COMBAT, Glass.GEAR, Glass.OTHER
    };

    static int groupOf(String id) {
        switch (id) {
            case "fps": case "ping": case "memory": return 0;
            case "cps": case "keys": return 1;
            case "coords": case "day": return 2;
            case "clock": case "playtime": return 3;
            case "combo": case "reach": case "pvp": case "totems": case "tnt": return 4;
            case "helmet": case "chest": case "legs": case "boots": case "held": case "potion": return 5;
            default: return 6;
        }
    }

    static int hueOf(String id) {
        return GROUP_HUES[groupOf(id)];
    }

    record Module(String name, List<String> elements, int group) { }

    static List<Module> modules(HudConfig cfg) {
        Map<String, List<String>> by = new LinkedHashMap<>();
        for (String n : cfg.names()) {
            HudConfig.Element el = cfg.get(n);
            if (el == null) continue;
            String mod = el.module.isEmpty() ? el.display(n) : el.module;
            by.computeIfAbsent(mod, k -> new ArrayList<>()).add(n);
        }
        List<Module> out = new ArrayList<>();
        for (Map.Entry<String, List<String>> e : by.entrySet()) {
            out.add(new Module(e.getKey(), e.getValue(), groupOf(e.getValue().get(0))));
        }
        out.sort(Comparator.comparingInt((Module m) -> m.group()).thenComparingInt(m -> rank(m.elements().get(0))));
        return out;
    }

    private static int rank(String id) {
        for (int i = 0; i < ORDER.length; i++) if (ORDER[i].equals(id)) return i;
        return ORDER.length;
    }

    private static Module moduleOf(List<Module> mods, String element) {
        for (Module m : mods) if (m.elements().contains(element)) return m;
        return null;
    }

    /* ── the canvas, measured before the blur needs it ──────────────────── */
    private static float fx, fy, fw, fh, sc;
    private static double originX, originY;
    private static int fitPercent = 100;
    private static String moving;
    private static double lockX = Double.NaN, lockY = Double.NaN;
    private static double guideX = Double.NaN, guideY = Double.NaN;
    private static final Map<String, HudRenderer.Box> BOXES = new LinkedHashMap<>();

    static void prepare(EditorScreen s) {
        float[] c = s.canvas;
        float vx = c[0] + Glass.PAD, vy = c[1] + Glass.PAD_TOP + 26 + 16;
        float vw = c[2] - 2 * Glass.PAD, vh = c[3] - (Glass.PAD_TOP + 26 + 16) - (14 + 10 + 12);
        int sw = s.width, sh = s.height;
        fw = 0;
        if (vw <= 20 || vh <= 20 || sw <= 0 || sh <= 0) return;
        double gs = s.mc().getWindow().getScaleFactor();
        float trueSize = (float) (gs / s.density);
        float fitScale = Math.min(vw / sw, vh / sh);
        fitPercent = Math.round(fitScale / trueSize * 100f);
        if (s.fit) {
            sc = fitScale;
            originX = 0;
            originY = 0;
            fw = sw * sc;
            fh = sh * sc;
        } else {
            sc = trueSize;
            double viewW = vw / sc, viewH = vh / sc;
            if (moving != null && !Double.isNaN(lockX)) {
                originX = lockX;
                originY = lockY;
            } else {
                HudRenderer.Box b = boxOf(s, s.element);
                double cx = b == null ? sw / 2.0 : b.cx(), cy = b == null ? sh / 2.0 : b.cy();
                originX = Math.max(0, Math.min(sw - viewW, cx - viewW / 2));
                originY = Math.max(0, Math.min(sh - viewH, cy - viewH / 2));
            }
            if (viewW >= sw) originX = 0;
            if (viewH >= sh) originY = 0;
            fw = Math.min(vw, sw * sc);
            fh = Math.min(vh, sh * sc);
        }
        fx = vx + (vw - fw) / 2f;
        fy = vy + (vh - fh) / 2f;
        int d = s.density;
        s.miniTarget = new int[] { Math.round(fx * d), Math.round(fy * d), Math.round((fx + fw) * d), Math.round((fy + fh) * d) };
        s.miniSource = new int[] {
            (int) Math.round(originX * gs), (int) Math.round(originY * gs),
            (int) Math.round((originX + fw / sc) * gs), (int) Math.round((originY + fh / sc) * gs)
        };
    }

    private static HudRenderer.Box boxOf(EditorScreen s, String name) {
        HudConfig.Element el = s.config.get(name);
        if (el == null) return null;
        List<List<HudElements.Run>> rows = HudElements.of(name, el, s.mc(), KestrelHudClient.face(s.config), HudElements.SAMPLE);
        if (rows == null || rows.isEmpty()) return null;
        return HudRenderer.box(el, HudRenderer.width(s.tr(), rows), HudRenderer.height(rows), s.width, s.height);
    }

    static void draw(EditorScreen s, DrawContext ctx) {
        List<Module> mods = modules(s.config);
        left(s, ctx, mods);
        canvas(s, ctx);
        inspector(s, ctx, mods);
    }

    /* ── left: the modules ──────────────────────────────────────────────── */
    private static void left(EditorScreen s, DrawContext ctx, List<Module> mods) {
        float x = s.left[0], y = s.left[1], w = s.left[2], h = s.left[3];
        Glass.panel(ctx, x, y, w, h);
        Chrome.heading(s, ctx, "Modules", String.valueOf(mods.size()), x + 20, y + Glass.PAD_TOP, w - 40);

        float fx0 = x + 16, fy0 = y + Glass.PAD_TOP + 12 + 14, fw0 = w - 32, fh0 = 30;
        Glass.box(ctx, fx0, fy0, fw0, fh0, Glass.WELL, s.filterFocus ? Glass.argb(0xE3B439, 70) : Glass.LINE);
        Glass.ring(ctx, fx0 + 12, fy0 + 11, Glass.MUTE);
        float tcy = fy0 + fh0 / 2f;
        if (s.filter.isEmpty() && !s.filterFocus) {
            Type.draw(ctx, s.tr(), Type.VALUE, "filter modules", fx0 + 30, tcy, Glass.MUTE);
        } else {
            float end = Type.draw(ctx, s.tr(), Type.VALUE, s.filter, fx0 + 30, tcy, Glass.INK);
            if (s.filterFocus) Glass.fill(ctx, end + 2, tcy - 7, 1, 14, Glass.INK);
        }
        s.onClick(fx0, fy0, fw0, fh0, () -> s.filterFocus = true);

        float ly = fy0 + fh0 + 6, lh = y + h - 12 - ly;
        float rx = x + 16, rw = w - 32;
        String q = s.filter.trim().toLowerCase(Locale.ROOT);
        s.clipTo(ctx, rx, ly, rw, lh);
        float cursor = ly - s.listScroll;
        boolean any = false;
        for (int g = 0; g < GROUP_NAMES.length; g++) {
            List<Module> in = new ArrayList<>();
            for (Module m : mods) {
                if (m.group() == g && (q.isEmpty() || m.name().toLowerCase(Locale.ROOT).contains(q))) in.add(m);
            }
            if (in.isEmpty()) continue;
            any = true;
            int hue = GROUP_HUES[g];
            cursor += 14;
            Glass.fill(ctx, rx + 4, cursor + 2, 8, 8, hue);
            Type.draw(ctx, s.tr(), Type.CAPS, GROUP_NAMES[g], rx + 22, cursor + 6, Glass.META);
            Type.drawRight(ctx, s.tr(), Type.META, String.valueOf(in.size()), rx + rw - 4, cursor + 6, Glass.MUTE);
            cursor += 12 + 7;
            for (Module m : in) {
                row(s, ctx, m, hue, rx, cursor, rw);
                cursor += Glass.ROW + 5;
            }
        }
        if (!any) {
            Type.draw(ctx, s.tr(), Type.SOFT, Type.fit(s.tr(), Type.SOFT, "No module matches “" + s.filter + "”.", rw - 8),
                rx + 4, ly + 20, Glass.MUTE);
        }
        float content = cursor + s.listScroll - ly;
        s.listScroll = Math.max(0, Math.min(s.listScroll, content - lh + 6));
        s.unclip(ctx);
        s.onWheel(rx, ly, rw, lh, by -> s.listScroll = Math.max(0, s.listScroll + by));
    }

    private static void row(EditorScreen s, DrawContext ctx, Module m, int hue, float x, float y, float w) {
        HudConfig cfg = s.config;
        boolean on = false;
        Map<String, Integer> anchors = new LinkedHashMap<>();
        for (String n : m.elements()) {
            HudConfig.Element el = cfg.get(n);
            if (el == null) continue;
            on |= el.on;
            anchors.merge(el.anchor, 1, Integer::sum);
        }
        String tag = "";
        int best = 0;
        for (Map.Entry<String, Integer> e : anchors.entrySet()) {
            if (e.getValue() > best) { best = e.getValue(); tag = e.getKey(); }
        }
        boolean current = m.elements().contains(s.element);
        boolean hover = s.over(x, y, w - 30, Glass.ROW);
        int fill = !on ? Glass.RAISE : Glass.mix(hue, current ? Glass.TINT * 1.6f : Glass.TINT, hover || current ? Glass.HOVER : Glass.RAISE);
        int edge = !on ? Glass.LINE : Glass.faded(hue, current ? 0.85f : 0.30f);
        Glass.box(ctx, x, y, w, Glass.ROW, fill, edge);
        float cy = y + Glass.ROW / 2f;
        Type.draw(ctx, s.tr(), Type.TAG, tag, x + 12, cy, Glass.MUTE);
        int ink = current || hover ? Glass.INK : on ? Glass.BODY : Glass.MUTE;
        Type.draw(ctx, s.tr(), Type.NAME, Type.fit(s.tr(), Type.NAME, m.name(), w - 12 - 30 - 42), x + 42, cy, ink);
        s.onClick(x, y, w - 30, Glass.ROW, () -> {
            if (!m.elements().contains(s.element)) {
                s.element = m.elements().get(0);
                s.inspScroll = 0;
            }
        });
        final boolean next = !on;
        Chrome.dot(s, ctx, x + w - 15, cy, on, () -> {
            for (String n : m.elements()) {
                HudConfig.Element el = cfg.get(n);
                if (el != null) cfg.put(n, el.switchedTo(next));
            }
            s.change(m.name() + " · " + (next ? "shown" : "hidden"));
            s.click();
        });
    }

    /* ── middle: the screen ─────────────────────────────────────────────── */
    private static void canvas(EditorScreen s, DrawContext ctx) {
        float[] c = s.canvas;
        Glass.panel(ctx, c[0], c[1], c[2], c[3]);
        float hx = c[0] + Glass.PAD, hcy = c[1] + Glass.PAD_TOP + 13;
        float after = Type.draw(ctx, s.tr(), Type.CAPS, "HUD", hx, hcy, Glass.META);
        float right = c[0] + c[2] - Glass.PAD;
        right = pill(s, ctx, "magnet · " + (s.magnet ? "on" : "off"), right, hcy, s.magnet,
            () -> { s.magnet = !s.magnet; s.click(); }) - 14;
        right = pill(s, ctx, "1 : 1", right, hcy, !s.fit, () -> { if (s.fit) { s.fit = false; s.click(); } }) - 14;
        right = pill(s, ctx, "fit · " + fitPercent + "%", right, hcy, s.fit, () -> { if (!s.fit) { s.fit = true; s.click(); } });
        Type.draw(ctx, s.tr(), Type.SOFT,
            Type.fit(s.tr(), Type.SOFT, s.width + " × " + s.height + " · your window", right - after - 28), after + 14, hcy, Glass.MUTE);

        if (fw > 0) {
            Glass.edge(ctx, fx - 1, fy - 1, fw + 2, fh + 2, Glass.LINE_STRONG);
            s.clipTo(ctx, fx, fy, fw, fh);
            for (int i = 1; i <= 2; i++) {
                Glass.fill(ctx, (float) (fx + (s.width * i / 3.0 - originX) * sc), fy, 1, fh, Glass.THIRD);
                Glass.fill(ctx, fx, (float) (fy + (s.height * i / 3.0 - originY) * sc), fw, 1, Glass.THIRD);
            }
            if (moving != null) {
                HudConfig.Element el = s.config.get(moving);
                if (el != null) zone(s, ctx, el.anchor);
            }
            plates(s, ctx);
            HudRenderer.Box sel = boxOf(s, s.element);
            if (sel != null) {
                Glass.edge(ctx, (float) (fx + (sel.x - originX) * sc) - 3, (float) (fy + (sel.y - originY) * sc) - 3,
                    (float) (sel.w * sc) + 6, (float) (sel.h * sc) + 6, Glass.GO);
            }
            if (moving != null) {
                if (!Double.isNaN(guideX)) Glass.fill(ctx, (float) (fx + (guideX - originX) * sc), fy, 1, fh, Glass.GO);
                if (!Double.isNaN(guideY)) Glass.fill(ctx, fx, (float) (fy + (guideY - originY) * sc), fw, 1, Glass.GO);
            }
            s.unclip(ctx);
        }

        float fcy = c[1] + c[3] - 14 - 5;
        float end = hx;
        HudConfig.Element el = s.config.get(s.element);
        if (el != null) {
            end = Type.draw(ctx, s.tr(), Type.META, el.display(s.element), hx, fcy, Glass.BODY);
            end = Type.draw(ctx, s.tr(), Type.META, " · " + Chrome.anchorName(el.anchor) + " · x " + pct(el.x) + " · y " + pct(el.y)
                + " · " + times(el.scale) + (el.on ? "" : " · hidden"), end, fcy, Glass.MUTE);
        }
        String note = "the third its centre sits in picks the anchor";
        float noteX = c[0] + c[2] - Glass.PAD - Type.width(s.tr(), Type.META, note);
        if (noteX > end + 24) Type.draw(ctx, s.tr(), Type.META, note, noteX, fcy, Glass.MUTE);
    }

    private static float pill(EditorScreen s, DrawContext ctx, String text, float right, float cy, boolean pressed, Runnable r) {
        float w = Type.width(s.tr(), Type.PILL, text) + 24, h = 26;
        float x = right - w;
        boolean hover = s.over(x, cy - h / 2f, w, h);
        Glass.box(ctx, x, cy - h / 2f, w, h, Glass.WELL, pressed ? Glass.LINE_STRONG : Glass.LINE);
        Type.draw(ctx, s.tr(), Type.PILL, text, x + 12, cy, pressed ? Glass.INK : hover ? Glass.BODY : Glass.MUTE);
        s.onClick(x, cy - h / 2f, w, h, r);
        return x;
    }

    private static void plates(EditorScreen s, DrawContext ctx) {
        BOXES.clear();
        HudElements.Face face = KestrelHudClient.face(s.config);
        for (String n : s.config.names()) {
            HudConfig.Element el = s.config.get(n);
            if (el == null) continue;
            List<List<HudElements.Run>> rows = HudElements.of(n, el, s.mc(), face, HudElements.SAMPLE);
            if (rows == null || rows.isEmpty()) continue;
            int ew = HudRenderer.width(s.tr(), rows), eh = HudRenderer.height(rows);
            HudRenderer.Box b = HudRenderer.box(el, ew, eh, s.width, s.height);
            if (el.on) BOXES.put(n, b);
            float dx = (float) (fx + (b.x - originX) * sc), dy = (float) (fy + (b.y - originY) * sc);
            float dw = (float) (b.w * sc), dh = (float) (b.h * sc);
            ctx.getMatrices().push();
            ctx.getMatrices().translate(dx, dy, 0f);
            ctx.getMatrices().scale(sc, sc, 1f);
            HudRenderer.draw(ctx, s.tr(), rows, 0, 0, ew, eh, el.scale, s.config.rounded, el.on ? el.style : faded(el.style));
            ctx.getMatrices().pop();
            if (!el.on) Glass.dashed(ctx, dx, dy, dw, dh, Glass.argb(0xF1F4F7, 16));
            final HudRenderer.Box start = b;
            s.onDrag(dx, dy, dw, dh, () -> press(s, n, start));
        }
    }

    private static HudConfig.Style faded(HudConfig.Style st) {
        return new HudConfig.Style(st.plate, st.plateRgb, Math.round(st.plateAlpha * 0.28f),
            st.textRgb, Math.max(8, Math.round(st.textAlpha * 0.28f)));
    }

    private static void zone(EditorScreen s, DrawContext ctx, String anchor) {
        int col = anchor.charAt(1) == 'l' ? 0 : anchor.charAt(1) == 'c' ? 1 : 2;
        int line = anchor.charAt(0) == 't' ? 0 : anchor.charAt(0) == 'm' ? 1 : 2;
        float zx = (float) (fx + (s.width * col / 3.0 - originX) * sc);
        float zy = (float) (fy + (s.height * line / 3.0 - originY) * sc);
        float zw = (float) (s.width / 3.0 * sc), zh = (float) (s.height / 3.0 * sc);
        Glass.fill(ctx, zx, zy, zw, zh, Glass.argb(0xE3B439, 7));
        Type.draw(ctx, s.tr(), Type.CAPS, Chrome.anchorName(anchor), zx + 8, zy + 12, Glass.GO);
    }

    /* ── dragging an element, with the layout editor's magnet ───────────── */
    private static EditorScreen.Drag press(EditorScreen s, String name, HudRenderer.Box start) {
        if (!name.equals(s.element)) {
            s.element = name;
            s.inspScroll = 0;
        }
        final float scale = sc;
        final double ox = originX, oy = originY;
        return new EditorScreen.Drag() {
            float x0 = Float.NaN, y0 = Float.NaN;
            boolean moved;

            @Override
            public void move(float x, float y, boolean alt) {
                if (Float.isNaN(x0)) { x0 = x; y0 = y; return; }
                if (!moved && Math.abs(x - x0) < 2 && Math.abs(y - y0) < 2) return;
                if (!moved) { moved = true; moving = name; lockX = ox; lockY = oy; }
                double wantX = start.x + (x - x0) / scale, wantY = start.y + (y - y0) / scale;
                guideX = Double.NaN;
                guideY = Double.NaN;
                if (s.magnet && !alt) {
                    double[] px = pull(s, wantX, start.w, true, name);
                    double[] py = pull(s, wantY, start.h, false, name);
                    if (!Double.isNaN(px[0])) { wantX = px[0]; guideX = px[1]; }
                    if (!Double.isNaN(py[0])) { wantY = py[0]; guideY = py[1]; }
                }
                HudRenderer.Box b = HudRenderer.onScreen(new HudRenderer.Box(wantX, wantY, start.w, start.h), s.width, s.height);
                String anchor = HudRenderer.anchorAt(b.cx(), b.cy(), s.width, s.height);
                double[] off = HudRenderer.offsetOf(anchor, b.x, b.y, b.w, b.h, s.width, s.height);
                HudConfig.Element el = s.config.get(name);
                if (el != null) s.config.put(name, el.movedTo(anchor, off[0], off[1]));
            }

            @Override
            public void end() {
                if (moved) {
                    HudConfig.Element el = s.config.get(name);
                    if (el != null) {
                        s.change(el.display(name) + " · " + Chrome.anchorName(el.anchor) + ", " + pct(el.x) + " " + pct(el.y));
                    }
                }
                moving = null;
                lockX = Double.NaN;
                lockY = Double.NaN;
                guideX = Double.NaN;
                guideY = Double.NaN;
            }
        };
    }

    /* The old layout editor's magnet, carried over whole: the anchors — flush,
       inset, centre — then every other element's edges, the gap beside it and
       its middle. One axis at a time, nearest inside five GUI pixels. */
    private static double[] pull(EditorScreen s, double want, double size, boolean horizontal, String self) {
        int screen = horizontal ? s.width : s.height;
        double inset = screen * (horizontal ? 2.6 : 4.2) / 100.0;
        double best = Double.NaN, guide = Double.NaN, dist = 5.0;
        double[][] anchors = {
            { 0, 0 }, { screen - size, screen - 1 }, { (screen - size) / 2.0, screen / 2.0 },
            { inset, inset }, { screen - size - inset, screen - inset }
        };
        for (double[] c : anchors) {
            double d = Math.abs(want - c[0]);
            if (d < dist) { dist = d; best = c[0]; guide = c[1]; }
        }
        for (Map.Entry<String, HudRenderer.Box> e : BOXES.entrySet()) {
            if (e.getKey().equals(self)) continue;
            HudRenderer.Box o = e.getValue();
            double lo = horizontal ? o.x : o.y, len = horizontal ? o.w : o.h, hi = lo + len, mid = lo + len / 2.0;
            double[][] cands = {
                { lo, lo }, { hi - size, hi }, { hi + Paint.STACK_GAP, hi }, { lo - size - Paint.STACK_GAP, lo }, { mid - size / 2.0, mid }
            };
            for (double[] c : cands) {
                double d = Math.abs(want - c[0]);
                if (d < dist) { dist = d; best = c[0]; guide = c[1]; }
            }
        }
        return new double[] { best, guide };
    }

    /* ── right: the settings ────────────────────────────────────────────── */
    private static final float HUD_H = 132;

    private static void inspector(EditorScreen s, DrawContext ctx, List<Module> mods) {
        float x = s.insp[0], y = s.insp[1], w = s.insp[2], h = s.insp[3];
        Glass.panel(ctx, x, y, w, h);
        float ah = h - HUD_H - Chrome.CHANGES_H;
        HudConfig.Element el = s.config.get(s.element);
        if (el != null && ah > 40) {
            s.clipTo(ctx, x + 1, y + 1, w - 2, ah - 1);
            float top = y + Glass.PAD_TOP - s.inspScroll;
            float end = settings(s, ctx, el, mods, x + Glass.PAD, top, w - 2 * Glass.PAD);
            float content = end - top + Glass.PAD_TOP * 2;
            s.inspScroll = Math.max(0, Math.min(s.inspScroll, content - ah));
            s.unclip(ctx);
            s.onWheel(x, y, w, ah, by -> s.inspScroll = Math.max(0, s.inspScroll + by));
        }
        hud(s, ctx, x, y + h - HUD_H - Chrome.CHANGES_H, w);
        Chrome.changes(s, ctx, x, y + h - Chrome.CHANGES_H, w);
    }

    private static float settings(EditorScreen s, DrawContext ctx, HudConfig.Element el, List<Module> mods, float x, float y, float w) {
        String n = s.element;
        HudConfig cfg = s.config;
        Module mod = moduleOf(mods, n);
        Chrome.heading(s, ctx, "Element", two(cfg.names().indexOf(n) + 1) + " of " + two(cfg.count()), x, y, w);
        y += 12 + 14;
        float tcy = y + 11;
        Glass.fill(ctx, x, tcy - 5, 10, 10, hueOf(n));
        Type.draw(ctx, s.tr(), Type.TITLE, Type.fit(s.tr(), Type.TITLE, mod == null ? el.display(n) : mod.name(), w - 22), x + 22, tcy, Glass.INK);
        y += 22 + 12;

        if (mod != null && mod.elements().size() > 1) {
            float cy = y + Glass.ROW / 2f;
            Chrome.label(s, ctx, "Part", x, cy);
            String[] parts = mod.elements().toArray(new String[0]);
            Chrome.seg(s, ctx, parts, mod.elements().indexOf(n), x + w, cy, i -> { s.element = parts[i]; s.click(); });
            y += Glass.ROW;
        }

        y = well(s, ctx, el, x, y, w) + 10;
        y = dotRow(s, ctx, "Shown", el.on, x, y, w, () -> {
            HudConfig.Element cur = cfg.get(n);
            cfg.put(n, cur.switchedTo(!cur.on));
            s.change(cur.display(n) + " · " + (cur.on ? "hidden" : "shown"));
            s.click();
        });

        y = sub(s, ctx, "Size and place", x, y, w);
        float cy = y + Glass.ROW / 2f;
        Chrome.label(s, ctx, "Size", x, cy);
        String size = times(el.scale);
        Chrome.chip(s, ctx, size, x + w - Chrome.chipWidth(s, size), cy, Glass.INK);
        y += Glass.ROW + 2;
        final double sizeBefore = el.scale;
        y += Chrome.slider(s, ctx, x, y, w, (el.scale - 0.25) / 3.75, v -> {
            HudConfig.Element cur = cfg.get(n);
            double next = Math.round((0.25 + v * 3.75) * 20) / 20.0;
            if (cur != null && cur.scale != next) cfg.put(n, cur.scaledTo(next));
        }, () -> {
            HudConfig.Element cur = cfg.get(n);
            if (cur != null && cur.scale != sizeBefore) s.change(cur.display(n) + " · size " + times(cur.scale));
        });
        y += 2;
        y += Chrome.ticks(s, ctx, x, y, w, "0.25×", "4×");

        float rowH = 49;
        cy = y + rowH / 2f;
        Chrome.label(s, ctx, "Anchor", x, cy);
        float gridLeft = Chrome.anchors(s, ctx, el.anchor, x + w, cy, a -> {
            HudConfig.Element cur = cfg.get(n);
            if (cur == null) return;
            cfg.put(n, cur.movedTo(a, a.charAt(1) == 'c' ? 0 : 2.6, a.charAt(0) == 'm' ? 0 : 4.2));
            s.change(cur.display(n) + " · anchored " + Chrome.anchorName(a));
            s.click();
        });
        String anchor = Chrome.anchorName(el.anchor);
        Chrome.chip(s, ctx, anchor, gridLeft - 12 - Chrome.chipWidth(s, anchor), cy, Glass.INK);
        y += rowH;

        cy = y + Glass.ROW / 2f;
        Chrome.label(s, ctx, "Offset", x, cy);
        String oy = "y " + pct(el.y), ox = "x " + pct(el.x);
        float chipY = x + w - Chrome.chipWidth(s, oy);
        Chrome.chip(s, ctx, oy, chipY, cy, Glass.INK);
        Chrome.chip(s, ctx, ox, chipY - 6 - Chrome.chipWidth(s, ox), cy, Glass.INK);
        y += Glass.ROW;

        HudConfig.Style st = el.style;
        y = sub(s, ctx, "Box", x, y, w);
        y = dotRow(s, ctx, "Show the box", st.plate, x, y, w,
            () -> restyle(s, n, cur -> cur.withPlate(!cur.plate), st.plate ? "box off" : "box on"));
        y = colour(s, ctx, st.plateRgb, x, y, w, rgb -> restyle(s, n, cur -> cur.withPlateRgb(rgb), "box colour " + hex(rgb)));
        y = opacity(s, ctx, st.plateAlpha, x, y, w, a -> quiet(s, n, cur -> cur.withPlateAlpha(a)),
            () -> "box opacity " + cfg.get(n).style.plateAlpha + "%");

        y = sub(s, ctx, "Text", x, y, w);
        y = colour(s, ctx, st.textRgb, x, y, w, rgb -> restyle(s, n, cur -> cur.withTextRgb(rgb), "text colour " + hex(rgb)));
        y = opacity(s, ctx, st.textAlpha, x, y, w, a -> quiet(s, n, cur -> cur.withTextAlpha(a)),
            () -> "text opacity " + cfg.get(n).style.textAlpha + "%");

        List<String> keys = el.optKeys();
        if (!keys.isEmpty()) {
            y = sub(s, ctx, "This element", x, y, w);
            for (String key : keys) {
                HudConfig.OptSpec spec = cfg.spec(key);
                String label = spec == null ? key : spec.label;
                float ocy = y + Glass.ROW / 2f;
                if (spec != null && spec.isEnum()) {
                    String[] vals = spec.vals.toArray(new String[0]);
                    int now = spec.vals.indexOf(el.choice(key, vals[0]));
                    float segLeft = Chrome.seg(s, ctx, vals, now, x + w, ocy, i -> {
                        HudConfig.Element cur = cfg.get(n);
                        cfg.put(n, cur.withOpt(key, '"' + vals[i] + '"'));
                        s.change(cur.display(n) + " · " + label.toLowerCase(Locale.ROOT) + ": " + vals[i]);
                        s.click();
                    });
                    Chrome.label(s, ctx, Type.fit(s.tr(), Type.LABEL, label, segLeft - x - 12), x, ocy);
                } else {
                    boolean on = el.flag(key);
                    Chrome.label(s, ctx, Type.fit(s.tr(), Type.LABEL, label, w - 40), x, ocy);
                    Chrome.dot(s, ctx, x + w - 5, ocy, on, () -> {
                        HudConfig.Element cur = cfg.get(n);
                        boolean was = cur.flag(key);
                        cfg.put(n, cur.withOpt(key, was ? "false" : "true"));
                        s.change(cur.display(n) + " · " + label.toLowerCase(Locale.ROOT) + ": " + (was ? "off" : "on"));
                        s.click();
                    });
                }
                y += Glass.ROW;
            }
        }
        return y;
    }

    /** the element itself, at true size, in a well */
    private static float well(EditorScreen s, DrawContext ctx, HudConfig.Element el, float x, float y, float w) {
        List<List<HudElements.Run>> rows = HudElements.of(s.element, el, s.mc(), KestrelHudClient.face(s.config), HudElements.SAMPLE);
        float wellH = 60;
        if (rows == null || rows.isEmpty()) {
            Glass.box(ctx, x, y, w, wellH, Glass.WELL, Glass.LINE);
            return y + wellH;
        }
        int ew = HudRenderer.width(s.tr(), rows), eh = HudRenderer.height(rows);
        float k = (float) (s.mc().getWindow().getScaleFactor() / s.density);
        if (ew * k > w - 28) k = (w - 28) / ew;
        wellH = Math.max(60, eh * k + 28);
        Glass.box(ctx, x, y, w, wellH, Glass.WELL, Glass.LINE);
        ctx.getMatrices().push();
        ctx.getMatrices().translate(x + (w - ew * k) / 2f, y + (wellH - eh * k) / 2f, 0f);
        ctx.getMatrices().scale(k, k, 1f);
        HudRenderer.draw(ctx, s.tr(), rows, 0, 0, ew, eh, 1.0, s.config.rounded, el.style);
        ctx.getMatrices().pop();
        return y + wellH;
    }

    private static float sub(EditorScreen s, DrawContext ctx, String caps, float x, float y, float w) {
        y += 18;
        Chrome.heading(s, ctx, caps, null, x, y, w);
        return y + 12 + 6;
    }

    private static float dotRow(EditorScreen s, DrawContext ctx, String label, boolean on, float x, float y, float w, Runnable flip) {
        float cy = y + Glass.ROW / 2f;
        Chrome.label(s, ctx, label, x, cy);
        Chrome.dot(s, ctx, x + w - 5, cy, on, flip);
        return y + Glass.ROW;
    }

    private static float colour(EditorScreen s, DrawContext ctx, int rgb, float x, float y, float w,
                                java.util.function.IntConsumer pick) {
        float cy = y + Glass.ROW / 2f;
        Chrome.label(s, ctx, "Colour", x, cy);
        String h = hex(rgb);
        Chrome.chip(s, ctx, h, x + w - Chrome.chipWidth(s, h), cy, Glass.INK);
        y += Glass.ROW + 4;
        float size = Chrome.swatches(s, ctx, x, y, w, rgb, pick);
        return y + size + 10;
    }

    private static float opacity(EditorScreen s, DrawContext ctx, int alpha, float x, float y, float w,
                                 java.util.function.IntConsumer set, java.util.function.Supplier<String> logged) {
        float cy = y + Glass.ROW / 2f;
        Chrome.label(s, ctx, "Opacity", x, cy);
        String v = alpha + "%";
        Chrome.chip(s, ctx, v, x + w - Chrome.chipWidth(s, v), cy, Glass.INK);
        y += Glass.ROW + 2;
        final int before = alpha;
        y += Chrome.slider(s, ctx, x, y, w, alpha / 100.0, d -> set.accept((int) Math.round(d * 100)), () -> {
            String text = logged.get();
            if (!text.endsWith(" " + before + "%")) s.change(s.config.get(s.element).display(s.element) + " · " + text);
        });
        y += 2;
        return y + Chrome.ticks(s, ctx, x, y, w, "0%", "100%");
    }

    private static void restyle(EditorScreen s, String n, UnaryOperator<HudConfig.Style> op, String what) {
        HudConfig.Element cur = s.config.get(n);
        if (cur == null) return;
        s.config.put(n, cur.styled(op.apply(cur.style)));
        s.change(cur.display(n) + " · " + what);
        s.click();
    }

    private static void quiet(EditorScreen s, String n, UnaryOperator<HudConfig.Style> op) {
        HudConfig.Element cur = s.config.get(n);
        if (cur == null) return;
        HudConfig.Style next = op.apply(cur.style);
        if (next.plateAlpha != cur.style.plateAlpha || next.textAlpha != cur.style.textAlpha) s.config.put(n, cur.styled(next));
    }

    /* ── the whole-HUD choices ──────────────────────────────────────────── */
    private static void hud(EditorScreen s, DrawContext ctx, float x, float y, float w) {
        HudConfig cfg = s.config;
        Glass.fill(ctx, x + 1, y, w - 2, 1, Glass.LINE);
        float px = x + Glass.PAD, pw = w - 2 * Glass.PAD;
        Chrome.heading(s, ctx, "HUD", "rev " + cfg.revision(), px, y + Glass.PAD_TOP, pw);
        float cy = y + Glass.PAD_TOP + 12 + Glass.ROW / 2f;
        int on = 0;
        for (String n : cfg.names()) { HudConfig.Element e = cfg.get(n); if (e != null && e.on) on++; }
        Chrome.label(s, ctx, "Elements on", px, cy);
        Type.drawRight(ctx, s.tr(), Type.FIGURE, on + " of " + cfg.count(), px + pw, cy, Glass.INK);
        cy += Glass.ROW;
        Chrome.label(s, ctx, "Corners", px, cy);
        Chrome.seg(s, ctx, new String[] { "sharp", "rounded" }, cfg.rounded ? 1 : 0, px + pw, cy, i -> {
            cfg.rounded = i == 1;
            cfg.touch();
            s.change("HUD · corners " + (cfg.rounded ? "rounded" : "sharp"));
            s.click();
        });
        cy += Glass.ROW;
        Chrome.label(s, ctx, "Font", px, cy);
        Chrome.seg(s, ctx, new String[] { "minecraft", "kestrel" }, cfg.kestrelFont ? 1 : 0, px + pw, cy, i -> {
            cfg.kestrelFont = i == 1;
            cfg.touch();
            s.change("HUD · font " + (cfg.kestrelFont ? "kestrel" : "minecraft"));
            s.click();
        });
    }

    /* ── formatting ─────────────────────────────────────────────────────── */
    static String two(int n) {
        return (n < 10 ? "0" : "") + n;
    }

    static String pct(double v) {
        return String.format(Locale.ROOT, "%.1f%%", v);
    }

    static String times(double v) {
        return String.format(Locale.ROOT, "%.2f×", v);
    }

    static String hex(int rgb) {
        return String.format(Locale.ROOT, "#%06X", rgb & 0xFFFFFF);
    }
}
