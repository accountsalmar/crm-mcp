/**
 * Timeout utility for wrapping Promises with a maximum execution time.
 * Prevents API calls from hanging indefinitely.
 */
export declare class TimeoutError extends Error {
    constructor(message: string);
}
/**
 * Wraps a Promise with a timeout. If the Promise doesn't resolve or reject
 * within the specified time, it will be rejected with a TimeoutError.
 */
export declare function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T>;
/**
 * Default timeout values in milliseconds
 */
export declare const TIMEOUTS: {
    readonly AUTH: 30000;
    readonly API: 30000;
    readonly LARGE_OPERATION: 60000;
    readonly HEALTH_CHECK: 5000;
};
//# sourceMappingURL=timeout.d.ts.map