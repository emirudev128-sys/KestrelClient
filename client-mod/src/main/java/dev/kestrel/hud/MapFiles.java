package dev.kestrel.hud;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.zip.CRC32;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * THE WORLD MAP, KEPT BETWEEN GAMES.
 *
 * <p><b>ON THIS COMPUTER, IN THE GAME'S OWN FOLDER:</b>
 * {@code kestrel-map/<world>/<dimension>/<layer>/<x>_<z>.kmap}, one gzipped
 * file for each tile. The layers are the surface and the caves, a block to a
 * pixel in tiles of 256 blocks, and an overview of each, four blocks to a
 * pixel ({@link Overview}). The map used to live only in memory, and every
 * restart of the game started it from nothing. Nothing here opens a
 * connection: these are files the map reads back when you return.
 *
 * <p><b>WHAT A FILE HOLDS:</b> the tile's picture, and — for the two full
 * layers, since version 2 — which biome each four by four blocks is
 * ({@link BiomePlane}), so the map can name the biome under the pointer in
 * places that are not loaded. A version 1 file is still read; it has no
 * biomes until its chunks are read again.
 *
 * <p><b>WRITTEN AWAY FROM THE GAME.</b> The game hands over a copy of a tile
 * and one background thread compresses and writes it, to a temporary name
 * moved into place, so a crash mid-write leaves the last good file. A tile
 * asked for while its copy is still waiting is read from that copy, not from
 * a file that is about to change. When the game closes, the thread is given a
 * few seconds to finish.
 *
 * <p><b>NAMES THAT ARE SAFE ON EVERY DISK.</b> A world is a save folder or a
 * server address and a dimension is an identifier — both can hold characters
 * a file name cannot — so each becomes letters, digits, dots and dashes, with
 * a checksum of the original after it, so two names that clean up alike stay
 * two folders.
 *
 * <p><b>NO MINECRAFT IN IT</b>, so {@code tools/hudroundtrip/MapCheck} can run
 * it on a bare JDK: tiles written and read back, a read that beats its write,
 * a damaged file, an old file, names that are not safe.
 */
final class MapFiles {

    private MapFiles() { }

    /** the layers, which are also the byte a file says it is */
    static final int SURFACE = 0, CAVES = 1, SURFACE_OVERVIEW = 2, CAVES_OVERVIEW = 3;
    static final int LAYERS = 4;
    private static final String[] FOLDERS = { "surface", "caves", "surface-overview", "caves-overview" };

    private static final int MAGIC = 0x4B4D4150;   /* "KMAP" */
    private static final int VERSION = 2;          /* 1 had no biomes */
    private static final int TILE_INTS = 256 * 256;

    /* where warnings go; the mod points this at its log */
    static Consumer<String> warn = System.err::println;

    private static final ExecutorService IO = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "Kestrel map files");
        t.setDaemon(true);
        return t;
    });

    /* a tile handed over: its picture, and its biomes when it has any */
    private record Pending(int[] pixels, BiomePlane biomes) { }

    /* tiles handed over and not yet on disk, newest copy per file */
    private static final ConcurrentHashMap<Path, Pending> waiting = new ConcurrentHashMap<>();

    /* ── where ───────────────────────────────────────────────────────────── */

    /** the folder for one world and one dimension */
    static Path folder(Path root, String world, String dimension) {
        return root.resolve(safe(world)).resolve(safe(dimension));
    }

    /** one layer's folder inside a place's */
    static Path layerFolder(Path folder, int layer) {
        return folder.resolve(FOLDERS[layer]);
    }

    /** a tile's file */
    static Path file(Path folder, int layer, int tx, int tz) {
        return layerFolder(folder, layer).resolve(tx + "_" + tz + ".kmap");
    }

    /** letters, digits, dots and dashes, and a checksum of what it was */
    static String safe(String name) {
        String s = name == null ? "" : name;
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length() && b.length() < 48; i++) {
            char ch = s.charAt(i);
            boolean plain = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '.';
            b.append(plain ? ch : '_');
        }
        CRC32 crc = new CRC32();
        crc.update(s.getBytes(StandardCharsets.UTF_8));
        return (b.length() == 0 ? "_" : b.toString()) + "-" + String.format("%08x", crc.getValue());
    }

    /** the tiles a layer folder holds, as keys from {@link #key} */
    static Set<Long> index(Path layerFolder) {
        Set<Long> out = new HashSet<>();
        if (!Files.isDirectory(layerFolder)) return out;
        try (DirectoryStream<Path> files = Files.newDirectoryStream(layerFolder, "*.kmap")) {
            for (Path p : files) {
                String n = p.getFileName().toString();
                int us = n.indexOf('_', 1), dot = n.lastIndexOf(".kmap");
                if (us < 0 || dot < us) continue;
                try {
                    out.add(key(Integer.parseInt(n.substring(0, us)), Integer.parseInt(n.substring(us + 1, dot))));
                } catch (NumberFormatException ignored) {
                    /* not one of ours */
                }
            }
        } catch (IOException e) {
            warn.accept("Kestrel HUD: could not list " + layerFolder + ": " + e.getMessage());
        }
        return out;
    }

    static long key(int tx, int tz) {
        return ((long) tx << 32) | (tz & 0xFFFFFFFFL);
    }

    /* ── writing, on the background thread ──────────────────────────────── */

    /** hands copies of a tile to the writer; they must not be touched after. `biomes` may be null */
    static void save(Path file, int layer, int tx, int tz, int[] pixels, BiomePlane biomes) {
        waiting.put(file, new Pending(pixels, biomes));
        try {
            IO.execute(() -> write(file, layer, tx, tz));
        } catch (RejectedExecutionException closing) {
            /* the game is closing and the writer has stopped: write it here */
            write(file, layer, tx, tz);
        }
    }

    private static void write(Path file, int layer, int tx, int tz) {
        Pending data = waiting.get(file);
        if (data == null) return;   /* a newer copy was already written by an earlier turn */
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            Files.createDirectories(file.getParent());
            byte[] raw = new byte[data.pixels().length * 4];
            ByteBuffer.wrap(raw).asIntBuffer().put(data.pixels());
            try (OutputStream zip = new GZIPOutputStream(Files.newOutputStream(tmp), 1 << 16)) {
                DataOutputStream out = new DataOutputStream(zip);
                out.writeInt(MAGIC);
                out.writeInt(VERSION);
                out.writeByte(layer);
                out.writeInt(tx);
                out.writeInt(tz);
                out.write(raw);
                (data.biomes() == null ? new BiomePlane() : data.biomes()).write(out);
                out.flush();
            }
            /* a virus scanner or a backup tool can hold the old file open for a
               moment on Windows; a moment later the move goes through */
            for (int attempt = 1; ; attempt++) {
                try {
                    Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                    break;
                } catch (IOException busy) {
                    if (attempt >= 3) throw busy;
                    Thread.sleep(50L * attempt);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (IOException | RuntimeException e) {
            warn.accept("Kestrel HUD: could not write " + file + ": " + e.getMessage());
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignored) {
                /* nothing more to do */
            }
        } finally {
            /* only this copy: a newer one handed over meanwhile has its own turn coming */
            waiting.remove(file, data);
        }
    }

    /* ── reading, when a tile is wanted ─────────────────────────────────── */

    /** reads a tile into `into`, and its biomes into `biomes` when that is not null; false when there is no good file for it */
    static boolean load(Path file, int layer, int tx, int tz, int[] into, BiomePlane biomes) {
        Pending pending = waiting.get(file);
        if (pending != null) {
            System.arraycopy(pending.pixels(), 0, into, 0, Math.min(pending.pixels().length, into.length));
            if (biomes != null) {
                if (pending.biomes() != null) pending.biomes().copyTo(biomes);
                else biomes.clear();
            }
            return true;
        }
        try {
            if (!Files.isRegularFile(file) || Files.size(file) > 4L * 1024 * 1024) return false;
            try (InputStream zip = new GZIPInputStream(Files.newInputStream(file), 1 << 16)) {
                DataInputStream in = new DataInputStream(zip);
                if (in.readInt() != MAGIC) return false;
                int version = in.readInt();
                if (version < 1 || version > VERSION) return false;
                if (in.readByte() != layer || in.readInt() != tx || in.readInt() != tz) return false;
                byte[] raw = in.readNBytes(TILE_INTS * 4);
                if (raw.length != TILE_INTS * 4 || into.length != TILE_INTS) return false;
                ByteBuffer.wrap(raw).asIntBuffer().get(into);
                if (biomes != null) {
                    biomes.clear();
                    /* the picture is good whatever became of the biomes after it */
                    if (version >= 2) {
                        try {
                            biomes.read(in);
                        } catch (IOException | RuntimeException e) {
                            biomes.clear();
                        }
                    }
                }
                return true;
            }
        } catch (IOException | RuntimeException e) {
            warn.accept("Kestrel HUD: could not read " + file + ": " + e.getMessage());
            return false;
        }
    }

    /** as the game closes: everything handed over is written, or a few seconds pass */
    static void flush() {
        IO.shutdown();
        try {
            if (!IO.awaitTermination(5, TimeUnit.SECONDS)) warn.accept("Kestrel HUD: the map was still being saved as the game closed");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** whether anything is still waiting to be written — for the check */
    static boolean idle() {
        return waiting.isEmpty();
    }
}
