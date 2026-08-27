package dev.kestrel.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;

/**
 * WHAT THE COMBAT ELEMENTS REMEMBER.
 *
 * <p>A combo counter, a reach display and a PvP readout are all the same
 * shape: they answer a question about a hit that has already happened, so
 * something has to be watching for hits. This is that something, and it is one
 * class rather than three because they all key off the same event and would
 * otherwise each keep their own copy of "who did I last hit and when".
 *
 * <p><b>POLLED, NOT HOOKED.</b> The obvious way to see an attack is to mix in
 * to the attack method. This mod has no mixins and does not want its first one
 * to be for a HUD counter: a mixin is a build-time weave into somebody else's
 * class, it needs its own config and refmap, and it breaks differently on
 * every Minecraft version. Watching the attack key on the client tick — the
 * same rising edge {@link Clicks} already needs — costs nothing and cannot
 * break the game if it is wrong.
 *
 * <p>What that costs is precision: this sees an attack ATTEMPT, and the swing
 * that misses looks the same as the one that lands. So the reading is taken
 * from what the crosshair was actually on at the moment of the press, and a
 * press with nothing under the crosshair is not a hit. That is very close to
 * right and honest about which question it is answering.
 *
 * <p><b>A COMBO ENDS WHEN THE CLOCK SAYS SO.</b> Two seconds without a hit,
 * or a hit on somebody else. Every client draws that line somewhere and
 * nowhere is canonical; what matters is that it is stated rather than being an
 * accident of when a variable happened to be cleared.
 */
final class Combat {

    private Combat() { }

    /** how long a combo survives without a further hit */
    private static final long COMBO_WINDOW_NS = 2_000_000_000L;

    private static boolean wasAttacking = false;

    private static int combo = 0;
    private static long lastHitNs = 0;

    private static double lastReach = -1;
    private static String lastTargetName = "";
    private static float lastTargetHealth = -1;
    private static float lastTargetMax = -1;
    private static double lastTargetDistance = -1;

    /** called once per client tick, before anything reads the values */
    static void tick(MinecraftClient c) {
        if (c == null || c.player == null || c.options == null) { wasAttacking = false; return; }
        boolean down = c.options.attackKey.isPressed();
        boolean rising = down && !wasAttacking;
        wasAttacking = down;

        /* the combo expires on its own, whether or not anything is pressed */
        if (combo > 0 && System.nanoTime() - lastHitNs > COMBO_WINDOW_NS) combo = 0;
        if (!rising) return;

        Entity target = c.targetedEntity;
        if (!(target instanceof LivingEntity)) return;
        LivingEntity live = (LivingEntity) target;

        /* REACH IS MEASURED EYE TO HITBOX, not centre to centre. Centre to
           centre is the number people quote and it is wrong by half the width
           of whatever was hit — a hit on a spider reads further than the same
           hit on a player. */
        double d = Math.sqrt(live.getBoundingBox()
            .squaredMagnitude(c.player.getEyePos()));
        lastReach = d;
        lastTargetDistance = c.player.distanceTo(live);

        boolean same = live.getName().getString().equals(lastTargetName);
        combo = same ? combo + 1 : 1;
        lastHitNs = System.nanoTime();

        lastTargetName = live.getName().getString();
        lastTargetHealth = live.getHealth();
        lastTargetMax = live.getMaxHealth();
        /* not a player is still worth counting, but PvP info says so */
        if (!(live instanceof PlayerEntity)) lastTargetName = live.getName().getString();
    }

    /** live health of whoever was last hit, refreshed while they are loaded */
    static void refresh(MinecraftClient c) {
        if (c == null || c.world == null || lastTargetName.isEmpty()) return;
        for (Entity e : c.world.getEntities()) {
            if (e instanceof LivingEntity && e.getName().getString().equals(lastTargetName)) {
                lastTargetHealth = ((LivingEntity) e).getHealth();
                lastTargetMax = ((LivingEntity) e).getMaxHealth();
                if (c.player != null) lastTargetDistance = c.player.distanceTo(e);
                return;
            }
        }
    }

    static int combo() {
        if (combo > 0 && System.nanoTime() - lastHitNs > COMBO_WINDOW_NS) combo = 0;
        return combo;
    }

    static double reach() { return lastReach; }
    static String target() { return lastTargetName; }
    static float targetHealth() { return lastTargetHealth; }
    static float targetMax() { return lastTargetMax; }
    static double targetDistance() { return lastTargetDistance; }

    /** cleared on world change, so a readout never survives into a world where
     *  the thing it describes does not exist */
    static void reset() {
        combo = 0;
        lastReach = -1;
        lastTargetName = "";
        lastTargetHealth = -1;
        lastTargetMax = -1;
        lastTargetDistance = -1;
    }
}
