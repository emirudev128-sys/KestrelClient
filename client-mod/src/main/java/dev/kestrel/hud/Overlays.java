package dev.kestrel.hud;

import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.render.LightmapTextureManager;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.VertexFormat;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.entity.TntEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;

import java.util.Locale;

/**
 * THE FEATURES DRAWN IN THE WORLD RATHER THAN ON THE HUD.
 *
 * <p>Hitboxes, chunk borders and the TNT timer. All three live in 3D space
 * with depth, which is a different render pass from everything else in this
 * mod — the HUD draws flat rectangles in screen coordinates after the world is
 * done, and these have to go in while it is still being drawn or they would
 * float on top of terrain that should occlude them.
 *
 * <p><b>VANILLA HAS THE FIRST TWO ALREADY, ON F3+B AND F3+G.</b> That is worth
 * being honest about: the value here is not the lines, it is that they are
 * switchable from the same menu as everything else, in a colour you picked,
 * and that hitboxes can be narrowed to players — which is the only version of
 * that feature anybody actually wants, and the one vanilla does not offer.
 *
 * <p><b>DRAWN RELATIVE TO THE CAMERA, NOT TO THE WORLD ORIGIN.</b> The matrix
 * a world render event hands over is already translated so the camera sits at
 * zero; feeding it absolute block coordinates puts every line thousands of
 * blocks away, which reads as "nothing rendered" rather than as a bug. Every
 * coordinate below has the camera position subtracted for that reason.
 *
 * <p><b>NO MIXINS.</b> Fabric's own {@code WorldRenderEvents} is a supported
 * entry point into the world pass, so nothing here weaves into anybody's
 * class — the same rule the rest of the mod follows.
 */
final class Overlays {

    private Overlays() { }

    /** how far to look for entities worth outlining or timing — vanilla's own nametag distance */
    private static final double REACH = 64.0;

    /* --go, the amber both overlays were drawn in before they had a colour
       option. The declared default in mc/hud.js is the same value, so this
       only matters for a document written before `colour` existed. */
    private static final int DEFAULT_RGB = 0xE3B439;

    /* THE CHUNKS AROUND YOURS ARE THE SAME COLOUR, FAINTER. They used to be a
       dark grey — and the corners your chunk shares with them were drawn
       twice, once amber and once grey, so they flickered between the two.
       Now every corner is drawn once, and fainter only says "not yours". */
    private static final int AROUND_ALPHA = 0x73;   /* 45% */
    /* faint enough to see the world through, strong enough to see at all */
    private static final int WALL_ALPHA = 0x2E;     /* 18% */

    static void render(WorldRenderContext ctx, HudConfig config) {
        MinecraftClient c = MinecraftClient.getInstance();
        if (c == null || c.player == null || c.world == null) return;
        if (c.options != null && c.options.hudHidden) return;

        VertexConsumerProvider vcp = ctx.consumers();
        MatrixStack matrices = ctx.matrixStack();
        if (vcp == null || matrices == null || ctx.camera() == null) return;

        Vec3d cam = ctx.camera().getPos();
        float delta = ctx.tickCounter().getTickDelta(true);

        /* ONE LAYER AT A TIME. Asking the provider for a different layer
           draws whatever the last one had collected and hands its buffer on,
           so a consumer kept from before is a consumer writing into nothing.
           Each section asks for its own, right before it writes. */
        Feature hb = config.feature("hitbox");
        if (hb != null && hb.on) hitboxes(c, matrices, vcp, cam, delta, hb);

        Feature ch = config.feature("chunks");
        if (ch != null && ch.on) chunkBorders(c, matrices, vcp, cam, ch);

        Feature tnt = config.feature("tnt");
        if (tnt != null && tnt.on) tntTimers(c, ctx, matrices, vcp, cam, delta, config, tnt);

        Feature wp = config.feature("waypoints");
        if (wp != null && wp.on) waypoints(c, ctx, matrices, vcp, cam, config, wp);
    }

    /* ── waypoints ────────────────────────────────────────────────────────
       A BEAM, where the chunks are loaded: two thin see-through planes
       crossed at the spot, the whole height of the world, so it reads from
       every side and does not hide what is behind it.

       A LABEL THAT SAYS HOW FAR. A waypoint three thousand blocks away is past
       the far plane and would simply not draw, so the label is pulled in along
       the line to it — never further than LABEL_REACH — and scaled so its size
       on screen is set by distance, not by where it was drawn: full name-tag
       size close by, smaller as you go, and past DOT_BEYOND nothing but a
       small dot of its colour, which is all a far waypoint needs to say. Drawn
       through walls, because a waypoint you can only see when nothing is in
       the way is not much of one. The distance is in the waypoint's own
       colour: the grey it was disappeared against half the sky. */
    private static final double LABEL_REACH = 48.0;
    private static final double DOT_BEYOND = 250.0;

    private static void waypoints(MinecraftClient c, WorldRenderContext ctx, MatrixStack m, VertexConsumerProvider vcp,
                                  Vec3d cam, HudConfig config, Feature f) {
        java.util.List<Waypoints.Point> all = Waypoints.here(c);
        if (all.isEmpty()) return;
        String dim = Waypoints.dimension(c);

        if (f.flag("beam")) {
            double reach = (c.options.getClampedViewDistance() + 1) * 16.0;
            double y0 = c.world.getBottomY() - cam.y;
            double y1 = c.world.getBottomY() + c.world.getHeight() - cam.y;
            VertexConsumer q = vcp.getBuffer(Layers.WALLS);
            for (Waypoints.Point p : all) {
                if (!p.on || !dim.equals(p.dim)) continue;
                double bx = p.x + 0.5 - cam.x, bz = p.z + 0.5 - cam.z;
                if (bx * bx + bz * bz > reach * reach) continue;
                int argb = (0x66 << 24) | p.rgb();
                double r = 0.15;
                wall(m, q, bx - r, bz - r, bx + r, bz + r, y0, y1, argb);
                wall(m, q, bx - r, bz + r, bx + r, bz - r, y0, y1, argb);
            }
        }

        TextRenderer tr = c.textRenderer;
        HudElements.Face face = KestrelHudClient.face(config);
        int plate = ((int) (c.options.getTextBackgroundOpacity(0.25f) * 255f) << 24) | (Paint.PLATE & 0xFFFFFF);
        boolean range = f.flag("range");
        /* the far ones are dots, drawn after the labels in a layer of their own */
        java.util.List<Object[]> far = new java.util.ArrayList<>();
        for (Waypoints.Point p : all) {
            if (!p.on || !dim.equals(p.dim)) continue;
            double wx = p.x + 0.5 - cam.x, wy = p.y + 1.5 - cam.y, wz = p.z + 0.5 - cam.z;
            double dist = Math.sqrt(wx * wx + wy * wy + wz * wz);
            if (dist < 0.5) continue;
            double shown = Math.min(dist, LABEL_REACH);
            double k = shown / dist;
            double metres = c.player.getPos().distanceTo(new Vec3d(p.x + 0.5, p.y, p.z + 0.5));
            /* full size up to 16 blocks, down to 55% by 250 */
            double shrink = 1.0 - 0.45 * Math.max(0.0, Math.min(1.0, (metres - 16.0) / (DOT_BEYOND - 16.0)));
            float scale = 0.025f * (float) (Math.max(1.0, shown / 6.0) * shrink);

            m.push();
            m.translate(wx * k, wy * k, wz * k);
            m.multiply(ctx.camera().getRotation());
            m.scale(scale, -scale, scale);
            Matrix4f pose = m.peek().getPositionMatrix();
            if (metres > DOT_BEYOND) {
                /* a copy: the stack's own matrix is reused once this entry is popped */
                far.add(new Object[] { new Matrix4f(pose), p.rgb() });
            } else {
                MutableText label = face.of(p.name).copy().withColor(p.rgb());
                if (range) label.append(face.of("  " + Math.round(metres) + " m").copy().withColor(p.rgb()));
                float x = -tr.getWidth(label) / 2f;
                tr.draw(label, x, 0, 0xFFFFFFFF, false, pose, vcp, TextRenderer.TextLayerType.SEE_THROUGH, plate,
                    LightmapTextureManager.MAX_LIGHT_COORDINATE);
            }
            m.pop();
        }
        if (!far.isEmpty()) {
            VertexConsumer dots = vcp.getBuffer(Layers.MARKERS);
            for (Object[] d : far) farDot(dots, (Matrix4f) d[0], (Integer) d[1]);
        }
    }

    /* A SMALL ROUND DOT at the label's place, in label units: three across,
       with a dark rim a unit wider, sixteen slices so it is round */
    private static void farDot(VertexConsumer v, Matrix4f pose, int rgb) {
        disc(v, pose, 4.2f, 0xB00A0E13);
        disc(v, pose, 3.0f, 0xFF000000 | rgb);
    }

    private static void disc(VertexConsumer v, Matrix4f pose, float r, int argb) {
        float a = ((argb >>> 24) & 255) / 255f, red = ((argb >> 16) & 255) / 255f;
        float g = ((argb >> 8) & 255) / 255f, b = (argb & 255) / 255f;
        int n = 16;
        for (int i = 0; i < n; i++) {
            double a0 = Math.PI * 2 * i / n, a1 = Math.PI * 2 * (i + 1) / n;
            float x0 = (float) Math.cos(a0) * r, y0 = (float) Math.sin(a0) * r;
            float x1 = (float) Math.cos(a1) * r, y1 = (float) Math.sin(a1) * r;
            v.vertex(pose, 0f, 0f, 0f).color(red, g, b, a);
            v.vertex(pose, x0, y0, 0f).color(red, g, b, a);
            v.vertex(pose, x1, y1, 0f).color(red, g, b, a);
            v.vertex(pose, x1, y1, 0f).color(red, g, b, a);
        }
    }

    /* ── hitboxes ─────────────────────────────────────────────────────────
       WHERE THE ENTITY IS DRAWN, NOT WHERE IT WAS LAST TICK. The bounding box
       moves twenty times a second and the entity is drawn between those
       positions every frame; an outline that stays on the tick visibly trails
       anything running. */
    private static void hitboxes(MinecraftClient c, MatrixStack m, VertexConsumerProvider vcp,
                                 Vec3d cam, float delta, Feature f) {
        boolean playersOnly = f.flag("players");
        int argb = 0xFF000000 | f.colour("colour", DEFAULT_RGB);
        VertexConsumer v = vcp.getBuffer(Layers.lines(thickness(f)));
        for (Entity e : c.world.getEntities()) {
            if (e == c.player) continue;
            if (playersOnly && !(e instanceof PlayerEntity)) continue;
            if (e.squaredDistanceTo(c.player) > REACH * REACH) continue;
            Vec3d p = e.getLerpedPos(delta);
            Box b = e.getBoundingBox().offset(p.x - e.getX() - cam.x, p.y - e.getY() - cam.y, p.z - e.getZ() - cam.z);
            box(m, v, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, argb);
        }
    }

    /* ── chunk borders ────────────────────────────────────────────────────
       The chunk you are standing in, from the bottom of the world to the top,
       and optionally the eight around it. Bottom and height come off the world
       rather than being 0 and 256: a nether roof and a 1.18 overworld disagree
       about both, and hard-coding either draws lines through the floor. */
    private static void chunkBorders(MinecraftClient c, MatrixStack m, VertexConsumerProvider vcp,
                                     Vec3d cam, Feature f) {
        int rgb = f.colour("colour", DEFAULT_RGB);
        int cx = c.player.getBlockPos().getX() >> 4;
        int cz = c.player.getBlockPos().getZ() >> 4;
        double y0 = c.world.getBottomY() - cam.y;
        double y1 = c.world.getBottomY() + c.world.getHeight() - cam.y;
        int span = f.flag("neighbours") ? 1 : 0;

        /* THE CORNERS, EACH ONCE. Three chunks by three is four corners by
           four, not nine chunks' worth of four corners each — walking the
           chunks drew every shared corner two or four times, in two colours.
           The four vertical edges are what tell you where a chunk starts; a
           full grid is noise you cannot see past. */
        VertexConsumer v = vcp.getBuffer(Layers.lines(thickness(f)));
        for (int i = -span; i <= span + 1; i++) {
            for (int j = -span; j <= span + 1; j++) {
                boolean yours = (i == 0 || i == 1) && (j == 0 || j == 1);
                double x = ((cx + i) << 4) - cam.x;
                double z = ((cz + j) << 4) - cam.z;
                line(m, v, x, y0, z, x, y1, z, (yours ? 0xFF000000 : AROUND_ALPHA << 24) | rgb);
            }
        }

        if (f.flag("walls")) walls(m, vcp, (cx << 4) - cam.x, (cz << 4) - cam.z, y0, y1, (WALL_ALPHA << 24) | rgb);
    }

    /* ── the walls ────────────────────────────────────────────────────────
       Four see-through sides around YOUR chunk only. Walls around the eight
       neighbours as well would just be the outside of a bigger box, which is
       not what anybody turning this on is asking where the edge is of. */
    private static void walls(MatrixStack m, VertexConsumerProvider vcp,
                              double x0, double z0, double y0, double y1, int argb) {
        double x1 = x0 + 16, z1 = z0 + 16;
        VertexConsumer q = vcp.getBuffer(Layers.WALLS);
        wall(m, q, x0, z0, x1, z0, y0, y1, argb);
        wall(m, q, x1, z0, x1, z1, y0, y1, argb);
        wall(m, q, x1, z1, x0, z1, y0, y1, argb);
        wall(m, q, x0, z1, x0, z0, y0, y1, argb);
    }

    private static void wall(MatrixStack m, VertexConsumer q, double ax, double az, double bx, double bz,
                             double y0, double y1, int argb) {
        float a = ((argb >>> 24) & 255) / 255f;
        float r = ((argb >> 16) & 255) / 255f;
        float g = ((argb >> 8) & 255) / 255f;
        float b = (argb & 255) / 255f;
        var pose = m.peek();
        q.vertex(pose, (float) ax, (float) y0, (float) az).color(r, g, b, a);
        q.vertex(pose, (float) bx, (float) y0, (float) bz).color(r, g, b, a);
        q.vertex(pose, (float) bx, (float) y1, (float) bz).color(r, g, b, a);
        q.vertex(pose, (float) ax, (float) y1, (float) az).color(r, g, b, a);
    }

    /* ── the TNT timer ────────────────────────────────────────────────────
       ON THE TNT, NOT IN A CORNER. It was a HUD plate showing the nearest
       fuse, and a plate cannot say which of four blocks is the one about to
       go. So each primed TNT carries its own, where a name tag would be,
       facing you — drawn the way Minecraft draws name tags: a faint copy
       that shows through walls, and the real one on top where nothing is in
       the way.

       SMOOTH, NOT IN TENTHS OF A TICK. The fuse counts down once a tick; the
       frame in between takes off the part of a tick that has passed, so the
       number runs rather than steps. */
    private static void tntTimers(MinecraftClient c, WorldRenderContext ctx, MatrixStack m, VertexConsumerProvider vcp,
                                  Vec3d cam, float delta, HudConfig config, Feature f) {
        TextRenderer tr = c.textRenderer;
        HudElements.Face face = KestrelHudClient.face(config);
        boolean inTicks = f.flag("ticks");
        /* the HUD's plate colour at the opacity the player set for name tags */
        int plate = ((int) (c.options.getTextBackgroundOpacity(0.25f) * 255f) << 24) | (Paint.PLATE & 0xFFFFFF);
        int light = LightmapTextureManager.MAX_LIGHT_COORDINATE;
        for (Entity e : c.world.getEntities()) {
            if (!(e instanceof TntEntity tnt)) continue;
            if (e.squaredDistanceTo(c.player) > REACH * REACH) continue;
            Text label = fuse(face, Math.max(0f, tnt.getFuse() - delta), inTicks);
            Vec3d p = e.getLerpedPos(delta);
            m.push();
            m.translate(p.x - cam.x, p.y + e.getHeight() + 0.5 - cam.y, p.z - cam.z);
            m.multiply(ctx.camera().getRotation());
            m.scale(0.025f, -0.025f, 0.025f);
            Matrix4f pose = m.peek().getPositionMatrix();
            float x = -tr.getWidth(label) / 2f;
            tr.draw(label, x, 0, 0x80FFFFFF, false, pose, vcp, TextRenderer.TextLayerType.SEE_THROUGH, plate, light);
            tr.draw(label, x, 0, 0xFFFFFFFF, false, pose, vcp, TextRenderer.TextLayerType.NORMAL, 0, light);
            m.pop();
        }
    }

    /** "2.4s", or "48t" — the number in the accent, the unit in the label grey, as the HUD plate had them */
    private static Text fuse(HudElements.Face face, float ticksLeft, boolean inTicks) {
        String number = inTicks
            ? Integer.toString((int) Math.ceil(ticksLeft))
            : String.format(Locale.ROOT, "%.1f", ticksLeft / 20f);
        MutableText t = face.of(number).copy().withColor(Paint.ACCENT & 0xFFFFFF);
        return t.append(face.of(inTicks ? "t" : "s").copy().withColor(Paint.LABEL & 0xFFFFFF));
    }

    /* ── the primitives ───────────────────────────────────────────────────
       A line in this pass needs a NORMAL as well as a position, and getting it
       wrong is the classic way to draw nothing at all: the shader uses it, and
       a zero vector produces a degenerate line that is silently dropped. So
       the normal is the direction of the line itself, normalised. */
    private static void line(MatrixStack m, VertexConsumer v,
                             double x1, double y1, double z1,
                             double x2, double y2, double z2, int argb) {
        float a = ((argb >>> 24) & 255) / 255f;
        float r = ((argb >> 16) & 255) / 255f;
        float g = ((argb >> 8) & 255) / 255f;
        float b = (argb & 255) / 255f;
        double dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        double len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len == 0) return;
        float nx = (float) (dx / len), ny = (float) (dy / len), nz = (float) (dz / len);
        var pose = m.peek();
        v.vertex(pose, (float) x1, (float) y1, (float) z1).color(r, g, b, a).normal(pose, nx, ny, nz);
        v.vertex(pose, (float) x2, (float) y2, (float) z2).color(r, g, b, a).normal(pose, nx, ny, nz);
    }

    private static void box(MatrixStack m, VertexConsumer v,
                            double x1, double y1, double z1,
                            double x2, double y2, double z2, int argb) {
        line(m, v, x1, y1, z1, x2, y1, z1, argb);
        line(m, v, x2, y1, z1, x2, y1, z2, argb);
        line(m, v, x2, y1, z2, x1, y1, z2, argb);
        line(m, v, x1, y1, z2, x1, y1, z1, argb);

        line(m, v, x1, y2, z1, x2, y2, z1, argb);
        line(m, v, x2, y2, z1, x2, y2, z2, argb);
        line(m, v, x2, y2, z2, x1, y2, z2, argb);
        line(m, v, x1, y2, z2, x1, y2, z1, argb);

        line(m, v, x1, y1, z1, x1, y2, z1, argb);
        line(m, v, x2, y1, z1, x2, y2, z1, argb);
        line(m, v, x2, y1, z2, x2, y2, z2, argb);
        line(m, v, x1, y1, z2, x1, y2, z2, argb);
    }

    /** the thickness the menu set, onto the half-pixel grid and inside a
     *  range a hand-edited file cannot push past — every distinct value is a
     *  render layer kept for the session, so the set of them has to be small */
    private static float thickness(Feature f) {
        double t = f.number("thickness", DEFAULT_THICKNESS);
        t = Math.max(1.0, Math.min(10.0, t));
        return (float) (Math.round(t * 2.0) / 2.0);
    }

    /* Minecraft's own lines: 2.5 pixels on a 1920-wide window. The declared
       default in mc/hud.js is the same number. */
    private static final double DEFAULT_THICKNESS = 2.5;

    /* ── the layers ───────────────────────────────────────────────────────
       BUILT FROM MINECRAFT'S OWN RENDER PHASES, which a subclass of
       RenderLayer may use — so the blend, the depth test, the target and the
       nudge towards the camera are the game's own and not a copy of them.
       Only the one thing each layer is here for differs from vanilla's. */
    private static final class Layers extends RenderLayer {

        private Layers(String name, VertexFormat format, VertexFormat.DrawMode mode, boolean translucent,
                       Runnable begin, Runnable end) {
            super(name, format, mode, 1536, false, translucent, begin, end);
        }

        /* THE WALLS. Minecraft's translucent quad layer writes DEPTH, and
           these buffers are drawn before water and glass are: a wall that
           wrote depth would delete every lake behind it. So: that layer's
           recipe, with the depth write left out. */
        static final RenderLayer WALLS = new Layers("kestrel_hud_chunk_walls",
            VertexFormats.POSITION_COLOR, VertexFormat.DrawMode.QUADS, true, () -> {
                POSITION_COLOR_PROGRAM.startDrawing();
                TRANSLUCENT_TRANSPARENCY.startDrawing();
                LEQUAL_DEPTH_TEST.startDrawing();
                DISABLE_CULLING.startDrawing();
                COLOR_MASK.startDrawing();
                VIEW_OFFSET_Z_LAYERING.startDrawing();
            }, () -> {
                VIEW_OFFSET_Z_LAYERING.endDrawing();
                COLOR_MASK.endDrawing();
                DISABLE_CULLING.endDrawing();
                LEQUAL_DEPTH_TEST.endDrawing();
                TRANSLUCENT_TRANSPARENCY.endDrawing();
                POSITION_COLOR_PROGRAM.endDrawing();
            });

        /* A FAR WAYPOINT'S DOT: seen through everything, since a waypoint
           hidden by the hill in front of it is the one you need, and drawn
           with no culling, because a billboard flipped to face you is wound
           backwards */
        static final RenderLayer MARKERS = new Layers("kestrel_hud_waypoint_dots",
            VertexFormats.POSITION_COLOR, VertexFormat.DrawMode.QUADS, false, () -> {
                POSITION_COLOR_PROGRAM.startDrawing();
                TRANSLUCENT_TRANSPARENCY.startDrawing();
                ALWAYS_DEPTH_TEST.startDrawing();
                DISABLE_CULLING.startDrawing();
                COLOR_MASK.startDrawing();
            }, () -> {
                COLOR_MASK.endDrawing();
                DISABLE_CULLING.endDrawing();
                ALWAYS_DEPTH_TEST.endDrawing();
                TRANSLUCENT_TRANSPARENCY.endDrawing();
                POSITION_COLOR_PROGRAM.endDrawing();
            });

        private static final java.util.Map<Float, RenderLayer> BY_THICKNESS = new java.util.HashMap<>();

        /* THE LINES, AT A CHOSEN THICKNESS. Vanilla's line layer asks for
           max(2.5, window width / 1920 * 2.5) pixels — 2.5 at 1080p, scaled
           past it — and has no way to ask for anything else. This is that
           layer, phase for phase, with the 2.5 replaced by the menu's value;
           the width is worked out as it draws, so resizing the window
           rescales it the way vanilla's does. One layer per thickness,
           because a buffer collected for one width cannot be drawn at two. */
        static RenderLayer lines(float thickness) {
            return BY_THICKNESS.computeIfAbsent(thickness, t -> new Layers("kestrel_hud_lines_" + t,
                VertexFormats.LINES, VertexFormat.DrawMode.LINES, false, () -> {
                    LINES_PROGRAM.startDrawing();
                    TRANSLUCENT_TRANSPARENCY.startDrawing();
                    LEQUAL_DEPTH_TEST.startDrawing();
                    DISABLE_CULLING.startDrawing();
                    VIEW_OFFSET_Z_LAYERING.startDrawing();
                    ITEM_ENTITY_TARGET.startDrawing();
                    int fbWidth = MinecraftClient.getInstance().getWindow().getFramebufferWidth();
                    com.mojang.blaze3d.systems.RenderSystem.lineWidth(t * Math.max(1f, fbWidth / 1920f));
                }, () -> {
                    com.mojang.blaze3d.systems.RenderSystem.lineWidth(1f);
                    ITEM_ENTITY_TARGET.endDrawing();
                    VIEW_OFFSET_Z_LAYERING.endDrawing();
                    DISABLE_CULLING.endDrawing();
                    LEQUAL_DEPTH_TEST.endDrawing();
                    TRANSLUCENT_TRANSPARENCY.endDrawing();
                    LINES_PROGRAM.endDrawing();
                }));
        }
    }
}
