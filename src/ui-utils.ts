import { system, Player } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";

/**
 * Shared UI utility: wraps form.show() with a UserBusy retry loop.
 * Bedrock often rejects consecutive form shows with FormCancelationReason.UserBusy
 * (e.g. when a screen close animation is still playing). This retries once per tick
 * for up to 2 seconds (40 ticks) until the client is ready.
 *
 * NOTE: form.show() can THROW (not just return canceled) with EngineError,
 * InvalidEntityError, or RawMessageError per the official API docs.
 */
export async function forceShowForm(
    player: Player,
    form: ActionFormData | ModalFormData | any
): Promise<any> {
    let attempts = 0;
    while (attempts < 40) {
        try {
            const response = await form.show(player);
            if (response.canceled && response.cancelationReason === FormCancelationReason.UserBusy) {
                attempts++;
                await system.waitTicks(1);
                continue;
            }
            return response;
        } catch (err) {
            // form.show() can throw EngineError, InvalidEntityError, RawMessageError
            console.warn(`[forceShowForm] form.show() threw on attempt ${attempts}: ${err}`);
            // If player is no longer valid, bail out immediately
            if (!player || !player.isValid) {
                console.warn(`[forceShowForm] Player is no longer valid, aborting`);
                return { canceled: true, cancelationReason: "PlayerInvalid" };
            }
            attempts++;
            await system.waitTicks(1);
        }
    }
    // Fallback: one last attempt even if still busy
    try {
        return await form.show(player);
    } catch (err) {
        console.warn(`[forceShowForm] Final fallback attempt threw: ${err}`);
        return { canceled: true, cancelationReason: "MaxAttemptsExceeded" };
    }
}
