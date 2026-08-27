package dev.kestrel.hud;

import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;

/**
 * THE FEATURES DRAWN IN THE WORLD RATHER THAN ON THE HUD.
 *
 * <p>Hitboxes and chunk borders. Both are lines in 3D space with depth, which
 * is a different render pass from everything else in this mod — the HUD draws
 * flat rectangles in screen coordinates after the world is done, and these
 * have to go in while it is still being drawn or they would float on top of
 * terrain that should occlude them.
 *
 * <p><b>VANILLA HAS BOTH ALREADY, ON F3+B AND F3+G.</b> That is worth being
 * honest about: the value here is not the lines, it is that they are switchable
 * from the same menu as everything else, and that hitboxes can be narrowed to
 * players — which is the only version of that feature anybody actually wants,
 * and the one vanilla does not offer.
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

    /** how far to look for entities worth outlining */
    private static final double REACH = 64.0;

    static void render(WorldRenderContext ctx, HudConfig config) {
        MinecraftClient c = MinecraftClient.getInstance();
        if (c == null || c.player == null || c.world == null) return;
        if (c.options != null && c.options.hudHidden) return;

        VertexConsumerProvider vcp = ctx.consumers();
        MatrixStack matrices = ctx.matrixStack();
        if (vcp == null || matrices == null || ctx.camera() == null) return;

        Vec3d cam = ctx.camera().getPos();
        VertexConsumer lines = vcp.getBuffer(net.minecraft.client.render.RenderLayer.getLines());

        Feature hb = config.feature("hitbox");
        if (hb != null && hb.on) hitboxes(c, matrices, lines, cam, hb.flag("players"));

        Feature ch = config.feature("chunks");
        if (ch != null && ch.on) chunkBorders(c, matrices, lines, cam, ch.flag("neighbours"));
    }

    private static void hitboxes(MinecraftClient c, MatrixStack m, VertexConsumer v,
                                 Vec3d cam, boolean playersOnly) {
        for (Entity e : c.world.getEntities()) {
            if (e == c.player) continue;
            if (playersOnly && !(e instanceof PlayerEntity)) continue;
            if (e.squaredDistanceTo(c.player) > REACH * REACH) continue;
            Box b = e.getBoundingBox();
            box(m, v, b.minX - cam.x, b.minY - cam.y, b.minZ - cam.z,
                b.maxX - cam.x, b.maxY - cam.y, b.maxZ - cam.z, Paint.ACCENT);
        }
    }

    /* ── chunk borders ────────────────────────────────────────────────────
       The chunk you are standing in, from the bottom of the world to the top,
       and optionally the eight around it. Bottom and height come off the world
       rather than being 0 and 256: a nether roof and a 1.18 overworld disagree
       about both, and hard-coding either draws lines through the floor. */
    private static void chunkBorders(MinecraftClient c, MatrixStack m, VertexConsumer v,
                                     Vec3d cam, boolean neighbours) {
        int cx = c.player.getBlockPos().getX() >> 4;
        int cz = c.player.getBlockPos().getZ() >> 4;
        double y0 = c.world.getBottomY() - cam.y;
        double y1 = c.world.getBottomY() + c.world.getHeight() - cam.y;
        int span = neighbours ? 1 : 0;
        for (int dx = -span; dx <= span; dx++) {
            for (int dz = -span; dz <= span; dz++) {
                double x0 = ((cx + dx) << 4) - cam.x;
                double z0 = ((cz + dz) << 4) - cam.z;
                double x1 = x0 + 16, z1 = z0 + 16;
                boolean here = dx == 0 && dz == 0;
                int colour = here ? Paint.ACCENT : Paint.EDGE;
                /* the four vertical edges, which is what tells you where a
                   chunk starts; a full grid is noise you cannot see past */
                line(m, v, x0, y0, z0, x0, y1, z0, colour);
                line(m, v, x1, y0, z0, x1, y1, z0, colour);
                line(m, v, x0, y0, z1, x0, y1, z1, colour);
                line(m, v, x1, y0, z1, x1, y1, z1, colour);
            }
        }
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
}
