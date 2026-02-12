# Webhook Integration Plan: Odoo CRM to Vector Database

**Document ID:** webhook_1984
**Created:** 2025-12-13
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Proposed Solution](#3-proposed-solution)
4. [Implementation Stages](#4-implementation-stages)
5. [Odoo Configuration Guide](#5-odoo-configuration-guide)
6. [Networking Setup](#6-networking-setup)
7. [Test Scenarios](#7-test-scenarios)
8. [Rollback Plan](#8-rollback-plan)
9. [Appendix](#9-appendix)

---

## 1. Executive Summary

### Problem Statement
Currently, the Odoo CRM MCP server requires **manual triggering** to sync CRM data to the Qdrant vector database. Users must explicitly call the `odoo_crm_sync_embeddings` tool to update vectors, which means:
- New opportunities are not searchable until manual sync
- Updated opportunities have stale data in semantic search
- Deleted opportunities remain in vector database

### Solution
Implement **webhook-based automatic sync** where:
- Odoo sends HTTP notifications when CRM records change
- MCP server receives these notifications and syncs only the affected record
- Real-time vector database updates with minimal API calls

### Key Benefits
| Benefit | Description |
|---------|-------------|
| **Real-time sync** | Changes appear in semantic search within seconds |
| **Efficient** | Only syncs the changed record, not entire dataset |
| **Low cost** | Minimal Voyage AI API calls (1 per change) |
| **No polling** | Event-driven, not scheduled polling |

---

## 2. Current State Analysis

### 2.1 Existing Sync Methods

| Method | Function | Trigger | Records Synced |
|--------|----------|---------|----------------|
| `sync_new` | `incrementalSync()` | Manual via MCP tool | All changed since last sync |
| `full_rebuild` | `fullSync()` | Manual via MCP tool | ALL records (~5 min for 6K) |
| `sync_record` | `syncRecord(id)` | Manual via MCP tool | Single record by ID |

### 2.2 Current Architecture

```
┌─────────────┐                    ┌──────────────────┐
│   Odoo CRM  │                    │   MCP Server     │
│             │    Manual Trigger  │                  │
│  crm.lead   │ <──────────────────│  sync tools      │
│             │    (Pull model)    │                  │
└─────────────┘                    └──────────────────┘
                                           │
                                           │ Upsert
                                           ▼
                                   ┌──────────────────┐
                                   │     Qdrant       │
                                   │  Vector Database │
                                   └──────────────────┘
```

### 2.3 Relevant Code Files

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `src/index.ts` | Server entry, HTTP endpoints | 51-113 (HTTP transport) |
| `src/services/sync-service.ts` | Sync logic | 354-409 (`syncRecord`) |
| `src/services/vector-client.ts` | Qdrant operations | 194 (`upsertPoints`), 280 (`deletePoints`) |
| `src/tools/vector-tools.ts` | MCP tool registration | 295-354 (sync tool) |

---

## 3. Proposed Solution

### 3.1 New Architecture (Push Model)

```
┌─────────────────┐                      ┌──────────────────────┐
│    Odoo CRM     │                      │     MCP Server       │
│                 │   HTTP POST          │                      │
│   crm.lead      │ ────────────────────>│  /webhook/sync       │
│                 │   { "id": 123 }      │  /webhook/delete     │
│  Automation     │                      │                      │
│  Rules          │   (Push model)       │  syncRecord(123)     │
└─────────────────┘                      └──────────────────────┘
                                                  │
                                                  │ Upsert/Delete
                                                  ▼
                                         ┌──────────────────┐
                                         │     Qdrant       │
                                         │  Vector Database │
                                         └──────────────────┘
```

### 3.2 Data Flow - Create/Update

```
Step 1: User creates/updates opportunity in Odoo
        └─> Odoo saves to PostgreSQL

Step 2: Automation rule fires (On Creation / On Update)
        └─> Odoo sends HTTP POST to webhook URL
            Body: { "id": 123, "name": "Opportunity Name", ... }

Step 3: MCP Server receives webhook at /webhook/sync
        └─> Extracts record ID from payload

Step 4: syncRecord(123) executes:
        ├─> Fetches full record from Odoo API (1 API call)
        ├─> Builds embedding text from record fields
        ├─> Calls Voyage AI to generate embedding (1 API call)
        └─> Upserts vector to Qdrant (1 API call)

Step 5: Response sent back to Odoo
        └─> { "status": "ok", "synced": 123 }
```

### 3.3 Data Flow - Delete

```
Step 1: User deletes/archives opportunity in Odoo

Step 2: Automation rule fires (On Deletion)
        └─> Odoo sends HTTP POST to /webhook/delete
            Body: { "id": 123 }

Step 3: MCP Server receives webhook
        └─> Extracts record ID

Step 4: deletePoints(["123"]) executes:
        └─> Removes vector from Qdrant (1 API call)

Step 5: Response sent back to Odoo
        └─> { "status": "ok", "deleted": 123 }
```

---

## 4. Implementation Stages

### Stage 1: Add Webhook Endpoints to MCP Server

**File to modify:** `src/index.ts`

**Changes Required:**

#### 1.1 Add Imports (Line ~8)

```typescript
// Add these imports
import { syncRecord } from './services/sync-service.js';
import { deletePoints } from './services/vector-client.js';
```

#### 1.2 Add Webhook Sync Endpoint (After line 58, after health check)

```typescript
// ============================================
// Webhook Endpoints for Odoo Automation
// ============================================

// Webhook: Sync a record (create/update)
app.post('/webhook/sync', async (req, res) => {
  // Optional: Verify webhook secret for security
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret && req.headers['x-webhook-secret'] !== webhookSecret) {
    console.error('[Webhook] Unauthorized request - invalid secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Extract ID from Odoo payload
  // Odoo sends: { "id": 123, "name": "...", ... }
  const { id } = req.body;

  // Validate ID
  if (!id || typeof id !== 'number') {
    console.error('[Webhook] Invalid payload - missing or invalid id:', req.body);
    return res.status(400).json({
      error: 'Missing or invalid id',
      received: req.body
    });
  }

  try {
    console.error(`[Webhook] Received sync request for record ${id}`);
    const startTime = Date.now();

    // Call existing syncRecord function
    const result = await syncRecord(id);
    const duration = Date.now() - startTime;

    if (result.success) {
      console.error(`[Webhook] Record ${id} synced successfully in ${duration}ms`);
      res.json({
        status: 'ok',
        synced: id,
        durationMs: duration
      });
    } else {
      console.error(`[Webhook] Record ${id} sync failed:`, result.errors);
      res.status(500).json({
        status: 'error',
        id: id,
        errors: result.errors
      });
    }
  } catch (error) {
    console.error(`[Webhook] Unexpected error syncing record ${id}:`, error);
    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

#### 1.3 Add Webhook Delete Endpoint

```typescript
// Webhook: Delete a record
app.post('/webhook/delete', async (req, res) => {
  // Optional: Verify webhook secret for security
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret && req.headers['x-webhook-secret'] !== webhookSecret) {
    console.error('[Webhook] Unauthorized request - invalid secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.body;

  if (!id || typeof id !== 'number') {
    console.error('[Webhook] Invalid payload - missing or invalid id:', req.body);
    return res.status(400).json({
      error: 'Missing or invalid id',
      received: req.body
    });
  }

  try {
    console.error(`[Webhook] Received delete request for record ${id}`);

    // Delete from Qdrant - ID must be string
    await deletePoints([String(id)]);

    console.error(`[Webhook] Record ${id} deleted from vector database`);
    res.json({
      status: 'ok',
      deleted: id
    });
  } catch (error) {
    console.error(`[Webhook] Error deleting record ${id}:`, error);
    res.status(500).json({
      error: 'Delete failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

#### 1.4 Add Webhook Status Endpoint (Optional, for debugging)

```typescript
// Webhook: Health check / status
app.get('/webhook/status', (_req, res) => {
  res.json({
    status: 'ok',
    endpoints: [
      'POST /webhook/sync - Sync a record',
      'POST /webhook/delete - Delete a record'
    ],
    authRequired: !!process.env.WEBHOOK_SECRET
  });
});
```

### Stage 2: Environment Configuration

**File:** `.env` (create or update)

```bash
# ===========================================
# Webhook Configuration
# ===========================================

# Enable HTTP transport (required for webhooks)
TRANSPORT=http

# Server port (default: 3000)
PORT=3000

# Server host (default: 0.0.0.0 for all interfaces)
HOST=0.0.0.0

# Optional: Webhook authentication secret
# If set, Odoo must send this in x-webhook-secret header
# Recommended for production
WEBHOOK_SECRET=your-secret-key-here-change-this
```

### Stage 3: Testing Infrastructure

No code changes needed - use existing tools (curl, Postman) for testing.

---

## 5. Odoo Configuration Guide

### 5.1 Prerequisites

- Odoo 17 or 18
- Developer mode enabled
- Access to Settings → Technical menu

### 5.2 Enable Developer Mode

1. Navigate to **Settings**
2. Scroll to bottom of page
3. Click **"Activate the developer mode"**
4. Page will reload with developer menu visible

### 5.3 Create Automation Rule: On Creation

1. Go to **Settings** → **Technical** → **Automation** → **Automated Actions**
2. Click **"New"**
3. Fill in the form:

| Field | Value |
|-------|-------|
| **Name** | `Vector Sync - New Opportunity` |
| **Model** | Select `Lead/Opportunity` (technical: `crm.lead`) |
| **Trigger** | Select `On Creation` |
| **Before Update Domain** | Leave empty |
| **Apply on** | Leave empty (all records) |
| **Action To Do** | Select `Send Webhook Notification` |
| **URL** | `https://YOUR-NGROK-URL/webhook/sync` |
| **Fields** | Click "Add a line", select `ID` field |

4. Click **"Save"**

### 5.4 Create Automation Rule: On Update

1. Click **"New"** again
2. Fill in the form:

| Field | Value |
|-------|-------|
| **Name** | `Vector Sync - Updated Opportunity` |
| **Model** | Select `Lead/Opportunity` |
| **Trigger** | Select `On Update` |
| **Before Update Domain** | Leave empty |
| **Apply on** | Leave empty |
| **Action To Do** | Select `Send Webhook Notification` |
| **URL** | `https://YOUR-NGROK-URL/webhook/sync` |
| **Fields** | Click "Add a line", select `ID` field |

3. Click **"Save"**

### 5.5 Create Automation Rule: On Deletion (Optional)

| Field | Value |
|-------|-------|
| **Name** | `Vector Sync - Deleted Opportunity` |
| **Model** | Select `Lead/Opportunity` |
| **Trigger** | Select `On Deletion` |
| **Action To Do** | Select `Send Webhook Notification` |
| **URL** | `https://YOUR-NGROK-URL/webhook/delete` |
| **Fields** | Select `ID` field |

### 5.6 Payload Format from Odoo

When Odoo sends a webhook, it sends JSON like this:

```json
{
  "id": 123
}
```

If you selected more fields, it sends:

```json
{
  "id": 123,
  "name": "New Solar Installation Project",
  "stage_id": [4, "Qualification"],
  "expected_revenue": 75000.00
}
```

**Note:** We only need the `id` field - the MCP server fetches full details from Odoo.

---

## 6. Networking Setup

### 6.1 The Challenge

Your Odoo is **cloud-hosted**, but your MCP server runs **locally**. Odoo cannot reach `localhost:3000`.

```
┌─────────────────────┐              ┌─────────────────────┐
│   Odoo (Cloud)      │   ???        │  MCP Server (Local) │
│   odoo.sh           │ ──────X────> │  localhost:3000     │
│   Cannot reach      │              │  Private IP         │
│   private IPs       │              │                     │
└─────────────────────┘              └─────────────────────┘
```

### 6.2 Solution: ngrok (Recommended for Testing)

**What is ngrok?**
A tool that creates a secure public URL pointing to your local computer.

```
┌─────────────────────┐              ┌─────────────────────┐
│   Odoo (Cloud)      │              │  ngrok Service      │
│                     │   HTTPS      │                     │
│                     │ ────────────>│  abc123.ngrok.io    │
└─────────────────────┘              └──────────┬──────────┘
                                                │
                                                │ Tunnel
                                                ▼
                                     ┌─────────────────────┐
                                     │  MCP Server (Local) │
                                     │  localhost:3000     │
                                     └─────────────────────┘
```

**Setup Steps:**

1. **Download ngrok:**
   - Go to https://ngrok.com/download
   - Download for Windows
   - Extract the zip file

2. **Create free account:**
   - Go to https://ngrok.com
   - Sign up (free)
   - Get your auth token from dashboard

3. **Configure ngrok:**
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

4. **Start ngrok tunnel:**
   ```bash
   ngrok http 3000
   ```

5. **Copy the HTTPS URL:**
   ```
   Forwarding   https://abc123.ngrok-free.app -> http://localhost:3000
   ```

6. **Use this URL in Odoo automation rules:**
   ```
   https://abc123.ngrok-free.app/webhook/sync
   ```

### 6.3 Alternative: Cloudflare Tunnel (Free, Permanent)

For production use, Cloudflare Tunnel provides a permanent URL:

1. Create Cloudflare account (free)
2. Install cloudflared
3. Run: `cloudflared tunnel --url http://localhost:3000`
4. Get permanent subdomain

---

## 7. Test Scenarios

### 7.1 Pre-Test Checklist

- [ ] MCP server running in HTTP mode (`TRANSPORT=http`)
- [ ] ngrok tunnel active and URL copied
- [ ] Odoo automation rules configured with ngrok URL
- [ ] Qdrant vector database accessible

### 7.2 Test Case 1: Webhook Endpoint Accessibility

**Objective:** Verify webhook endpoints are reachable

**Steps:**
1. Start MCP server: `npm run dev` with `TRANSPORT=http`
2. Start ngrok: `ngrok http 3000`
3. Test health endpoint:
   ```bash
   curl https://YOUR-NGROK-URL/health
   ```

**Expected Result:**
```json
{
  "status": "ok",
  "server": "odoo-crm-mcp-server"
}
```

**Pass Criteria:** HTTP 200 with status "ok"

---

### 7.3 Test Case 2: Manual Webhook Sync

**Objective:** Verify sync endpoint works with direct API call

**Steps:**
1. Find an existing Odoo lead ID (e.g., 123)
2. Send manual webhook:
   ```bash
   curl -X POST https://YOUR-NGROK-URL/webhook/sync \
     -H "Content-Type: application/json" \
     -d '{"id": 123}'
   ```

**Expected Result:**
```json
{
  "status": "ok",
  "synced": 123,
  "durationMs": 850
}
```

**Pass Criteria:**
- HTTP 200
- Record appears/updates in Qdrant
- Server logs show sync activity

---

### 7.4 Test Case 3: Invalid Payload Handling

**Objective:** Verify error handling for malformed requests

**Steps:**
1. Send request with missing ID:
   ```bash
   curl -X POST https://YOUR-NGROK-URL/webhook/sync \
     -H "Content-Type: application/json" \
     -d '{"name": "test"}'
   ```

**Expected Result:**
```json
{
  "error": "Missing or invalid id",
  "received": {"name": "test"}
}
```

**Pass Criteria:** HTTP 400 with descriptive error

---

### 7.5 Test Case 4: Non-Existent Record Handling

**Objective:** Verify handling of deleted/invalid record IDs

**Steps:**
1. Send request with non-existent ID:
   ```bash
   curl -X POST https://YOUR-NGROK-URL/webhook/sync \
     -H "Content-Type: application/json" \
     -d '{"id": 999999999}'
   ```

**Expected Result:**
```json
{
  "status": "error",
  "id": 999999999,
  "errors": ["Lead ID 999999999 not found"]
}
```

**Pass Criteria:** HTTP 500 with meaningful error

---

### 7.6 Test Case 5: Odoo Create Trigger

**Objective:** Verify end-to-end flow when creating opportunity in Odoo

**Steps:**
1. Monitor MCP server logs
2. In Odoo CRM, create a new opportunity:
   - Name: "Test Webhook Opportunity"
   - Expected Revenue: $50,000
   - Stage: "New"
3. Save the opportunity

**Expected Result:**
- Server log shows: `[Webhook] Received sync request for record XXX`
- Server log shows: `[Webhook] Record XXX synced successfully`
- New vector appears in Qdrant with matching ID

**Verification Query:**
```bash
# Search for the new opportunity semantically
curl http://localhost:6333/collections/odoo_crm_leads/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [/* embedding from "Test Webhook" */],
    "limit": 1,
    "with_payload": true
  }'
```

**Pass Criteria:**
- Webhook received within 2 seconds of save
- Record synced successfully
- Searchable via semantic search

---

### 7.7 Test Case 6: Odoo Update Trigger

**Objective:** Verify vector updates when opportunity is modified

**Steps:**
1. Find an existing opportunity in Odoo
2. Note its current stage and expected revenue
3. Modify the opportunity:
   - Change stage to "Qualified"
   - Update expected revenue to $75,000
4. Save changes

**Expected Result:**
- Webhook fires with the record ID
- Vector in Qdrant is updated with new metadata
- Semantic search reflects new stage/revenue

**Verification:**
```bash
# Check metadata in Qdrant
curl http://localhost:6333/collections/odoo_crm_leads/points/XXX
```

**Pass Criteria:**
- Metadata shows updated stage_name and expected_revenue
- last_synced timestamp is recent

---

### 7.8 Test Case 7: Webhook Delete

**Objective:** Verify vector deletion when opportunity is deleted

**Steps:**
1. Create a test opportunity in Odoo (note the ID)
2. Verify it synced to Qdrant
3. Delete the opportunity in Odoo

**Expected Result:**
- Server log: `[Webhook] Received delete request for record XXX`
- Server log: `[Webhook] Record XXX deleted from vector database`
- Vector no longer exists in Qdrant

**Verification:**
```bash
# Should return empty or 404
curl http://localhost:6333/collections/odoo_crm_leads/points/XXX
```

**Pass Criteria:** Vector removed from Qdrant

---

### 7.9 Test Case 8: Bulk Operations

**Objective:** Verify system handles multiple rapid changes

**Steps:**
1. Create 5 opportunities in quick succession
2. Monitor server logs

**Expected Result:**
- 5 separate webhook calls received
- All 5 records synced successfully
- No errors or timeouts

**Pass Criteria:**
- All records synced
- No duplicate syncs
- System remains responsive

---

### 7.10 Test Case 9: Authentication (If Enabled)

**Objective:** Verify webhook secret authentication

**Steps:**
1. Set `WEBHOOK_SECRET=mysecret123` in .env
2. Restart server
3. Send request WITHOUT secret:
   ```bash
   curl -X POST https://YOUR-NGROK-URL/webhook/sync \
     -H "Content-Type: application/json" \
     -d '{"id": 123}'
   ```

**Expected Result:**
```json
{
  "error": "Unauthorized"
}
```

4. Send request WITH correct secret:
   ```bash
   curl -X POST https://YOUR-NGROK-URL/webhook/sync \
     -H "Content-Type: application/json" \
     -H "x-webhook-secret: mysecret123" \
     -d '{"id": 123}'
   ```

**Expected Result:** Sync succeeds

**Pass Criteria:**
- Requests without secret are rejected (401)
- Requests with correct secret succeed

---

## 8. Rollback Plan

### 8.1 If Webhook Implementation Fails

1. **Remove webhook endpoints from index.ts**
   - Delete the `/webhook/sync` and `/webhook/delete` route handlers

2. **Disable Odoo automation rules**
   - Go to Settings → Technical → Automation → Automated Actions
   - Set each webhook rule to "Inactive"

3. **Revert to manual sync**
   - Continue using `odoo_crm_sync_embeddings` tool manually

### 8.2 If Networking Issues

1. **Stop ngrok** - This immediately stops the public URL
2. **Odoo webhooks will fail** - This is expected and harmless
3. **Data remains consistent** - No data loss, just no new syncs

---

## 9. Appendix

### 9.1 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRANSPORT` | Yes | `stdio` | Set to `http` for webhooks |
| `PORT` | No | `3000` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server host |
| `WEBHOOK_SECRET` | No | None | Authentication secret |
| `ODOO_URL` | Yes | - | Odoo instance URL |
| `ODOO_DB` | Yes | - | Odoo database name |
| `ODOO_USERNAME` | Yes | - | Odoo username |
| `ODOO_PASSWORD` | Yes | - | Odoo password/API key |
| `QDRANT_HOST` | No | `localhost:6333` | Qdrant server URL |
| `VOYAGE_API_KEY` | Yes | - | Voyage AI API key |

### 9.2 API Reference

#### POST /webhook/sync

Syncs a single CRM record to the vector database.

**Request:**
```http
POST /webhook/sync HTTP/1.1
Content-Type: application/json
x-webhook-secret: your-secret (optional)

{
  "id": 123
}
```

**Response (Success):**
```json
{
  "status": "ok",
  "synced": 123,
  "durationMs": 850
}
```

**Response (Error):**
```json
{
  "status": "error",
  "id": 123,
  "errors": ["Lead ID 123 not found"]
}
```

#### POST /webhook/delete

Removes a record from the vector database.

**Request:**
```http
POST /webhook/delete HTTP/1.1
Content-Type: application/json

{
  "id": 123
}
```

**Response:**
```json
{
  "status": "ok",
  "deleted": 123
}
```

### 9.3 Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Webhook not received | ngrok not running | Start ngrok, update Odoo URL |
| 401 Unauthorized | Wrong/missing secret | Check WEBHOOK_SECRET matches |
| 400 Bad Request | Invalid JSON payload | Check Odoo sends valid JSON |
| 500 Sync Failed | Odoo/Qdrant connection issue | Check services are running |
| Slow syncs | Large record descriptions | Normal, embedding takes ~500ms |

### 9.4 Monitoring

**Server Logs:**
All webhook activity logs to stderr:
```
[Webhook] Received sync request for record 123
[Webhook] Record 123 synced successfully in 850ms
```

**ngrok Dashboard:**
Visit http://127.0.0.1:4040 to see:
- All incoming requests
- Request/response bodies
- Timing information

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-13 | Claude | Initial draft |
