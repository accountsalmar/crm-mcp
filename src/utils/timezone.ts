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
export const TIMEZONE = "Australia/Sydney";

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
export function convertDateToUtc(dateStr: string, endOfDay: boolean = false): string {
  // Parse the input date string (YYYY-MM-DD)
  const [year, month, day] = dateStr.split('-').map(Number);

  // Set the time component based on whether we want start or end of day
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;

  // Create a date object representing the Sydney local time
  // We use a specific approach that works reliably across Node.js versions:
  // 1. Create the datetime string in ISO format
  // 2. Use Intl.DateTimeFormat to interpret it in Sydney timezone
  // 3. Convert to UTC

  // Format: "YYYY-MM-DDTHH:MM:SS" (local time string)
  const localDateTimeStr = `${dateStr}T${pad(hour)}:${pad(minute)}:${pad(second)}`;

  // Parse as a local date first
  const localDate = new Date(localDateTimeStr);

  // Get the Sydney timezone offset for this specific date/time
  // This correctly handles daylight saving time transitions
  const sydneyFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Create a Date object that represents the exact moment in Sydney time
  // by parsing the components and adjusting for timezone
  const sydneyDate = createDateInTimezone(year, month - 1, day, hour, minute, second, TIMEZONE);

  // Format the UTC datetime string for Odoo (YYYY-MM-DD HH:MM:SS)
  const utcYear = sydneyDate.getUTCFullYear();
  const utcMonth = pad(sydneyDate.getUTCMonth() + 1);
  const utcDay = pad(sydneyDate.getUTCDate());
  const utcHour = pad(sydneyDate.getUTCHours());
  const utcMinute = pad(sydneyDate.getUTCMinutes());
  const utcSecond = pad(sydneyDate.getUTCSeconds());

  return `${utcYear}-${utcMonth}-${utcDay} ${utcHour}:${utcMinute}:${utcSecond}`;
}

/**
 * Create a Date object representing a specific moment in a given timezone.
 *
 * This function correctly handles daylight saving time by using the
 * Intl API to determine the actual UTC offset for the given date/time
 * in the specified timezone.
 *
 * @param year - Full year (e.g., 2025)
 * @param month - Month (0-11, where 0 = January)
 * @param day - Day of month (1-31)
 * @param hour - Hour (0-23)
 * @param minute - Minute (0-59)
 * @param second - Second (0-59)
 * @param timezone - IANA timezone identifier (e.g., "Australia/Sydney")
 * @returns Date object representing the UTC equivalent of the given local time
 */
function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): Date {
  // Create a formatter that outputs in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  // Start with a guess: assume the local time is the same as UTC
  // This gives us a starting point to calculate the actual offset
  let guess = new Date(Date.UTC(year, month, day, hour, minute, second));

  // Parse the formatter output to get what time it shows in the target timezone
  const parts = formatter.formatToParts(guess);
  const getPart = (type: string): number => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };

  // Calculate the difference between what we want and what we got
  const guessYear = getPart('year');
  const guessMonth = getPart('month') - 1;
  const guessDay = getPart('day');
  const guessHour = getPart('hour');
  const guessMinute = getPart('minute');
  const guessSecond = getPart('second');

  // Create dates for comparison (using a common reference point)
  const wantedMs = Date.UTC(year, month, day, hour, minute, second);
  const gotMs = Date.UTC(guessYear, guessMonth, guessDay, guessHour, guessMinute, guessSecond);

  // The difference tells us the timezone offset
  const offsetMs = gotMs - wantedMs;

  // Adjust our guess by the offset to get the correct UTC time
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Pad a number with leading zero if needed.
 * @param num - Number to pad
 * @returns Two-digit string representation
 */
function pad(num: number): string {
  return num.toString().padStart(2, '0');
}

/**
 * Get the current date in Sydney timezone as a YYYY-MM-DD string.
 * Useful for calculating relative dates (e.g., "90 days ago").
 *
 * @returns Current date in Sydney timezone in YYYY-MM-DD format
 */
export function getSydneyDateToday(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Get a date N days ago from today in Sydney timezone.
 * The result is already converted to UTC for use in Odoo queries.
 *
 * @param daysAgo - Number of days to subtract from today
 * @param endOfDay - If true, use end of day time, otherwise start of day
 * @returns UTC datetime string in format "YYYY-MM-DD HH:MM:SS"
 */
export function getDaysAgoUtc(daysAgo: number, endOfDay: boolean = false): string {
  // Get current date in Sydney timezone
  const now = new Date();
  const sydneyNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  // Parse Sydney date and subtract days
  const [year, month, day] = sydneyNow.split('-').map(Number);
  const sydneyDate = new Date(year, month - 1, day);
  sydneyDate.setDate(sydneyDate.getDate() - daysAgo);

  // Format as YYYY-MM-DD and convert to UTC
  const resultDateStr = `${sydneyDate.getFullYear()}-${pad(sydneyDate.getMonth() + 1)}-${pad(sydneyDate.getDate())}`;
  return convertDateToUtc(resultDateStr, endOfDay);
}
