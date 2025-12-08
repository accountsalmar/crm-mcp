/**
 * Odoo URL utilities for generating clickable links
 */
/**
 * Generate Odoo form view URL for a record
 */
export declare function getOdooUrl(id: number, model: 'crm.lead' | 'res.partner'): string;
/**
 * Format a name as a markdown link to Odoo
 * Falls back to plain name if id is missing/invalid
 */
export declare function formatLinkedName(id: number | undefined, name: string, model: 'crm.lead' | 'res.partner'): string;
//# sourceMappingURL=odoo-urls.d.ts.map