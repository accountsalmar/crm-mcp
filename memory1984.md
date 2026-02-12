# Vector Database Integration Plan for Odoo CRM MCP Server

## Executive Summary

Integrate **Pinecone Serverless** with **OpenAI embeddings** into the existing Odoo CRM MCP server to enable semantic search, pattern discovery, and natural language queries across 6,400+ CRM opportunities.

**User Selections:**
- Deployment: Cloud server
- Vector DB: Managed cloud service (Pinecone)
- Embeddings: OpenAI text-embedding-3-small
- Sync: On-demand (manual trigger)

---

## Research Validation Summary

### Architecture Validated Against External Sources

| Component | Validation | Confidence |
|-----------|------------|------------|
| Pinecone Serverless | Validated - best managed option for zero-ops | HIGH |
| OpenAI text-embedding-3-small | Validated - 5x cheaper than ada-002, better quality | HIGH |
| Hybrid search (metadata + vector) | Best practice confirmed by Pinecone, Weaviate, NVIDIA | HIGH |
| Circuit breaker pattern | Pinecone SDK has built-in retry, but external circuit breaker recommended | HIGH |
| On-demand sync | Appropriate for CRM data that changes moderately | HIGH |

### Key Research Sources
- [Pinecone vs Qdrant vs Weaviate Comparison 2025](https://toolshelf.tech/blog/pinecone-vs-weaviate-vs-qdrant-vector-database-comparison-2025/)
- [OpenAI Embeddings v3 Analysis](https://www.pinecone.io/learn/openai-embeddings-v3/)
- [Chunking Strategies for RAG](https://www.pinecone.io/learn/chunking-strategies/)
- [Hybrid Search Best Practices](https://zilliz.com/blog/metadata-filtering-hybrid-search-or-agent-in-rag-applications)
- [Official Qdrant MCP Server](https://github.com/qdrant/mcp-server-qdrant) (reference implementation)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                            │
│                   (src/index.ts)                         │
└────────────────────────┬────────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────────┐
│ OdooClient  │   │VectorClient │   │EmbeddingService │
│ (existing)  │   │   (NEW)     │   │     (NEW)       │
└──────┬──────┘   └──────┬──────┘   └────────┬────────┘
       │                 │                   │
       ▼                 ▼                   ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────────┐
│ Odoo XML-RPC│   │  Pinecone   │   │  OpenAI API     │
│    API      │   │  Serverless │   │  (embeddings)   │
└─────────────┘   └─────────────┘   └─────────────────┘
```

---

## New Files to Create

| File | Purpose |
|------|---------|
| `src/services/vector-client.ts` | Pinecone SDK wrapper with circuit breaker |
| `src/services/embedding-service.ts` | OpenAI embedding generation |
| `src/services/sync-service.ts` | Odoo → Vector sync orchestration |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.ts` | Add vector client warm-up (line 28) |
| `src/constants.ts` | Add VECTOR_CONFIG, EMBEDDING_CONFIG |
| `src/types.ts` | Add vector-related TypeScript interfaces |
| `src/schemas/index.ts` | Add schemas for 5 new tools |
| `src/tools/crm-tools.ts` | Register 5 new vector tools |
| `src/services/formatters.ts` | Add formatters for semantic search results |
| `package.json` | Add @pinecone-database/pinecone, openai |

---

## New MCP Tools (5 total)

### 1. `odoo_crm_semantic_search`
Natural language search across opportunities.

**Example queries:**
- "Find education projects similar to Melbourne university job"
- "Large commercial HVAC projects we lost to competitors"
- "Projects in Victoria with complex installation requirements"

### 2. `odoo_crm_find_similar`
Given an opportunity ID, find semantically similar records.

**Use cases:**
- Proposal preparation (find similar won deals)
- Pattern analysis (find similar lost deals)
- Relationship discovery

### 3. `odoo_crm_vector_sync`
Trigger synchronization between Odoo and vector database.

**Modes:**
- `full` - Rebuild entire index
- `incremental` - Sync changes since last sync

### 4. `odoo_crm_vector_status`
Health check and statistics for vector integration.

**Returns:**
- Connection status, vector count, index fullness
- Last sync time, circuit breaker state

### 5. `odoo_crm_lost_patterns`
Pattern discovery in lost opportunities using vector clustering.

**Use cases:**
- Identify common patterns in $55M+ lost deals
- Discover competitive intelligence trends
- Cluster specification losses

---

## Embedding Strategy

### Embedding Model Comparison (Research Validated)

| Model | Dimensions | Cost/1M tokens | Quality (MTEB) | Recommendation |
|-------|-----------|----------------|----------------|----------------|
| text-embedding-ada-002 | 1536 | $0.10 | 61.0% | Legacy |
| **text-embedding-3-small** | 1536 | $0.02 | 62.3% | **SELECTED** |
| text-embedding-3-large | 3072 | $0.13 | Best | Overkill for CRM |
| Cohere embed-english-v3 | 1024 | $0.10 | 55.0% | Alternative |

**Why text-embedding-3-small**: 5x cheaper than ada-002, better quality, sufficient dimensions for CRM semantic search. Research confirms it outperforms ada-002 on multilingual (44% vs 31.4% on MIRACL benchmark).

### Document Template (Best Practice: Structured Format)
Combine multiple CRM fields into a semantic document. Research recommends treating each CRM record as a logical unit rather than chunking across records:

```
Project: {name}
Sector: {sector}
Location: {city}, {state}
Specification: {specification_name}
Lead Source: {lead_source_name}
Contact: {contact_name}
Status: {Won/Lost/Active} {lost_reason if applicable}
Description: {description - HTML stripped, truncated to 2000 chars}
```

**Rationale**: Per [Pinecone chunking best practices](https://www.pinecone.io/learn/chunking-strategies/), "if the chunk makes sense without surrounding context to a human, it will make sense to the language model." CRM records are self-contained logical units.

### Metadata for Filtering (Hybrid Search)
Store structured data for pre-filtering before vector search (research confirms pre-filtering is more efficient than post-filtering):

**IDs (exact match)**:
- odoo_id, stage_id, user_id, team_id, state_id, lost_reason_id, specification_id

**Numerics (range queries)**:
- expected_revenue, probability

**Flags (boolean filters)**:
- is_won, is_lost, is_active

**Dates (range queries)**:
- create_date, date_closed

**Text (display only, not for filtering)**:
- name, stage_name, user_name, city, state_name

---

## Environment Variables

```bash
# Pinecone (required)
PINECONE_API_KEY=your-api-key
PINECONE_INDEX_NAME=odoo-crm-opportunities

# OpenAI (required)
OPENAI_API_KEY=your-openai-key

# Optional tuning
VECTOR_SYNC_BATCH_SIZE=100
VECTOR_SEARCH_DEFAULT_TOP_K=10
VECTOR_ENABLED=true
```

---

## Dependencies to Add

```json
{
  "@pinecone-database/pinecone": "^4.0.0",
  "openai": "^4.70.0"
}
```

**Note**: Per [npm registry](https://www.npmjs.com/package/@pinecone-database/pinecone), v4+ includes serverless support and built-in retry logic. The SDK requires Node 18+ and TypeScript 4.1+ (already satisfied by project).

---

## Detailed Implementation Stages

Each stage is designed to be independently testable and deployable. Complete all tests before proceeding to the next stage.

---

### STAGE 1: Dependencies & Configuration (Low Risk)

**Goal**: Set up project dependencies and configuration without changing existing functionality.

**Files to modify:**
- `package.json` - Add new dependencies
- `src/constants.ts` - Add VECTOR_CONFIG, EMBEDDING_CONFIG
- `.env.example` - Document new environment variables

**Step-by-step:**

```bash
# Step 1.1: Install dependencies
npm install @pinecone-database/pinecone@^4.0.0 openai@^4.70.0
```

```typescript
// Step 1.2: Add to src/constants.ts (after EXPORT_CONFIG)
export const VECTOR_CONFIG = {
  INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'odoo-crm-opportunities',
  ENVIRONMENT: process.env.PINECONE_ENVIRONMENT || 'us-east-1',
  DIMENSION: 1536,
  METRIC: 'cosine' as const,
  SYNC_BATCH_SIZE: parseInt(process.env.VECTOR_SYNC_BATCH_SIZE || '100'),
  DEFAULT_TOP_K: parseInt(process.env.VECTOR_SEARCH_DEFAULT_TOP_K || '10'),
  MAX_TOP_K: 50,
  MAX_DOCUMENT_LENGTH: 8000,
  ENABLED: process.env.VECTOR_ENABLED !== 'false',
} as const;

export const EMBEDDING_CONFIG = {
  MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  MAX_TOKENS_PER_REQUEST: 8191,
  BATCH_SIZE: 100,
} as const;

export const VECTOR_CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 3,
  RESET_TIMEOUT_MS: 30000,
  HALF_OPEN_MAX_ATTEMPTS: 1,
} as const;
```

**Test Scenarios for Stage 1:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T1.1 | Build project after adding dependencies | No TypeScript errors | `npm run build` succeeds |
| T1.2 | Start server with no vector env vars | Server starts normally, VECTOR_ENABLED defaults | `npm run dev` starts |
| T1.3 | Existing tools work unchanged | All 20+ tools function normally | Test `odoo_crm_search_leads` |
| T1.4 | Constants export correctly | VECTOR_CONFIG accessible | Console.log in index.ts |

**Rollback Plan**: Remove npm packages, revert constants.ts changes.

---

### STAGE 2: Type Definitions (Low Risk)

**Goal**: Add TypeScript interfaces without changing runtime behavior.

**Files to modify:**
- `src/types.ts` - Add vector-related interfaces

**Step-by-step:**

```typescript
// Step 2.1: Add to src/types.ts (at end of file)

// ============================================
// Vector Database Types
// ============================================

export interface VectorConfig {
  apiKey: string;
  indexName: string;
  environment?: string;
}

export interface EmbeddingConfig {
  apiKey: string;
  model: string;
}

export interface VectorMetadata {
  odoo_id: number;
  name: string;
  stage_id: number;
  stage_name: string;
  user_id: number;
  user_name: string;
  team_id?: number;
  team_name?: string;
  expected_revenue: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
  sector?: string;
  specification_id?: number;
  specification_name?: string;
  city?: string;
  state_id?: number;
  state_name?: string;
  lost_reason_id?: number;
  lost_reason_name?: string;
  create_date: string;
  date_closed?: string;
  sync_version: number;
  last_synced: string;
}

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export interface VectorQueryOptions {
  vector: number[];
  topK: number;
  filter?: VectorFilter;
  includeMetadata?: boolean;
}

export interface VectorFilter {
  stage_id?: number | { $in: number[] };
  user_id?: number | { $in: number[] };
  team_id?: number;
  is_won?: boolean;
  is_lost?: boolean;
  is_active?: boolean;
  state_id?: number;
  expected_revenue?: { $gte?: number; $lte?: number };
  create_date?: { $gte?: string; $lte?: string };
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: VectorMetadata;
}

export interface VectorQueryResult {
  matches: VectorMatch[];
  namespace?: string;
}

export interface SyncProgress {
  phase: 'fetching' | 'embedding' | 'upserting';
  current_batch: number;
  total_batches: number;
  records_processed: number;
  total_records: number;
  percent_complete: number;
  elapsed_ms: number;
}

export interface SyncResult {
  success: boolean;
  records_synced: number;
  records_failed: number;
  records_deleted: number;
  duration_ms: number;
  sync_version: number;
  errors?: string[];
}

export interface SyncStatus {
  enabled: boolean;
  connected: boolean;
  last_sync: string | null;
  sync_version: number;
  total_vectors: number;
  index_fullness: number;
  circuit_breaker_state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export interface SemanticMatch {
  lead: CrmLead;
  similarity_score: number;
  business_score: number;
  final_score: number;
}

export interface SemanticSearchResult {
  items: SemanticMatch[];
  total: number;
  query_embedding_ms: number;
  vector_search_ms: number;
  odoo_enrichment_ms: number;
  search_mode: 'semantic' | 'hybrid';
}
```

**Test Scenarios for Stage 2:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T2.1 | TypeScript compilation | No type errors | `npm run build` succeeds |
| T2.2 | Types are importable | Can import in test file | Create temp test import |
| T2.3 | Existing functionality unchanged | Server operates normally | Run existing tools |

**Rollback Plan**: Remove type definitions from types.ts.

---

### STAGE 3: Embedding Service (Medium Risk)

**Goal**: Create isolated embedding service with OpenAI. No integration with main server yet.

**Files to create:**
- `src/services/embedding-service.ts`

**Step-by-step:**

```typescript
// Step 3.1: Create src/services/embedding-service.ts

import OpenAI from 'openai';
import { EMBEDDING_CONFIG } from '../constants.js';
import { CrmLead } from '../types.js';
import { stripHtml, truncateText, getRelationName } from './formatters.js';

let openaiClient: OpenAI | null = null;

export function initializeEmbeddingService(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[Embedding] OPENAI_API_KEY not set - embedding service disabled');
    return null;
  }

  openaiClient = new OpenAI({ apiKey });
  console.error('[Embedding] Service initialized');
  return openaiClient;
}

export function getEmbeddingClient(): OpenAI | null {
  return openaiClient;
}

export function buildDocument(lead: CrmLead): string {
  const parts: string[] = [];

  parts.push(`Project: ${lead.name || 'Untitled'}`);

  if (lead.sector) {
    parts.push(`Sector: ${lead.sector}`);
  }

  const city = lead.city || '';
  const state = lead.state_id ? getRelationName(lead.state_id) : '';
  if (city || state) {
    parts.push(`Location: ${[city, state].filter(Boolean).join(', ')}`);
  }

  if (lead.specification_id) {
    parts.push(`Specification: ${getRelationName(lead.specification_id)}`);
  }

  if (lead.lead_source_id) {
    parts.push(`Lead Source: ${getRelationName(lead.lead_source_id)}`);
  }

  if (lead.contact_name) {
    parts.push(`Contact: ${lead.contact_name}`);
  }

  // Status
  const isWon = lead.stage_id && typeof lead.stage_id !== 'number' &&
                lead.stage_id[1]?.toLowerCase().includes('won');
  const isLost = !!lead.lost_reason_id;

  let status = 'Active';
  if (isWon) status = 'Won';
  else if (isLost) {
    const lostReason = getRelationName(lead.lost_reason_id);
    status = `Lost - ${lostReason}`;
  }
  parts.push(`Status: ${status}`);

  // Description (most semantic content)
  if (lead.description) {
    const cleanDesc = stripHtml(lead.description);
    const truncatedDesc = truncateText(cleanDesc, 2000);
    parts.push(`Description: ${truncatedDesc}`);
  }

  return parts.join('\n');
}

export async function embed(text: string): Promise<number[]> {
  if (!openaiClient) {
    throw new Error('Embedding service not initialized');
  }

  const response = await openaiClient.embeddings.create({
    model: EMBEDDING_CONFIG.MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

export async function embedBatch(
  texts: string[],
  onProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  if (!openaiClient) {
    throw new Error('Embedding service not initialized');
  }

  const results: number[][] = [];
  const batchSize = EMBEDDING_CONFIG.BATCH_SIZE;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_CONFIG.MODEL,
      input: batch,
    });

    for (const item of response.data) {
      results.push(item.embedding);
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }
  }

  return results;
}

export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}
```

**Test Scenarios for Stage 3:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T3.1 | Service initializes with valid API key | Returns OpenAI client | Set OPENAI_API_KEY, call initializeEmbeddingService() |
| T3.2 | Service handles missing API key gracefully | Returns null, logs warning | Unset OPENAI_API_KEY, call init |
| T3.3 | buildDocument creates valid text | Formatted string with project info | Call with sample CrmLead |
| T3.4 | embed() generates 1536-dim vector | Array of 1536 numbers | Call embed("test text") |
| T3.5 | embedBatch() handles multiple texts | Array of arrays | Call with 3 test strings |
| T3.6 | Build compiles without errors | No TypeScript errors | `npm run build` |

**Manual Test Script:**
```typescript
// Create test-embedding.ts temporarily
import { initializeEmbeddingService, embed, buildDocument } from './services/embedding-service.js';

async function test() {
  initializeEmbeddingService();

  const testLead = {
    id: 1,
    name: 'Melbourne University Science Building',
    sector: 'Education',
    city: 'Melbourne',
    state_id: [1, 'Victoria'],
    description: 'HVAC installation project'
  };

  const doc = buildDocument(testLead as any);
  console.log('Document:', doc);

  const vector = await embed(doc);
  console.log('Vector dimensions:', vector.length);
  console.log('First 5 values:', vector.slice(0, 5));
}

test().catch(console.error);
```

**Rollback Plan**: Delete embedding-service.ts file.

---

### STAGE 4: Vector Client (Medium Risk)

**Goal**: Create Pinecone client wrapper with circuit breaker. No integration yet.

**Files to create:**
- `src/services/vector-client.ts`

**Step-by-step:**

```typescript
// Step 4.1: Create src/services/vector-client.ts

import { Pinecone, Index } from '@pinecone-database/pinecone';
import { VECTOR_CONFIG, VECTOR_CIRCUIT_BREAKER_CONFIG } from '../constants.js';
import { VectorRecord, VectorQueryOptions, VectorQueryResult, VectorMetadata } from '../types.js';

// Circuit breaker state
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailure: number | null;
  lastStateChange: number;
}

const circuitBreaker: CircuitBreakerState = {
  state: 'CLOSED',
  failures: 0,
  lastFailure: null,
  lastStateChange: Date.now(),
};

let pineconeClient: Pinecone | null = null;
let pineconeIndex: Index | null = null;

export function initializeVectorClient(): boolean {
  const apiKey = process.env.PINECONE_API_KEY;

  if (!apiKey) {
    console.error('[Vector] PINECONE_API_KEY not set - vector service disabled');
    return false;
  }

  try {
    pineconeClient = new Pinecone({ apiKey });
    pineconeIndex = pineconeClient.index(VECTOR_CONFIG.INDEX_NAME);
    console.error(`[Vector] Connected to index: ${VECTOR_CONFIG.INDEX_NAME}`);
    return true;
  } catch (error) {
    console.error('[Vector] Failed to initialize:', error);
    return false;
  }
}

export function getVectorClient(): Pinecone | null {
  return pineconeClient;
}

export function getVectorIndex(): Index | null {
  return pineconeIndex;
}

export function getCircuitBreakerState(): CircuitBreakerState {
  // Check if circuit should transition from OPEN to HALF_OPEN
  if (circuitBreaker.state === 'OPEN' && circuitBreaker.lastFailure) {
    const elapsed = Date.now() - circuitBreaker.lastFailure;
    if (elapsed >= VECTOR_CIRCUIT_BREAKER_CONFIG.RESET_TIMEOUT_MS) {
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.lastStateChange = Date.now();
      console.error('[Vector] Circuit breaker: OPEN -> HALF_OPEN');
    }
  }
  return { ...circuitBreaker };
}

function recordSuccess(): void {
  if (circuitBreaker.state === 'HALF_OPEN') {
    circuitBreaker.state = 'CLOSED';
    circuitBreaker.failures = 0;
    circuitBreaker.lastStateChange = Date.now();
    console.error('[Vector] Circuit breaker: HALF_OPEN -> CLOSED');
  }
  circuitBreaker.failures = 0;
}

function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= VECTOR_CIRCUIT_BREAKER_CONFIG.FAILURE_THRESHOLD) {
    circuitBreaker.state = 'OPEN';
    circuitBreaker.lastStateChange = Date.now();
    console.error(`[Vector] Circuit breaker: -> OPEN (${circuitBreaker.failures} failures)`);
  }
}

async function executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
  const state = getCircuitBreakerState();

  if (state.state === 'OPEN') {
    throw new Error('Vector service temporarily unavailable (circuit open)');
  }

  try {
    const result = await operation();
    recordSuccess();
    return result;
  } catch (error) {
    recordFailure();
    throw error;
  }
}

export async function upsert(records: VectorRecord[]): Promise<{ upsertedCount: number }> {
  if (!pineconeIndex) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const vectors = records.map(r => ({
      id: r.id,
      values: r.values,
      metadata: r.metadata as Record<string, unknown>,
    }));

    await pineconeIndex!.upsert(vectors);
    return { upsertedCount: vectors.length };
  });
}

export async function query(options: VectorQueryOptions): Promise<VectorQueryResult> {
  if (!pineconeIndex) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const result = await pineconeIndex!.query({
      vector: options.vector,
      topK: options.topK,
      filter: options.filter as Record<string, unknown>,
      includeMetadata: options.includeMetadata ?? true,
    });

    return {
      matches: (result.matches || []).map(m => ({
        id: m.id,
        score: m.score || 0,
        metadata: m.metadata as VectorMetadata | undefined,
      })),
    };
  });
}

export async function deleteByIds(ids: string[]): Promise<void> {
  if (!pineconeIndex) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    await pineconeIndex!.deleteMany(ids);
  });
}

export async function getIndexStats(): Promise<{
  totalVectors: number;
  dimension: number;
  indexFullness: number;
}> {
  if (!pineconeIndex) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const stats = await pineconeIndex!.describeIndexStats();
    return {
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || VECTOR_CONFIG.DIMENSION,
      indexFullness: stats.indexFullness || 0,
    };
  });
}

export async function healthCheck(): Promise<{
  connected: boolean;
  indexName: string;
  circuitBreakerState: CircuitState;
  error?: string;
}> {
  const cbState = getCircuitBreakerState();

  if (!pineconeClient || !pineconeIndex) {
    return {
      connected: false,
      indexName: VECTOR_CONFIG.INDEX_NAME,
      circuitBreakerState: cbState.state,
      error: 'Client not initialized',
    };
  }

  try {
    await getIndexStats();
    return {
      connected: true,
      indexName: VECTOR_CONFIG.INDEX_NAME,
      circuitBreakerState: cbState.state,
    };
  } catch (error) {
    return {
      connected: false,
      indexName: VECTOR_CONFIG.INDEX_NAME,
      circuitBreakerState: cbState.state,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function warmVectorClient(): Promise<void> {
  if (!VECTOR_CONFIG.ENABLED) {
    console.error('[Vector] Vector features disabled');
    return;
  }

  const initialized = initializeVectorClient();
  if (initialized) {
    try {
      const stats = await getIndexStats();
      console.error(`[Vector] Index warmed: ${stats.totalVectors} vectors`);
    } catch (error) {
      console.error('[Vector] Warm-up ping failed:', error);
    }
  }
}
```

**Test Scenarios for Stage 4:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T4.1 | Initialize with valid API key | Returns true | Set PINECONE_API_KEY, call initializeVectorClient() |
| T4.2 | Initialize with missing key | Returns false, logs warning | Unset key, call init |
| T4.3 | healthCheck() with valid connection | { connected: true, ... } | Call healthCheck() |
| T4.4 | Circuit breaker starts CLOSED | state === 'CLOSED' | getCircuitBreakerState() |
| T4.5 | getIndexStats() returns stats | Object with totalVectors | After init, call getIndexStats() |
| T4.6 | Build compiles | No errors | `npm run build` |

**Pre-requisites for Testing:**
1. Create Pinecone account at pinecone.io
2. Create serverless index named `odoo-crm-opportunities` with dimension 1536, cosine metric
3. Set PINECONE_API_KEY environment variable

**Rollback Plan**: Delete vector-client.ts file.

---

### STAGE 5: Sync Service (Medium Risk)

**Goal**: Create sync orchestration service. Connects embedding + vector services.

**Files to create:**
- `src/services/sync-service.ts`

**Step-by-step:**

```typescript
// Step 5.1: Create src/services/sync-service.ts

import { VECTOR_CONFIG } from '../constants.js';
import { CrmLead, VectorRecord, VectorMetadata, SyncProgress, SyncResult } from '../types.js';
import { useClient } from './odoo-pool.js';
import { buildDocument, embed, embedBatch } from './embedding-service.js';
import { upsert, deleteByIds, getIndexStats, getCircuitBreakerState } from './vector-client.js';
import { getRelationName } from './formatters.js';
import { CRM_FIELDS } from '../constants.js';

let lastSyncTime: string | null = null;
let syncVersion = 0;

export function getLastSyncTime(): string | null {
  return lastSyncTime;
}

export function getSyncVersion(): number {
  return syncVersion;
}

function buildMetadata(lead: CrmLead): VectorMetadata {
  const isWon = lead.stage_id && typeof lead.stage_id !== 'number' &&
                (lead.stage_id[1]?.toLowerCase().includes('won') || false);
  const isLost = !!lead.lost_reason_id;

  return {
    odoo_id: lead.id,
    name: lead.name || 'Untitled',
    stage_id: typeof lead.stage_id === 'number' ? lead.stage_id : (lead.stage_id?.[0] || 0),
    stage_name: getRelationName(lead.stage_id),
    user_id: typeof lead.user_id === 'number' ? lead.user_id : (lead.user_id?.[0] || 0),
    user_name: getRelationName(lead.user_id),
    team_id: typeof lead.team_id === 'number' ? lead.team_id : (lead.team_id?.[0] || undefined),
    team_name: lead.team_id ? getRelationName(lead.team_id) : undefined,
    expected_revenue: lead.expected_revenue || 0,
    probability: lead.probability || 0,
    is_won: isWon,
    is_lost: isLost,
    is_active: lead.active !== false,
    sector: lead.sector || undefined,
    specification_id: typeof lead.specification_id === 'number' ? lead.specification_id : (lead.specification_id?.[0] || undefined),
    specification_name: lead.specification_id ? getRelationName(lead.specification_id) : undefined,
    city: lead.city || undefined,
    state_id: typeof lead.state_id === 'number' ? lead.state_id : (lead.state_id?.[0] || undefined),
    state_name: lead.state_id ? getRelationName(lead.state_id) : undefined,
    lost_reason_id: typeof lead.lost_reason_id === 'number' ? lead.lost_reason_id : (lead.lost_reason_id?.[0] || undefined),
    lost_reason_name: lead.lost_reason_id ? getRelationName(lead.lost_reason_id) : undefined,
    create_date: lead.create_date || new Date().toISOString(),
    date_closed: lead.date_closed || undefined,
    sync_version: syncVersion + 1,
    last_synced: new Date().toISOString(),
  };
}

export async function fullSync(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let recordsSynced = 0;
  let recordsFailed = 0;

  try {
    // Fetch all active opportunities from Odoo
    const leads = await useClient(async (client) => {
      const domain = [['active', '=', true]];
      const total = await client.searchCount('crm.lead', domain);

      const allLeads: CrmLead[] = [];
      const batchSize = VECTOR_CONFIG.SYNC_BATCH_SIZE;
      const totalBatches = Math.ceil(total / batchSize);

      for (let i = 0; i < total; i += batchSize) {
        const batch = await client.searchRead<CrmLead>(
          'crm.lead',
          domain,
          CRM_FIELDS.LEAD_DETAIL,
          { offset: i, limit: batchSize }
        );
        allLeads.push(...batch);

        if (onProgress) {
          onProgress({
            phase: 'fetching',
            current_batch: Math.floor(i / batchSize) + 1,
            total_batches: totalBatches,
            records_processed: allLeads.length,
            total_records: total,
            percent_complete: Math.round((allLeads.length / total) * 33),
            elapsed_ms: Date.now() - startTime,
          });
        }
      }

      return allLeads;
    });

    // Generate embeddings
    const documents = leads.map(lead => buildDocument(lead));
    const embeddings = await embedBatch(documents, (current, total) => {
      if (onProgress) {
        onProgress({
          phase: 'embedding',
          current_batch: current,
          total_batches: total,
          records_processed: current,
          total_records: total,
          percent_complete: 33 + Math.round((current / total) * 33),
          elapsed_ms: Date.now() - startTime,
        });
      }
    });

    // Upsert to Pinecone in batches
    const vectorBatchSize = 100;
    for (let i = 0; i < leads.length; i += vectorBatchSize) {
      const batchLeads = leads.slice(i, i + vectorBatchSize);
      const batchEmbeddings = embeddings.slice(i, i + vectorBatchSize);

      const records: VectorRecord[] = batchLeads.map((lead, idx) => ({
        id: String(lead.id),
        values: batchEmbeddings[idx],
        metadata: buildMetadata(lead),
      }));

      try {
        await upsert(records);
        recordsSynced += records.length;
      } catch (error) {
        recordsFailed += records.length;
        errors.push(`Batch ${Math.floor(i / vectorBatchSize) + 1}: ${error}`);
      }

      if (onProgress) {
        onProgress({
          phase: 'upserting',
          current_batch: Math.floor(i / vectorBatchSize) + 1,
          total_batches: Math.ceil(leads.length / vectorBatchSize),
          records_processed: Math.min(i + vectorBatchSize, leads.length),
          total_records: leads.length,
          percent_complete: 66 + Math.round(((i + vectorBatchSize) / leads.length) * 34),
          elapsed_ms: Date.now() - startTime,
        });
      }
    }

    syncVersion++;
    lastSyncTime = new Date().toISOString();

    return {
      success: recordsFailed === 0,
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      records_deleted: 0,
      duration_ms: Date.now() - startTime,
      sync_version: syncVersion,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (error) {
    return {
      success: false,
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      records_deleted: 0,
      duration_ms: Date.now() - startTime,
      sync_version: syncVersion,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

export async function incrementalSync(
  since?: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const startTime = Date.now();
  const sinceDate = since || lastSyncTime || new Date(0).toISOString();

  const errors: string[] = [];
  let recordsSynced = 0;
  let recordsFailed = 0;

  try {
    // Fetch changed records from Odoo
    const leads = await useClient(async (client) => {
      const domain = [
        ['write_date', '>=', sinceDate],
        ['active', '=', true],
      ];
      return client.searchRead<CrmLead>('crm.lead', domain, CRM_FIELDS.LEAD_DETAIL);
    });

    if (leads.length === 0) {
      return {
        success: true,
        records_synced: 0,
        records_failed: 0,
        records_deleted: 0,
        duration_ms: Date.now() - startTime,
        sync_version: syncVersion,
      };
    }

    // Generate embeddings and upsert
    const documents = leads.map(lead => buildDocument(lead));
    const embeddings = await embedBatch(documents);

    const records: VectorRecord[] = leads.map((lead, idx) => ({
      id: String(lead.id),
      values: embeddings[idx],
      metadata: buildMetadata(lead),
    }));

    try {
      await upsert(records);
      recordsSynced = records.length;
    } catch (error) {
      recordsFailed = records.length;
      errors.push(String(error));
    }

    if (recordsSynced > 0) {
      syncVersion++;
      lastSyncTime = new Date().toISOString();
    }

    return {
      success: recordsFailed === 0,
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      records_deleted: 0,
      duration_ms: Date.now() - startTime,
      sync_version: syncVersion,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (error) {
    return {
      success: false,
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      records_deleted: 0,
      duration_ms: Date.now() - startTime,
      sync_version: syncVersion,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

export async function getSyncStatus(): Promise<{
  enabled: boolean;
  connected: boolean;
  last_sync: string | null;
  sync_version: number;
  total_vectors: number;
  index_fullness: number;
  circuit_breaker_state: string;
}> {
  if (!VECTOR_CONFIG.ENABLED) {
    return {
      enabled: false,
      connected: false,
      last_sync: null,
      sync_version: 0,
      total_vectors: 0,
      index_fullness: 0,
      circuit_breaker_state: 'N/A',
    };
  }

  try {
    const stats = await getIndexStats();
    const cbState = getCircuitBreakerState();

    return {
      enabled: true,
      connected: true,
      last_sync: lastSyncTime,
      sync_version: syncVersion,
      total_vectors: stats.totalVectors,
      index_fullness: stats.indexFullness,
      circuit_breaker_state: cbState.state,
    };
  } catch (error) {
    const cbState = getCircuitBreakerState();
    return {
      enabled: true,
      connected: false,
      last_sync: lastSyncTime,
      sync_version: syncVersion,
      total_vectors: 0,
      index_fullness: 0,
      circuit_breaker_state: cbState.state,
    };
  }
}
```

**Test Scenarios for Stage 5:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T5.1 | fullSync with 10 test records | SyncResult with records_synced=10 | Limit Odoo query, call fullSync() |
| T5.2 | Sync progress callback fires | Progress reported for each phase | Add console.log in callback |
| T5.3 | getSyncStatus returns valid data | Object with vector count | After sync, call getSyncStatus() |
| T5.4 | incrementalSync with no changes | records_synced=0 | Call immediately after fullSync |
| T5.5 | Build compiles | No errors | `npm run build` |

**Rollback Plan**: Delete sync-service.ts file.

---

### STAGE 6: MCP Tool Schemas (Low Risk)

**Goal**: Add Zod schemas for vector tools without registering tools yet.

**Files to modify:**
- `src/schemas/index.ts`

**Step-by-step:**

Add to `src/schemas/index.ts`:

```typescript
// Vector Tool Schemas

export const VectorSyncSchema = z.object({
  sync_type: z.enum(['full', 'incremental'])
    .default('incremental')
    .describe("'full' rebuilds entire index (~5 min for 6K records), 'incremental' syncs changes since last sync (~seconds)"),
  dry_run: z.boolean()
    .default(false)
    .describe("If true, shows what would be synced without actually syncing"),
});
export type VectorSyncInput = z.infer<typeof VectorSyncSchema>;

export const VectorStatusSchema = z.object({
  include_sample: z.boolean()
    .default(false)
    .describe("Include a sample vector for debugging"),
});
export type VectorStatusInput = z.infer<typeof VectorStatusSchema>;

export const SemanticSearchSchema = PaginationSchema.extend({
  query: z.string()
    .min(10)
    .max(500)
    .describe("Natural language search query. Examples: 'education projects similar to university jobs', 'large commercial HVAC projects we lost'"),
  top_k: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of similar opportunities to return"),
  stage_id: z.number().int().positive().optional()
    .describe("Filter by pipeline stage"),
  user_id: z.number().int().positive().optional()
    .describe("Filter by salesperson"),
  is_won: z.boolean().optional()
    .describe("Filter for won opportunities only"),
  is_lost: z.boolean().optional()
    .describe("Filter for lost opportunities only"),
  min_revenue: z.number().optional()
    .describe("Minimum expected revenue filter"),
  max_revenue: z.number().optional()
    .describe("Maximum expected revenue filter"),
  state_id: z.number().int().positive().optional()
    .describe("Filter by Australian state/territory"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
});
export type SemanticSearchInput = z.infer<typeof SemanticSearchSchema>;

export const FindSimilarSchema = z.object({
  opportunity_id: z.number()
    .int()
    .positive()
    .describe("The Odoo opportunity ID to find similar records for"),
  top_k: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Number of similar opportunities to return"),
  exclude_same_partner: z.boolean()
    .default(false)
    .describe("Exclude opportunities from the same partner/company"),
  status_filter: z.enum(['all', 'active', 'won', 'lost'])
    .default('all')
    .describe("Filter similar opportunities by status"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
});
export type FindSimilarInput = z.infer<typeof FindSimilarSchema>;

export const LostPatternsSchema = z.object({
  min_revenue: z.number().optional()
    .describe("Minimum revenue threshold (e.g., 55000000 for $55M+)"),
  lost_reason_id: z.number().int().positive().optional()
    .describe("Focus on specific lost reason"),
  cluster_count: z.number()
    .int()
    .min(3)
    .max(10)
    .default(5)
    .describe("Number of pattern clusters to identify"),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe("Start date for analysis (YYYY-MM-DD)"),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
});
export type LostPatternsInput = z.infer<typeof LostPatternsSchema>;
```

**Test Scenarios for Stage 6:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T6.1 | Schemas parse valid input | No validation errors | Schema.parse({ valid_input }) |
| T6.2 | Schemas reject invalid input | ZodError thrown | Schema.parse({ invalid }) |
| T6.3 | Default values applied | Defaults populated | Schema.parse({}) |
| T6.4 | Build compiles | No errors | `npm run build` |

**Rollback Plan**: Remove schema additions from index.ts.

---

### STAGE 7: Vector Tools Registration (Higher Risk)

**Goal**: Register vector MCP tools. This modifies the main tool file.

**Files to modify:**
- `src/tools/crm-tools.ts`
- `src/index.ts`

**Detailed implementation provided in original plan. Key points:**

1. Add imports at top of crm-tools.ts
2. Register 4 tools: `odoo_crm_vector_sync`, `odoo_crm_vector_status`, `odoo_crm_semantic_search`, `odoo_crm_find_similar`
3. Update index.ts to warm vector client

**Test Scenarios for Stage 7:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T7.1 | Server starts with new tools | No errors, tools listed | `npm run dev`, check logs |
| T7.2 | odoo_crm_vector_status works | Returns status JSON | Call tool with Claude |
| T7.3 | odoo_crm_vector_sync (dry_run=true) | Shows what would sync | Call tool |
| T7.4 | odoo_crm_vector_sync (full) | Syncs all records | Call tool, verify Pinecone console |
| T7.5 | odoo_crm_semantic_search works | Returns semantic results | Call with test query |
| T7.6 | Existing tools still work | No regression | Test odoo_crm_search_leads |

**Rollback Plan**: Revert crm-tools.ts and index.ts changes.

---

### STAGE 8: Formatters & Advanced Features (Lower Risk)

**Goal**: Add output formatters and lost patterns tool.

**Files to modify:**
- `src/services/formatters.ts`
- `src/tools/crm-tools.ts`

**Test Scenarios for Stage 8:**

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T8.1 | formatSemanticResults produces markdown | Valid markdown output | Call formatter |
| T8.2 | formatSemanticResults produces JSON | Valid JSON output | Call with JSON format |
| T8.3 | odoo_crm_lost_patterns tool works | Returns pattern clusters | Call tool |
| T8.4 | Full end-to-end test | All 5 vector tools work | Test each tool |

---

## Stage Completion Checklist

| Stage | Description | Tests | Status |
|-------|-------------|-------|--------|
| 1 | Dependencies & Configuration | T1.1-T1.4 | ⬜ |
| 2 | Type Definitions | T2.1-T2.3 | ⬜ |
| 3 | Embedding Service | T3.1-T3.6 | ⬜ |
| 4 | Vector Client | T4.1-T4.6 | ⬜ |
| 5 | Sync Service | T5.1-T5.5 | ⬜ |
| 6 | MCP Tool Schemas | T6.1-T6.4 | ⬜ |
| 7 | Vector Tools Registration | T7.1-T7.6 | ⬜ |
| 8 | Formatters & Advanced | T8.1-T8.4 | ⬜ |

**Total Test Cases: 33**

---

## Hybrid Search Architecture (Research Validated)

Per [Zilliz research](https://zilliz.com/blog/metadata-filtering-hybrid-search-or-agent-in-rag-applications): "Metadata filtering uses the pre-filtering approach, where you first narrow down the relevant documents and then apply vector similarity search on the narrowed set."

### Query Routing Logic
```
User Query
    │
    ├─ Has specific ID/filter? ──────► Structured Search (Odoo)
    │
    ├─ Contains "similar", "like"? ──► Semantic Search (Vector)
    │
    ├─ Long natural language? ──────► Semantic Search (Vector)
    │
    └─ Has filters + semantic? ─────► Hybrid Search
                                       1. Filter in Pinecone metadata (PRE-FILTER)
                                       2. Semantic ranking on filtered set
                                       3. Enrich from Odoo for display
```

### Result Fusion Strategy
Per research, recursive splitters with 10-20% overlap deliver 30-50% higher retrieval precision. For CRM records (self-contained units), we use metadata pre-filtering + semantic ranking:

- **60%** semantic similarity score (from Pinecone)
- **40%** business score computed from:
  - Recency (opportunities < 30 days get boost)
  - Revenue magnitude (high-value deals prioritized)
  - Stage progression (advanced stages weighted higher)

### Hybrid Search vs Pure Vector

| Query Type | Approach | Example |
|------------|----------|---------|
| "Find opportunity 12345" | Odoo direct | Exact ID lookup |
| "Education projects in Victoria" | Hybrid | Pre-filter state_id + sector, then semantic |
| "Projects similar to Melbourne uni job" | Pure semantic | Vector similarity, no pre-filter |
| "Lost deals > $1M to competitors" | Hybrid | Pre-filter is_lost + revenue, then semantic on lost_reason |

---

## Error Handling (Research Validated)

### Pinecone SDK Built-in Retry
Per [Pinecone SDK docs](https://sdk.pinecone.io/typescript/), the SDK has built-in `RetryOnServerFailure`:
- Automatically retries on 500 (Internal Server Error) and 503 (Unavailable)
- Uses exponential backoff with jitter
- Default: 3 retries, max 10 allowed
- **We should still add circuit breaker** for cascading failure protection

### Resilience Layers (reuse existing patterns)
1. **Pinecone SDK retry** (built-in): Handles transient 5xx errors
2. **Circuit breaker** (external): Prevents cascading failures
   - 3 failures → OPEN (fail fast)
   - 30s reset → HALF_OPEN (test)
   - Success → CLOSED
3. **Timeout protection**: 30s for queries, 60s for sync batches
4. **Rate limit handling**: Exponential backoff on 429 responses

### Graceful Degradation
When vector services unavailable:
- Fall back to structured Odoo search automatically
- Log warning to stderr (MCP protocol safe)
- Return partial results with degradation notice
- Circuit breaker state exposed via `odoo_crm_vector_status` tool

---

## Cost Estimate

| Service | Cost |
|---------|------|
| Pinecone Serverless | Free tier (100K vectors) |
| OpenAI Embeddings | ~$0.06 for full index of 6,400 records |
| Monthly sync | ~$0.01-0.05 depending on changes |

---

## Risk Assessment & Mitigations

### Identified Risks from Research

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Cold Start Latency** | MEDIUM | Pinecone serverless can have 300-400ms cold starts, up to 2-20s for large datasets. **Mitigation**: Implement warm-up pings, use caching for frequent queries |
| **Cross-Region Latency** | MEDIUM | EU↔US deployments add 800ms-1s RTT. **Mitigation**: Deploy Pinecone index in same region as cloud server |
| **Rate Limiting** | LOW | Serverless has rate limits that can throttle high-throughput. **Mitigation**: Implement retry with exponential backoff (Pinecone SDK has built-in) |
| **Vendor Lock-in** | LOW | Pinecone is cloud-only, proprietary. **Mitigation**: Abstract via VectorClient interface for future portability to Qdrant |
| **Embedding Cost Spikes** | LOW | Large re-syncs could increase costs. **Mitigation**: Use incremental sync, cache embeddings |

---

## Option B: Qdrant Cloud Alternative (Detailed Analysis)

### Official Qdrant MCP Server (Reference)

The [official Qdrant MCP server](https://github.com/qdrant/mcp-server-qdrant) provides a reference implementation:
- **Language**: Python (not TypeScript) - we would adapt patterns, not code
- **Tools provided**: `qdrant-store` and `qdrant-find`
- **Default embedding**: sentence-transformers/all-MiniLM-L6-v2 (local, 384 dims)
- **Downloads**: 114K+ on PyPI, 1.1K GitHub stars

### Qdrant TypeScript SDK

For our TypeScript MCP server, we'd use [@qdrant/js-client-rest](https://www.npmjs.com/package/@qdrant/js-client-rest):
- **Weekly downloads**: 186K (popular, production-ready)
- **Latest version**: 1.16.2 (actively maintained)
- **TypeScript**: Full type definitions included
- **Features**: REST API, cloud authentication, collection management

### Qdrant Cloud Pricing

| Tier | Cost | Capacity |
|------|------|----------|
| Free Forever | $0 | 1GB cluster (~1M vectors) |
| Managed Cloud | $0.014/hour | Pay-as-you-go |
| Hybrid Cloud | Custom | On-premises + cloud |

### Implementation Comparison

| Aspect | Pinecone | Qdrant Cloud |
|--------|----------|--------------|
| **SDK Quality** | Excellent TypeScript SDK | Good TypeScript SDK |
| **Cold Start** | 300ms-2s (serverless) | ~50ms (always-on cluster) |
| **Free Tier** | 100K vectors | 1GB (~1M vectors) |
| **Filtering** | Good metadata filtering | Advanced filtering (better for complex queries) |
| **Open Source** | No | Yes (Apache 2.0) |
| **Self-host Option** | No | Yes (can migrate later) |
| **MCP Reference** | No official MCP server | Official Python MCP server available |
| **Complexity** | Simpler (serverless) | Slightly more setup |

### Qdrant Advantages for This Project

1. **No cold start latency**: Cluster is always-on (vs Pinecone serverless)
2. **Larger free tier**: 1GB vs ~100K vectors
3. **Better filtering**: Advanced payload filtering for complex CRM queries
4. **Open source**: Can self-host later if cloud costs increase
5. **Official MCP pattern**: Can reference Python implementation for tool design

### Qdrant Disadvantages

1. **Less polished TypeScript SDK**: Pinecone SDK is slightly more ergonomic
2. **More configuration**: Need to manage cluster vs serverless auto-scale
3. **Python MCP server**: Can't directly use; must reimplement in TypeScript

### Implementation Effort Comparison

| Task | Pinecone | Qdrant |
|------|----------|--------|
| SDK setup | ~1 hour | ~1.5 hours |
| VectorClient wrapper | ~4 hours | ~4 hours |
| Circuit breaker | Same pattern | Same pattern |
| Tools implementation | ~8 hours | ~8 hours |
| **Total estimate** | ~13 hours | ~14 hours |

**Verdict**: Implementation effort is nearly identical. Qdrant has slight advantages (no cold start, larger free tier, open source) but Pinecone has better DX.

### Recommendation

**If cold start latency is a concern**: Choose Qdrant Cloud
**If simplicity is paramount**: Choose Pinecone Serverless
**If future self-hosting is likely**: Choose Qdrant Cloud

Both are viable. The VectorClient abstraction in the plan supports easy switching.

### Benchmark Expectations (from Pinecone docs)

| Metric | Expected | Source |
|--------|----------|--------|
| Query latency (warm) | 20-50ms | Pinecone benchmarks |
| Query latency (cold) | 300-400ms | Community reports |
| Upsert throughput | ~50k vectors/sec | Pinecone benchmarks |
| Filtered query overhead | +3-8x baseline | Research (varies by filter type) |

---

## Testing Approach

### Phase 1-2 Testing
- Verify Pinecone connection and CRUD operations
- Test embedding generation for sample records
- Test full sync with 100 records
- Verify circuit breaker triggers

### Phase 3-4 Testing
- Test semantic queries against known data
- Verify hybrid filters (stage + semantic)
- Test "find similar" with various opportunity types
- Validate pattern clustering results

---

## Critical Integration Points

### src/index.ts (line 28)
```typescript
Promise.all([warmCache(), warmPool(), warmVectorClient()])
```

### src/constants.ts (after EXPORT_CONFIG)
```typescript
export const VECTOR_CONFIG = {
  INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'odoo-crm-opportunities',
  DIMENSION: 1536,
  SYNC_BATCH_SIZE: 100,
  DEFAULT_TOP_K: 10,
  MAX_TOP_K: 50,
  ENABLED: process.env.VECTOR_ENABLED !== 'false',
} as const;
```

### src/tools/crm-tools.ts (new tool registration)
Follow existing pattern at lines 93-124 for registerTool().

---

## Success Criteria

1. Semantic search returns relevant results for natural language queries
2. "Find similar" correctly identifies related opportunities
3. Sync completes successfully for all 6,400+ records
4. Circuit breaker protects against API failures
5. Hybrid search combines filters with semantic ranking
6. Pattern discovery reveals actionable insights in lost deals
