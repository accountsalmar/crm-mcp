/**
 * Timezone conversion utilities for Odoo CRM MCP Server.
 *
 * Odoo stores all datetime fields in UTC, but users provide dates in Sydney local time.
 * This module converts user-supplied dates from Sydney time (Australia/Sydney) to UTC
 * before constructing Odoo API queries.
 *
 * Sydney timezone:
 * - AEDT (Australian Eastern Daylight Time): UTC+11 (October to April)
 * - AEST (Australian Eastern Standard Time): UTC+10 (April to October)
 *
 * The conversion handles daylight saving time automatically.
 */
/** Sydney timezone identifier */
export declare const TIMEZONE = "Australia/Sydney";
/**
 * Convert a date string from Sydney time to UTC.
 *
 * This function takes a date in YYYY-MM-DD format (representing Sydney local time)
 * and converts it to a UTC datetime string that Odoo can use for filtering.
 *
 * @param dateStr - Date in YYYY-MM-DD format (Sydney local time)
 * @param endOfDay - If true, use 23:59:59 (end of day), otherwise use 00:00:00 (start of day)
 * @returns UTC datetime string in format "YYYY-MM-DD HH:MM:SS"
 *
 * @example
 * // Start of day (for date_from filters)
 * convertDateToUtc("2025-01-01", false)
 * // Returns: "2024-12-31 13:00:00" (Sydney midnight = UTC 13:00 previous day during AEDT)
 *
 * @example
 * // End of day (for date_to filters)
 * convertDateToUtc("2025-01-01", true)
 * // Returns: "2025-01-01 12:59:59" (Sydney 23:59:59 = UTC 12:59:59 same day during AEDT)
 */
export declare function convertDateToUtc(dateStr: string, endOfDay?: boolean): string;
/**
 * Get the current date in Sydney timezone as a YYYY-MM-DD string.
 * Useful for calculating relative dates (e.g., "90 days ago").
 *
 * @returns Current date in Sydney timezone in YYYY-MM-DD format
 */
export declare function getSydneyDateToday(): string;
/**
 * Get a date N days ago from today in Sydney timezone.
 * The result is already converted to UTC for use in Odoo queries.
 *
 * @param daysAgo - Number of days to subtract from today
 * @param endOfDay - If true, use end of day time, otherwise start of day
 * @returns UTC datetime string in format "YYYY-MM-DD HH:MM:SS"
 */
export declare function getDaysAgoUtc(daysAgo: number, endOfDay?: boolean): string;
//# sourceMappingURL=timezone.d.ts.map