package dev.kestrel.hud;

import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.Framebuffer;
import net.minecraft.client.gl.SimpleFramebuffer;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL30;

/**
 * BLUR ONLY WHAT SITS BEHIND A PANEL.
 *
 * <p>Vanilla's menu blur ({@code GameRenderer.renderBlur}) runs over the whole
 * frame. The player asked for the world to stay sharp between the panels, so
 * the frame is copied before the blur, blurred, copied again, and put back —
 * then only the panel rectangles are pasted from the blurred copy. Four
 * framebuffer blits and vanilla's own blur pass; no shader of ours, no mixin.
 *
 * <p><b>AND THE CANVAS SHOWS THE WORLD SHARP, SMALL.</b> The HUD canvas in the
 * middle panel is a picture of the whole screen. The unblurred copy is already
 * sitting here, so it is scaled into the canvas with one more blit: the
 * elements are then drawn over the real world rather than over a stand-in.
 *
 * <p>Rectangles are {@code {x0, top, x1, bottom}} in framebuffer pixels
 * measured from the top, the way the menu thinks; GL counts from the bottom
 * and is converted here, once.
 */
final class PanelBlur {

    private PanelBlur() { }

    private static SimpleFramebuffer sharp;
    private static SimpleFramebuffer blurred;

    static void apply(MinecraftClient client, int[][] panels, int[] miniSource, int[] miniTarget) {
        Framebuffer main = client.getFramebuffer();
        int w = main.textureWidth, h = main.textureHeight;
        if (w <= 0 || h <= 0) return;
        sharp = sized(sharp, w, h);
        blurred = sized(blurred, w, h);

        /* a blit honours the scissor test; nothing should be clipping yet,
           and a stale rectangle would silently copy a fraction of the frame */
        RenderSystem.disableScissor();

        blit(main.fbo, sharp.fbo, 0, 0, w, h, 0, 0, w, h, false);
        client.gameRenderer.renderBlur();
        blit(main.fbo, blurred.fbo, 0, 0, w, h, 0, 0, w, h, false);
        blit(sharp.fbo, main.fbo, 0, 0, w, h, 0, 0, w, h, false);

        for (int[] r : panels) {
            int x0 = clamp(r[0], w), top = clamp(r[1], h), x1 = clamp(r[2], w), bottom = clamp(r[3], h);
            if (x1 <= x0 || bottom <= top) continue;
            blit(blurred.fbo, main.fbo, x0, h - bottom, x1, h - top, x0, h - bottom, x1, h - top, false);
        }

        if (miniSource != null && miniTarget != null) {
            blit(sharp.fbo, main.fbo,
                miniSource[0], h - miniSource[3], miniSource[2], h - miniSource[1],
                miniTarget[0], h - miniTarget[3], miniTarget[2], h - miniTarget[1], true);
        }
        main.beginWrite(false);
    }

    /** gives the two copies' memory back when the menu closes */
    static void release() {
        if (sharp != null) { sharp.delete(); sharp = null; }
        if (blurred != null) { blurred.delete(); blurred = null; }
    }

    private static SimpleFramebuffer sized(SimpleFramebuffer fb, int w, int h) {
        if (fb == null) return new SimpleFramebuffer(w, h, false);
        if (fb.textureWidth != w || fb.textureHeight != h) fb.resize(w, h);
        return fb;
    }

    private static int clamp(int v, int max) {
        return Math.max(0, Math.min(max, v));
    }

    private static void blit(int from, int to, int sx0, int sy0, int sx1, int sy1,
                             int dx0, int dy0, int dx1, int dy1, boolean smooth) {
        GlStateManager._glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER, from);
        GlStateManager._glBindFramebuffer(GL30.GL_DRAW_FRAMEBUFFER, to);
        GlStateManager._glBlitFrameBuffer(sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1,
            GL11.GL_COLOR_BUFFER_BIT, smooth ? GL11.GL_LINEAR : GL11.GL_NEAREST);
    }
}
