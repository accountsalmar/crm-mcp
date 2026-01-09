/**
 * Color extraction utilities for CRM description/notes analysis
 *
 * Extracts color information from free-text description fields
 * and normalizes to standard color categories for trend analysis.
 */
import { COLOR_TAXONOMY, COLOR_PATTERNS } from '../constants.js';
import { stripHtml } from './html-utils.js';
/**
 * Normalize a raw color string to its standard category.
 *
 * @param rawColor - The extracted color text (e.g., "navy blue")
 * @returns The normalized category (e.g., "Blue") or "Other" if not found
 *
 * @example
 * normalizeColor("navy blue")  // Returns "Blue"
 * normalizeColor("charcoal")   // Returns "Grey"
 * normalizeColor("unknown")    // Returns "Other"
 */
export function normalizeColor(rawColor) {
    const normalized = rawColor.toLowerCase().trim();
    // Check each category for exact or partial matches
    for (const [category, variants] of Object.entries(COLOR_TAXONOMY)) {
        // Skip "Other" category (it's a catch-all)
        if (category === 'Other')
            continue;
        // Check for exact match first
        if (variants.includes(normalized)) {
            return category;
        }
        // Check if any variant is contained in the raw color
        // e.g., "dark navy blue" contains "navy blue"
        for (const variant of variants) {
            if (normalized.includes(variant) || variant.includes(normalized)) {
                return category;
            }
        }
    }
    return 'Other';
}
/**
 * Extract color from description text.
 *
 * Uses two strategies:
 * 1. EXPLICIT patterns: "color: navy blue", "paint colour: white"
 * 2. CONTEXTUAL patterns: standalone color words
 *
 * @param description - The description/notes text (may contain HTML)
 * @returns ColorExtraction with raw_color, category, and source
 *
 * @example
 * extractColorFromDescription("<p>Customer wants navy blue panels</p>")
 * // Returns: { raw_color: "navy", color_category: "Blue", extraction_source: "contextual" }
 *
 * extractColorFromDescription("Color: White finish requested")
 * // Returns: { raw_color: "white", color_category: "White", extraction_source: "explicit" }
 */
export function extractColorFromDescription(description) {
    // Handle null/undefined/empty
    if (!description) {
        return { raw_color: null, color_category: 'Unknown', extraction_source: 'none' };
    }
    // Strip HTML tags and decode entities
    const cleanText = stripHtml(description);
    // Skip if too short (likely just noise)
    if (cleanText.length < 3) {
        return { raw_color: null, color_category: 'Unknown', extraction_source: 'none' };
    }
    // Try explicit patterns first (more reliable)
    // Reset regex lastIndex for reuse
    const explicitRegex = new RegExp(COLOR_PATTERNS.EXPLICIT.source, COLOR_PATTERNS.EXPLICIT.flags);
    const explicitMatch = explicitRegex.exec(cleanText);
    if (explicitMatch && explicitMatch[1]) {
        const rawColor = explicitMatch[1].trim().toLowerCase();
        // Validate it's actually a color (not just any word after "color:")
        const category = normalizeColor(rawColor);
        if (category !== 'Other' || rawColor.length <= 20) {
            return {
                raw_color: rawColor,
                color_category: category,
                extraction_source: 'explicit'
            };
        }
    }
    // Fall back to contextual patterns (standalone color words)
    const contextualRegex = new RegExp(COLOR_PATTERNS.CONTEXTUAL.source, COLOR_PATTERNS.CONTEXTUAL.flags);
    const contextualMatches = cleanText.match(contextualRegex);
    if (contextualMatches && contextualMatches.length > 0) {
        // Take the first match (most prominent in text)
        const rawColor = contextualMatches[0].toLowerCase();
        return {
            raw_color: rawColor,
            color_category: normalizeColor(rawColor),
            extraction_source: 'contextual'
        };
    }
    // No color found
    return { raw_color: null, color_category: 'Unknown', extraction_source: 'none' };
}
/**
 * Extract all colors mentioned in description (not just the first).
 * Useful for detailed analysis when multiple colors are mentioned.
 *
 * @param description - The description text
 * @returns Array of all colors found (may have duplicates if same color mentioned multiple times)
 */
export function extractAllColors(description) {
    if (!description) {
        return [];
    }
    const cleanText = stripHtml(description);
    const results = [];
    const seenColors = new Set();
    // Try explicit patterns
    const explicitRegex = new RegExp(COLOR_PATTERNS.EXPLICIT.source, COLOR_PATTERNS.EXPLICIT.flags);
    let match;
    while ((match = explicitRegex.exec(cleanText)) !== null) {
        if (match[1]) {
            const rawColor = match[1].trim().toLowerCase();
            if (!seenColors.has(rawColor)) {
                seenColors.add(rawColor);
                results.push({
                    raw_color: rawColor,
                    color_category: normalizeColor(rawColor),
                    extraction_source: 'explicit'
                });
            }
        }
    }
    // Try contextual patterns
    const contextualRegex = new RegExp(COLOR_PATTERNS.CONTEXTUAL.source, COLOR_PATTERNS.CONTEXTUAL.flags);
    while ((match = contextualRegex.exec(cleanText)) !== null) {
        const rawColor = match[0].toLowerCase();
        if (!seenColors.has(rawColor)) {
            seenColors.add(rawColor);
            results.push({
                raw_color: rawColor,
                color_category: normalizeColor(rawColor),
                extraction_source: 'contextual'
            });
        }
    }
    return results;
}
/**
 * Batch extract colors from multiple records.
 * More efficient than calling extractColorFromDescription in a loop.
 *
 * @param records - Array of objects with id and description
 * @returns Map of record ID to ColorExtraction
 */
export function batchExtractColors(records) {
    const results = new Map();
    for (const record of records) {
        results.set(record.id, extractColorFromDescription(record.description));
    }
    return results;
}
/**
 * Get color statistics from extracted colors.
 * Useful for debugging and validation.
 */
export function getColorStats(extractions) {
    const byCategory = {};
    const bySource = { explicit: 0, contextual: 0, none: 0 };
    let withColor = 0;
    for (const ext of extractions) {
        // Count by category
        byCategory[ext.color_category] = (byCategory[ext.color_category] || 0) + 1;
        // Count by source
        bySource[ext.extraction_source]++;
        // Count with color
        if (ext.color_category !== 'Unknown') {
            withColor++;
        }
    }
    return {
        total: extractions.length,
        with_color: withColor,
        without_color: extractions.length - withColor,
        detection_rate: extractions.length > 0 ? (withColor / extractions.length) * 100 : 0,
        by_category: byCategory,
        by_source: bySource
    };
}
//# sourceMappingURL=color-extractor.js.map