package dev.kestrel.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.PictureInPictureRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * THE IN-GAME HALF OF KESTREL.
 *
 * <p>Reads {@code <instance>/config/kestrel-hud.json} â written by the
 * launcher â draws the elements it turns on, and since Right Shift opened a
 * menu, writes it back when a player edits it in game. The document, and the
 * rule that keeps the two writers from erasing each other, is
 * {@link HudConfig}.
 *
 * <p><b>NO CHANNEL, NOTHING ANNOUNCED, AND NOTHING SENT YOU DID NOT DO.</b>
 * Kestrel's claim is that it never talks to a game server behind your back
 * and has nothing to disclose. A client mod is exactly where that could
 * quietly stop being true â mods register plugin channels routinely and a HUD
 * has no business doing so. This one opens no channel, registers no packet
 * handler and tells no server it is here. Two things do reach the server,
 * each only when you press for it, and each exactly what the game sends when
 * you do it by hand: the inventory sorter's slot clicks ({@link Sorter}), and
 * a waypoint's Teleport â the {@code /tp} command a player allowed to use it
 * could type ({@link WaypointsPanel#teleport}). The menu itself reads a file
 * and writes a file.
 *
 * <p><b>THE 26.3 BUILD.</b> The same mod against Minecraft 26.3, which ships
 * under Mojang's own names, draws its GUI by extracting each frame into a
 * render state first, and reads the keyboard through SDL rather than GLFW.
 * The document, the menu and every feature are the 1.21.4 build's; what moved
 * is where each one plugs into the game.
 */
public class KestrelHudClient implements ClientModInitializer {

    public static final String MOD_ID = "kestrel-hud";
    public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

    /* Kestrel's own face, used only when the config asks for it. The default
       is Minecraft's, because a HUD that looks like the game costs a new
       player nothing to read; ours is the deliberate choice, not the imposed
       one. It is Archivo Medium â the face the launcher draws its own HUD
       preview in â so a HUD arranged there looks the same in the world. See
       assets/kestrel-hud/font/kestrel.json. */
    static final Identifier FONT = Identifier.fromNamespaceAndPath(MOD_ID, "kestrel");

    /** where every Kestrel key is listed in Minecraft's Controls screen */
    static final KeyMapping.Category KEYS =
        KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "kestrel"));

    /* RIGHT SHIFT, because vanilla binds it to nothing and every client that
       has done this has landed on the same key. Registered through the
       ordinary key mapping API, so it appears in Minecraft's own Controls
       screen and a player who wants a different key has one â which is more
       than a hard-coded key check in a tick handler would have given them. */
    private static KeyMapping menuKey;

    /* THE MINIMAP'S ZOOM, on = and -: in the Controls screen like every other
       key, and stepping the element's own zoom option, so the menu shows the
       same value the keys set */
    private static KeyMapping mapZoomIn, mapZoomOut;

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

        menuKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
            "key." + MOD_ID + ".menu", InputConstants.Type.KEYBOARD, InputConstants.KEY_RSHIFT, KEYS));
        mapZoomIn = KeyMappingHelper.registerKeyMapping(new KeyMapping(
            "key." + MOD_ID + ".minimap_in", InputConstants.Type.KEYBOARD, InputConstants.KEY_EQUALS, KEYS));
        mapZoomOut = KeyMappingHelper.registerKeyMapping(new KeyMapping(
            "key." + MOD_ID + ".minimap_out", InputConstants.Type.KEYBOARD, InputConstants.KEY_MINUS, KEYS));

        /* the features that DO something rather than draw something: their
           keys are registered from the document, so a feature added in
           mc/hud.js arrives with a binding and no Java changing */
        Behaviours.register(config);

        ClientTickEvents.END_CLIENT_TICK.register(this::tick);
        /* the world map reads each chunk as it loads, and any it missed as it leaves */
        WorldMap.register();
        HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "hud"), this::draw);
        /* the menu's glass: the sharp world around its panels — see PanelBlur */
        PictureInPictureRendererRegistry.register(context -> PanelBlur.newRenderer());
        /* AND THE ONES DRAWN IN THE WORLD. A different pass entirely â these
           are lines and boxes in 3D with depth, handed to the world's own
           submit list while it is collected, so terrain in front of them
           hides them the way it hides everything else. */
        LevelRenderEvents.COLLECT_SUBMITS.register(ctx -> Overlays.render(ctx, config));

        /* ââ ONE SCOREBOARD, NOT TWO ââââââââââââââââââââââââââââââââââââââ
           While the Kestrel scoreboard is on, vanilla's sidebar steps aside.
           Fabric's HUD registry names vanilla's sidebar, so it is wrapped
           rather than removed: the wrapper asks every frame, and the moment
           the element is switched off vanilla's draws again. No mixin. */
        HudElementRegistry.replaceElement(VanillaHudElements.SCOREBOARD, vanilla ->
            (ctx, delta) -> {
                if (!ownScoreboard()) vanilla.extractRenderState(ctx, delta);
            });

        sorterKeys();
    }

    /* the sorter's key inside an inventory screen, where key mappings are
       not updated â the screen gets the key, and this listens after it */
    private void sorterKeys() {
        ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
            if (!(screen instanceof AbstractContainerScreen<?>)) return;
            ScreenKeyboardEvents.afterKeyPress(screen).register(
                (scr, event) -> Sorter.pressedIn(scr, event, config, Behaviours.key("sorter")));
        });
    }

    /** true while this mod draws the sidebar itself */
    private boolean ownScoreboard() {
        HudConfig.Element el = config == null ? null : config.get("scoreboard");
        return el != null && el.on && HudElements.drawn("scoreboard");
    }

    /* Drained in a while loop rather than read once: consumeClick() pops one
       press off a queue, and a key pressed twice inside one tick would
       otherwise leave the second press sitting there to open the menu again
       the moment it was closed. */
    private void tick(Minecraft client) {
        /* CPS IS COUNTED HERE, not in the render pass. A render pass runs at
           the framerate, which is the thing a clicks-per-SECOND counter must
           not depend on; a client tick is twenty a second whatever the frames
           are doing. See Clicks for why it keeps timestamps rather than a
           counter that resets. */
        if (client.options != null) {
            Clicks.tick(client.options.keyAttack.isDown(), client.options.keyUse.isDown());
        }
        /* the combo, reach and PvP readouts all key off the same attack, so
           one watcher feeds all three rather than three keeping their own
           copy of "who did I last hit and when" */
        Combat.tick(client);
        if (client.level == null) Combat.reset();
        Behaviours.tick(client, config);
        /* underground or not, once, for both maps */
        Terrain.tick(client);
        Minimap.tick(client, config);
        zoomKeys(client);
        WorldMap.tick(client, config, client.gui.screen() instanceof EditorScreen es && es.onMap);
        /* M: the menu, opened on its map */
        Feature map = config.feature("worldmap");
        if (Behaviours.presses(client, "worldmap") > 0
                && map != null && map.on && client.player != null && client.gui.screen() == null) {
            client.gui.setScreen(new EditorScreen(config, runDir, true));
        }
        while (menuKey.consumeClick()) {
            /* IN A WORLD, AND NOT OVER ANOTHER SCREEN. This configures a HUD
               that only exists in a world, and opening it over the title
               screen would offer to arrange nothing against nothing. */
            if (client.player != null && client.gui.screen() == null) {
                client.gui.setScreen(new EditorScreen(config, runDir));
            }
        }
    }

    /* a step of minimap zoom per press, written straight to the document â
       a key pressed in the world has no menu closing behind it to save it */
    private void zoomKeys(Minecraft client) {
        int by = 0;
        while (mapZoomIn.consumeClick()) by++;
        while (mapZoomOut.consumeClick()) by--;
        if (by == 0 || client.player == null || client.gui.screen() != null) return;
        HudConfig.Element el = config.get("minimap");
        if (el == null || !el.on) return;
        String now = Minimap.step(config, by > 0 ? 1 : -1);
        if (now == null) return;
        config.save(runDir);
        client.player.sendOverlayMessage(Component.literal("Minimap zoom: " + now));
    }

    /** the editor closes on the same key that opened it */
    static boolean isMenuKey(KeyEvent event) {
        return menuKey != null && menuKey.matches(event);
    }

    /** the menu key as the top bar shows it: Right Shift reads RSHIFT */
    static String menuKeyLabel() {
        if (menuKey == null) return "RSHIFT";
        String s = menuKey.getTranslatedKeyMessage().getString().toUpperCase(java.util.Locale.ROOT);
        return s.replace("RIGHT ", "R").replace("LEFT ", "L");
    }

    private static final FontDescription KESTREL_FACE = new FontDescription.Resource(FONT);

    /** the face the config asked for, as a function â the screens draw the
     *  same elements the HUD does and have to ask for them the same way */
    static HudElements.Face face(HudConfig cfg) {
        if (cfg.kestrelFont) return s -> Component.literal(s).withStyle(st -> st.withFont(KESTREL_FACE));
        return Component::literal;
    }

    private void draw(GuiGraphicsExtractor ctx, DeltaTracker delta) {
        Minecraft client = Minecraft.getInstance();
        if (client == null || client.font == null) return;
        if (client.player == null) return;
        if (client.gui.hud.isHidden()) return;

        /* THE HUD BELONGS TO THE WORLD, and no screen draws over it â the
           editor included. The editor's canvas draws the whole HUD itself, on
           a picture of the screen, and the live copy peeking out between its
           panels would be two of everything. */
        if (client.gui.screen() != null) return;

        /* WHAT IS ALREADY ON SCREEN, so nothing lands on top of anything.
           Rebuilt every frame: the elements move, and a stale rectangle would
           push this frame's element out of the way of last frame's. */
        List<HudRenderer.Box> placed = new ArrayList<>();
        HudElements.Face face = face(config);

        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el == null || !el.on) continue;
            /* LIVE â and the only place that asks for it. An element this mod
               cannot draw returns null here and is simply absent from the
               world; the menus ask for SAMPLE instead, because they have to be
               able to style and position things the world does not draw yet. */
            List<List<HudElements.Run>> rows = HudElements.of(name, el, client, face, HudElements.LIVE);
            if (rows == null || rows.isEmpty()) continue;

            int w = HudRenderer.width(client.font, rows);
            int h = HudRenderer.height(rows);
            int sw = ctx.guiWidth();
            int sh = ctx.guiHeight();

            HudRenderer.Box box = HudRenderer.box(el, w, h, sw, sh);
            box = HudRenderer.avoid(box, placed, el.anchor.charAt(0) == 'b');
            box = HudRenderer.onScreen(box, sw, sh);
            placed.add(box);

            HudRenderer.draw(ctx, client.font, rows, box.x, box.y, w, h, el.scale, config.rounded, el.style);
        }
    }
}
