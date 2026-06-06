// @ts-nocheck
import { system } from "@minecraft/server";
import { PERFORMANCE } from "./constants";
import { debugLog } from "./mobstacker-core";

/**
 * Service class for monitoring and tracking performance metrics
 * Provides centralized performance monitoring with minimal overhead
 */
export class PerformanceMonitor {
    metrics: any;
    timingStack: Map<string, number>;
    alerts: any[];
    thresholds: any;

    constructor() {
        this.metrics = {
            stackingOperations: 0,
            entitySpawns: 0,
            entityRemovals: 0,
            averageProcessingTime: 0,
            lootDrops: 0,
            databaseReads: 0,
            databaseWrites: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0,
            lastReset: Date.now()
        };

        this.timingStack = new Map();
        this.alerts = [];
        this.thresholds = {
            maxProcessingTime: 50, // ms
            maxErrorsPerMinute: 10,
            maxMemoryUsage: PERFORMANCE.MAX_MAP_SIZE
        };

        // Start periodic monitoring
        this.startPeriodicMonitoring();
    }

    /**
     * Start timing for an operation
     * @param {string} operation - Operation name
     * @returns {string} Timer ID
     */
    startTiming(operation) {
        const timerId = `${operation}_${Date.now()}_${Math.random()}`;
        this.timingStack.set(timerId, Date.now());
        return timerId;
    }

    /**
     * End timing for an operation and record the duration
     * @param {string} timerId - Timer ID from startTiming
     * @param {string} operation - Operation name (fallback)
     * @returns {number} Duration in milliseconds
     */
    endTiming(timerId, operation = 'unknown') {
        const startTime = this.timingStack.get(timerId);
        if (!startTime) {
            debugLog(`PerformanceMonitor: Timer not found for ${timerId}`);
            return 0;
        }

        const duration = Date.now() - startTime;
        this.timingStack.delete(timerId);

        // Update metrics
        this.metrics.stackingOperations++;
        this.metrics.averageProcessingTime =
            (this.metrics.averageProcessingTime * (this.metrics.stackingOperations - 1) + duration) / this.metrics.stackingOperations;

        // Check thresholds
        if (duration > this.thresholds.maxProcessingTime) {
            this.addAlert(`High processing time for ${operation}: ${duration.toFixed(2)}ms`);
        }

        return duration;
    }

    /**
     * Record a performance event
     * @param {string} eventType - Type of event (e.g., 'entitySpawn', 'lootDrop')
     * @param {number} value - Value to record (optional)
     */
    recordEvent(eventType, value = 1) {
        if (this.metrics.hasOwnProperty(eventType)) {
            this.metrics[eventType] += value;
        } else {
            debugLog(`PerformanceMonitor: Unknown event type ${eventType}`);
        }
    }

    /**
     * Record a cache hit or miss
     * @param {boolean} isHit - True for cache hit, false for cache miss
     */
    recordCacheAccess(isHit) {
        if (isHit) {
            this.metrics.cacheHits++;
        } else {
            this.metrics.cacheMisses++;
        }
    }

    /**
     * Record a database operation
     * @param {string} operation - 'read' or 'write'
     * @param {string} table - Table name (optional)
     */
    recordDatabaseOperation(operation, table = 'unknown') {
        if (operation === 'read') {
            this.metrics.databaseReads++;
        } else if (operation === 'write') {
            this.metrics.databaseWrites++;
        }
    }

    /**
     * Record an error
     * @param {string} errorType - Type of error
     * @param {string} message - Error message
     */
    recordError(errorType, message) {
        this.metrics.errors++;
        this.addAlert(`${errorType}: ${message}`);

        // Check error threshold
        const errorsPerMinute = this.getErrorsPerMinute();
        if (errorsPerMinute > this.thresholds.maxErrorsPerMinute) {
            console.error(`PerformanceMonitor: High error rate detected: ${errorsPerMinute} errors/minute`);
        }
    }

    /**
     * Add a performance alert
     * @param {string} message - Alert message
     */
    addAlert(message) {
        const alert = {
            timestamp: Date.now(),
            message: message
        };
        this.alerts.push(alert);

        // Keep only recent alerts (last 100)
        if (this.alerts.length > 100) {
            this.alerts.shift();
        }

        debugLog(`Performance Alert: ${message}`);
    }

    /**
     * Get current performance statistics
     * @returns {object} Performance statistics
     */
    getStats() {
        const now = Date.now();
        const uptimeMinutes = (now - this.metrics.lastReset) / 60000;

        return {
            ...this.metrics,
            uptimeMinutes: uptimeMinutes,
            operationsPerMinute: this.metrics.stackingOperations / uptimeMinutes,
            errorsPerMinute: this.getErrorsPerMinute(),
            cacheHitRate: this.getCacheHitRate(),
            databaseOperationsPerMinute: (this.metrics.databaseReads + this.metrics.databaseWrites) / uptimeMinutes,
            recentAlerts: this.alerts.slice(-5) // Last 5 alerts
        };
    }

    /**
     * Get errors per minute
     * @returns {number} Errors per minute
     */
    getErrorsPerMinute() {
        const uptimeMinutes = (Date.now() - this.metrics.lastReset) / 60000;
        return uptimeMinutes > 0 ? this.metrics.errors / uptimeMinutes : 0;
    }

    /**
     * Get cache hit rate percentage
     * @returns {number} Cache hit rate (0-100)
     */
    getCacheHitRate() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        return total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;
    }

    /**
     * Reset all metrics
     */
    reset() {
        const now = Date.now();
        for (const key in this.metrics) {
            if (typeof this.metrics[key] === 'number') {
                this.metrics[key] = 0;
            }
        }
        this.metrics.lastReset = now;
        this.alerts = [];
        this.timingStack.clear();
    }

    /**
     * Start periodic performance monitoring
     */
    startPeriodicMonitoring() {
        // Log performance stats every 5 minutes
        system.runInterval(() => {
            const stats = this.getStats();

            if (stats.errors > 0 || stats.operationsPerMinute > 1000) {
                debugLog(`Performance Stats: ${JSON.stringify(stats, null, 2)}`);
            }

            // Auto-reset if uptime is too long (prevent memory issues)
            if (stats.uptimeMinutes > 60) { // 1 hour
                debugLog('PerformanceMonitor: Auto-resetting metrics after 1 hour');
                this.reset();
            }

            // Evict leaking/abandoned timers from timingStack
            const now = Date.now();
            for (const [timerId, startTime] of this.timingStack.entries()) {
                if (now - startTime > 30000) { // 30-second timeout threshold
                    this.timingStack.delete(timerId);
                    debugLog(`PerformanceMonitor: Cleared abandoned timer reference: ${timerId}`);
                }
            }
        }, 300 * 20); // Every 5 minutes
    }

    /**
     * Get performance health status
     * @returns {object} Health status
     */
    getHealthStatus() {
        const stats = this.getStats();
        const issues = [];

        if (stats.errorsPerMinute > this.thresholds.maxErrorsPerMinute) {
            issues.push('High error rate');
        }

        if (stats.cacheHitRate < 50) {
            issues.push('Low cache hit rate');
        }

        if (stats.averageProcessingTime > this.thresholds.maxProcessingTime) {
            issues.push('High processing time');
        }

        return {
            status: issues.length === 0 ? 'healthy' : issues.length < 3 ? 'warning' : 'critical',
            issues: issues,
            stats: stats
        };
    }

    /**
     * Get recent alerts
     * @param {number} count - Number of recent alerts to return
     * @returns {Array} Recent alerts
     */
    getRecentAlerts(count = 10) {
        return this.alerts.slice(-count);
    }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
