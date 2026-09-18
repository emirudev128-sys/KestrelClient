package dev.kestrel.hud;

/**
 * THE SORT ITSELF, WITH NOTHING OF MINECRAFT IN IT.
 *
 * <p>{@link Sorter} decides what to sort and in what order; this decides the
 * clicks. It speaks only to a {@link Grid} — a row of slots it can ask about
 * and click — so the same steps run against the game's real slots and against
 * a model of them in {@code tools/hudroundtrip}, where a thousand random
 * inventories check that nothing is lost, nothing is left on the cursor, and
 * everything ends in order.
 *
 * <p><b>A CLICK IS VANILLA'S LEFT CLICK.</b> Empty cursor on a stack picks it
 * up; a stack on an empty slot puts it down; onto the same item it tops the
 * slot up as far as it will go; onto a different item it swaps.
 */
final class SortPlan {

    private SortPlan() { }

    interface Grid {
        int size();
        boolean empty(int slot);
        boolean full(int slot);
        /** the same item, components and all — stacks that can merge */
        boolean same(int a, int b);
        /** the order: negative when a sorts before b */
        int compare(int a, int b);
        void click(int slot);
        boolean cursorEmpty();
    }

    /** sorts the grid; false if a click did not do what it had to, and it stopped there */
    static boolean run(Grid g) {
        int n = g.size();
        if (!g.cursorEmpty()) return false;

        /* 1. every partial stack topped up from the same item further along */
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (g.empty(i) || g.full(i)) break;
                if (g.empty(j) || !g.same(i, j)) continue;
                g.click(j);
                g.click(i);
                if (!g.cursorEmpty()) g.click(j);
                if (!g.cursorEmpty()) return false;
            }
        }

        /* 2. selection: the first of what is left goes here */
        for (int p = 0; p < n; p++) {
            int best = -1;
            for (int s = p; s < n; s++) {
                if (g.empty(s)) continue;
                if (best < 0 || g.compare(s, best) < 0) best = s;
            }
            if (best < 0) break;
            if (best == p) continue;
            if (!g.empty(p) && g.compare(p, best) == 0) continue;
            g.click(best);
            g.click(p);
            if (!g.cursorEmpty()) g.click(best);
            if (!g.cursorEmpty()) return false;
        }
        return true;
    }
}
