/**
 * Odoo URL utilities for generating clickable links
 */
const ODOO_BASE_URL = 'https://duracubeonline.com.au/web?debug=1#';
/**
 * Generate Odoo form view URL for a record
 */
export function getOdooUrl(id, model) {
    if (model === 'crm.lead') {
        return `${ODOO_BASE_URL}id=${id}&cids=1&menu_id=241&action=400&model=crm.lead&view_type=form`;
    }
    if (model === 'res.partner') {
        return `${ODOO_BASE_URL}id=${id}&cids=1&menu_id=241&model=res.partner&view_type=form`;
    }
    return '';
}
/**
 * Format a name as a markdown link to Odoo
 * Falls back to plain name if id is missing/invalid
 */
export function formatLinkedName(id, name, model) {
    // Safety: return plain name if id is missing or invalid
    if (!id || typeof id !== 'number') {
        return name;
    }
    const url = getOdooUrl(id, model);
    return `[${name}](${url})`;
}
//# sourceMappingURL=odoo-urls.js.map