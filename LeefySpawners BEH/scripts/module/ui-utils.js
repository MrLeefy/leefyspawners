import { system } from "@minecraft/server";
import { FormCancelationReason } from "@minecraft/server-ui";
/**
 * Shared UI utility: wraps form.show() with a UserBusy retry loop.
 * Bedrock often rejects consecutive form shows with FormCancelationReason.UserBusy
 * (e.g. when a screen close animation is still playing). This retries once per tick
 * for up to 2 seconds (40 ticks) until the client is ready.
 *
 * NOTE: form.show() can THROW (not just return canceled) with EngineError,
 * InvalidEntityError, or RawMessageError per the official API docs.
 */
export async function forceShowForm(player, form) {
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
        }
        catch (err) {
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
    }
    catch (err) {
        console.warn(`[forceShowForm] Final fallback attempt threw: ${err}`);
        return { canceled: true, cancelationReason: "MaxAttemptsExceeded" };
    }
}
import { securityService } from "./security-service.js";
import { UI, THEME, ERROR_MESSAGES } from "./constants.js";
import { configDatabase } from "./mobstacker-core.js";
/**
 * Format helper for UI text based on unified colors from THEME constants,
 * reading from the config database for dynamic customization.
 */
export const Format = {
    getColor: (key, defaultColor) => {
        try {
            return configDatabase.read(`theme_${key}`) ?? defaultColor;
        }
        catch {
            return defaultColor;
        }
    },
    title: (text) => `${Format.getColor('COLOR_TITLE', THEME.COLOR_TITLE)}${text}${Format.getColor('COLOR_RESET', THEME.COLOR_RESET)}`,
    success: (text) => `${Format.getColor('COLOR_SUCCESS', THEME.COLOR_SUCCESS)}${text}${Format.getColor('COLOR_RESET', THEME.COLOR_RESET)}`,
    error: (text) => `${Format.getColor('COLOR_ERROR', THEME.COLOR_ERROR)}${text}${Format.getColor('COLOR_RESET', THEME.COLOR_RESET)}`,
    warn: (text) => `${Format.getColor('COLOR_WARN', THEME.COLOR_WARN)}${text}${Format.getColor('COLOR_RESET', THEME.COLOR_RESET)}`,
    info: (text) => `${Format.getColor('COLOR_INFO', THEME.COLOR_INFO)}${text}${Format.getColor('COLOR_RESET', THEME.COLOR_RESET)}`,
    text: (text) => `${Format.getColor('COLOR_TEXT', THEME.COLOR_TEXT)}${text}${Format.getColor('COLOR_RESET', THEME.COLOR_RESET)}`,
    highlight: (text) => `${Format.getColor('COLOR_HIGHLIGHT', THEME.COLOR_HIGHLIGHT)}${text}${Format.getColor('COLOR_RESET', THEME.COLOR_RESET)}`
};
/**
 * Asserts that the player is valid and has administrative permissions.
 * Sends an error message to the player if they don't.
 */
export function assertAdmin(player) {
    if (!player || !player.isValid)
        return false;
    if (!securityService.hasTagPermission(player, UI.ADMIN_PERMISSION_TAG)) {
        player.sendMessage(Format.error(ERROR_MESSAGES.NO_PERMISSION));
        return false;
    }
    return true;
}
/**
 * Asserts that the player is near the specified block coordinates.
 * Sends an error message to the player if they are too far.
 */
export function assertProximity(player, x, y, z, maxDistance = 10) {
    if (!player || !player.isValid)
        return false;
    const loc = player.location;
    const dx = loc.x - x;
    const dy = loc.y - y;
    const dz = loc.z - z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > maxDistance * maxDistance) {
        player.sendMessage(Format.error("You are too far from the spawner."));
        return false;
    }
    return true;
}
