package dev.kestrel.hud;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A FEATURE — THE THING THAT IS NOT AN ELEMENT.
 *
 * <p>An element is a plate of text at one of nine anchors with an offset, a
 * scale and a style. A toggle-sprint has no anchor; zoom has a key and a field
 * of view; a chunk-border overlay is drawn in the world in 3D rather than on
 * the HUD plane. Forcing those into the element model would put
 * {@code plateAlpha} on things that cannot have one, and the first person to
 * open the options screen for "Zoom" would find a colour picker.
 *
 * <p>So a feature is <b>on or off, a key, and its own options</b> — and it
 * reuses the same option machinery an element has, resolved out of the same
 * top-level {@code optSpec}, so the menu builds a feature's rows exactly the
 * way it builds an element's.
 *
 * <p><b>THE LABEL AND THE DESCRIPTION ARE THE LAUNCHER'S.</b> Same rule as
 * {@code module} and {@code label} on an element: this mod has no vocabulary,
 * so a feature added in {@code mc/hud.js} appears in the menu with no Java
 * changing — except, of course, for the part that makes it DO something,
 * which is the one thing that cannot be declared from the other side.
 */
public final class Feature {

    public final String id;
    public final boolean on;
    public final String label;
    public final String desc;
    /** a GLFW key name like {@code KEY_C}, or empty for unbound */
    public final String key;
    /** raw JSON tokens, exactly as {@link HudConfig.Element#opts} holds them */
    public final Map<String, String> opts;

    Feature(String id, boolean on, String label, String desc, String key, Map<String, String> opts) {
        this.id = id;
        this.on = on;
        this.label = label == null ? id : label;
        this.desc = desc == null ? "" : desc;
        this.key = key == null ? "" : key;
        this.opts = opts == null ? new LinkedHashMap<>() : new LinkedHashMap<>(opts);
    }

    public boolean flag(String k) {
        return "true".equals(opts.get(k));
    }

    public String choice(String k, String fallback) {
        String v = opts.get(k);
        if (v == null) return fallback;
        if (v.length() >= 2 && v.charAt(0) == '"') return v.substring(1, v.length() - 1);
        return v;
    }

    public List<String> optKeys() {
        return new ArrayList<>(opts.keySet());
    }

    Feature switchedTo(boolean nowOn) {
        return new Feature(id, nowOn, label, desc, key, opts);
    }

    Feature withOpt(String k, String rawToken) {
        Map<String, String> next = new LinkedHashMap<>(opts);
        if (next.containsKey(k)) next.put(k, rawToken);
        return new Feature(id, on, label, desc, key, next);
    }
}
