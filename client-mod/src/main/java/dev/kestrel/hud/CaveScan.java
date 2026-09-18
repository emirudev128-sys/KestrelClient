package dev.kestrel.hud;

/**
 * THE CAVE VIEW'S ONE DECISION, WITH NO MINECRAFT IN IT.
 *
 * <p>Down one column from a slice top: through rock to the first open space,
 * and on to the floor under it. What comes back is packed in an int, so the
 * world map can keep what was found and how high and light it later, for
 * wherever the player stands when they look. {@link Terrain} feeds it the
 * game's blocks; {@code tools/hudroundtrip/CaveCheck} feeds it made-up columns
 * — the nether's lava sea forty blocks down, a pit, solid rock, a lake — and
 * checks every answer, which is why it is kept apart from the game's classes.
 *
 * <p><b>THE PACKING:</b> bit 31 set means read (0 is "not read"); bits 29-30
 * are {@link #FLOOR}, {@link #SOLID} or {@link #OPEN}; bits 8-23 the height
 * plus 32768; bits 0-7 the floor's map colour id.
 */
final class CaveScan {

    private CaveScan() { }

    /** a column of blocks as a cave read sees it: the game's, or a test's */
    interface Column {
        int AIR = 0, CLEAR = 1, FLUID = 2, SOLID = 3;

        /** whether the sixteen-block section holding height y has anything in it at all */
        boolean filled(int y);

        /** what the block at height y is to a cave read: {@link #AIR}, {@link #CLEAR} (seen through), {@link #FLUID} or {@link #SOLID} */
        int kind(int y);

        /** the map colour id of the block at height y — for a fluid, the fluid's */
        int colour(int y);
    }

    /** a floor, found under open space; solid rock all through; open all the way down */
    static final int FLOOR = 0, SOLID = 1, OPEN = 2;

    /* LAVA'S OWN COLOUR ID, past the game's sixty-four. Its map colour is the
       red that TNT and redstone blocks share, and shaded with depth that red
       came out as netherrack's; a floor that is lava is told apart here so it
       can be drawn as lava. */
    static final int LAVA_ID = 250;

    static int pack(int kind, int y, int colourId) {
        return 0x80000000 | (kind << 29) | (((y + 32768) & 0xFFFF) << 8) | (colourId & 0xFF);
    }

    static int kindOf(int packed) {
        return (packed >>> 29) & 3;
    }

    static int heightOf(int packed) {
        return ((packed >>> 8) & 0xFFFF) - 32768;
    }

    static int colourOf(int packed) {
        return packed & 0xFF;
    }

    /**
     * one column, from `from` down to `bottom`: rock down to `rockTo` with no
     * opening is SOLID; open space with no floor above `bottom` is OPEN; water
     * and lava are floors wherever they are met. A section with nothing in it
     * is passed in one step.
     */
    static int scan(Column col, int from, int bottom, int rockTo) {
        boolean open = false;
        int y = from;
        while (y >= bottom) {
            if (!col.filled(y)) {
                open = true;
                y = Math.max(bottom, y & ~15) - 1;
                continue;
            }
            int kind = col.kind(y);
            if (kind == Column.FLUID) return pack(FLOOR, y, col.colour(y));
            if (kind == Column.SOLID) {
                if (open) return pack(FLOOR, y, col.colour(y));
                if (y <= rockTo) return pack(SOLID, y, 0);
            } else {
                open = true;
            }
            y--;
        }
        return pack(open ? OPEN : SOLID, bottom, 0);
    }

    /* HOW LIGHT A FLOOR IS FOR HOW FAR BELOW YOUR FEET IT LIES: a touch
       brighter above them, then darker the deeper, quickly at first and then
       slowly, and never near black — black is what rock is. */
    private static final float[] LIGHT = new float[140];
    static {
        for (int i = 0; i < LIGHT.length; i++) {
            int below = i - 8;
            LIGHT[i] = below <= 0
                ? 1f + Math.min(3, -below) * 0.03f
                : (float) (1.0 - 0.55 * (1.0 - Math.exp(-below / 14.0)));
        }
    }

    static double light(int below) {
        return LIGHT[Math.max(0, Math.min(LIGHT.length - 1, below + 8))];
    }

    static int shade(int argb, double f) {
        int r = (int) Math.min(255, Math.max(0, ((argb >> 16) & 255) * f));
        int g = (int) Math.min(255, Math.max(0, ((argb >> 8) & 255) * f));
        int b = (int) Math.min(255, Math.max(0, (argb & 255) * f));
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }
}
