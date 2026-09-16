package dev.kestrel.hud;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Style;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * THE MENU'S TYPE. Two faces, both Kestrel's own: Archivo for words and
 * Azeret Mono for labels, values and keys, each set at the exact pixel size it
 * is drawn at.
 *
 * <p><b>A FONT DEFINITION PER SIZE, NOT ONE FONT SCALED.</b> Minecraft samples
 * glyph textures nearest-neighbour — {@code GlyphAtlasTexture} sets no filter —
 * so a glyph is only crisp when one texel lands on one screen pixel. A 14px
 * face scaled to 11px skips texels and its strokes break up. So every role
 * below has its own definition under {@code assets/kestrel-hud/font/menu},
 * rasterised at that size, plus a {@code _2x} twin at double oversample for
 * screens where the menu draws two pixels per design pixel.
 *
 * <p><b>THE CAPITALS ARE CENTRED, NOT THE LINE.</b> A TrueType glyph's baseline
 * sits 7 font pixels below the y it is drawn at ({@code RenderableGlyph.getYMin}
 * is {@code 7 - ascent}). Both faces keep more room below the baseline than
 * above the capitals, so centring a line box leaves every label visibly high —
 * the thing the mockup had to fix too. Centring the cap height is exact
 * arithmetic from each font's own OS/2 table: 686/1000 for Archivo, 698/1000
 * for Azeret Mono.
 */
final class Type {

    private Type() { }

    static final float ARCHIVO_CAP = 0.686f;
    static final float AZERET_CAP = 0.698f;

    /** one way of setting text: which definition, its size, cap height, tracking in em, and case */
    record Role(String id, int size, float cap, float tracking, boolean upper) { }

    static final Role NAME = new Role("ui_med_14", 14, ARCHIVO_CAP, 0f, false);
    static final Role LABEL = new Role("ui_14", 14, ARCHIVO_CAP, 0f, false);
    static final Role DESC = new Role("ui_13", 13, ARCHIVO_CAP, 0f, false);
    static final Role HINT = new Role("ui_12", 12, ARCHIVO_CAP, 0f, false);
    static final Role TITLE = new Role("ui_semi_21", 21, ARCHIVO_CAP, 0f, false);
    static final Role CAPS = new Role("mono_semi_11", 11, AZERET_CAP, 0.16f, true);
    static final Role TAB = new Role("mono_semi_11", 11, AZERET_CAP, 0.18f, true);
    static final Role WORD = new Role("mono_bold_18", 18, AZERET_CAP, 0.26f, true);
    static final Role FILE = new Role("mono_semi_13", 13, AZERET_CAP, 0f, false);
    static final Role META = new Role("mono_10", 10, AZERET_CAP, 0f, false);
    static final Role KEY = new Role("mono_semi_10", 10, AZERET_CAP, 0.06f, true);
    static final Role PRIMARY = new Role("mono_bold_11", 11, AZERET_CAP, 0.18f, true);
    static final Role RULE = new Role("mono_bold_11", 11, AZERET_CAP, 0.15f, true);
    static final Role PILL = new Role("mono_med_10", 10, AZERET_CAP, 0.06f, false);
    static final Role VALUE = new Role("mono_med_11", 11, AZERET_CAP, 0.03f, false);
    static final Role SOFT = new Role("mono_13", 13, AZERET_CAP, 0f, false);
    static final Role TAG = new Role("mono_semi_9", 9, AZERET_CAP, 0.08f, true);
    static final Role FIGURE = new Role("mono_semi_12", 12, AZERET_CAP, 0f, false);
    static final Role TICK = new Role("mono_med_9", 9, AZERET_CAP, 0f, false);

    /** 1 or 2: how many screen pixels one design pixel is this frame */
    static int density = 1;

    private static final Map<String, Style> STYLES = new HashMap<>();

    private static Style style(Role r) {
        String id = density == 2 ? r.id() + "_2x" : r.id();
        return STYLES.computeIfAbsent(id, k -> Style.EMPTY.withFont(Identifier.of(KestrelHudClient.MOD_ID, "menu/" + k)));
    }

    private static Text text(Role r, String s) {
        return Text.literal(s).setStyle(style(r));
    }

    private static String cased(Role r, String s) {
        return r.upper() ? s.toUpperCase(Locale.ROOT) : s;
    }

    /** the advance of a string in design pixels, tracking between glyphs included */
    static float width(TextRenderer tr, Role r, String s) {
        String t = cased(r, s);
        if (t.isEmpty()) return 0f;
        float w = tr.getTextHandler().getWidth(text(r, t));
        return w + r.tracking() * r.size() * (t.codePointCount(0, t.length()) - 1);
    }

    /** Draws with the capitals centred on {@code cy}; returns the x after the text. */
    static float draw(DrawContext ctx, TextRenderer tr, Role r, String s, float x, float cy, int argb) {
        String t = cased(r, s);
        if (t.isEmpty()) return x;
        int y = Math.round(cy - 7f + r.cap() * r.size() / 2f);
        if (r.tracking() == 0f) {
            ctx.drawText(tr, text(r, t), Math.round(x), y, argb, false);
            return x + width(tr, r, t);
        }
        /* TRACKED TEXT IS SET A GLYPH AT A TIME. Minecraft has no letter
           spacing, and the spaced capitals are half of what makes a heading
           read as a heading rather than as a shouted word. */
        float step = r.tracking() * r.size();
        float px = x;
        for (int i = 0; i < t.length(); ) {
            int cp = t.codePointAt(i);
            Text g = text(r, new String(Character.toChars(cp)));
            ctx.drawText(tr, g, Math.round(px), y, argb, false);
            px += tr.getTextHandler().getWidth(g) + step;
            i += Character.charCount(cp);
        }
        return px - step;
    }

    static float drawRight(DrawContext ctx, TextRenderer tr, Role r, String s, float right, float cy, int argb) {
        float x = right - width(tr, r, s);
        draw(ctx, tr, r, s, x, cy, argb);
        return x;
    }

    static void drawCentred(DrawContext ctx, TextRenderer tr, Role r, String s, float x, float w, float cy, int argb) {
        draw(ctx, tr, r, s, x + (w - width(tr, r, s)) / 2f, cy, argb);
    }

    /** cut to fit with an ellipsis rather than wrapped */
    static String fit(TextRenderer tr, Role r, String s, float max) {
        if (width(tr, r, s) <= max) return s;
        String cut = s;
        while (cut.length() > 1 && width(tr, r, cut + "…") > max) cut = cut.substring(0, cut.length() - 1);
        return cut + "…";
    }

    /** greedy word wrap for the two places a sentence has to fit a column */
    static List<String> wrap(TextRenderer tr, Role r, String s, float max) {
        List<String> lines = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String word : s.split(" ")) {
            String next = line.length() == 0 ? word : line + " " + word;
            if (line.length() > 0 && width(tr, r, next) > max) {
                lines.add(line.toString());
                line = new StringBuilder(word);
            } else {
                line = new StringBuilder(next);
            }
        }
        if (line.length() > 0) lines.add(line.toString());
        return lines;
    }
}
