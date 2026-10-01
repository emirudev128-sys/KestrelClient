package dev.kestrel.hud;

import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;

/**
 * FREELOOK: THE CAMERA TURNS, THE PLAYER DOES NOT.
 *
 * <p>While it is on, the mouse moves a camera of its own around you, in third
 * person, and your player keeps facing — and walking, and aiming — exactly
 * where it was. Let go and the view is yours again, facing where you were.
 *
 * <p><b>THIS IS WHY THE MOD HAS MIXINS NOW.</b> Everything else here is done
 * from outside Minecraft's classes. This cannot be: the camera takes its
 * rotation straight off the player every frame, and the mouse writes straight
 * into the player's rotation, and nothing in between offers a way in. So two
 * small mixins (package {@code dev.kestrel.hud.mixin}) ask this class, and do
 * nothing at all unless it says freelook is on:
 * <ul>
 *   <li>{@code CameraMixin} — the camera reads {@link #yaw()} and
 *       {@link #pitch()} instead of the player's;</li>
 *   <li>{@code EntityMixin} — the mouse turns this camera instead of the
 *       player, through {@link #look}.</li>
 * </ul>
 *
 * <p><b>NOTHING HERE REACHES A SERVER.</b> The player's rotation is the thing
 * the game sends, and freelook is precisely the part that leaves it alone.
 */
public final class Freelook {

    private Freelook() { }

    private static boolean active = false;
    private static float yaw, pitch;
    /** the view to go back to — only set when freelook changed it */
    private static CameraType before = null;

    /** true while the camera is ours — and only for the player's own view,
     *  never while spectating through somebody else */
    public static boolean active() {
        if (!active) return false;
        Minecraft c = Minecraft.getInstance();
        return c != null && c.player != null && c.getCameraEntity() == c.player;
    }

    public static float yaw() { return yaw; }

    public static float pitch() { return pitch; }

    /* The same arithmetic Minecraft's own Entity.turn does — 0.15 of a
       degree per unit, pitch held to straight up and straight down — so the
       camera turns at the speed the player would have, sensitivity and the
       invert-Y setting included, because both are applied before this is
       called. */
    public static void look(double cursorDeltaX, double cursorDeltaY) {
        yaw += (float) cursorDeltaX * 0.15f;
        pitch = Mth.clamp(pitch + (float) cursorDeltaY * 0.15f, -90f, 90f);
    }

    /** from where the player is facing, into third person if you were in first */
    static void start(Minecraft c) {
        if (active || c.player == null) return;
        yaw = c.player.getYRot();
        pitch = c.player.getXRot();
        /* ALREADY BEHIND OR IN FRONT OF YOURSELF, it stays that way: F5 was a
           choice, and freelook turning it into a different one is not asked */
        CameraType now = c.options.getCameraType();
        if (now.isFirstPerson()) {
            before = now;
            c.options.setCameraType(CameraType.THIRD_PERSON_BACK);
        } else {
            before = null;
        }
        active = true;
    }

    /** the view back where it was; safe to call when nothing is on */
    static void stop(Minecraft c) {
        if (!active) return;
        active = false;
        if (before != null && c != null && c.options != null) c.options.setCameraType(before);
        before = null;
    }
}
