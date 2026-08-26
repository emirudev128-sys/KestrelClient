package dev.kestrel.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;
import net.minecraft.util.math.MathHelper;

import java.util.ArrayList;
import java.util.List;

/**
 * WHAT EACH ELEMENT SAYS.
 *
 * <p>Split out of the render loop the day a second screen needed it: the live
 * HUD draws these, and so does the layout editor, and an editor arranging
 * boxes of a different width from the ones the game will draw is an editor
 * that lies about where things will land.
 *
 * <p><b>TWO OF THE ELEVEN ARE DRAWN.</b> The launcher's HUD screen arranges
 * eleven and writes all eleven to the config; this mod produces live content
 * for {@code fps} and {@code coords} and nothing else yet. That is a real gap
 * and it is stated rather than hidden — {@link #drawn} is the list, the menu
 * marks the rows it covers, and the layout editor draws the rest as named
 * placeholders so they can still be positioned for when they do arrive.
 *
 * <p><b>A PLACEHOLDER SHOWS THE LABEL, NOT INVENTED DATA.</b> The obvious
 * thing was a plausible sample — {@code 21 ms}, {@code 14 CPS}, the way the
 * launcher's own preview does it. In the launcher that is honest, because the
 * whole screen is a preview. In the GAME it would not be: a plate reading
 * {@code 21 ms} on top of the world is indistinguishable from a ping display
 * that works, and the player would find out it never appears in-world by
 * closing the editor. The label in the muted ink cannot be mistaken for a
 * reading.
 */
final class HudElements {

    private HudElements() { }

    /** turns a string into text in whichever face the config asked for */
    @FunctionalInterface
    interface Face {
        Text of(String s);
    }

    /** one run of text in one colour; an element is a few of these in a row */
    static final class Run {
        final Text text;
        final int colour;
        Run(Face face, String text, int colour) {
            this.text = face.of(text);
            this.colour = colour;
        }
    }

    /** THE ONES THIS MOD CAN ACTUALLY PRODUCE A VALUE FOR. Everything else in
     *  the config is arranged by the launcher, carried by the file, listed by
     *  the menu — and not drawn. */
    static boolean drawn(String name) {
        return "fps".equals(name) || "coords".equals(name);
    }

    /**
     * The content of one element, or null when there is nothing to draw.
     *
     * @param placeholder when true, an element this mod cannot draw comes back
     *                    as its own label in the muted ink instead of null.
     *                    The editor asks for that; the live HUD does not.
     */
    static List<Run> of(String name, HudConfig.Element el, MinecraftClient client, Face face, boolean placeholder) {
        if (el == null) return null;

        if ("fps".equals(name)) {
            int fps = client.getCurrentFps();
            List<Run> out = new ArrayList<>(2);
            out.add(new Run(face, Integer.toString(fps), fpsColour(fps)));
            out.add(new Run(face, "FPS", Paint.LABEL));
            return out;
        }

        if ("coords".equals(name)) {
            if (client.player == null) return placeholder ? label(el, name, face) : null;
            List<Run> out = new ArrayList<>(7);
            out.add(new Run(face, "X", Paint.LABEL));
            out.add(new Run(face, fixed(client.player.getX()), Paint.VALUE));
            out.add(new Run(face, "Y", Paint.LABEL));
            out.add(new Run(face, fixed(client.player.getY()), Paint.VALUE));
            out.add(new Run(face, "Z", Paint.LABEL));
            out.add(new Run(face, fixed(client.player.getZ()), Paint.VALUE));
            /* THE COMPASS, when asked for. Vanilla puts the facing in F3 and
               nowhere else, so a coordinate readout without it means opening
               the debug screen to answer "which way is north" — which is
               usually the question the coordinates were being read to
               settle. */
            if (el.compass) out.add(new Run(face, cardinal(client.player.getYaw()), Paint.ACCENT));
            return out;
        }

        return placeholder ? label(el, name, face) : null;
    }

    private static List<Run> label(HudConfig.Element el, String name, Face face) {
        List<Run> out = new ArrayList<>(1);
        out.add(new Run(face, el.display(name), Paint.MUTE));
        return out;
    }

    /* GREEN IS NOT A COLOUR THIS PALETTE HAS, and inventing one for "good
       fps" would put a hue on screen that appears nowhere in the launcher. So
       the accent marks the case worth noticing — fps low enough to feel — and
       everything healthy stays in the ordinary ink. A HUD that lights up when
       nothing is wrong is a HUD you stop reading. */
    private static int fpsColour(int fps) {
        return fps > 0 && fps < 30 ? Paint.ACCENT : Paint.VALUE;
    }

    private static String fixed(double v) {
        return String.format(java.util.Locale.ROOT, "%.1f", v);
    }

    /* Minecraft's yaw is 0 at SOUTH and grows clockwise, which is why mapping
       it naively onto compass points puts north where south is. Wrapped to
       -180..180 first, then shifted and rounded into eight 45-degree sectors. */
    private static String cardinal(float yaw) {
        int i = MathHelper.floor((MathHelper.wrapDegrees(yaw) + 180.0f) / 45.0f + 0.5f) & 7;
        return new String[] { "N", "NE", "E", "SE", "S", "SW", "W", "NW" }[i];
    }
}
