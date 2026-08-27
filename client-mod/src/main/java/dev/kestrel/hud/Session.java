package dev.kestrel.hud;

/**
 * HOW LONG THIS SESSION HAS BEEN.
 *
 * <p>Started when the mod initialises rather than when a world is joined, so
 * "playtime" means the same thing the launcher's own session clock means: how
 * long the game has been open. The two would otherwise disagree by however
 * long the title screen was up, and a player comparing the number in the
 * launcher with the number on their HUD would be right to call that a bug.
 *
 * <p><b>MONOTONIC, NOT WALL TIME.</b> A clock correction mid-session — which
 * is exactly what happens when a machine wakes from sleep and re-syncs — would
 * step the wall clock and make the readout jump or go backwards.
 */
final class Session {

    private Session() { }

    private static long startNs = System.nanoTime();

    /** called once, at mod init */
    static void begin() {
        startNs = System.nanoTime();
    }

    static long millis() {
        return (System.nanoTime() - startNs) / 1_000_000L;
    }
}
