package dev.kestrel.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * THE IN-GAME HALF OF KESTREL.
 *
 * <p>Reads {@code <instance>/config/kestrel-hud.json} — written by the
 * launcher — draws the elements it turns on, and since Right Shift opened a
 * menu, writes it back when a player edits it in game. The document, and the
 * rule that keeps the two writers from erasing each other, is
 * {@link HudConfig}.
 *
 * <p><b>NO NETWORK, AND NOTHING TOLD TO A SERVER.</b> Kestrel's claim is that
 * it never talks to a game server and has nothing to disclose. A client mod
 * is exactly where that could quietly stop being true — mods register plugin
 * channels routinely and a HUD has no business doing so. This one opens no
 * channel, registers no packet handler and makes no request. Adding a screen
 * did not change that: a menu reads a file and writes a file.
 */
public class KestrelHudClient implements ClientModInitializer {

    public static final String MOD_ID = "kestrel-hud";
    public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

    /* Kestrel's own face, used only when the config asks for it. The default
       is Minecraft's, because a HUD that looks like the game costs a new
       player nothing to read; ours is the deliberate choice, not the imposed
       one. See assets/kestrel-hud/font/kestrel.json. */
    static final Identifier FONT = Identifier.of(MOD_ID, "kestrel");

    /* RIGHT SHIFT, because vanilla binds it to nothing and every client that
       has done this has landed on the same key. Registered through the
       ordinary keybinding API, so it appears in Minecraft's own Controls
       screen and a player who wants a different key has one — which is more
       than a hard-coded GLFW check in a tick handler would have given them. */
    private static KeyBinding menuKey;

    private HudConfig config;
    private Path runDir;

    @Override
    public void onInitializeClient() {
        Session.begin();
        runDir = FabricLoader.getInstance().getGameDir();
        config = HudConfig.read(runDir);
        LOG.info("Kestrel HUD: {} element(s) configured at revision {}, {} corners, {} font",
            config.count(), config.revision(),
            config.rounded ? "rounded" : "sharp",
            config.kestrelFont ? "Kestrel" : "Minecraft");

        menuKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key." + MOD_ID + ".menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, "category." + MOD_ID));

        /* the features that DO something rather than draw something: their
           keys are registered from the document, so a feature added in
           mc/hud.js arrives with a binding and no Java changing */
        Behaviours.register(config);

        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        HudRenderCallback.EVENT.register(this::draw);
        /* AND THE ONES DRAWN IN THE WORLD. A different pass entirely — these
           are lines in 3D with depth, and they have to go in while the world
           is still being drawn or they would float on top of terrain that
           should hide them. AFTER_ENTITIES so an outline lands on top of the
           thing it outlines. */
        net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents.AFTER_ENTITIES
            .register(ctx -> Overlays.render(ctx, config));
    }

    /* Drained in a while loop rather than read once: wasPressed() pops one
       press off a queue, and a key pressed twice inside one tick would
       otherwise leave the second press sitting there to open the menu again
       the moment it was closed. */
    private void tick(MinecraftClient client) {
        /* CPS IS COUNTED HERE, not in the render pass. A render pass runs at
           the framerate, which is the thing a clicks-per-SECOND counter must
           not depend on; a client tick is twenty a second whatever the frames
           are doing. See Clicks for why it keeps timestamps rather than a
           counter that resets. */
        if (client.options != null) {
            Clicks.tick(client.options.attackKey.isPressed(), client.options.useKey.isPressed());
        }
        /* the combo, reach and PvP readouts all key off the same attack, so
           one watcher feeds all three rather than three keeping their own
           copy of "who did I last hit and when" */
        Combat.tick(client);
        if (client.world == null) Combat.reset();
        Behaviours.tick(client, config);
        while (menuKey.wasPressed()) {
            /* IN A WORLD, AND NOT OVER ANOTHER SCREEN. This configures a HUD
               that only exists in a world, and opening it over the title
               screen would offer to arrange nothing against nothing. */
            if (client.player != null && client.currentScreen == null) {
                client.setScreen(new HudMenuScreen(config, runDir));
            }
        }
    }

    /** the face the config asked for, as a function — the screens draw the
     *  same elements the HUD does and have to ask for them the same way */
    static HudElements.Face face(HudConfig cfg) {
        if (cfg.kestrelFont) return s -> Text.literal(s).styled(st -> st.withFont(FONT));
        return Text::literal;
    }

    /* The second parameter is Minecraft's render tick counter, taken as
       Object. A method reference is compatible with a wider parameter, and
       that class has changed both package and name across recent versions
       while the callback's shape has not — so not naming it is one fewer
       thing to fix at the next version bump. Nothing here uses it. */
    private void draw(DrawContext ctx, Object tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.textRenderer == null) return;
        if (client.player == null) return;
        if (client.options != null && client.options.hudHidden) return;

        /* THE HUD BELONGS TO THE WORLD — with one exception. Nothing draws
           over a menu and F1 means F1, but the Kestrel menu is the one screen
           where the HUD has to stay up: it is what you are configuring, and
           watching an element vanish from the corner as you flip its toggle
           is the entire reason to do this in game rather than in the
           launcher. The LAYOUT screen is not in this exception — it draws its
           own editable copy, and two of everything is not a preview. */
        if (client.currentScreen != null && !(client.currentScreen instanceof HudMenuScreen)) return;

        /* WHAT IS ALREADY ON SCREEN, so nothing lands on top of anything.
           Rebuilt every frame: the elements move, and a stale rectangle would
           push this frame's element out of the way of last frame's. */
        List<HudRenderer.Box> placed = new ArrayList<>();
        HudElements.Face face = face(config);

        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el == null || !el.on) continue;
            /* LIVE — and the only place that asks for it. An element this mod
               cannot draw returns null here and is simply absent from the
               world; the menus ask for SAMPLE instead, because they have to be
               able to style and position things the world does not draw yet. */
            List<List<HudElements.Run>> rows = HudElements.of(name, el, client, face, HudElements.LIVE);
            if (rows == null || rows.isEmpty()) continue;

            int w = HudRenderer.width(client.textRenderer, rows);
            int h = HudRenderer.height(rows);
            int sw = ctx.getScaledWindowWidth();
            int sh = ctx.getScaledWindowHeight();

            HudRenderer.Box box = HudRenderer.box(el, w, h, sw, sh);
            box = HudRenderer.avoid(box, placed, el.anchor.charAt(0) == 'b');
            box = HudRenderer.onScreen(box, sw, sh);
            placed.add(box);

            HudRenderer.draw(ctx, client.textRenderer, rows, box.x, box.y, w, h, el.scale, config.rounded, el.style);
        }
    }
}
