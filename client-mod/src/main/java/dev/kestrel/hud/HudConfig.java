package dev.kestrel.hud;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * THE CONTRACT BETWEEN THE LAUNCHER AND THE GAME.
 *
 * <p>Kestrel's HUD screen is where a player arranges this HUD. That screen
 * lives in the launcher, so the arrangement has to cross a process boundary
 * and a JVM boundary to get here, and the thing that crosses is a file:
 * {@code <instance>/config/kestrel-hud.json}, written by the launcher and
 * read by this mod.
 *
 * <pre>
 * {
 *   "version": 4,
 *   "rev": 7,
 *   "by": "launcher",
 *   "style": { "corners": "sharp", "font": "minecraft" },
 *   "elements": {
 *     "fps": { "on": true, "module": "FPS", "label": "FPS",
 *              "anchor": "tl", "x": 2.6, "y": 4.2, "scale": 1,
 *              "plate": true, "plateColour": "#0A0E13", "plateAlpha": 72,
 *              "textColour": "#F1F4F7", "textAlpha": 100 }
 *   }
 * }
 * </pre>
 *
 * <p><b>THE WHOLE-HUD "style" AND THE PER-ELEMENT ONE ARE DIFFERENT THINGS.</b>
 * The top-level {@code style} holds the two choices that cannot sensibly
 * differ between elements — corners and typeface, because three sharp plates
 * and one rounded one is not a configuration. Colour, transparency and
 * whether there is a plate at all live on the ELEMENT, because picking one
 * element out from the rest is the entire reason anybody opens this menu.
 *
 * <p><b>THE ANCHOR IS NOT DECORATION.</b> An element is placed against one of
 * nine anchors and offset from it by a percentage. Ignoring the anchor and
 * treating x/y as an offset from the top-left would put every bottom-right
 * element in the wrong corner while still looking like a position — which is
 * the kind of wrong that reads as "the mod is broken" rather than "the mod
 * ignored a field".
 *
 * <p><b>PERCENTAGES, NOT PIXELS</b>, because the launcher does not know what
 * resolution the game will open at.
 *
 * <p><b>AND A PERCENTAGE MAY BE NEGATIVE.</b> Against a centre or middle
 * anchor the offset runs both ways from the middle of the screen, so "9.6%
 * above centre" is {@code -9.6} and clamping it to zero silently drops the
 * element into the exact centre. The launcher's own stock layout uses one
 * ({@code helmet}, at {@code mr} and {@code -9.6}), so this is not a
 * hypothetical range.
 *
 * <p><b>VISIBILITY ARRIVES ALREADY RESOLVED.</b> The launcher groups elements
 * into modules — "Armor status" owns five of them — and a player switches the
 * module. That resolution happens on the launcher side and this file gets a
 * plain {@code on} per element, so this mod never has to know what a module
 * is in order to DRAW one.
 *
 * <p><b>THIS MOD STILL HAS NO SETTINGS OF ITS OWN.</b> The sentence that used
 * to sit here said it was not getting a screen either, and Right Shift now
 * opens one — so the distinction it was protecting is worth restating rather
 * than deleting. The screen is an EDITOR FOR THIS DOCUMENT, not a second
 * model of it. It has no defaults, no options this file cannot express, and
 * no words of its own: the {@code module} and {@code label} on every element
 * are the launcher's wording, carried here so that adding a twelfth element
 * to the HUD screen makes it appear in the in-game menu without a line of
 * Java changing. Two places to store one setting is how they end up
 * disagreeing; two places to EDIT one stored setting is a convenience.
 *
 * <p><b>WHICH MEANS THIS FILE NOW HAS TWO WRITERS.</b> {@code by} says which
 * one wrote it last and {@code rev} counts up. This mod stamps {@code "game"};
 * the launcher reads that on the next launch, folds the layout back into its
 * own settings, and rewrites the file stamped {@code "launcher"} — so an edit
 * made in-game reaches the HUD screen, and the same edit is never imported
 * twice. The full reasoning is at the top of {@code mc/hud.js}.
 *
 * <p><b>A MISSING OR BROKEN FILE IS NOT AN ERROR.</b> This gets installed into
 * instances the launcher has never written a config for, and crashing the
 * game over an absent file would be a worse failure than the one it prevents.
 * Absent means defaults; unparseable means defaults and a line in the log.
 *
 * <p>Parsed by hand rather than with Gson: the document is a flat map, this
 * should not drag a JSON library into a mod jar, and the parser refuses what
 * it does not recognise instead of guessing — the same posture the launcher
 * takes when it reads somebody else's manifest.
 */
public final class HudConfig {

    static final int VERSION = 5;
    /** a config file is a few hundred bytes; the launcher applies the same
     *  ceiling from the other side */
    private static final long MAX_BYTES = 256 * 1024;

    /* ── PER-ELEMENT STYLE ────────────────────────────────────────────────
       Version 4. Corners and typeface stay whole-HUD choices; colour and the
       plate itself are per element, because the thing people want is one
       element picked out of the rest — coordinates bigger, ping in red, the
       fps counter with no box behind it at all.

       THE DEFAULTS ARE THE OLD CONSTANTS TO THE BYTE. #0A0E13 at 72% is what
       Paint.PLATE always was; #F1F4F7 is Paint.VALUE. An element nobody has
       styled draws exactly as it did before this field existed.

       A COLOUR AND ITS ALPHA ARE TWO FIELDS, not one packed #AARRGGBB.
       Transparency is the control people reach for most, it wants a slider,
       and hiding it in the first two characters of a hex string makes it the
       hardest thing on the screen to change. */
    public static final class Style {
        static final int DEF_PLATE_RGB = 0x0A0E13;
        static final int DEF_PLATE_ALPHA = 72;
        static final int DEF_TEXT_RGB = 0xF1F4F7;
        static final int DEF_TEXT_ALPHA = 100;

        /* HOW FAR A LABEL SITS BEHIND ITS VALUE. The whole typographic idea
           of this HUD is that the VALUE is what you glance at and the LABEL
           only says what it is, and one weight of one bitmap font cannot
           express that — so it was two hard-coded greys, #F1F4F7 and #929497.
           Two hard-coded greys cannot survive the player picking red.

           So the label is now the SAME colour at a fraction of the alpha, and
           the fraction is chosen to land on the old value: #F1F4F7 at 58%
           over #0A0E13 blends to #909294, and the grey it replaces was
           #929497. An unstyled HUD is unchanged; a red one gets a dim red
           label instead of a grey one, which is the point. */
        static final double LABEL_DIM = 0.58;

        public final boolean plate;
        public final int plateRgb;
        public final int plateAlpha;
        public final int textRgb;
        public final int textAlpha;

        Style(boolean plate, int plateRgb, int plateAlpha, int textRgb, int textAlpha) {
            this.plate = plate;
            this.plateRgb = plateRgb & 0xFFFFFF;
            this.plateAlpha = clampAlpha(plateAlpha);
            this.textRgb = textRgb & 0xFFFFFF;
            this.textAlpha = clampAlpha(textAlpha);
        }

        static Style defaults() {
            return new Style(true, DEF_PLATE_RGB, DEF_PLATE_ALPHA, DEF_TEXT_RGB, DEF_TEXT_ALPHA);
        }

        Style withPlate(boolean on) { return new Style(on, plateRgb, plateAlpha, textRgb, textAlpha); }
        Style withPlateRgb(int rgb) { return new Style(plate, rgb, plateAlpha, textRgb, textAlpha); }
        Style withPlateAlpha(int a) { return new Style(plate, plateRgb, a, textRgb, textAlpha); }
        Style withTextRgb(int rgb) { return new Style(plate, plateRgb, plateAlpha, rgb, textAlpha); }
        Style withTextAlpha(int a) { return new Style(plate, plateRgb, plateAlpha, textRgb, a); }

        /** ARGB, which is what every fill and text call in Minecraft wants */
        public int plateArgb() { return argb(plateRgb, plateAlpha); }
        public int textArgb() { return argb(textRgb, textAlpha); }
        public int labelArgb() { return argb(textRgb, (int) Math.round(textAlpha * LABEL_DIM)); }

        /** the 1px outline, which fades with the plate rather than staying
         *  bright over a box that has been made transparent */
        public int edgeArgb() {
            int a = (Paint.EDGE >>> 24) * plateAlpha / 100;
            return (a << 24) | (Paint.EDGE & 0xFFFFFF);
        }

        static int argb(int rgb, int alphaPercent) {
            int a = clampAlpha(alphaPercent) * 255 / 100;
            return (a << 24) | (rgb & 0xFFFFFF);
        }

        private static int clampAlpha(int a) {
            return a < 0 ? 0 : (a > 100 ? 100 : a);
        }
    }

    /** Where an element sits: one of nine anchors, a percentage offset from
     *  it, and a scale — plus how it is painted and the launcher's own words
     *  for what it is.
     *
     *  <p>IMMUTABLE, AND EDITED BY REPLACEMENT. The in-game editor moves
     *  these constantly, and the alternative — public mutable fields — would
     *  put the clamping somewhere other than the one place a value is
     *  created. {@link #movedTo} and friends go back through the constructor,
     *  so a dragged position cannot arrive un-clamped however it was
     *  computed. */
    public static final class Element {
        public final boolean on;
        public final String anchor;
        public final double x;
        public final double y;
        public final double scale;
        /* ── THE ELEMENT'S OWN SWITCHES ────────────────────────────────
           `compass` used to be a lone boolean here, with a comment saying a
           flag meaning something on one element and nothing on the other ten
           belongs to that element. Right, and it stopped scaling the moment
           nine more elements each wanted one.

           Held as the RAW JSON TOKEN per key — `true`, `false`, `"left"` —
           because the launcher owns the schema. This side round-trips them
           and asks two questions; giving it a type system would be giving it
           a second copy of a declaration it does not own, and writing back is
           then emitting the token verbatim, which cannot change a value by
           misunderstanding it. */
        public final Map<String, String> opts;
        /** the launcher's module name — what a toggle switches */
        public final String module;
        /** the launcher's label — what a list calls this one element */
        public final String label;
        /** how it is painted; never null */
        public final Style style;

        Element(boolean on, String anchor, double x, double y, double scale,
                Map<String, String> opts, String module, String label, Style style) {
            this.on = on;
            this.anchor = isAnchor(anchor) ? anchor : "tl";
            this.x = clampPercent(x);
            this.y = clampPercent(y);
            this.scale = clampScale(scale);
            this.opts = opts == null ? new LinkedHashMap<>() : new LinkedHashMap<>(opts);
            this.module = module == null || module.isEmpty() ? "" : module;
            this.label = label == null || label.isEmpty() ? this.module : label;
            this.style = style == null ? Style.defaults() : style;
        }

        Element movedTo(String anchor, double x, double y) {
            return new Element(on, anchor, x, y, scale, opts, module, label, style);
        }

        Element scaledTo(double s) {
            return new Element(on, anchor, x, y, s, opts, module, label, style);
        }

        Element switchedTo(boolean nowOn) {
            return new Element(nowOn, anchor, x, y, scale, opts, module, label, style);
        }

        Element styled(Style s) {
            return new Element(on, anchor, x, y, scale, opts, module, label, s);
        }

        /** true only when the token is exactly `true` — an absent option is
         *  false, and so is anything unparseable */
        public boolean flag(String key) {
            return "true".equals(opts.get(key));
        }

        /** an enum option with its quotes taken off, or the fallback */
        public String choice(String key, String fallback) {
            String v = opts.get(key);
            if (v == null) return fallback;
            if (v.length() >= 2 && v.charAt(0) == '"') return v.substring(1, v.length() - 1);
            return v;
        }

        /** the option keys this element actually carries, in document order */
        public List<String> optKeys() {
            return new ArrayList<>(opts.keySet());
        }

        Element withOpt(String key, String rawToken) {
            Map<String, String> next = new LinkedHashMap<>(opts);
            if (next.containsKey(key)) next.put(key, rawToken);
            return new Element(on, anchor, x, y, scale, next, module, label, style);
        }

        /** the name shown in a list, never blank: an element the launcher
         *  wrote without a label still has to be pointed at */
        String display(String name) {
            return label.isEmpty() ? name : label;
        }

        /* SYMMETRIC AROUND ZERO, because a centre or middle anchor offsets in
           both directions. -100..100 covers a full screen either way, which
           is past anything useful and short of the values that stop being
           numbers. */
        private static double clampPercent(double v) {
            if (Double.isNaN(v)) return 0.0;
            return v < -100.0 ? -100.0 : (v > 100.0 ? 100.0 : v);
        }

        private static double clampScale(double v) {
            if (Double.isNaN(v) || v <= 0.0) return 1.0;
            return v < 0.25 ? 0.25 : (v > 4.0 ? 4.0 : v);
        }
    }

    /** the nine the launcher writes, and nothing else is an anchor */
    static boolean isAnchor(String a) {
        if (a == null || a.length() != 2) return false;
        char v = a.charAt(0), h = a.charAt(1);
        return (v == 't' || v == 'm' || v == 'b') && (h == 'l' || h == 'c' || h == 'r');
    }

    /* ── THE TWO WHOLE-HUD CHOICES ────────────────────────────────────────
       Corners and typeface apply to every element or to none: three sharp
       plates and one rounded one is not a configuration, it is a mistake.
       Both default to what the GAME already looks like — square corners and
       the vanilla font — so an unconfigured HUD reads as part of Minecraft
       rather than as something bolted on.

       MUTABLE, unlike everything else here, because the menu flips them and
       the live HUD has to change under it while you watch. They are two
       booleans with no invariant between them; a setter that only assigns
       would be ceremony. */
    public boolean rounded;
    public boolean kestrelFont;

    /* ── WHAT EACH OPTION IS CALLED ────────────────────────────────────────
       The menu prints a label beside every switch and steps through the values
       of every enum, and it is not allowed a table of its own — the same rule
       that keeps `module` and `label` in the document. The launcher writes
       this once at the top level, keyed by option name, because `wear` means
       the same on all five armour rows. */
    public static final class OptSpec {
        public final String label;
        public final List<String> vals;   /* empty for a switch */
        OptSpec(String label, List<String> vals) {
            this.label = label == null ? "" : label;
            this.vals = vals == null ? new ArrayList<>() : vals;
        }
        public boolean isEnum() { return !vals.isEmpty(); }
    }

    private final Map<String, OptSpec> spec;
    private final Map<String, Element> elements;

    /** the spec for one option, or null if the launcher declared none — in
     *  which case the menu simply does not offer a row for it, which is the
     *  right failure: better an option nobody can see than a row with no name */
    public OptSpec spec(String key) { return spec.get(key); }

    /** the revision this config was READ at. The next write is this plus one,
     *  which is how the launcher can tell one in-game edit from the next. */
    private int rev;
    /** true once anything has been edited: nothing is written back to disk
     *  otherwise, so opening the menu and closing it again does not claim an
     *  edit the player did not make */
    private boolean dirty;

    private HudConfig(Map<String, Element> elements, Map<String, OptSpec> spec,
                      boolean rounded, boolean kestrelFont, int rev) {
        this.elements = elements;
        this.spec = spec == null ? new LinkedHashMap<>() : spec;
        this.rounded = rounded;
        this.kestrelFont = kestrelFont;
        this.rev = rev;
    }

    public Element get(String name) { return elements.get(name); }
    public int count() { return elements.size(); }
    public int revision() { return rev; }
    public boolean isDirty() { return dirty; }

    /** every element in the order the launcher wrote them, which is the order
     *  its own HUD screen lists them in */
    public List<String> names() { return new ArrayList<>(elements.keySet()); }

    /** Replaces one element and marks the document edited. The only way in:
     *  the map is private precisely so that no edit can skip the flag and
     *  then fail to be saved. */
    void put(String name, Element el) {
        if (name == null || el == null || !elements.containsKey(name)) return;
        elements.put(name, el);
        dirty = true;
    }

    /** for the two whole-HUD choices, which are fields rather than elements */
    void touch() { dirty = true; }

    /** The defaults, for an instance nobody has configured. Deliberately the
     *  two that are useful without being asked for, not all eleven. */
    public static HudConfig defaults() {
        Map<String, Element> m = new LinkedHashMap<>();
        m.put("fps", new Element(true, "tl", 2.6, 4.2, 1.0, null, "FPS", "FPS", Style.defaults()));
        m.put("coords", new Element(true, "tl", 2.6, 8.4, 1.0, null, "Coordinates", "Coordinates", Style.defaults()));
        return new HudConfig(m, new LinkedHashMap<>(), false, false, 0);
    }

    /** Reads {@code config/kestrel-hud.json} out of the run directory. Never
     *  throws: every failure path returns the defaults. */
    public static HudConfig read(Path runDir) {
        Path file = file(runDir);
        String text;
        try {
            if (!Files.isRegularFile(file)) return defaults();
            if (Files.size(file) > MAX_BYTES) {
                KestrelHudClient.LOG.warn("kestrel-hud.json is implausibly large; using defaults");
                return defaults();
            }
            text = Files.readString(file);
        } catch (Exception e) {
            KestrelHudClient.LOG.warn("could not read kestrel-hud.json ({}); using defaults", e.toString());
            return defaults();
        }
        try {
            Map<String, Element> m = parse(text);
            if (m.isEmpty()) return defaults();
            return new HudConfig(m, specOf(text),
                styleIs(text, "corners", "rounded"),
                styleIs(text, "font", "kestrel"),
                revOf(text));
        } catch (Exception e) {
            KestrelHudClient.LOG.warn("kestrel-hud.json is not readable ({}); using defaults", e.getMessage());
            return defaults();
        }
    }

    static Path file(Path runDir) {
        return runDir.resolve("config").resolve("kestrel-hud.json");
    }

    /* ══ WRITING IT BACK ══════════════════════════════════════════════════
       The half that did not exist until the menu did. Same hand-rolled
       posture as the parser and for the same reason: a HUD mod has no
       business carrying a JSON library, and the document is a flat map.

       WRITTEN THROUGH A TEMPORARY FILE AND MOVED INTO PLACE. Minecraft is
       closed by killing it more often than by quitting it, and a config
       truncated halfway through a write is a config the launcher will refuse
       to parse and replace — losing exactly the layout this call was saving.
       A move is the one operation that is all-or-nothing. */
    boolean save(Path runDir) {
        if (!dirty) return false;
        Path file = file(runDir);
        Path tmp = file.resolveSibling("kestrel-hud.json.tmp");
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(tmp, document(), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (Exception atomicUnsupported) {
                /* some filesystems do not offer it; a replacing move is still
                   better than writing over the live file in place */
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
            rev++;
            dirty = false;
            KestrelHudClient.LOG.info("Kestrel HUD: saved revision {} ({} element(s))", rev, elements.size());
            return true;
        } catch (Exception e) {
            KestrelHudClient.LOG.warn("could not save kestrel-hud.json ({}); the edit stays in this session only",
                e.toString());
            try { Files.deleteIfExists(tmp); } catch (IOException ignored) { }
            return false;
        }
    }

    /** the document as it will be written — separated from the file handling
     *  so it can be looked at without a disk */
    String document() {
        StringBuilder b = new StringBuilder(1024);
        b.append("{\n");
        b.append("  \"version\": ").append(VERSION).append(",\n");
        b.append("  \"rev\": ").append(rev + 1).append(",\n");
        /* THE STAMP IS THE WHOLE POINT OF THE ROUND TRIP. Without it the
           launcher cannot tell its own last write from an in-game edit, and
           would either clobber every edit or re-import every launch. */
        b.append("  \"by\": \"game\",\n");
        b.append("  \"style\": {\n");
        b.append("    \"corners\": \"").append(rounded ? "rounded" : "sharp").append("\",\n");
        b.append("    \"font\": \"").append(kestrelFont ? "kestrel" : "minecraft").append("\"\n");
        b.append("  },\n");
        b.append("  \"elements\": {\n");

        int i = 0, n = elements.size();
        for (Map.Entry<String, Element> e : elements.entrySet()) {
            Element el = e.getValue();
            b.append("    \"").append(esc(e.getKey())).append("\": {");
            b.append(" \"on\": ").append(el.on).append(',');
            b.append(" \"module\": \"").append(esc(el.module)).append("\",");
            b.append(" \"label\": \"").append(esc(el.label)).append("\",");
            b.append(" \"anchor\": \"").append(esc(el.anchor)).append("\",");
            b.append(" \"x\": ").append(num(el.x)).append(',');
            b.append(" \"y\": ").append(num(el.y)).append(',');
            b.append(" \"scale\": ").append(num(el.scale)).append(',');
            /* ALWAYS WRITTEN, never omitted when it happens to equal the
               default. The launcher writes all five unconditionally, and a
               document where a field appears or vanishes depending on its
               value is one where "absent" has to mean two things. */
            b.append(" \"plate\": ").append(el.style.plate).append(',');
            b.append(" \"plateColour\": \"").append(hex(el.style.plateRgb)).append("\",");
            b.append(" \"plateAlpha\": ").append(el.style.plateAlpha).append(',');
            b.append(" \"textColour\": \"").append(hex(el.style.textRgb)).append("\",");
            b.append(" \"textAlpha\": ").append(el.style.textAlpha);
            /* WRITTEN ONLY WHERE THERE ARE ANY, and verbatim. An element with
               no switches gets no `opts` key rather than an empty object —
               the launcher writes it the same way, and a file two programs
               have to agree about should not carry noise on ten elements to
               spare one `if`. */
            if (!el.opts.isEmpty()) {
                b.append(", \"opts\": {");
                int j = 0;
                for (Map.Entry<String, String> o : el.opts.entrySet()) {
                    b.append(j++ > 0 ? ", " : " ")
                     .append('"').append(esc(o.getKey())).append("\": ").append(o.getValue());
                }
                b.append(" }");
            }
            b.append(" }").append(++i < n ? ",\n" : "\n");
        }
        b.append("  }\n}\n");
        return b.toString();
    }

    /* Two decimals, and never in scientific notation or with a locale's
       comma for a decimal point — String.format would use whatever locale the
       player's machine has, and "2,6" is not a number to any JSON parser.
       Root locale, stated rather than inherited. */
    private static String num(double v) {
        double r = Math.round(v * 100.0) / 100.0;
        if (r == Math.rint(r) && !Double.isInfinite(r)) return Long.toString((long) r);
        return String.format(java.util.Locale.ROOT, "%.2f", r);
    }

    /* Upper case, six digits, always — the launcher normalises to the same
       form, and a round trip that changed #e3b439 into #E3B439 would look
       like an edit nobody made. */
    private static String hex(int rgb) {
        return String.format(java.util.Locale.ROOT, "#%06X", rgb & 0xFFFFFF);
    }

    /* The launcher's labels are the launcher's, not ours, so they are escaped
       rather than trusted — a quote in a label would otherwise write a
       document that neither side can read. */
    private static String esc(String s) {
        StringBuilder b = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.toString();
    }

    /* ── the parser ───────────────────────────────────────────────────────
       Looks for  "name": { "on": .., "anchor": "..", "x": .., "y": .., "scale": .. }
       and takes nothing else out of the document. */
    private static Map<String, Element> parse(String text) {
        Map<String, Element> out = new LinkedHashMap<>();
        int at = text.indexOf("\"elements\"");
        if (at < 0) return out;
        int brace = text.indexOf('{', at);
        if (brace < 0) return out;

        int i = brace + 1;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (c == '}') break;
            if (c != '"') { i++; continue; }

            int nameEnd = text.indexOf('"', i + 1);
            if (nameEnd < 0) break;
            String name = text.substring(i + 1, nameEnd);
            int open = text.indexOf('{', nameEnd);
            if (open < 0) break;
            /* MATCHING BRACE, NOT THE NEXT ONE. This was indexOf('}', open),
               which was correct only for as long as an element was flat. An
               element carries an `opts` object from version 5 on, and the
               first '}' after the element's own '{' is now the one closing
               THAT — so the body came out truncated at the nested object and
               the loop resumed in the middle of the element it had just
               half-read. Nothing about the old line looked wrong; it simply
               stopped being true when the shape changed. */
            int close = matching(text, open);
            if (close < 0) break;
            String body = text.substring(open + 1, close);

            if (isPlainName(name)) {
                /* PLATE DEFAULTS TO ON, so the test is "is it explicitly
                   false" rather than "is it explicitly true": a document
                   written before this field existed has no opinion, and the
                   answer for no opinion has to be the way it already looked. */
                Style st = new Style(
                    !hasFalse(body, "plate"),
                    hexOf(body, "plateColour", Style.DEF_PLATE_RGB),
                    (int) numOf(body, "plateAlpha", Style.DEF_PLATE_ALPHA),
                    hexOf(body, "textColour", Style.DEF_TEXT_RGB),
                    (int) numOf(body, "textAlpha", Style.DEF_TEXT_ALPHA));
                out.put(name, new Element(
                    boolOf(body, "on"),
                    strOf(body, "anchor"),
                    numOf(body, "x", 0.0),
                    numOf(body, "y", 0.0),
                    numOf(body, "scale", 1.0),
                    optsOf(body),
                    strOf(body, "module"),
                    strOf(body, "label"),
                    st));
            }
            i = close + 1;
        }
        return out;
    }

    /* Reads one key out of the "style" object. Anything unreadable means the
       default, which is the vanilla-looking one — a HUD that cannot parse its
       own styling should look like the game, not like a guess. */
    private static boolean styleIs(String text, String key, String wanted) {
        int at = text.indexOf("\"style\"");
        if (at < 0) return false;
        int open = text.indexOf('{', at);
        int close = open < 0 ? -1 : text.indexOf('}', open);
        if (open < 0 || close < 0) return false;
        return wanted.equals(strOf(text.substring(open + 1, close), key));
    }

    /* ── the option spec, off the top of the document ──────────────────────
       Two levels of nesting and a string array, which is why matching() had to
       exist before this could. Anything malformed is simply absent from the
       map, and an option with no spec gets no row in the menu — the right
       failure, because a row with no name is worse than a missing one. */
    private static Map<String, OptSpec> specOf(String text) {
        Map<String, OptSpec> out = new LinkedHashMap<>();
        int at = text.indexOf("\"optSpec\"");
        if (at < 0) return out;
        int open = text.indexOf('{', at);
        if (open < 0) return out;
        int close = matching(text, open);
        if (close < 0) return out;
        String inner = text.substring(open + 1, close);

        int i = 0;
        while (i < inner.length()) {
            int q = inner.indexOf('"', i);
            if (q < 0) break;
            int qe = inner.indexOf('"', q + 1);
            if (qe < 0) break;
            String key = inner.substring(q + 1, qe);
            int o2 = inner.indexOf('{', qe);
            if (o2 < 0) break;
            int c2 = matching(inner, o2);
            if (c2 < 0) break;
            String body = inner.substring(o2 + 1, c2);
            if (isPlainName(key)) {
                List<String> vals = new ArrayList<>();
                int va = body.indexOf("\"vals\"");
                if (va >= 0) {
                    int ab = body.indexOf('[', va);
                    int ae = ab < 0 ? -1 : body.indexOf(']', ab);
                    if (ab >= 0 && ae > ab) {
                        String arr = body.substring(ab + 1, ae);
                        int k = 0;
                        while (k < arr.length()) {
                            int s1 = arr.indexOf('"', k);
                            if (s1 < 0) break;
                            int s2 = arr.indexOf('"', s1 + 1);
                            if (s2 < 0) break;
                            vals.add(arr.substring(s1 + 1, s2));
                            k = s2 + 1;
                        }
                    }
                }
                out.put(key, new OptSpec(strOf(body, "label"), vals));
            }
            i = c2 + 1;
        }
        return out;
    }

    /* The revision, read off the top of the document rather than out of an
       element. Absent means 0, which loses an ordering and not a layout. */
    private static int revOf(String text) {
        int at = text.indexOf("\"elements\"");
        String head = at > 0 ? text.substring(0, at) : text;
        double v = numOf(head, "rev", 0.0);
        if (Double.isNaN(v) || v < 0 || v > Integer.MAX_VALUE - 2) return 0;
        return (int) v;
    }

    /* Walks from an opening brace to the one that closes it, counting depth
       and skipping anything inside a string so that a '{' in a label cannot
       throw the count off. Returns -1 if the document ends first, which is
       the same "give up and use the defaults" every other failure here takes. */
    private static int matching(String text, int open) {
        int depth = 0;
        boolean inStr = false;
        boolean esc = false;
        for (int i = open; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inStr) {
                if (esc) esc = false;
                else if (c == '\\') esc = true;
                else if (c == '"') inStr = false;
                continue;
            }
            if (c == '"') { inStr = true; continue; }
            if (c == '{') depth++;
            else if (c == '}') { depth--; if (depth == 0) return i; }
        }
        return -1;
    }

    /* the raw text inside a nested object named `key`, or "" */
    private static String objOf(String body, String key) {
        int k = body.indexOf('"' + key + '"');
        if (k < 0) return "";
        int open = body.indexOf('{', k);
        if (open < 0) return "";
        int close = matching(body, open);
        return close < 0 ? "" : body.substring(open + 1, close);
    }

    /* ── THE OPTIONS ON ONE ELEMENT ────────────────────────────────────────
       Kept as the RAW JSON TOKEN per key — `true`, `false`, `"left"` — and not
       as a parsed boolean or enum. The launcher declares what every option is;
       this side only has to round-trip it and answer two questions about it,
       so teaching it the type system would be teaching it a second copy of a
       schema it does not own. Writing back is then emitting the token
       verbatim, which cannot change a value by misunderstanding it. */
    private static Map<String, String> optsOf(String body) {
        Map<String, String> out = new LinkedHashMap<>();
        String inner = objOf(body, "opts");
        if (inner.isEmpty()) return out;
        int i = 0;
        while (i < inner.length()) {
            int q = inner.indexOf('"', i);
            if (q < 0) break;
            int qe = inner.indexOf('"', q + 1);
            if (qe < 0) break;
            String key = inner.substring(q + 1, qe);
            int colon = inner.indexOf(':', qe);
            if (colon < 0) break;
            int v = colon + 1;
            while (v < inner.length() && Character.isWhitespace(inner.charAt(v))) v++;
            int end;
            if (v < inner.length() && inner.charAt(v) == '"') {
                end = inner.indexOf('"', v + 1);
                end = end < 0 ? inner.length() : end + 1;
            } else {
                end = v;
                while (end < inner.length() && ",}\n\r \t".indexOf(inner.charAt(end)) < 0) end++;
            }
            if (isPlainName(key)) out.put(key, inner.substring(v, end).trim());
            i = end + 1;
        }
        return out;
    }

    /** an element name is an identifier, and nothing else gets to be one */
    private static boolean isPlainName(String s) {
        if (s.isEmpty() || s.length() > 32) return false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
            if (!ok) return false;
        }
        return true;
    }

    private static boolean boolOf(String body, String key) {
        int s = valueStart(body, key);
        if (s < 0) return false;
        return body.regionMatches(true, s, "true", 0, 4);
    }

    /** "is this key present AND false" — which is a different question from
     *  boolOf, and the difference is what lets a field default to true */
    private static boolean hasFalse(String body, String key) {
        int s = valueStart(body, key);
        if (s < 0) return false;
        return body.regionMatches(true, s, "false", 0, 5);
    }

    /* #RRGGBB, and anything else is the default. A colour is the one field
       here where a half-understood value is worse than none: a parser that
       took "#GG0000" as some number would paint an element in a colour
       nobody chose and leave them unable to see what they had done. */
    private static int hexOf(String body, String key, int fallback) {
        String s = strOf(body, key);
        if (s.length() != 7 || s.charAt(0) != '#') return fallback;
        int v = 0;
        for (int i = 1; i < 7; i++) {
            int d = Character.digit(s.charAt(i), 16);
            if (d < 0) return fallback;
            v = (v << 4) | d;
        }
        return v;
    }

    private static String strOf(String body, String key) {
        int s = valueStart(body, key);
        if (s < 0 || s >= body.length() || body.charAt(s) != '"') return "";
        int e = body.indexOf('"', s + 1);
        return e < 0 ? "" : body.substring(s + 1, e);
    }

    private static double numOf(String body, String key, double fallback) {
        int s = valueStart(body, key);
        if (s < 0) return fallback;
        int e = s;
        while (e < body.length()) {
            char c = body.charAt(e);
            if ((c >= '0' && c <= '9') || c == '.' || c == '-' || c == '+') e++;
            else break;
        }
        try { return Double.parseDouble(body.substring(s, e)); }
        catch (Exception ex) { return fallback; }
    }

    private static int valueStart(String body, String key) {
        int k = body.indexOf('"' + key + '"');
        if (k < 0) return -1;
        int colon = body.indexOf(':', k);
        if (colon < 0) return -1;
        int i = colon + 1;
        while (i < body.length() && Character.isWhitespace(body.charAt(i))) i++;
        return i;
    }
}
