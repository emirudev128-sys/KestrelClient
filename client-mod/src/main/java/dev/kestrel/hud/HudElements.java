package dev.kestrel.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.item.ItemStack;
import net.minecraft.text.Text;
import net.minecraft.util.math.MathHelper;

import java.util.ArrayList;
import java.util.List;

/**
 * WHAT EACH ELEMENT SAYS.
 *
 * <p>The live HUD draws these, and so do the menu cards, the options preview
 * and the layout editor. An editor arranging boxes of a different width from
 * the ones the game will draw is an editor that lies.
 *
 * <p><b>AN ELEMENT IS ROWS, NOT A ROW.</b> This returned a single list of runs
 * until nine more elements needed drawing and three of them did not fit:
 * potion effects is one line per effect, a keystroke display is a grid, and
 * armour is a label beside a wear bar. Rather than special-case those in the
 * renderer, an element is now a LIST OF ROWS and a row is a list of runs. An
 * element with one row is the ordinary case and costs one extra list.
 *
 * <p><b>A RUN IS TEXT OR A BAR.</b> Durability is the one thing here that is
 * a quantity rather than a word, and writing {@code 62%} where a bar belongs
 * makes you read a number to learn something the eye gets instantly. The two
 * kinds share a width so the renderer does not have to know which is which
 * until it draws.
 *
 * <p><b>TWO MODES, AND EVERY MENU USES THE SECOND.</b> {@link #LIVE} reads the
 * game; {@link #SAMPLE} is fixed text that never changes. A card previewing
 * the fps counter with a live value flickers the whole time the menu is open
 * and changes width as the number crosses 100 — motion at the edge of your eye
 * while you are trying to read a menu. In the layout editor it is worse: an
 * element that changes width under the cursor is one you cannot line up.
 *
 * <p><b>THE OPTIONS ARE THE LAUNCHER'S, READ NOT INVENTED.</b> Which buttons
 * the CPS counter counts, whether coordinates carry a compass, whether armour
 * shows a bar or a number — all of it comes off {@code el.opts}, declared in
 * {@code mc/hud.js} and carried in the document. Nothing here has an opinion
 * about what an option means beyond how to draw it.
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
       A run used to carry a resolved colour, which was fine while the colours
       were two constants. They are per element now, so a run that had already
       decided it was #F1F4F7 could not be repainted when somebody picked red. */
    static final int VALUE = 0;   /* the thing you glance at */
    static final int LABEL = 1;   /* the word that says what it is */
    static final int ACCENT = 2;  /* worth noticing; see below */

    /** one run: a piece of text, or a bar with a fill from 0 to 1 */
    static final class Run {
        final Text text;        /* null for a bar */
        final int role;
        final double fill;      /* bars only */
        final int width;        /* bars only, in unscaled pixels */

        Run(Face face, String text, int role) {
            this.text = face.of(text);
            this.role = role;
            this.fill = -1;
            this.width = 0;
        }

        private Run(double fill, int width, int role) {
            this.text = null;
            this.role = role;
            this.fill = fill < 0 ? 0 : (fill > 1 ? 1 : fill);
            this.width = width;
        }

        static Run bar(double fill, int width) { return new Run(fill, width, VALUE); }

        boolean isBar() { return text == null; }
    }

    private static List<Run> row(Run... runs) {
        List<Run> r = new ArrayList<>(runs.length);
        for (Run x : runs) r.add(x);
        return r;
    }

    private static List<List<Run>> one(List<Run> r) {
        List<List<Run>> out = new ArrayList<>(1);
        out.add(r);
        return out;
    }

    /* THE ACCENT STAYS THE ACCENT and does not follow the element's colour.
       It marks the cases worth noticing — fps low enough to feel, a compass
       letter, armour nearly broken — and a "worth noticing" that is the same
       colour as everything around it has stopped noticing anything. */
    static int colourOf(int role, HudConfig.Style st) {
        if (role == ACCENT) return Paint.ACCENT;
        return role == LABEL ? st.labelArgb() : st.textArgb();
    }

    /** THE ONES THIS MOD CAN PRODUCE A LIVE VALUE FOR. Everything the launcher
     *  arranges that is not here is still carried, listed, styled and
     *  positioned — it just does not appear in the world. */
    private static final List<String> DRAWN = List.of(
        "fps", "cps", "ping", "keys", "coords", "potion",
        "helmet", "chest", "legs", "boots", "held");

    static boolean drawn(String name) {
        return DRAWN.contains(name);
    }

    /** which inventory slot each armour element reads, -1 for the held item */
    private static int slotOf(String name) {
        switch (name) {
            case "boots": return 0;
            case "legs": return 1;
            case "chest": return 2;
            case "helmet": return 3;
            default: return -1;
        }
    }

    /**
     * The rows of one element, or null when there is nothing to draw.
     *
     * @param mode {@link #LIVE} for the world HUD, {@link #SAMPLE} for a menu.
     */
    static List<List<Run>> of(String name, HudConfig.Element el, MinecraftClient client, Face face, int mode) {
        if (el == null) return null;
        if (mode == SAMPLE) return sample(name, el, face);
        if (!drawn(name)) return null;
        if (client == null) return null;

        switch (name) {
            case "fps": {
                int fps = client.getCurrentFps();
                return one(row(new Run(face, Integer.toString(fps), fpsRole(fps)),
                    new Run(face, "FPS", LABEL)));
            }
            case "cps": {
                int n = Clicks.count(el.choice("buttons", "left"));
                return one(row(new Run(face, Integer.toString(n), VALUE),
                    new Run(face, "CPS", LABEL)));
            }
            case "ping": {
                /* SINGLEPLAYER HAS NO PING, and inventing 0 would be a reading
                   that looks like a very good connection. An em dash says the
                   question does not apply here. */
                int ms = latency(client);
                List<Run> r = ms < 0
                    ? row(new Run(face, "—", LABEL))
                    : row(new Run(face, Integer.toString(ms), pingRole(ms)));
                if (ms >= 0 && el.flag("unit")) r.add(new Run(face, "ms", LABEL));
                return one(r);
            }
            case "keys": return keys(el, client, face, false);
            case "coords": {
                if (client.player == null) return null;
                boolean p = el.flag("precise");
                List<Run> r = row(
                    new Run(face, "X", LABEL), new Run(face, fixed(client.player.getX(), p), VALUE),
                    new Run(face, "Y", LABEL), new Run(face, fixed(client.player.getY(), p), VALUE),
                    new Run(face, "Z", LABEL), new Run(face, fixed(client.player.getZ(), p), VALUE));
                /* THE COMPASS, when asked for. Vanilla puts the facing in F3
                   and nowhere else, so a coordinate readout without it means
                   opening the debug screen to answer "which way is north" —
                   usually the question the coordinates were read to settle. */
                if (el.flag("compass")) r.add(new Run(face, cardinal(client.player.getYaw()), ACCENT));
                List<List<Run>> out = one(r);
                if (el.flag("biome")) out.add(row(new Run(face, biome(client), LABEL)));
                return out;
            }
            case "potion": return potions(el, client, face, false);
            default: return armour(name, el, client, face, false);
        }
    }

    /* ── keystrokes ───────────────────────────────────────────────────────
       A grid of key caps, expressed as rows: W over A S D, then the mouse and
       the spacebar if they were asked for. A pressed key is the VALUE ink and
       an idle one is the LABEL ink, which is the same two-tone split the rest
       of the HUD uses rather than a third idea about highlighting. */
    private static List<List<Run>> keys(HudConfig.Element el, MinecraftClient c, Face face, boolean fake) {
        List<List<Run>> out = new ArrayList<>(4);
        boolean w = fake, a = fake, s = false, d = fake, sp = false, lmb = fake, rmb = false;
        if (!fake && c != null && c.options != null) {
            w = c.options.forwardKey.isPressed();
            a = c.options.leftKey.isPressed();
            s = c.options.backKey.isPressed();
            d = c.options.rightKey.isPressed();
            sp = c.options.jumpKey.isPressed();
            lmb = c.options.attackKey.isPressed();
            rmb = c.options.useKey.isPressed();
        }
        out.add(row(new Run(face, "W", w ? VALUE : LABEL)));
        out.add(row(new Run(face, "A", a ? VALUE : LABEL),
            new Run(face, "S", s ? VALUE : LABEL),
            new Run(face, "D", d ? VALUE : LABEL)));
        if (el.flag("mouse")) {
            /* the CPS-on-the-buttons option, which is why a keystroke display
               and a CPS counter are two elements that can say the same thing */
            String l = el.flag("cps") ? Integer.toString(fake ? 7 : Clicks.count("left")) : "LMB";
            String r = el.flag("cps") ? Integer.toString(fake ? 2 : Clicks.count("right")) : "RMB";
            out.add(row(new Run(face, l, lmb ? VALUE : LABEL), new Run(face, r, rmb ? VALUE : LABEL)));
        }
        if (el.flag("space")) out.add(row(new Run(face, "SPACE", sp ? VALUE : LABEL)));
        return out;
    }

    /* ── potion effects ───────────────────────────────────────────────────
       One row per effect, and NOTHING AT ALL when there are none: an empty
       plate sitting in the corner saying nothing is worse than no plate. */
    private static List<List<Run>> potions(HudConfig.Element el, MinecraftClient c, Face face, boolean fake) {
        List<List<Run>> out = new ArrayList<>(4);
        if (fake) {
            out.add(row(new Run(face, "Speed IV", VALUE), new Run(face, "1:00", LABEL)));
            out.add(row(new Run(face, "Strength II", VALUE), new Run(face, "0:41", LABEL)));
            return out;
        }
        if (c == null || c.player == null) return null;
        for (StatusEffectInstance e : c.player.getStatusEffects()) {
            if (e == null) continue;
            if (e.isAmbient() && !el.flag("ambient")) continue;
            String nm = Text.translatable(e.getEffectType().value().getTranslationKey()).getString();
            int amp = e.getAmplifier();
            if (amp > 0) nm = nm + " " + roman(amp + 1);
            List<Run> r = row(new Run(face, nm, VALUE));
            if (el.flag("duration") && !e.isInfinite()) {
                r.add(new Run(face, clock(e.getDuration()), LABEL));
            }
            out.add(r);
        }
        return out.isEmpty() ? null : out;
    }

    /* ── armour and the held item ─────────────────────────────────────────
       The launcher's own label, then the wear. `bar` is the default because
       durability is a quantity: a bar is read at a glance and 62% has to be
       read. `none` is for somebody who wants the slot named and nothing else.

       AN EMPTY SLOT DRAWS NOTHING. A row saying "Helmet" with an empty bar is
       a row telling you about equipment you are not wearing. */
    private static List<List<Run>> armour(String name, HudConfig.Element el, MinecraftClient c, Face face, boolean fake) {
        String label = shortLabel(el, name);
        if (fake) {
            List<Run> r = row(new Run(face, label, LABEL));
            addWear(r, el, 0.62, face);
            return one(r);
        }
        if (c == null || c.player == null) return null;
        int slot = slotOf(name);
        ItemStack st = slot < 0 ? c.player.getMainHandStack() : c.player.getInventory().getArmorStack(slot);
        if (st == null || st.isEmpty()) return null;

        List<Run> r = row(new Run(face, st.getName().getString(), VALUE));
        if (st.isDamageable()) {
            double left = 1.0 - (double) st.getDamage() / (double) st.getMaxDamage();
            addWear(r, el, left, face);
        }
        return one(r);
    }

    private static void addWear(List<Run> r, HudConfig.Element el, double left, Face face) {
        String how = el.choice("wear", "bar");
        if ("none".equals(how)) return;
        if ("percent".equals(how)) {
            r.add(new Run(face, Math.round(left * 100) + "%", left < 0.15 ? ACCENT : LABEL));
            return;
        }
        r.add(Run.bar(left, 24));
    }

    /* ── THE SAMPLES ──────────────────────────────────────────────────────
       Fixed, and chosen to be about the WIDEST the element realistically gets
       rather than the narrowest: a preview that fits neatly and then overflows
       the first time you stand at Z -1403 has told you the wrong thing about
       your layout. The role split is kept, so a sample shows the real
       typography and therefore what a colour change will look like.

       THE WORDS ARE STILL THE LAUNCHER'S wherever there are any — an armour
       row names itself from its own label. Only the numbers are invented, and
       a number is not vocabulary. */
    private static List<List<Run>> sample(String name, HudConfig.Element el, Face face) {
        switch (name) {
            case "fps":
                return one(row(new Run(face, "240", VALUE), new Run(face, "FPS", LABEL)));
            case "cps":
                return one(row(new Run(face, "14", VALUE), new Run(face, "CPS", LABEL)));
            case "ping": {
                List<Run> r = row(new Run(face, "21", VALUE));
                if (el.flag("unit")) r.add(new Run(face, "ms", LABEL));
                return one(r);
            }
            case "keys": return keys(el, null, face, true);
            case "coords": {
                boolean p = el.flag("precise");
                List<Run> r = row(
                    new Run(face, "X", LABEL), new Run(face, p ? "118.0" : "118", VALUE),
                    new Run(face, "Y", LABEL), new Run(face, p ? "71.0" : "71", VALUE),
                    new Run(face, "Z", LABEL), new Run(face, p ? "-403.0" : "-403", VALUE));
                if (el.flag("compass")) r.add(new Run(face, "N", ACCENT));
                List<List<Run>> out = one(r);
                if (el.flag("biome")) out.add(row(new Run(face, "Snowy taiga", LABEL)));
                return out;
            }
            case "potion": return potions(el, null, face, true);
            default: return armour(name, el, null, face, true);
        }
    }

    /** "Armor status · helmet" -> "helmet" */
    private static String shortLabel(HudConfig.Element el, String name) {
        String s = el.display(name);
        int dot = s.lastIndexOf('·');
        return dot >= 0 ? s.substring(dot + 1).trim() : s;
    }

    /* GREEN IS NOT A COLOUR THIS PALETTE HAS, and inventing one for "good fps"
       would put a hue on screen that appears nowhere in the launcher. The
       accent marks the case worth noticing and everything healthy stays in the
       ordinary ink — a HUD that lights up when nothing is wrong is a HUD you
       stop reading. */
    private static int fpsRole(int fps) {
        return fps > 0 && fps < 30 ? ACCENT : VALUE;
    }

    /* same rule, and 150ms is where a hit stops registering when you expect it */
    private static int pingRole(int ms) {
        return ms >= 150 ? ACCENT : VALUE;
    }

    private static int latency(MinecraftClient c) {
        try {
            if (c.getNetworkHandler() == null || c.player == null) return -1;
            var e = c.getNetworkHandler().getPlayerListEntry(c.player.getUuid());
            if (e == null) return -1;
            /* a single-player integrated server reports 0, which is not a ping */
            if (c.isInSingleplayer()) return -1;
            return Math.max(0, e.getLatency());
        } catch (Exception ex) {
            return -1;
        }
    }

    private static String biome(MinecraftClient c) {
        try {
            if (c.world == null || c.player == null) return "";
            return c.world.getBiome(c.player.getBlockPos())
                .getKey().map(k -> pretty(k.getValue().getPath())).orElse("");
        } catch (Exception ex) {
            return "";
        }
    }

    /** snowy_taiga -> Snowy taiga */
    private static String pretty(String s) {
        String t = s.replace('_', ' ');
        return t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1);
    }

    private static String fixed(double v, boolean precise) {
        return precise ? String.format(java.util.Locale.ROOT, "%.1f", v)
            : Integer.toString(MathHelper.floor(v));
    }

    /** ticks -> m:ss, the way the inventory screen writes an effect */
    private static String clock(int ticks) {
        int s = Math.max(0, ticks) / 20;
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    private static final String[] ROMAN = { "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X" };

    private static String roman(int n) {
        return n > 0 && n < ROMAN.length ? ROMAN[n] : Integer.toString(n);
    }

    /* Minecraft's yaw is 0 at SOUTH and grows clockwise, which is why mapping
       it naively onto compass points puts north where south is. Wrapped to
       -180..180 first, then shifted and rounded into eight 45-degree sectors. */
    private static String cardinal(float yaw) {
        int i = MathHelper.floor((MathHelper.wrapDegrees(yaw) + 180.0f) / 45.0f + 0.5f) & 7;
        return new String[] { "N", "NE", "E", "SE", "S", "SW", "W", "NW" }[i];
    }
}
