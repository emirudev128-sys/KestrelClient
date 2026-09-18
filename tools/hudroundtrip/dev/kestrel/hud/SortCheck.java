package dev.kestrel.hud;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Random;

/**
 * THE SORTER'S CLICKS, RUN AGAINST A MODEL OF A CHEST.
 *
 * <p>{@link SortPlan} is the part of the inventory sorter that decides the
 * clicks, and it has no Minecraft in it so that this can run it on a bare JDK.
 * The model below is vanilla's left click on a slot, rule for rule: pick up
 * onto an empty cursor, put down onto an empty slot, top up the same item as
 * far as the slot holds, swap a different one. Some items stack to 16, and one
 * does not stack at all, because those are where a sort goes wrong.
 *
 * <p>A thousand random chests, each checked for the things a player would
 * notice: every item still there in the same amount, nothing left on the
 * cursor, the empty slots at the end, at most one part-stack of anything, and
 * the order held from the first slot to the last. Reports through a UTF-8
 * file, as RoundTrip does.
 */
public final class SortCheck {

    /* a stack: item type and count; type 0 is empty */
    static final int[] MAX = { 0, 64, 64, 64, 16, 16, 1 };

    static class Model implements SortPlan.Grid {
        final int[] type, count;
        int cursorType = 0, cursorCount = 0, clicks = 0;

        Model(int[] type, int[] count) {
            this.type = type;
            this.count = count;
        }

        @Override public int size() { return type.length; }
        @Override public boolean empty(int i) { return type[i] == 0; }
        @Override public boolean full(int i) { return type[i] != 0 && count[i] >= MAX[type[i]]; }
        @Override public boolean same(int a, int b) { return type[a] != 0 && type[a] == type[b]; }
        @Override public int compare(int a, int b) {
            if (type[a] != type[b]) return Integer.compare(type[a], type[b]);
            return Integer.compare(count[b], count[a]);   /* fullest first */
        }
        @Override public boolean cursorEmpty() { return cursorType == 0; }

        @Override public void click(int i) {
            clicks++;
            if (cursorType == 0) {
                cursorType = type[i]; cursorCount = count[i];
                type[i] = 0; count[i] = 0;
            } else if (type[i] == 0) {
                type[i] = cursorType; count[i] = cursorCount;
                cursorType = 0; cursorCount = 0;
            } else if (type[i] == cursorType) {
                int move = Math.min(cursorCount, MAX[type[i]] - count[i]);
                count[i] += move;
                cursorCount -= move;
                if (cursorCount == 0) cursorType = 0;
            } else {
                int t = type[i], n = count[i];
                type[i] = cursorType; count[i] = cursorCount;
                cursorType = t; cursorCount = n;
            }
        }
    }

    /* A GRID THAT CANNOT TELL TWO STACKS ARE THE SAME, so the merge never
       happens. Run through the same checks, it must fail — which is what
       proves the checks can see a bad sort at all. */
    static final class Broken extends Model {
        Broken(int[] type, int[] count) { super(type, count); }
        @Override public boolean same(int a, int b) { return false; }
    }

    public static void main(String[] args) throws Exception {
        int[] good = trials(false);
        int[] broken = trials(true);
        String report = "trials 1000\nfailures " + good[0] + "\nmaxclicks " + good[1]
            + "\nbrokenfailures " + broken[0] + "\nfirst " + firstFailure + "\n";
        Files.writeString(Paths.get(args[0]), report, java.nio.charset.StandardCharsets.UTF_8);
    }

    static String firstFailure = "";

    /** { failures, most clicks } over a thousand random chests */
    static int[] trials(boolean broken) {
        Random rnd = new Random(20260917L);
        int trials = 1000, failures = 0, maxClicks = 0;
        String first = "";
        for (int t = 0; t < trials; t++) {
            int size = 27;
            int[] type = new int[size], count = new int[size];
            long[] totalBefore = new long[MAX.length];
            for (int i = 0; i < size; i++) {
                if (rnd.nextInt(10) < 4) continue;
                type[i] = 1 + rnd.nextInt(MAX.length - 1);
                count[i] = 1 + rnd.nextInt(MAX[type[i]]);
                totalBefore[type[i]] += count[i];
            }
            Model m = broken ? new Broken(type, count) : new Model(type, count);
            boolean ran = SortPlan.run(m);
            maxClicks = Math.max(maxClicks, m.clicks);

            String why = null;
            long[] totalAfter = new long[MAX.length];
            for (int i = 0; i < size; i++) totalAfter[type[i]] += count[i];
            if (!ran) why = "stopped early";
            else if (!m.cursorEmpty()) why = "left something on the cursor";
            else if (!java.util.Arrays.equals(totalBefore, totalAfter) && !sameExceptEmpty(totalBefore, totalAfter)) why = "item counts changed";
            else {
                boolean seenEmpty = false;
                int[] partials = new int[MAX.length];
                for (int i = 0; i < size && why == null; i++) {
                    if (type[i] == 0) { seenEmpty = true; continue; }
                    if (seenEmpty) why = "an empty slot before a full one at " + i;
                    if (count[i] < MAX[type[i]] && ++partials[type[i]] > 1) why = "two part-stacks of type " + type[i];
                    if (i > 0 && type[i - 1] != 0 && m.compare(i - 1, i) > 0) why = "out of order at " + i;
                }
            }
            if (why != null) {
                failures++;
                if (first.isEmpty()) first = "trial " + t + ": " + why;
            }
        }
        if (!broken) firstFailure = first;
        return new int[] { failures, maxClicks };
    }

    /* type 0's slot of the totals counts nothing, so compare from 1 */
    private static boolean sameExceptEmpty(long[] a, long[] b) {
        for (int i = 1; i < a.length; i++) if (a[i] != b[i]) return false;
        return true;
    }
}
