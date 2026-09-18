package dev.kestrel.hud;

/**
 * THE WORLD MAP FROM FURTHER UP: ONE PIXEL FOR EVERY FOUR BLOCKS.
 *
 * <p>At its furthest zoom the map shows four blocks to a pixel, and a window's
 * worth of that is more full tiles than memory is given — so the edges of a
 * large explored world stayed blank until you zoomed in. An overview tile is
 * the same 256 by 256 pixels covering sixteen full tiles, 1,024 blocks a side,
 * and a window of those is a few dozen at most. The map draws them when it is
 * zoomed out past half a pixel a block, and the full tiles otherwise.
 *
 * <p><b>IT ONLY EVER MIRRORS THE FULL TILES.</b> A chunk that is read is folded
 * in as it is read; a full tile brought back from disk is folded in whole;
 * and an overview that shows nothing of a full tile that exists — a map kept
 * before there were overviews, a deleted file — has that tile folded in from
 * disk while the map is open. So it can always be made again from the tiles,
 * and nothing is lost by losing it.
 *
 * <p><b>THE SURFACE</b> is the average of the four-by-four columns that were
 * read, which from this far up is what the ground looks like. <b>THE CAVES</b>
 * are not averaged — a reading is a floor's height and kind, not a colour:
 * the highest floor in the cell stands for it, so a passage one block wide is
 * still a passage from up here, then open depth, and rock only when the whole
 * cell is rock.
 *
 * <p>No Minecraft in it, so the map's offline check can run it.
 */
final class Overview {

    private Overview() { }

    /** blocks to an overview pixel — and so full tiles to an overview tile, each way */
    static final int STEP = 4;
    private static final int T = 256;

    /**
     * folds the square of `size` blocks whose corner is (fx, fz) in a full
     * tile into the overview tile, where that corner is pixel (ox, oz). True
     * when the overview changed. A cell the full tile has nothing for is left
     * as it was: a full tile that had to be started again does not wipe the
     * little that is still known of the place.
     */
    static boolean fold(int[] full, int fx, int fz, int size, int[] over, int ox, int oz, boolean caves) {
        boolean changed = false;
        int n = size / STEP;
        for (int j = 0; j < n; j++) {
            for (int i = 0; i < n; i++) {
                int cell = caves ? caveCell(full, fx + i * STEP, fz + j * STEP) : surfaceCell(full, fx + i * STEP, fz + j * STEP);
                if (cell == 0) continue;
                int at = (oz + j) * T + ox + i;
                if (over[at] != cell) {
                    over[at] = cell;
                    changed = true;
                }
            }
        }
        return changed;
    }

    /** the surface: the average of the columns that were read; 0 when none was */
    static int surfaceCell(int[] full, int x0, int z0) {
        int r = 0, g = 0, b = 0, n = 0;
        for (int z = z0; z < z0 + STEP; z++) {
            for (int x = x0; x < x0 + STEP; x++) {
                int v = full[z * T + x];
                if (v == 0) continue;
                r += (v >> 16) & 255;
                g += (v >> 8) & 255;
                b += v & 255;
                n++;
            }
        }
        return n == 0 ? 0 : 0xFF000000 | ((r / n) << 16) | ((g / n) << 8) | (b / n);
    }

    /** the caves: the highest floor, else open depth, else rock; 0 when nothing was read */
    static int caveCell(int[] full, int x0, int z0) {
        int best = 0, bestRank = -1, bestY = Integer.MIN_VALUE;
        for (int z = z0; z < z0 + STEP; z++) {
            for (int x = x0; x < x0 + STEP; x++) {
                int v = full[z * T + x];
                if (v == 0) continue;
                int kind = CaveScan.kindOf(v);
                int rank = kind == CaveScan.FLOOR ? 2 : kind == CaveScan.OPEN ? 1 : 0;
                int y = CaveScan.heightOf(v);
                if (rank > bestRank || (rank == 2 && bestRank == 2 && y > bestY)) {
                    best = v;
                    bestRank = rank;
                    bestY = y;
                }
            }
        }
        return best;
    }

    /** whether the overview shows nothing at all of the full tile whose corner is its pixel (ox, oz) */
    static boolean blank(int[] over, int ox, int oz) {
        int n = T / STEP;
        for (int z = 0; z < n; z++) {
            for (int x = 0; x < n; x++) {
                if (over[(oz + z) * T + ox + x] != 0) return false;
            }
        }
        return true;
    }
}
