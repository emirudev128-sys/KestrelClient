package dev.kestrel.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.Element;
import net.minecraft.client.gui.ParentElement;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.CreativeInventoryScreen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.screen.Generic3x3ContainerScreenHandler;
import net.minecraft.screen.GenericContainerScreenHandler;
import net.minecraft.screen.HopperScreenHandler;
import net.minecraft.screen.ScreenHandler;
import net.minecraft.screen.ShulkerBoxScreenHandler;
import net.minecraft.screen.slot.Slot;
import net.minecraft.screen.slot.SlotActionType;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * THE INVENTORY SORTER.
 *
 * <p>One key. In a chest, a shulker box, a barrel, a hopper or a dispenser it
 * sorts the container; anywhere else — your own inventory screen, or no
 * screen at all — it sorts your inventory, the hotbar left alone unless the
 * option says otherwise.
 *
 * <p><b>IT SORTS BY CLICKING, THE WAY A PLAYER WOULD.</b> An inventory lives
 * on the server, so rearranging it is a sequence of ordinary slot clicks —
 * pick up, put down — sent as ordinary click packets, each one applied to the
 * client's copy at once so the next step reads the result of the last. First
 * every partial stack is topped up from the ones after it, then the slots are
 * put in order by selection: find what belongs in this slot, swap it in.
 * Nothing is invented and nothing is sent that a hand could not send.
 *
 * <p><b>SOME SERVERS WATCH FOR FAST CLICKING.</b> A sort is dozens of clicks
 * in one tick. Singleplayer and most servers do not care; a server with strict
 * anti-cheat may. That is why it is off until switched on, and it never runs
 * with an item held on the cursor.
 */
final class Sorter {

    private Sorter() { }

    /** the key, pressed in the world rather than in a screen */
    static void tick(MinecraftClient c, HudConfig config) {
        Feature f = config.feature("sorter");
        boolean pressed = Behaviours.presses(c, "sorter") > 0;
        if (!pressed || f == null || !f.on || c.player == null || c.currentScreen != null) return;
        sort(c, c.player.playerScreenHandler, playerSlots(c, c.player.playerScreenHandler, f.flag("hotbar")), f);
    }

    /** the key, pressed inside an inventory screen — wired from KestrelHudClient */
    static void pressedIn(Screen screen, int keyCode, int scanCode, HudConfig config,
                          net.minecraft.client.option.KeyBinding key) {
        MinecraftClient c = MinecraftClient.getInstance();
        Feature f = config.feature("sorter");
        if (key == null || f == null || !f.on || c.player == null) return;
        if (!key.matchesKey(keyCode, scanCode)) return;
        if (!(screen instanceof HandledScreen<?> handled) || screen instanceof CreativeInventoryScreen) return;
        /* A KEY TYPED INTO A SEARCH BOX IS A LETTER, NOT A COMMAND */
        if (typing(screen.getFocused())) return;

        ScreenHandler h = handled.getScreenHandler();
        List<Slot> slots = isContainer(h) ? containerSlots(c, h) : playerSlots(c, h, f.flag("hotbar"));
        sort(c, h, slots, f);
    }

    private static boolean typing(Element e) {
        if (e == null) return false;
        if (e instanceof TextFieldWidget t) return t.isFocused();
        if (e instanceof net.minecraft.client.gui.screen.recipebook.RecipeBookWidget<?>) return true;
        if (e instanceof ParentElement p) return typing(p.getFocused());
        return false;
    }

    /** the handlers whose own slots are storage, and worth putting in order */
    private static boolean isContainer(ScreenHandler h) {
        return h instanceof GenericContainerScreenHandler || h instanceof ShulkerBoxScreenHandler
            || h instanceof Generic3x3ContainerScreenHandler || h instanceof HopperScreenHandler;
    }

    private static List<Slot> containerSlots(MinecraftClient c, ScreenHandler h) {
        PlayerInventory mine = c.player.getInventory();
        List<Slot> out = new ArrayList<>();
        for (Slot s : h.slots) if (s.inventory != mine) out.add(s);
        return out;
    }

    /* YOUR INVENTORY'S OWN NUMBERING, not the screen's: 9..35 are the main
       grid in every screen that shows it, and 0..8 the hotbar. Armour, the
       offhand and the crafting grid are never touched. */
    private static List<Slot> playerSlots(MinecraftClient c, ScreenHandler h, boolean hotbar) {
        PlayerInventory mine = c.player.getInventory();
        List<Slot> main = new ArrayList<>(), bar = new ArrayList<>();
        for (Slot s : h.slots) {
            if (s.inventory != mine) continue;
            int i = s.getIndex();
            if (i >= 9 && i <= 35) main.add(s);
            else if (hotbar && i >= 0 && i <= 8) bar.add(s);
        }
        main.addAll(bar);
        return main;
    }

    /* THE GAME'S SLOTS AS A GRID FOR SortPlan. Every question reads the live
       slot, and every click is applied to the client's copy the moment it is
       sent, so each step sees the result of the last. */
    private static void sort(MinecraftClient c, ScreenHandler h, List<Slot> slots, Feature f) {
        if (c.interactionManager == null || slots.size() < 2) return;
        Comparator<ItemStack> order = "name".equals(f.choice("order", "type")) ? BY_NAME : BY_TYPE;
        boolean done = SortPlan.run(new SortPlan.Grid() {
            @Override public int size() { return slots.size(); }
            @Override public boolean empty(int i) { return slots.get(i).getStack().isEmpty(); }
            @Override public boolean full(int i) {
                ItemStack s = slots.get(i).getStack();
                return s.getCount() >= s.getMaxCount();
            }
            @Override public boolean same(int a, int b) {
                return ItemStack.areItemsAndComponentsEqual(slots.get(a).getStack(), slots.get(b).getStack());
            }
            @Override public int compare(int a, int b) {
                return order.compare(slots.get(a).getStack(), slots.get(b).getStack());
            }
            @Override public void click(int i) {
                c.interactionManager.clickSlot(h.syncId, slots.get(i).id, 0, SlotActionType.PICKUP, c.player);
            }
            @Override public boolean cursorEmpty() { return h.getCursorStack().isEmpty(); }
        });
        if (!done) KestrelHudClient.LOG.info("Kestrel HUD: sorting stopped early — a slot did not take what it was given");
    }

    /* BY TYPE: the order items are registered in, which keeps blocks with
       blocks and tools with tools, then name, then fullest first. BY NAME: as
       the item is called on screen. Both end on the count, so after the merge
       the one partial stack of anything sorts after its full ones. */
    private static final Comparator<ItemStack> BY_TYPE =
        Comparator.comparingInt((ItemStack s) -> Registries.ITEM.getRawId(s.getItem()))
            .thenComparing(s -> s.getName().getString())
            .thenComparing(Comparator.comparingInt(ItemStack::getCount).reversed());

    private static final Comparator<ItemStack> BY_NAME =
        Comparator.comparing((ItemStack s) -> s.getName().getString(), String.CASE_INSENSITIVE_ORDER)
            .thenComparingInt(s -> Registries.ITEM.getRawId(s.getItem()))
            .thenComparing(Comparator.comparingInt(ItemStack::getCount).reversed());
}
