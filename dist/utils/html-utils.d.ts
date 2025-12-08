/**
 * HTML and text utilities for Odoo data processing
 */
/**
 * Strip HTML tags and decode entities from Odoo text fields
 * Odoo often stores rich text with HTML formatting
 */
export declare function stripHtml(html: string | null | undefined): string;
/**
 * Get best available contact name from Odoo record
 * Falls back through: contact_name → partner_id name → email username → Unknown
 * Note: Odoo can return `false` for empty fields, so we use `unknown` type
 */
export declare function getContactName(record: {
    contact_name?: unknown;
    partner_id?: unknown;
    email_from?: unknown;
}): string;
//# sourceMappingURL=html-utils.d.ts.map