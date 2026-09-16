package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * THE FEATURES TAB. A feature is on or off, a key, and its own options — no
 * anchor, no colour, no scale — so the middle of the screen reads each one as
 * the rule it is: WHEN [V] PRESSED, TOGGLE SPRINT; WHILE [C] HELD, ZOOM [4x].
 *
 * <p><b>A KEY CHANGED HERE IS CHANGED IN THE GAME.</b> The binding is
 * Minecraft's own ({@link Behaviours}), so it is rebound there and written to
 * options.txt as well as to the document — otherwise Minecraft would load its
 * remembered key over this one at the next launch.
 */
final class FeaturesTab {

    private FeaturesTab() { }

    private static final String[] GROUP_NAMES = { "Movement", "View", "World", "Other" };
    private static final int[] GROUP_HUES = { Glass.INPUT, Glass.PERFORMANCE, Glass.WORLD, Glass.OTHER };

    private static int groupOf(String id) {
        switch (id) {
            case "sprint": case "sneak": case "snaplook": return 0;
            case "zoom": return 1;
            case "hitbox": case "chunks": return 2;
            default: return 3;
        }
    }

    /** pressed, held, or no key at all */
    private static String verb(String id) {
        switch (id) {
            case "zoom": return "held";
            case "hitbox": case "chunks": return "always";
            default: return "pressed";
        }
    }

    private static String action(Feature f) {
        switch (f.id) {
            case "sprint": return "Toggle sprint";
            case "sneak": return "Toggle sneak";
            case "snaplook": return "Turn";
            case "zoom": return "Zoom";
            case "hitbox": return "Outline entities";
            case "chunks": return "Draw chunk edges";
            default: return f.label;
        }
    }

    private static String keyOf(Feature f) {
        return Behaviours.boundName(f.id, f.key);
    }

    static String keyName(String glfw) {
        String k = glfw.startsWith("KEY_") ? glfw.substring(4) : glfw;
        return k.replace('_', ' ');
    }

    private static List<Feature> features(HudConfig cfg) {
        List<Feature> out = new ArrayList<>();
        for (String id : cfg.featureNames()) {
            Feature f = cfg.feature(id);
            if (f != null) out.add(f);
        }
        return out;
    }

    static void setKey(EditorScreen s, String name) {
        Feature f = s.config.feature(s.feature);
        if (f == null) return;
        s.config.putFeature(f.id, f.withKey(name));
        Behaviours.rebind(s.mc(), f.id, name);
        s.change(f.label + " · key " + (name.isEmpty() ? "cleared" : keyName(name)));
        s.click();
    }

    static void draw(EditorScreen s, DrawContext ctx) {
        List<Feature> all = features(s.config);
        left(s, ctx, all);
        rules(s, ctx, all);
        inspector(s, ctx, all);
    }

    /* ── left ───────────────────────────────────────────────────────────── */
    private static void left(EditorScreen s, DrawContext ctx, List<Feature> all) {
        float x = s.left[0], y = s.left[1], w = s.left[2], h = s.left[3];
        Glass.panel(ctx, x, y, w, h);
        Chrome.heading(s, ctx, "Features", String.valueOf(all.size()), x + 20, y + Glass.PAD_TOP, w - 40);
        float rx = x + 16, rw = w - 32, cursor = y + Glass.PAD_TOP + 12;
        for (int g = 0; g < GROUP_NAMES.length; g++) {
            List<Feature> in = new ArrayList<>();
            for (Feature f : all) if (groupOf(f.id) == g) in.add(f);
            if (in.isEmpty()) continue;
            cursor += 14;
            Glass.fill(ctx, rx + 4, cursor + 2, 8, 8, GROUP_HUES[g]);
            Type.draw(ctx, s.tr(), Type.CAPS, GROUP_NAMES[g], rx + 22, cursor + 6, Glass.META);
            Type.drawRight(ctx, s.tr(), Type.META, String.valueOf(in.size()), rx + rw - 4, cursor + 6, Glass.MUTE);
            cursor += 12 + 7;
            for (Feature f : in) {
                row(s, ctx, f, GROUP_HUES[g], rx, cursor, rw);
                cursor += Glass.ROW + 5;
            }
        }
    }

    private static void row(EditorScreen s, DrawContext ctx, Feature f, int hue, float x, float y, float w) {
        boolean current = f.id.equals(s.feature);
        boolean hover = s.over(x, y, w - 30, Glass.ROW);
        int fill = !f.on ? Glass.RAISE : Glass.mix(hue, current ? Glass.TINT * 1.6f : Glass.TINT, hover || current ? Glass.HOVER : Glass.RAISE);
        int edge = !f.on ? Glass.LINE : Glass.faded(hue, current ? 0.85f : 0.30f);
        Glass.box(ctx, x, y, w, Glass.ROW, fill, edge);
        float cy = y + Glass.ROW / 2f;
        String key = keyOf(f);
        String tag = "always".equals(verb(f.id)) ? "··" : key.isEmpty() ? "—" : keyName(key).replace("LEFT ", "L").replace("RIGHT ", "R");
        float nameX = Math.max(x + 42, Type.draw(ctx, s.tr(), Type.TAG, tag, x + 12, cy, Glass.MUTE) + 12);
        int ink = current || hover ? Glass.INK : f.on ? Glass.BODY : Glass.MUTE;
        Type.draw(ctx, s.tr(), Type.NAME, Type.fit(s.tr(), Type.NAME, f.label, x + w - 30 - nameX), nameX, cy, ink);
        s.onClick(x, y, w - 30, Glass.ROW, () -> select(s, f.id));
        Chrome.dot(s, ctx, x + w - 15, cy, f.on, () -> flip(s, f.id));
    }

    private static void select(EditorScreen s, String id) {
        if (!id.equals(s.feature)) {
            s.feature = id;
            s.inspScroll = 0;
        }
    }

    private static void flip(EditorScreen s, String id) {
        Feature f = s.config.feature(id);
        if (f == null) return;
        s.config.putFeature(id, f.switchedTo(!f.on));
        s.change(f.label + " · " + (f.on ? "off" : "on"));
        s.click();
    }

    /* ── middle: the rules ──────────────────────────────────────────────── */
    private static void rules(EditorScreen s, DrawContext ctx, List<Feature> all) {
        float[] c = s.canvas;
        Glass.panel(ctx, c[0], c[1], c[2], c[3]);
        float hx = c[0] + Glass.PAD, hcy = c[1] + Glass.PAD_TOP + 13;
        float after = Type.draw(ctx, s.tr(), Type.CAPS, "Features", hx, hcy, Glass.META);
        Type.draw(ctx, s.tr(), Type.SOFT, "each one reads as a rule", after + 14, hcy, Glass.MUTE);
        int on = 0;
        for (Feature f : all) if (f.on) on++;
        String count = on + " of " + all.size() + " on";
        float pw = Type.width(s.tr(), Type.PILL, count) + 24;
        float px = c[0] + c[2] - Glass.PAD - pw;
        Glass.box(ctx, px, hcy - 13, pw, 26, Glass.WELL, Glass.LINE);
        Type.draw(ctx, s.tr(), Type.PILL, count, px + 12, hcy, Glass.MUTE);

        float keysW = 236;
        float top = c[1] + Glass.PAD_TOP + 26 + 16;
        float colX = c[0] + Glass.PAD, colW = c[2] - 2 * Glass.PAD - keysW - 28;
        float viewH = c[1] + c[3] - 14 - top;
        s.clipTo(ctx, colX, top, colW, viewH);
        float cursor = top - s.rulesScroll;
        for (Feature f : all) cursor = rule(s, ctx, f, colX, cursor, colW) + 12;
        float content = cursor + s.rulesScroll - top;
        s.rulesScroll = Math.max(0, Math.min(s.rulesScroll, content - viewH));
        s.unclip(ctx);
        s.onWheel(colX, top, colW, viewH, by -> s.rulesScroll = Math.max(0, s.rulesScroll + by));

        keys(s, ctx, all, c[0] + c[2] - Glass.PAD - keysW, top, keysW);
    }

    /** one feature as a rule block; returns its bottom */
    private static float rule(EditorScreen s, DrawContext ctx, Feature f, float x, float y, float w) {
        boolean selected = f.id.equals(s.feature);
        float fade = f.on ? 1f : 0.45f;
        int hue = GROUP_HUES[groupOf(f.id)];
        float headH = 38, actH = 38, h = headH + actH + 14;
        boolean hover = s.over(x, y, w, h);
        Glass.box(ctx, x, y, w, h, hover ? Glass.HOVER : Glass.RAISE, Glass.LINE);
        s.onClick(x, y, w, h, () -> select(s, f.id));

        /* the trigger */
        float cy = y + headH / 2f;
        String verb = verb(f.id);
        float tx = x + 16;
        if ("always".equals(verb)) {
            Type.draw(ctx, s.tr(), Type.RULE, "While on", tx, cy, Glass.faded(Glass.INK, fade));
        } else {
            tx = Type.draw(ctx, s.tr(), Type.RULE, "held".equals(verb) ? "While" : "When", tx, cy, Glass.faded(Glass.INK, fade)) + 12;
            String key = keyOf(f);
            boolean waiting = s.rebinding && selected;
            String shown = waiting ? "press a key" : key.isEmpty() ? "no key" : keyName(key);
            tx += Chrome.chipButton(s, ctx, shown, tx, cy, waiting ? Glass.GO : key.isEmpty() ? Glass.MUTE : Glass.INK, () -> {
                select(s, f.id);
                s.rebinding = true;
            }) + 12;
            Type.draw(ctx, s.tr(), Type.RULE, verb, tx, cy, Glass.faded(Glass.INK, fade));
        }
        Type.drawRight(ctx, s.tr(), Type.VALUE, f.on ? "on" : "off", x + w - 16, cy, Glass.MUTE);

        /* the action, nested under it */
        float ax = x + 32, ay = y + headH, aw = w - 32 - 12;
        int fill = Glass.faded(Glass.mix(hue, Glass.TINT, Glass.RAISE), fade);
        Glass.box(ctx, ax, ay, aw, actH, fill, selected ? Glass.GO : Glass.faded(hue, 0.32f * fade));
        Glass.fill(ctx, ax - 18, ay - 14, 1, 14 + actH / 2f, Glass.LINE_STRONG);
        Glass.fill(ctx, ax - 18, ay + actH / 2f, 10, 1, Glass.LINE_STRONG);
        Glass.fill(ctx, ax + 14, ay + actH + 1, 20, 3, Glass.faded(hue, fade));
        float acy = ay + actH / 2f;
        float ox = Type.draw(ctx, s.tr(), Type.RULE, action(f), ax + 16, acy, Glass.faded(Glass.INK, fade)) + 12;
        for (String k : f.optKeys()) {
            HudConfig.OptSpec spec = s.config.spec(k);
            if (ox > ax + aw - 40) break;
            if (spec != null && spec.isEnum()) {
                String now = f.choice(k, spec.vals.get(0));
                String shown = now + ("turn".equals(k) ? "°" : "");
                ox += Chrome.chipButton(s, ctx, shown, ox, acy, Glass.INK, () -> cycle(s, f.id, k)) + 12;
            } else {
                String label = spec == null ? k : spec.label.toLowerCase(Locale.ROOT);
                ox = Type.draw(ctx, s.tr(), Type.SOFT, label, ox, acy, Glass.MUTE) + 12;
                Chrome.dot(s, ctx, ox + 5, acy, f.flag(k), () -> cycle(s, f.id, k));
                ox += 10 + 16;
            }
        }
        return y + h;
    }

    private static void cycle(EditorScreen s, String id, String key) {
        Feature f = s.config.feature(id);
        HudConfig.OptSpec spec = s.config.spec(key);
        if (f == null) return;
        select(s, id);
        String shown;
        if (spec != null && spec.isEnum()) {
            int i = spec.vals.indexOf(f.choice(key, spec.vals.get(0)));
            String next = spec.vals.get((i + 1) % spec.vals.size());
            s.config.putFeature(id, f.withOpt(key, '"' + next + '"'));
            shown = next;
        } else {
            boolean was = f.flag(key);
            s.config.putFeature(id, f.withOpt(key, was ? "false" : "true"));
            shown = was ? "off" : "on";
        }
        s.change(f.label + " · " + (spec == null ? key : spec.label.toLowerCase(Locale.ROOT)) + ": " + shown);
        s.click();
    }

    /** the keys in use, and whether two features want the same one */
    private static void keys(EditorScreen s, DrawContext ctx, List<Feature> all, float x, float y, float w) {
        List<Feature> bound = new ArrayList<>();
        for (Feature f : all) if (!"always".equals(verb(f.id)) && !keyOf(f).isEmpty()) bound.add(f);
        List<String> clashes = new ArrayList<>();
        for (int i = 0; i < bound.size(); i++) {
            for (int j = 0; j < i; j++) {
                String k = keyOf(bound.get(i));
                if (k.equals(keyOf(bound.get(j))) && !clashes.contains(keyName(k))) clashes.add(keyName(k));
            }
        }
        String note = (clashes.isEmpty() ? "" : String.join(", ", clashes) + " is used twice. ")
            + "Bound keys also appear in Minecraft’s Controls screen.";
        List<String> lines = Type.wrap(s.tr(), Type.META, note, w - 32);
        float rowsH = Math.max(1, bound.size()) * 28;
        float h = 16 + 12 + 10 + rowsH + 10 + lines.size() * 15 + 14;
        Glass.box(ctx, x, y, w, h, Glass.RAISE, Glass.LINE);
        float px = x + 16, pw = w - 32;
        Chrome.heading(s, ctx, "Keys", null, px, y + 16, pw);
        float cy = y + 16 + 12 + 10 + 14;
        if (bound.isEmpty()) {
            Type.draw(ctx, s.tr(), Type.HINT, "No keys set", px, cy, Glass.BODY);
            cy += 28;
        }
        for (int i = 0; i < bound.size(); i++) {
            Feature f = bound.get(i);
            if (i > 0) Glass.fill(ctx, px, cy - 14, pw, 1, Glass.LINE);
            Chrome.kcap(s, ctx, keyName(keyOf(f)), px, cy, false);
            Type.drawRight(ctx, s.tr(), Type.HINT, f.label, px + pw, cy, Glass.BODY);
            cy += 28;
        }
        float ly = cy - 14 + 10 + 7;
        for (int i = 0; i < lines.size(); i++) {
            boolean warn = !clashes.isEmpty() && i == 0;
            Type.draw(ctx, s.tr(), Type.META, lines.get(i), px, ly, warn ? Glass.CLASH : Glass.MUTE);
            ly += 15;
        }
    }

    /* ── right: the settings ────────────────────────────────────────────── */
    private static final float SUMMARY_H = 104;

    private static void inspector(EditorScreen s, DrawContext ctx, List<Feature> all) {
        float x = s.insp[0], y = s.insp[1], w = s.insp[2], h = s.insp[3];
        Glass.panel(ctx, x, y, w, h);
        float ah = h - SUMMARY_H - Chrome.CHANGES_H;
        Feature f = s.config.feature(s.feature);
        if (f != null && ah > 40) {
            s.clipTo(ctx, x + 1, y + 1, w - 2, ah - 1);
            float top = y + Glass.PAD_TOP - s.inspScroll;
            float end = settings(s, ctx, f, all, x + Glass.PAD, top, w - 2 * Glass.PAD);
            s.inspScroll = Math.max(0, Math.min(s.inspScroll, end - top + Glass.PAD_TOP * 2 - ah));
            s.unclip(ctx);
            s.onWheel(x, y, w, ah, by -> s.inspScroll = Math.max(0, s.inspScroll + by));
        }
        summary(s, ctx, all, x, y + h - SUMMARY_H - Chrome.CHANGES_H, w);
        Chrome.changes(s, ctx, x, y + h - Chrome.CHANGES_H, w);
    }

    private static float settings(EditorScreen s, DrawContext ctx, Feature f, List<Feature> all, float x, float y, float w) {
        Chrome.heading(s, ctx, "Feature", ElementsTab.two(all.indexOf(f) + 1) + " of " + ElementsTab.two(all.size()), x, y, w);
        y += 12 + 14;
        float tcy = y + 11;
        Glass.fill(ctx, x, tcy - 5, 10, 10, GROUP_HUES[groupOf(f.id)]);
        Type.draw(ctx, s.tr(), Type.TITLE, Type.fit(s.tr(), Type.TITLE, f.label, w - 22), x + 22, tcy, Glass.INK);
        y += 22 + 8;
        if (!f.desc.isEmpty()) {
            for (String line : Type.wrap(s.tr(), Type.DESC, f.desc + ".", w)) {
                Type.draw(ctx, s.tr(), Type.DESC, line, x, y + 8, Glass.META);
                y += 18;
            }
            y += 6;
        }

        float cy = y + Glass.ROW / 2f;
        Chrome.label(s, ctx, "On", x, cy);
        Chrome.dot(s, ctx, x + w - 5, cy, f.on, () -> flip(s, f.id));
        y += Glass.ROW;

        if (!"always".equals(verb(f.id))) {
            cy = y + Glass.ROW / 2f;
            Chrome.label(s, ctx, "Key", x, cy);
            String button = s.rebinding ? "cancel" : "change";
            float bw = Chrome.chipWidth(s, button);
            Chrome.chipButton(s, ctx, button, x + w - bw, cy, Glass.INK, () -> s.rebinding = !s.rebindingBeforeClick);
            String key = keyOf(f);
            String shown = s.rebinding ? "press a key" : key.isEmpty() ? "none" : keyName(key);
            float kw = Type.width(s.tr(), Type.KEY, shown) + 16;
            Chrome.kcap(s, ctx, shown, x + w - bw - 6 - kw, cy, s.rebinding);
            y += Glass.ROW;
            String note = s.rebinding ? "Esc cancels. Backspace clears the key."
                : key.isEmpty() ? "No key yet, so it can’t be used in game." : null;
            if (note != null) {
                for (String line : Type.wrap(s.tr(), Type.DESC, note, w)) {
                    Type.draw(ctx, s.tr(), Type.DESC, line, x, y + 8, Glass.META);
                    y += 18;
                }
            }
        }

        List<String> keys = f.optKeys();
        if (!keys.isEmpty()) {
            y += 18;
            Chrome.heading(s, ctx, "Options", null, x, y, w);
            y += 12 + 6;
            for (String k : keys) {
                HudConfig.OptSpec spec = s.config.spec(k);
                String label = spec == null ? k : spec.label;
                float ocy = y + Glass.ROW / 2f;
                if (spec != null && spec.isEnum()) {
                    String[] vals = new String[spec.vals.size()];
                    for (int i = 0; i < vals.length; i++) vals[i] = spec.vals.get(i) + ("turn".equals(k) ? "°" : "");
                    int now = spec.vals.indexOf(f.choice(k, spec.vals.get(0)));
                    float segLeft = Chrome.seg(s, ctx, vals, now, x + w, ocy, i -> {
                        Feature cur = s.config.feature(f.id);
                        s.config.putFeature(f.id, cur.withOpt(k, '"' + spec.vals.get(i) + '"'));
                        s.change(cur.label + " · " + label.toLowerCase(Locale.ROOT) + ": " + spec.vals.get(i));
                        s.click();
                    });
                    Chrome.label(s, ctx, Type.fit(s.tr(), Type.LABEL, label, segLeft - x - 12), x, ocy);
                } else {
                    Chrome.label(s, ctx, Type.fit(s.tr(), Type.LABEL, label, w - 40), x, ocy);
                    Chrome.dot(s, ctx, x + w - 5, ocy, f.flag(k), () -> cycle(s, f.id, k));
                }
                y += Glass.ROW;
            }
        }
        return y;
    }

    private static void summary(EditorScreen s, DrawContext ctx, List<Feature> all, float x, float y, float w) {
        Glass.fill(ctx, x + 1, y, w - 2, 1, Glass.LINE);
        float px = x + Glass.PAD, pw = w - 2 * Glass.PAD;
        Chrome.heading(s, ctx, "Features", "rev " + s.config.revision(), px, y + Glass.PAD_TOP, pw);
        int on = 0, keyed = 0, set = 0;
        for (Feature f : all) {
            if (f.on) on++;
            if (!"always".equals(verb(f.id))) {
                keyed++;
                if (!keyOf(f).isEmpty()) set++;
            }
        }
        float cy = y + Glass.PAD_TOP + 12 + Glass.ROW / 2f;
        Chrome.label(s, ctx, "On", px, cy);
        Type.drawRight(ctx, s.tr(), Type.FIGURE, on + " of " + all.size(), px + pw, cy, Glass.INK);
        cy += Glass.ROW;
        Chrome.label(s, ctx, "Keys set", px, cy);
        Type.drawRight(ctx, s.tr(), Type.FIGURE, set + " of " + keyed, px + pw, cy, Glass.INK);
    }
}
