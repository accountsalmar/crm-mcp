# Dynamic Column Configuration Implementation Plan

**Document ID:** improvements19841
**Created:** 2024-12-11
**Project:** Odoo CRM MCP Server
**Status:** Ready for Implementation

---

## Executive Summary

This plan adds dynamic field selection to all CRM search tools, enabling users to request exactly the columns they need. The implementation is divided into **4 progressive stages**, each independently testable and easily reversible.

### Key Benefits
- **Flexibility:** Users can request specific fields instead of fixed presets
- **Token Efficiency:** CSV format uses ~29% fewer tokens for tabular data
- **Discoverability:** New tool lets users explore available fields
- **Performance:** Connection pool integration improves concurrent request handling

### Risk Mitigation
- Each stage is **self-contained** and **testable**
- **No breaking changes** - all new parameters are optional with backwards-compatible defaults
- **Easy rollback** - each stage can be reverted independently

---

## Current State (What Already Exists)

| Component | Status | Location |
|-----------|--------|----------|
| `fieldsGet()` method | ✅ Exists | `src/services/odoo-client.ts:223-233` |
| Connection pool | ✅ Exists | `src/services/odoo-pool.ts` |
| Field presets (CRM_FIELDS) | ✅ Exists | `src/constants.ts:43-148` |
| `fields` param in Export tool | ✅ Exists | `src/tools/crm-tools.ts:2978-3007` |
| ResponseFormat enum | ✅ Exists | `src/constants.ts:151-154` |
| Circuit breaker | ✅ Exists | `src/utils/circuit-breaker.ts` |
| Caching (Memory/Redis) | ✅ Exists | `src/utils/cache-*.ts` |

---

## Implementation Stages Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION ROADMAP                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  STAGE 1: Foundation                    STAGE 2: Discovery Tool         │
│  ───────────────────                    ─────────────────────          │
│  • Add CSV to ResponseFormat            • Add odoo_crm_list_fields     │
│  • Add FIELD_PRESETS map                • Test field discovery         │
│  • Add resolveFields() helper           • No impact on existing tools  │
│  • Add schema definitions               │                               │
│  • NO tool changes yet                  │                               │
│           │                                        │                    │
│           ▼                                        ▼                    │
│  ┌─────────────────┐                    ┌─────────────────┐            │
│  │  TEST STAGE 1   │                    │  TEST STAGE 2   │            │
│  │  Build succeeds │                    │  Tool works     │            │
│  └─────────────────┘                    └─────────────────┘            │
│           │                                        │                    │
│           └────────────────┬───────────────────────┘                    │
│                            ▼                                            │
│  STAGE 3: Dynamic Fields            STAGE 4: Pool & CSV                 │
│  ───────────────────────            ─────────────────────              │
│  • Update 6 search tools            • Connect tools to pool            │
│  • Add fields param to each         • Add CSV formatter                │
│  • Use resolveFields() helper       • Add CSV response support         │
│  • Test backwards compat            • Test concurrent requests         │
│           │                                        │                    │
│           ▼                                        ▼                    │
│  ┌─────────────────┐                    ┌─────────────────┐            │
│  │  TEST STAGE 3   │                    │  TEST STAGE 4   │            │
│  │  Old calls work │                    │  Pool metrics   │            │
│  │  New calls work │                    │  CSV output     │            │
│  └─────────────────┘                    └─────────────────┘            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# STAGE 1: Foundation (Infrastructure Only)

## Overview
Build the infrastructure WITHOUT changing any existing tools. This ensures the foundation is solid before making user-facing changes.

## Files to Modify

| File | Changes |
|------|---------|
| `src/constants.ts` | Add CSV enum, FIELD_PRESETS, resolveFields() |
| `src/schemas/index.ts` | Add FieldsParam, ListFieldsSchema |

## Step 1.1: Add CSV to ResponseFormat Enum

**File:** `src/constants.ts` (around line 151)

```typescript
// BEFORE:
export enum ResponseFormat {
  JSON = 'json',
  MARKDOWN = 'markdown'
}

// AFTER:
export enum ResponseFormat {
  JSON = 'json',
  MARKDOWN = 'markdown',
  CSV = 'csv'
}
```

## Step 1.2: Add Field Presets Map

**File:** `src/constants.ts` (add after CRM_FIELDS object, around line 149)

```typescript
/**
 * Named field presets for easy reference.
 * Users can specify preset names instead of listing individual fields.
 *
 * Usage in tools:
 *   fields: "basic"           -> Uses LEAD_LIST (14 fields)
 *   fields: "extended"        -> Uses LEAD_LIST_EXTENDED (21 fields)
 *   fields: ["name", "email"] -> Uses custom array
 */
export const FIELD_PRESETS: Record<string, Record<string, string[]>> = {
  // Lead/Opportunity presets
  lead: {
    basic: CRM_FIELDS.LEAD_LIST,
    extended: CRM_FIELDS.LEAD_LIST_EXTENDED,
    full: CRM_FIELDS.LEAD_DETAIL,
    pipeline: CRM_FIELDS.PIPELINE_SUMMARY,
  },
  // Contact presets
  contact: {
    basic: CRM_FIELDS.CONTACT_LIST,
    full: CRM_FIELDS.CONTACT_LIST,  // Same for now
  },
  // Activity presets
  activity: {
    basic: CRM_FIELDS.ACTIVITY,
    full: CRM_FIELDS.ACTIVITY_DETAIL,
  },
  // Lost opportunity presets
  lost: {
    basic: CRM_FIELDS.LOST_OPPORTUNITY_LIST,
    full: CRM_FIELDS.LOST_OPPORTUNITY_DETAIL,
  },
  // Won opportunity presets
  won: {
    basic: CRM_FIELDS.WON_OPPORTUNITY_LIST,
    full: CRM_FIELDS.WON_OPPORTUNITY_DETAIL,
  },
};

/**
 * Resolve a fields parameter to an actual array of field names.
 *
 * @param fieldsParam - Can be:
 *   - undefined: Returns default preset
 *   - string (preset name): Returns preset fields ("basic", "extended", "full")
 *   - string[]: Returns as-is (custom field list)
 * @param modelType - The type of model ("lead", "contact", "activity", "lost", "won")
 * @param defaultPreset - Which preset to use when fieldsParam is undefined
 * @returns Array of field names to fetch from Odoo
 *
 * @example
 * resolveFields(undefined, 'lead', 'basic')     // Returns CRM_FIELDS.LEAD_LIST
 * resolveFields('extended', 'lead', 'basic')    // Returns CRM_FIELDS.LEAD_LIST_EXTENDED
 * resolveFields(['name', 'email'], 'lead')      // Returns ['name', 'email']
 */
export function resolveFields(
  fieldsParam: string | string[] | undefined,
  modelType: 'lead' | 'contact' | 'activity' | 'lost' | 'won' = 'lead',
  defaultPreset: string = 'basic'
): string[] {
  // No parameter provided - use default
  if (fieldsParam === undefined || fieldsParam === null) {
    const presets = FIELD_PRESETS[modelType];
    return presets?.[defaultPreset] || CRM_FIELDS.LEAD_LIST;
  }

  // String provided - it's a preset name
  if (typeof fieldsParam === 'string') {
    const presets = FIELD_PRESETS[modelType];
    const preset = presets?.[fieldsParam];
    if (preset) {
      return preset;
    }
    // Unknown preset name - treat as single field name (edge case)
    console.error(`[resolveFields] Unknown preset "${fieldsParam}" for ${modelType}, using default`);
    return FIELD_PRESETS[modelType]?.[defaultPreset] || CRM_FIELDS.LEAD_LIST;
  }

  // Array provided - use as-is (custom fields)
  if (Array.isArray(fieldsParam)) {
    return fieldsParam;
  }

  // Fallback
  return FIELD_PRESETS[modelType]?.[defaultPreset] || CRM_FIELDS.LEAD_LIST;
}
```

## Step 1.3: Add Schema Definitions

**File:** `src/schemas/index.ts` (add after imports, around line 3)

```typescript
import { CRM_FIELDS } from '../constants.js';

/**
 * Field preset names that users can specify instead of listing individual fields.
 * These map to CRM_FIELDS definitions in constants.ts.
 */
export const FieldPresetEnum = z.enum(['basic', 'extended', 'full']);

/**
 * Flexible fields parameter schema.
 * Accepts either:
 *   - A preset name: "basic", "extended", "full"
 *   - A custom array: ["name", "email", "phone"]
 *
 * This allows users to choose between convenience (presets) and flexibility (custom).
 */
export const FieldsParam = z.union([
  FieldPresetEnum,
  z.array(z.string()).min(1).max(100)
]).optional()
  .describe(
    "Fields to return. Use preset name ('basic', 'extended', 'full') or array of field names. " +
    "Defaults to 'basic'. Use odoo_crm_list_fields tool to discover available fields."
  );

/**
 * Schema for the field discovery tool.
 * Lets users explore what fields are available on each Odoo model.
 */
export const ListFieldsSchema = z.object({
  model: z.enum(['crm.lead', 'res.partner', 'mail.activity', 'crm.stage', 'crm.lost.reason'])
    .default('crm.lead')
    .describe("Odoo model to inspect. Common models: 'crm.lead' (leads/opportunities), 'res.partner' (contacts)"),

  include_types: z.boolean()
    .default(false)
    .describe("Include field data types (string, integer, many2one, etc.) in output"),

  include_descriptions: z.boolean()
    .default(false)
    .describe("Include field descriptions/labels in output"),

  filter: z.enum(['all', 'basic', 'relational', 'required'])
    .default('all')
    .describe("Filter fields: 'all' (everything), 'basic' (non-relational), 'relational' (links to other models), 'required' (mandatory fields)"),

  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown', 'json', or 'csv'")
}).strict();

export type ListFieldsInput = z.infer<typeof ListFieldsSchema>;
```

## Step 1.4: Update Imports in schemas/index.ts

**File:** `src/schemas/index.ts` (line 2)

```typescript
// BEFORE:
import { CONTEXT_LIMITS, ResponseFormat } from '../constants.js';

// AFTER:
import { CONTEXT_LIMITS, ResponseFormat, CRM_FIELDS } from '../constants.js';
```

---

## Stage 1 Testing Checklist

Before moving to Stage 2, verify:

```bash
# 1. Build succeeds
npm run build

# 2. No TypeScript errors
npx tsc --noEmit

# 3. Server starts without errors
npm run dev
# (Check console for any import errors)
```

**Expected Result:** Build succeeds, no errors. Existing tools work exactly as before (we haven't changed them yet).

---

# STAGE 2: Discovery Tool

## Overview
Add the `odoo_crm_list_fields` tool so users can discover available fields BEFORE making search requests. This is a NEW tool - it doesn't affect any existing functionality.

## Files to Modify

| File | Changes |
|------|---------|
| `src/tools/crm-tools.ts` | Add list_fields tool |
| `src/services/formatters.ts` | Add formatFieldsList function |

## Step 2.1: Add Formatter Function

**File:** `src/services/formatters.ts` (add at end of file)

```typescript
/**
 * Format field list for display.
 * Used by odoo_crm_list_fields tool.
 */
export interface FieldInfo {
  name: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
}

export function formatFieldsList(
  model: string,
  fields: FieldInfo[],
  format: ResponseFormat,
  presets?: Record<string, string[]>
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({
      model,
      field_count: fields.length,
      fields,
      presets: presets ? Object.keys(presets) : undefined
    }, null, 2);
  }

  if (format === ResponseFormat.CSV) {
    const header = 'name,label,type,required';
    const rows = fields.map(f =>
      `${f.name},${f.label.replace(/,/g, ';')},${f.type},${f.required}`
    );
    return [header, ...rows].join('\n');
  }

  // Markdown format
  let output = `## Available Fields for \`${model}\`\n\n`;
  output += `**Total fields:** ${fields.length}\n\n`;

  // Show presets if available
  if (presets && Object.keys(presets).length > 0) {
    output += `### Field Presets\n`;
    output += `Use these names in the \`fields\` parameter:\n\n`;
    for (const [presetName, presetFields] of Object.entries(presets)) {
      output += `- **${presetName}**: ${presetFields.length} fields`;
      if (presetFields.length <= 5) {
        output += ` (${presetFields.join(', ')})`;
      } else {
        output += ` (${presetFields.slice(0, 4).join(', ')}, ...)`;
      }
      output += `\n`;
    }
    output += `\n`;
  }

  output += `### All Fields\n\n`;
  output += `| Field Name | Label | Type | Required |\n`;
  output += `|------------|-------|------|----------|\n`;

  for (const field of fields) {
    output += `| \`${field.name}\` | ${field.label} | ${field.type} | ${field.required ? 'Yes' : '-'} |\n`;
  }

  return output;
}
```

## Step 2.2: Add Discovery Tool

**File:** `src/tools/crm-tools.ts`

Add imports at the top:
```typescript
// Add to existing imports:
import {
  // ... existing imports ...
  ListFieldsSchema,
  type ListFieldsInput,
} from '../schemas/index.js';

import {
  // ... existing imports ...
  formatFieldsList,
  type FieldInfo,
} from '../services/formatters.js';

import { FIELD_PRESETS } from '../constants.js';
```

Add the tool (inside `registerCrmTools` function, recommend adding after the health check tool):

```typescript
  // ============================================
  // TOOL: List Available Fields (Discovery)
  // ============================================
  server.registerTool(
    'odoo_crm_list_fields',
    {
      title: 'List Available Fields',
      description: `Discover available fields (columns) for Odoo CRM models.

**Use this tool BEFORE making search requests** to see what fields you can request.

**Supported models:**
- \`crm.lead\`: Leads and opportunities (most common)
- \`res.partner\`: Contacts and companies
- \`mail.activity\`: Activities (calls, meetings, tasks)
- \`crm.stage\`: Pipeline stages
- \`crm.lost.reason\`: Lost reasons

**Field presets (for crm.lead):**
- \`basic\`: Essential fields only (fast, small response)
- \`extended\`: Includes address, source, tags
- \`full\`: All available fields

**Example usage:**
1. Call this tool: \`{ "model": "crm.lead" }\`
2. See available fields and presets
3. Use in search: \`odoo_crm_search_leads({ fields: "extended" })\`
   or: \`odoo_crm_search_leads({ fields: ["name", "email_from", "expected_revenue"] })\``,
      inputSchema: ListFieldsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListFieldsInput) => {
      try {
        const client = getOdooClient();

        // Get field metadata from Odoo
        const attributes = ['string', 'type', 'required', 'help'];
        if (params.include_descriptions) {
          attributes.push('help');
        }

        const fieldsInfo = await client.fieldsGet(params.model, attributes);

        // Process and filter fields
        const fieldList: FieldInfo[] = [];

        for (const [fieldName, metadata] of Object.entries(fieldsInfo)) {
          const meta = metadata as Record<string, unknown>;
          const fieldType = meta.type as string;
          const isRequired = meta.required as boolean || false;
          const isRelational = ['many2one', 'many2many', 'one2many'].includes(fieldType);

          // Apply filter
          switch (params.filter) {
            case 'basic':
              if (isRelational) continue;
              break;
            case 'relational':
              if (!isRelational) continue;
              break;
            case 'required':
              if (!isRequired) continue;
              break;
            // 'all' - no filtering
          }

          const fieldInfo: FieldInfo = {
            name: fieldName,
            label: (meta.string as string) || fieldName,
            type: fieldType,
            required: isRequired,
          };

          if (params.include_descriptions && meta.help) {
            fieldInfo.description = meta.help as string;
          }

          fieldList.push(fieldInfo);
        }

        // Sort alphabetically
        fieldList.sort((a, b) => a.name.localeCompare(b.name));

        // Get presets for this model type
        let presets: Record<string, string[]> | undefined;
        if (params.model === 'crm.lead') {
          presets = FIELD_PRESETS.lead;
        } else if (params.model === 'res.partner') {
          presets = FIELD_PRESETS.contact;
        } else if (params.model === 'mail.activity') {
          presets = FIELD_PRESETS.activity;
        }

        const output = formatFieldsList(
          params.model,
          fieldList,
          params.response_format,
          presets
        );

        return {
          content: [{ type: 'text', text: output }],
          structuredContent: {
            model: params.model,
            field_count: fieldList.length,
            fields: fieldList,
            presets: presets ? Object.keys(presets) : []
          }
        };

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          isError: true,
          content: [{ type: 'text', text: `Error listing fields: ${message}` }]
        };
      }
    }
  );
```

---

## Stage 2 Testing Checklist

Before moving to Stage 3, verify:

```bash
# 1. Build succeeds
npm run build

# 2. Start the server
npm run dev
```

**Test the new tool with these calls:**

```javascript
// Test 1: Basic usage (should list all crm.lead fields)
{ "model": "crm.lead" }

// Test 2: With types (should show field types)
{ "model": "crm.lead", "include_types": true }

// Test 3: Filter to basic fields only
{ "model": "crm.lead", "filter": "basic" }

// Test 4: Different model
{ "model": "res.partner" }

// Test 5: JSON format
{ "model": "crm.lead", "response_format": "json" }

// Test 6: CSV format
{ "model": "crm.lead", "response_format": "csv" }
```

**Expected Results:**
- All tests return field lists without errors
- Presets are shown for crm.lead
- Different formats work correctly
- Existing tools still work (no changes to them yet)

---

# STAGE 3: Dynamic Fields in Search Tools

## Overview
Update the 6 main search tools to accept the optional `fields` parameter. This is where users start seeing the benefit - they can now request specific fields.

## Files to Modify

| File | Changes |
|------|---------|
| `src/schemas/index.ts` | Add `fields` param to 6 schemas |
| `src/tools/crm-tools.ts` | Update 6 tool implementations |

## Step 3.1: Update Search Schemas

**File:** `src/schemas/index.ts`

### 3.1.1: Update LeadSearchSchema (around line 23)

```typescript
// Add before .strict():
export const LeadSearchSchema = PaginationSchema.extend({
  // ... existing params unchanged ...
  order_dir: z.enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort direction'),

  // ADD THIS NEW PARAMETER:
  fields: FieldsParam
}).strict();
```

### 3.1.2: Update LeadDetailSchema (around line 119)

```typescript
export const LeadDetailSchema = z.object({
  lead_id: z.number()
    .int()
    .positive()
    .describe('The ID of the lead/opportunity to retrieve'),

  // ADD THIS NEW PARAMETER:
  fields: FieldsParam,

  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();
```

### 3.1.3: Update ContactSearchSchema (around line 185)

```typescript
export const ContactSearchSchema = PaginationSchema.extend({
  // ... existing params unchanged ...
  city: z.string()
    .optional()
    .describe('Filter by city name (partial match)'),

  // ADD THIS NEW PARAMETER:
  fields: FieldsParam
}).strict();
```

### 3.1.4: Update LostOpportunitiesSearchSchema (around line 300)

```typescript
export const LostOpportunitiesSearchSchema = PaginationSchema.extend({
  // ... existing params unchanged ...
  order_dir: z.enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort direction'),

  // ADD THIS NEW PARAMETER:
  fields: FieldsParam
}).strict();
```

### 3.1.5: Update WonOpportunitiesSearchSchema (around line 410)

```typescript
export const WonOpportunitiesSearchSchema = PaginationSchema.extend({
  // ... existing params unchanged ...
  order_dir: z.enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort direction'),

  // ADD THIS NEW PARAMETER:
  fields: FieldsParam
}).strict();
```

### 3.1.6: Update ActivitySearchSchema (around line 605)

```typescript
export const ActivitySearchSchema = PaginationSchema.extend({
  // ... existing params unchanged ...
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Activity due date to (YYYY-MM-DD)'),

  // ADD THIS NEW PARAMETER:
  fields: FieldsParam
}).strict();
```

## Step 3.2: Update Tool Implementations

**File:** `src/tools/crm-tools.ts`

First, add the import:
```typescript
import { resolveFields, FIELD_PRESETS } from '../constants.js';
```

### 3.2.1: Update odoo_crm_search_leads (around line 226)

```typescript
// BEFORE:
const leads = await client.searchRead<CrmLead>(
  'crm.lead',
  domain,
  CRM_FIELDS.LEAD_LIST,
  {
    offset: params.offset,
    limit: params.limit,
    order: `${params.order_by} ${params.order_dir}`
  }
);

// AFTER:
const fields = resolveFields(params.fields, 'lead', 'basic');
const leads = await client.searchRead<CrmLead>(
  'crm.lead',
  domain,
  fields,
  {
    offset: params.offset,
    limit: params.limit,
    order: `${params.order_by} ${params.order_dir}`
  }
);
```

### 3.2.2: Update odoo_crm_get_lead_detail (around line 299)

```typescript
// BEFORE:
const leads = await client.read<CrmLead>(
  'crm.lead',
  [params.lead_id],
  CRM_FIELDS.LEAD_DETAIL
);

// AFTER:
const fields = resolveFields(params.fields, 'lead', 'full');
const leads = await client.read<CrmLead>(
  'crm.lead',
  [params.lead_id],
  fields
);
```

### 3.2.3: Update odoo_crm_search_contacts (find the implementation)

```typescript
// BEFORE:
const contacts = await client.searchRead<ResPartner>(
  'res.partner',
  domain,
  CRM_FIELDS.CONTACT_LIST,
  { ... }
);

// AFTER:
const fields = resolveFields(params.fields, 'contact', 'basic');
const contacts = await client.searchRead<ResPartner>(
  'res.partner',
  domain,
  fields,
  { ... }
);
```

### 3.2.4: Update odoo_crm_search_lost_opportunities

```typescript
// BEFORE:
const opportunities = await client.searchRead<LostOpportunity>(
  'crm.lead',
  domain,
  CRM_FIELDS.LOST_OPPORTUNITY_LIST,
  { ... }
);

// AFTER:
const fields = resolveFields(params.fields, 'lost', 'basic');
const opportunities = await client.searchRead<LostOpportunity>(
  'crm.lead',
  domain,
  fields,
  { ... }
);
```

### 3.2.5: Update odoo_crm_search_won_opportunities

```typescript
// BEFORE:
const opportunities = await client.searchRead<WonOpportunity>(
  'crm.lead',
  domain,
  CRM_FIELDS.WON_OPPORTUNITY_LIST,
  { ... }
);

// AFTER:
const fields = resolveFields(params.fields, 'won', 'basic');
const opportunities = await client.searchRead<WonOpportunity>(
  'crm.lead',
  domain,
  fields,
  { ... }
);
```

### 3.2.6: Update odoo_crm_search_activities

```typescript
// BEFORE:
const activities = await client.searchRead<ActivityDetail>(
  'mail.activity',
  domain,
  CRM_FIELDS.ACTIVITY,
  { ... }
);

// AFTER:
const fields = resolveFields(params.fields, 'activity', 'basic');
const activities = await client.searchRead<ActivityDetail>(
  'mail.activity',
  domain,
  fields,
  { ... }
);
```

---

## Stage 3 Testing Checklist

This is the most important testing stage. Verify both backwards compatibility AND new functionality.

### Backwards Compatibility Tests (MUST PASS)

```javascript
// These calls should work EXACTLY as before (no fields param):

// Test 1: Search leads without fields
odoo_crm_search_leads({ query: "test" })
// Expected: Returns leads with default fields (same as current)

// Test 2: Get lead detail without fields
odoo_crm_get_lead_detail({ lead_id: 1 })
// Expected: Returns full lead details (same as current)

// Test 3: Search contacts without fields
odoo_crm_search_contacts({ query: "john" })
// Expected: Returns contacts with default fields

// Test 4: Search lost without fields
odoo_crm_search_lost_opportunities({})
// Expected: Returns lost opportunities with default fields

// Test 5: Search won without fields
odoo_crm_search_won_opportunities({})
// Expected: Returns won opportunities with default fields
```

### New Functionality Tests

```javascript
// Test 6: Using preset name
odoo_crm_search_leads({ query: "test", fields: "extended" })
// Expected: Returns more fields (includes address, source, tags)

// Test 7: Using custom field array
odoo_crm_search_leads({ fields: ["name", "email_from", "expected_revenue"] })
// Expected: Returns ONLY the 3 specified fields

// Test 8: Using "full" preset
odoo_crm_get_lead_detail({ lead_id: 1, fields: "full" })
// Expected: Returns all available fields

// Test 9: Custom fields on contacts
odoo_crm_search_contacts({ fields: ["name", "email", "city"] })
// Expected: Returns only name, email, city
```

### Error Handling Tests

```javascript
// Test 10: Invalid preset name (should fall back to default)
odoo_crm_search_leads({ fields: "invalid_preset_name" })
// Expected: Returns with default fields, logs warning

// Test 11: Empty fields array (should be rejected by schema)
odoo_crm_search_leads({ fields: [] })
// Expected: Validation error (min 1 field required)
```

---

# STAGE 4: CSV Format & Pool Integration

## Overview
Final stage adds CSV response format and connects tools to the connection pool for better concurrent handling. This stage has the highest complexity but lowest user impact.

## Files to Modify

| File | Changes |
|------|---------|
| `src/services/formatters.ts` | Add CSV formatters |
| `src/tools/crm-tools.ts` | Add pool integration, CSV support |

## Step 4.1: Add Generic CSV Formatter

**File:** `src/services/formatters.ts` (add near formatFieldsList)

```typescript
/**
 * Format any array of records as CSV.
 * Handles special cases like relation fields [id, name] and arrays.
 *
 * @param records - Array of objects to format
 * @param fields - Optional field order (uses object keys if not specified)
 * @returns CSV string with header row
 */
export function formatRecordsAsCSV<T extends Record<string, unknown>>(
  records: T[],
  fields?: string[]
): string {
  if (records.length === 0) {
    return fields ? fields.join(',') : '';
  }

  // Determine columns
  const columns = fields || Object.keys(records[0]);

  // Helper to escape CSV values
  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) return '';

    // Handle Odoo relation fields: [id, name] -> name
    if (Array.isArray(value)) {
      if (value.length === 2 && typeof value[0] === 'number') {
        return escapeCSV(value[1]);  // Return the name part
      }
      return value.map(v => escapeCSV(v)).join(';');
    }

    // Handle dates
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Handle objects
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    // Convert to string
    const str = String(value);

    // Escape if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  };

  // Header row
  const header = columns.join(',');

  // Data rows
  const rows = records.map(record =>
    columns.map(col => escapeCSV(record[col])).join(',')
  );

  return [header, ...rows].join('\n');
}
```

## Step 4.2: Update formatLeadList to Support CSV

**File:** `src/services/formatters.ts`

Find `formatLeadList` function and update to handle CSV:

```typescript
export function formatLeadList(
  response: PaginatedResponse<CrmLead>,
  format: ResponseFormat
): string {
  // Add CSV handling at the start:
  if (format === ResponseFormat.CSV) {
    return formatRecordsAsCSV(response.items);
  }

  // ... rest of existing function unchanged ...
}
```

Apply same pattern to:
- `formatContactList`
- `formatLostOpportunitiesList`
- `formatWonOpportunitiesList`
- `formatActivityList`

## Step 4.3: Connect Tools to Connection Pool

**File:** `src/tools/crm-tools.ts`

Update imports:
```typescript
// Change this:
import { getOdooClient } from '../services/odoo-client.js';

// To this:
import { getOdooClient } from '../services/odoo-client.js';
import { useClient } from '../services/odoo-pool.js';
```

Update tool implementations (example for search_leads):

```typescript
// BEFORE:
async (params: LeadSearchInput) => {
  try {
    const client = getOdooClient();

    // Build domain...
    const domain: unknown[] = [];
    // ... domain building code ...

    const total = await client.searchCount('crm.lead', domain);
    const fields = resolveFields(params.fields, 'lead', 'basic');
    const leads = await client.searchRead<CrmLead>(...);

    // ... format and return ...

    return {
      content: [{ type: 'text', text: output }],
      structuredContent: response
    };
  } catch (error) {
    // ... error handling ...
  }
}

// AFTER:
async (params: LeadSearchInput) => {
  try {
    // Use pooled client - automatically acquired and released
    return await useClient(async (client) => {
      // Build domain...
      const domain: unknown[] = [];
      // ... domain building code (unchanged) ...

      const total = await client.searchCount('crm.lead', domain);
      const fields = resolveFields(params.fields, 'lead', 'basic');
      const leads = await client.searchRead<CrmLead>(...);

      // ... format and return (unchanged) ...

      return {
        content: [{ type: 'text', text: output }],
        structuredContent: response
      };
    });
  } catch (error) {
    // ... error handling (unchanged) ...
  }
}
```

**Apply this pattern to ALL tools in crm-tools.ts.**

---

## Stage 4 Testing Checklist

### CSV Format Tests

```javascript
// Test 1: Lead search with CSV format
odoo_crm_search_leads({ query: "test", response_format: "csv" })
// Expected: Returns CSV with header row and data rows

// Test 2: Contacts with CSV
odoo_crm_search_contacts({ response_format: "csv" })
// Expected: Returns CSV formatted contacts

// Test 3: Custom fields + CSV
odoo_crm_search_leads({ fields: ["name", "email_from"], response_format: "csv" })
// Expected: CSV with only name,email_from columns
```

### Pool Integration Tests

```javascript
// Test 4: Check pool metrics after several requests
odoo_crm_cache_status({ action: "status" })
// Look for pool metrics in the response

// Test 5: Concurrent requests (run multiple in parallel)
// Make 5+ simultaneous requests
// Expected: All succeed, pool handles concurrency

// Test 6: Normal operations still work
odoo_crm_search_leads({ query: "test" })
odoo_crm_get_pipeline_summary({})
odoo_crm_get_sales_analytics({})
// Expected: All work as before
```

### Pool Metrics Verification

Add a quick check in `odoo_crm_health_check` or `odoo_crm_cache_status` to show pool metrics:

```typescript
// In health check tool, add:
const poolMetrics = getPoolMetrics();
output += `\n### Connection Pool\n`;
output += `- Size: ${poolMetrics.size}\n`;
output += `- Available: ${poolMetrics.available}\n`;
output += `- Borrowed: ${poolMetrics.borrowed}\n`;
output += `- Pending: ${poolMetrics.pending}\n`;
```

---

## Complete File Change Summary

| Stage | File | Changes |
|-------|------|---------|
| 1 | `src/constants.ts` | Add CSV enum, FIELD_PRESETS, resolveFields() |
| 1 | `src/schemas/index.ts` | Add FieldsParam, FieldPresetEnum, ListFieldsSchema |
| 2 | `src/services/formatters.ts` | Add formatFieldsList() |
| 2 | `src/tools/crm-tools.ts` | Add odoo_crm_list_fields tool |
| 3 | `src/schemas/index.ts` | Add `fields` param to 6 schemas |
| 3 | `src/tools/crm-tools.ts` | Update 6 tools to use resolveFields() |
| 4 | `src/services/formatters.ts` | Add formatRecordsAsCSV(), update 5 formatters |
| 4 | `src/tools/crm-tools.ts` | Add useClient() wrapper to all tools |

---

## Rollback Procedures

### If Stage 1 Fails
```bash
git checkout src/constants.ts src/schemas/index.ts
npm run build
```

### If Stage 2 Fails
```bash
# Remove the tool registration from crm-tools.ts
# Remove formatFieldsList from formatters.ts
npm run build
```

### If Stage 3 Fails
```bash
# Revert schema changes
git checkout src/schemas/index.ts

# Revert tool changes (change fields back to CRM_FIELDS.*)
git checkout src/tools/crm-tools.ts

npm run build
```

### If Stage 4 Fails
```bash
# Revert to using getOdooClient() instead of useClient()
# Remove CSV format handling from formatters
git checkout src/tools/crm-tools.ts src/services/formatters.ts
npm run build
```

---

## Git Commit Strategy

```bash
# Stage 1
git add src/constants.ts src/schemas/index.ts
git commit -m "feat: Add field selection infrastructure (presets, resolveFields helper)"

# Stage 2
git add src/services/formatters.ts src/tools/crm-tools.ts
git commit -m "feat: Add odoo_crm_list_fields discovery tool"

# Stage 3
git add src/schemas/index.ts src/tools/crm-tools.ts
git commit -m "feat: Add dynamic fields parameter to 6 search tools"

# Stage 4
git add src/services/formatters.ts src/tools/crm-tools.ts
git commit -m "feat: Add CSV format support and connection pool integration"
```

---

## Summary

| Stage | Description | Risk | Effort | User Benefit |
|-------|-------------|------|--------|--------------|
| **1** | Infrastructure | Very Low | 30 min | None yet (foundation) |
| **2** | Discovery Tool | Low | 45 min | Can explore available fields |
| **3** | Dynamic Fields | Low | 1 hour | Can request specific columns |
| **4** | CSV + Pool | Medium | 1.5 hours | Better performance, fewer tokens |

**Total estimated effort:** 3-4 hours across all stages

**What's NOT included (by design):**
- PostgreSQL configuration storage
- Google Sheets integration
- Admin web UI
- Any breaking changes
