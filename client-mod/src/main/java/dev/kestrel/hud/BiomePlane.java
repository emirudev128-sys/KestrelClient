package dev.kestrel.hud;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * WHICH BIOME EACH PART OF A MAP TILE IS.
 *
 * <p>The game keeps biomes four blocks to a side, so a tile of 256 blocks is
 * 64 cells each way: a short list of the biomes' ids, and for every cell a
 * number into it. An id, not the game's own number for the biome — that
 * number belongs to one world's registry, and these are kept in a file that
 * outlives it. Zero is "not known": a tile saved before biomes were kept, or
 * a chunk nobody has read.
 *
 * <p>It is what lets the map name the biome under the pointer in places that
 * are not loaded any more. No Minecraft in it, so the map's offline check can
 * run it.
 */
final class BiomePlane {

    static final int CELLS = 64;
    /* a byte a cell, and zero is taken */
    private static final int MOST = 255;

    private final List<String> names = new ArrayList<>();
    private final byte[] cells = new byte[CELLS * CELLS];

    /** says which biome a cell is; true when that changed anything */
    boolean set(int cellX, int cellZ, String id) {
        if (id == null || id.isEmpty() || cellX < 0 || cellZ < 0 || cellX >= CELLS || cellZ >= CELLS) return false;
        int i = names.indexOf(id);
        if (i < 0) {
            /* more biomes in one tile than a byte counts: the rest stay unknown */
            if (names.size() >= MOST || id.length() > 200) return false;
            names.add(id);
            i = names.size() - 1;
        }
        byte v = (byte) (i + 1);
        int at = cellZ * CELLS + cellX;
        if (cells[at] == v) return false;
        cells[at] = v;
        return true;
    }

    /** the biome's id, or null when it is not known */
    String get(int cellX, int cellZ) {
        if (cellX < 0 || cellZ < 0 || cellX >= CELLS || cellZ >= CELLS) return null;
        int v = cells[cellZ * CELLS + cellX] & 0xFF;
        return v == 0 || v > names.size() ? null : names.get(v - 1);
    }

    boolean isEmpty() {
        return names.isEmpty();
    }

    void clear() {
        names.clear();
        Arrays.fill(cells, (byte) 0);
    }

    /** a copy nothing else will touch, for the thread that writes files */
    BiomePlane copy() {
        BiomePlane c = new BiomePlane();
        c.names.addAll(names);
        System.arraycopy(cells, 0, c.cells, 0, cells.length);
        return c;
    }

    void copyTo(BiomePlane into) {
        into.names.clear();
        into.names.addAll(names);
        System.arraycopy(cells, 0, into.cells, 0, cells.length);
    }

    /* ── in a file: how many names, the names, and — when there are any — the cells ── */

    void write(DataOutputStream out) throws IOException {
        out.writeShort(names.size());
        for (String n : names) out.writeUTF(n);
        if (!names.isEmpty()) out.write(cells);
    }

    /** reads what {@link #write} wrote; false, and left empty, when it is not that */
    boolean read(DataInputStream in) throws IOException {
        clear();
        int n = in.readUnsignedShort();
        if (n > MOST) return false;
        for (int i = 0; i < n; i++) names.add(in.readUTF());
        if (n == 0) return true;
        byte[] read = in.readNBytes(cells.length);
        if (read.length != cells.length) {
            clear();
            return false;
        }
        System.arraycopy(read, 0, cells, 0, cells.length);
        return true;
    }
}
