package dev.kestrel.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

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
 * read, and it breaks differently on every Minecraft version. So the first
 * four are done from the outside: a keybinding's pressed state can be SET, a
 * player's yaw is public, and zoom is one field opened by an access widener
 * (see {@link #zoom}).
 *
 * <p>Freelook is the one that cannot be. The camera takes its rotation off
 * the player and the mouse writes straight into the player, with no way in
 * between — so it has the mod's only two mixins, and they do nothing unless
 * {@link Freelook} says it is on. Hit colours would need the same, and are
 * still named in {@code docs/hud-backlog.md} rather than quietly missing.
 *
 * <p><b>EVERY EFFECT IS UNDONE WHEN THE FEATURE IS SWITCHED OFF.</b> Zoom
 * slows the mouse, which is a setting the player also owns, and a mod that
 * turns it down and then stops running has left somebody's game broken in a
 * way they will not connect to this. So the original is remembered on the way
 * in and restored the moment the key is released, the feature is disabled, or
 * the world goes away.
 */
final class Behaviours {

    private Behaviours() { }

    /** the bindings, one per feature, made at init — unbound where there is no key */
    private static final Map<String, KeyBinding> KEYS = new LinkedHashMap<>();

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
    static final java.util.Set<String> KEYED = java.util.Set.of("sprint", "sneak", "zoom", "snaplook", "freelook");

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
            int code = f.key.isEmpty() ? GLFW.GLFW_KEY_UNKNOWN : codeOf(f.key);
            if (!f.key.isEmpty() && code == GLFW.GLFW_KEY_UNKNOWN) {
                KestrelHudClient.LOG.warn("Kestrel HUD: {} asks for key \"{}\", which is not a key name", id, f.key);
            }
            KEYS.put(id, net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper.registerKeyBinding(
                new KeyBinding("key." + KestrelHudClient.MOD_ID + "." + id,
                    InputUtil.Type.KEYSYM, code, "category." + KestrelHudClient.MOD_ID)));
        }
    }

    /* ── keys, from the editor ─────────────────────────────────────────────
       A key set in the menu is set on Minecraft's own binding and written to
       options.txt at once. Only writing the document would lose it: at the
       next launch Minecraft loads the key it remembers over the default. */
    static void rebind(MinecraftClient c, String id, String name) {
        KeyBinding k = KEYS.get(id);
        if (k == null) return;
        int code = name.isEmpty() ? GLFW.GLFW_KEY_UNKNOWN : codeOf(name);
        k.setBoundKey(InputUtil.Type.KEYSYM.createFromCode(code));
        KeyBinding.updateKeysByCode();
        if (c != null && c.options != null) c.options.write();
    }

    /** the key a feature is really bound to, as a document name; the fallback when there is no binding */
    static String boundName(String id, String fallback) {
        KeyBinding k = KEYS.get(id);
        if (k == null) return fallback;
        String name = nameOfTranslation(k.getBoundKeyTranslationKey());
        return name == null ? "" : name;
    }

    /** KEY_C for the C key; null for a key the document cannot name */
    static String nameOf(int keyCode) {
        return nameOfTranslation(InputUtil.Type.KEYSYM.createFromCode(keyCode).getTranslationKey());
    }

    private static String nameOfTranslation(String t) {
        if (t == null || !t.startsWith("key.keyboard.") || t.equals("key.keyboard.unknown")) return null;
        String n = "KEY_" + t.substring("key.keyboard.".length()).replace('.', '_').toUpperCase(java.util.Locale.ROOT);
        return n.matches("KEY_[A-Z0-9_]{1,24}") ? n : null;
    }

    /* THE NAME, NOT THE CODE. "KEY_C" survives a remap and a keyboard layout
       where 67 does not, and InputUtil already knows every name there is —
       keeping a second copy of that list here is how the two drift. Two
       spellings are tried: left.alt for the modifier keys, and page.up for
       the handful of other keys whose translation has a dot in it. */
    private static int codeOf(String name) {
        int code = codeOfTranslation(glfwToTranslation(name));
        if (code != GLFW.GLFW_KEY_UNKNOWN) return code;
        String s = (name.startsWith("KEY_") ? name.substring(4) : name).toLowerCase(java.util.Locale.ROOT).replace('_', '.');
        return codeOfTranslation(s);
    }

    private static int codeOfTranslation(String t) {
        try {
            return InputUtil.fromTranslationKey("key.keyboard." + t).getCode();
        } catch (Exception e) {
            return GLFW.GLFW_KEY_UNKNOWN;
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
    static void tick(MinecraftClient c, HudConfig config) {
        if (c == null || c.options == null) return;

        if (c.player == null) {
            /* no world: undo anything still applied, so a setting cannot
               survive into the title screen */
            unzoom(c);
            snapZoomOut(c);
            Freelook.stop(c);
            freelookLatched = false;
            zoomLatched = false;
            if (sprintLatched) c.options.sprintKey.setPressed(false);
            if (sneakLatched) c.options.sneakKey.setPressed(false);
            sprintLatched = false;
            sneakLatched = false;
            return;
        }

        toggleKey(c, config, "sprint");
        toggleKey(c, config, "sneak");
        zoom(c, config);
        snapLook(c, config);
        freelook(c, config);
    }

    /* ── freelook ─────────────────────────────────────────────────────────
       Held by default, like zoom, for the same reason: a camera looking the
       wrong way that you forgot you left on gets you killed. The toggle is
       there for somebody who wants to look behind them for a while.

       A HELD KEY LET GO UNDER A SCREEN LETS GO OF FREELOOK TOO: opening a
       screen releases every binding, and the view comes back with it. A
       toggle stays on through a screen, since nobody pressed anything. */
    private static void freelook(MinecraftClient c, HudConfig config) {
        Feature f = config.feature("freelook");
        KeyBinding k = KEYS.get("freelook");
        if (f == null || !f.on || k == null) {
            freelookLatched = false;
            Freelook.stop(c);
            return;
        }
        boolean want;
        if (holds(f, "hold")) {
            while (k.wasPressed()) { /* presses mean nothing to a hold */ }
            freelookLatched = false;
            want = k.isPressed();
        } else {
            while (k.wasPressed()) freelookLatched = !freelookLatched;
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
       used to re-assert `latched || binding.isPressed()` every tick — and
       isPressed() answers what it was last told, which was this line. Once
       on, the binding kept itself pressed forever and the second press
       cleared a latch nothing was listening to any more. So now: while
       latched the binding is held; on the press that unlatches it, it is set
       to what the physical key is really doing, once, and then left to the
       game again. */
    private static void toggleKey(MinecraftClient c, HudConfig config, String id) {
        Feature f = config.feature(id);
        KeyBinding k = KEYS.get(id);
        boolean sprint = "sprint".equals(id);
        KeyBinding target = sprint ? c.options.sprintKey : c.options.sneakKey;
        boolean latched = sprint ? sprintLatched : sneakLatched;

        if (f == null || !f.on || k == null) {
            if (latched) release(c, target, sprint);
            setLatch(sprint, false);
            return;
        }

        int presses = 0;
        while (k.wasPressed()) presses++;

        /* MINECRAFT'S OWN "TOGGLE" MODE IS ALREADY A LATCH. Its binding flips
           on every setPressed(true), so layering a second latch on top would
           flicker it once a tick. There, this key just flips theirs. */
        boolean vanillaToggles = (sprint ? c.options.getSprintToggled() : c.options.getSneakToggled()).getValue();
        if (vanillaToggles) {
            if (latched) setLatch(sprint, false);
            if (presses % 2 == 1) target.setPressed(true);
            return;
        }

        /* HOLD: ON WHILE THE KEY IS DOWN, AND LET GO THE MOMENT IT COMES UP.
           The latch still marks "this key is holding the binding", so a
           release is the same careful release a toggle gets — and switching
           the mode in the menu while it is on lets go cleanly too. */
        if (holds(f, "toggle")) {
            boolean down = k.isPressed();
            if (down) {
                setLatch(sprint, true);
                if (!target.isPressed()) target.setPressed(true);
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
        if (latched && !target.isPressed()) target.setPressed(true);
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
    private static void release(MinecraftClient c, KeyBinding target, boolean sprint) {
        boolean held = c.currentScreen == null && physicallyDown(c, target);
        target.setPressed(held);
        if (sprint && !held && c.player != null) c.player.setSprinting(false);
    }

    /** whether the key this binding is bound to is down on the keyboard or mouse right now */
    private static boolean physicallyDown(MinecraftClient c, KeyBinding binding) {
        InputUtil.Key key = net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper.getBoundKeyOf(binding);
        if (key == null || key.getCode() == GLFW.GLFW_KEY_UNKNOWN) return false;
        long window = c.getWindow().getHandle();
        if (key.getCategory() == InputUtil.Type.MOUSE) {
            return GLFW.glfwGetMouseButton(window, key.getCode()) == GLFW.GLFW_PRESS;
        }
        return key.getCategory() == InputUtil.Type.KEYSYM && InputUtil.isKeyPressed(window, key.getCode());
    }

    /* ── zoom ─────────────────────────────────────────────────────────────
       Held by default: a zoom you can forget you left on is a zoom that gets
       you killed. Toggle is one Mode away for anybody who wants to stay
       zoomed while they watch something.

       NOT THE FIELD OF VIEW OPTION. That was the first version, and it did
       nothing: the option only accepts 30 to 110, a quarter of 70 is 17, and
       an out-of-range value is not clamped — it is logged and replaced with
       the DEFAULT, 70. So a 4x zoom set the view to exactly what it was.

       THE PROJECTION ITSELF, INSTEAD. GameRenderer keeps a `zoom` factor that
       scales the world's projection about the centre of the screen — made for
       huge screenshots, idle at 1 the rest of the time. Scaling x and y by 4
       is exactly a quarter of the view. It is private, so an access widener
       (kestrel-hud.accesswidener) opens that one field; nothing is injected
       into anybody's method, and nothing is written to options.txt. */
    private static void zoom(MinecraftClient c, HudConfig config) {
        Feature f = config.feature("zoom");
        KeyBinding k = KEYS.get("zoom");
        boolean want = false;
        if (f == null || !f.on || k == null) {
            zoomLatched = false;
        } else if (holds(f, "hold")) {
            /* presses are drained even here, or a hold would bank them for
               the moment somebody switches the mode to toggle */
            while (k.wasPressed()) { }
            zoomLatched = false;
            want = k.isPressed();
        } else {
            while (k.wasPressed()) zoomLatched = !zoomLatched;
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
                sensitivityBefore = c.options.getMouseSensitivity().getValue();
                double inner = (sensitivityBefore * 0.6 + 0.2) / Math.cbrt(times);
                c.options.getMouseSensitivity().setValue(Math.max(0.0, Math.min(1.0, (inner - 0.2) / 0.6)));
            }
            zoomed = true;
        } else {
            unzoom(c);
        }
    }

    private static void unzoom(MinecraftClient c) {
        if (!zoomed) return;
        if (sensitivityBefore != null) c.options.getMouseSensitivity().setValue(sensitivityBefore);
        sensitivityBefore = null;
        zoomWanted = 1f;
        zoomed = false;
    }

    /* ── every frame, before the world is drawn ─────────────────────────────
       THE EASE LIVES HERE AND NOT ON THE TICK. Twenty steps a second is a
       zoom that visibly clicks into place; a frame is as smooth as the game
       is. It eases in log space, so going 1 to 8 and 8 to 1 take the same
       time, and snaps the last hair so it settles at exactly 1 — not at
       1.0003 with the hand still hidden.

       IT ONLY TOUCHES THE RENDERER WHILE IT HAS A REASON TO. Idle at 1, the
       field and the hand are left alone for anything else that uses them. */
    static void frame(MinecraftClient c) {
        if (c == null || c.gameRenderer == null) return;
        long now = System.nanoTime();
        float dt = lastFrame == 0L ? 0f : Math.min(0.1f, (now - lastFrame) / 1_000_000_000f);
        lastFrame = now;
        if (zoomNow == zoomWanted && zoomNow == 1f) return;

        float ease = 1f - (float) Math.exp(-dt / 0.045f);
        double from = Math.log(zoomNow), to = Math.log(zoomWanted);
        float next = (float) Math.exp(from + (to - from) * ease);
        if (Math.abs(next - zoomWanted) < 0.002f) next = zoomWanted;
        zoomNow = next;

        c.gameRenderer.zoom = zoomNow;
        /* the hand is drawn through the same projection, so a 4x zoom is a
           hand four times the size of the screen — hidden, as a spyglass does */
        c.gameRenderer.setRenderHand(zoomNow == 1f);
    }

    /** straight back to 1, no ease — for when the world goes away mid-zoom */
    private static void snapZoomOut(MinecraftClient c) {
        zoomWanted = 1f;
        if (zoomNow == 1f) return;
        zoomNow = 1f;
        if (c.gameRenderer != null) {
            c.gameRenderer.zoom = 1f;
            c.gameRenderer.setRenderHand(true);
        }
    }

    /* ── snap look ────────────────────────────────────────────────────────
       Instant, on the press. Yaw only: turning the pitch as well would leave
       you looking at the sky, and nobody means that by "turn around". */
    private static void snapLook(MinecraftClient c, HudConfig config) {
        Feature f = config.feature("snaplook");
        KeyBinding k = KEYS.get("snaplook");
        if (f == null || !f.on || k == null) return;
        float turn = Float.parseFloat(f.choice("turn", "180"));
        while (k.wasPressed()) {
            c.player.setYaw(net.minecraft.util.math.MathHelper.wrapDegrees(c.player.getYaw() + turn));
        }
    }
}
