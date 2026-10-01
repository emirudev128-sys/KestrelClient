package dev.kestrel.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Consumer;

/**
 * THE WAYPOINTS OF THIS WORLD, AS A LIST YOU CAN EDIT.
 *
 * <p>Shown in the Features tab under the Waypoints feature, and down the left
 * of the Map tab.
 *
 * <p><b>ADDING ONE:</b> where you stand, or at coordinates typed into X, Y and
 * Z — a box left empty takes your own coordinate on that axis.
 *
 * <p><b>FOLDERS.</b> A waypoint is filed in a folder by name: type one into
 * its Folder box, or press one of the folders already made. A folder is only
 * the waypoints in it — it appears when the first is filed and goes when the
 * last leaves, so there is never an empty folder to tidy away. Folders come
 * first, in alphabetical order; a press on one shuts or opens it, its square
 * hides or shows everything in it, and rename renames it for all of them. The
 * waypoints in no folder follow.
 *
 * <p><b>EACH ROW</b> is its colour, its name, its coordinates and how far away
 * it is, in its own colour — the grey this used to be was lost against half
 * the backgrounds a menu sits on. Press a row and it opens: the name, the
 * folder and the three coordinates as boxes to type into, a colour wheel with
 * its brightness, teleport, and remove. On the Map tab, pressing the distance
 * centres the map on it.
 *
 * <p><b>TELEPORT IS A COMMAND, SENT WHEN PRESSED.</b> It is the {@code /tp} a
 * player could type — run {@code in} the waypoint's dimension, so a nether
 * waypoint works from the overworld — and it is only offered when the server
 * has told this client it may use it: cheats on in singleplayer, operator on
 * a server. Anywhere else the button stays grey and says why.
 */
final class WaypointsPanel {

    private WaypointsPanel() { }

    /* how far a folder's waypoints sit in from its name */
    private static final float INDENT = 14;
    /* folders offered as one-press chips in a waypoint's editor */
    private static final int MAX_CHIPS = 8;

    /* THE FOLDERS THAT ARE SHUT, for as long as the game runs — kept by world,
       so a "Base" shut in one world is not shut in every other */
    private static final Set<String> SHUT = new HashSet<>();

    static float draw(EditorScreen s, GuiGraphicsExtractor ctx, float x, float y, float w) {
        List<Waypoints.Point> all = Waypoints.here(s.mc());
        y += 18;
        Chrome.heading(s, ctx, "In this world", all.size() + " of " + Waypoints.MAX_PER_WORLD, x, y, w);
        y += 12 + 6;
        return list(s, ctx, x, y, w, null);
    }

    static float list(EditorScreen s, GuiGraphicsExtractor ctx, float x, float y, float w, Consumer<Waypoints.Point> focus) {
        Minecraft c = s.mc();
        List<Waypoints.Point> all = Waypoints.here(c);
        String dim = Waypoints.dimension(c);

        /* ── add where you stand ── */
        float cy = y + Glass.ROW / 2f;
        Chrome.label(s, ctx, "Add where you stand", x, cy);
        float bw = Chrome.chipWidth(s, "add");
        Chrome.chipButton(s, ctx, "add", x + w - bw, cy, Glass.INK, () -> {
            Waypoints.Point p = Waypoints.addHere(c, null);
            if (p != null) {
                s.mapSelected = p;
                s.change("Waypoints · added " + p.name);
                s.click();
            }
        });
        y += Glass.ROW + 4;

        /* ── add at coordinates ── */
        cy = y + Glass.ROW / 2f;
        String go = "add";
        float goW = Chrome.chipWidth(s, go);
        float boxW = (w - goW - 8 - 3 * 22 - 2 * 6) / 3f;
        float bx = x;
        String px = c.player == null ? "" : String.valueOf(c.player.getBlockX());
        String py = c.player == null ? "" : String.valueOf(c.player.getBlockY());
        String pz = c.player == null ? "" : String.valueOf(c.player.getBlockZ());
        bx = axis(s, ctx, "X", "new:x", s.newX, px, bx, cy, boxW, t -> s.newX = t);
        bx = axis(s, ctx, "Y", "new:y", s.newY, py, bx + 6, cy, boxW, t -> s.newY = t);
        axis(s, ctx, "Z", "new:z", s.newZ, pz, bx + 6, cy, boxW, t -> s.newZ = t);
        Chrome.chipButton(s, ctx, go, x + w - goW, cy, Glass.INK, () -> {
            if (c.player == null) return;
            Waypoints.Point p = Waypoints.addAt(c, null,
                number(s.newX, c.player.getBlockX()), number(s.newY, c.player.getBlockY()), number(s.newZ, c.player.getBlockZ()));
            if (p == null) return;
            s.newX = "";
            s.newY = "";
            s.newZ = "";
            s.mapSelected = p;
            s.change("Waypoints · added " + p.name + " at " + p.x + ", " + p.y + ", " + p.z);
            s.click();
        });
        y += Glass.ROW + 10;

        if (all.isEmpty()) {
            for (String line : Type.wrap(s.tr(), Type.DESC, "None yet. Press the key in the world, or add one here.", w)) {
                Type.draw(ctx, s.tr(), Type.DESC, line, x, y + 8, Glass.META);
                y += 18;
            }
            return y;
        }

        /* ── the folders, alphabetical, then the waypoints in none ── */
        Map<String, List<Waypoints.Point>> folders = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        List<Waypoints.Point> loose = new ArrayList<>();
        for (Waypoints.Point p : all) {
            if (p.folder == null || p.folder.isBlank()) loose.add(p);
            else folders.computeIfAbsent(p.folder, k -> new ArrayList<>()).add(p);
        }
        for (Map.Entry<String, List<Waypoints.Point>> e : folders.entrySet()) {
            List<Waypoints.Point> in = e.getValue();
            /* a folder holding the open waypoint stays open, or it would be
               open and nowhere to be seen */
            boolean shut = SHUT.contains(shutKey(c, e.getKey())) && !in.contains(s.mapSelected);
            y = folder(s, ctx, c, e.getKey(), in, shut, x, y, w);
            if (shut) continue;
            float top = y;
            for (Waypoints.Point p : in) {
                y = row(s, ctx, c, p, dim, x + INDENT, y, w - INDENT, focus);
                if (s.mapSelected == p) y = editor(s, ctx, c, p, x + INDENT, y, w - INDENT, focus);
            }
            /* the thread from a folder's triangle down past its waypoints */
            Glass.fill(ctx, x + 5, top + 1, 1, y - top - 6, Glass.LINE);
            y += 2;
        }
        if (!folders.isEmpty() && !loose.isEmpty()) y += 4;
        for (Waypoints.Point p : loose) {
            y = row(s, ctx, c, p, dim, x, y, w, focus);
            if (s.mapSelected == p) y = editor(s, ctx, c, p, x, y, w, focus);
        }
        return y;
    }

    /** a labelled number box; returns where the next one starts */
    private static float axis(EditorScreen s, GuiGraphicsExtractor ctx, String label, String id, String value, String placeholder,
                              float x, float cy, float boxW, Consumer<String> commit) {
        float after = Type.draw(ctx, s.tr(), Type.CAPS, label, x, cy, Glass.META) + 6;
        Chrome.field(s, ctx, id, value, placeholder, after, cy, boxW, true, commit);
        return after + boxW;
    }

    private static int number(String typed, int fallback) {
        try {
            return typed == null || typed.isBlank() ? fallback : Integer.parseInt(typed.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /* ── A FOLDER'S OWN ROW ──────────────────────────────────────────────
       Its triangle and name, how many it holds, rename while the pointer is
       on it, and one square for everything in it: lit while anything in it
       shows, and pressing it hides them all, or shows them all again. */
    private static float folder(EditorScreen s, GuiGraphicsExtractor ctx, Minecraft c, String name, List<Waypoints.Point> in,
                                boolean shut, float x, float y, float w) {
        float cy = y + Glass.ROW / 2f;
        float right = x + w;
        String id = "wp:folder:" + name.toLowerCase(Locale.ROOT);
        boolean renaming = id.equals(s.fieldId);
        boolean hover = !renaming && s.over(x - 6, y, w + 12, Glass.ROW);
        if (hover) Glass.box(ctx, x - 6, y + 1, w + 12, Glass.ROW - 2, Glass.WELL, Glass.LINE);

        /* the row first, so the square and rename, registered after it, win */
        if (!renaming) {
            s.onClick(x - 6, y, w + 12, Glass.ROW, () -> {
                String k = shutKey(c, name);
                if (shut) {
                    SHUT.remove(k);
                } else {
                    SHUT.add(k);
                    if (in.contains(s.mapSelected)) s.mapSelected = null;
                }
                s.click();
            });
        }

        boolean anyOn = false;
        for (Waypoints.Point p : in) anyOn |= p.on;
        final boolean hide = anyOn;
        Chrome.dot(s, ctx, right - 5, cy, anyOn, () -> {
            for (Waypoints.Point p : in) p.on = !hide;
            Waypoints.changed();
            s.change("Waypoints · " + name + " " + (hide ? "hidden" : "shown"));
            s.click();
        });
        right -= 10 + 12;

        if (renaming) {
            Chrome.field(s, ctx, id, name, "", x + 16, cy, right - 4 - (x + 16), false, t -> renameFolder(s, c, name, t));
            return y + Glass.ROW;
        }

        String rename = "rename";
        float renameW = Type.width(s.tr(), Type.META, rename);
        if (hover) {
            boolean onRename = s.over(right - renameW - 6, cy - 10, renameW + 12, 20);
            Type.drawRight(ctx, s.tr(), Type.META, rename, right, cy, onRename ? Glass.GO : Glass.META);
            s.onClick(right - renameW - 6, cy - 10, renameW + 12, 20, () -> s.editField(id, name, false, t -> renameFolder(s, c, name, t)));
        }

        Shapes.chevron(ctx, x + 5, cy, 3.5f, !shut, hover ? Glass.INK : Glass.META);
        String count = String.valueOf(in.size());
        float room = right - renameW - 12 - Type.width(s.tr(), Type.META, count) - 8 - (x + 16);
        float end = Type.draw(ctx, s.tr(), Type.LABEL, Type.fit(s.tr(), Type.LABEL, name, room), x + 16, cy, Glass.INK);
        Type.draw(ctx, s.tr(), Type.META, count, end + 8, cy, Glass.MUTE);
        return y + Glass.ROW;
    }

    private static String shutKey(Minecraft c, String folder) {
        return Waypoints.worldKey(c) + "|" + folder.toLowerCase(Locale.ROOT);
    }

    /** the folders this world has, as they are spelt */
    private static List<String> folderNames(Minecraft c) {
        TreeMap<String, String> names = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (Waypoints.Point p : Waypoints.here(c)) {
            if (p.folder != null && !p.folder.isBlank()) names.putIfAbsent(p.folder, p.folder);
        }
        return new ArrayList<>(names.values());
    }

    private static String clip(String typed) {
        String t = typed == null ? "" : typed.trim();
        return t.length() > Waypoints.MAX_NAME ? t.substring(0, Waypoints.MAX_NAME) : t;
    }

    /* ONE WAYPOINT INTO A FOLDER — or out of one, for an empty name. A name
       typed in another case files it in the folder already there. */
    private static void file(EditorScreen s, Minecraft c, Waypoints.Point p, String typed) {
        String to = clip(typed);
        for (String f : folderNames(c)) {
            if (f.equalsIgnoreCase(to)) {
                to = f;
                break;
            }
        }
        if (to.equals(p.folder == null ? "" : p.folder)) return;
        p.folder = to;
        if (!to.isEmpty()) SHUT.remove(shutKey(c, to));
        Waypoints.changed();
        s.change("Waypoints · " + p.name + (to.isEmpty() ? " out of its folder" : " filed in " + to));
    }

    /* A FOLDER RENAMED, for everything in it. Renamed to one that exists, the
       two become one; renamed to nothing, its waypoints are kept, loose. */
    private static void renameFolder(EditorScreen s, Minecraft c, String from, String typed) {
        String to = clip(typed);
        if (to.equals(from)) return;
        for (String f : folderNames(c)) {
            if (!f.equalsIgnoreCase(from) && f.equalsIgnoreCase(to)) {
                to = f;
                break;
            }
        }
        for (Waypoints.Point p : Waypoints.here(c)) {
            if (p.folder != null && p.folder.equalsIgnoreCase(from)) p.folder = to;
        }
        if (SHUT.remove(shutKey(c, from)) && !to.isEmpty()) SHUT.add(shutKey(c, to));
        Waypoints.changed();
        s.change(to.isEmpty() ? "Waypoints · folder " + from + " taken apart, its waypoints kept"
            : "Waypoints · folder " + from + " renamed " + to);
    }

    private static float row(EditorScreen s, GuiGraphicsExtractor ctx, Minecraft c, Waypoints.Point p, String dim,
                             float x, float y, float w, Consumer<Waypoints.Point> focus) {
        float cy = y + Glass.ROW / 2f;
        boolean here = dim.equals(p.dim);
        boolean open = s.mapSelected == p;
        boolean hover = s.over(x - 6, y, w + 12, Glass.ROW);
        if (open || hover) Glass.box(ctx, x - 6, y + 1, w + 12, Glass.ROW - 2, open ? Glass.RAISE : Glass.WELL, open ? Glass.LINE_STRONG : Glass.LINE);

        Glass.box(ctx, x, cy - 6, 12, 12, 0xFF000000 | p.rgb(), Glass.LINE_STRONG);

        float right = x + w;
        Chrome.dot(s, ctx, right - 5, cy, p.on, () -> {
            p.on = !p.on;
            Waypoints.changed();
            s.change("Waypoints · " + p.name + " " + (p.on ? "shown" : "hidden"));
            s.click();
        });
        right -= 10 + 12;

        String where;
        if (!here) {
            where = p.dim.substring(p.dim.indexOf(':') + 1).replace('_', ' ').toLowerCase(Locale.ROOT);
        } else if (c.player != null) {
            double dx = p.x + 0.5 - c.player.getX(), dy = p.y - c.player.getY(), dz = p.z + 0.5 - c.player.getZ();
            where = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz)) + " m";
        } else {
            where = "";
        }
        float after = Type.drawRight(ctx, s.tr(), Type.META, where, right, cy, 0xFF000000 | p.rgb());
        if (focus != null && here) s.onClick(after - 4, cy - 10, right - after + 8, 20, () -> focus.accept(p));

        String coords = p.x + " " + p.y + " " + p.z;
        float coordsEnd = after - 10;
        float coordsStart = Type.drawRight(ctx, s.tr(), Type.META, coords, coordsEnd, cy, Glass.MUTE);

        float nx = x + 20, room = coordsStart - 10 - nx;
        Type.draw(ctx, s.tr(), Type.LABEL, Type.fit(s.tr(), Type.LABEL, p.name, room), nx, cy, here ? Glass.INK : Glass.MUTE);
        s.onClick(x - 6, y, coordsStart - x, Glass.ROW, () -> {
            s.mapSelected = open ? null : p;
            s.click();
        });
        return y + Glass.ROW;
    }

    /* ── THE OPEN ROW ─────────────────────────────────────────────────── */
    private static float editor(EditorScreen s, GuiGraphicsExtractor ctx, Minecraft c, Waypoints.Point p,
                                float x, float y, float w, Consumer<Waypoints.Point> focus) {
        float top = y;
        String key = String.valueOf(System.identityHashCode(p));
        y += 6;
        float cy = y + Glass.ROW / 2f;
        Type.draw(ctx, s.tr(), Type.CAPS, "Name", x + 6, cy, Glass.META);
        Chrome.field(s, ctx, "wp:name:" + key, p.name, "", x + 70, cy, w - 76, false, t -> {
            String name = t.trim();
            if (name.isEmpty() || name.equals(p.name)) return;
            String before = p.name;
            p.name = name.length() > Waypoints.MAX_NAME ? name.substring(0, Waypoints.MAX_NAME) : name;
            Waypoints.changed();
            s.change("Waypoints · " + before + " renamed " + p.name);
        });
        y += Glass.ROW + 2;

        /* ── its folder: typed, or one already made, in one press ── */
        cy = y + Glass.ROW / 2f;
        String folder = p.folder == null ? "" : p.folder;
        Type.draw(ctx, s.tr(), Type.CAPS, "Folder", x + 6, cy, Glass.META);
        Chrome.field(s, ctx, "wp:in:" + key, folder, "none · type one to make it", x + 70, cy, w - 76, false,
            t -> file(s, c, p, t));
        y += Glass.ROW + 2;
        List<String> chips = new ArrayList<>();
        for (String f : folderNames(c)) {
            if (!f.equals(folder) && chips.size() < MAX_CHIPS) chips.add(f);
        }
        if (!chips.isEmpty() || !folder.isEmpty()) {
            float left = x + 70, chipRight = x + w - 6, cx = left;
            cy = y + 12;
            for (String f : chips) {
                float cw = Chrome.chipWidth(s, f);
                if (cx + cw > chipRight && cx > left) {
                    cx = left;
                    cy += 28;
                }
                cx += Chrome.chipButton(s, ctx, f, cx, cy, Glass.BODY, () -> file(s, c, p, f)) + 6;
            }
            if (!folder.isEmpty()) {
                String out = "take out";
                float cw = Chrome.chipWidth(s, out);
                if (cx + cw > chipRight && cx > left) {
                    cx = left;
                    cy += 28;
                }
                Chrome.chipButton(s, ctx, out, cx, cy, Glass.MUTE, () -> file(s, c, p, ""));
            }
            y = cy + 12 + 6;
        }

        cy = y + Glass.ROW / 2f;
        float boxW = (w - 12 - 3 * 22 - 2 * 8) / 3f;
        float bx = x + 6;
        bx = axis(s, ctx, "X", "wp:x:" + key, String.valueOf(p.x), "", bx, cy, boxW, t -> move(s, p, 'x', t));
        bx = axis(s, ctx, "Y", "wp:y:" + key, String.valueOf(p.y), "", bx + 8, cy, boxW, t -> move(s, p, 'y', t));
        axis(s, ctx, "Z", "wp:z:" + key, String.valueOf(p.z), "", bx + 8, cy, boxW, t -> move(s, p, 'z', t));
        y += Glass.ROW + 8;

        y += Chrome.wheel(s, ctx, x + 6, y, w - 12, p.rgb(), rgb -> p.colour = ElementsTab.hex(rgb), () -> {
            Waypoints.changed();
            s.change("Waypoints · " + p.name + " colour " + p.colour);
        }) + 10;

        cy = y + Glass.ROW / 2f;
        String remove = "remove";
        float rw = Chrome.chipWidth(s, remove);
        Chrome.chipButton(s, ctx, remove, x + w - rw, cy, Glass.CLASH, () -> {
            Waypoints.remove(c, p);
            s.mapSelected = null;
            s.change("Waypoints · removed " + p.name);
            s.click();
        });
        if (focus != null && Waypoints.dimension(c).equals(p.dim)) {
            String centre = "show on map";
            Chrome.chipButton(s, ctx, centre, x + w - rw - 8 - Chrome.chipWidth(s, centre), cy, Glass.INK, () -> focus.accept(p));
        }
        teleportButton(s, ctx, c, p, x + 6, cy);
        y += Glass.ROW + 6;
        Glass.fill(ctx, x - 6, top, 1, y - top, Glass.argb(p.rgb(), 60));
        return y;
    }

    private static void move(EditorScreen s, Waypoints.Point p, char axis, String typed) {
        int now = axis == 'x' ? p.x : axis == 'y' ? p.y : p.z;
        int next = number(typed, now);
        if (next == now) return;
        if (axis == 'x') p.x = next;
        else if (axis == 'y') p.y = next;
        else p.z = next;
        Waypoints.changed();
        s.change("Waypoints · " + p.name + " " + axis + " " + next);
    }

    /* ── TELEPORT ────────────────────────────────────────────────────────── */

    /** the teleport chip, grey with the reason under the pointer when it cannot; returns its width */
    static float teleportButton(EditorScreen s, GuiGraphicsExtractor ctx, Minecraft c, Waypoints.Point p, float x, float cy) {
        String label = "teleport";
        float w = Chrome.chipWidth(s, label);
        boolean may = mayTeleport(c);
        Chrome.chipButton(s, ctx, label, x, cy, may ? Glass.INK : Glass.MUTE, () -> {
            if (!may) {
                s.change("Waypoints · teleport needs cheats on, or operator on this server");
                return;
            }
            if (teleport(c, p)) {
                s.click();
                s.onClose();
            }
        });
        if (!may && s.over(x, cy - 12, w, 24)) tip(s, ctx, "Needs cheats on, or operator on this server", x, cy - 14);
        return w;
    }

    /** whether the server has said this player may use /tp: cheats in singleplayer, operator elsewhere */
    static boolean mayTeleport(Minecraft c) {
        return c.player != null && c.getConnection() != null && c.player.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER);
    }

    /* THE ONE COMMAND: the /tp a player could type, in the waypoint's own
       dimension, to the middle of its block. The dimension comes from a file
       a person can edit, so it has to be a real identifier — a space in it
       would make it more than one word of the command. */
    static boolean teleport(Minecraft c, Waypoints.Point p) {
        if (!mayTeleport(c) || p.dim == null || p.dim.indexOf(' ') >= 0 || Identifier.tryParse(p.dim) == null) return false;
        c.getConnection().sendCommand(String.format(Locale.ROOT,
            "execute in %s run tp @s %.1f %d %.1f", p.dim, p.x + 0.5, p.y, p.z + 0.5));
        return true;
    }

    /* a line that explains a control, over whatever is above it */
    private static void tip(EditorScreen s, GuiGraphicsExtractor ctx, String text, float x, float bottom) {
        float tw = Type.width(s.tr(), Type.META, text) + 16;
        Glass.box(ctx, x, bottom - 22, tw, 22, 0xF214181E, Glass.LINE_STRONG);
        Type.draw(ctx, s.tr(), Type.META, text, x + 8, bottom - 11, Glass.BODY);
    }
}
