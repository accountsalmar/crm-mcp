/**
 * Timeout utility for wrapping Promises with a maximum execution time.
 * Prevents API calls from hanging indefinitely.
 */
export class TimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TimeoutError';
    }
}
/**
 * Wraps a Promise with a timeout. If the Promise doesn't resolve or reject
 * within the specified time, it will be rejected with a TimeoutError.
 */
export function withTimeout(promise, ms, message = 'Operation timed out') {
    const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new TimeoutError(`${message} (after ${ms}ms)`));
        }, ms);
        promise.finally(() => clearTimeout(timeoutId));
    });
    return Promise.race([promise, timeoutPromise]);
}
/**
 * Default timeout values in milliseconds
 */
export const TIMEOUTS = {
    AUTH: 30000,
    API: 30000,
    LARGE_OPERATION: 60000,
    HEALTH_CHECK: 5000,
    EXPORT_BATCH: 45000, // 45 seconds per export batch
};
//# sourceMappingURL=timeout.js.map