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
 * <p>Toggle sprint, toggle sneak, zoom and snap look. Each is a key, a piece
 * of state, and a small effect applied on the client tick.
 *
 * <p><b>NO MIXINS, AND THAT IS WHAT DECIDED THE LIST.</b> A mixin is a
 * build-time weave into somebody else's compiled class; it needs its own
 * config and refmap, it fails in ways that are hard to read, and it breaks
 * differently on every Minecraft version. Adding this mod's first one — for a
 * HUD convenience, in a session that cannot launch the game to check it —
 * would be a bad trade.
 *
 * <p>So these four are exactly the behaviours that can be done from the
 * outside: a keybinding's pressed state can be SET, the field of view is an
 * ordinary option with a setter, and a player's yaw is public. Freelook and
 * hit colours cannot, and they are named in {@code docs/hud-backlog.md} with
 * that reason rather than quietly missing.
 *
 * <p><b>EVERY EFFECT IS UNDONE WHEN THE FEATURE IS SWITCHED OFF.</b> Zoom
 * changes a setting the player also owns, and a mod that turns the field of
 * view down and then stops running has left somebody's game broken in a way
 * they will not connect to this. So the original is remembered on the way in
 * and restored the moment the key is released, the feature is disabled, or
 * the world goes away.
 */
final class Behaviours {

    private Behaviours() { }

    /** the bindings, one per feature that has a key, made at init */
    private static final Map<String, KeyBinding> KEYS = new LinkedHashMap<>();

    private static boolean sprintLatched = false;
    private static boolean sneakLatched = false;

    /* ZOOM REMEMBERS WHAT IT FOUND. Not a constant: the player may run at 90
       or at 110, and restoring to a number this file picked would silently
       change a setting they had chosen. */
    private static double fovBefore = -1;
    private static boolean zoomed = false;
    private static Double sensitivityBefore = null;

    /** Registers a binding per feature the document declares a key for.
     *  Called once, at init, from the client entrypoint. */
    static void register(HudConfig config) {
        for (String id : config.featureNames()) {
            Feature f = config.feature(id);
            if (f == null || f.key.isEmpty()) continue;
            int code = codeOf(f.key);
            if (code == GLFW.GLFW_KEY_UNKNOWN) {
                KestrelHudClient.LOG.warn("Kestrel HUD: {} asks for key \"{}\", which is not a key name", id, f.key);
                continue;
            }
            KEYS.put(id, net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper.registerKeyBinding(
                new KeyBinding("key." + KestrelHudClient.MOD_ID + "." + id,
                    InputUtil.Type.KEYSYM, code, "category." + KestrelHudClient.MOD_ID)));
        }
    }

    /* THE NAME, NOT THE CODE. "KEY_C" survives a remap and a keyboard layout
       where 67 does not, and InputUtil already knows every name there is —
       keeping a second copy of that list here is how the two drift. */
    private static int codeOf(String name) {
        try {
            return InputUtil.fromTranslationKey("key.keyboard." + glfwToTranslation(name)).getCode();
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
            sprintLatched = false;
            sneakLatched = false;
            return;
        }

        toggleKey(c, config, "sprint");
        toggleKey(c, config, "sneak");
        zoom(c, config);
        snapLook(c, config);
    }

    /* ── toggle sprint and sneak ──────────────────────────────────────────
       A latch, and the key that set it clears it. setPressed() on the vanilla
       binding is what makes this work without a mixin: the game asks the
       binding, and the binding answers what it was last told. */
    private static void toggleKey(MinecraftClient c, HudConfig config, String id) {
        Feature f = config.feature(id);
        KeyBinding k = KEYS.get(id);
        boolean sprint = "sprint".equals(id);
        if (f == null || !f.on || k == null) {
            if (sprint && sprintLatched) { c.options.sprintKey.setPressed(false); sprintLatched = false; }
            if (!sprint && sneakLatched) { c.options.sneakKey.setPressed(false); sneakLatched = false; }
            return;
        }
        while (k.wasPressed()) {
            if (sprint) sprintLatched = !sprintLatched;
            else sneakLatched = !sneakLatched;
        }
        /* RE-ASSERTED EVERY TICK, because the game clears a binding whenever
           the real key goes up. A latch set once would last exactly one tick. */
        if (sprint) c.options.sprintKey.setPressed(sprintLatched || c.options.sprintKey.isPressed());
        else c.options.sneakKey.setPressed(sneakLatched || c.options.sneakKey.isPressed());
    }

    /* ── zoom ─────────────────────────────────────────────────────────────
       Held, not toggled: every client that has this makes it a hold, because
       a zoom you can forget you left on is a zoom that gets you killed. */
    private static void zoom(MinecraftClient c, HudConfig config) {
        Feature f = config.feature("zoom");
        KeyBinding k = KEYS.get("zoom");
        boolean want = f != null && f.on && k != null && k.isPressed();
        if (want == zoomed) return;

        if (want) {
            fovBefore = c.options.getFov().getValue();
            double div = "8x".equals(f.choice("amount", "4x")) ? 8.0
                : "2x".equals(f.choice("amount", "4x")) ? 2.0 : 4.0;
            c.options.getFov().setValue((int) Math.max(1, Math.round(fovBefore / div)));
            if (f.flag("smooth")) {
                /* THE MOUSE HAS TO SLOW DOWN TOO. A quarter of the field of
                   view at the same sensitivity is four times the apparent
                   turn per inch of mouse, which is what makes a zoom feel
                   broken rather than close. */
                sensitivityBefore = c.options.getMouseSensitivity().getValue();
                c.options.getMouseSensitivity().setValue(sensitivityBefore / div);
            }
            zoomed = true;
        } else {
            unzoom(c);
        }
    }

    private static void unzoom(MinecraftClient c) {
        if (!zoomed) return;
        if (fovBefore > 0) c.options.getFov().setValue((int) Math.round(fovBefore));
        if (sensitivityBefore != null) c.options.getMouseSensitivity().setValue(sensitivityBefore);
        fovBefore = -1;
        sensitivityBefore = null;
        zoomed = false;
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
