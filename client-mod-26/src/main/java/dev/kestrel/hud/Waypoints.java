package dev.kestrel.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.world.level.storage.LevelResource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * WAYPOINTS: NAMED SPOTS, KEPT PER WORLD.
 *
 * <p><b>A WAYPOINT BELONGS TO A WORLD, AND "WHICH WORLD" IS THE HARD PART.</b>
 * In singleplayer it is the save folder — two worlds both called "New World"
 * are still two folders. On a server it is the address you typed. Within
 * either, a waypoint also remembers its dimension, and only shows in that one.
 *
 * <p><b>ITS OWN FILE, NOT THE HUD DOCUMENT.</b> {@code config/kestrel-waypoints.json}
 * is written by this mod alone. Waypoints are places, not settings: the
 * launcher has no screen for them and no business rewriting them, and keeping
 * them out of kestrel-hud.json keeps the two-writer rule there about layout.
 * The file is written whole to a temporary name and moved into place, so a
 * crash mid-write leaves the old list rather than half of a new one.
 *
 * <p>Nothing here reaches a server. A waypoint is coordinates in a local file;
 * the one way to it that goes through the server is Teleport, which is a
 * command sent when pressed — {@link WaypointsPanel#teleport}.
 */
public final class Waypoints {

    private Waypoints() { }

    /** one named place */
    static final class Point {
        String name = "Waypoint";
        int x, y, z;
        String dim = "minecraft:overworld";
        String colour = "#E3B439";
        boolean on = true;
        /** the folder it is filed in; empty for none */
        String folder = "";

        int rgb() {
            if (colour == null || colour.length() != 7 || colour.charAt(0) != '#') return 0xE3B439;
            try { return Integer.parseInt(colour.substring(1), 16); } catch (NumberFormatException e) { return 0xE3B439; }
        }
    }

    /* THE COLOURS A NEW WAYPOINT CYCLES THROUGH — the palette's bright ones.
       The greys and the near-black are left out: a beam you cannot see
       against the sky is not a waypoint. */
    static final int[] COLOURS = { 0xE3B439, 0x55FFFF, 0xFF55FF, 0x55FF55, 0xFFAA00, 0x5555FF, 0xFFFF55, 0xFF5555 };

    static int nextColour(int rgb) {
        for (int i = 0; i < COLOURS.length; i++) if (COLOURS[i] == (rgb & 0xFFFFFF)) return COLOURS[(i + 1) % COLOURS.length];
        return COLOURS[0];
    }

    /** more than anybody marks by hand, few enough that a bad file cannot flood the world with labels */
    static final int MAX_PER_WORLD = 64;
    static final int MAX_NAME = 24;

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
    private static Map<String, List<Point>> worlds;
    private static Path file;
    private static boolean wasDead = false;

    /* ── which world ─────────────────────────────────────────────────────── */

    /** "sp:<save folder>" or "mp:<address>"; null outside a world */
    static String worldKey(Minecraft c) {
        if (c == null || c.level == null) return null;
        if (c.getSingleplayerServer() != null) {
            Path root = c.getSingleplayerServer().getWorldPath(LevelResource.ROOT).normalize();
            Path folder = root.getFileName() == null || ".".equals(root.getFileName().toString()) ? root.getParent() : root;
            return "sp:" + (folder == null || folder.getFileName() == null ? "world" : folder.getFileName().toString());
        }
        ServerData server = c.getCurrentServer();
        return "mp:" + (server == null || server.ip == null ? "unknown" : server.ip.toLowerCase(Locale.ROOT));
    }

    static String dimension(Minecraft c) {
        return c.level == null ? "" : c.level.dimension().identifier().toString();
    }

    /** this world's waypoints, every dimension; empty outside a world */
    static List<Point> here(Minecraft c) {
        String key = worldKey(c);
        if (key == null) return new ArrayList<>();
        load(c);
        return worlds.computeIfAbsent(key, k -> new ArrayList<>());
    }

    /* ── changes ─────────────────────────────────────────────────────────── */

    /** a waypoint where the player stands, named and coloured in turn; null if there is no room */
    static Point addHere(Minecraft c, String name) {
        if (c.player == null) return null;
        return addAt(c, name, c.player.getBlockX(), c.player.getBlockY(), c.player.getBlockZ());
    }

    /** a waypoint anywhere in this world and dimension — the map puts them where you click */
    static Point addAt(Minecraft c, String name, int x, int y, int z) {
        if (c.level == null) return null;
        List<Point> list = here(c);
        if (list.size() >= MAX_PER_WORLD) return null;
        Point p = new Point();
        p.x = x;
        p.y = y;
        p.z = z;
        p.dim = dimension(c);
        p.name = name != null ? name : "Waypoint " + (list.size() + 1);
        p.colour = ElementsTab.hex(COLOURS[list.size() % COLOURS.length]);
        list.add(p);
        save();
        return p;
    }

    static void remove(Minecraft c, Point p) {
        if (here(c).remove(p)) save();
    }

    static void changed() {
        save();
    }

    /* ── the tick: the key, and a death ─────────────────────────────────── */

    static void tick(Minecraft c, HudConfig config) {
        Feature f = config.feature("waypoints");
        boolean pressed = Behaviours.presses(c, "waypoints") > 0;
        if (f == null || !f.on || c.player == null) {
            wasDead = c.player != null && c.player.isDeadOrDying();
            return;
        }
        if (pressed && c.gui.screen() == null) {
            Point p = addHere(c, null);
            if (p != null) c.player.sendOverlayMessage(net.minecraft.network.chat.Component.literal("Waypoint added: " + p.name));
        }
        /* WHERE YOU DIED, ONCE. The transition, not the state, or every tick
           on the death screen would add another; and the last one replaces the
           one before, because a list of every death is a list nobody reads. */
        boolean dead = c.player.isDeadOrDying();
        if (dead && !wasDead && f.flag("death")) {
            List<Point> list = here(c);
            /* the new one goes in whatever folder the old one was moved to */
            String folder = "";
            for (Point old : list) if ("Death".equals(old.name) && old.folder != null) folder = old.folder;
            list.removeIf(p -> "Death".equals(p.name));
            Point p = addHere(c, "Death");
            if (p != null) {
                p.colour = "#FF5555";
                p.folder = folder;
            }
            save();
        }
        wasDead = dead;
    }

    /* ── the file ────────────────────────────────────────────────────────── */

    private static void load(Minecraft c) {
        if (worlds != null) return;
        worlds = new LinkedHashMap<>();
        file = c.gameDirectory.toPath().resolve("config").resolve("kestrel-waypoints.json");
        try {
            if (!Files.isRegularFile(file) || Files.size(file) > 1024 * 1024) return;
            Map<String, List<Point>> read = GSON.fromJson(Files.readString(file, StandardCharsets.UTF_8),
                new TypeToken<LinkedHashMap<String, List<Point>>>() { }.getType());
            if (read == null) return;
            for (Map.Entry<String, List<Point>> e : read.entrySet()) {
                List<Point> clean = new ArrayList<>();
                if (e.getValue() != null) {
                    for (Point p : e.getValue()) {
                        if (p == null) continue;
                        if (p.name == null || p.name.isBlank()) p.name = "Waypoint";
                        if (p.name.length() > MAX_NAME) p.name = p.name.substring(0, MAX_NAME);
                        if (p.dim == null) p.dim = "minecraft:overworld";
                        if (p.folder == null) p.folder = "";
                        if (p.folder.length() > MAX_NAME) p.folder = p.folder.substring(0, MAX_NAME);
                        if (clean.size() < MAX_PER_WORLD) clean.add(p);
                    }
                }
                worlds.put(e.getKey(), clean);
            }
        } catch (Exception e) {
            KestrelHudClient.LOG.warn("Kestrel HUD: could not read {}: {}", file, e.getMessage());
        }
    }

    private static void save() {
        if (worlds == null || file == null) return;
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, GSON.toJson(worlds), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception e) {
            KestrelHudClient.LOG.warn("Kestrel HUD: could not write {}: {}", file, e.getMessage());
        }
    }
}
