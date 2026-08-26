package dev.kestrel.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * THE IN-GAME HALF OF KESTREL.
 *
 * <p>The launcher has had a HUD screen for a while and nothing to draw what
 * it configured. This is that. It reads
 * {@code <instance>/config/kestrel-hud.json} — written by the launcher — and
 * draws the elements it turns on.
 *
 * <p><b>WHY A MOD AT ALL.</b> A launcher cannot draw inside the game: it is a
 * separate process that exits, or hides, the moment the game starts. Anything
 * on screen while you are playing has to run inside that JVM, which means it
 * is a Fabric mod and a different project in a different language.
 *
 * <p><b>NO NETWORK, AND NOTHING TOLD TO A SERVER.</b> Kestrel's claim is that
 * it never talks to a game server and has nothing to disclose. A client mod
 * is exactly where that claim could quietly stop being true — mods routinely
 * register plugin channels, and a HUD has no business doing so. This one
 * opens no channel, registers no packet handler and makes no request. It
 * reads a file at startup and draws text. A server cannot tell it is here.
 */
public class KestrelHudClient implements ClientModInitializer {

    public static final String MOD_ID = "kestrel-hud";
    public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

    /** the line height the vanilla font draws at scale 1 */
    private static final int LINE = 9;

    /** Read once at startup. The launcher writes this file before it starts
     *  the game, so re-reading it every frame would be a hundred stat calls a
     *  second to observe a change that cannot happen while the game runs. */
    private HudConfig config;

    @Override
    public void onInitializeClient() {
        config = HudConfig.read(FabricLoader.getInstance().getGameDir());
        LOG.info("Kestrel HUD: {} element(s) configured", config.count());
        HudRenderCallback.EVENT.register(this::draw);
    }

    private void draw(DrawContext ctx, Object tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.textRenderer == null) return;
        /* nothing is drawn over a menu: the HUD belongs to the world, and a
           player in the options screen did not ask to read their coordinates */
        if (client.player == null || client.currentScreen != null) return;
        if (client.options != null && client.options.hudHidden) return;

        drawElement(ctx, client, "fps", "FPS " + MinecraftClient.getInstance().getCurrentFps());

        HudConfig.Element coords = config.get("coords");
        if (coords != null && coords.on) {
            drawElement(ctx, client, "coords", String.format("%.0f, %.0f, %.0f",
                client.player.getX(), client.player.getY(), client.player.getZ()));
        }
    }

    private void drawElement(DrawContext ctx, MinecraftClient client, String name, String text) {
        HudConfig.Element el = config.get(name);
        if (el == null || !el.on) return;

        int w = ctx.getScaledWindowWidth();
        int h = ctx.getScaledWindowHeight();
        int tw = client.textRenderer.getWidth(text);

        /* ── THE ANCHOR DECIDES WHAT x AND y MEAN ──────────────────────────
           A percentage is an offset FROM the anchor, inward. On a left anchor
           x runs right from the edge; on a right anchor it runs left from it,
           and the element's own width comes off so the box stays on screen
           rather than starting at the edge and running past it. Centre
           anchors treat the offset as a nudge from the middle. */
        double ox = w * el.x / 100.0;
        double oy = h * el.y / 100.0;
        double sw = tw * el.scale;
        double sh = LINE * el.scale;

        char vert = el.anchor.charAt(0);
        char horiz = el.anchor.charAt(1);

        double px;
        if (horiz == 'l') px = ox;
        else if (horiz == 'r') px = w - ox - sw;
        else px = (w - sw) / 2.0 + ox;

        double py;
        if (vert == 't') py = oy;
        else if (vert == 'b') py = h - oy - sh;
        else py = (h - sh) / 2.0 + oy;

        /* keep it on screen whatever the percentages said */
        px = Math.max(0, Math.min(px, w - sw));
        py = Math.max(0, Math.min(py, h - sh));

        if (el.scale == 1.0) {
            ctx.drawTextWithShadow(client.textRenderer, Text.literal(text),
                (int) Math.round(px), (int) Math.round(py), 0xFFFFFFFF);
            return;
        }
        /* scale is applied to the matrix rather than to a font size, because
           the vanilla font has one size; the translate happens first so the
           element scales about its own corner and not about the origin */
        ctx.getMatrices().push();
        ctx.getMatrices().translate(px, py, 0);
        ctx.getMatrices().scale((float) el.scale, (float) el.scale, 1.0f);
        ctx.drawTextWithShadow(client.textRenderer, Text.literal(text), 0, 0, 0xFFFFFFFF);
        ctx.getMatrices().pop();
    }
}
