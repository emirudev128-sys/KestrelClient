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
 * HUD draws these, and so do the menu cards, the options preview and the
 * layout editor. An editor arranging boxes of a different width from the ones
 * the game will draw is an editor that lies.
 *
 * <p><b>TWO MODES, AND EVERY MENU USES THE SECOND ONE.</b>
 *
 * <ul>
 *   <li>{@link #LIVE} — real values, read from the game. Only the HUD drawn
 *       into the world uses this.</li>
 *   <li>{@link #SAMPLE} — fixed text that never changes. Every menu uses it.</li>
 * </ul>
 *
 * <p><b>WHY A MENU MUST NOT SHOW LIVE VALUES.</b> The first version drew real
 * ones everywhere, so a card previewing the fps counter had a number
 * flickering in it the whole time the menu was open, and the plate under it
 * changed width as the number crossed from 99 to 100. A preview that moves is
 * not a preview — it is motion at the edge of your eye while you are trying to
 * read a menu. In the layout editor it is worse than distracting: an element
 * that changes width under the cursor is one you cannot line up against its
 * neighbours. Fixed text holds still, holds its width, and shows the thing
 * these screens are actually for, which is the STYLE.
 *
 * <p><b>TWO OF THE ELEVEN ARE DRAWN IN THE WORLD.</b> The launcher's HUD
 * screen arranges eleven and writes all eleven to the config; this mod
 * produces live values for {@code fps} and {@code coords} and nothing else
 * yet. That is a real gap and it is stated rather than hidden: {@link #drawn}
 * is the list, and a card the mod cannot honour says "not drawn yet" on its
 * face. The sample text is not what carries that honesty — the card does —
 * which is why every element gets a sample and only some get a value.
 */
final class HudElements {

    private HudElements() { }

    /** real values, read from the game — the world HUD only */
    static final int LIVE = 0;
    /** fixed text that never changes — every menu */
    static final int SAMPLE = 1;

    /** turns a string into text in whichever face the config asked for */
    @FunctionalInterface
    interface Face {
        Text of(String s);
    }

    /* ── WHAT A RUN IS FOR, NOT WHAT COLOUR IT IS ─────────────────────────
       These used to carry a resolved colour, which was fine while the colours
       were two constants. They are per element now, so a run that had already
       decided it was #F1F4F7 could not be repainted when somebody picked red
       — every element would have come out in the launcher's greys whatever
       the config said.

       So a run says what it IS and the renderer decides what that looks like
       against the element's own style. Three roles, and they are the same
       three the typography always had. */
    static final int VALUE = 0;   /* the thing you glance at */
    static final int LABEL = 1;   /* the word that says what it is */
    static final int ACCENT = 2;  /* worth noticing; see below */

    /** one run of text in one role; an element is a few of these in a row */
    static final class Run {
        final Text text;
        final int role;
        Run(Face face, String text, int role) {
            this.text = face.of(text);
            this.role = role;
        }
    }

    /* THE ACCENT STAYS THE ACCENT, and does not follow the element's colour.
       It marks the two cases worth noticing — fps low enough to feel, and the
       compass letter — and a "worth noticing" that is the same colour as
       everything around it has stopped noticing anything. Someone who paints
       their whole HUD amber loses the distinction; that is their choice to
       make and it costs them nothing they had. */
    static int colourOf(int role, HudConfig.Style st) {
        if (role == ACCENT) return Paint.ACCENT;
        return role == LABEL ? st.labelArgb() : st.textArgb();
    }

    /** THE ONES THIS MOD CAN ACTUALLY PRODUCE A VALUE FOR. Everything else in
     *  the config is arranged by the launcher, carried by the file, shown by
     *  the menu, styled by the options screen — and not drawn in the world. */
    static boolean drawn(String name) {
        return "fps".equals(name) || "coords".equals(name);
    }

    /**
     * The content of one element, or null when there is nothing to draw.
     *
     * @param mode {@link #LIVE} for the world HUD, {@link #SAMPLE} for any menu.
     *             In LIVE mode an element this mod cannot draw returns null and
     *             simply is not there; in SAMPLE mode every element has
     *             something to show, because the menu has to be able to style
     *             and position things the world does not draw yet.
     */
    static List<Run> of(String name, HudConfig.Element el, MinecraftClient client, Face face, int mode) {
        if (el == null) return null;
        if (mode == SAMPLE) return sample(name, el, face);
        if (!drawn(name)) return null;

        if ("fps".equals(name)) {
            int fps = client.getCurrentFps();
            List<Run> out = new ArrayList<>(2);
            out.add(new Run(face, Integer.toString(fps), fpsRole(fps)));
            out.add(new Run(face, "FPS", LABEL));
            return out;
        }

        if ("coords".equals(name)) {
            if (client.player == null) return null;
            List<Run> out = new ArrayList<>(7);
            out.add(new Run(face, "X", LABEL));
            out.add(new Run(face, fixed(client.player.getX()), VALUE));
            out.add(new Run(face, "Y", LABEL));
            out.add(new Run(face, fixed(client.player.getY()), VALUE));
            out.add(new Run(face, "Z", LABEL));
            out.add(new Run(face, fixed(client.player.getZ()), VALUE));
            /* THE COMPASS, when asked for. Vanilla puts the facing in F3 and
               nowhere else, so a coordinate readout without it means opening
               the debug screen to answer "which way is north" — which is
               usually the question the coordinates were being read to
               settle. */
            if (el.compass) out.add(new Run(face, cardinal(client.player.getYaw()), ACCENT));
            return out;
        }
        return null;
    }

    /* ── THE SAMPLES ──────────────────────────────────────────────────────
       Fixed, plausible, and chosen to be about the WIDEST the element
       realistically gets rather than the narrowest: a preview that fits neatly
       and then overflows the first time you stand at Z -1403 has told you the
       wrong thing about your layout. So: three-digit fps, a negative Z with a
       decimal, a two-word potion.

       THE ROLE SPLIT IS KEPT, so a sample shows the real typography — value
       bright, label behind it — and therefore shows what a colour change will
       actually look like. That is the whole job of these.

       THE WORDS ARE STILL THE LAUNCHER'S wherever there are any: an armour row
       is named from that element's own label, so the five of them read
       "helmet", "chestplate" and so on without this file keeping a second copy
       of those names to fall out of step. Only the numbers are invented here,
       and a number is not vocabulary. */
    private static List<Run> sample(String name, HudConfig.Element el, Face face) {
        List<Run> out = new ArrayList<>(8);
        switch (name) {
            case "fps":
                out.add(new Run(face, "240", VALUE));
                out.add(new Run(face, "FPS", LABEL));
                return out;
            case "cps":
                out.add(new Run(face, "14", VALUE));
                out.add(new Run(face, "CPS", LABEL));
                return out;
            case "ping":
                out.add(new Run(face, "21", VALUE));
                out.add(new Run(face, "ms", LABEL));
                return out;
            case "coords":
                out.add(new Run(face, "X", LABEL));
                out.add(new Run(face, "118.0", VALUE));
                out.add(new Run(face, "Y", LABEL));
                out.add(new Run(face, "71.0", VALUE));
                out.add(new Run(face, "Z", LABEL));
                out.add(new Run(face, "-403.0", VALUE));
                if (el.compass) out.add(new Run(face, "N", ACCENT));
                return out;
            case "keys":
                out.add(new Run(face, "W A S D", VALUE));
                return out;
            case "potion":
                out.add(new Run(face, "Speed IV", VALUE));
                out.add(new Run(face, "1:00", LABEL));
                return out;
            default:
                /* the five armour slots, and anything the launcher adds later:
                   its own label, and a wear figure to carry the typography */
                out.add(new Run(face, shortLabel(el, name), LABEL));
                out.add(new Run(face, "62%", VALUE));
                return out;
        }
    }

    /** "Armor status · helmet" -> "helmet". The part after the separator is
     *  what differs between the five; where there is no separator the whole
     *  label is already the distinguishing bit. */
    private static String shortLabel(HudConfig.Element el, String name) {
        String s = el.display(name);
        int dot = s.lastIndexOf('·');
        return dot >= 0 ? s.substring(dot + 1).trim() : s;
    }

    /* GREEN IS NOT A COLOUR THIS PALETTE HAS, and inventing one for "good
       fps" would put a hue on screen that appears nowhere in the launcher. So
       the accent marks the case worth noticing — fps low enough to feel — and
       everything healthy stays in the ordinary ink. A HUD that lights up when
       nothing is wrong is a HUD you stop reading. */
    private static int fpsRole(int fps) {
        return fps > 0 && fps < 30 ? ACCENT : VALUE;
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
