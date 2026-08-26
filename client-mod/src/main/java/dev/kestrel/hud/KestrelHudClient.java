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
 * {@code <instance>/config/kestrel-hud.json} — written by the launcher —
 * and draws the elements it turns on.
 *
 * <p><b>WHY A MOD AT ALL.</b> A launcher cannot draw inside the game: it is a
 * separate process that exits, or hides, the moment the game starts. Anything
 * on screen while you are playing has to be running inside that JVM, which
 * means it is a Fabric mod and it is a different project in a different
 * language. That is the whole reason this folder exists.
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

        int w = ctx.getScaledWindowWidth();
        int h = ctx.getScaledWindowHeight();

        HudConfig.Element fps = config.get("fps");
        if (fps != null && fps.on) {
            drawAt(ctx, client, "FPS " + currentFps(client), fps, w, h);
        }

        HudConfig.Element coords = config.get("coords");
        if (coords != null && coords.on) {
            String s = String.format("%.0f, %.0f, %.0f",
                client.player.getX(), client.player.getY(), client.player.getZ());
            drawAt(ctx, client, s, coords, w, h);
        }
    }

    /* position is a percentage of the screen, so an arrangement made in the
       launcher at one window size lands in the same visual place at another */
    private void drawAt(DrawContext ctx, MinecraftClient client, String text,
                        HudConfig.Element el, int w, int h) {
        int x = (int) Math.round(w * el.x / 100.0);
        int y = (int) Math.round(h * el.y / 100.0);
        int tw = client.textRenderer.getWidth(text);
        /* keep it on screen when the percentage puts it near an edge */
        if (x + tw > w) x = Math.max(0, w - tw);
        if (y + 9 > h) y = Math.max(0, h - 9);
        ctx.drawTextWithShadow(client.textRenderer, Text.literal(text), x, y, 0xFFFFFFFF);
    }

    private int currentFps(MinecraftClient client) {
        return MinecraftClient.getInstance().getCurrentFps();
    }
}
