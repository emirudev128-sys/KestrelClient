package dev.kestrel.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * THE IN-GAME HALF OF KESTREL.
 *
 * <p>Reads {@code <instance>/config/kestrel-hud.json} — written by the
 * launcher — and draws the elements it turns on.
 *
 * <p><b>NO NETWORK, AND NOTHING TOLD TO A SERVER.</b> Kestrel's claim is that
 * it never talks to a game server and has nothing to disclose. A client mod
 * is exactly where that could quietly stop being true — mods register plugin
 * channels routinely and a HUD has no business doing so. This one opens no
 * channel, registers no packet handler and makes no request.
 */
public class KestrelHudClient implements ClientModInitializer {

    public static final String MOD_ID = "kestrel-hud";
    public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

    /* Kestrel's own face, used only when the config asks for it. The default
       is Minecraft's, because a HUD that looks like the game costs a new
       player nothing to read; ours is the deliberate choice, not the imposed
       one. See assets/kestrel-hud/font/kestrel.json. */
    private static final Identifier FONT = Identifier.of(MOD_ID, "kestrel");

    private HudConfig config;

    @Override
    public void onInitializeClient() {
        config = HudConfig.read(FabricLoader.getInstance().getGameDir());
        LOG.info("Kestrel HUD: {} element(s) configured, {} corners, {} font",
            config.count(), config.rounded ? "rounded" : "sharp",
            config.kestrelFont ? "Kestrel" : "Minecraft");
        HudRenderCallback.EVENT.register(this::draw);
    }

    private Text face(String s) {
        return config.kestrelFont
            ? Text.literal(s).styled(st -> st.withFont(FONT))
            : Text.literal(s);
    }

    /** one run of text in one colour; an element is a few of these in a row */
    private final class Run {
        final Text text;
        final int colour;
        Run(String text, int colour) { this.text = face(text); this.colour = colour; }
    }

    /** a placed element, kept so the next one can avoid sitting on it */
    private static final class Box {
        final double x, y, w, h;
        Box(double x, double y, double w, double h) { this.x = x; this.y = y; this.w = w; this.h = h; }
        boolean hits(Box o) {
            return x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y;
        }
    }

    private void draw(DrawContext ctx, Object tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.textRenderer == null) return;
        /* the HUD belongs to the world: nothing over a menu, and F1 means F1 */
        if (client.player == null || client.currentScreen != null) return;
        if (client.options != null && client.options.hudHidden) return;

        /* WHAT IS ALREADY ON SCREEN, so nothing lands on top of anything.
           Rebuilt every frame: the elements move, and a stale rectangle would
           push this frame's element out of the way of last frame's. */
        List<Box> placed = new ArrayList<>();

        int fps = MinecraftClient.getInstance().getCurrentFps();
        List<Run> f = new ArrayList<>();
        f.add(new Run(Integer.toString(fps), fpsColour(fps)));
        f.add(new Run("FPS", Paint.LABEL));
        element(ctx, client, "fps", f, placed);

        HudConfig.Element co = config.get("coords");
        List<Run> pos = new ArrayList<>();
        pos.add(new Run("X", Paint.LABEL));
        pos.add(new Run(fixed(client.player.getX()), Paint.VALUE));
        pos.add(new Run("Y", Paint.LABEL));
        pos.add(new Run(fixed(client.player.getY()), Paint.VALUE));
        pos.add(new Run("Z", Paint.LABEL));
        pos.add(new Run(fixed(client.player.getZ()), Paint.VALUE));
        /* THE COMPASS, when asked for. Vanilla puts the facing in F3 and
           nowhere else, so a coordinate readout without it means opening the
           debug screen to answer "which way is north" — which is usually the
           question the coordinates were being read to settle. */
        if (co != null && co.compass) {
            pos.add(new Run(cardinal(client.player.getYaw()), Paint.ACCENT));
        }
        element(ctx, client, "coords", pos, placed);
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
        return String.format("%.1f", v);
    }

    /* Minecraft's yaw is 0 at SOUTH and grows clockwise, which is why mapping
       it naively onto compass points puts north where south is. Wrapped to
       -180..180 first, then shifted and rounded into eight 45-degree sectors. */
    private static String cardinal(float yaw) {
        int i = MathHelper.floor((MathHelper.wrapDegrees(yaw) + 180.0f) / 45.0f + 0.5f) & 7;
        return new String[] { "N", "NE", "E", "SE", "S", "SW", "W", "NW" }[i];
    }

    /* ── one element: place it, avoid what is already there, then draw ──── */
    private void element(DrawContext ctx, MinecraftClient client, String name, List<Run> runs, List<Box> placed) {
        HudConfig.Element el = config.get(name);
        if (el == null || !el.on || runs.isEmpty()) return;

        int inner = 0;
        for (int i = 0; i < runs.size(); i++) {
            inner += client.textRenderer.getWidth(runs.get(i).text);
            if (i < runs.size() - 1) inner += Paint.GAP;
        }
        int w = inner + Paint.PAD_X * 2;
        int h = Paint.LINE + Paint.PAD_Y * 2;

        int sw = ctx.getScaledWindowWidth();
        int sh = ctx.getScaledWindowHeight();
        double bw = w * el.scale;
        double bh = h * el.scale;

        /* the anchor decides what x and y mean: the offset runs inward from
           the edge it names, and the element's own size comes off a right or
           bottom anchor so the box stays on screen */
        double ox = sw * el.x / 100.0;
        double oy = sh * el.y / 100.0;
        char vert = el.anchor.charAt(0);
        char horiz = el.anchor.charAt(1);

        double px = horiz == 'l' ? ox : horiz == 'r' ? sw - ox - bw : (sw - bw) / 2.0 + ox;
        double py = vert == 't' ? oy : vert == 'b' ? sh - oy - bh : (sh - bh) / 2.0 + oy;

        /* ── NOTHING SITS ON TOP OF ANYTHING ──────────────────────────────
           Two elements sent to the same corner used to overlap into an
           unreadable smear. The second one now moves clear of the first —
           downward, because a HUD reads as a column and pushing sideways
           would walk it off a right-hand anchor.

           A BOTTOM ANCHOR PUSHES UPWARD instead: at the bottom of the screen
           "underneath the last one" means further from the edge, not off it.
           The guard bounds the search so a pathological config cannot spin. */
        final boolean upward = vert == 'b';
        Box box = new Box(px, py, bw, bh);
        for (int guard = 0; guard < 16; guard++) {
            Box clash = null;
            for (Box o : placed) { if (box.hits(o)) { clash = o; break; } }
            if (clash == null) break;
            double ny = upward ? clash.y - bh - Paint.STACK_GAP : clash.y + clash.h + Paint.STACK_GAP;
            box = new Box(px, ny, bw, bh);
        }
        px = Math.max(0, Math.min(box.x, sw - bw));
        py = Math.max(0, Math.min(box.y, sh - bh));
        placed.add(new Box(px, py, bw, bh));

        ctx.getMatrices().push();
        ctx.getMatrices().translate(px, py, 0);
        if (el.scale != 1.0) ctx.getMatrices().scale((float) el.scale, (float) el.scale, 1.0f);

        plate(ctx, w, h, config.rounded);

        int x = Paint.PAD_X;
        for (Run r : runs) {
            /* NO SHADOW: the plate already holds the text apart from the
               world, and over a plate a shadow is a smeared second copy of
               every glyph — blur pretending to be depth. */
            ctx.drawText(client.textRenderer, r.text, x, Paint.PAD_Y, r.colour, false);
            x += client.textRenderer.getWidth(r.text) + Paint.GAP;
        }
        ctx.getMatrices().pop();
    }

    /* ── the plate ─────────────────────────────────────────────────────────
       SHARP IS THE DEFAULT, because Minecraft's own interface is square:
       every vanilla panel, tooltip and inventory slot has a hard corner, so a
       square plate is the one that looks like it belongs on that screen.

       ROUNDED is the same rectangle with its four corner pixels omitted,
       drawn as three fills instead of one. Minecraft has no rounded-rectangle
       primitive, and faking one with a texture would mean shipping an asset
       for a single pixel. */
    private static void plate(DrawContext ctx, int w, int h, boolean rounded) {
        if (!rounded) {
            ctx.fill(0, 0, w, h, Paint.PLATE);
            ctx.fill(0, 0, w, 1, Paint.EDGE);
            ctx.fill(0, h - 1, w, h, Paint.EDGE);
            ctx.fill(0, 1, 1, h - 1, Paint.EDGE);
            ctx.fill(w - 1, 1, w, h - 1, Paint.EDGE);
            return;
        }
        ctx.fill(1, 0, w - 1, 1, Paint.PLATE);
        ctx.fill(0, 1, w, h - 1, Paint.PLATE);
        ctx.fill(1, h - 1, w - 1, h, Paint.PLATE);

        ctx.fill(1, 0, w - 1, 1, Paint.EDGE);
        ctx.fill(1, h - 1, w - 1, h, Paint.EDGE);
        ctx.fill(0, 1, 1, h - 1, Paint.EDGE);
        ctx.fill(w - 1, 1, w, h - 1, Paint.EDGE);
    }
}
