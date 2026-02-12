# Color Analysis & RFQ Trends for Odoo CRM MCP

## Overview

Enhance the Odoo CRM MCP server to extract color information from opportunity notes (`description` field) and analyze RFQ trends using the `tender_rfq_date` field. This enables users to ask questions like:
- "What are the top colors in RFQs received in last 3 months?"
- "Show color trends over the last 12 months"
- "Find all blue RFQs from January"

**Architecture Decision:** MCP handles data extraction and aggregation; Claude handles supplier matching via web research.

---

## Stages

### Stage 1: Constants and Types
**Goal:** Add color taxonomy, field presets, and TypeScript interfaces
**Estimated effort:** Simple

**Tasks:**
- [ ] Add `RFQ_COLOR_FIELDS` array to `src/constants.ts` (includes `description`, `tender_rfq_date`)
- [ ] Add `COLOR_TAXONOMY` mapping (11 color categories + "Other")
- [ ] Add `COLOR_PATTERNS` regex patterns (explicit + contextual)
- [ ] Add `ColorExtraction` interface to `src/types.ts`
- [ ] Add `LeadWithColor` interface (extends CrmLead)
- [ ] Add `ColorTrendPeriod` interface
- [ ] Add `ColorTrendsSummary` interface
- [ ] Add `RfqSearchResult` interface

**Tests (Claude Code - stdio):**
- [ ] `npm run build` - No TypeScript errors
- [ ] Import test: `import { COLOR_TAXONOMY } from './constants.js'`

**Tests (claude.ai - HTTP):**
- [ ] N/A - No runtime testing needed for this stage

**Success Criteria:**
- Build passes with no errors
- All new types are exported correctly

---

### Stage 2: Color Extractor Utility
**Goal:** Create the core color extraction logic
**Estimated effort:** Medium

**Tasks:**
- [ ] Create `src/utils/color-extractor.ts`
- [ ] Implement `stripHtml()` integration (use existing utility)
- [ ] Implement `normalizeColor(rawColor)` - maps to category
- [ ] Implement `extractColorFromDescription(description)` - main extraction
- [ ] Implement `batchExtractColors(descriptions)` - bulk processing
- [ ] Handle edge cases: null, empty, no color found

**Tests (Claude Code - stdio):**
- [ ] `npm run build` - No errors
- [ ] Unit test: Extract "navy blue" from "Customer wants navy blue panels"
- [ ] Unit test: Extract "white" from "<p>Color: white finish</p>"
- [ ] Unit test: Return "Unknown" for "No color information here"
- [ ] Unit test: Normalize "navy blue" to "Blue" category

**Tests (claude.ai - HTTP):**
- [ ] N/A - Utility functions, no HTTP testing

**Success Criteria:**
- Extracts colors from plain text and HTML
- Normalizes variants to standard categories
- Returns consistent `ColorExtraction` structure

---

### Stage 3: Color Service with Caching
**Goal:** Create the color service layer with 5-minute caching
**Estimated effort:** Medium

**Tasks:**
- [ ] Create `src/services/color-service.ts`
- [ ] Implement `getLeadColor(leadId, description)` with cache check
- [ ] Implement `enrichLeadsWithColor(leads)` - batch enrichment
- [ ] Implement `aggregateByColor(leads)` - group by category
- [ ] Implement `buildColorTrendsSummary(leads, granularity, dateField)`
- [ ] Implement `getPeriodLabel(date, granularity)` helper
- [ ] Handle "Unknown" period for empty `tender_rfq_date`

**Tests (Claude Code - stdio):**
- [ ] `npm run build` - No errors
- [ ] Unit test: Cache hit returns same result
- [ ] Unit test: Aggregation groups correctly by color
- [ ] Unit test: Period labels format correctly ("Jan 2025", "2025-Q1")

**Tests (claude.ai - HTTP):**
- [ ] N/A - Service layer, no HTTP testing

**Success Criteria:**
- Caching prevents re-extraction for same lead
- Aggregation produces correct color counts
- Empty dates show as "Unknown" period

---

### Stage 4: Zod Schemas
**Goal:** Add input validation schemas for new tools
**Estimated effort:** Simple

**Tasks:**
- [ ] Add `ColorTrendsSchema` to `src/schemas/index.ts`
  - `date_from`, `date_to` (optional, defaults to 12 months)
  - `date_field` (tender_rfq_date, create_date, date_closed)
  - `granularity` (month, quarter)
  - Standard filters: user_id, team_id, state_id, min_revenue
- [ ] Add `RfqByColorSearchSchema`
  - `color_category` (enum of 12 categories)
  - `raw_color` (partial match string)
  - `include_no_color` (boolean)
  - Pagination + standard filters
- [ ] Export types: `ColorTrendsInput`, `RfqByColorSearchInput`

**Tests (Claude Code - stdio):**
- [ ] `npm run build` - No errors
- [ ] Zod parse test: Valid input passes
- [ ] Zod parse test: Invalid granularity fails

**Tests (claude.ai - HTTP):**
- [ ] N/A - Schema validation, no HTTP testing

**Success Criteria:**
- Schemas validate all expected input combinations
- Type exports work correctly

---

### Stage 5: Formatters
**Goal:** Add Markdown/JSON formatters for color data
**Estimated effort:** Simple

**Tasks:**
- [ ] Add `formatColorTrends(summary, format)` to `src/services/formatters.ts`
  - Markdown: Tables for distribution, period breakdown
  - JSON: Raw summary object
- [ ] Add `formatRfqByColorList(data, format)`
  - Markdown: List with color badges
  - JSON: Paginated response

**Tests (Claude Code - stdio):**
- [ ] `npm run build` - No errors
- [ ] Unit test: Markdown output contains expected headers
- [ ] Unit test: JSON output is valid JSON

**Tests (claude.ai - HTTP):**
- [ ] N/A - Formatter functions, no HTTP testing

**Success Criteria:**
- Markdown output is human-readable
- JSON output is machine-parseable

---

### Stage 6: Color Trends Tool
**Goal:** Register `odoo_crm_get_color_trends` MCP tool
**Estimated effort:** Medium

**Tasks:**
- [ ] Add tool registration in `src/tools/crm-tools.ts`
- [ ] Build Odoo domain with date and filter conditions
- [ ] Fetch opportunities with description field
- [ ] Enrich with color data using color service
- [ ] Build trend summary
- [ ] Return formatted output (Markdown/JSON)
- [ ] Handle errors gracefully

**Tests (Claude Code - stdio):**
- [ ] `npm run build` - No errors
- [ ] `npm start` - Server starts without errors
- [ ] Tool appears in MCP tool list

**Tests (claude.ai - HTTP):**
- [ ] Call `odoo_crm_get_color_trends` with default parameters
- [ ] Verify response includes `overall_summary` and `periods`
- [ ] Call with `granularity: "quarter"` - verify quarterly grouping
- [ ] Call with `date_from` filter - verify date filtering works
- [ ] Call with `response_format: "json"` - verify JSON output

**Success Criteria:**
- Tool returns color trend data for last 12 months
- Filters work correctly
- Both Markdown and JSON formats work

---

### Stage 7: RFQ Search Tool
**Goal:** Register `odoo_crm_search_rfq_by_color` MCP tool
**Estimated effort:** Medium

**Tasks:**
- [ ] Add tool registration in `src/tools/crm-tools.ts`
- [ ] Build Odoo domain (fetch more records than needed for client-side filtering)
- [ ] Enrich with color data
- [ ] Filter by color_category and/or raw_color
- [ ] Apply pagination to filtered results
- [ ] Return formatted output with color badges

**Tests (Claude Code - stdio):**
- [ ] `npm run build` - No errors
- [ ] Tool appears in MCP tool list

**Tests (claude.ai - HTTP):**
- [ ] Call with `color_category: "Blue"` - verify only blue RFQs returned
- [ ] Call with `raw_color: "navy"` - verify partial match works
- [ ] Call with `include_no_color: true` - verify unknown colors included
- [ ] Test pagination: offset=0, limit=5, then offset=5
- [ ] Verify color badge in output: `[Blue: navy blue]`

**Success Criteria:**
- Can filter RFQs by color category
- Can search by raw color text
- Pagination works correctly

---

### Stage 8: Integration Testing & Deployment
**Goal:** Full end-to-end testing and deployment to Railway
**Estimated effort:** Simple

**Tasks:**
- [ ] Test full workflow: trends → drill-down → details
- [ ] Test with real Odoo data (DuraCube UAT)
- [ ] Verify Railway environment variables are set
- [ ] Deploy to Railway
- [ ] Test on production endpoint

**Tests (Claude Code - stdio):**
- [ ] `npm run build && npm start` - Full startup check
- [ ] Verify no console errors

**Tests (claude.ai - HTTP):**
- [ ] "What colors are in RFQs received in last 3 months?"
- [ ] "What are the top colors trending up over 12 months?"
- [ ] "Show me all blue RFQs from January 2025"
- [ ] Verify Claude can interpret trends correctly

**Success Criteria:**
- All user example queries work
- No errors in Railway logs
- Response times under 10 seconds

---

## Dependencies

- Odoo CRM MCP server codebase (`odoo-crm-mcp-server`)
- Valid Odoo API credentials (already working)
- `tender_rfq_date` field exists in Odoo (confirmed)
- `description` field contains color information (assumption)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Low color detection rate | Log detection rate in summary; add more patterns over time |
| `tender_rfq_date` often empty | Show as "Unknown" period; don't exclude from analysis |
| Performance with large datasets | Limit to 5000 records; use caching |
| Client-side color filtering inefficient | Fetch 5x requested limit to account for filtering |
| Color taxonomy too limited | Start with 11 categories; expand based on actual data |

---

## Notes

- **No AI API calls** for color extraction - uses regex patterns for speed and cost
- **Hardcoded taxonomy** rather than dynamic - ensures consistent categorization
- **Separate tools** (trends vs. search) - follows existing pattern in codebase
- **Supplier matching** is out of scope - Claude handles via web research
- **Empty tender_rfq_date** records grouped under "Unknown" period
