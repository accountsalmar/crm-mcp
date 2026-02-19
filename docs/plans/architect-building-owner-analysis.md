# Architect & Building Owner Analysis Integration

## Overview
Add `architect_id` and `x_studio_building_owener` (Many2one fields) as first-class dimensions across all existing MCP tools. This enables filtering and grouping opportunities by architect and building owner without adding any new tools.

**Odoo field names:**
- `architect_id` — Many2one (returns `[id, "Name"]`)
- `x_studio_building_owener` — Many2one (returns `[id, "Name"]`) — note: "owener" is the actual Odoo field spelling

## Stages

### Stage 1: Field Selections & Type Definitions
**Goal:** Make the server fetch architect/building owner data from Odoo and define TypeScript types for it
**Estimated effort:** Simple

**Tasks:**
- [ ] `src/constants.ts` — Add `'architect_id', 'x_studio_building_owener'` to all 7 field selection arrays: `LEAD_LIST`, `LEAD_LIST_EXTENDED`, `LEAD_DETAIL`, `LOST_OPPORTUNITY_LIST`, `LOST_OPPORTUNITY_DETAIL`, `WON_OPPORTUNITY_LIST`, `WON_OPPORTUNITY_DETAIL`
- [ ] `src/types.ts` — Add `architect_id?: [number, string]` and `x_studio_building_owener?: [number, string]` to the `CrmLead` interface
- [ ] `src/types.ts` — Add `by_architect` and `by_building_owner` arrays to `LostAnalysisSummary` (same shape as `by_specification` with `lost_revenue`)
- [ ] `src/types.ts` — Add `by_architect` and `by_building_owner` arrays to `WonAnalysisSummary` (same shape with `won_revenue`)

**Tests (Claude Code - stdio):**
- [ ] `npm run build` — must compile with zero errors
- [ ] Grep for `architect_id` in `dist/constants.js` to confirm it's in compiled output

**Tests (claude.ai - HTTP):**
- [ ] N/A — no runtime behavior changes yet

**Success Criteria:**
- TypeScript compiles cleanly
- All 7 field arrays include both new fields
- Both analysis summary interfaces have the new `by_` arrays

---

### Stage 2: Schemas (Filters & group_by)
**Goal:** Expose architect/building owner as filter parameters and group_by options in the Zod validation schemas
**Estimated effort:** Simple

**Tasks:**
- [ ] `src/schemas/index.ts` — Add `architect_id` (z.number().int().positive().optional()) and `building_owner_id` (z.number().int().positive().optional()) filter params to `LeadSearchSchema`
- [ ] `src/schemas/index.ts` — Add same two filter params to `LostOpportunitiesSearchSchema`
- [ ] `src/schemas/index.ts` — Add same two filter params to `WonOpportunitiesSearchSchema`
- [ ] `src/schemas/index.ts` — Add same two filter params to `LostAnalysisSchema`
- [ ] `src/schemas/index.ts` — Add same two filter params to `WonAnalysisSchema`
- [ ] `src/schemas/index.ts` — Add `'architect'` and `'building_owner'` to the `group_by` enum in `LostAnalysisSchema` (line ~381)
- [ ] `src/schemas/index.ts` — Add `'architect'` and `'building_owner'` to the `group_by` enum in `WonAnalysisSchema` (line ~580)
- [ ] Update the `.describe()` strings on both `group_by` fields to list the new options

**Tests (Claude Code - stdio):**
- [ ] `npm run build` — zero errors
- [ ] Grep compiled output for `architect` and `building_owner` in schema definitions

**Tests (claude.ai - HTTP):**
- [ ] N/A — no runtime behavior yet

**Success Criteria:**
- Both group_by enums accept `'architect'` and `'building_owner'`
- 5 schemas accept `architect_id` and `building_owner_id` as optional filter params

---

### Stage 3: Tool Logic (Filters + group_by)
**Goal:** Wire up the actual Odoo API calls for filtering and grouping by architect/building owner
**Estimated effort:** Medium

**Tasks:**
- [ ] `src/tools/crm-tools.ts` — In `search_leads` handler: add domain filter `['architect_id', '=', params.architect_id]` when provided, and `['x_studio_building_owener', '=', params.building_owner_id]` when provided
- [ ] `src/tools/crm-tools.ts` — In `search_lost_opportunities` handler: add same two domain filters
- [ ] `src/tools/crm-tools.ts` — In `search_won_opportunities` handler: add same two domain filters
- [ ] `src/tools/crm-tools.ts` — In `get_lost_analysis` handler: add same two domain filters for the analysis query
- [ ] `src/tools/crm-tools.ts` — In `get_lost_analysis` handler: add `group_by === 'architect'` block using `readGroup` on `architect_id` (follow `specification_id` Many2one pattern)
- [ ] `src/tools/crm-tools.ts` — In `get_lost_analysis` handler: add `group_by === 'building_owner'` block using `readGroup` on `x_studio_building_owener`
- [ ] `src/tools/crm-tools.ts` — In `get_won_analysis` handler: add same two domain filters
- [ ] `src/tools/crm-tools.ts` — In `get_won_analysis` handler: add `group_by === 'architect'` block (same pattern, `won_revenue`)
- [ ] `src/tools/crm-tools.ts` — In `get_won_analysis` handler: add `group_by === 'building_owner'` block

**Tests (Claude Code - stdio):**
- [ ] `npm run build` — zero errors
- [ ] Call `odoo_crm_search_leads` with `architect_id=<valid_id>` — should return filtered results
- [ ] Call `odoo_crm_get_lost_analysis` with `group_by='architect'` — should return breakdown by architect
- [ ] Call `odoo_crm_get_won_analysis` with `group_by='building_owner'` — should return breakdown by building owner
- [ ] Call `odoo_crm_search_won_opportunities` with `building_owner_id=<valid_id>` — should return filtered results

**Tests (claude.ai - HTTP):**
- [ ] Set `TRANSPORT=http`, start server, test same queries via browser-based Claude
- [ ] Verify JSON and Markdown responses both render correctly

**Success Criteria:**
- All 3 search tools filter correctly by architect_id and building_owner_id
- Both analysis tools group by architect and building_owner correctly
- Odoo `readGroup` returns proper Many2one `[id, name]` pairs

---

### Stage 4: Formatters (Display)
**Goal:** Show architect and building owner in all output formats
**Estimated effort:** Simple

**Tasks:**
- [ ] `src/services/formatters.ts` — In `formatLeadDetail`: add under Classification section:
  ```
  - **Architect:** ${getRelationName(lead.architect_id)}
  - **Building Owner:** ${getRelationName(lead.x_studio_building_owener)}
  ```
- [ ] `src/services/formatters.ts` — In `formatLostAnalysis`: add `by_architect` table (header: `| Architect | Count | % of Total | Lost Revenue | Avg Deal |`)
- [ ] `src/services/formatters.ts` — In `formatLostAnalysis`: add `by_building_owner` table (header: `| Building Owner | Count | % of Total | Lost Revenue | Avg Deal |`)
- [ ] `src/services/formatters.ts` — In `formatWonAnalysis`: add `by_architect` table (with `Won Revenue`)
- [ ] `src/services/formatters.ts` — In `formatWonAnalysis`: add `by_building_owner` table (with `Won Revenue`)
- [ ] `src/services/formatters.ts` — In `formatLeadListItem` / `formatLeadListItemExtended`: show architect and building owner when present

**Tests (Claude Code - stdio):**
- [ ] `npm run build` — zero errors
- [ ] Call `odoo_crm_get_lead_detail` with `lead_id=<id>` — verify Architect and Building Owner appear in output
- [ ] Call `odoo_crm_get_lost_analysis` with `group_by='architect'` — verify Markdown table renders correctly
- [ ] Call `odoo_crm_get_won_analysis` with `group_by='building_owner', response_format='json'` — verify JSON output has `by_building_owner` array
- [ ] Call `odoo_crm_search_leads` — verify architect/building owner appear in list items

**Tests (claude.ai - HTTP):**
- [ ] Repeat lead detail and analysis calls in browser-based Claude
- [ ] Confirm Markdown tables render properly in the chat interface

**Success Criteria:**
- Lead detail shows both fields under Classification
- Lost/Won analysis Markdown tables display correctly for architect and building_owner group_by
- JSON output includes properly structured arrays
- List items show architect/building owner when present

---

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `src/constants.ts` | Add fields to 7 field selection arrays |
| `src/types.ts` | Add fields to `CrmLead`, add `by_architect`/`by_building_owner` to both analysis summaries |
| `src/schemas/index.ts` | Add filter params to 5 schemas, add group_by options to 2 schemas |
| `src/tools/crm-tools.ts` | Add domain filters in 5 tool handlers, add 4 readGroup blocks |
| `src/services/formatters.ts` | Add display in lead detail, 4 analysis table sections, list items |

## Dependencies
- Working Odoo instance with `architect_id` and `x_studio_building_owener` fields on `crm.lead`
- Valid `.env` credentials

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| `x_studio_building_owener` field name is misspelled in Odoo | Use the exact Odoo field name as-is — expose as `building_owner_id` in the schema for clean UX |
| Fields don't exist on older Odoo records | `readGroup` handles null/false Many2one gracefully — map to "Not Specified" |
| `readGroup` may not work on Studio custom fields | Test early in Stage 3; fallback to `searchRead` + manual aggregation if needed |

## Notes
- The user-facing parameter is `building_owner_id` (clean name), but internally the code maps to Odoo's `x_studio_building_owener` field
- Both fields follow the exact same Many2one pattern as `specification_id` and `lead_source_id` already in the codebase
- No new tools are created — this extends 5 existing tools with 2 new dimensions each
