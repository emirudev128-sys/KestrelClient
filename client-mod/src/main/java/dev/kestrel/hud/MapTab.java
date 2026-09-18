package dev.kestrel.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.world.Heightmap;

import java.util.List;
import java.util.Locale;

/**
 * THE MAP TAB: M OPENS THE MENU HERE.
 *
 * <p>Waypoints on the left — the same rows the Features tab lists, plus
 * pressing a waypoint's distance to find it on the map. The map in the middle:
 * drag to pan, scroll to zoom about the cursor, click to pin a spot, right-click
 * to put a waypoint there. On the right, where you are, where the cursor is —
 * its biome, and the block there where the chunk is loaded — the pin and what
 * to do with it. The biome is also beside the pointer, where you are looking.
 *
 * <p><b>ONLY WHAT HAS BEEN LOADED.</b> The picture is {@link WorldMap}'s,
 * which reads chunks the game already holds and asks for none, so the edges of
 * the map are the edges of where you have been — kept on this computer between
 * games, in the game folder's kestrel-map.
 */
final class MapTab {

    private MapTab() { }

    static final float[] ZOOMS = { 0.25f, 0.5f, 1f, 2f, 4f, 8f };

    /* what the pointer is over this frame: found once, by the map, for the
       name beside the pointer and the rows on the right */
    private static boolean over;
    private static int overX, overZ;
    private static WorldMap.Spot spot;

    static void draw(EditorScreen s, DrawContext ctx) {
        MinecraftClient c = s.mc();
        if (s.mapFollow && c.player != null) {
            s.mapX = c.player.getX();
            s.mapZ = c.player.getZ();
        }
        left(s, ctx, c);
        canvas(s, ctx, c);
        inspector(s, ctx, c);
    }

    /* ── left: the waypoints ────────────────────────────────────────────── */
    private static void left(EditorScreen s, DrawContext ctx, MinecraftClient c) {
        float x = s.left[0], y = s.left[1], w = s.left[2], h = s.left[3];
        Glass.panel(ctx, x, y, w, h);
        List<Waypoints.Point> all = Waypoints.here(c);
        Chrome.heading(s, ctx, "Waypoints", all.size() + " in this world", x + 20, y + Glass.PAD_TOP, w - 40);
        float top = y + Glass.PAD_TOP + 12 + 4;
        float viewH = y + h - 12 - top;
        s.clipTo(ctx, x + 1, top, w - 2, viewH);
        float start = top - s.mapListScroll;
        float end = WaypointsPanel.list(s, ctx, x + 20, start, w - 40, p -> focus(s, p));
        s.unclip(ctx);
        float content = end - start;
        final float listMax = Math.max(0, content - viewH);
        s.mapListScroll = Math.max(0, Math.min(s.mapListScroll, listMax));
        s.onWheel(x, top, w, viewH, by -> s.mapListScroll = Math.max(0, Math.min(listMax, s.mapListScroll + by)));
    }

    /** centre the map on a waypoint, and stop following the player */
    static void focus(EditorScreen s, Waypoints.Point p) {
        s.mapFollow = false;
        s.mapX = p.x + 0.5;
        s.mapZ = p.z + 0.5;
        s.mapSelected = p;
        s.click();
    }

    /* ── middle: the map ────────────────────────────────────────────────── */
    private static void canvas(EditorScreen s, DrawContext ctx, MinecraftClient c) {
        float[] cv = s.canvas;
        Glass.panel(ctx, cv[0], cv[1], cv[2], cv[3]);
        float hx = cv[0] + Glass.PAD, hcy = cv[1] + Glass.PAD_TOP + 13;
        float after = Type.draw(ctx, s.tr(), Type.CAPS, "Map", hx, hcy, Glass.META);

        /* zoom and centre, right-aligned in the header */
        float rx = cv[0] + cv[2] - Glass.PAD;
        String centre = "centre on you";
        rx -= Chrome.chipWidth(s, centre);
        Chrome.chipButton(s, ctx, centre, rx, hcy, s.mapFollow ? Glass.MUTE : Glass.INK, () -> {
            s.mapFollow = true;
            s.click();
        });
        rx -= 12 + Chrome.chipWidth(s, "+");
        Chrome.chipButton(s, ctx, "+", rx, hcy, Glass.INK, () -> zoomBy(s, 1, Float.NaN, Float.NaN));
        String level = zoomName(s.mapZoom);
        rx -= 6 + Chrome.chipWidth(s, level);
        Chrome.chip(s, ctx, level, rx, hcy, Glass.INK);
        rx -= 6 + Chrome.chipWidth(s, "−");
        Chrome.chipButton(s, ctx, "−", rx, hcy, Glass.INK, () -> zoomBy(s, -1, Float.NaN, Float.NaN));

        /* DEPTH: the world map feature's own option, so the Features tab and
           this header are one setting — auto shows the caves while you are
           underground; the nether has no surface and is always caves. In the
           header when it fits; on a narrow window, over the map's corner. */
        Feature mapFeature = s.config.feature("worldmap");
        String depth = mapFeature == null ? Terrain.AUTO : mapFeature.choice("layer", Terrain.AUTO);
        boolean caves = Terrain.caves(c.world, depth);
        boolean roofed = c.world != null && c.world.getDimension().hasCeiling();
        float depthW = depthWidth(s);
        boolean inHeader = rx - 16 - depthW - 16 - 140 >= after + 14;
        float textRight = rx - 16;
        if (inHeader) textRight = depthControl(s, ctx, depth, rx - 16, hcy) - 16;

        String dim = c.world == null ? "" : c.world.getRegistryKey().getValue().getPath().replace('_', ' ');
        String what = !caves ? "the surface" : roofed ? "caves at your height · it has no surface" : "caves at your height";
        Type.draw(ctx, s.tr(), Type.SOFT, Type.fit(s.tr(), Type.SOFT, dim + " · " + what, Math.max(0, textRight - (after + 14))),
            after + 14, hcy, Glass.MUTE);

        float mx0 = cv[0] + Glass.PAD, my0 = cv[1] + Glass.PAD_TOP + 26 + 16;
        float mw = cv[2] - 2 * Glass.PAD, mh = cv[3] - (Glass.PAD_TOP + 26 + 16) - Glass.PAD;
        s.mapArea = new float[] { mx0, my0, mw, mh };
        Glass.box(ctx, mx0, my0, mw, mh, Glass.WELL, Glass.LINE);
        float cx = mx0 + mw / 2f, cy = my0 + mh / 2f;
        float zoom = s.mapZoom;

        /* panning and pinning share the map: a press that does not move is a click */
        s.onDrag(mx0, my0, mw, mh, () -> {
            final float startX = s.mx, startY = s.my;
            final double fromX = s.mapX, fromZ = s.mapZ;
            return new EditorScreen.Drag() {
                boolean moved;

                @Override
                public void move(float px, float py, boolean alt) {
                    if (Math.abs(px - startX) + Math.abs(py - startY) > 3) moved = true;
                    if (!moved) return;
                    s.mapFollow = false;
                    s.mapX = fromX - (px - startX) / s.mapZoom;
                    s.mapZ = fromZ - (py - startY) / s.mapZoom;
                }

                @Override
                public void end() {
                    if (moved) return;
                    s.pinX = (int) Math.floor(worldX(s, startX));
                    s.pinZ = (int) Math.floor(worldZ(s, startY));
                    s.mapSelected = null;
                }
            };
        });
        s.onWheel(mx0, my0, mw, mh, by -> zoomBy(s, by > 0 ? -1 : 1, s.mx, s.my));

        s.clipTo(ctx, mx0 + 1, my0 + 1, mw - 2, mh - 2);
        WorldMap.draw(ctx, cx, cy, mw, mh, s.mapX, s.mapZ, zoom, caves);
        if (WorldMap.empty(caves)) {
            Type.drawCentred(ctx, s.tr(), Type.SOFT, caves ? "Reading the caves around you…" : "Reading the chunks around you…",
                mx0, mw, cy, Glass.MUTE);
        }

        String here = c.world == null ? "" : c.world.getRegistryKey().getValue().toString();
        var m = ctx.getMatrices();

        /* other players */
        if (c.world != null) {
            for (PlayerEntity other : c.world.getPlayers()) {
                if (other == c.player) continue;
                float ox = cx + (float) ((other.getX() - s.mapX) * zoom), oz = cy + (float) ((other.getZ() - s.mapZ) * zoom);
                Shapes.dot(ctx, ox, oz, 3f, Glass.INK, 0xB00A0E13);
            }
        }

        /* the pin */
        if (s.pinX != null) {
            float px = cx + (float) ((s.pinX + 0.5 - s.mapX) * zoom), pz = cy + (float) ((s.pinZ + 0.5 - s.mapZ) * zoom);
            Glass.fill(ctx, px - 1, pz - 9, 2, 10, 0xFF0A0E13);
            Glass.fill(ctx, px - 5, pz - 13, 10, 6, 0xFF0A0E13);
            Glass.fill(ctx, px - 4, pz - 12, 8, 4, Glass.GO);
        }

        /* waypoints: a marker each, named when there is room */
        for (Waypoints.Point p : Waypoints.here(c)) {
            if (!here.equals(p.dim)) continue;
            float px = cx + (float) ((p.x + 0.5 - s.mapX) * zoom), pz = cy + (float) ((p.z + 0.5 - s.mapZ) * zoom);
            if (px < mx0 - 20 || px > mx0 + mw + 20 || pz < my0 - 20 || pz > my0 + mh + 20) continue;
            boolean selected = p == s.mapSelected;
            Shapes.dot(ctx, px, pz, selected ? 5.5f : 4.5f, (p.on ? 0xFF000000 : 0x80000000) | p.rgb(), 0xC00A0E13);
            if (zoom >= 1f || selected) {
                float tw = Type.width(s.tr(), Type.META, p.name) + 12;
                Glass.box(ctx, px + 9, pz - 10, tw, 20, Glass.argb(0x0A0E13, 70), Glass.LINE);
                Type.draw(ctx, s.tr(), Type.META, p.name, px + 15, pz, selected ? Glass.INK : Glass.BODY);
            }
            s.onClick(px - 8, pz - 8, 16, 16, () -> {
                s.mapSelected = p;
                s.pinX = null;
                s.click();
            });
        }

        /* you */
        if (c.player != null) {
            float px = cx + (float) ((c.player.getX() - s.mapX) * zoom), pz = cy + (float) ((c.player.getZ() - s.mapZ) * zoom);
            /* sized with the map: a marker the size of a village when zoomed
               out says you are somewhere in it, not where */
            float size = 7f * Math.max(0.45f, Math.min(1.4f, zoom / 2f));
            Shapes.arrow(ctx, px, pz, size, c.player.getYaw() - 180f, 0xFFE3B439, 0xB00A0E13);
        }
        /* WHAT THE POINTER IS OVER. The biome's name beside it — where you
           are looking — and the rest in the panel on the right. Not beside it
           while the map is being dragged: a name sliding along under the hand
           that is moving the map is in the way. */
        over = s.mx >= mx0 && s.mx < mx0 + mw && s.my >= my0 && s.my < my0 + mh;
        if (over) {
            overX = (int) Math.floor(worldX(s, s.mx));
            overZ = (int) Math.floor(worldZ(s, s.my));
            spot = WorldMap.probe(c, caves, overX, overZ);
            String biome = Terrain.biomeName(spot.biome);
            if (biome != null && s.drag == null) {
                float tw = Type.width(s.tr(), Type.META, biome) + 16;
                float lx = s.mx + 14, ly = s.my + 16;
                if (lx + tw > mx0 + mw - 4) lx = s.mx - 10 - tw;
                if (ly + 22 > my0 + mh - 4) ly = s.my - 12 - 22;
                Glass.box(ctx, lx, ly, tw, 22, 0xF214181E, Glass.LINE_STRONG);
                Type.draw(ctx, s.tr(), Type.META, biome, lx + 8, ly + 11, Glass.INK);
            }
        }
        /* the depth control, over the map's corner when the header had no room */
        if (!inHeader) {
            float right = mx0 + 10 + depthW;
            Glass.box(ctx, mx0 + 4, my0 + 4, depthW + 12, 30, Glass.argb(0x0A0E13, 70), Glass.LINE);
            depthControl(s, ctx, depth, right, my0 + 19);
        }
        s.unclip(ctx);
    }

    /* ── right: where things are ─────────────────────────────────────────── */
    private static void inspector(EditorScreen s, DrawContext ctx, MinecraftClient c) {
        float x = s.insp[0], y = s.insp[1], w = s.insp[2], h = s.insp[3];
        Glass.panel(ctx, x, y, w, h);
        float px = x + Glass.PAD, pw = w - 2 * Glass.PAD;
        float cy = y + Glass.PAD_TOP;
        Chrome.heading(s, ctx, "Where", null, px, cy, pw);
        cy += 12 + 6 + Glass.ROW / 2f;

        Chrome.label(s, ctx, "You", px, cy);
        String you = c.player == null ? "—" : c.player.getBlockX() + "  " + c.player.getBlockY() + "  " + c.player.getBlockZ();
        Type.drawRight(ctx, s.tr(), Type.FIGURE, you, px + pw, cy, Glass.INK);
        cy += Glass.ROW;

        /* the cursor: with its height where that is known — the surface of a
           loaded chunk, the floor of a cave — then the biome, known anywhere
           you have been, and the block, known where the chunk is loaded now */
        Chrome.label(s, ctx, "Cursor", px, cy);
        String cursor = "—", biome = "—", block = "—";
        if (over && spot != null) {
            cursor = spot.y != Integer.MIN_VALUE ? overX + "  " + spot.y + "  " + overZ : overX + "  ·  " + overZ;
            String name = Terrain.biomeName(spot.biome);
            if (name != null) biome = name;
            if (spot.block != null) block = spot.block;
        }
        Type.drawRight(ctx, s.tr(), Type.FIGURE, cursor, px + pw, cy, Glass.BODY);
        cy += Glass.ROW;

        Chrome.label(s, ctx, "Biome", px, cy);
        Type.drawRight(ctx, s.tr(), Type.FIGURE, Type.fit(s.tr(), Type.FIGURE, biome, pw - 90), px + pw, cy, Glass.BODY);
        cy += Glass.ROW;

        Chrome.label(s, ctx, "Block", px, cy);
        Type.drawRight(ctx, s.tr(), Type.FIGURE, Type.fit(s.tr(), Type.FIGURE, block, pw - 90), px + pw, cy, Glass.BODY);
        cy += Glass.ROW + 10;

        if (s.mapSelected != null && Waypoints.here(c).contains(s.mapSelected)) {
            Waypoints.Point p = s.mapSelected;
            Chrome.heading(s, ctx, "Waypoint", null, px, cy - Glass.ROW / 2f, pw);
            cy += 12 + 6;
            Chrome.label(s, ctx, Type.fit(s.tr(), Type.LABEL, p.name, pw - 120), px, cy);
            Type.drawRight(ctx, s.tr(), Type.FIGURE, p.x + "  " + p.y + "  " + p.z, px + pw, cy, Glass.INK);
            cy += Glass.ROW;
            String go = "centre on it";
            Chrome.chipButton(s, ctx, go, px + pw - Chrome.chipWidth(s, go), cy, Glass.INK, () -> focus(s, p));
            WaypointsPanel.teleportButton(s, ctx, c, p, px, cy);
            cy += Glass.ROW + 10;
        } else if (s.pinX != null) {
            Chrome.heading(s, ctx, "Pinned", null, px, cy - Glass.ROW / 2f, pw);
            cy += 12 + 6;
            Chrome.label(s, ctx, "Spot", px, cy);
            Type.drawRight(ctx, s.tr(), Type.FIGURE, s.pinX + "  ·  " + s.pinZ, px + pw, cy, Glass.INK);
            cy += Glass.ROW;
            String add = "add a waypoint here";
            Chrome.chipButton(s, ctx, add, px + pw - Chrome.chipWidth(s, add), cy, Glass.GO, () -> addAt(s, c, s.pinX, s.pinZ));
            cy += Glass.ROW + 10;
        }

        float ly = cy - Glass.ROW / 2f + 8;
        for (String line : Type.wrap(s.tr(), Type.DESC,
                "Click the map to pin a spot, right-click to put a waypoint there. The map keeps everywhere you have been, on this computer only.", pw)) {
            Type.draw(ctx, s.tr(), Type.DESC, line, px, ly, Glass.META);
            ly += 18;
        }
        Chrome.changes(s, ctx, x, y + h - Chrome.CHANGES_H, w);
    }

    /* ── the depth control ────────────────────────────────────────────────── */

    private static final String[] DEPTHS = { Terrain.AUTO, Terrain.SURFACE, Terrain.CAVES };

    /** how wide the word and the three choices are together */
    private static float depthWidth(EditorScreen s) {
        float w = Type.width(s.tr(), Type.CAPS, "Depth") + 10;
        for (String d : DEPTHS) w += Type.width(s.tr(), Type.VALUE, d) + 20;
        return w;
    }

    /** "Depth" and its three choices, right-aligned at `right`; returns the left edge */
    private static float depthControl(EditorScreen s, DrawContext ctx, String depth, float right, float cy) {
        int picked = 0;
        for (int i = 0; i < DEPTHS.length; i++) if (DEPTHS[i].equals(depth)) picked = i;
        float segLeft = Chrome.seg(s, ctx, DEPTHS, picked, right, cy, i -> {
            Feature now = s.config.feature("worldmap");
            if (now == null) return;
            s.config.putFeature("worldmap", now.withOpt("layer", '"' + DEPTHS[i] + '"'));
            s.change("Map · depth " + DEPTHS[i]);
            s.click();
        });
        return Type.drawRight(ctx, s.tr(), Type.CAPS, "Depth", segLeft - 10, cy, Glass.META);
    }

    /* ── arithmetic ───────────────────────────────────────────────────────── */

    static double worldX(EditorScreen s, float screenX) {
        float[] a = s.mapArea;
        return s.mapX + (screenX - (a[0] + a[2] / 2f)) / s.mapZoom;
    }

    static double worldZ(EditorScreen s, float screenY) {
        float[] a = s.mapArea;
        return s.mapZ + (screenY - (a[1] + a[3] / 2f)) / s.mapZoom;
    }

    /** one step in or out, keeping the block under the cursor where it is when there is a cursor */
    static void zoomBy(EditorScreen s, int steps, float atX, float atY) {
        int i = 0;
        while (i < ZOOMS.length - 1 && ZOOMS[i] < s.mapZoom) i++;
        int next = Math.max(0, Math.min(ZOOMS.length - 1, i + steps));
        if (ZOOMS[next] == s.mapZoom) return;
        if (!Float.isNaN(atX) && s.mapArea != null) {
            double wx = worldX(s, atX), wz = worldZ(s, atY);
            s.mapZoom = ZOOMS[next];
            s.mapFollow = false;
            s.mapX = wx - (atX - (s.mapArea[0] + s.mapArea[2] / 2f)) / s.mapZoom;
            s.mapZ = wz - (atY - (s.mapArea[1] + s.mapArea[3] / 2f)) / s.mapZoom;
        } else {
            s.mapZoom = ZOOMS[next];
        }
    }

    static String zoomName(float z) {
        return z >= 1f ? String.format(Locale.ROOT, "%d×", (int) z) : z == 0.5f ? "½×" : "¼×";
    }

    /** right-click on the map */
    static boolean rightClick(EditorScreen s, float x, float y) {
        float[] a = s.mapArea;
        if (a == null || x < a[0] || x >= a[0] + a[2] || y < a[1] || y >= a[1] + a[3]) return false;
        addAt(s, s.mc(), (int) Math.floor(worldX(s, x)), (int) Math.floor(worldZ(s, y)));
        return true;
    }

    private static void addAt(EditorScreen s, MinecraftClient c, int wx, int wz) {
        if (c.world == null || c.player == null) return;
        int wy = c.world.getChunkManager().isChunkLoaded(wx >> 4, wz >> 4)
            ? c.world.getTopY(Heightmap.Type.WORLD_SURFACE, wx, wz) : c.player.getBlockY();
        Waypoints.Point p = Waypoints.addAt(c, null, wx, wy, wz);
        if (p == null) return;
        s.mapSelected = p;
        s.pinX = null;
        s.pinZ = null;
        s.change("Map · added " + p.name + " at " + wx + ", " + wz);
        s.click();
    }
}
