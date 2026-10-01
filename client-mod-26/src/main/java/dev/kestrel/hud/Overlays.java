package dev.kestrel.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.gizmos.DrawableGizmoPrimitives;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.util.LightCoordsUtil;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.PrimedTnt;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * THE FEATURES DRAWN IN THE WORLD RATHER THAN ON THE HUD.
 *
 * <p>Hitboxes, chunk borders, waypoints and the TNT timer. All of them live
 * in 3D space with depth, which is a different pass from everything else in
 * this mod — the HUD draws flat rectangles in screen coordinates after the
 * world is done, and these have to go in with the world or they would float
 * on top of terrain that should hide them.
 *
 * <p><b>VANILLA HAS THE FIRST TWO ALREADY, ON F3+B AND F3+G.</b> That is worth
 * being honest about: the value here is not the lines, it is that they are
 * switchable from the same menu as everything else, in a colour you picked,
 * and that hitboxes can be narrowed to players — which is the only version of
 * that feature anybody actually wants, and the one vanilla does not offer.
 *
 * <p><b>26.3: HANDED TO THE WORLD'S OWN SUBMIT LIST.</b> The world is no
 * longer drawn as it is walked: everything that will be drawn is collected
 * first, sorted into its passes and drawn after. So each overlay is submitted
 * there, in one of the game's own render types — its lines, its see-through
 * debug quads, its name-tag text — and the game draws it in the right pass,
 * at the right depth. Lines carry their own width now, so the thickness
 * option needs no render type of its own.
 *
 * <p><b>DRAWN RELATIVE TO THE CAMERA, NOT TO THE WORLD ORIGIN.</b> Absolute
 * block coordinates would put every line thousands of blocks away, which
 * reads as "nothing rendered" rather than as a bug, so every coordinate below
 * has the camera position subtracted.
 *
 * <p><b>NO MIXINS.</b> Fabric's own {@code LevelRenderEvents} is a supported
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

    /* THE CHUNKS AROUND YOURS ARE THE SAME COLOUR, FAINTER. Every corner is
       drawn once, and fainter only says "not yours". */
    private static final int AROUND_ALPHA = 0x73;   /* 45% */
    /* faint enough to see the world through, strong enough to see at all */
    private static final int WALL_ALPHA = 0x2E;     /* 18% */

    static void render(LevelRenderContext ctx, HudConfig config) {
        Minecraft c = Minecraft.getInstance();
        if (c == null || c.player == null || c.level == null) return;
        if (c.gui.hud.isHidden()) return;

        SubmitNodeCollector out = ctx.submitNodeCollector();
        PoseStack m = ctx.poseStack();
        CameraRenderState camera = ctx.levelState() == null ? null : ctx.levelState().cameraRenderState;
        if (out == null || m == null || camera == null || camera.pos == null) return;

        Vec3 cam = camera.pos;
        float delta = c.getDeltaTracker().getGameTimeDeltaPartialTick(true);

        Feature hb = config.feature("hitbox");
        if (hb != null && hb.on) hitboxes(c, out, m, cam, delta, hb);

        Feature ch = config.feature("chunks");
        if (ch != null && ch.on) chunkBorders(c, out, m, cam, ch);

        Feature tnt = config.feature("tnt");
        if (tnt != null && tnt.on) tntTimers(c, out, m, camera, delta, config, tnt);

        Feature wp = config.feature("waypoints");
        if (wp != null && wp.on) waypoints(c, out, m, camera, config, wp);
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

    private static void waypoints(Minecraft c, SubmitNodeCollector out, PoseStack m, CameraRenderState camera,
                                  HudConfig config, Feature f) {
        List<Waypoints.Point> all = Waypoints.here(c);
        if (all.isEmpty()) return;
        String dim = Waypoints.dimension(c);
        Vec3 cam = camera.pos;

        if (f.flag("beam")) {
            double reach = (c.options.getEffectiveRenderDistance() + 1) * 16.0;
            double y0 = c.level.getMinY() - cam.y;
            double y1 = c.level.getMinY() + c.level.getHeight() - cam.y;
            List<double[]> beams = new ArrayList<>();
            for (Waypoints.Point p : all) {
                if (!p.on || !dim.equals(p.dim)) continue;
                double bx = p.x + 0.5 - cam.x, bz = p.z + 0.5 - cam.z;
                if (bx * bx + bz * bz > reach * reach) continue;
                beams.add(new double[] { bx, bz, (0x66 << 24) | p.rgb() });
            }
            if (!beams.isEmpty()) {
                out.submitCustomGeometry(m, RenderTypes.debugQuads(), (pose, q) -> {
                    double r = 0.15;
                    for (double[] b : beams) {
                        int argb = (int) b[2];
                        wall(pose, q, b[0] - r, b[1] - r, b[0] + r, b[1] + r, y0, y1, argb);
                        wall(pose, q, b[0] - r, b[1] + r, b[0] + r, b[1] - r, y0, y1, argb);
                    }
                });
            }
        }

        Font tr = c.font;
        HudElements.Face face = KestrelHudClient.face(config);
        int plate = ((int) (c.options.getBackgroundOpacity(0.25f) * 255f) << 24) | (Paint.PLATE & 0xFFFFFF);
        boolean range = f.flag("range");
        /* the far ones are dots, drawn through everything in a batch of their own */
        DrawableGizmoPrimitives dots = new DrawableGizmoPrimitives();
        Quaternionf facing = camera.orientation;
        Vector3f right = facing.transform(new Vector3f(1f, 0f, 0f));
        Vector3f up = facing.transform(new Vector3f(0f, 1f, 0f));
        for (Waypoints.Point p : all) {
            if (!p.on || !dim.equals(p.dim)) continue;
            double wx = p.x + 0.5 - cam.x, wy = p.y + 1.5 - cam.y, wz = p.z + 0.5 - cam.z;
            double dist = Math.sqrt(wx * wx + wy * wy + wz * wz);
            if (dist < 0.5) continue;
            double shown = Math.min(dist, LABEL_REACH);
            double k = shown / dist;
            double metres = c.player.position().distanceTo(new Vec3(p.x + 0.5, p.y, p.z + 0.5));
            /* full size up to 16 blocks, down to 55% by 250 */
            double shrink = 1.0 - 0.45 * Math.max(0.0, Math.min(1.0, (metres - 16.0) / (DOT_BEYOND - 16.0)));
            float scale = 0.025f * (float) (Math.max(1.0, shown / 6.0) * shrink);

            if (metres > DOT_BEYOND) {
                /* in world units, at the label's place: a label unit is `scale` */
                Vec3 at = new Vec3(cam.x + wx * k, cam.y + wy * k, cam.z + wz * k);
                disc(dots, at, right, up, 4.2f * scale, 0xB00A0E13);
                disc(dots, at, right, up, 3.0f * scale, 0xFF000000 | p.rgb());
                continue;
            }
            MutableComponent label = face.of(p.name).copy().withColor(p.rgb());
            if (range) label.append(face.of("  " + Math.round(metres) + " m").copy().withColor(p.rgb()));
            m.pushPose();
            m.translate(wx * k, wy * k, wz * k);
            m.rotate(facing);
            m.scale(scale, -scale, scale);
            float x = -tr.width(label) / 2f;
            out.submitText(m, x, 0f, label.getVisualOrderText(), false, Font.DisplayMode.SEE_THROUGH,
                LightCoordsUtil.FULL_BRIGHT, 0xFFFFFFFF, plate, 0);
            m.popPose();
        }
        if (!dots.isEmpty()) dots.submit(out, camera, true);
    }

    /* A SMALL ROUND DOT, facing the camera: sixteen slices so it is round */
    private static void disc(DrawableGizmoPrimitives into, Vec3 at, Vector3f right, Vector3f up, float r, int argb) {
        int n = 16;
        Vec3[] fan = new Vec3[n + 2];
        fan[0] = at;
        for (int i = 0; i <= n; i++) {
            double a = Math.PI * 2 * i / n;
            double cx = Math.cos(a) * r, cy = Math.sin(a) * r;
            fan[i + 1] = at.add(right.x * cx + up.x * cy, right.y * cx + up.y * cy, right.z * cx + up.z * cy);
        }
        into.addTriangleFan(fan, argb);
    }

    /* ── hitboxes ─────────────────────────────────────────────────────────
       WHERE THE ENTITY IS DRAWN, NOT WHERE IT WAS LAST TICK. The bounding box
       moves twenty times a second and the entity is drawn between those
       positions every frame; an outline that stays on the tick visibly trails
       anything running. */
    private static void hitboxes(Minecraft c, SubmitNodeCollector out, PoseStack m,
                                 Vec3 cam, float delta, Feature f) {
        boolean playersOnly = f.flag("players");
        int argb = 0xFF000000 | f.colour("colour", DEFAULT_RGB);
        List<AABB> boxes = new ArrayList<>();
        for (Entity e : c.level.entitiesForRendering()) {
            if (e == c.player) continue;
            if (playersOnly && !(e instanceof Player)) continue;
            if (e.distanceToSqr(c.player) > REACH * REACH) continue;
            Vec3 p = e.getPosition(delta);
            boxes.add(e.getBoundingBox().move(p.x - e.getX() - cam.x, p.y - e.getY() - cam.y, p.z - e.getZ() - cam.z));
        }
        if (boxes.isEmpty()) return;
        float width = lineWidth(c, f);
        out.submitCustomGeometry(m, RenderTypes.linesTranslucent(), (pose, v) -> {
            for (AABB b : boxes) box(pose, v, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, argb, width);
        });
    }

    /* ── chunk borders ────────────────────────────────────────────────────
       The chunk you are standing in, from the bottom of the world to the top,
       and optionally the eight around it. Bottom and height come off the world
       rather than being 0 and 256: a nether roof and a 1.18 overworld disagree
       about both, and hard-coding either draws lines through the floor. */
    private static void chunkBorders(Minecraft c, SubmitNodeCollector out, PoseStack m, Vec3 cam, Feature f) {
        int rgb = f.colour("colour", DEFAULT_RGB);
        int cx = c.player.blockPosition().getX() >> 4;
        int cz = c.player.blockPosition().getZ() >> 4;
        double y0 = c.level.getMinY() - cam.y;
        double y1 = c.level.getMinY() + c.level.getHeight() - cam.y;
        int span = f.flag("neighbours") ? 1 : 0;
        float width = lineWidth(c, f);

        /* THE CORNERS, EACH ONCE. Three chunks by three is four corners by
           four, not nine chunks' worth of four corners each. The four
           vertical edges are what tell you where a chunk starts; a full grid
           is noise you cannot see past. */
        out.submitCustomGeometry(m, RenderTypes.linesTranslucent(), (pose, v) -> {
            for (int i = -span; i <= span + 1; i++) {
                for (int j = -span; j <= span + 1; j++) {
                    boolean yours = (i == 0 || i == 1) && (j == 0 || j == 1);
                    double x = ((cx + i) << 4) - cam.x;
                    double z = ((cz + j) << 4) - cam.z;
                    line(pose, v, x, y0, z, x, y1, z, (yours ? 0xFF000000 : AROUND_ALPHA << 24) | rgb, width);
                }
            }
        });

        if (f.flag("walls")) {
            double x0 = (cx << 4) - cam.x, z0 = (cz << 4) - cam.z;
            int argb = (WALL_ALPHA << 24) | rgb;
            out.submitCustomGeometry(m, RenderTypes.debugQuads(), (pose, q) -> walls(pose, q, x0, z0, y0, y1, argb));
        }
    }

    /* ── the walls ────────────────────────────────────────────────────────
       Four see-through sides around YOUR chunk only. Walls around the eight
       neighbours as well would just be the outside of a bigger box, which is
       not what anybody turning this on is asking where the edge is of. The
       game's debug quads are depth-tested and write no depth, so a lake
       behind a wall still draws. */
    private static void walls(PoseStack.Pose pose, VertexConsumer q,
                              double x0, double z0, double y0, double y1, int argb) {
        double x1 = x0 + 16, z1 = z0 + 16;
        wall(pose, q, x0, z0, x1, z0, y0, y1, argb);
        wall(pose, q, x1, z0, x1, z1, y0, y1, argb);
        wall(pose, q, x1, z1, x0, z1, y0, y1, argb);
        wall(pose, q, x0, z1, x0, z0, y0, y1, argb);
    }

    private static void wall(PoseStack.Pose pose, VertexConsumer q, double ax, double az, double bx, double bz,
                             double y0, double y1, int argb) {
        q.addVertex(pose, (float) ax, (float) y0, (float) az).setColor(argb);
        q.addVertex(pose, (float) bx, (float) y0, (float) bz).setColor(argb);
        q.addVertex(pose, (float) bx, (float) y1, (float) bz).setColor(argb);
        q.addVertex(pose, (float) ax, (float) y1, (float) az).setColor(argb);
    }

    /* ── the TNT timer ────────────────────────────────────────────────────
       ON THE TNT, NOT IN A CORNER. Each primed TNT carries its own, where a
       name tag would be, facing you — drawn the way Minecraft draws name
       tags: a faint copy that shows through walls, and the real one on top
       where nothing is in the way.

       SMOOTH, NOT IN TENTHS OF A TICK. The fuse counts down once a tick; the
       frame in between takes off the part of a tick that has passed, so the
       number runs rather than steps. */
    private static void tntTimers(Minecraft c, SubmitNodeCollector out, PoseStack m, CameraRenderState camera,
                                  float delta, HudConfig config, Feature f) {
        Font tr = c.font;
        HudElements.Face face = KestrelHudClient.face(config);
        boolean inTicks = f.flag("ticks");
        Vec3 cam = camera.pos;
        /* the HUD's plate colour at the opacity the player set for name tags */
        int plate = ((int) (c.options.getBackgroundOpacity(0.25f) * 255f) << 24) | (Paint.PLATE & 0xFFFFFF);
        int light = LightCoordsUtil.FULL_BRIGHT;
        for (Entity e : c.level.entitiesForRendering()) {
            if (!(e instanceof PrimedTnt tnt)) continue;
            if (e.distanceToSqr(c.player) > REACH * REACH) continue;
            Component label = fuse(face, Math.max(0f, tnt.getFuse() - delta), inTicks);
            Vec3 p = e.getPosition(delta);
            m.pushPose();
            m.translate(p.x - cam.x, p.y + e.getBbHeight() + 0.5 - cam.y, p.z - cam.z);
            m.rotate(camera.orientation);
            m.scale(0.025f, -0.025f, 0.025f);
            float x = -tr.width(label) / 2f;
            out.submitText(m, x, 0f, label.getVisualOrderText(), false, Font.DisplayMode.SEE_THROUGH,
                light, 0x80FFFFFF, plate, 0);
            out.submitText(m, x, 0f, label.getVisualOrderText(), false, Font.DisplayMode.NORMAL,
                light, 0xFFFFFFFF, 0, 0);
            m.popPose();
        }
    }

    /** "2.4s", or "48t" — the number in the accent, the unit in the label grey, as the HUD plate had them */
    private static Component fuse(HudElements.Face face, float ticksLeft, boolean inTicks) {
        String number = inTicks
            ? Integer.toString((int) Math.ceil(ticksLeft))
            : String.format(Locale.ROOT, "%.1f", ticksLeft / 20f);
        MutableComponent t = face.of(number).copy().withColor(Paint.ACCENT & 0xFFFFFF);
        return t.append(face.of(inTicks ? "t" : "s").copy().withColor(Paint.LABEL & 0xFFFFFF));
    }

    /* ── the primitives ───────────────────────────────────────────────────
       A line in this pass needs a NORMAL as well as a position, and getting it
       wrong is the classic way to draw nothing at all: the shader uses it, and
       a zero vector produces a degenerate line that is silently dropped. So
       the normal is the direction of the line itself, normalised. And 26.3
       asks each vertex how wide its line is. */
    private static void line(PoseStack.Pose pose, VertexConsumer v,
                             double x1, double y1, double z1,
                             double x2, double y2, double z2, int argb, float width) {
        double dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        double len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len == 0) return;
        float nx = (float) (dx / len), ny = (float) (dy / len), nz = (float) (dz / len);
        v.addVertex(pose, (float) x1, (float) y1, (float) z1).setColor(argb).setNormal(pose, nx, ny, nz).setLineWidth(width);
        v.addVertex(pose, (float) x2, (float) y2, (float) z2).setColor(argb).setNormal(pose, nx, ny, nz).setLineWidth(width);
    }

    private static void box(PoseStack.Pose pose, VertexConsumer v,
                            double x1, double y1, double z1,
                            double x2, double y2, double z2, int argb, float width) {
        line(pose, v, x1, y1, z1, x2, y1, z1, argb, width);
        line(pose, v, x2, y1, z1, x2, y1, z2, argb, width);
        line(pose, v, x2, y1, z2, x1, y1, z2, argb, width);
        line(pose, v, x1, y1, z2, x1, y1, z1, argb, width);

        line(pose, v, x1, y2, z1, x2, y2, z1, argb, width);
        line(pose, v, x2, y2, z1, x2, y2, z2, argb, width);
        line(pose, v, x2, y2, z2, x1, y2, z2, argb, width);
        line(pose, v, x1, y2, z2, x1, y2, z1, argb, width);

        line(pose, v, x1, y1, z1, x1, y2, z1, argb, width);
        line(pose, v, x2, y1, z1, x2, y2, z1, argb, width);
        line(pose, v, x2, y1, z2, x2, y2, z2, argb, width);
        line(pose, v, x1, y1, z2, x1, y2, z2, argb, width);
    }

    /* THE THICKNESS THE MENU SET, in screen pixels at 1080p and scaled past
       it the way vanilla's own lines are — 2.5 on a 1920-wide window — and
       kept inside a range a hand-edited file cannot push past. */
    private static float lineWidth(Minecraft c, Feature f) {
        double t = f.number("thickness", DEFAULT_THICKNESS);
        t = Math.max(1.0, Math.min(10.0, t));
        float px = (float) (Math.round(t * 2.0) / 2.0);
        int fbWidth = c.getWindow().getWidth();
        return px * Math.max(1f, fbWidth / 1920f);
    }

    /* Minecraft's own lines: 2.5 pixels on a 1920-wide window. The declared
       default in mc/hud.js is the same number. */
    private static final double DEFAULT_THICKNESS = 2.5;
}
