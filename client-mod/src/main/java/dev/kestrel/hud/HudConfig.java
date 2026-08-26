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
 * <p><b>THIS MOD HAS NO SETTINGS SCREEN AND IS NOT GOING TO GET ONE.</b> Two
 * places to change one setting is how they end up disagreeing, and the
 * launcher already has the better screen for it — it can show a preview at a
 * real window size without the game running. So this side reads and never
 * writes.
 *
 * <p><b>A MISSING OR BROKEN FILE IS NOT AN ERROR.</b> The mod is installed
 * into instances the launcher has never written a HUD config for, and a mod
 * that crashed the game because a config was absent would be a worse
 * failure than the one it was preventing. Absent means defaults; unparseable
 * means defaults and a line in the log saying so.
 *
 * <p>Parsed by hand rather than with Gson. The document is a flat map of
 * element names to three values, this needs to read it without dragging a
 * JSON library into a mod jar, and the parser refuses anything it does not
 * recognise instead of guessing — the same posture the launcher takes when
 * it reads somebody else's manifest.
 */
public final class HudConfig {

    /** One element's state. Position is a percentage of the screen, so a HUD
     *  arranged at 1280x800 in the launcher lands in the same visual place on
     *  a 2560x1440 monitor rather than in the top-left eighth of it. */
    public static final class Element {
        public final boolean on;
        public final double x;
        public final double y;

        Element(boolean on, double x, double y) {
            this.on = on;
            this.x = clamp(x);
            this.y = clamp(y);
        }

        private static double clamp(double v) {
            if (Double.isNaN(v)) return 0.0;
            return v < 0.0 ? 0.0 : (v > 100.0 ? 100.0 : v);
        }
    }

    private final Map<String, Element> elements;

    private HudConfig(Map<String, Element> elements) {
        this.elements = elements;
    }

    public Element get(String name) {
        return elements.get(name);
    }

    public boolean on(String name) {
        Element e = elements.get(name);
        return e != null && e.on;
    }

    public int count() {
        return elements.size();
    }

    /** The defaults, used when there is no file. Deliberately sparse: an
     *  instance nobody has configured should show the two things that are
     *  useful without being asked for, not all twelve. */
    public static HudConfig defaults() {
        Map<String, Element> m = new LinkedHashMap<>();
        m.put("fps", new Element(true, 1.0, 1.0));
        m.put("coords", new Element(true, 1.0, 5.0));
        return new HudConfig(m);
    }

    /**
     * Reads {@code config/kestrel-hud.json} out of the run directory.
     * Never throws: every failure path returns the defaults.
     */
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
            return new HudConfig(m);
        } catch (Exception e) {
            KestrelHudClient.LOG.warn("kestrel-hud.json is not readable ({}); using defaults", e.getMessage());
            return defaults();
        }
    }

    /* ── the parser ───────────────────────────────────────────────────────
       Looks for  "name": { "on": true, "x": 1.0, "y": 5.0 }  and takes
       nothing else out of the document. Anything it does not understand is
       skipped rather than guessed at. */
    private static Map<String, Element> parse(String text) {
        Map<String, Element> out = new LinkedHashMap<>();
        int at = text.indexOf("\"elements\"");
        if (at < 0) return out;
        int brace = text.indexOf('{', at);
        if (brace < 0) return out;

        int i = brace + 1;
        int depth = 1;
        while (i < text.length() && depth > 0) {
            char c = text.charAt(i);
            if (c == '}') { depth--; i++; continue; }
            if (c == '{') { depth++; i++; continue; }
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
                    numOf(body, "x"),
                    numOf(body, "y")));
            }
            i = close + 1;
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
        int k = body.indexOf('"' + key + '"');
        if (k < 0) return false;
        int colon = body.indexOf(':', k);
        if (colon < 0) return false;
        return body.regionMatches(true, skipSpace(body, colon + 1), "true", 0, 4);
    }

    private static double numOf(String body, String key) {
        int k = body.indexOf('"' + key + '"');
        if (k < 0) return 0.0;
        int colon = body.indexOf(':', k);
        if (colon < 0) return 0.0;
        int s = skipSpace(body, colon + 1);
        int e = s;
        while (e < body.length()) {
            char c = body.charAt(e);
            if ((c >= '0' && c <= '9') || c == '.' || c == '-' || c == '+') e++;
            else break;
        }
        try { return Double.parseDouble(body.substring(s, e)); }
        catch (Exception ex) { return 0.0; }
    }

    private static int skipSpace(String s, int i) {
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        return i;
    }
}
