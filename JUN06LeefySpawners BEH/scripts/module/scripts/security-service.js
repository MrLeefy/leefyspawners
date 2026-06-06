import { Player } from "@minecraft/server";
import { UI, ERROR_MESSAGES, VALIDATION } from "./constants.js";
import { performanceMonitor } from "./performance-monitor.js";

/**
 * Security service for handling permissions, command validation, and security checks
 * Provides centralized security management with proper access control
 */
export class SecurityService {
    constructor() {
        this.permissionLevels = {
            USER: 0,
            ADMIN: 1,
            OWNER: 2
        };

        this.commandCooldowns = new Map();
        this.suspiciousActivity = new Map();
        this.bannedCommands = new Set([
            'execute', 'function', 'gamerule', 'setblock', 'fill', 'clone',
            'summon', 'give', 'tp', 'teleport', 'kill', 'effect', 'enchant'
        ]);

        this.ipWhitelist = new Set(); // For future IP-based restrictions
        this.sessionTokens = new Map(); // For session management
    }

    /**
     * Check if player has required permission level
     * @param {Player} player - The player to check
     * @param {number} requiredLevel - Required permission level
     * @returns {boolean} True if player has permission
     */
    hasPermission(player, requiredLevel = this.permissionLevels.USER) {
        if (!player?.isValid) return false;

        try {
            // Owner has all permissions
            if (player.hasTag(UI.OWNER_PERMISSION_TAG)) {
                return true;
            }

            // Admin permissions
            if (requiredLevel <= this.permissionLevels.ADMIN) {
                if (player.hasTag(UI.ADMIN_PERMISSION_TAG)) {
                    return true;
                }
            }

            // User permissions (basic)
            if (requiredLevel <= this.permissionLevels.USER) {
                return true;
            }

            return false;
        } catch (error) {
            performanceMonitor.recordError('permission_check', error.message);
            return false;
        }
    }

    /**
     * Check if player has specific tag-based permission
     * @param {Player} player - The player to check
     * @param {string} permissionTag - The permission tag to check
     * @returns {boolean} True if player has permission
     */
    hasTagPermission(player, permissionTag) {
        if (!player?.isValid || !permissionTag) return false;

        try {
            return player.hasTag(permissionTag);
        } catch (error) {
            performanceMonitor.recordError('tag_permission_check', error.message);
            return false;
        }
    }

    /**
     * Grant permission to player
     * @param {Player} granter - Player granting permission
     * @param {Player} target - Player receiving permission
     * @param {string} permissionTag - Permission tag to grant
     * @returns {boolean} True if permission was granted
     */
    grantPermission(granter, target, permissionTag) {
        if (!this.hasPermission(granter, this.permissionLevels.OWNER)) {
            this.logSecurityEvent('unauthorized_permission_grant', granter, {
                target: target?.name,
                permission: permissionTag
            });
            return false;
        }

        if (!target?.isValid || !permissionTag) return false;

        try {
            target.addTag(permissionTag);
            this.logSecurityEvent('permission_granted', granter, {
                target: target.name,
                permission: permissionTag
            });
            return true;
        } catch (error) {
            performanceMonitor.recordError('permission_grant', error.message);
            return false;
        }
    }

    /**
     * Revoke permission from player
     * @param {Player} revoker - Player revoking permission
     * @param {Player} target - Player losing permission
     * @param {string} permissionTag - Permission tag to revoke
     * @returns {boolean} True if permission was revoked
     */
    revokePermission(revoker, target, permissionTag) {
        if (!this.hasPermission(revoker, this.permissionLevels.OWNER)) {
            this.logSecurityEvent('unauthorized_permission_revoke', revoker, {
                target: target?.name,
                permission: permissionTag
            });
            return false;
        }

        if (!target?.isValid || !permissionTag) return false;

        try {
            target.removeTag(permissionTag);
            this.logSecurityEvent('permission_revoked', revoker, {
                target: target.name,
                permission: permissionTag
            });
            return true;
        } catch (error) {
            performanceMonitor.recordError('permission_revoke', error.message);
            return false;
        }
    }

    /**
     * Validate command input for security
     * @param {Player} player - Player executing command
     * @param {string} command - Command to validate
     * @param {string[]} args - Command arguments
     * @returns {object} Validation result with isValid and error message
     */
    validateCommand(player, command, args = []) {
        const validation = {
            isValid: true,
            error: null,
            warnings: []
        };

        try {
            // Check command cooldown
            const cooldownKey = `${player.name}_${command}`;
            const now = Date.now();
            const lastUse = this.commandCooldowns.get(cooldownKey);

            if (lastUse && (now - lastUse) < 1000) { // 1 second cooldown
                validation.isValid = false;
                validation.error = "Command cooldown active. Please wait before using this command again.";
                return validation;
            }

            // Check for banned commands
            if (this.bannedCommands.has(command.toLowerCase())) {
                if (!this.hasPermission(player, this.permissionLevels.OWNER)) {
                    validation.isValid = false;
                    validation.error = "This command is restricted.";
                    this.logSecurityEvent('banned_command_attempt', player, { command });
                    return validation;
                }
            }

            // Validate command arguments
            const argValidation = this.validateCommandArguments(command, args);
            if (!argValidation.isValid) {
                validation.isValid = false;
                validation.error = argValidation.error;
                return validation;
            }

            // Check for suspicious patterns
            const suspiciousPatterns = this.detectSuspiciousPatterns(args);
            if (suspiciousPatterns.length > 0) {
                validation.warnings.push(...suspiciousPatterns);
                this.logSecurityEvent('suspicious_command_pattern', player, {
                    command,
                    args,
                    patterns: suspiciousPatterns
                });
            }

            // Update cooldown
            if (validation.isValid) {
                this.commandCooldowns.set(cooldownKey, now);

                // Clean up old cooldowns periodically
                if (this.commandCooldowns.size > 1000) {
                    this.cleanupExpiredCooldowns(now);
                }
            }

        } catch (error) {
            performanceMonitor.recordError('command_validation', error.message);
            validation.isValid = false;
            validation.error = "Command validation failed due to internal error.";
        }

        return validation;
    }

    /**
     * Validate command arguments
     * @param {string} command - Command name
     * @param {string[]} args - Command arguments
     * @returns {object} Validation result
     */
    validateCommandArguments(command, args) {
        const result = { isValid: true, error: null };

        // Common argument validations
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            // Check for command injection attempts
            if (arg.includes('&&') || arg.includes('||') || arg.includes(';')) {
                result.isValid = false;
                result.error = "Invalid command arguments detected.";
                return result;
            }

            // Check for path traversal attempts
            if (arg.includes('../') || arg.includes('..\\')) {
                result.isValid = false;
                result.error = "Invalid file path detected.";
                return result;
            }

            // Validate numeric arguments
            if (command === 'setlevel' && i === 0) {
                const level = parseInt(arg);
                if (isNaN(level) || level < VALIDATION.MIN_LEVEL || level > VALIDATION.MAX_LEVEL) {
                    result.isValid = false;
                    result.error = `Level must be between ${VALIDATION.MIN_LEVEL} and ${VALIDATION.MAX_LEVEL}.`;
                    return result;
                }
            }
        }

        return result;
    }

    /**
     * Detect suspicious patterns in command arguments
     * @param {string[]} args - Command arguments
     * @returns {string[]} Array of suspicious patterns found
     */
    detectSuspiciousPatterns(args) {
        const patterns = [];
        const suspiciousStrings = [
            'javascript:', 'data:', 'vbscript:', 'onload=', 'onerror=',
            '<script', '</script>', 'eval(', 'exec(', 'system(',
            '127.0.0.1', 'localhost', '0.0.0.0'
        ];

        args.forEach(arg => {
            suspiciousStrings.forEach(pattern => {
                if (arg.toLowerCase().includes(pattern)) {
                    patterns.push(`Suspicious pattern detected: ${pattern}`);
                }
            });
        });

        return patterns;
    }

    /**
     * Check if player is rate limited
     * @param {Player} player - Player to check
     * @param {string} action - Action being performed
     * @param {number} maxActions - Maximum actions allowed
     * @param {number} timeWindow - Time window in milliseconds
     * @returns {boolean} True if rate limited
     */
    isRateLimited(player, action, maxActions = 10, timeWindow = 60000) {
        const now = Date.now();
        const key = `${player.name}_${action}`;

        if (!this.suspiciousActivity.has(key)) {
            this.suspiciousActivity.set(key, []);
        }

        const timestamps = this.suspiciousActivity.get(key);

        // Remove old timestamps
        const cutoff = now - timeWindow;
        const recentTimestamps = timestamps.filter(ts => ts > cutoff);

        // Check if rate limited
        if (recentTimestamps.length >= maxActions) {
            this.logSecurityEvent('rate_limit_exceeded', player, { action, maxActions, timeWindow });
            return true;
        }

        // Add current timestamp
        recentTimestamps.push(now);
        this.suspiciousActivity.set(key, recentTimestamps);

        return false;
    }

    /**
     * Clean up expired cooldowns
     * @param {number} now - Current timestamp
     */
    cleanupExpiredCooldowns(now) {
        const cutoff = now - 60000; // Remove cooldowns older than 1 minute

        for (const [key, timestamp] of this.commandCooldowns.entries()) {
            if (timestamp < cutoff) {
                this.commandCooldowns.delete(key);
            }
        }
    }

    /**
     * Log security event
     * @param {string} eventType - Type of security event
     * @param {Player} player - Player involved
     * @param {object} details - Additional event details
     */
    logSecurityEvent(eventType, player, details = {}) {
        const event = {
            timestamp: Date.now(),
            eventType,
            playerId: player?.id,
            playerName: player?.name,
            details,
            severity: this.getEventSeverity(eventType)
        };

        // Log to console for admin visibility
        const logMessage = `[SECURITY] ${eventType}: Player ${player?.name || 'Unknown'} - ${JSON.stringify(details)}`;
        if (event.severity === 'high') {
            console.error(logMessage);
        } else if (event.severity === 'medium') {
            console.warn(logMessage);
        } else {
            console.log(logMessage);
        }

        // Store for admin review
        this.storeSecurityEvent(event);

        performanceMonitor.recordEvent('securityEvents');
    }

    /**
     * Get severity level for security event
     * @param {string} eventType - Type of event
     * @returns {string} Severity level (low, medium, high)
     */
    getEventSeverity(eventType) {
        const highSeverity = [
            'unauthorized_permission_grant',
            'unauthorized_permission_revoke',
            'banned_command_attempt',
            'rate_limit_exceeded'
        ];

        const mediumSeverity = [
            'suspicious_command_pattern',
            'permission_granted',
            'permission_revoked'
        ];

        if (highSeverity.includes(eventType)) return 'high';
        if (mediumSeverity.includes(eventType)) return 'medium';
        return 'low';
    }

    /**
     * Store security event for admin review
     * @param {object} event - Security event to store
     */
    storeSecurityEvent(event) {
        // In a real implementation, this would store to a database
        // For now, we'll keep recent events in memory
        if (!this.securityEvents) {
            this.securityEvents = [];
        }

        this.securityEvents.push(event);

        // Keep only recent events (last 1000)
        if (this.securityEvents.length > 1000) {
            this.securityEvents.shift();
        }
    }

    /**
     * Get recent security events
     * @param {number} count - Number of events to return
     * @param {string} severity - Filter by severity (optional)
     * @returns {object[]} Array of security events
     */
    getSecurityEvents(count = 50, severity = null) {
        let events = this.securityEvents || [];

        if (severity) {
            events = events.filter(event => event.severity === severity);
        }

        return events.slice(-count);
    }

    /**
     * Get security statistics
     * @returns {object} Security statistics
     */
    getSecurityStats() {
        const events = this.securityEvents || [];
        const now = Date.now();
        const lastHour = now - (60 * 60 * 1000);

        const recentEvents = events.filter(event => event.timestamp > lastHour);

        const stats = {
            totalEvents: events.length,
            recentEvents: recentEvents.length,
            highSeverityEvents: recentEvents.filter(e => e.severity === 'high').length,
            mediumSeverityEvents: recentEvents.filter(e => e.severity === 'medium').length,
            lowSeverityEvents: recentEvents.filter(e => e.severity === 'low').length,
            eventsPerHour: recentEvents.length,
            activeRateLimits: this.suspiciousActivity.size,
            activeCooldowns: this.commandCooldowns.size
        };

        return stats;
    }

    /**
     * Clear security data (admin only)
     * @param {Player} admin - Admin requesting the clear
     * @returns {boolean} True if cleared successfully
     */
    clearSecurityData(admin) {
        if (!this.hasPermission(admin, this.permissionLevels.OWNER)) {
            this.logSecurityEvent('unauthorized_security_clear', admin);
            return false;
        }

        this.suspiciousActivity.clear();
        this.commandCooldowns.clear();
        this.securityEvents = [];

        this.logSecurityEvent('security_data_cleared', admin);
        return true;
    }
}

// Export singleton instance
export const securityService = new SecurityService();
