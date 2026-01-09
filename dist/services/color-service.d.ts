/**
 * Color analysis service for CRM RFQ data
 *
 * Provides color extraction, caching, and aggregation for trend analysis.
 * Used by the color trends and RFQ search MCP tools.
 */
import type { ColorExtraction, CrmLead, LeadWithColor, ColorTrendsSummary } from '../types.js';
/**
 * Get color extraction for a lead with caching.
 * Cache prevents re-extraction during the same analysis session.
 *
 * @param leadId - The lead ID for cache key
 * @param description - The description text to extract from
 * @returns ColorExtraction result
 */
export declare function getLeadColor(leadId: number, description: string | null | undefined): ColorExtraction;
/**
 * Clear expired entries from the color cache.
 * Call periodically to prevent memory bloat.
 */
export declare function cleanupColorCache(): number;
/**
 * Get current cache statistics for monitoring.
 */
export declare function getColorCacheStats(): {
    size: number;
    ttl_ms: number;
};
/**
 * Enrich leads with color extraction data.
 * Adds a `color` property to each lead.
 *
 * @param leads - Array of CRM leads
 * @returns Array of leads with color data
 */
export declare function enrichLeadsWithColor(leads: CrmLead[]): LeadWithColor[];
/**
 * Group leads by color category.
 *
 * @param leads - Array of leads with color data
 * @returns Map of color category to leads
 */
export declare function aggregateByColor(leads: LeadWithColor[]): Map<string, LeadWithColor[]>;
/**
 * Get period label from a date string.
 *
 * @param dateStr - ISO date string or undefined
 * @param granularity - 'month' or 'quarter'
 * @returns Period label (e.g., "Jan 2025", "2025-Q1", or "Unknown")
 */
export declare function getPeriodLabel(dateStr: string | undefined | null, granularity: 'month' | 'quarter'): string;
/**
 * Build complete color trends summary from leads.
 *
 * @param leads - Array of leads with color data
 * @param granularity - 'month' or 'quarter'
 * @param dateField - Which date field to use for grouping
 * @returns Complete ColorTrendsSummary
 */
export declare function buildColorTrendsSummary(leads: LeadWithColor[], granularity: 'month' | 'quarter', dateField: string): ColorTrendsSummary;
/**
 * Filter leads by color category or raw color.
 *
 * @param leads - Array of leads with color data
 * @param options - Filter options
 * @returns Filtered leads
 */
export declare function filterLeadsByColor(leads: LeadWithColor[], options: {
    color_category?: string;
    raw_color?: string;
    include_no_color?: boolean;
}): LeadWithColor[];
//# sourceMappingURL=color-service.d.ts.map