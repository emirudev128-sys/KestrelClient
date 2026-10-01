package dev.kestrel.hud;

import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.renderpearl.api.textures.FilterMode;
import com.mojang.renderpearl.api.textures.GpuTexture;
import com.mojang.renderpearl.api.textures.GpuTextureView;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.client.gui.render.TextureSetup;
import net.minecraft.client.gui.render.pip.PictureInPictureRenderer;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.feature.FeatureRenderDispatcher;
import net.minecraft.client.renderer.state.gui.BlitRenderState;
import net.minecraft.client.renderer.state.gui.GuiRenderState;
import net.minecraft.client.renderer.state.gui.pip.PictureInPictureRenderState;
import org.joml.Matrix3x2f;

import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/**
 * BLUR ONLY WHAT SITS BEHIND A PANEL.
 *
 * <p>Vanilla's menu blur runs over the whole frame. The player asked for the
 * world to stay sharp between the panels, so the world is photographed before
 * the blur, vanilla's own blur runs, and the sharp photograph is put back
 * everywhere that is not a panel. No shader of ours, no mixin.
 *
 * <p><b>AND THE CANVAS SHOWS THE WORLD SHARP, SMALL.</b> The HUD canvas in the
 * middle panel is a picture of the whole screen. The sharp photograph is
 * already here, so it is scaled into the canvas too: the elements are then
 * drawn over the real world rather than over a stand-in.
 *
 * <p><b>26.3: A PICTURE IN THE PICTURE, TAKEN AT THE RIGHT MOMENT.</b> The
 * GUI no longer draws while the screen is asked for it — the frame is written
 * down first and drawn once the world is finished. So the menu writes down
 * what it wants ({@link Frame}); when the GUI is about to draw, and the world
 * is complete in the frame, {@link Renderer} copies it into a texture of its
 * own and lays the sharp pieces in, under everything else the menu draws.
 * The blur sits between the world and that layer, where vanilla puts its own.
 *
 * <p>Rectangles are {@code {x0, top, x1, bottom}} in framebuffer pixels
 * measured from the top, the way the menu thinks.
 */
final class PanelBlur {

    private PanelBlur() { }

    /** the frame's request: which rectangles stay blurred, and the canvas's picture */
    record Frame(int[][] panels, int[] miniSource, int[] miniTarget, int guiWidth, int guiHeight)
            implements PictureInPictureRenderState {
        @Override public int x0() { return 0; }
        @Override public int y0() { return 0; }
        @Override public int x1() { return guiWidth; }
        @Override public int y1() { return guiHeight; }
        @Override public float scale() { return 1f; }
        @Override public ScreenRectangle scissorArea() { return null; }
        @Override public ScreenRectangle bounds() { return new ScreenRectangle(0, 0, guiWidth, guiHeight); }
    }

    /** the renderer the game made last — it asks for one each time it builds its GUI renderer */
    private static Renderer renderer;

    static PictureInPictureRenderer<?> newRenderer() {
        renderer = new Renderer();
        return renderer;
    }

    /* Called from the menu's background layer: everything drawn before it —
       the world and the game's own HUD — goes under the blur, and the sharp
       pieces go straight above it. ONE BLUR A FRAME is the game's rule; a second ask
       would throw, so a frame that somehow already has one keeps that one. */
    static void apply(GuiGraphicsExtractor ctx, int[][] panels, int[] miniSource, int[] miniTarget) {
        try {
            ctx.blurBeforeThisStratum();
        } catch (IllegalStateException alreadyBlurred) {
            /* the panels still get their sharp surroundings; only the blur is shared */
        }
        ctx.guiRenderState.addPicturesInPictureState(
            new Frame(panels, miniSource, miniTarget, ctx.guiWidth(), ctx.guiHeight()));
    }

    /** gives the photograph's memory back when the menu closes */
    static void release() {
        if (renderer != null) renderer.free();
    }

    static final class Renderer extends PictureInPictureRenderer<Frame> {
        private GpuTexture sharp;
        private GpuTextureView sharpView;

        @Override
        public Class<Frame> getRenderStateClass() {
            return Frame.class;
        }

        @Override
        protected void renderToTexture(Frame frame, PoseStack pose, SubmitNodeCollector out) {
            /* nothing is rendered: the picture is the world itself */
        }

        @Override
        protected String getTextureLabel() {
            return "kestrel-hud panels";
        }

        @Override
        public void prepare(Frame f, GuiRenderState state, FeatureRenderDispatcher features, int guiScale) {
            RenderTarget main = Minecraft.getInstance().gameRenderer.mainRenderTarget();
            GpuTexture colour = main == null ? null : main.getColorTexture();
            if (colour == null || guiScale <= 0) return;
            int w = colour.getWidth(0), h = colour.getHeight(0);
            if (w <= 0 || h <= 0) return;
            if (sharp == null || sharp.isClosed() || sharp.getWidth(0) != w || sharp.getHeight(0) != h
                    || sharp.getFormat() != colour.getFormat()) {
                free();
                sharp = RenderSystem.getDevice().createTexture(() -> "kestrel-hud sharp world",
                    GpuTexture.USAGE_COPY_DST | GpuTexture.USAGE_TEXTURE_BINDING, colour.getFormat(), w, h, 1, 1);
                sharpView = RenderSystem.getDevice().createTextureView(sharp);
            }
            RenderSystem.getDevice().createCommandEncoder().copyTextureToTexture(colour, sharp, 0, 0, 0, 0, 0, w, h);

            /* placed in framebuffer pixels: one GUI unit is guiScale of them */
            Matrix3x2f pose = new Matrix3x2f().scale(1f / guiScale, 1f / guiScale);
            TextureSetup crisp = TextureSetup.singleTexture(sharpView,
                RenderSystem.getSamplerCache().getClampToEdge(FilterMode.NEAREST));
            for (int[] r : gaps(f.panels(), w, h)) blit(state, crisp, pose, r, r, w, h);

            if (f.miniSource() != null && f.miniTarget() != null) {
                TextureSetup smooth = TextureSetup.singleTexture(sharpView,
                    RenderSystem.getSamplerCache().getClampToEdge(FilterMode.LINEAR));
                blit(state, smooth, pose, f.miniTarget(), f.miniSource(), w, h);
            }
        }

        void free() {
            if (sharpView != null) { sharpView.close(); sharpView = null; }
            if (sharp != null) { sharp.close(); sharp = null; }
        }

        @Override
        public void close() {
            free();
            super.close();
        }
    }

    /* A piece of the photograph, opaque: it stands for the world exactly, so
       nothing under it should show through. The photograph is stored bottom
       row first, as every framebuffer is, so v runs from 1 at the top. */
    private static void blit(GuiRenderState state, TextureSetup tex, Matrix3x2f pose,
                             int[] to, int[] from, int w, int h) {
        if (to[2] <= to[0] || to[3] <= to[1]) return;
        float u0 = from[0] / (float) w, u1 = from[2] / (float) w;
        float v0 = 1f - from[1] / (float) h, v1 = 1f - from[3] / (float) h;
        state.addBlitToCurrentLayer(new BlitRenderState(RenderPipelines.GUI_OPAQUE_TEXTURED_BACKGROUND, tex, pose,
            to[0], to[1], to[2], to[3], u0, u1, v0, v1, -1, null));
    }

    /* EVERYTHING THAT IS NOT A PANEL, as rectangles: every panel edge cuts
       the screen into a grid, and each cell no panel covers is a gap. Five
       panels make a grid of at most eleven by eleven, so this is cheap, and
       neighbouring cells in a row are joined so the margins are a few long
       strips rather than many squares. */
    static List<int[]> gaps(int[][] panels, int w, int h) {
        TreeSet<Integer> xs = new TreeSet<>(), ys = new TreeSet<>();
        xs.add(0); xs.add(w); ys.add(0); ys.add(h);
        List<int[]> inside = new ArrayList<>();
        for (int[] r : panels) {
            int x0 = clamp(r[0], w), y0 = clamp(r[1], h), x1 = clamp(r[2], w), y1 = clamp(r[3], h);
            if (x1 <= x0 || y1 <= y0) continue;
            inside.add(new int[] { x0, y0, x1, y1 });
            xs.add(x0); xs.add(x1); ys.add(y0); ys.add(y1);
        }
        Integer[] gx = xs.toArray(new Integer[0]), gy = ys.toArray(new Integer[0]);
        List<int[]> out = new ArrayList<>();
        for (int j = 0; j + 1 < gy.length; j++) {
            int y0 = gy[j], y1 = gy[j + 1];
            int runStart = -1;
            for (int i = 0; i + 1 < gx.length; i++) {
                int x0 = gx[i], x1 = gx[i + 1];
                boolean covered = false;
                for (int[] p : inside) {
                    if (x0 >= p[0] && x1 <= p[2] && y0 >= p[1] && y1 <= p[3]) { covered = true; break; }
                }
                if (!covered && runStart < 0) runStart = x0;
                if (covered && runStart >= 0) { out.add(new int[] { runStart, y0, x0, y1 }); runStart = -1; }
            }
            if (runStart >= 0) out.add(new int[] { runStart, y0, gx[gx.length - 1], y1 });
        }
        return out;
    }

    private static int clamp(int v, int max) {
        return Math.max(0, Math.min(max, v));
    }
}
