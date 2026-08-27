package dev.kestrel.hud;

/**
 * CLICKS PER SECOND, COUNTED HONESTLY.
 *
 * <p>A CPS readout is a count of button presses in the last second, and the
 * only interesting decision in it is what "the last second" means.
 *
 * <p><b>A RING OF TIMESTAMPS, NOT A COUNTER THAT RESETS.</b> The cheap version
 * increments on press and zeroes every twenty ticks, and it is wrong in a way
 * people notice: a steady eight clicks a second reads as anything from 1 to 8
 * depending where in the window you look, because the count starts again from
 * nothing at each boundary. Keeping the timestamps and counting how many fall
 * inside a sliding second gives the same answer whenever you glance at it.
 *
 * <p><b>RISING EDGES ONLY.</b> {@code isPressed()} is a state, not an event —
 * polled every tick it is true for as long as the button is held, so a held
 * mouse button would count twenty a second forever. Only the tick where it
 * goes from up to down is a click.
 *
 * <p><b>NANOTIME, NOT WALL TIME.</b> {@code System.currentTimeMillis()} steps
 * when the clock is corrected, which would empty or flood the window; the
 * monotonic clock cannot.
 *
 * <p>Not thread safe, and does not need to be: the client tick and the render
 * pass are both the render thread.
 */
final class Clicks {

    private Clicks() { }

    /* a second at even the most implausible click rate does not reach this,
       and the ring never grows, so a stuck button cannot allocate */
    private static final int CAP = 64;
    private static final long WINDOW_NS = 1_000_000_000L;

    private static final long[] LEFT = new long[CAP];
    private static final long[] RIGHT = new long[CAP];
    private static int leftAt = 0;
    private static int rightAt = 0;

    private static boolean leftWasDown = false;
    private static boolean rightWasDown = false;

    /** called once per client tick with the current button states */
    static void tick(boolean leftDown, boolean rightDown) {
        long now = System.nanoTime();
        if (leftDown && !leftWasDown) { LEFT[leftAt] = now; leftAt = (leftAt + 1) % CAP; }
        if (rightDown && !rightWasDown) { RIGHT[rightAt] = now; rightAt = (rightAt + 1) % CAP; }
        leftWasDown = leftDown;
        rightWasDown = rightDown;
    }

    /** how many of the chosen buttons were clicked in the last second */
    static int count(String buttons) {
        long now = System.nanoTime();
        if ("right".equals(buttons)) return within(RIGHT, now);
        if ("both".equals(buttons)) return within(LEFT, now) + within(RIGHT, now);
        return within(LEFT, now);
    }

    private static int within(long[] ring, long now) {
        int n = 0;
        for (int i = 0; i < CAP; i++) {
            long t = ring[i];
            if (t != 0 && now - t < WINDOW_NS) n++;
        }
        return n;
    }
}
