package dev.kestrel.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;
import net.minecraft.util.math.Vec3d;

import java.util.Arrays;

/**
 * THE MINIMAP.
 *
 * <p><b>THE WORLD AS A MAP ITEM WOULD COLOUR IT</b>, or the caves at your
 * height — {@link Terrain} reads both, and the element's Depth option picks:
 * {@code auto} (the caves while you are underground), {@code surface} or
 * {@code caves}. The nether has no surface, so there it is always caves.
 *
 * <p><b>ONE TEXTURE, KEPT IN STEP RATHER THAN REDRAWN.</b> A 256×256 image,
 * one pixel a block, centred on the block you stand on. Step a block and the
 * image and its heights move a pixel in memory and only the newly exposed edge
 * is read. The rest is read again continually, in squares nearest the middle
 * first, for as long as a millisecond a tick allows — so a change of view, or
 * of height underground, shows first where you are looking, and a slow patch
 * of world costs time rather than frames. The image goes to the GPU only on a
 * tick when a pixel changed.
 *
 * <p><b>SMOOTH, NOT A BLOCK AT A TIME.</b> The image moves by whole blocks and
 * the drawing makes up the fraction; everything on the map is placed the same
 * way, to a fraction of a pixel, so nothing steps against it while you walk.
 */
final class Minimap {

    private Minimap() { }

    static final int SIZE = 64;              /* the element, in unscaled GUI pixels */
    static final int T = 256;                /* the texture, in blocks */
    private static final int SQUARE = 16;    /* read again in squares this big */
    /* how long a tick may spend reading the image again; the edge a step
       uncovers is read at once, outside this */
    private static final long BUDGET_NS = 1_000_000L;
    private static final Identifier ID = Identifier.of(KestrelHudClient.MOD_ID, "minimap");

    /* the zoom option's values, nearest last: pixels per block */
    static final String[] ZOOM_NAMES = { "far", "normal", "near", "close" };
    static final float[] ZOOM_SCALES = { 0.5f, 1f, 2f, 4f };

    private static final int[] pixels = new int[T * T];
    private static final int[] heights = new int[T * T];
    private static NativeImageBackedTexture texture;
    private static int originX = Integer.MIN_VALUE, originZ;   /* the world block at pixel 0,0 */
    private static String dimension = "";
    private static boolean dirty = false;

    /* the caves or the surface, and the height the caves are being read for */
    private static boolean cave = false;
    private static int caveFeet = Integer.MIN_VALUE;

    /* the squares of the image, nearest the middle first, and the next to read */
    private static final int[] ORDER = order();
    private static int next = 0;

    private static final Terrain.Reader READER = new Terrain.Reader();

    private static int[] order() {
        int n = T / SQUARE;
        Integer[] squares = new Integer[n * n];
        for (int i = 0; i < squares.length; i++) squares[i] = i;
        double mid = n / 2.0;
        Arrays.sort(squares, (a, b) -> Double.compare(far(a % n, a / n, mid), far(b % n, b / n, mid)));
        int[] out = new int[squares.length];
        for (int i = 0; i < out.length; i++) out[i] = squares[i];
        return out;
    }

    private static double far(int sx, int sy, double mid) {
        double dx = sx + 0.5 - mid, dy = sy + 0.5 - mid;
        return dx * dx + dy * dy;
    }

    /* ── keeping it in step: every tick, while the element is on ────────── */

    static void tick(MinecraftClient c, HudConfig config) {
        HudConfig.Element el = config.get("minimap");
        if (el == null || !el.on || c.world == null || c.player == null) return;
        ensureTexture(c);

        ClientWorld w = c.world;
        Terrain.Reader r = READER.begin(w);
        int px = c.player.getBlockX(), pz = c.player.getBlockZ(), feet = c.player.getBlockY();
        String dim = w.getRegistryKey().getValue().toString();
        int wantX = px - T / 2, wantZ = pz - T / 2;
        boolean wantCave = Terrain.caves(w, el.choice("depth", Terrain.AUTO));

        if (originX == Integer.MIN_VALUE || !dim.equals(dimension)
                || Math.abs(wantX - originX) >= T / 2 || Math.abs(wantZ - originZ) >= T / 2) {
            /* a new world or dimension, or a teleport: nothing in the old
               image is here any more */
            Arrays.fill(pixels, 0);
            Arrays.fill(heights, Integer.MIN_VALUE);
            dirty = true;
            originX = wantX;
            originZ = wantZ;
            dimension = dim;
            cave = wantCave;
            caveFeet = feet;
            next = 0;
        } else {
            if (wantX != originX || wantZ != originZ) {
                int dx = wantX - originX, dz = wantZ - originZ;
                shift(dx, dz);
                originX = wantX;
                originZ = wantZ;
                /* the edge the step uncovered, now: it must never be empty */
                if (dz > 0) paintRows(r, T - dz, dz);
                if (dz < 0) paintRows(r, 0, -dz);
                if (dx > 0) paintColumns(r, T - dx, dx);
                if (dx < 0) paintColumns(r, 0, -dx);
            }
            /* A NEW WAY OF LOOKING, OR A NEW HEIGHT TO LOOK FROM. The image is
               kept — there is nothing better to show meanwhile — and read
               again from the middle out, so where you are changes first. A
               jump is not a new height; two blocks is. */
            if (wantCave != cave || (cave && Math.abs(feet - caveFeet) >= 2)) {
                if (wantCave != cave) Arrays.fill(heights, Integer.MIN_VALUE);
                cave = wantCave;
                caveFeet = feet;
                next = 0;
            }
        }

        long deadline = System.nanoTime() + BUDGET_NS;
        int n = T / SQUARE;
        for (int k = 0; k < ORDER.length && System.nanoTime() < deadline; k++) {
            int sq = ORDER[next];
            next = (next + 1) % ORDER.length;
            int x0 = (sq % n) * SQUARE, y0 = (sq / n) * SQUARE;
            for (int y = y0; y < y0 + SQUARE; y++) {
                for (int x = x0; x < x0 + SQUARE; x++) paint(r, x, y);
            }
        }

        if (dirty) upload();
    }

    private static void ensureTexture(MinecraftClient c) {
        if (texture != null) return;
        texture = new NativeImageBackedTexture(T, T, true);
        texture.setFilter(false, false);
        c.getTextureManager().registerTexture(ID, texture);
    }

    /* MOVING THE IMAGE THE OTHER WAY FROM THE PLAYER: stepping east by one
       moves every pixel one to the left, and the right-hand column is new.
       In place — this happens on every step, and half a megabyte of fresh
       arrays a step was garbage the game then had to collect. */
    private static void shift(int dx, int dz) {
        shiftArray(pixels, dx, dz, 0);
        shiftArray(heights, dx, dz, Integer.MIN_VALUE);
        dirty = true;
    }

    private static void shiftArray(int[] a, int dx, int dz, int fill) {
        if (Math.abs(dx) >= T || Math.abs(dz) >= T) {
            Arrays.fill(a, fill);
            return;
        }
        if (dz > 0) {
            System.arraycopy(a, dz * T, a, 0, (T - dz) * T);
            Arrays.fill(a, (T - dz) * T, T * T, fill);
        } else if (dz < 0) {
            System.arraycopy(a, 0, a, -dz * T, (T + dz) * T);
            Arrays.fill(a, 0, -dz * T, fill);
        }
        if (dx > 0) {
            for (int y = 0; y < T; y++) {
                int row = y * T;
                System.arraycopy(a, row + dx, a, row, T - dx);
                Arrays.fill(a, row + T - dx, row + T, fill);
            }
        } else if (dx < 0) {
            for (int y = 0; y < T; y++) {
                int row = y * T;
                System.arraycopy(a, row, a, row - dx, T + dx);
                Arrays.fill(a, row, row - dx, fill);
            }
        }
    }

    private static void paintRows(Terrain.Reader r, int from, int count) {
        for (int y = Math.max(0, from); y < Math.min(T, from + count); y++) {
            for (int x = 0; x < T; x++) paint(r, x, y);
        }
    }

    private static void paintColumns(Terrain.Reader r, int from, int count) {
        for (int x = Math.max(0, from); x < Math.min(T, from + count); x++) {
            for (int y = 0; y < T; y++) paint(r, x, y);
        }
    }

    private static void paint(Terrain.Reader r, int x, int y) {
        int wx = originX + x, wz = originZ + y;
        int i = y * T + x;
        int argb;
        if (cave) {
            argb = Terrain.caveColour(Terrain.cave(r, wx, wz, caveFeet), caveFeet);
        } else {
            /* the neighbours' heights when they are known — for most of the
               image, the row above and the column to the left were read first */
            int north = y > 0 ? heights[i - T] : Integer.MIN_VALUE;
            int west = x > 0 ? heights[i - 1] : Integer.MIN_VALUE;
            argb = Terrain.surface(r, wx, wz, north, west);
            heights[i] = Terrain.lastY;
        }
        if (pixels[i] != argb) {
            pixels[i] = argb;
            dirty = true;
        }
    }

    private static void upload() {
        NativeImage image = texture.getImage();
        if (image == null) return;
        for (int y = 0; y < T; y++) {
            for (int x = 0; x < T; x++) image.setColorArgb(x, y, pixels[y * T + x]);
        }
        texture.upload();
        dirty = false;
    }

    /* ── zoom, from the keys ──────────────────────────────────────────── */

    static float scaleOf(HudConfig.Element el) {
        String name = el.choice("zoom", "normal");
        for (int i = 0; i < ZOOM_NAMES.length; i++) if (ZOOM_NAMES[i].equals(name)) return ZOOM_SCALES[i];
        return 1f;
    }

    /** one step nearer (+1) or further (-1); the new zoom's name, or null when it could not move */
    static String step(HudConfig config, int by) {
        HudConfig.Element el = config.get("minimap");
        if (el == null) return null;
        String now = el.choice("zoom", "normal");
        int i = 1;
        for (int k = 0; k < ZOOM_NAMES.length; k++) if (ZOOM_NAMES[k].equals(now)) i = k;
        int next = Math.max(0, Math.min(ZOOM_NAMES.length - 1, i + by));
        if (next == i) return null;
        config.put("minimap", el.withOpt("zoom", '"' + ZOOM_NAMES[next] + '"'));
        return ZOOM_NAMES[next];
    }

    /* ── drawing it, as a run inside an element's plate ─────────────────── */

    static void draw(DrawContext ctx, int x, int y, HudConfig.Element el, HudConfig.Style st) {
        MinecraftClient c = MinecraftClient.getInstance();
        if (texture == null || c.player == null || originX == Integer.MIN_VALUE) return;

        float zoom = scaleOf(el);
        boolean rotate = el.flag("rotate");
        float delta = c.getRenderTickCounter().getTickDelta(true);
        double px = MathHelper.lerp(delta, c.player.prevX, c.player.getX());
        double pz = MathHelper.lerp(delta, c.player.prevZ, c.player.getZ());
        float yaw = c.player.getYaw(delta);
        float turn = rotate ? 180f - yaw : 0f;
        float half = SIZE / 2f, mx = x + half, my = y + half;

        ctx.enableScissor(x, y, x + SIZE, y + SIZE);
        var m = ctx.getMatrices();
        m.push();
        m.translate(mx, my, 0f);
        m.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(turn));
        m.scale(zoom, zoom, 1f);
        m.translate((float) -(px - originX), (float) -(pz - originZ), 0f);
        ctx.drawTexture(RenderLayer::getGuiTextured, ID, 0, 0, 0f, 0f, T, T, T, T);
        m.pop();

        /* WHAT IS ON THE MAP, placed in screen space after the turn, so
           anything beyond the edge can sit exactly on it */
        double turnRad = Math.toRadians(turn);
        float cos = (float) Math.cos(turnRad), sin = (float) Math.sin(turnRad);
        if (el.flag("others") && c.world != null) {
            for (PlayerEntity other : c.world.getPlayers()) {
                if (other == c.player) continue;
                Vec3d o = other.getLerpedPos(delta);
                marker(ctx, mx, my, (float) (o.x - px), (float) (o.z - pz), zoom, cos, sin, 0xFFF1F4F7);
            }
        }
        if (el.flag("waypoints")) {
            String dim = c.world == null ? "" : c.world.getRegistryKey().getValue().toString();
            for (Waypoints.Point p : Waypoints.here(c)) {
                if (!p.on || !dim.equals(p.dim)) continue;
                marker(ctx, mx, my, (float) (p.x + 0.5 - px), (float) (p.z + 0.5 - pz), zoom, cos, sin, 0xFF000000 | p.rgb());
            }
        }
        ctx.disableScissor();

        /* you: a small smooth arrow, the way you face */
        /* sized with the zoom, within reason: smaller when the map shows
           more ground, a little bigger up close */
        float arrowSize = 3.2f * Math.max(0.6f, Math.min(1.35f, (float) Math.sqrt(zoom)));
        Shapes.arrow(ctx, mx, my, arrowSize, rotate ? 0f : yaw - 180f, 0xFFE3B439, 0xB00A0E13);

        /* north, just inside the edge, when the map turns */
        if (rotate) {
            float r = half - 6f;
            float nx = mx + sin * r, ny = my - cos * r;
            m.push();
            m.translate(nx, ny, 0f);
            m.scale(0.75f, 0.75f, 1f);
            int w = c.textRenderer.getWidth("N");
            ctx.drawText(c.textRenderer, "N", -w / 2, -4, st.textArgb(), false);
            m.pop();
        }
    }

    /* A DOT FOR SOMETHING ON THE MAP — and for something past the edge, a
       smaller one ON the edge, along the line towards it, so you know which
       way to go without it looking like it is somewhere it is not */
    private static void marker(DrawContext ctx, float mx, float my, float dx, float dz, float zoom,
                               float cos, float sin, int argb) {
        float sx = (dx * cos - dz * sin) * zoom, sy = (dx * sin + dz * cos) * zoom;
        float limit = SIZE / 2f - 3f;
        boolean off = Math.abs(sx) > limit || Math.abs(sy) > limit;
        if (off) {
            float k = Math.min(limit / Math.max(1e-3f, Math.abs(sx)), limit / Math.max(1e-3f, Math.abs(sy)));
            sx *= k;
            sy *= k;
        }
        Shapes.dot(ctx, mx + sx, my + sy, off ? 1.3f : 1.9f, argb, 0xB00A0E13);
    }

    /** the id of the shared texture */
    static Identifier textureId() { return ID; }
}
