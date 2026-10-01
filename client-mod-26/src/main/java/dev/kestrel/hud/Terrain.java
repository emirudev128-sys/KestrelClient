package dev.kestrel.hud;

import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.core.Holder;
import net.minecraft.tags.FluidTags;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.chunk.LevelChunk;

import java.util.IdentityHashMap;
import java.util.Locale;

/**
 * WHAT A MAP SEES IN ONE COLUMN OF THE WORLD — for the minimap and the world map.
 *
 * <p><b>TWO WAYS TO LOOK, AND A SETTING TO CHOOSE.</b> The SURFACE is the top
 * block, coloured the way a map item colours it and lit gently from the
 * north-west. CAVES is a slice at your own height: everything over your head
 * lifted away, and in each column the floor under the first open space at or
 * below you — a little brighter where it is higher than your feet, darker
 * the deeper it lies. Solid rock is left clear, so the caves are the only
 * thing drawn and stand out against whatever is behind the map; it was a flat
 * dark shade, and the user asked for the caves to be what shows. Lava is its
 * own glowing orange and hardly dims with depth: its map colour is pure red,
 * which shaded down came out as netherrack's dark red, and the lava sea
 * melted into the ground around it. Both maps have a Depth setting: {@code auto} shows the caves
 * while you are underground and the surface otherwise, and {@code surface}
 * and {@code caves} hold one or the other. The nether has a roof over all of
 * it and no surface to show, so there it is always caves.
 *
 * <p><b>READ FROM THE CHUNK, NOT THE WORLD.</b> This is the hot loop of both
 * maps. Asking the world for each block finds the chunk again every time; a
 * {@link Reader} finds it once and reads its sections directly, and a section
 * with nothing in it is passed over sixteen blocks at a time. In the nether,
 * where every column is a long way of netherrack, air and lava, the old way
 * was what made the game stutter.
 *
 * <p><b>NEVER A HOLE.</b> A column open further down than the slice looked
 * used to come back as nothing, and the maps showed it as holes — over the
 * nether's lava sea most of all. Open space is now followed four times as
 * far, and past that drawn as depth, dark but not empty. Only a chunk that
 * is not loaded is nothing.
 *
 * <p><b>UNDERGROUND</b> means rock over your head — two solid blocks within 24
 * — for a second. It used to mean the sky's light reaching zero, which most
 * caves within reach of an opening never do, so the minimap kept showing the
 * surface in a cave. Leaves, water and glass are not rock: under a tree or out
 * at sea is not underground.
 */
final class Terrain {

    private Terrain() { }

    /** a column that was not read, and solid rock in the cave view: nothing to draw */
    static final int NOTHING = 0;
    /** open further down than the slice reads: a cave with no floor in reach, dim but there */
    static final int DEEP = 0xFF1D2229;
    /** lava, in either view: orange, as it looks, not the map item's pure red */
    static final int LAVA = 0xFFFF7B1C;

    /* how far below the slice top a cave read goes: through rock before the
       column counts as solid, and through open space before it counts as deep */
    private static final int ROCK_DEPTH = 24;
    private static final int OPEN_DEPTH = 96;

    private static final BlockState AIR_STATE = Blocks.AIR.defaultBlockState();

    /* ── WHICH WAY TO LOOK ─────────────────────────────────────────────── */

    static final String AUTO = "auto", SURFACE = "surface", CAVES = "caves";

    /** whether a map with this Depth setting shows the caves right now */
    static boolean caves(ClientLevel w, String depth) {
        if (w == null) return false;
        if (w.dimensionType().hasCeiling()) return true;
        if (CAVES.equals(depth)) return true;
        if (SURFACE.equals(depth)) return false;
        return underground;
    }

    private static boolean underground = false;
    private static int against = 0;   /* ticks the roof test has disagreed with `underground` */
    private static ClientLevel lastWorld;

    /** once a tick, before either map: are you under rock — held a second before it flips */
    static void tick(Minecraft c) {
        if (c.level == null || c.player == null) {
            underground = false;
            against = 0;
            lastWorld = null;
            BIOME_IDS.clear();
            return;
        }
        boolean now = roofOver(c.level, c.player.getBlockX(), c.player.getBlockY() + 1, c.player.getBlockZ());
        if (c.level != lastWorld) {
            /* a new world or dimension: nothing to hold on to — out of the
               nether's portal room onto open ground is the surface at once */
            lastWorld = c.level;
            underground = now;
            against = 0;
            /* and its registry's biomes are not the last world's */
            BIOME_IDS.clear();
        } else if (now == underground) {
            against = 0;
        } else if (++against >= 20) {
            underground = now;
            against = 0;
        }
    }

    static boolean underground() {
        return underground;
    }

    /* two blocks of rock over the head within 24: a house roof is one, a
       bridge is one, a cave ceiling is many */
    private static boolean roofOver(ClientLevel w, int x, int head, int z) {
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        int top = Math.min(w.getMaxY(), head + 24);
        int solid = 0;
        for (int y = head + 1; y <= top; y++) {
            if (w.getBlockState(pos.set(x, y, z)).isSolidRender() && ++solid >= 2) return true;
        }
        return false;
    }

    /* ── THE READER ────────────────────────────────────────────────────── */

    /** reads columns out of the chunks the client holds, finding each chunk once; to a cave read, the column last pointed at */
    static final class Reader implements CaveScan.Column {
        ClientLevel world;
        int bottomY;
        private int bottomSection;
        private LevelChunk chunk;
        private LevelChunkSection[] sections;
        private int chunkX = Integer.MIN_VALUE, chunkZ = Integer.MIN_VALUE;
        private int columnX, columnZ;
        final BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

        /** at the start of each batch: chunks come and go between ticks, so nothing is kept */
        Reader begin(ClientLevel w) {
            world = w;
            bottomY = w.getMinY();
            bottomSection = w.getMinSectionY();
            chunk = null;
            sections = null;
            chunkX = Integer.MIN_VALUE;
            chunkZ = Integer.MIN_VALUE;
            return this;
        }

        /** read from this chunk, for one that is on its way out and may already be off the books */
        Reader use(LevelChunk c) {
            chunk = c;
            sections = c.getSections();
            chunkX = c.getPos().x();
            chunkZ = c.getPos().z();
            return this;
        }

        /** points at the chunk holding this column; false when the client does not have it */
        boolean column(int wx, int wz) {
            int cx = wx >> 4, cz = wz >> 4;
            if (cx != chunkX || cz != chunkZ) {
                chunkX = cx;
                chunkZ = cz;
                /* only a chunk already loaded: this form never makes one */
                chunk = world.getChunkSource().getChunkNow(cx, cz);
                sections = chunk == null ? null : chunk.getSections();
            }
            columnX = wx;
            columnZ = wz;
            return chunk != null;
        }

        /* ── the column, to a cave read ── */

        @Override
        public boolean filled(int y) {
            return section(y) != null;
        }

        @Override
        public int kind(int y) {
            LevelChunkSection s = section(y);
            if (s == null) return CaveScan.Column.AIR;
            BlockState st = s.getBlockState(columnX & 15, y & 15, columnZ & 15);
            if (st.isAir()) return CaveScan.Column.AIR;
            if (!st.getFluidState().isEmpty()) return CaveScan.Column.FLUID;
            return st.getMapColor(world, pos.set(columnX, y, columnZ)) == MapColor.NONE ? CaveScan.Column.CLEAR : CaveScan.Column.SOLID;
        }

        @Override
        public int colour(int y) {
            BlockState st = state(columnX, y, columnZ);
            FluidState fluid = st.getFluidState();
            if (!fluid.isEmpty()) return fluid.is(FluidTags.LAVA) ? CaveScan.LAVA_ID : MapColor.WATER.id;
            return st.getMapColor(world, pos.set(columnX, y, columnZ)).id;
        }

        /* the section holding height y, or null when it has nothing in it */
        LevelChunkSection section(int y) {
            int i = (y >> 4) - bottomSection;
            if (i < 0 || i >= sections.length) return null;
            LevelChunkSection s = sections[i];
            return s == null || s.hasOnlyAir() ? null : s;
        }

        BlockState state(int wx, int y, int wz) {
            LevelChunkSection s = section(y);
            return s == null ? AIR_STATE : s.getBlockState(wx & 15, y & 15, wz & 15);
        }

        /* the top block's height, from the heightmap the server sent with the chunk */
        int top(int wx, int wz) {
            return chunk.getHeight(Heightmap.Types.WORLD_SURFACE, wx & 15, wz & 15);
        }

        /**
         * the biome the chunk keeps for the four-block cell holding this block, as
         * its id — "minecraft:plains"; null when the chunk is not here or has none.
         * Read from the chunk's own store, as the blocks are: the map keeps a
         * biome for each four by four columns, which is exactly how the game does.
         */
        String biome(int wx, int y, int wz) {
            if (!column(wx, wz)) return null;
            try {
                Holder<Biome> entry = chunk.getNoiseBiome(wx >> 2, y >> 2, wz >> 2);
                String id = BIOME_IDS.get(entry);
                if (id == null) {
                    id = entry.unwrapKey().map(k -> k.identifier().toString()).orElse("");
                    BIOME_IDS.put(entry, id);
                }
                return id.isEmpty() ? null : id;
            } catch (RuntimeException e) {
                return null;
            }
        }
    }

    /* a biome's id by the registry's own entry for it: asked for sixteen times
       a chunk, and an id put together from its parts each time is sixteen
       strings a chunk for the collector. Emptied when the world changes. */
    private static final IdentityHashMap<Holder<Biome>, String> BIOME_IDS = new IdentityHashMap<>();

    /* ── WHAT THE POINTER IS OVER: names, for the map's readout ─────────── */

    /** a biome's name in the game's language; one the language has no name for, from its id */
    static String biomeName(String id) {
        if (id == null || id.isEmpty()) return null;
        Identifier ident = Identifier.tryParse(id);
        if (ident == null) return id;
        String key = Util.makeDescriptionId("biome", ident);
        if (net.minecraft.locale.Language.getInstance().has(key)) return I18n.get(key);
        /* "lush_caves" reads as Lush Caves */
        StringBuilder b = new StringBuilder();
        for (String word : ident.getPath().replace('/', ' ').replace('_', ' ').trim().split(" +")) {
            if (word.isEmpty()) continue;
            if (b.length() > 0) b.append(' ');
            b.append(word.substring(0, 1).toUpperCase(Locale.ROOT)).append(word.substring(1));
        }
        return b.length() == 0 ? id : b.toString();
    }

    /** the height of the block the surface view shows in this column; MIN_VALUE when the chunk is not loaded */
    static int surfaceY(Reader r, int wx, int wz) {
        return r.column(wx, wz) ? topOf(r, wx, wz) : Integer.MIN_VALUE;
    }

    /** the name of the block at a place, in the game's language; null for air or a chunk that is not loaded */
    static String blockName(Reader r, int wx, int y, int wz) {
        if (!r.column(wx, wz)) return null;
        BlockState st = r.state(wx, y, wz);
        return st.isAir() ? null : st.getBlock().getName().getString();
    }

    /* ── THE SURFACE ───────────────────────────────────────────────────── */

    /** the height the last {@link #surface} read found, for a caller that keeps heights; MIN_VALUE for none */
    static int lastY = Integer.MIN_VALUE;

    /** one column's colour from above; `north` and `west` are those columns' heights when known, MIN_VALUE to look them up */
    static int surface(Reader r, int wx, int wz, int north, int west) {
        lastY = Integer.MIN_VALUE;
        if (!r.column(wx, wz)) return NOTHING;
        int top = topOf(r, wx, wz);
        if (top == Integer.MIN_VALUE) return NOTHING;
        lastY = top;
        BlockState state = r.state(wx, top, wz);
        MapColor colour = state.getMapColor(r.world, r.pos.set(wx, top, wz));
        if (colour == MapColor.NONE) return NOTHING;
        /* lava glows, and is flat: its own colour, unshaded */
        if (state.getFluidState().is(FluidTags.LAVA)) return LAVA;
        int base = colour.calculateARGBColor(MapColor.Brightness.HIGH);

        double light;
        if (state.getFluidState().is(FluidTags.WATER)) {
            int depth = 0;
            while (depth < 10 && r.state(wx, top - depth - 1, wz).getFluidState().is(FluidTags.WATER)) depth++;
            light = 0.98 - depth * 0.025;
        } else {
            /* last, because a neighbour in the next chunk is looked up through the world */
            if (north == Integer.MIN_VALUE) north = heightAt(r.world, wx, wz - 1);
            if (west == Integer.MIN_VALUE) west = heightAt(r.world, wx - 1, wz);
            double slope = (north == Integer.MIN_VALUE ? 0 : top - north) * 0.035
                + (west == Integer.MIN_VALUE ? 0 : top - west) * 0.02;
            light = 0.95 + Math.max(-0.09, Math.min(0.06, slope));
        }
        return CaveScan.shade(base, light);
    }

    /* the top block, looking through what a map sees through — glass, a
       torch — a little way */
    private static int topOf(Reader r, int wx, int wz) {
        int top = r.top(wx, wz);
        if (top < r.bottomY) return Integer.MIN_VALUE;
        for (int y = top; y > Math.max(r.bottomY, top - 8); y--) {
            if (r.state(wx, y, wz).getMapColor(r.world, r.pos.set(wx, y, wz)) != MapColor.NONE) return y;
        }
        return top;
    }

    private static int heightAt(ClientLevel w, int wx, int wz) {
        if (!w.getChunkSource().hasChunk(wx >> 4, wz >> 4)) return Integer.MIN_VALUE;
        return w.getHeight(Heightmap.Types.WORLD_SURFACE, wx, wz) - 1;
    }

    /* ── THE CAVES ─────────────────────────────────────────────────────────
       The reading itself is CaveScan's, which has no Minecraft in it so it
       can be checked against made-up columns; this points it at the world. */

    /**
     * one column of the cave view for a player whose feet are at `feetY`,
     * packed as {@link CaveScan} packs it: down from one block over the head,
     * through rock to the first open space, and on to the floor under it.
     */
    static int cave(Reader r, int wx, int wz, int feetY) {
        if (!r.column(wx, wz)) return 0;
        int from = feetY + 2;
        return CaveScan.scan(r, from, Math.max(r.bottomY, from - OPEN_DEPTH), from - ROCK_DEPTH);
    }

    /**
     * a cave reading as a colour, lit for someone whose feet are at `feetY`.
     * Rock is clear — the caves are what the map is for. Lava keeps nearly
     * all its glow however deep it lies, so a lava sea never sinks into the
     * dark red of the netherrack round it.
     */
    static int caveColour(int packed, int feetY) {
        if (packed == 0) return NOTHING;
        int kind = CaveScan.kindOf(packed);
        if (kind == CaveScan.SOLID) return NOTHING;
        if (kind == CaveScan.OPEN) return DEEP;
        int below = feetY - 1 - CaveScan.heightOf(packed);
        int id = CaveScan.colourOf(packed);
        if (id == CaveScan.LAVA_ID) return CaveScan.shade(LAVA, 0.8 + 0.2 * CaveScan.light(below));
        int base = baseColour(id);
        return base == 0 ? NOTHING : CaveScan.shade(base, CaveScan.light(below));
    }

    private static final int[] BASE = new int[256];

    private static int baseColour(int id) {
        int c = BASE[id];
        if (c != 0) return c;
        MapColor m = id < 64 ? MapColor.byId(id) : null;
        c = m == null ? 0 : m.calculateARGBColor(MapColor.Brightness.HIGH);
        BASE[id] = c;
        return c;
    }
}
