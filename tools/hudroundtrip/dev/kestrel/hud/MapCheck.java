package dev.kestrel.hud;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.stream.Stream;
import java.util.zip.GZIPOutputStream;

/**
 * THE WORLD MAP'S FILES, ITS BIOMES AND ITS OVERVIEW, WITH NO GAME RUNNING.
 *
 * <p>{@link MapFiles} keeps the world map between games, {@link BiomePlane}
 * is which biome each part of a tile is, and {@link Overview} is the map from
 * further up. None has any Minecraft in it, so this runs them on a bare JDK,
 * in a folder of its own that it deletes after. What a player would lose if
 * they were wrong: a tile that comes back different, a tile read while its
 * write is still waiting, the older of two saves winning, a damaged file
 * taken as a map, a tile read back as another, a map kept by the last version
 * that the new one will not read, a world or dimension name a disk will not
 * take, a biome named wrong, and an overview that blurs a cave away or wipes
 * what it knew.
 *
 * <p>Reports through a UTF-8 file, as the other checks here do.
 */
public final class MapCheck {

    static final List<String> failures = new ArrayList<>();
    static int cases = 0;

    static void check(String name, boolean ok) {
        cases++;
        if (!ok) failures.add(name);
    }

    static final int S = MapFiles.SURFACE, C = MapFiles.CAVES, SO = MapFiles.SURFACE_OVERVIEW, CO = MapFiles.CAVES_OVERVIEW;
    static final int T = 256;

    static int[] tile(Random rnd) {
        int[] t = new int[T * T];
        /* a map-like tile: runs of colour, some clear */
        int colour = 0xFF000000 | rnd.nextInt(0xFFFFFF);
        for (int i = 0; i < t.length; i++) {
            if (rnd.nextInt(40) == 0) colour = rnd.nextInt(6) == 0 ? 0 : 0xFF000000 | rnd.nextInt(0xFFFFFF);
            t[i] = colour;
        }
        return t;
    }

    static BiomePlane plane(Random rnd) {
        String[] ids = { "minecraft:plains", "minecraft:river", "minecraft:lush_caves", "example:far_lands" };
        BiomePlane p = new BiomePlane();
        for (int z = 0; z < BiomePlane.CELLS; z++) {
            for (int x = 0; x < BiomePlane.CELLS; x++) {
                if (rnd.nextInt(5) > 0) p.set(x, z, ids[(x / 9 + z / 13) % ids.length]);
            }
        }
        return p;
    }

    static boolean same(BiomePlane a, BiomePlane b) {
        for (int z = 0; z < BiomePlane.CELLS; z++) {
            for (int x = 0; x < BiomePlane.CELLS; x++) {
                String l = a.get(x, z), r = b.get(x, z);
                if (l == null ? r != null : !l.equals(r)) return false;
            }
        }
        return true;
    }

    static void settle() throws InterruptedException {
        for (int i = 0; i < 500 && !MapFiles.idle(); i++) Thread.sleep(10);
    }

    public static void main(String[] args) throws Exception {
        List<String> warnings = new ArrayList<>();
        MapFiles.warn = warnings::add;
        Path root = Files.createTempDirectory("kestrel-map-check");
        try {
            Random rnd = new Random(20260918L);
            files(root, rnd, warnings);
            biomes();
            overview();
        } finally {
            try (Stream<Path> all = Files.walk(root)) {
                all.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try {
                        Files.deleteIfExists(p);
                    } catch (IOException ignored) {
                        /* the temp folder is the system's to clear */
                    }
                });
            }
        }

        String report = "cases " + cases + "\nfailures " + failures.size()
            + (failures.isEmpty() ? "" : "\nfirst " + failures.get(0)) + "\n";
        Files.writeString(Paths.get(args[0]), report, java.nio.charset.StandardCharsets.UTF_8);
    }

    /* ── the files ───────────────────────────────────────────────────────── */

    static void files(Path root, Random rnd, List<String> warnings) throws Exception {
        /* NAMES: safe on any disk, and two that clean up alike stay two */
        String[] worlds = { "sp:New World", "sp:New_World", "mp:play.example.net:25565", "sp:CON", "sp:a/b\\c*?\"<>|", "", "sp:" + "x".repeat(300) };
        boolean safe = true;
        List<String> names = new ArrayList<>();
        for (String w : worlds) {
            String n = MapFiles.safe(w);
            names.add(n);
            if (!n.matches("[A-Za-z0-9._-]{1,48}-[0-9a-f]{8}")) safe = false;
        }
        check("every world name becomes letters, digits, dots, dashes and a checksum", safe);
        check("two names that clean up alike stay two folders", !names.get(0).equals(names.get(1)));
        check("the same name is the same folder every time", MapFiles.safe("mp:play.example.net:25565").equals(names.get(2)));

        Path folder = MapFiles.folder(root, "sp:New World", "minecraft:overworld");
        check("a place's folder is under the map folder, a world and then a dimension",
            folder.getParent().getParent().equals(root) && folder.getFileName().toString().startsWith("minecraft_overworld-"));
        check("the four layers are four folders",
            Set.of(MapFiles.layerFolder(folder, S), MapFiles.layerFolder(folder, C), MapFiles.layerFolder(folder, SO), MapFiles.layerFolder(folder, CO)).size() == 4);

        /* A TILE WRITTEN AND READ BACK, its biomes with it, negative coordinates too */
        int[] a = tile(rnd);
        BiomePlane ab = plane(rnd);
        Path fa = MapFiles.file(folder, S, -3, 7);
        MapFiles.save(fa, S, -3, 7, a.clone(), ab.copy());
        int[] early = new int[T * T];
        BiomePlane earlyBiomes = new BiomePlane();
        check("a tile read while its write is still waiting comes back as it was handed over, biomes and all",
            MapFiles.load(fa, S, -3, 7, early, earlyBiomes) && Arrays.equals(a, early) && same(ab, earlyBiomes));
        settle();
        int[] back = new int[T * T];
        BiomePlane backBiomes = new BiomePlane();
        check("a tile written to disk reads back exactly", MapFiles.load(fa, S, -3, 7, back, backBiomes) && Arrays.equals(a, back));
        check("and so do its biomes, by name", same(ab, backBiomes) && "example:far_lands".equals(firstOf(backBiomes, "example:far_lands")));
        check("as a file much smaller than the tile", Files.size(fa) < T * T * 4 / 3);
        check("a tile can be read without asking for its biomes", MapFiles.load(fa, S, -3, 7, back, null) && Arrays.equals(a, back));

        int[] cave = tile(rnd);
        Path fc = MapFiles.file(folder, C, 12, -40);
        MapFiles.save(fc, C, 12, -40, cave.clone(), new BiomePlane());
        settle();
        int[] caveBack = new int[T * T];
        check("the caves picture is its own file, and reads back exactly",
            MapFiles.load(fc, C, 12, -40, caveBack, new BiomePlane()) && Arrays.equals(cave, caveBack) && !fc.equals(MapFiles.file(folder, S, 12, -40)));

        /* an overview tile has no biomes, and is its own layer */
        int[] over = tile(rnd);
        Path fo = MapFiles.file(folder, SO, -1, 0);
        MapFiles.save(fo, SO, -1, 0, over.clone(), null);
        settle();
        int[] overBack = new int[T * T];
        BiomePlane none = plane(rnd);
        check("an overview tile reads back exactly, with no biomes", MapFiles.load(fo, SO, -1, 0, overBack, none) && Arrays.equals(over, overBack) && none.isEmpty());
        check("and is not read as the full tile of the same number", !MapFiles.load(fo, S, -1, 0, overBack, null));

        /* THE NEWER OF TWO SAVES WINS */
        int[] first = tile(rnd), second = tile(rnd);
        Path fb = MapFiles.file(folder, S, 0, 0);
        MapFiles.save(fb, S, 0, 0, first, null);
        MapFiles.save(fb, S, 0, 0, second.clone(), null);
        settle();
        int[] won = new int[T * T];
        check("two saves of one tile leave the newer on disk", MapFiles.load(fb, S, 0, 0, won, null) && Arrays.equals(second, won));

        /* A FILE IS ONLY TAKEN FOR THE TILE IT SAYS IT IS */
        int[] wrong = new int[T * T];
        check("a file is not read as a different tile", !MapFiles.load(fa, S, -3, 8, wrong, null));
        check("nor as the other picture", !MapFiles.load(fa, C, -3, 7, wrong, null));

        /* THE LAST VERSION'S FILES STILL READ: version 1 had no biomes */
        int[] old = tile(rnd);
        Path fv1 = MapFiles.file(folder, S, 20, 20);
        writeRaw(fv1, 1, S, 20, 20, old, null);
        int[] oldBack = new int[T * T];
        BiomePlane oldBiomes = plane(rnd);
        check("a map kept by the version before still reads, with no biomes yet",
            MapFiles.load(fv1, S, 20, 20, oldBack, oldBiomes) && Arrays.equals(old, oldBack) && oldBiomes.isEmpty());
        Path fv9 = MapFiles.file(folder, S, 21, 21);
        writeRaw(fv9, 9, S, 21, 21, old, null);
        check("a file from a version not written yet is left alone", !MapFiles.load(fv9, S, 21, 21, oldBack, null));
        /* the picture is good whatever became of the biomes after it */
        Path fcut = MapFiles.file(folder, S, 22, 22);
        writeRaw(fcut, 2, S, 22, 22, old, new byte[] { 0, 3, 0, 5, 'a', 'b' });
        BiomePlane cutBiomes = plane(rnd);
        check("a file whose biomes are cut short still gives its picture, and no biomes",
            MapFiles.load(fcut, S, 22, 22, oldBack, cutBiomes) && Arrays.equals(old, oldBack) && cutBiomes.isEmpty());

        /* A DAMAGED FILE IS NOT A MAP */
        Path broken = MapFiles.file(folder, S, 5, 5);
        Files.createDirectories(broken.getParent());
        Files.write(broken, new byte[] { 31, -117, 8, 0, 1, 2, 3 });
        int warned = warnings.size();
        check("a damaged file reads as no tile, without throwing", !MapFiles.load(broken, S, 5, 5, wrong, null));
        check("and says so in the log", warnings.size() > warned);
        Path truncated = MapFiles.file(folder, S, 6, 6);
        byte[] whole = Files.readAllBytes(fa);
        Files.write(truncated, Arrays.copyOf(whole, whole.length / 2));
        check("a file cut short reads as no tile", !MapFiles.load(truncated, S, 6, 6, wrong, null));
        check("and a tile with no file reads as none", !MapFiles.load(MapFiles.file(folder, S, 99, 99), S, 99, 99, wrong, null));

        /* THE INDEX: every tile file, nothing else */
        Files.writeString(MapFiles.layerFolder(folder, S).resolve("notes.txt"), "not a tile");
        Files.writeString(MapFiles.layerFolder(folder, S).resolve("1_2.kmap.tmp"), "half a write");
        Set<Long> index = MapFiles.index(MapFiles.layerFolder(folder, S));
        check("the index lists the tiles on disk, negative ones too, and nothing else",
            index.contains(MapFiles.key(-3, 7)) && index.contains(MapFiles.key(0, 0)) && index.contains(MapFiles.key(5, 5))
                && index.contains(MapFiles.key(6, 6)) && index.contains(MapFiles.key(20, 20)) && index.size() == 7);
        check("each layer has its own index", MapFiles.index(MapFiles.layerFolder(folder, SO)).equals(Set.of(MapFiles.key(-1, 0))));
        check("and a folder that is not there is an empty index", MapFiles.index(root.resolve("nowhere")).isEmpty());

        /* no temporary file is left behind a finished write */
        try (Stream<Path> all = Files.walk(root)) {
            check("no half-written file is left behind", all.noneMatch(p -> p.toString().endsWith(".kmap.tmp") && !p.getFileName().toString().equals("1_2.kmap.tmp")));
        }

        MapFiles.flush();
        /* after the writer has stopped, a save still lands: written where it is asked */
        int[] late = tile(rnd);
        Path fl = MapFiles.file(folder, S, 8, 8);
        MapFiles.save(fl, S, 8, 8, late.clone(), null);
        int[] lateBack = new int[T * T];
        check("a save as the game closes, after the writer stopped, is still written",
            Files.isRegularFile(fl) && MapFiles.load(fl, S, 8, 8, lateBack, null) && Arrays.equals(late, lateBack));
    }

    static String firstOf(BiomePlane p, String id) {
        for (int z = 0; z < BiomePlane.CELLS; z++) {
            for (int x = 0; x < BiomePlane.CELLS; x++) if (id.equals(p.get(x, z))) return p.get(x, z);
        }
        return null;
    }

    /* a file written by hand: any version, and whatever bytes after the picture */
    static void writeRaw(Path file, int version, int layer, int tx, int tz, int[] pixels, byte[] after) throws IOException {
        Files.createDirectories(file.getParent());
        byte[] raw = new byte[pixels.length * 4];
        ByteBuffer.wrap(raw).asIntBuffer().put(pixels);
        try (OutputStream zip = new GZIPOutputStream(Files.newOutputStream(file))) {
            DataOutputStream out = new DataOutputStream(zip);
            out.writeInt(0x4B4D4150);
            out.writeInt(version);
            out.writeByte(layer);
            out.writeInt(tx);
            out.writeInt(tz);
            out.write(raw);
            if (after != null) out.write(after);
            out.flush();
        }
    }

    /* ── the biomes ──────────────────────────────────────────────────────── */

    static void biomes() throws IOException {
        BiomePlane p = new BiomePlane();
        check("a biome nobody has read is not known", p.get(3, 4) == null && p.isEmpty());
        check("saying which biome a cell is changes it once", p.set(3, 4, "minecraft:plains") && !p.set(3, 4, "minecraft:plains"));
        check("and it is that biome, and its neighbour still is not", "minecraft:plains".equals(p.get(3, 4)) && p.get(4, 4) == null);
        check("a cell can become another biome", p.set(3, 4, "minecraft:river") && "minecraft:river".equals(p.get(3, 4)));
        check("nothing outside the tile is taken or given", !p.set(-1, 0, "minecraft:plains") && !p.set(0, 64, "minecraft:plains")
            && p.get(-1, 0) == null && p.get(64, 0) == null && !p.set(0, 0, null) && !p.set(0, 0, ""));

        BiomePlane copy = p.copy();
        p.set(3, 4, "minecraft:desert");
        check("a copy handed to the writer does not change with the tile", "minecraft:river".equals(copy.get(3, 4)));

        /* more biomes than a byte counts: the rest stay unknown, none is named wrong */
        BiomePlane many = new BiomePlane();
        boolean right = true;
        for (int i = 0; i < 300; i++) many.set(i % 64, i / 64, "example:biome_" + i);
        for (int i = 0; i < 300; i++) {
            String got = many.get(i % 64, i / 64);
            if (got != null && !got.equals("example:biome_" + i)) right = false;
            if (i < 255 && got == null) right = false;
        }
        check("a tile with more biomes than it can count names none of them wrong", right);

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        many.write(new DataOutputStream(bytes));
        BiomePlane read = new BiomePlane();
        check("a plane written is the plane read", read.read(new DataInputStream(new ByteArrayInputStream(bytes.toByteArray()))) && same(many, read));
        bytes.reset();
        new BiomePlane().write(new DataOutputStream(bytes));
        check("an empty one is two bytes", bytes.size() == 2);
    }

    /* ── the overview ────────────────────────────────────────────────────── */

    static void overview() {
        int[] full = new int[T * T];
        /* one four-by-four cell: half read, red and blue */
        full[0] = 0xFFFF0000;
        full[1] = 0xFF0000FF;
        check("the surface from further up is the average of what was read, and only that",
            Overview.surfaceCell(full, 0, 0) == 0xFF7F007F);
        check("a cell nobody read is nothing", Overview.surfaceCell(full, 4, 0) == 0);

        /* THE CAVES ARE NOT AVERAGED: a passage one block wide is still a passage */
        int[] caves = new int[T * T];
        int rock = CaveScan.pack(CaveScan.SOLID, 10, 0), deep = CaveScan.pack(CaveScan.OPEN, -40, 0);
        int low = CaveScan.pack(CaveScan.FLOOR, 12, 11), high = CaveScan.pack(CaveScan.FLOOR, 30, 35);
        for (int z = 0; z < 4; z++) for (int x = 0; x < 4; x++) caves[z * T + x] = rock;
        check("a cell of rock is rock", Overview.caveCell(caves, 0, 0) == rock);
        caves[2 * T + 1] = deep;
        check("open depth shows through rock", Overview.caveCell(caves, 0, 0) == deep);
        caves[3 * T + 3] = low;
        check("one block of floor in sixteen is the cell", Overview.caveCell(caves, 0, 0) == low);
        caves[0] = high;
        check("and of two floors, the higher", Overview.caveCell(caves, 0, 0) == high);
        check("a cave cell nobody read is nothing", Overview.caveCell(caves, 8, 8) == 0);

        /* A CHUNK FOLDED IN lands where it should, and says whether it changed anything */
        int[] tile = new int[T * T], over = new int[T * T];
        for (int z = 32; z < 48; z++) for (int x = 16; x < 32; x++) tile[z * T + x] = 0xFF204060;
        /* the chunk at blocks (16, 32) of the full tile that is third across and second down in its overview */
        int ox = (2 * T + 16) / Overview.STEP, oz = (1 * T + 32) / Overview.STEP;
        boolean changed = Overview.fold(tile, 16, 32, 16, over, ox, oz, false);
        boolean placed = changed;
        for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) if (over[(oz + j) * T + ox + i] != 0xFF204060) placed = false;
        int lit = 0;
        for (int v : over) if (v != 0) lit++;
        check("a chunk folds into its sixteen pixels of the overview and no others", placed && lit == 16);
        check("folding the same again changes nothing", !Overview.fold(tile, 16, 32, 16, over, ox, oz, false));

        /* A FULL TILE STARTED AGAIN DOES NOT WIPE WHAT THE OVERVIEW KNEW */
        check("a blank full tile leaves the overview as it was",
            !Overview.fold(new int[T * T], 16, 32, 16, over, ox, oz, false) && over[oz * T + ox] == 0xFF204060);

        /* a whole tile, and knowing when an overview has nothing of one */
        int[] whole = new int[T * T];
        Arrays.fill(whole, 0xFF101010);
        int[] into = new int[T * T];
        check("an overview with nothing of a tile says so", Overview.blank(into, 64, 128));
        boolean foldedWhole = Overview.fold(whole, 0, 0, T, into, 64, 128, false);
        int count = 0;
        for (int v : into) if (v != 0) count++;
        check("a whole tile folds into a sixteenth of the overview", foldedWhole && count == 64 * 64 && into[128 * T + 64] == 0xFF101010 && into[191 * T + 127] == 0xFF101010);
        check("and then it is not blank there, and still is beside it", !Overview.blank(into, 64, 128) && Overview.blank(into, 0, 128) && Overview.blank(into, 128, 128));
    }
}
