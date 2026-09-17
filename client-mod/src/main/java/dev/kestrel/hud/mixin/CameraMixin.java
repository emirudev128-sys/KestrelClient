package dev.kestrel.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.kestrel.hud.Freelook;
import net.minecraft.client.render.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * THE CAMERA ASKS FREELOOK WHICH WAY TO FACE.
 *
 * <p>{@code Camera.update} reads the player's yaw and pitch twice — once for
 * an ordinary frame, once for a player riding the experimental minecart — and
 * turns the camera to them before it pulls back into third person. Both reads
 * are replaced, and only while {@link Freelook#active()} says so; otherwise
 * the value passes through untouched.
 *
 * <p><b>MODIFY THE VALUE, DO NOT REDIRECT THE CALL.</b> A redirect owns the
 * call outright and two mods redirecting the same one crash the game; this
 * form chains with anybody else adjusting the same number.
 */
@Mixin(Camera.class)
abstract class CameraMixin {

    @ModifyExpressionValue(method = "update",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/entity/Entity;getYaw(F)F"))
    private float kestrelHud$freelookYaw(float yaw) {
        return Freelook.active() ? Freelook.yaw() : yaw;
    }

    @ModifyExpressionValue(method = "update",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/entity/Entity;getPitch(F)F"))
    private float kestrelHud$freelookPitch(float pitch) {
        return Freelook.active() ? Freelook.pitch() : pitch;
    }
}
