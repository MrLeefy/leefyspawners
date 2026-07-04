import { system, Player } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";

/**
 * Shared UI utility: wraps form.show() with a UserBusy retry loop.
 * Bedrock often rejects consecutive form shows with FormCancelationReason.UserBusy
 * (e.g. when a screen close animation is still playing). This retries once per tick
 * for up to 2 seconds (40 ticks) until the client is ready.
 */
export async function forceShowForm(
    player: Player,
    form: ActionFormData | ModalFormData | any
): Promise<any> {
    let attempts = 0;
    while (attempts < 40) {
        const response = await form.show(player);
        if (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy) {
            attempts++;
            await system.waitTicks(1);
            continue;
        }
        return response;
    }
    // Fallback: one last attempt even if still busy
    return form.show(player);
}
