/**
 * HTML and text utilities for Odoo data processing
 */
/**
 * Strip HTML tags and decode entities from Odoo text fields
 * Odoo often stores rich text with HTML formatting
 */
export function stripHtml(html) {
    if (!html)
        return '';
    // Remove HTML tags
    let text = String(html).replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
    // Clean up whitespace (multiple spaces, newlines, tabs)
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}
/**
 * Get best available contact name from Odoo record
 * Falls back through: contact_name → partner_id name → email username → Unknown
 * Note: Odoo can return `false` for empty fields, so we use `unknown` type
 */
export function getContactName(record) {
    // Try contact_name first (Odoo returns false for empty fields)
    if (record.contact_name && typeof record.contact_name === 'string') {
        return record.contact_name;
    }
    // Try partner_id (Odoo returns [id, name] array for Many2one fields)
    if (record.partner_id && Array.isArray(record.partner_id) && record.partner_id[1]) {
        return String(record.partner_id[1]);
    }
    // Try to extract name from email address
    if (record.email_from && typeof record.email_from === 'string') {
        const emailName = record.email_from.split('@')[0];
        // Convert formats like john.doe, john_doe, john-doe to "John Doe"
        return emailName
            .replace(/[._-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }
    return 'Unknown';
}
//# sourceMappingURL=html-utils.js.map