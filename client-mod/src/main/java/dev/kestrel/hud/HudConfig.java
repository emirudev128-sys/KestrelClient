package dev.kestrel.hud;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
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
 *   "version": 1,
 *   "elements": {
 *     "fps": { "on": true, "anchor": "tl", "x": 2.6, "y": 4.2, "scale": 1 }
 *   }
 * }
 * </pre>
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
 * <p><b>VISIBILITY ARRIVES ALREADY RESOLVED.</b> The launcher groups elements
 * into modules — "Armor status" owns five of them — and a player switches the
 * module. That resolution happens on the launcher side and this file gets a
 * plain {@code on} per element, so this mod never needs to know what a module
 * is. It is a renderer; the settings screen is somebody else's job.
 *
 * <p><b>THIS MOD HAS NO SETTINGS SCREEN AND IS NOT GETTING ONE.</b> Two places
 * to change one setting is how they end up disagreeing, and the launcher can
 * preview a layout at a real window size without the game running.
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

    /** Where an element sits: one of nine anchors, a percentage offset from
     *  it, and a scale. */
    public static final class Element {
        public final boolean on;
        public final String anchor;
        public final double x;
        public final double y;
        public final double scale;
        /** coords only; meaningless and ignored on every other element */
        public final boolean compass;

        Element(boolean on, String anchor, double x, double y, double scale, boolean compass) {
            this.on = on;
            this.anchor = isAnchor(anchor) ? anchor : "tl";
            this.x = clampPercent(x);
            this.y = clampPercent(y);
            this.scale = clampScale(scale);
            this.compass = compass;
        }

        private static double clampPercent(double v) {
            if (Double.isNaN(v)) return 0.0;
            return v < 0.0 ? 0.0 : (v > 100.0 ? 100.0 : v);
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
       rather than as something bolted on. */
    public final boolean rounded;
    public final boolean kestrelFont;

    private final Map<String, Element> elements;

    private HudConfig(Map<String, Element> elements, boolean rounded, boolean kestrelFont) {
        this.elements = elements;
        this.rounded = rounded;
        this.kestrelFont = kestrelFont;
    }

    public Element get(String name) { return elements.get(name); }
    public int count() { return elements.size(); }

    /** The defaults, for an instance nobody has configured. Deliberately the
     *  two that are useful without being asked for, not all eleven. */
    public static HudConfig defaults() {
        Map<String, Element> m = new LinkedHashMap<>();
        m.put("fps", new Element(true, "tl", 2.6, 4.2, 1.0, false));
        m.put("coords", new Element(true, "tl", 2.6, 8.4, 1.0, false));
        return new HudConfig(m, false, false);
    }

    /** Reads {@code config/kestrel-hud.json} out of the run directory. Never
     *  throws: every failure path returns the defaults. */
    public static HudConfig read(Path runDir) {
        Path file = runDir.resolve("config").resolve("kestrel-hud.json");
        String text;
        try {
            if (!Files.isRegularFile(file)) return defaults();
            if (Files.size(file) > 256 * 1024) {
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
            return new HudConfig(m, styleIs(text, "corners", "rounded"), styleIs(text, "font", "kestrel"));
        } catch (Exception e) {
            KestrelHudClient.LOG.warn("kestrel-hud.json is not readable ({}); using defaults", e.getMessage());
            return defaults();
        }
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
            int close = text.indexOf('}', open);
            if (close < 0) break;
            String body = text.substring(open + 1, close);

            if (isPlainName(name)) {
                out.put(name, new Element(
                    boolOf(body, "on"),
                    strOf(body, "anchor"),
                    numOf(body, "x", 0.0),
                    numOf(body, "y", 0.0),
                    numOf(body, "scale", 1.0),
                    boolOf(body, "compass")));
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
