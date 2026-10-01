package dev.kestrel.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * THE FEATURES THAT DO SOMETHING RATHER THAN DRAW SOMETHING.
 *
 * <p>Toggle sprint, toggle sneak, zoom, snap look and freelook. Each is a key,
 * a piece of state, and a small effect applied on the client tick.
 *
 * <p><b>MIXINS ONLY WHERE NOTHING ELSE WILL DO.</b> A mixin is a build-time
 * weave into somebody else's compiled class; it fails in ways that are hard to
 * read, and it breaks differently on every Minecraft version. So sprint,
 * sneak and snap look are done from the outside: a key mapping's pressed
 * state can be SET, and a player's yaw is public.
 *
 * <p>Freelook and zoom are the ones that cannot be. The camera takes its
 * rotation off the player and the mouse writes straight into the player, with
 * no way in between; and 26.3 has no projection scale left to set, so zoom
 * has to narrow the field of view where the camera works it out. So the mod
 * has two mixins, and they change nothing unless {@link Freelook} is on or a
 * zoom is under way ({@link #fovFor}). Hit colour turned out not to need one —
 * see {@link HitColour} — and the inventory sorter is only clicks
 * ({@link Sorter}).
 *
 * <p><b>EVERY EFFECT IS UNDONE WHEN THE FEATURE IS SWITCHED OFF.</b> Zoom
 * slows the mouse, which is a setting the player also owns, and a mod that
 * turns it down and then stops running has left somebody's game broken in a
 * way they will not connect to this. So the original is remembered on the way
 * in and restored the moment the key is released, the feature is disabled, or
 * the world goes away.
 */
public final class Behaviours {

    private Behaviours() { }

    /** the bindings, one per feature, made at init — unbound where there is no key */
    private static final Map<String, KeyMapping> KEYS = new LinkedHashMap<>();

    private static boolean sprintLatched = false;
    private static boolean sneakLatched = false;

    /* ZOOM REMEMBERS WHAT IT FOUND. Not a constant: the player may have the
       mouse at any speed, and restoring to a number this file picked would
       silently change a setting they had chosen. */
    private static boolean zoomed = false;
    private static Double sensitivityBefore = null;
    /** how far in the view is asked to be, 1 for not at all — set on the tick */
    private static float zoomWanted = 1f;
    /** and how far in it is this frame, easing towards that */
    private static float zoomNow = 1f;
    private static long lastFrame = 0L;

    /** the features something in this file reads a key for */
    static final java.util.Set<String> KEYED = java.util.Set.of("sprint", "sneak", "zoom", "snaplook", "freelook", "sorter", "waypoints", "worldmap");

    /* ── A KEY ANOTHER MAPPING ALSO HAS ──────────────────────────────────
       1.21.4 handed each key to exactly ONE binding, so zoom on C — which
       is also vanilla's "Save Toolbar Activator" — never saw a press, and
       that build reads the keyboard itself as well. 26.3 keeps a list of
       mappings per key and presses every one of them, so here the mapping's
       own answer is the whole answer. */

    /** whether a feature's key is held right now */
    static boolean held(Minecraft c, String id) {
        KeyMapping k = KEYS.get(id);
        return k != null && k.isDown();
    }

    /** how many times a feature's key was pressed since the last tick — call once a tick per feature */
    static int presses(Minecraft c, String id) {
        KeyMapping k = KEYS.get(id);
        if (k == null) return 0;
        int queued = 0;
        while (k.consumeClick()) queued++;
        return queued;
    }

    /** what the key mapping API calls a key that is not there */
    private static final int UNKNOWN = InputConstants.UNKNOWN.getValue();

    /** freelook's and zoom's own latches, for when they are set to toggle rather than hold */
    private static boolean freelookLatched = false;
    private static boolean zoomLatched = false;

    /** Registers a binding for every feature that uses a key — unbound where
     *  the document has none yet. Called once, at init, from the client
     *  entrypoint.
     *
     *  <p>UNBOUND ONES TOO, because Minecraft only accepts new bindings while
     *  it starts: a feature given its first key from the menu has to have a
     *  binding waiting for it already. But not hitboxes or chunk borders,
     *  which are switched from the menu and read no key — a Controls entry
     *  that does nothing is worse than no entry. */
    static void register(HudConfig config) {
        for (String id : config.featureNames()) {
            Feature f = config.feature(id);
            if (f == null || (f.key.isEmpty() && !KEYED.contains(id))) continue;
            int code = f.key.isEmpty() ? UNKNOWN : codeOf(f.key);
            if (!f.key.isEmpty() && code == UNKNOWN) {
                KestrelHudClient.LOG.warn("Kestrel HUD: {} asks for key \"{}\", which is not a key name", id, f.key);
            }
            KEYS.put(id, KeyMappingHelper.registerKeyMapping(
                new KeyMapping("key." + KestrelHudClient.MOD_ID + "." + id,
                    InputConstants.Type.KEYBOARD, code, KestrelHudClient.KEYS)));
        }
    }

    /* ── keys, from the editor ─────────────────────────────────────────────
       A key set in the menu is set on Minecraft's own binding and written to
       options.txt at once. Only writing the document would lose it: at the
       next launch Minecraft loads the key it remembers over the default. */
    static void rebind(Minecraft c, String id, String name) {
        KeyMapping k = KEYS.get(id);
        if (k == null) return;
        int code = name.isEmpty() ? UNKNOWN : codeOf(name);
        k.setKey(InputConstants.Type.KEYBOARD.getOrCreate(code));
        KeyMapping.resetMapping();
        if (c != null && c.options != null) c.options.save();
    }

    /** the key a feature is really bound to, as a document name; the fallback when there is no binding */
    static String boundName(String id, String fallback) {
        KeyMapping k = KEYS.get(id);
        if (k == null) return fallback;
        String name = nameOfTranslation(KeyMappingHelper.getBoundKeyOf(k).getName());
        return name == null ? "" : name;
    }

    /** KEY_C for the C key, from the key a screen was handed; null for a key the document cannot name */
    static String nameOf(int key) {
        return nameOfTranslation(InputConstants.Type.KEYBOARD.getOrCreate(key).getName());
    }

    private static String nameOfTranslation(String t) {
        if (t == null || !t.startsWith("key.keyboard.") || t.equals("key.keyboard.unknown")) return null;
        String n = "KEY_" + t.substring("key.keyboard.".length()).replace('.', '_').toUpperCase(java.util.Locale.ROOT);
        return n.matches("KEY_[A-Z0-9_]{1,24}") ? n : null;
    }

    /* THE NAME, NOT THE CODE. "KEY_C" survives a remap and a keyboard layout
       where a code does not, and InputConstants already knows every name there is —
       keeping a second copy of that list here is how the two drift. Two
       spellings are tried: left.alt for the modifier keys, and page.up for
       the handful of other keys whose translation has a dot in it. */
    private static int codeOf(String name) {
        int code = codeOfTranslation(glfwToTranslation(name));
        if (code != UNKNOWN) return code;
        String s = (name.startsWith("KEY_") ? name.substring(4) : name).toLowerCase(java.util.Locale.ROOT).replace('_', '.');
        return codeOfTranslation(s);
    }

    private static int codeOfTranslation(String t) {
        try {
            InputConstants.Key k = InputConstants.getKey("key.keyboard." + t);
            return k == null ? UNKNOWN : k.getValue();
        } catch (Exception e) {
            return UNKNOWN;
        }
    }

    /** KEY_LEFT_ALT -> left.alt, KEY_C -> c — the shape Minecraft's own
     *  translation keys use */
    private static String glfwToTranslation(String name) {
        String s = name.startsWith("KEY_") ? name.substring(4) : name;
        s = s.toLowerCase(java.util.Locale.ROOT);
        if (s.startsWith("left_")) return "left." + s.substring(5);
        if (s.startsWith("right_")) return "right." + s.substring(6);
        return s;
    }

    /** every tick, after the config is loaded */
    static void tick(Minecraft c, HudConfig config) {
        if (c == null || c.options == null) return;

        /* before the world check: the overlay texture is the game's, not the
           world's, and a colour switched off on the way out should go back */
        HitColour.tick(c, config);

        if (c.player == null) {
            /* no world: undo anything still applied, so a setting cannot
               survive into the title screen */
            unzoom(c);
            snapZoomOut(c);
            Freelook.stop(c);
            freelookLatched = false;
            zoomLatched = false;
            if (sprintLatched) c.options.keySprint.setDown(false);
            if (sneakLatched) c.options.keyShift.setDown(false);
            sprintLatched = false;
            sneakLatched = false;
            return;
        }

        toggleKey(c, config, "sprint");
        toggleKey(c, config, "sneak");
        zoom(c, config);
        snapLook(c, config);
        freelook(c, config);
        Sorter.tick(c, config);
        Waypoints.tick(c, config);
    }

    /** a feature's binding, for the screens that read keys themselves; null if it has none */
    static KeyMapping key(String id) {
        return KEYS.get(id);
    }

    /* ── freelook ─────────────────────────────────────────────────────────
       Held by default, like zoom, for the same reason: a camera looking the
       wrong way that you forgot you left on gets you killed. The toggle is
       there for somebody who wants to look behind them for a while.

       A HELD KEY LET GO UNDER A SCREEN LETS GO OF FREELOOK TOO: opening a
       screen releases every binding, and the view comes back with it. A
       toggle stays on through a screen, since nobody pressed anything. */
    private static void freelook(Minecraft c, HudConfig config) {
        Feature f = config.feature("freelook");
        KeyMapping k = KEYS.get("freelook");
        if (f == null || !f.on || k == null) {
            freelookLatched = false;
            Freelook.stop(c);
            return;
        }
        boolean want;
        if (holds(f, "hold")) {
            presses(c, "freelook");   /* drained: presses mean nothing to a hold */
            freelookLatched = false;
            want = held(c, "freelook");
        } else {
            if (presses(c, "freelook") % 2 == 1) freelookLatched = !freelookLatched;
            want = freelookLatched;
        }
        if (want) Freelook.start(c);
        else Freelook.stop(c);
    }

    /* ── toggle sprint and sneak ──────────────────────────────────────────
       A latch, and the key that set it clears it. setPressed() on the vanilla
       binding is what makes this work without a mixin: the game asks the
       binding, and the binding answers what it was last told.

       THE LATCH ONLY EVER HOLDS THE KEY DOWN; IT NEVER READS IT BACK. This
       used to re-assert `latched || binding.isDown()` every tick — and
       isPressed() answers what it was last told, which was this line. Once
       on, the binding kept itself pressed forever and the second press
       cleared a latch nothing was listening to any more. So now: while
       latched the binding is held; on the press that unlatches it, it is set
       to what the physical key is really doing, once, and then left to the
       game again. */
    private static void toggleKey(Minecraft c, HudConfig config, String id) {
        Feature f = config.feature(id);
        KeyMapping k = KEYS.get(id);
        boolean sprint = "sprint".equals(id);
        KeyMapping target = sprint ? c.options.keySprint : c.options.keyShift;
        boolean latched = sprint ? sprintLatched : sneakLatched;

        if (f == null || !f.on || k == null) {
            if (latched) release(c, target, sprint);
            setLatch(sprint, false);
            return;
        }

        int presses = presses(c, id);

        /* MINECRAFT'S OWN "TOGGLE" MODE IS ALREADY A LATCH. Its binding flips
           on every setDown(true), so layering a second latch on top would
           flicker it once a tick. There, this key just flips theirs. */
        boolean vanillaToggles = (sprint ? c.options.toggleSprint() : c.options.toggleCrouch()).get();
        if (vanillaToggles) {
            if (latched) setLatch(sprint, false);
            if (presses % 2 == 1) target.setDown(true);
            return;
        }

        /* HOLD: ON WHILE THE KEY IS DOWN, AND LET GO THE MOMENT IT COMES UP.
           The latch still marks "this key is holding the binding", so a
           release is the same careful release a toggle gets — and switching
           the mode in the menu while it is on lets go cleanly too. */
        if (holds(f, "toggle")) {
            boolean down = held(c, id);
            if (down) {
                setLatch(sprint, true);
                if (!target.isDown()) target.setDown(true);
            } else if (latched) {
                setLatch(sprint, false);
                release(c, target, sprint);
            }
            return;
        }

        if (presses % 2 == 1) {
            latched = !latched;
            setLatch(sprint, latched);
            if (!latched) {
                release(c, target, sprint);
                return;
            }
        }
        /* HELD EVERY TICK while latched, because the game clears a binding
           whenever the real key goes up. A latch set once would last one tick. */
        if (latched && !target.isDown()) target.setDown(true);
    }

    /** true when the feature's Mode says hold; `otherwise` is what it was before modes existed */
    private static boolean holds(Feature f, String otherwise) {
        return "hold".equals(f.choice("mode", otherwise));
    }

    private static void setLatch(boolean sprint, boolean on) {
        if (sprint) sprintLatched = on;
        else sneakLatched = on;
    }

    /* LET GO, AND MEAN IT. The binding goes back to the physical key — still
       down if the player is holding the real one — and a sprint stops now
       rather than when you next stop walking: vanilla keeps a sprint going
       after the key is released, which is right for a key you let go of and
       wrong for a toggle you just switched off. */
    private static void release(Minecraft c, KeyMapping target, boolean sprint) {
        boolean held = c.gui.screen() == null && physicallyDown(c, target);
        target.setDown(held);
        if (sprint && !held && c.player != null) c.player.setSprinting(false);
    }

    /** whether the key this binding is bound to is down on the keyboard or mouse right now */
    private static boolean physicallyDown(Minecraft c, KeyMapping binding) {
        InputConstants.Key key = KeyMappingHelper.getBoundKeyOf(binding);
        if (key == null || key.getValue() < 0) return false;
        if (key.getType() == InputConstants.Type.MOUSE) {
            /* the three buttons the mouse handler tracks; a side button has no
               state to ask, and reads as up */
            return switch (key.getValue()) {
                case InputConstants.MOUSE_BUTTON_LEFT -> c.mouseHandler.isLeftPressed();
                case InputConstants.MOUSE_BUTTON_MIDDLE -> c.mouseHandler.isMiddlePressed();
                case InputConstants.MOUSE_BUTTON_RIGHT -> c.mouseHandler.isRightPressed();
                default -> false;
            };
        }
        return key.getType() == InputConstants.Type.KEYBOARD && InputConstants.isKeyDown(key.getValue());
    }

    /* ── zoom ─────────────────────────────────────────────────────────────
       Held by default: a zoom you can forget you left on is a zoom that gets
       you killed. Toggle is one Mode away for anybody who wants to stay
       zoomed while they watch something.

       NOT THE FIELD OF VIEW OPTION. That was the first version, and it did
       nothing: the option only accepts 30 to 110, a quarter of 70 is 17, and
       an out-of-range value is not clamped — it is logged and replaced with
       the DEFAULT, 70. So a 4x zoom set the view to exactly what it was.

       THE CAMERA.S OWN FIELD OF VIEW, INSTEAD. 1.21.4 scaled the projection
       through a field kept for huge screenshots; 26.3 has none. So the angle
       the camera works out each frame — the option, the speed effect, the
       water — is narrowed where it is worked out (CameraMixin, through
       {@link #fovFor}), by exactly the amount that scaling the picture would
       have: a quarter of the view across at 4x. Nothing is written to
       options.txt, and the option the player set is never touched. */
    private static void zoom(Minecraft c, HudConfig config) {
        Feature f = config.feature("zoom");
        KeyMapping k = KEYS.get("zoom");
        boolean want = false;
        if (f == null || !f.on || k == null) {
            zoomLatched = false;
        } else if (holds(f, "hold")) {
            /* presses are drained even here, or a hold would bank them for
               the moment somebody switches the mode to toggle */
            presses(c, "zoom");
            zoomLatched = false;
            want = held(c, "zoom");
        } else {
            if (presses(c, "zoom") % 2 == 1) zoomLatched = !zoomLatched;
            want = zoomLatched;
        }
        if (want == zoomed) return;

        if (want) {
            String amount = f.choice("amount", "4x");
            float times = "8x".equals(amount) ? 8f : "2x".equals(amount) ? 2f : 4f;
            zoomWanted = times;
            if (f.flag("smooth")) {
                /* THE MOUSE HAS TO SLOW DOWN TOO. A quarter of the view at
                   the same sensitivity is four times the apparent turn per
                   inch of mouse, which is what makes a zoom feel broken
                   rather than close.

                   AND NOT BY DIVIDING THE SLIDER. Minecraft turns the slider
                   s into a speed of (0.6s + 0.2) cubed, so a quarter of the
                   speed is the cube root of a quarter on the inner term, not
                   a quarter of s. */
                sensitivityBefore = c.options.sensitivity().get();
                double inner = (sensitivityBefore * 0.6 + 0.2) / Math.cbrt(times);
                c.options.sensitivity().set(Math.max(0.0, Math.min(1.0, (inner - 0.2) / 0.6)));
            }
            zoomed = true;
        } else {
            unzoom(c);
        }
    }

    private static void unzoom(Minecraft c) {
        if (!zoomed) return;
        if (sensitivityBefore != null) c.options.sensitivity().set(sensitivityBefore);
        sensitivityBefore = null;
        zoomWanted = 1f;
        zoomed = false;
    }

    /* ── every frame, as the camera works out its field of view ────────────
       THE EASE LIVES HERE AND NOT ON THE TICK. Twenty steps a second is a
       zoom that visibly clicks into place; a frame is as smooth as the game
       is. The camera asks once a frame, so the ease steps once a frame. It
       eases in log space, so going 1 to 8 and 8 to 1 take the same time, and
       snaps the last hair so it settles at exactly 1.

       THE ARITHMETIC IS THE PICTURE'S, NOT THE ANGLE'S. Scaling the view 4x
       is a quarter of tan(fov / 2), not a quarter of the angle — at 70
       degrees a quarter of the angle would be a 3.4x zoom and at 110 a
       2.9x one. Idle at 1, the angle passes through untouched.

       THE HAND KEEPS ITS OWN ANGLE. The camera works the hand's field of
       view out separately, so nothing here reaches it and it no longer has
       to be hidden while zoomed. */
    public static float fovFor(float fov) {
        long now = System.nanoTime();
        float dt = lastFrame == 0L ? 0f : Math.min(0.1f, (now - lastFrame) / 1_000_000_000f);
        lastFrame = now;
        if (zoomNow == zoomWanted && zoomNow == 1f) return fov;

        float ease = 1f - (float) Math.exp(-dt / 0.045f);
        double from = Math.log(zoomNow), to = Math.log(zoomWanted);
        float next = (float) Math.exp(from + (to - from) * ease);
        if (Math.abs(next - zoomWanted) < 0.002f) next = zoomWanted;
        zoomNow = next;
        if (zoomNow == 1f) return fov;

        double half = Math.toRadians(fov) / 2.0;
        return (float) Math.toDegrees(2.0 * Math.atan(Math.tan(half) / zoomNow));
    }

    /** straight back to 1, no ease — for when the world goes away mid-zoom */
    private static void snapZoomOut(Minecraft c) {
        zoomWanted = 1f;
        zoomNow = 1f;
    }

    /* ── snap look ────────────────────────────────────────────────────────
       Instant, on the press. Yaw only: turning the pitch as well would leave
       you looking at the sky, and nobody means that by "turn around". */
    private static void snapLook(Minecraft c, HudConfig config) {
        Feature f = config.feature("snaplook");
        KeyMapping k = KEYS.get("snaplook");
        if (f == null || !f.on || k == null) return;
        float turn = Float.parseFloat(f.choice("turn", "180"));
        for (int i = presses(c, "snaplook"); i > 0; i--) {
            c.player.setYRot(net.minecraft.util.Mth.wrapDegrees(c.player.getYRot() + turn));
        }
    }
}
