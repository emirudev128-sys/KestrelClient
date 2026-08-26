package dev.kestrel.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * THE IN-GAME HALF OF KESTREL.
 *
 * <p>Reads {@code <instance>/config/kestrel-hud.json} — written by the
 * launcher — and draws the elements it turns on, in the launcher's own
 * palette so the two halves look like one product.
 *
 * <p><b>NO NETWORK, AND NOTHING TOLD TO A SERVER.</b> Kestrel's claim is that
 * it never talks to a game server and has nothing to disclose. A client mod
 * is exactly where that could quietly stop being true — mods register plugin
 * channels routinely and a HUD has no business doing so. This one opens no
 * channel, registers no packet handler and makes no request. It reads a file
 * at startup and draws text.
 */
public class KestrelHudClient implements ClientModInitializer {

    public static final String MOD_ID = "kestrel-hud";
    public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

    private HudConfig config;

    @Override
    public void onInitializeClient() {
        config = HudConfig.read(FabricLoader.getInstance().getGameDir());
        LOG.info("Kestrel HUD: {} element(s) configured", config.count());
        HudRenderCallback.EVENT.register(this::draw);
    }

    /** one run of text in one colour; an element is a few of these in a row */
    private static final class Run {
        final String text;
        final int colour;
        Run(String text, int colour) { this.text = text; this.colour = colour; }
    }

    private void draw(DrawContext ctx, Object tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.textRenderer == null) return;
        /* the HUD belongs to the world: nothing over a menu, and F1 means F1 */
        if (client.player == null || client.currentScreen != null) return;
        if (client.options != null && client.options.hudHidden) return;

        /* ── fps ──────────────────────────────────────────────────────────
           The number first and large-looking, the unit after it in the muted
           tone. "240 FPS" reads as a measurement; "FPS 240" reads as a label
           somebody forgot to align. */
        int fps = MinecraftClient.getInstance().getCurrentFps();
        List<Run> fpsRuns = new ArrayList<>();
        fpsRuns.add(new Run(Integer.toString(fps), fpsColour(fps)));
        fpsRuns.add(new Run("FPS", Paint.LABEL));
        element(ctx, client, "fps", fpsRuns);

        /* ── coords ───────────────────────────────────────────────────────
           Axis letters in the muted tone, numbers in the bright one, so the
           eye lands on the digits and the letters stay available when you
           need to know which is which. */
        List<Run> pos = new ArrayList<>();
        pos.add(new Run("X", Paint.LABEL));
        pos.add(new Run(fixed(client.player.getX()), Paint.VALUE));
        pos.add(new Run("Y", Paint.LABEL));
        pos.add(new Run(fixed(client.player.getY()), Paint.VALUE));
        pos.add(new Run("Z", Paint.LABEL));
        pos.add(new Run(fixed(client.player.getZ()), Paint.VALUE));
        element(ctx, client, "coords", pos);
    }

    /* GREEN IS NOT A COLOUR THIS PALETTE HAS, and inventing one for "good
       fps" would put a hue on screen that appears nowhere in the launcher.
       So the accent — the one warm thing in Kestrel — marks the case worth
       noticing, which is fps low enough to feel, and everything healthy stays
       in the ordinary ink. A HUD that lights up when nothing is wrong is a
       HUD you stop reading. */
    private static int fpsColour(int fps) {
        return fps > 0 && fps < 30 ? Paint.ACCENT : Paint.VALUE;
    }

    private static String fixed(double v) {
        return String.format("%.1f", v);
    }

    /* ── one element: a plate, then its runs ───────────────────────────── */
    private void element(DrawContext ctx, MinecraftClient client, String name, List<Run> runs) {
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

        /* the anchor decides what x and y mean; the offset runs inward from
           the edge it names, and the element's own size comes off a right or
           bottom anchor so the box stays on screen rather than starting at
           the edge and running past it */
        double ox = sw * el.x / 100.0;
        double oy = sh * el.y / 100.0;
        char vert = el.anchor.charAt(0);
        char horiz = el.anchor.charAt(1);

        double px = horiz == 'l' ? ox : horiz == 'r' ? sw - ox - bw : (sw - bw) / 2.0 + ox;
        double py = vert == 't' ? oy : vert == 'b' ? sh - oy - bh : (sh - bh) / 2.0 + oy;
        px = Math.max(0, Math.min(px, sw - bw));
        py = Math.max(0, Math.min(py, sh - bh));

        ctx.getMatrices().push();
        ctx.getMatrices().translate(px, py, 0);
        if (el.scale != 1.0) ctx.getMatrices().scale((float) el.scale, (float) el.scale, 1.0f);

        plate(ctx, w, h);

        int x = Paint.PAD_X;
        for (Run r : runs) {
            ctx.drawTextWithShadow(client.textRenderer, Text.literal(r.text), x, Paint.PAD_Y, r.colour);
            x += client.textRenderer.getWidth(r.text) + Paint.GAP;
        }
        ctx.getMatrices().pop();
    }

    /* ── the plate ─────────────────────────────────────────────────────────
       Minecraft has no rounded rectangle, and faking one with a texture would
       mean shipping an asset for a 1px corner. Chamfering instead — the fill
       is drawn as three rectangles so the four corner pixels are simply
       absent — costs nothing and reads as a rounded chip at every scale.

       The border is drawn as four 1px fills for the same reason, and inset by
       the same pixel so the corners stay clipped. */
    private static void plate(DrawContext ctx, int w, int h) {
        ctx.fill(1, 0, w - 1, 1, Paint.PLATE);          /* top strip, corners cut */
        ctx.fill(0, 1, w, h - 1, Paint.PLATE);          /* the body, full width  */
        ctx.fill(1, h - 1, w - 1, h, Paint.PLATE);      /* bottom strip          */

        ctx.fill(1, 0, w - 1, 1, Paint.EDGE);           /* top    */
        ctx.fill(1, h - 1, w - 1, h, Paint.EDGE);       /* bottom */
        ctx.fill(0, 1, 1, h - 1, Paint.EDGE);           /* left   */
        ctx.fill(w - 1, 1, w, h - 1, Paint.EDGE);       /* right  */
    }
}
