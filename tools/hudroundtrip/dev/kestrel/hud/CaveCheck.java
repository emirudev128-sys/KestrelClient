package dev.kestrel.hud;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * THE CAVE VIEW'S DECISION, RUN AGAINST MADE-UP COLUMNS.
 *
 * <p>{@link CaveScan} is the part of the cave view that looks down a column
 * and decides what a map shows there, and it has no Minecraft in it so that
 * this can run it on a bare JDK. Two kinds of check:
 *
 * <p><b>COLUMNS WITH KNOWN ANSWERS</b> — a tunnel, solid rock, the nether's
 * lava sea forty blocks under a cliff, a pit deeper than the read, a lake at
 * your feet, glass, empty sections below zero, the edges of the rock depth and
 * the world's top and bottom. Each one is what went wrong before, or would.
 *
 * <p><b>A HUNDRED THOUSAND RANDOM COLUMNS</b> read twice: by the scan, which
 * passes an empty section in one step, and by the slowest possible reading,
 * one block at a time. They must agree every time — the step is only allowed
 * to be quicker, never different.
 *
 * <p>Reports through a UTF-8 file, as the other checks here do.
 */
public final class CaveCheck {

    static final int AIR = CaveScan.Column.AIR, CLEAR = CaveScan.Column.CLEAR,
        FLUID = CaveScan.Column.FLUID, SOLID = CaveScan.Column.SOLID;
    /* map colour ids, as the game numbers them — and lava, which the map tells apart by its own */
    static final int STONE = 11, WATER = 12, LAVA = CaveScan.LAVA_ID, NETHERRACK = 35, DEEPSLATE = 59, GRASS = 1;

    /** a column of blocks from `bottom` to `top`, all air until told otherwise */
    static final class Col implements CaveScan.Column {
        final int bottom, top;
        final int[] kinds, colours;

        Col(int bottom, int top) {
            this.bottom = bottom;
            this.top = top;
            kinds = new int[top - bottom + 1];
            colours = new int[top - bottom + 1];
        }

        Col set(int from, int to, int kind, int colour) {
            for (int y = Math.min(from, to); y <= Math.max(from, to); y++) {
                kinds[y - bottom] = kind;
                colours[y - bottom] = colour;
            }
            return this;
        }

        @Override
        public boolean filled(int y) {
            int s0 = Math.floorDiv(y, 16) * 16;
            for (int yy = s0; yy < s0 + 16; yy++) if (kind(yy) != AIR) return true;
            return false;
        }

        @Override
        public int kind(int y) {
            return y < bottom || y > top ? AIR : kinds[y - bottom];
        }

        @Override
        public int colour(int y) {
            return y < bottom || y > top ? 0 : colours[y - bottom];
        }
    }

    /* the slice a player at `feet` reads, as Terrain sets it up */
    static int read(Col c, int feet) {
        int from = feet + 2;
        return CaveScan.scan(c, from, Math.max(c.bottom, from - 96), from - 24);
    }

    /* the slowest reading there is: every block, no steps */
    static int naive(Col c, int from, int bottom, int rockTo) {
        boolean open = false;
        for (int y = from; y >= bottom; y--) {
            int k = c.kind(y);
            if (k == FLUID) return CaveScan.pack(CaveScan.FLOOR, y, c.colour(y));
            if (k == SOLID) {
                if (open) return CaveScan.pack(CaveScan.FLOOR, y, c.colour(y));
                if (y <= rockTo) return CaveScan.pack(CaveScan.SOLID, y, 0);
            } else {
                open = true;
            }
        }
        return CaveScan.pack(open ? CaveScan.OPEN : CaveScan.SOLID, bottom, 0);
    }

    static final List<String> failures = new ArrayList<>();
    static int cases = 0;

    static void expect(String name, int packed, int kind, int y, int colour) {
        cases++;
        boolean ok = packed != 0 && CaveScan.kindOf(packed) == kind && CaveScan.heightOf(packed) == y
            && (kind != CaveScan.FLOOR || CaveScan.colourOf(packed) == colour);
        if (!ok) {
            failures.add(name + ": got kind " + CaveScan.kindOf(packed) + " y " + CaveScan.heightOf(packed)
                + " colour " + CaveScan.colourOf(packed) + ", wanted kind " + kind + " y " + y + " colour " + colour);
        }
    }

    static void check(String name, boolean ok) {
        cases++;
        if (!ok) failures.add(name);
    }

    public static void main(String[] args) throws Exception {
        int F = CaveScan.FLOOR, S = CaveScan.SOLID, O = CaveScan.OPEN;

        /* a two-high tunnel through stone: its floor, under your feet */
        Col tunnel = new Col(-64, 319).set(-64, 319, SOLID, STONE).set(10, 11, AIR, 0);
        expect("the floor of the tunnel you stand in", read(tunnel, 10), F, 9, STONE);

        /* stone all the way: rock, decided 24 blocks down */
        Col rock = new Col(-64, 319).set(-64, 319, SOLID, STONE);
        expect("solid rock is rock", read(rock, 10), S, 12 - 24, 0);

        /* THE NETHER: a cliff at 70 over the lava sea at 31, and the column
           out over the sea — forty blocks of air, which the old read called
           nothing and drew as a hole */
        Col sea = new Col(0, 255).set(0, 31, FLUID, LAVA).set(0, 4, SOLID, NETHERRACK).set(123, 127, SOLID, NETHERRACK);
        expect("the lava sea forty blocks under the cliff is lava, not a hole", read(sea, 70), F, 31, LAVA);
        Col cliff = new Col(0, 255).set(0, 69, SOLID, NETHERRACK).set(0, 31, FLUID, LAVA).set(0, 4, SOLID, NETHERRACK);
        expect("and the cliff you stand on is netherrack", read(cliff, 70), F, 69, NETHERRACK);

        /* a pit deeper than the read goes: open depth, not nothing */
        Col pit = new Col(-64, 319).set(-64, -40, SOLID, STONE);
        expect("a pit deeper than the read is open depth", read(pit, 100), O, 100 + 2 - 96, 0);

        /* sections with nothing in them, below zero, passed in steps */
        Col below = new Col(-64, 319).set(-64, -49, SOLID, DEEPSLATE).set(16, 319, SOLID, STONE);
        expect("empty sections below zero are passed to the floor under them", read(below, 13), F, -49, DEEPSLATE);

        /* water at your feet is the floor */
        Col lake = new Col(-64, 319).set(-64, 319, SOLID, STONE).set(8, 20, FLUID, WATER);
        expect("a lake at your height is water", read(lake, 10), F, 12, WATER);

        /* glass is seen through */
        Col glass = new Col(-64, 319).set(-64, 319, SOLID, STONE).set(10, 11, AIR, 0).set(11, 11, CLEAR, 0);
        expect("glass is seen through to the floor", read(glass, 10), F, 9, STONE);

        /* THE EDGE OF THE ROCK DEPTH: an opening at the last block the read
           goes through rock for is found; one block further is not */
        Col edge = new Col(-64, 319).set(-64, 319, SOLID, STONE).set(12 - 23, 12 - 23, AIR, 0);
        expect("an opening 23 blocks into the rock is found", read(edge, 10), F, 12 - 24, STONE);
        Col past = new Col(-64, 319).set(-64, 319, SOLID, STONE).set(12 - 25, 12 - 25, AIR, 0);
        expect("one 25 blocks in is past the read", read(past, 10), S, 12 - 24, 0);

        /* the world's top and bottom */
        Col sky = new Col(-64, 319).set(-64, 70, SOLID, GRASS);
        expect("reading from over the top of the world is open depth, not a crash", read(sky, 318), O, 320 - 96, 0);
        Col floor = new Col(-64, 319).set(-64, 319, SOLID, DEEPSLATE).set(-59, -58, AIR, 0);
        expect("at the bottom of the world, the floor under you", read(floor, -59), F, -60, DEEPSLATE);
        expect("and solid rock there stops at the bottom", read(rock, -60), S, -64, 0);

        /* THE PACKING: every height a world can have, every colour id */
        boolean packs = true;
        for (int y = -2048; y <= 4095 && packs; y += 7) {
            for (int id = 0; id < 64; id++) {
                int p = CaveScan.pack(CaveScan.FLOOR, y, id);
                if (p == 0 || CaveScan.heightOf(p) != y || CaveScan.colourOf(p) != id || CaveScan.kindOf(p) != CaveScan.FLOOR) packs = false;
            }
        }
        int lava = CaveScan.pack(CaveScan.FLOOR, 31, CaveScan.LAVA_ID);
        check("a reading packs and unpacks to itself at every height", packs);
        check("and lava keeps its own colour id through the packing, apart from the game's sixty-four",
            CaveScan.colourOf(lava) == CaveScan.LAVA_ID && CaveScan.LAVA_ID >= 64 && CaveScan.LAVA_ID <= 255);

        /* THE LIGHT: brighter above your feet, darker below, never black */
        boolean down = true;
        for (int b = 1; b < 200; b++) if (CaveScan.light(b) > CaveScan.light(b - 1)) down = false;
        check("the deeper, the darker", down && CaveScan.light(10) < CaveScan.light(3));
        check("a floor at your feet is at full light, one above a little more",
            Math.abs(CaveScan.light(0) - 1.0) < 1e-6 && CaveScan.light(-2) > 1.0);
        check("and none is near black", CaveScan.light(1000) > 0.44);

        /* THE STEP IS ONLY QUICKER: random columns, read both ways */
        Random rnd = new Random(20260918L);
        int disagree = 0;
        String firstDisagreement = null;
        for (int trial = 0; trial < 100_000; trial++) {
            boolean nether = rnd.nextInt(3) == 0;
            Col c = nether ? new Col(0, 255) : new Col(-64, 319);
            for (int s0 = c.bottom; s0 <= c.top; s0 += 16) {
                if (rnd.nextInt(10) < 4) continue;   /* an empty section */
                for (int y = s0; y < s0 + 16; y++) {
                    int roll = rnd.nextInt(100);
                    int kind = roll < 55 ? SOLID : roll < 88 ? AIR : roll < 94 ? CLEAR : FLUID;
                    c.set(y, y, kind, kind == FLUID ? (rnd.nextBoolean() ? WATER : LAVA) : kind == SOLID ? 1 + rnd.nextInt(60) : 0);
                }
            }
            int from = c.bottom - 8 + rnd.nextInt(c.top - c.bottom + 20);
            int bottom = Math.max(c.bottom, from - 96), rockTo = from - 24;
            int quick = CaveScan.scan(c, from, bottom, rockTo), slow = naive(c, from, bottom, rockTo);
            if (quick != slow) {
                disagree++;
                if (firstDisagreement == null) firstDisagreement = "from " + from + ": " + Integer.toHexString(quick) + " vs " + Integer.toHexString(slow);
            }
        }
        check("a hundred thousand random columns read the same stepped as block by block"
            + (firstDisagreement == null ? "" : " (" + firstDisagreement + ")"), disagree == 0);

        String report = "cases " + cases + "\nfailures " + failures.size() + "\nrandom 100000\ndisagree " + disagree
            + (failures.isEmpty() ? "" : "\nfirst " + failures.get(0)) + "\n";
        Files.writeString(Paths.get(args[0]), report, java.nio.charset.StandardCharsets.UTF_8);
    }
}
