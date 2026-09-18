package dev.kestrel.hud;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientChunkEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;

import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * THE WORLD MAP'S PICTURE: EVERYWHERE YOU HAVE BEEN.
 *
 * <p><b>ONLY WHAT THE GAME HAS ALREADY LOADED.</b> Nothing here asks for a
 * chunk: it reads the chunks the client already holds — so the map shows
 * where you have been, and nothing the server has not already sent you.
 *
 * <p><b>KEPT BETWEEN GAMES.</b> It used to live only in memory, and every
 * restart of the game started it from nothing. Every tile that changes is now
 * written to the game folder by {@link MapFiles} — half a minute after it
 * changed, when you leave the world or the dimension, and when the game
 * closes — and read back as it is needed: where you are, and wherever the open
 * map is looking. Memory holds {@link #MAX_TILES} of them; the rest wait on
 * disk.
 *
 * <p><b>AND FROM FURTHER UP, AN OVERVIEW.</b> Zoomed all the way out, a window
 * is more full tiles than memory is given, and the edges of a large explored
 * world stayed blank. At the furthest zoom — and a zoom sooner on a screen so
 * large that a window of full tiles would not fit — the map draws
 * {@link Overview} tiles instead: four blocks to a pixel, sixteen full tiles in
 * each, kept in step with the full tiles as chunks are read, kept on disk
 * beside them, and made again from them wherever they are missing.
 *
 * <p><b>EVERY CHUNK, NOT MOST OF THEM.</b> A chunk is queued the moment it
 * loads and the queue is worked through every tick; a chunk about to unload
 * that was never read is read right then. A slow sweep around you reads the
 * nearby ones again, for blocks that change and for caves at a new height.
 *
 * <p><b>THE SURFACE AND THE CAVES, KEPT APART.</b> Each place keeps two
 * pictures: the surface, where there is one, and the caves. A chunk's caves
 * are read at the height you were at when it was read — {@link Terrain#cave}
 * — and kept as what was found and how high, not as colours, so they are lit
 * for wherever you stand when you look. The map's Depth setting chooses which
 * picture you see; caves are only read while they are the one being shown.
 *
 * <p><b>AND WHICH BIOME.</b> With each chunk, the biome of every four by four
 * columns — at the surface, or at the cave floor — goes into the tile
 * ({@link BiomePlane}) and its file, so the map can name the biome under the
 * pointer anywhere you have been. The block under it is asked of the world,
 * and so only known where the chunk is loaded now.
 *
 * <p><b>ONE PICTURE PER WORLD AND DIMENSION</b>, each in its own folder. The
 * one you are in is the only one in memory; leaving it writes what changed
 * and lets the rest go, and coming back reads it again.
 *
 * <p><b>ON A CLOCK, NOT A COUNT.</b> Reading stops for the tick after a
 * millisecond, four while the map is open. The tiles are sent to the GPU as
 * they are drawn, the ones in view nearest the middle first, for two
 * milliseconds a frame, and read from disk for the open map for three.
 */
final class WorldMap {

    private WorldMap() { }

    static final int TILE = 256;
    /* in memory at once: 24 MB of full tiles, and as much again, at the very
       most, of overviews — a window zoomed all the way out is a few dozen */
    private static final int MAX_TILES = 96;
    private static final int MAX_OVERVIEW = 96;
    private static final long READ_NS = 1_000_000L, READ_NS_OPEN = 4_000_000L;
    private static final long UPLOAD_NS = 2_000_000L, LOAD_NS = 3_000_000L;
    /* ticks between writes of what changed: half a minute */
    private static final int SAVE_EVERY = 600;

    private static final class Tile {
        final int tx, tz, layer;
        final boolean caves, overview;
        /* the surface: colours; the caves: Terrain's packed readings */
        final int[] pixels = new int[TILE * TILE];
        /* which biome each four by four columns is; a full tile's only */
        final BiomePlane biomes;
        Identifier id;
        NativeImageBackedTexture texture;
        boolean dirty = true;       /* the GPU's copy is behind */
        boolean unsaved;            /* the file is behind */
        int litFor = Integer.MIN_VALUE;   /* the caves: the height they were lit for */
        long used;                  /* the clock when it was last read into or drawn */

        Tile(int tx, int tz, int layer) {
            this.tx = tx;
            this.tz = tz;
            this.layer = layer;
            this.caves = (layer & 1) == 1;
            this.overview = layer >= MapFiles.SURFACE_OVERVIEW;
            this.biomes = overview ? null : new BiomePlane();
        }
    }

    private static final class Place {
        final String key;
        final Path folder;
        /* by layer: what is in memory, what has a file, and what the open map
           should go looking for — for an overview, that is also wherever a
           full tile has a file, so a map kept before there were overviews
           gets them */
        final List<Map<Long, Tile>> tiles = new ArrayList<>();
        final List<Set<Long>> saved = new ArrayList<>();
        final List<Set<Long>> known = new ArrayList<>();
        final Set<Long> seenSurface = new HashSet<>();
        final Set<Long> seenCaves = new HashSet<>();

        Place(String key, Path folder) {
            this.key = key;
            this.folder = folder;
            for (int layer = 0; layer < MapFiles.LAYERS; layer++) {
                tiles.add(new HashMap<>());
                saved.add(MapFiles.index(MapFiles.layerFolder(folder, layer)));
            }
            for (int layer = 0; layer < MapFiles.LAYERS; layer++) {
                if (layer < MapFiles.SURFACE_OVERVIEW) {
                    known.add(saved.get(layer));
                    continue;
                }
                Set<Long> all = new HashSet<>(saved.get(layer));
                for (long full : saved.get(layer - 2)) {
                    all.add(key(Math.floorDiv((int) (full >> 32), Overview.STEP), Math.floorDiv((int) full, Overview.STEP)));
                }
                known.add(all);
            }
        }

        Set<Long> seen(boolean cave) {
            return cave ? seenCaves : seenSurface;
        }

        Path file(int layer, int tx, int tz) {
            return MapFiles.file(folder, layer, tx, tz);
        }

        /* how many are in memory, of the full tiles or of the overviews */
        int size(boolean overview) {
            int first = overview ? MapFiles.SURFACE_OVERVIEW : MapFiles.SURFACE;
            return tiles.get(first).size() + tiles.get(first + 1).size();
        }
    }

    /** what the map knows about one column, for the readout under the pointer */
    static final class Spot {
        /** the biome's id, or null */
        String biome;
        /** the block's name, or null — only where the chunk is loaded now */
        String block;
        /** the height of what is shown there, or MIN_VALUE */
        int y = Integer.MIN_VALUE;
    }

    private static Place place;
    private static boolean enabled;
    /* what is being read: the surface wherever there is one, the caves while they are shown */
    private static boolean readSurface, readCaves;
    private static int textureSerial = 0;
    private static long clock = 0;
    private static int sinceSave = 0;

    private static final ArrayDeque<Long> queue = new ArrayDeque<>();
    private static final Set<Long> queued = new HashSet<>();

    /* full tiles on disk that an overview shows nothing of yet: { layer, tx, tz } */
    private static final ArrayDeque<int[]> mending = new ArrayDeque<>();
    private static final int[] scratch = new int[TILE * TILE];

    private static int[][] order = new int[0][];
    private static int orderRadius = -1;
    private static int cursor = 0;
    private static boolean wasOpen, wasReadingCaves;
    private static int sweepFeet = Integer.MIN_VALUE;

    private static final Terrain.Reader READER = new Terrain.Reader();
    private static final Terrain.Reader LAST_CHANCE = new Terrain.Reader();
    private static final Terrain.Reader PROBE = new Terrain.Reader();
    private static final Spot SPOT = new Spot();
    /* the heights of the row before, for the slope */
    private static final int[] rowHeights = new int[16];
    /* the height to ask the biome at, for each of a chunk's sixteen cells */
    private static final int[] cellY = new int[16];

    /** the chunk events and the game's closing, once, at start */
    static void register() {
        MapFiles.warn = KestrelHudClient.LOG::warn;
        ClientChunkEvents.CHUNK_LOAD.register((world, chunk) -> {
            if (!enabled) return;
            long key = key(chunk.getPos().x, chunk.getPos().z);
            if (queued.add(key)) queue.add(key);
        });
        /* THE LAST CHANCE: a chunk leaving that was never read is read now,
           from the chunk itself, while its blocks are still there to read */
        ClientChunkEvents.CHUNK_UNLOAD.register((world, chunk) -> {
            MinecraftClient c = MinecraftClient.getInstance();
            if (!enabled || place == null || c.player == null || world != c.world) return;
            int cx = chunk.getPos().x, cz = chunk.getPos().z;
            long k = key(cx, cz);
            boolean surface = readSurface && !place.seenSurface.contains(k);
            boolean caves = readCaves && !place.seenCaves.contains(k);
            if (surface || caves) read(c, LAST_CHANCE.begin(world).use(chunk), cx, cz, surface, caves, c.player.getBlockY());
        });
        /* closing the game from inside a world: write what changed, and wait
           for it — the textures are left for the game to tear down with the rest */
        ClientLifecycleEvents.CLIENT_STOPPING.register(c -> {
            if (place != null) saveAll();
            MapFiles.flush();
        });
    }

    private static long key(int cx, int cz) {
        return ((long) cx << 32) | (cz & 0xFFFFFFFFL);
    }

    /** every tick: read what loaded, and around you, for as long as the clock allows */
    static void tick(MinecraftClient c, HudConfig config, boolean open) {
        Feature f = config.feature("worldmap");
        enabled = f != null && f.on;
        if (!enabled || c.world == null) {
            /* out of the world, or switched off: what changed goes to disk */
            if (place != null) leave(c);
            wasOpen = false;
            return;
        }
        if (c.player == null) return;
        clock++;

        String here = Waypoints.worldKey(c) + "|" + Waypoints.dimension(c);
        if (place == null || !place.key.equals(here)) switchTo(c, here);

        if (++sinceSave >= SAVE_EVERY) {
            sinceSave = 0;
            saveAll();
        }

        int feet = c.player.getBlockY();
        readSurface = !c.world.getDimension().hasCeiling();
        readCaves = Terrain.caves(c.world, f.choice("layer", Terrain.AUTO));

        /* the sweep starts again from you when the map opens, when the caves
           start being read, and when they are read from a new height */
        if ((open && !wasOpen) || (readCaves && !wasReadingCaves)) cursor = 0;
        if (readCaves && Math.abs(feet - sweepFeet) >= 4) {
            sweepFeet = feet;
            cursor = 0;
        }
        wasOpen = open;
        wasReadingCaves = readCaves;

        Terrain.Reader r = READER.begin(c.world);
        long start = System.nanoTime(), budget = open ? READ_NS_OPEN : READ_NS;

        /* 1. chunks that loaded since, until the time is up */
        while (!queue.isEmpty() && System.nanoTime() - start < budget) {
            long k = queue.poll();
            queued.remove(k);
            int cx = (int) (k >> 32), cz = (int) k;
            if (!c.world.getChunkManager().isChunkLoaded(cx, cz)) continue;
            read(c, r, cx, cz, readSurface, readCaves, feet);
        }

        /* 2. the sweep around you: one chunk a tick whatever the queue took,
           more with time to spare */
        int radius = Math.max(2, Math.min(c.options.getClampedViewDistance(), 16));
        if (radius != orderRadius) buildOrder(radius);
        int pcx = c.player.getBlockX() >> 4, pcz = c.player.getBlockZ() >> 4;
        int most = open ? 48 : 4;
        for (int n = 0; n < most && order.length > 0; n++) {
            if (n > 0 && System.nanoTime() - start >= budget) break;
            int[] o = order[cursor];
            cursor = (cursor + 1) % order.length;
            int cx = pcx + o[0], cz = pcz + o[1];
            if (c.world.getChunkManager().isChunkLoaded(cx, cz)) read(c, r, cx, cz, readSurface, readCaves, feet);
        }
    }

    /* A DIFFERENT WORLD OR DIMENSION: the place you left writes what changed
       and is let go; the one you arrive in is found on disk, or started. The
       queue is kept: the new place's chunks start loading before this tick
       notices the change, and a read checks the chunk is loaded now. */
    private static void switchTo(MinecraftClient c, String key) {
        if (place != null) leave(c);
        Path root = c.runDirectory.toPath().resolve("kestrel-map");
        place = new Place(key, MapFiles.folder(root, Waypoints.worldKey(c), Waypoints.dimension(c)));
        cursor = 0;
        sweepFeet = Integer.MIN_VALUE;
        sinceSave = 0;
    }

    /* leaving a place: what changed goes to disk, the textures go back, and
       the rest is let go — it is all in the files */
    private static void leave(MinecraftClient c) {
        for (Map<Long, Tile> layer : place.tiles) {
            for (Tile t : layer.values()) {
                save(t);
                release(c, t);
            }
        }
        mending.clear();
        place = null;
    }

    private static void saveAll() {
        for (Map<Long, Tile> layer : place.tiles) {
            for (Tile t : layer.values()) save(t);
        }
    }

    /* a copy to the writer, which takes it from here */
    private static void save(Tile t) {
        if (!t.unsaved) return;
        MapFiles.save(place.file(t.layer, t.tx, t.tz), t.layer, t.tx, t.tz, t.pixels.clone(), t.biomes == null ? null : t.biomes.copy());
        long k = key(t.tx, t.tz);
        place.saved.get(t.layer).add(k);
        place.known.get(t.layer).add(k);
        t.unsaved = false;
    }

    private static void release(MinecraftClient c, Tile t) {
        if (t.texture == null) return;
        c.getTextureManager().destroyTexture(t.id);
        t.texture = null;
        t.dirty = true;
    }

    /* chunks by distance from the player, nearest first */
    private static void buildOrder(int radius) {
        List<int[]> list = new ArrayList<>();
        for (int dx = -radius; dx <= radius; dx++) {
            for (int dz = -radius; dz <= radius; dz++) list.add(new int[] { dx, dz });
        }
        list.sort((a, b) -> Integer.compare(a[0] * a[0] + a[1] * a[1], b[0] * b[0] + b[1] * b[1]));
        order = list.toArray(new int[0][]);
        orderRadius = radius;
        cursor = 0;
    }

    private static int index(int wx, int wz) {
        return Math.floorMod(wz, TILE) * TILE + Math.floorMod(wx, TILE);
    }

    private static void read(MinecraftClient c, Terrain.Reader r, int cx, int cz, boolean surface, boolean caves, int feet) {
        if (place == null) return;
        long key = key(cx, cz);
        int tx = Math.floorDiv(cx, 16), tz = Math.floorDiv(cz, 16);
        if (surface) {
            Tile t = tile(c, MapFiles.SURFACE, tx, tz);
            boolean changed = false;
            for (int bz = 0; bz < 16; bz++) {
                int west = Integer.MIN_VALUE;
                for (int bx = 0; bx < 16; bx++) {
                    int wx = (cx << 4) + bx, wz = (cz << 4) + bz;
                    int argb = Terrain.surface(r, wx, wz, bz == 0 ? Integer.MIN_VALUE : rowHeights[bx], west);
                    rowHeights[bx] = Terrain.lastY;
                    west = Terrain.lastY;
                    /* the biome is asked at the surface, in the middle of each cell */
                    if ((bx & 3) == 1 && (bz & 3) == 1) cellY[(bz >> 2) * 4 + (bx >> 2)] = Terrain.lastY;
                    if (argb == 0) continue;   /* a column that reads as nothing keeps what was seen */
                    int i = index(wx, wz);
                    if (t.pixels[i] != argb) {
                        t.pixels[i] = argb;
                        changed = true;
                    }
                }
            }
            place.seenSurface.add(key);
            if (changed) t.dirty = true;
            if (changed | biomes(r, t, cx, cz)) t.unsaved = true;
            fold(c, t, cx, cz);
        }
        if (caves) {
            Tile t = tile(c, MapFiles.CAVES, tx, tz);
            boolean changed = false;
            for (int bz = 0; bz < 16; bz++) {
                for (int bx = 0; bx < 16; bx++) {
                    int wx = (cx << 4) + bx, wz = (cz << 4) + bz;
                    int packed = Terrain.cave(r, wx, wz, feet);
                    /* the biome of the cave: just over its floor, or at your own height in rock */
                    if ((bx & 3) == 1 && (bz & 3) == 1) {
                        cellY[(bz >> 2) * 4 + (bx >> 2)] = packed == 0 ? Integer.MIN_VALUE
                            : CaveScan.kindOf(packed) == CaveScan.FLOOR ? CaveScan.heightOf(packed) + 1 : feet;
                    }
                    if (packed == 0) continue;
                    int i = index(wx, wz);
                    if (t.pixels[i] != packed) {
                        t.pixels[i] = packed;
                        changed = true;
                    }
                }
            }
            place.seenCaves.add(key);
            if (changed) t.dirty = true;
            if (changed | biomes(r, t, cx, cz)) t.unsaved = true;
            fold(c, t, cx, cz);
        }
    }

    /* the chunk's sixteen biome cells into the tile, at the heights the read left in cellY */
    private static boolean biomes(Terrain.Reader r, Tile t, int cx, int cz) {
        boolean changed = false;
        int cellX = Math.floorMod(cx << 4, TILE) >> 2, cellZ = Math.floorMod(cz << 4, TILE) >> 2;
        for (int j = 0; j < 4; j++) {
            for (int i = 0; i < 4; i++) {
                int y = cellY[j * 4 + i];
                if (y == Integer.MIN_VALUE) continue;
                changed |= t.biomes.set(cellX + i, cellZ + j, r.biome((cx << 4) + i * 4 + 1, y, (cz << 4) + j * 4 + 1));
            }
        }
        return changed;
    }

    /* ── the overview, kept in step ─────────────────────────────────────── */

    /* a chunk just read into a full tile, into the overview over it */
    private static void fold(MinecraftClient c, Tile full, int cx, int cz) {
        Tile over = tile(c, full.layer + 2, Math.floorDiv(full.tx, Overview.STEP), Math.floorDiv(full.tz, Overview.STEP));
        int fx = Math.floorMod(cx << 4, TILE), fz = Math.floorMod(cz << 4, TILE);
        int ox = (Math.floorMod(full.tx, Overview.STEP) * TILE + fx) / Overview.STEP;
        int oz = (Math.floorMod(full.tz, Overview.STEP) * TILE + fz) / Overview.STEP;
        if (Overview.fold(full.pixels, fx, fz, 16, over.pixels, ox, oz, full.caves)) {
            over.dirty = true;
            over.unsaved = true;
        }
    }

    /* the whole of a full tile into an overview tile that is in memory */
    private static void foldWhole(int[] fullPixels, int ftx, int ftz, Tile over) {
        int ox = Math.floorMod(ftx, Overview.STEP) * (TILE / Overview.STEP), oz = Math.floorMod(ftz, Overview.STEP) * (TILE / Overview.STEP);
        if (Overview.fold(fullPixels, 0, 0, TILE, over.pixels, ox, oz, over.caves)) {
            over.dirty = true;
            over.unsaved = true;
        }
    }

    /* FULL TILES THE OVERVIEWS SHOW NOTHING OF — a map kept before there were
       overviews, or an overview file that was lost — are read from disk and
       folded in, while the open map's time for reading lasts */
    private static void mend(long deadline) {
        while (!mending.isEmpty() && System.nanoTime() < deadline) {
            int[] job = mending.poll();
            int layer = job[0], ftx = job[1], ftz = job[2];
            Tile over = place.tiles.get(layer + 2).get(key(Math.floorDiv(ftx, Overview.STEP), Math.floorDiv(ftz, Overview.STEP)));
            if (over == null) continue;   /* let go of since: it is looked over again when it is next brought in */
            Tile full = place.tiles.get(layer).get(key(ftx, ftz));
            if (full != null) foldWhole(full.pixels, ftx, ftz, over);
            else if (MapFiles.load(place.file(layer, ftx, ftz), layer, ftx, ftz, scratch, null)) foldWhole(scratch, ftx, ftz, over);
        }
    }

    /* ── tiles, in and out of memory ────────────────────────────────────── */

    /* a tile to read into: in memory, from its file, or new */
    private static Tile tile(MinecraftClient c, int layer, int tx, int tz) {
        Tile t = place.tiles.get(layer).get(key(tx, tz));
        if (t == null) {
            boolean overview = layer >= MapFiles.SURFACE_OVERVIEW;
            if (place.size(overview) >= (overview ? MAX_OVERVIEW : MAX_TILES)) evictOldest(c, overview, Long.MAX_VALUE);
            t = bring(c, layer, tx, tz);
        }
        t.used = clock;
        return t;
    }

    /* into memory: read from its file when it has one, empty when not */
    private static Tile bring(MinecraftClient c, int layer, int tx, int tz) {
        Tile t = new Tile(tx, tz, layer);
        long key = key(tx, tz);
        boolean fromFile = place.saved.get(layer).contains(key);
        if (fromFile && !MapFiles.load(place.file(layer, tx, tz), layer, tx, tz, t.pixels, t.biomes)) {
            /* a file that cannot be read is started again, and written over */
            place.saved.get(layer).remove(key);
            fromFile = false;
        }
        t.used = clock;
        place.tiles.get(layer).put(key, t);
        if (t.overview) {
            /* WHAT IT SHOULD SHOW AND DOES NOT: each of the sixteen full tiles
               under it that exists and that it has nothing of is folded in —
               now if that tile is in memory, from disk a little later if not */
            int span = TILE / Overview.STEP;
            for (int dz = 0; dz < Overview.STEP; dz++) {
                for (int dx = 0; dx < Overview.STEP; dx++) {
                    if (!Overview.blank(t.pixels, dx * span, dz * span)) continue;
                    int ftx = tx * Overview.STEP + dx, ftz = tz * Overview.STEP + dz;
                    Tile full = place.tiles.get(layer - 2).get(key(ftx, ftz));
                    if (full != null) foldWhole(full.pixels, ftx, ftz, t);
                    else if (place.saved.get(layer - 2).contains(key(ftx, ftz))) mending.add(new int[] { layer - 2, ftx, ftz });
                }
            }
        } else if (fromFile) {
            /* a full tile back from disk, whole into the overview over it: the
               two never differ for a tile that has been in memory */
            foldWhole(t.pixels, tx, tz, tile(c, layer + 2, Math.floorDiv(tx, Overview.STEP), Math.floorDiv(tz, Overview.STEP)));
        }
        return t;
    }

    /* THE TILE USED LONGEST AGO GOES, after writing what changed — of the
       full tiles, or of the overviews, which are counted apart. Anything
       used at or after `keep` stays — the open map passes its own frame, so
       nothing it is showing is let go to make room for something else it is
       showing. False when there was nothing it could let go. */
    private static boolean evictOldest(MinecraftClient c, boolean overview, long keep) {
        Tile oldest = null;
        int first = overview ? MapFiles.SURFACE_OVERVIEW : MapFiles.SURFACE;
        for (int layer = first; layer < first + 2; layer++) {
            for (Tile t : place.tiles.get(layer).values()) {
                if (oldest == null || t.used < oldest.used) oldest = t;
            }
        }
        if (oldest == null || oldest.used >= keep) return false;
        save(oldest);
        release(c, oldest);
        place.tiles.get(oldest.layer).remove(key(oldest.tx, oldest.tz));
        if (!overview) {
            /* its chunks count as unread again, so coming back reads them */
            Set<Long> seen = place.seen(oldest.caves);
            for (int cx = oldest.tx * 16; cx < oldest.tx * 16 + 16; cx++) {
                for (int cz = oldest.tz * 16; cz < oldest.tz * 16 + 16; cz++) seen.remove(key(cx, cz));
            }
        }
        return true;
    }

    private static void upload(MinecraftClient c, Tile t, int feet) {
        if (t.texture == null) {
            /* a fresh id each time a tile gets a texture: an id destroyed on
               the way out is never reused */
            t.id = Identifier.of(KestrelHudClient.MOD_ID, "worldmap/" + (textureSerial++));
            t.texture = new NativeImageBackedTexture(TILE, TILE, true);
            t.texture.setFilter(false, false);
            c.getTextureManager().registerTexture(t.id, t.texture);
        }
        NativeImage image = t.texture.getImage();
        if (image == null) return;
        for (int y = 0; y < TILE; y++) {
            for (int x = 0; x < TILE; x++) {
                int v = t.pixels[y * TILE + x];
                image.setColorArgb(x, y, t.caves ? Terrain.caveColour(v, feet) : v);
            }
        }
        t.texture.upload();
        t.dirty = false;
        t.litFor = feet;
    }

    /** whether this picture of this place has nothing in it, in memory or on disk */
    static boolean empty(boolean caves) {
        int layer = caves ? MapFiles.CAVES : MapFiles.SURFACE;
        return place == null || (place.tiles.get(layer).isEmpty() && place.saved.get(layer).isEmpty());
    }

    /* ── WHAT IS UNDER THE POINTER ────────────────────────────────────────
       The biome comes from the tile, so it is known anywhere you have been —
       the tile is brought in from disk if that is where it is. The block, and
       the surface's height, are asked of the world, and so are only known
       where the chunk is loaded now; in the caves the height is the floor's,
       which the tile has. The answer is one object, used again every frame. */
    static Spot probe(MinecraftClient c, boolean caves, int wx, int wz) {
        Spot s = SPOT;
        s.biome = null;
        s.block = null;
        s.y = Integer.MIN_VALUE;
        if (place == null || c.world == null || c.player == null) return s;

        int layer = caves ? MapFiles.CAVES : MapFiles.SURFACE;
        int tx = Math.floorDiv(wx, TILE), tz = Math.floorDiv(wz, TILE);
        long k = key(tx, tz);
        Tile t = place.tiles.get(layer).get(k);
        if (t == null && place.saved.get(layer).contains(k)) t = tile(c, layer, tx, tz);
        if (t != null) {
            t.used = clock;
            s.biome = t.biomes.get(Math.floorMod(wx, TILE) >> 2, Math.floorMod(wz, TILE) >> 2);
            int v = t.pixels[index(wx, wz)];
            if (caves && v != 0 && CaveScan.kindOf(v) == CaveScan.FLOOR) s.y = CaveScan.heightOf(v);
        }

        Terrain.Reader r = PROBE.begin(c.world);
        if (r.column(wx, wz)) {
            if (!caves) s.y = Terrain.surfaceY(r, wx, wz);
            if (s.y != Integer.MIN_VALUE) s.block = Terrain.blockName(r, wx, s.y, wz);
            /* a tile kept before biomes were, in a chunk not read again yet */
            if (s.biome == null) s.biome = r.biome(wx, s.y == Integer.MIN_VALUE ? c.player.getBlockY() : s.y + (caves ? 1 : 0), wz);
        }
        return s;
    }

    /* ── drawing: the tiles that fall in the view ─────────────────────────
       In whatever units the caller's matrix is in, `zoom` of them to a block,
       with (centreX, centreZ) at (cx, cy). Each tile is placed relative to the
       centre in double precision before it becomes a float, so the picture
       does not shimmer ten thousand blocks from spawn. Past half a pixel a
       block it is the overview's tiles, each sixteen times the ground. A tile
       in view that is only on disk is read in, three milliseconds a frame at
       most, making room from tiles out of view; one that changed, or whose
       caves were lit for a height two blocks from yours, is sent to the GPU
       as it is drawn — nearest the middle first, while the frame's two
       milliseconds last. */
    static void draw(DrawContext ctx, float cx, float cy, float w, float h, double centreX, double centreZ,
                     float zoom, boolean caves) {
        if (place == null) return;
        MinecraftClient c = MinecraftClient.getInstance();
        int feet = c.player == null ? 0 : c.player.getBlockY();
        long frame = ++clock;
        double halfW = w / 2.0 / zoom, halfH = h / 2.0 / zoom;
        /* THE OVERVIEW at the furthest zoom, where it is pixel for pixel what
           is on screen — and sooner on a screen so large that a window of
           full tiles would not fit in memory beside the ones being read
           around you. Blocky beats blank. */
        int across = Math.floorDiv((int) Math.floor(centreX + halfW), TILE) - Math.floorDiv((int) Math.floor(centreX - halfW), TILE) + 1;
        int down = Math.floorDiv((int) Math.floor(centreZ + halfH), TILE) - Math.floorDiv((int) Math.floor(centreZ - halfH), TILE) + 1;
        boolean far = zoom < 0.5f || (long) across * down > MAX_TILES - 16;
        int layer = (caves ? MapFiles.CAVES : MapFiles.SURFACE) + (far ? 2 : 0);
        int step = far ? Overview.STEP : 1;      /* blocks to a pixel of the tile */
        int span = TILE * step;                  /* blocks a tile covers */
        Map<Long, Tile> tiles = place.tiles.get(layer);
        int tx0 = Math.floorDiv((int) Math.floor(centreX - halfW), span);
        int tx1 = Math.floorDiv((int) Math.floor(centreX + halfW), span);
        int tz0 = Math.floorDiv((int) Math.floor(centreZ - halfH), span);
        int tz1 = Math.floorDiv((int) Math.floor(centreZ + halfH), span);
        double midX = centreX / span - 0.5, midZ = centreZ / span - 0.5;

        /* what is in view and in memory is marked first, so reading in the
           rest never lets go of something on screen */
        List<Tile> inView = new ArrayList<>();
        List<long[]> onDisk = new ArrayList<>();
        for (int tx = tx0; tx <= tx1; tx++) {
            for (int tz = tz0; tz <= tz1; tz++) {
                long k = key(tx, tz);
                Tile t = tiles.get(k);
                if (t != null) {
                    t.used = frame;
                    inView.add(t);
                } else if (place.known.get(layer).contains(k)) {
                    onDisk.add(new long[] { tx, tz });
                }
            }
        }
        onDisk.sort((a, b) -> Double.compare(
            (a[0] - midX) * (a[0] - midX) + (a[1] - midZ) * (a[1] - midZ),
            (b[0] - midX) * (b[0] - midX) + (b[1] - midZ) * (b[1] - midZ)));
        long loadDeadline = System.nanoTime() + LOAD_NS;
        for (long[] at : onDisk) {
            if (System.nanoTime() >= loadDeadline) break;
            if (place.size(far) >= (far ? MAX_OVERVIEW : MAX_TILES) && !evictOldest(c, far, frame)) break;
            Tile t = bring(c, layer, (int) at[0], (int) at[1]);
            t.used = frame;
            inView.add(t);
        }
        if (far) mend(loadDeadline);

        inView.sort((a, b) -> Double.compare(
            (a.tx - midX) * (a.tx - midX) + (a.tz - midZ) * (a.tz - midZ),
            (b.tx - midX) * (b.tx - midX) + (b.tz - midZ) * (b.tz - midZ)));
        long deadline = System.nanoTime() + UPLOAD_NS;
        var m = ctx.getMatrices();
        for (Tile t : inView) {
            boolean stale = t.texture == null || t.dirty || (t.caves && Math.abs(feet - t.litFor) >= 2);
            if (stale && System.nanoTime() < deadline) upload(c, t, feet);
            if (t.texture == null) continue;
            m.push();
            m.translate(cx + (float) ((t.tx * (double) span - centreX) * zoom), cy + (float) ((t.tz * (double) span - centreZ) * zoom), 0f);
            m.scale(zoom * step, zoom * step, 1f);
            ctx.drawTexture(RenderLayer::getGuiTextured, t.id, 0, 0, 0f, 0f, TILE, TILE, TILE, TILE);
            m.pop();
        }
    }
}
