# Vector Database Integration Plan for Odoo CRM MCP Server

**Document ID**: memory19841
**Created**: 2025-12-12
**Last Updated**: 2025-12-12
**Status**: Ready for Implementation
**Estimated Effort**: 8-10 days
**Technology**: Qdrant + Voyage-3-lite (validated as superior to Pinecone + OpenAI)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Technology Choices](#technology-choices)
4. [Type Definitions](#type-definitions)
5. [Implementation Stages](#implementation-stages)
   - [Stage 1: Dependencies & Configuration](#stage-1-dependencies--configuration)
   - [Stage 2: Type Definitions](#stage-2-type-definitions-implementation)
   - [Stage 3: Embedding Service](#stage-3-embedding-service)
   - [Stage 4: Vector Client](#stage-4-vector-client)
   - [Stage 5: Sync Service](#stage-5-sync-service)
   - [Stage 6: Clustering Service](#stage-6-clustering-service)
   - [Stage 7: Zod Schemas](#stage-7-zod-schemas)
   - [Stage 8: MCP Tools](#stage-8-mcp-tools-implementation)
   - [Stage 9: Formatters](#stage-9-formatters)
   - [Stage 10: Integration](#stage-10-integration)
   - [Stage 11: Testing](#stage-11-testing)
6. [Gaps & Mitigations](#gaps--mitigations)
7. [Stage Completion Checklist](#stage-completion-checklist)

---

## Executive Summary

**Goal**: Add semantic search, similar deal finder, and pattern discovery capabilities to the existing Odoo CRM MCP server using vector database technology.

**User Requirements**:
- [x] Semantic Search (find by meaning, not just keywords)
- [x] Similar Deal Finder (find opportunities like a given deal)
- [x] Pattern Discovery (cluster and analyze lost/won deals)
- [x] Cloud APIs acceptable
- [x] Rich CRM data available

**Why Qdrant + Voyage over Pinecone + OpenAI**:
| Factor | Qdrant + Voyage | Pinecone + OpenAI |
|--------|-----------------|-------------------|
| Cold Start | ~50ms (always-on) | 300ms-2s (serverless) |
| Free Tier | 1GB (~1M vectors) | 100K vectors |
| Cost | $0.02/1M tokens | $0.02/1M tokens |
| Open Source | Yes (Apache 2.0) | No |
| Self-host | Yes | No |
| MCP Reference | Official Python MCP | None |

**Comparison Score**: memory19841 (8.25/10) vs memory1984 (6.5/10)

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                            Odoo CRM MCP Server                                     |
|  +-------------------------------------------------------------------------+      |
|  |                        MCP Tool Layer                                    |      |
|  |  NEW TOOLS:                                                              |      |
|  |  - odoo_crm_semantic_search                                             |      |
|  |  - odoo_crm_find_similar_deals                                          |      |
|  |  - odoo_crm_discover_patterns                                           |      |
|  |  - odoo_crm_sync_embeddings                                             |      |
|  |  - odoo_crm_vector_status                                               |      |
|  +--------+-----------------------+------------------------+---------------+      |
|           |                       |                        |                       |
|           v                       v                        v                       |
|  +----------------+    +-------------------+    +--------------------+             |
|  | Odoo Client    |    | Embedding Service |    | Vector Client      |             |
|  | (existing)     |    | (NEW - Voyage AI) |    | (NEW - Qdrant)     |             |
|  +----------------+    +-------------------+    +--------------------+             |
+-----------------------------------------------------------------------------------+
```

### Hybrid Search Flow (Smart Pre-filter Decision)

```
User: "Find deals where customer mentioned budget constraints"
  ↓
Step 1: Extract structured filters → Odoo query (stage, date, revenue)
  ↓
Step 2: Get candidate count from Odoo (searchCount)
  ↓
Step 3: IF count < 1000: Fetch IDs, use Qdrant's id-filter
         IF count >= 1000: Use Qdrant's payload filters directly
  ↓
Step 4: Generate query embedding via Voyage AI (input_type: "query")
  ↓
Step 5: Vector search with semantic ranking
  ↓
Step 6: Return top matches with similarity scores (min 0.6)
```

---

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Vector Database** | Qdrant | No cold start, 1GB free tier, TypeScript SDK, official MCP server |
| **Embedding Model** | Voyage-3-lite | $0.02/1M tokens, 1024 dims, 32K context, input_type support |
| **Clustering** | ml-kmeans | JavaScript-native, sufficient for pattern discovery |
| **Hosting** | Qdrant Cloud (free tier) | Start with cloud for simplicity |

### Cost Estimate (6,400 opportunities)
- Initial embedding: ~$0.03 (one-time)
- Qdrant Cloud free tier: 1GB storage (sufficient)
- Ongoing: ~$0.01/month for new records

---

## Type Definitions

Add these interfaces to `src/types.ts`. These are adapted from memory1984.md for Qdrant:

```typescript
// ============================================
// Vector Database Types (for Qdrant + Voyage)
// ============================================

/**
 * Configuration for Qdrant vector database connection
 */
export interface VectorConfig {
  host: string;              // QDRANT_HOST - e.g., "http://localhost:6333"
  apiKey?: string;           // QDRANT_API_KEY - optional for local, required for cloud
  collectionName: string;    // QDRANT_COLLECTION - e.g., "odoo_crm_leads"
}

/**
 * Configuration for Voyage AI embedding service
 */
export interface EmbeddingConfig {
  apiKey: string;            // VOYAGE_API_KEY
  model: string;             // EMBEDDING_MODEL - "voyage-3-lite"
  dimensions: number;        // EMBEDDING_DIMENSIONS - 1024
}

/**
 * Metadata stored with each vector in Qdrant.
 * These fields enable filtering and are returned with search results.
 */
export interface VectorMetadata {
  // Core identifiers
  odoo_id: number;           // Original Odoo record ID
  name: string;              // Opportunity name

  // Stage and pipeline
  stage_id: number;
  stage_name: string;

  // Assignment
  user_id: number;
  user_name: string;
  team_id?: number;
  team_name?: string;

  // Business metrics
  expected_revenue: number;
  probability: number;

  // Status flags (for filtering)
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;

  // Classification
  sector?: string;
  specification_id?: number;
  specification_name?: string;
  lead_source_id?: number;
  lead_source_name?: string;

  // Location
  city?: string;
  state_id?: number;
  state_name?: string;

  // Lost analysis
  lost_reason_id?: number;
  lost_reason_name?: string;

  // Timestamps
  create_date: string;
  write_date: string;        // For sync conflict detection
  date_closed?: string;

  // Sync tracking
  sync_version: number;
  last_synced: string;
  truncated?: boolean;       // True if description was truncated

  // Original text (for display, not filtering)
  embedding_text: string;
}

/**
 * A single vector record to upsert into Qdrant
 */
export interface VectorRecord {
  id: string;                // String ID (Odoo ID as string)
  values: number[];          // 1024-dimensional embedding vector
  metadata: VectorMetadata;
}

/**
 * Options for vector similarity search
 */
export interface VectorQueryOptions {
  vector: number[];          // Query embedding
  topK: number;              // Number of results (1-50)
  filter?: VectorFilter;     // Optional metadata filters
  minScore?: number;         // Minimum similarity score (default 0.6)
  includeMetadata?: boolean; // Include metadata in results (default true)
}

/**
 * Filter conditions for Qdrant queries.
 * Supports exact match, arrays ($in), and ranges.
 */
export interface VectorFilter {
  stage_id?: number | { $in: number[] };
  user_id?: number | { $in: number[] };
  team_id?: number;
  is_won?: boolean;
  is_lost?: boolean;
  is_active?: boolean;
  state_id?: number;
  sector?: string;
  lost_reason_id?: number;
  expected_revenue?: { $gte?: number; $lte?: number };
  create_date?: { $gte?: string; $lte?: string };
}

/**
 * A single match from vector search
 */
export interface VectorMatch {
  id: string;
  score: number;             // Cosine similarity (0-1)
  metadata?: VectorMetadata;
}

/**
 * Result of a vector search query
 */
export interface VectorQueryResult {
  matches: VectorMatch[];
  searchTimeMs: number;
}

/**
 * Progress tracking during sync operations
 */
export interface SyncProgress {
  phase: 'fetching' | 'embedding' | 'upserting' | 'deleting';
  currentBatch: number;
  totalBatches: number;
  recordsProcessed: number;
  totalRecords: number;
  percentComplete: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  recordsFailed: number;
  recordsDeleted: number;
  durationMs: number;
  syncVersion: number;
  errors?: string[];
}

/**
 * Current status of vector infrastructure
 */
export interface VectorStatus {
  enabled: boolean;
  qdrantConnected: boolean;
  voyageConnected: boolean;
  collectionName: string;
  totalVectors: number;
  lastSync: string | null;
  syncVersion: number;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  errorMessage?: string;
}

/**
 * A semantic search result with enriched lead data
 */
export interface SemanticMatch {
  lead: CrmLead;             // Full Odoo lead record
  similarityScore: number;   // Raw cosine similarity (0-1)
  similarityPercent: number; // Human-readable percentage
  matchExplanation: string;  // e.g., "92% match - Very similar"
}

/**
 * Complete result of semantic search
 */
export interface SemanticSearchResult {
  items: SemanticMatch[];
  total: number;
  queryEmbeddingMs: number;
  vectorSearchMs: number;
  odooEnrichmentMs: number;
  searchMode: 'semantic' | 'hybrid';
}

/**
 * A cluster of similar opportunities (for pattern discovery)
 */
export interface PatternCluster {
  clusterId: number;
  size: number;
  centroidDistance: number;  // Average distance to centroid
  representativeDeals: Array<{
    id: number;
    name: string;
    similarity: number;
  }>;
  commonThemes: {
    topSectors: Array<{ sector: string; count: number }>;
    topLostReasons: Array<{ reason: string; count: number }>;
    avgRevenue: number;
    revenueRange: { min: number; max: number };
  };
  summary: string;           // AI-generated cluster description
}

/**
 * Result of pattern discovery analysis
 */
export interface PatternDiscoveryResult {
  analysisType: 'lost_reasons' | 'winning_factors' | 'deal_segments' | 'objection_themes';
  totalRecordsAnalyzed: number;
  numClusters: number;
  clusters: PatternCluster[];
  insights: string[];        // Key insights across all clusters
  durationMs: number;
}

/**
 * Circuit breaker state for resilience
 */
export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure: number | null;
  lastStateChange: number;
  secondsUntilRetry?: number;
}
```

---

## Implementation Stages

---

### Stage 1: Dependencies & Configuration

**Goal**: Set up project dependencies and configuration without changing existing functionality.

**Files to modify:**
- `package.json` - Add new dependencies
- `src/constants.ts` - Add VECTOR_CONFIG, VOYAGE_CONFIG
- `.env.example` - Document new environment variables

#### Step 1.1: Install Dependencies

```bash
npm install @qdrant/js-client-rest@^1.7.0 voyageai@^0.0.8 ml-kmeans@^6.0.0 object-hash@^3.0.0 p-limit@^5.0.0
npm install -D @types/object-hash@^3.0.6
```

#### Step 1.2: Add Constants to `src/constants.ts`

```typescript
// =============================================================================
// VECTOR DATABASE CONFIGURATION (Qdrant + Voyage AI)
// =============================================================================

/**
 * Qdrant vector database configuration
 */
export const QDRANT_CONFIG = {
  // Connection settings
  HOST: process.env.QDRANT_HOST || 'http://localhost:6333',
  API_KEY: process.env.QDRANT_API_KEY || '',
  COLLECTION_NAME: process.env.QDRANT_COLLECTION || 'odoo_crm_leads',

  // Vector settings
  VECTOR_SIZE: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'),
  DISTANCE_METRIC: 'Cosine' as const,

  // HNSW index settings (create BEFORE data upload)
  HNSW_M: 16,                    // Number of bi-directional links
  HNSW_EF_CONSTRUCT: 100,        // Size of dynamic candidate list

  // Payload indexes to create
  PAYLOAD_INDEXES: [
    { field: 'stage_id', type: 'integer' as const },
    { field: 'user_id', type: 'integer' as const },
    { field: 'team_id', type: 'integer' as const },
    { field: 'expected_revenue', type: 'float' as const },
    { field: 'is_won', type: 'bool' as const },
    { field: 'is_lost', type: 'bool' as const },
    { field: 'is_active', type: 'bool' as const },
    { field: 'create_date', type: 'datetime' as const },
    { field: 'sector', type: 'keyword' as const },
    { field: 'lost_reason_id', type: 'integer' as const },
  ],

  // Enabled flag
  ENABLED: process.env.VECTOR_ENABLED !== 'false',
} as const;

/**
 * Voyage AI embedding configuration
 */
export const VOYAGE_CONFIG = {
  API_KEY: process.env.VOYAGE_API_KEY || '',
  MODEL: process.env.EMBEDDING_MODEL || 'voyage-3-lite',
  DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'),

  // Input types (improves retrieval quality)
  INPUT_TYPE_DOCUMENT: 'document' as const,
  INPUT_TYPE_QUERY: 'query' as const,

  // Batch settings
  MAX_BATCH_SIZE: 128,
  MAX_TOKENS_PER_BATCH: 120000,

  // Text handling
  MAX_WORDS: 2000,               // Truncate descriptions longer than this
  TRUNCATION: true,
} as const;

/**
 * Sync service configuration
 */
export const VECTOR_SYNC_CONFIG = {
  ENABLED: process.env.VECTOR_SYNC_ENABLED !== 'false',
  INTERVAL_MS: parseInt(process.env.VECTOR_SYNC_INTERVAL_MS || '900000'), // 15 min
  BATCH_SIZE: parseInt(process.env.VECTOR_SYNC_BATCH_SIZE || '200'),
  MAX_RECORDS_PER_SYNC: 10000,
} as const;

/**
 * Similarity score thresholds
 * Research shows 0.5 is too low - use 0.6 as default
 */
export const SIMILARITY_THRESHOLDS = {
  VERY_SIMILAR: 0.8,             // Near duplicate
  MEANINGFULLY_SIMILAR: 0.6,     // Good match (default min)
  LOOSELY_RELATED: 0.4,          // Weak match
  DEFAULT_MIN: 0.6,              // Default minimum score
} as const;

/**
 * Circuit breaker for vector services
 */
export const VECTOR_CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 3,          // Open after 3 failures
  RESET_TIMEOUT_MS: 30000,       // Try again after 30s
  HALF_OPEN_MAX_ATTEMPTS: 1,
} as const;
```

#### Step 1.3: Update `.env.example`

```bash
# =============================================================================
# Vector Database Configuration (Qdrant + Voyage AI)
# =============================================================================

# Qdrant Connection
# For local Docker: http://localhost:6333
# For Qdrant Cloud: https://your-cluster.cloud.qdrant.io
QDRANT_HOST=http://localhost:6333
QDRANT_API_KEY=                    # Required for Qdrant Cloud, optional for local
QDRANT_COLLECTION=odoo_crm_leads

# Voyage AI Embeddings
VOYAGE_API_KEY=your-voyage-api-key
EMBEDDING_MODEL=voyage-3-lite
EMBEDDING_DIMENSIONS=1024          # Options: 256, 512, 1024 (default), 2048

# Sync Settings
VECTOR_ENABLED=true                # Set to 'false' to disable vector features
VECTOR_SYNC_ENABLED=true
VECTOR_SYNC_INTERVAL_MS=900000     # 15 minutes
VECTOR_SYNC_BATCH_SIZE=200
```

#### Test Scenarios for Stage 1

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T1.1 | Build project after adding dependencies | No TypeScript errors | `npm run build` succeeds |
| T1.2 | Start server with no vector env vars | Server starts, VECTOR_ENABLED defaults true | `npm run dev` starts without crash |
| T1.3 | Existing tools work unchanged | All 20+ existing tools function | Test `odoo_crm_search_leads` |
| T1.4 | Constants export correctly | QDRANT_CONFIG, VOYAGE_CONFIG accessible | `console.log` in index.ts |
| T1.5 | Set VECTOR_ENABLED=false | Vector features disabled gracefully | Check logs for "disabled" message |

#### Rollback Plan for Stage 1

```bash
# If Stage 1 fails, run these commands to rollback:
npm uninstall @qdrant/js-client-rest voyageai ml-kmeans object-hash p-limit
npm uninstall -D @types/object-hash

# Revert constants.ts to remove QDRANT_CONFIG, VOYAGE_CONFIG, etc.
git checkout src/constants.ts

# Revert .env.example changes
git checkout .env.example
```

**Stage 1 Completion**: ⬜

---

### Stage 2: Type Definitions Implementation

**Goal**: Add TypeScript interfaces to `src/types.ts` without changing runtime behavior.

**Files to modify:**
- `src/types.ts` - Add all vector-related interfaces

#### Step 2.1: Add Types to `src/types.ts`

Add all interfaces from the [Type Definitions](#type-definitions) section above to the end of `src/types.ts`.

#### Test Scenarios for Stage 2

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T2.1 | TypeScript compilation | No type errors | `npm run build` succeeds |
| T2.2 | Types are importable | Can import VectorMetadata, etc. | Create temp test import |
| T2.3 | Existing functionality unchanged | Server operates normally | Run existing tools |
| T2.4 | Types match Qdrant SDK | No conflicts with SDK types | Import both and compare |

#### Rollback Plan for Stage 2

```bash
# If Stage 2 fails, remove added type definitions:
git checkout src/types.ts
```

**Stage 2 Completion**: ⬜

---

### Stage 3: Embedding Service

**Goal**: Create isolated embedding service with Voyage AI. No integration with main server yet.

**Files to create:**
- `src/services/embedding-service.ts`

#### Step 3.1: Create `src/services/embedding-service.ts`

```typescript
/**
 * Embedding Service - Voyage AI Integration
 *
 * Generates embeddings for CRM records using Voyage AI's voyage-3-lite model.
 * Supports single and batch embedding with input_type optimization.
 */

import { VoyageAIClient } from 'voyageai';
import { VOYAGE_CONFIG } from '../constants.js';
import { CrmLead } from '../types.js';
import { stripHtml, getRelationName } from './formatters.js';

// Singleton client
let voyageClient: VoyageAIClient | null = null;

/**
 * Initialize the Voyage AI client.
 * Call this on server startup.
 */
export function initializeEmbeddingService(): VoyageAIClient | null {
  const apiKey = VOYAGE_CONFIG.API_KEY;

  if (!apiKey) {
    console.error('[Embedding] VOYAGE_API_KEY not set - embedding service disabled');
    return null;
  }

  try {
    voyageClient = new VoyageAIClient({ apiKey });
    console.error('[Embedding] Voyage AI service initialized');
    return voyageClient;
  } catch (error) {
    console.error('[Embedding] Failed to initialize:', error);
    return null;
  }
}

/**
 * Get the Voyage client instance.
 */
export function getEmbeddingClient(): VoyageAIClient | null {
  return voyageClient;
}

/**
 * Check if embedding service is available.
 */
export function isEmbeddingServiceAvailable(): boolean {
  return voyageClient !== null;
}

/**
 * Truncate text to maximum word count.
 * Returns { text, truncated } tuple.
 */
function truncateText(text: string, maxWords: number): { text: string; truncated: boolean } {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return { text, truncated: false };
  }
  return {
    text: words.slice(0, maxWords).join(' ') + '...',
    truncated: true,
  };
}

/**
 * Build embedding document text from CRM lead.
 * Combines multiple fields into a semantic document.
 *
 * Format:
 * ```
 * Opportunity: {name}
 * Customer: {contact_name} | Sector: {sector}
 * Location: {city}, {state}
 * Specification: {specification_name}
 * Lead Source: {lead_source_name}
 * Revenue: ${expected_revenue} | Stage: {stage_name}
 * Status: Won/Lost/Active {lost_reason if applicable}
 * Description: {description}
 * ```
 */
export function buildEmbeddingText(lead: CrmLead): { text: string; truncated: boolean } {
  const parts: string[] = [];

  // Core identity
  parts.push(`Opportunity: ${lead.name || 'Untitled'}`);

  // Customer info
  const customerParts: string[] = [];
  if (lead.contact_name) customerParts.push(`Customer: ${lead.contact_name}`);
  if (lead.sector) customerParts.push(`Sector: ${lead.sector}`);
  if (customerParts.length > 0) parts.push(customerParts.join(' | '));

  // Location
  const city = lead.city || '';
  const state = lead.state_id ? getRelationName(lead.state_id) : '';
  if (city || state) {
    parts.push(`Location: ${[city, state].filter(Boolean).join(', ')}`);
  }

  // Classification
  if (lead.specification_id) {
    parts.push(`Specification: ${getRelationName(lead.specification_id)}`);
  }
  if (lead.lead_source_id) {
    parts.push(`Lead Source: ${getRelationName(lead.lead_source_id)}`);
  }

  // Business metrics
  const revenue = lead.expected_revenue
    ? `$${lead.expected_revenue.toLocaleString()}`
    : 'Not specified';
  const stage = lead.stage_id ? getRelationName(lead.stage_id) : 'Unknown';
  parts.push(`Revenue: ${revenue} | Stage: ${stage}`);

  // Status
  const isWon = lead.stage_id && typeof lead.stage_id !== 'number' &&
                lead.stage_id[1]?.toLowerCase().includes('won');
  const isLost = !!lead.lost_reason_id;

  let status = 'Active';
  if (isWon) {
    status = 'Won';
  } else if (isLost) {
    const lostReason = getRelationName(lead.lost_reason_id);
    status = `Lost - ${lostReason}`;
  }
  parts.push(`Status: ${status}`);

  // Description (most semantic content)
  let truncated = false;
  if (lead.description) {
    const cleanDesc = stripHtml(lead.description);
    const result = truncateText(cleanDesc, VOYAGE_CONFIG.MAX_WORDS);
    truncated = result.truncated;
    parts.push(`Description: ${result.text}`);
  }

  return {
    text: parts.join('\n'),
    truncated,
  };
}

/**
 * Generate embedding for a single text.
 *
 * @param text - The text to embed
 * @param inputType - "document" for CRM records, "query" for search queries
 * @returns 1024-dimensional embedding vector
 */
export async function embed(
  text: string,
  inputType: 'document' | 'query' = 'document'
): Promise<number[]> {
  if (!voyageClient) {
    throw new Error('Embedding service not initialized. Call initializeEmbeddingService() first.');
  }

  const response = await voyageClient.embed({
    input: text,
    model: VOYAGE_CONFIG.MODEL,
    inputType: inputType,
  });

  // Voyage returns embeddings in response.data[0].embedding
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batches.
 * More efficient than calling embed() repeatedly.
 *
 * @param texts - Array of texts to embed
 * @param inputType - "document" for CRM records, "query" for search queries
 * @param onProgress - Optional progress callback
 * @returns Array of embedding vectors (same order as input)
 */
export async function embedBatch(
  texts: string[],
  inputType: 'document' | 'query' = 'document',
  onProgress?: (current: number, total: number) => void
): Promise<number[][]> {
  if (!voyageClient) {
    throw new Error('Embedding service not initialized');
  }

  const results: number[][] = [];
  const batchSize = VOYAGE_CONFIG.MAX_BATCH_SIZE;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await voyageClient.embed({
      input: batch,
      model: VOYAGE_CONFIG.MODEL,
      inputType: inputType,
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

/**
 * Estimate token count for cost planning.
 * Rough estimate: ~4 characters per token for English.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Health check for embedding service.
 */
export async function checkEmbeddingHealth(): Promise<{
  available: boolean;
  model: string;
  dimensions: number;
  error?: string;
}> {
  if (!voyageClient) {
    return {
      available: false,
      model: VOYAGE_CONFIG.MODEL,
      dimensions: VOYAGE_CONFIG.DIMENSIONS,
      error: 'Voyage client not initialized',
    };
  }

  try {
    // Small test embedding
    const testVec = await embed('test', 'query');
    return {
      available: true,
      model: VOYAGE_CONFIG.MODEL,
      dimensions: testVec.length,
    };
  } catch (error) {
    return {
      available: false,
      model: VOYAGE_CONFIG.MODEL,
      dimensions: VOYAGE_CONFIG.DIMENSIONS,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

#### Test Scenarios for Stage 3

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T3.1 | Initialize with valid VOYAGE_API_KEY | Returns VoyageAIClient | Set key, call `initializeEmbeddingService()` |
| T3.2 | Initialize with missing key | Returns null, logs warning | Unset key, call init |
| T3.3 | buildEmbeddingText creates valid text | Formatted string with project info | Call with sample CrmLead |
| T3.4 | embed() generates 1024-dim vector | Array of 1024 numbers | Call `embed("test text", "query")` |
| T3.5 | embedBatch() handles multiple texts | Array of arrays | Call with 3 test strings |
| T3.6 | Truncation works for long text | text.truncated = true | Call with 3000+ word text |
| T3.7 | Build compiles without errors | No TypeScript errors | `npm run build` |

#### Manual Test Script for Stage 3

```typescript
// Create test-embedding.ts temporarily
import { initializeEmbeddingService, embed, buildEmbeddingText, embedBatch } from './services/embedding-service.js';

async function testEmbedding() {
  console.log('Initializing...');
  const client = initializeEmbeddingService();

  if (!client) {
    console.error('Failed to initialize - check VOYAGE_API_KEY');
    return;
  }

  const testLead = {
    id: 1,
    name: 'Melbourne University Science Building',
    sector: 'Education',
    city: 'Melbourne',
    state_id: [1, 'Victoria'] as [number, string],
    contact_name: 'Dr. Smith',
    expected_revenue: 500000,
    stage_id: [2, 'Qualified'] as [number, string],
    description: 'HVAC installation project for new science building. Client requires energy-efficient solution with smart controls.',
  };

  // Test buildEmbeddingText
  const { text, truncated } = buildEmbeddingText(testLead as any);
  console.log('\n=== Embedding Text ===');
  console.log(text);
  console.log('Truncated:', truncated);

  // Test embed
  console.log('\n=== Single Embedding ===');
  const vector = await embed(text, 'document');
  console.log('Dimensions:', vector.length);
  console.log('First 5 values:', vector.slice(0, 5));

  // Test embedBatch
  console.log('\n=== Batch Embedding ===');
  const vectors = await embedBatch(['test 1', 'test 2', 'test 3'], 'document');
  console.log('Batch size:', vectors.length);
  console.log('Each vector dims:', vectors[0].length);

  console.log('\n✅ All tests passed!');
}

testEmbedding().catch(console.error);
```

#### Rollback Plan for Stage 3

```bash
# If Stage 3 fails:
rm src/services/embedding-service.ts
```

**Stage 3 Completion**: ⬜

---

### Stage 4: Vector Client

**Goal**: Create Qdrant client wrapper with circuit breaker. No integration yet.

**Files to create:**
- `src/services/vector-client.ts`

#### Step 4.1: Create `src/services/vector-client.ts`

```typescript
/**
 * Vector Client - Qdrant Integration
 *
 * Wraps Qdrant client with circuit breaker for resilience.
 * Handles collection management, upserts, and similarity search.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_CONFIG, VECTOR_CIRCUIT_BREAKER_CONFIG } from '../constants.js';
import { VectorRecord, VectorQueryOptions, VectorQueryResult, VectorMetadata, CircuitBreakerState } from '../types.js';

// Singleton client
let qdrantClient: QdrantClient | null = null;

// Circuit breaker state
const circuitBreaker: CircuitBreakerState = {
  state: 'CLOSED',
  failures: 0,
  lastFailure: null,
  lastStateChange: Date.now(),
};

/**
 * Initialize Qdrant client connection.
 */
export function initializeVectorClient(): boolean {
  if (!QDRANT_CONFIG.ENABLED) {
    console.error('[Vector] Vector features disabled (VECTOR_ENABLED=false)');
    return false;
  }

  try {
    const config: { url: string; apiKey?: string } = {
      url: QDRANT_CONFIG.HOST,
    };

    if (QDRANT_CONFIG.API_KEY) {
      config.apiKey = QDRANT_CONFIG.API_KEY;
    }

    qdrantClient = new QdrantClient(config);
    console.error(`[Vector] Connected to Qdrant at ${QDRANT_CONFIG.HOST}`);
    return true;
  } catch (error) {
    console.error('[Vector] Failed to initialize Qdrant client:', error);
    return false;
  }
}

/**
 * Get the Qdrant client instance.
 */
export function getVectorClient(): QdrantClient | null {
  return qdrantClient;
}

/**
 * Get current circuit breaker state.
 */
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

  return {
    ...circuitBreaker,
    secondsUntilRetry: circuitBreaker.state === 'OPEN' && circuitBreaker.lastFailure
      ? Math.max(0, Math.ceil((VECTOR_CIRCUIT_BREAKER_CONFIG.RESET_TIMEOUT_MS - (Date.now() - circuitBreaker.lastFailure)) / 1000))
      : undefined,
  };
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
    throw new Error(`Vector service unavailable. Retry in ${state.secondsUntilRetry}s`);
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

/**
 * Ensure collection exists with proper configuration.
 * Creates indexes BEFORE any data is uploaded (per Qdrant best practices).
 */
export async function ensureCollection(): Promise<boolean> {
  if (!qdrantClient) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const collections = await qdrantClient!.getCollections();
    const exists = collections.collections.some(c => c.name === QDRANT_CONFIG.COLLECTION_NAME);

    if (!exists) {
      console.error(`[Vector] Creating collection: ${QDRANT_CONFIG.COLLECTION_NAME}`);

      // Create collection with HNSW config
      await qdrantClient!.createCollection(QDRANT_CONFIG.COLLECTION_NAME, {
        vectors: {
          size: QDRANT_CONFIG.VECTOR_SIZE,
          distance: QDRANT_CONFIG.DISTANCE_METRIC,
        },
        hnsw_config: {
          m: QDRANT_CONFIG.HNSW_M,
          ef_construct: QDRANT_CONFIG.HNSW_EF_CONSTRUCT,
        },
      });

      // Create payload indexes BEFORE data upload
      console.error('[Vector] Creating payload indexes...');
      for (const index of QDRANT_CONFIG.PAYLOAD_INDEXES) {
        await qdrantClient!.createPayloadIndex(QDRANT_CONFIG.COLLECTION_NAME, {
          field_name: index.field,
          field_schema: index.type,
        });
      }

      console.error('[Vector] Collection and indexes created successfully');
    }

    return true;
  });
}

/**
 * Get collection statistics.
 */
export async function getCollectionInfo(): Promise<{
  vectorCount: number;
  indexedVectorCount: number;
  segmentsCount: number;
  status: string;
}> {
  if (!qdrantClient) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const info = await qdrantClient!.getCollection(QDRANT_CONFIG.COLLECTION_NAME);
    return {
      vectorCount: info.vectors_count || 0,
      indexedVectorCount: info.indexed_vectors_count || 0,
      segmentsCount: info.segments_count || 0,
      status: info.status,
    };
  });
}

/**
 * Upsert vectors into collection.
 */
export async function upsertPoints(records: VectorRecord[]): Promise<{ upsertedCount: number }> {
  if (!qdrantClient) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const points = records.map(r => ({
      id: r.id,
      vector: r.values,
      payload: r.metadata as Record<string, unknown>,
    }));

    await qdrantClient!.upsert(QDRANT_CONFIG.COLLECTION_NAME, {
      wait: true,
      points,
    });

    return { upsertedCount: points.length };
  });
}

/**
 * Delete vectors by IDs.
 */
export async function deletePoints(ids: string[]): Promise<void> {
  if (!qdrantClient) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    await qdrantClient!.delete(QDRANT_CONFIG.COLLECTION_NAME, {
      wait: true,
      points: ids,
    });
  });
}

/**
 * Get a single point by ID.
 */
export async function getPoint(id: string): Promise<VectorRecord | null> {
  if (!qdrantClient) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const result = await qdrantClient!.retrieve(QDRANT_CONFIG.COLLECTION_NAME, {
      ids: [id],
      with_vector: true,
      with_payload: true,
    });

    if (result.length === 0) return null;

    const point = result[0];
    return {
      id: String(point.id),
      values: point.vector as number[],
      metadata: point.payload as unknown as VectorMetadata,
    };
  });
}

/**
 * Build Qdrant filter from VectorFilter.
 */
function buildQdrantFilter(filter: VectorQueryOptions['filter']): object | undefined {
  if (!filter) return undefined;

  const must: object[] = [];

  // Simple equality filters
  if (filter.stage_id !== undefined) {
    if (typeof filter.stage_id === 'number') {
      must.push({ key: 'stage_id', match: { value: filter.stage_id } });
    } else if (filter.stage_id.$in) {
      must.push({ key: 'stage_id', match: { any: filter.stage_id.$in } });
    }
  }

  if (filter.user_id !== undefined) {
    if (typeof filter.user_id === 'number') {
      must.push({ key: 'user_id', match: { value: filter.user_id } });
    } else if (filter.user_id.$in) {
      must.push({ key: 'user_id', match: { any: filter.user_id.$in } });
    }
  }

  if (filter.team_id !== undefined) {
    must.push({ key: 'team_id', match: { value: filter.team_id } });
  }

  if (filter.is_won !== undefined) {
    must.push({ key: 'is_won', match: { value: filter.is_won } });
  }

  if (filter.is_lost !== undefined) {
    must.push({ key: 'is_lost', match: { value: filter.is_lost } });
  }

  if (filter.is_active !== undefined) {
    must.push({ key: 'is_active', match: { value: filter.is_active } });
  }

  if (filter.state_id !== undefined) {
    must.push({ key: 'state_id', match: { value: filter.state_id } });
  }

  if (filter.sector !== undefined) {
    must.push({ key: 'sector', match: { value: filter.sector } });
  }

  if (filter.lost_reason_id !== undefined) {
    must.push({ key: 'lost_reason_id', match: { value: filter.lost_reason_id } });
  }

  // Range filters
  if (filter.expected_revenue) {
    const range: { gte?: number; lte?: number } = {};
    if (filter.expected_revenue.$gte) range.gte = filter.expected_revenue.$gte;
    if (filter.expected_revenue.$lte) range.lte = filter.expected_revenue.$lte;
    must.push({ key: 'expected_revenue', range });
  }

  if (must.length === 0) return undefined;

  return { must };
}

/**
 * Search for similar vectors.
 */
export async function search(options: VectorQueryOptions): Promise<VectorQueryResult> {
  if (!qdrantClient) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const startTime = Date.now();

    const result = await qdrantClient!.search(QDRANT_CONFIG.COLLECTION_NAME, {
      vector: options.vector,
      limit: options.topK,
      filter: buildQdrantFilter(options.filter),
      score_threshold: options.minScore,
      with_payload: options.includeMetadata ?? true,
    });

    return {
      matches: result.map(m => ({
        id: String(m.id),
        score: m.score,
        metadata: m.payload as unknown as VectorMetadata | undefined,
      })),
      searchTimeMs: Date.now() - startTime,
    };
  });
}

/**
 * Search within a specific set of IDs.
 */
export async function searchWithinIds(
  vector: number[],
  ids: string[],
  topK: number,
  minScore?: number
): Promise<VectorQueryResult> {
  if (!qdrantClient) {
    throw new Error('Vector client not initialized');
  }

  return executeWithCircuitBreaker(async () => {
    const startTime = Date.now();

    const result = await qdrantClient!.search(QDRANT_CONFIG.COLLECTION_NAME, {
      vector,
      limit: topK,
      filter: {
        must: [{ has_id: ids }],
      },
      score_threshold: minScore,
      with_payload: true,
    });

    return {
      matches: result.map(m => ({
        id: String(m.id),
        score: m.score,
        metadata: m.payload as unknown as VectorMetadata | undefined,
      })),
      searchTimeMs: Date.now() - startTime,
    };
  });
}

/**
 * Health check for vector service.
 */
export async function healthCheck(): Promise<{
  connected: boolean;
  collectionName: string;
  vectorCount: number;
  circuitBreakerState: string;
  error?: string;
}> {
  const cbState = getCircuitBreakerState();

  if (!qdrantClient) {
    return {
      connected: false,
      collectionName: QDRANT_CONFIG.COLLECTION_NAME,
      vectorCount: 0,
      circuitBreakerState: cbState.state,
      error: 'Client not initialized',
    };
  }

  try {
    const info = await getCollectionInfo();
    return {
      connected: true,
      collectionName: QDRANT_CONFIG.COLLECTION_NAME,
      vectorCount: info.vectorCount,
      circuitBreakerState: cbState.state,
    };
  } catch (error) {
    return {
      connected: false,
      collectionName: QDRANT_CONFIG.COLLECTION_NAME,
      vectorCount: 0,
      circuitBreakerState: cbState.state,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Warm up vector client on startup.
 */
export async function warmVectorClient(): Promise<void> {
  if (!QDRANT_CONFIG.ENABLED) {
    console.error('[Vector] Vector features disabled');
    return;
  }

  const initialized = initializeVectorClient();
  if (!initialized) return;

  try {
    await ensureCollection();
    const info = await getCollectionInfo();
    console.error(`[Vector] Collection ready: ${info.vectorCount} vectors`);
  } catch (error) {
    console.error('[Vector] Warm-up failed:', error);
  }
}
```

#### Test Scenarios for Stage 4

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T4.1 | Initialize with valid host | Returns true | Start local Qdrant, call `initializeVectorClient()` |
| T4.2 | Initialize with missing host | Returns false, logs warning | Set invalid host |
| T4.3 | ensureCollection creates collection | Collection exists in Qdrant | Check Qdrant dashboard |
| T4.4 | Payload indexes created | 10 indexes present | Check collection in dashboard |
| T4.5 | Circuit breaker starts CLOSED | state === 'CLOSED' | `getCircuitBreakerState()` |
| T4.6 | upsertPoints stores vectors | Vectors visible in Qdrant | Upsert test data, verify |
| T4.7 | search returns matches | Array of matches with scores | Search with test vector |
| T4.8 | healthCheck returns status | { connected: true, ... } | Call `healthCheck()` |
| T4.9 | Build compiles | No errors | `npm run build` |

#### Pre-requisites for Testing Stage 4

```bash
# Option 1: Local Docker
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant:latest

# Option 2: Qdrant Cloud (free tier)
# 1. Create account at https://cloud.qdrant.io
# 2. Create cluster
# 3. Set QDRANT_HOST and QDRANT_API_KEY
```

#### Rollback Plan for Stage 4

```bash
# If Stage 4 fails:
rm src/services/vector-client.ts

# If collection was created, delete it:
# Via Qdrant dashboard or:
curl -X DELETE "http://localhost:6333/collections/odoo_crm_leads"
```

**Stage 4 Completion**: ⬜

---

### Stage 5: Sync Service

**Goal**: Create sync orchestration service connecting Odoo, embedding, and vector services.

**Files to create:**
- `src/services/sync-service.ts`

#### Step 5.1: Create `src/services/sync-service.ts`

```typescript
/**
 * Sync Service - Odoo to Vector Database Synchronization
 *
 * Orchestrates data flow from Odoo CRM to Qdrant vector database.
 * Supports incremental sync and full rebuild with conflict handling.
 */

import { VECTOR_SYNC_CONFIG, CRM_FIELDS } from '../constants.js';
import { CrmLead, VectorRecord, VectorMetadata, SyncProgress, SyncResult, VectorStatus } from '../types.js';
import { useClient } from './odoo-pool.js';
import { buildEmbeddingText, embedBatch, isEmbeddingServiceAvailable } from './embedding-service.js';
import { upsertPoints, deletePoints, getCollectionInfo, getCircuitBreakerState, healthCheck } from './vector-client.js';
import { getRelationName } from './formatters.js';

// Sync state
let lastSyncTime: string | null = null;
let syncVersion = 0;
let isSyncing = false;

/**
 * Get last sync timestamp.
 */
export function getLastSyncTime(): string | null {
  return lastSyncTime;
}

/**
 * Get current sync version.
 */
export function getSyncVersion(): number {
  return syncVersion;
}

/**
 * Check if sync is currently in progress.
 */
export function isSyncInProgress(): boolean {
  return isSyncing;
}

/**
 * Build VectorMetadata from CrmLead.
 */
function buildMetadata(lead: CrmLead, embeddingText: string, truncated: boolean): VectorMetadata {
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
    lead_source_id: typeof lead.lead_source_id === 'number' ? lead.lead_source_id : (lead.lead_source_id?.[0] || undefined),
    lead_source_name: lead.lead_source_id ? getRelationName(lead.lead_source_id) : undefined,
    city: lead.city || undefined,
    state_id: typeof lead.state_id === 'number' ? lead.state_id : (lead.state_id?.[0] || undefined),
    state_name: lead.state_id ? getRelationName(lead.state_id) : undefined,
    lost_reason_id: typeof lead.lost_reason_id === 'number' ? lead.lost_reason_id : (lead.lost_reason_id?.[0] || undefined),
    lost_reason_name: lead.lost_reason_id ? getRelationName(lead.lost_reason_id) : undefined,
    create_date: lead.create_date || new Date().toISOString(),
    write_date: lead.write_date || new Date().toISOString(),
    date_closed: lead.date_closed || undefined,
    sync_version: syncVersion + 1,
    last_synced: new Date().toISOString(),
    truncated,
    embedding_text: embeddingText,
  };
}

/**
 * Full sync - rebuild entire vector index.
 */
export async function fullSync(
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  if (isSyncing) {
    return {
      success: false,
      recordsSynced: 0,
      recordsFailed: 0,
      recordsDeleted: 0,
      durationMs: 0,
      syncVersion,
      errors: ['Sync already in progress'],
    };
  }

  isSyncing = true;
  const startTime = Date.now();
  const errors: string[] = [];
  let recordsSynced = 0;
  let recordsFailed = 0;

  try {
    // Phase 1: Fetch all active opportunities from Odoo
    const leads = await useClient(async (client) => {
      const domain = [['active', '=', true]];
      const total = await client.searchCount('crm.lead', domain);

      const allLeads: CrmLead[] = [];
      const batchSize = VECTOR_SYNC_CONFIG.BATCH_SIZE;
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
            currentBatch: Math.floor(i / batchSize) + 1,
            totalBatches,
            recordsProcessed: allLeads.length,
            totalRecords: total,
            percentComplete: Math.round((allLeads.length / total) * 33),
            elapsedMs: Date.now() - startTime,
          });
        }
      }

      return allLeads;
    });

    // Phase 2: Generate embeddings
    const embeddingData = leads.map(lead => buildEmbeddingText(lead));
    const documents = embeddingData.map(d => d.text);

    const embeddings = await embedBatch(documents, 'document', (current, total) => {
      if (onProgress) {
        onProgress({
          phase: 'embedding',
          currentBatch: current,
          totalBatches: total,
          recordsProcessed: current,
          totalRecords: total,
          percentComplete: 33 + Math.round((current / total) * 33),
          elapsedMs: Date.now() - startTime,
        });
      }
    });

    // Phase 3: Upsert to Qdrant in batches
    const vectorBatchSize = 100;
    for (let i = 0; i < leads.length; i += vectorBatchSize) {
      const batchLeads = leads.slice(i, i + vectorBatchSize);
      const batchEmbeddings = embeddings.slice(i, i + vectorBatchSize);
      const batchEmbeddingData = embeddingData.slice(i, i + vectorBatchSize);

      const records: VectorRecord[] = batchLeads.map((lead, idx) => ({
        id: String(lead.id),
        values: batchEmbeddings[idx],
        metadata: buildMetadata(lead, batchEmbeddingData[idx].text, batchEmbeddingData[idx].truncated),
      }));

      try {
        await upsertPoints(records);
        recordsSynced += records.length;
      } catch (error) {
        recordsFailed += records.length;
        errors.push(`Batch ${Math.floor(i / vectorBatchSize) + 1}: ${error}`);
      }

      if (onProgress) {
        const processed = Math.min(i + vectorBatchSize, leads.length);
        onProgress({
          phase: 'upserting',
          currentBatch: Math.floor(i / vectorBatchSize) + 1,
          totalBatches: Math.ceil(leads.length / vectorBatchSize),
          recordsProcessed: processed,
          totalRecords: leads.length,
          percentComplete: 66 + Math.round((processed / leads.length) * 34),
          elapsedMs: Date.now() - startTime,
        });
      }
    }

    syncVersion++;
    lastSyncTime = new Date().toISOString();

    return {
      success: recordsFailed === 0,
      recordsSynced,
      recordsFailed,
      recordsDeleted: 0,
      durationMs: Date.now() - startTime,
      syncVersion,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (error) {
    return {
      success: false,
      recordsSynced,
      recordsFailed,
      recordsDeleted: 0,
      durationMs: Date.now() - startTime,
      syncVersion,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Incremental sync - only sync changed records.
 */
export async function incrementalSync(
  since?: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  if (isSyncing) {
    return {
      success: false,
      recordsSynced: 0,
      recordsFailed: 0,
      recordsDeleted: 0,
      durationMs: 0,
      syncVersion,
      errors: ['Sync already in progress'],
    };
  }

  isSyncing = true;
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
        recordsSynced: 0,
        recordsFailed: 0,
        recordsDeleted: 0,
        durationMs: Date.now() - startTime,
        syncVersion,
      };
    }

    // Generate embeddings and upsert
    const embeddingData = leads.map(lead => buildEmbeddingText(lead));
    const documents = embeddingData.map(d => d.text);
    const embeddings = await embedBatch(documents, 'document');

    const records: VectorRecord[] = leads.map((lead, idx) => ({
      id: String(lead.id),
      values: embeddings[idx],
      metadata: buildMetadata(lead, embeddingData[idx].text, embeddingData[idx].truncated),
    }));

    try {
      await upsertPoints(records);
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
      recordsSynced,
      recordsFailed,
      recordsDeleted: 0,
      durationMs: Date.now() - startTime,
      syncVersion,
      errors: errors.length > 0 ? errors : undefined,
    };

  } catch (error) {
    return {
      success: false,
      recordsSynced,
      recordsFailed,
      recordsDeleted: 0,
      durationMs: Date.now() - startTime,
      syncVersion,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Sync a single record by ID.
 */
export async function syncRecord(leadId: number): Promise<SyncResult> {
  const startTime = Date.now();

  try {
    const leads = await useClient(async (client) => {
      return client.searchRead<CrmLead>(
        'crm.lead',
        [['id', '=', leadId]],
        CRM_FIELDS.LEAD_DETAIL
      );
    });

    if (leads.length === 0) {
      return {
        success: false,
        recordsSynced: 0,
        recordsFailed: 0,
        recordsDeleted: 0,
        durationMs: Date.now() - startTime,
        syncVersion,
        errors: [`Lead ID ${leadId} not found`],
      };
    }

    const lead = leads[0];
    const { text, truncated } = buildEmbeddingText(lead);
    const [embedding] = await embedBatch([text], 'document');

    const record: VectorRecord = {
      id: String(lead.id),
      values: embedding,
      metadata: buildMetadata(lead, text, truncated),
    };

    await upsertPoints([record]);

    return {
      success: true,
      recordsSynced: 1,
      recordsFailed: 0,
      recordsDeleted: 0,
      durationMs: Date.now() - startTime,
      syncVersion,
    };

  } catch (error) {
    return {
      success: false,
      recordsSynced: 0,
      recordsFailed: 1,
      recordsDeleted: 0,
      durationMs: Date.now() - startTime,
      syncVersion,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Get comprehensive vector status.
 */
export async function getVectorStatus(): Promise<VectorStatus> {
  const cbState = getCircuitBreakerState();

  if (!VECTOR_SYNC_CONFIG.ENABLED) {
    return {
      enabled: false,
      qdrantConnected: false,
      voyageConnected: false,
      collectionName: '',
      totalVectors: 0,
      lastSync: null,
      syncVersion: 0,
      circuitBreakerState: 'CLOSED',
      errorMessage: 'Vector features disabled',
    };
  }

  const qdrantHealth = await healthCheck();
  const voyageAvailable = isEmbeddingServiceAvailable();

  return {
    enabled: true,
    qdrantConnected: qdrantHealth.connected,
    voyageConnected: voyageAvailable,
    collectionName: qdrantHealth.collectionName,
    totalVectors: qdrantHealth.vectorCount,
    lastSync: lastSyncTime,
    syncVersion,
    circuitBreakerState: cbState.state,
    errorMessage: qdrantHealth.error,
  };
}
```

#### Test Scenarios for Stage 5

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T5.1 | fullSync with 10 test records | SyncResult with recordsSynced=10 | Limit Odoo query, call `fullSync()` |
| T5.2 | Progress callback fires for each phase | Progress reported 3 phases | Add console.log in callback |
| T5.3 | getVectorStatus returns valid data | Object with vector count | After sync, call `getVectorStatus()` |
| T5.4 | incrementalSync with no changes | recordsSynced=0 | Call immediately after fullSync |
| T5.5 | syncRecord updates single lead | recordsSynced=1 | Call with valid lead ID |
| T5.6 | Concurrent sync prevented | Error "already in progress" | Call fullSync twice |
| T5.7 | Build compiles | No errors | `npm run build` |

#### Rollback Plan for Stage 5

```bash
# If Stage 5 fails:
rm src/services/sync-service.ts
```

**Stage 5 Completion**: ⬜

---

### Stage 6: Clustering Service

**Goal**: Create K-means clustering service for pattern discovery.

**Files to create:**
- `src/services/clustering-service.ts`

#### Step 6.1: Create `src/services/clustering-service.ts`

```typescript
/**
 * Clustering Service - Pattern Discovery
 *
 * Uses K-means clustering to identify patterns in CRM data.
 * Groups similar opportunities to discover common themes.
 */

import kmeans from 'ml-kmeans';
import { PatternCluster, PatternDiscoveryResult, VectorMetadata, VectorMatch } from '../types.js';
import { search } from './vector-client.js';
import { embed } from './embedding-service.js';

/**
 * Cluster embeddings using K-means.
 *
 * @param embeddings - Array of embedding vectors
 * @param numClusters - Number of clusters to create (2-10)
 * @returns Cluster assignments for each embedding
 */
export function clusterEmbeddings(
  embeddings: number[][],
  numClusters: number
): { clusters: number[]; centroids: number[][] } {
  if (embeddings.length < numClusters) {
    throw new Error(`Not enough data: ${embeddings.length} embeddings for ${numClusters} clusters`);
  }

  const result = kmeans(embeddings, numClusters, {
    initialization: 'kmeans++',
    maxIterations: 100,
  });

  return {
    clusters: result.clusters,
    centroids: result.centroids,
  };
}

/**
 * Find vectors closest to a centroid.
 */
function findClosestToCenter(
  embeddings: number[][],
  metadata: VectorMetadata[],
  centroid: number[],
  clusterIndices: number[],
  topN: number
): Array<{ metadata: VectorMetadata; distance: number }> {
  const distances = clusterIndices.map(idx => {
    const embedding = embeddings[idx];
    // Cosine distance = 1 - cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < embedding.length; i++) {
      dotProduct += embedding[i] * centroid[i];
      normA += embedding[i] * embedding[i];
      normB += centroid[i] * centroid[i];
    }
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return {
      idx,
      distance: 1 - similarity,
      metadata: metadata[idx],
    };
  });

  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, topN).map(d => ({
    metadata: d.metadata,
    distance: d.distance,
  }));
}

/**
 * Analyze cluster for common themes.
 */
function analyzeClusterThemes(members: VectorMetadata[]): PatternCluster['commonThemes'] {
  // Count sectors
  const sectorCounts = new Map<string, number>();
  members.forEach(m => {
    if (m.sector) {
      sectorCounts.set(m.sector, (sectorCounts.get(m.sector) || 0) + 1);
    }
  });
  const topSectors = Array.from(sectorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sector, count]) => ({ sector, count }));

  // Count lost reasons
  const reasonCounts = new Map<string, number>();
  members.forEach(m => {
    if (m.lost_reason_name) {
      reasonCounts.set(m.lost_reason_name, (reasonCounts.get(m.lost_reason_name) || 0) + 1);
    }
  });
  const topLostReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));

  // Revenue stats
  const revenues = members.map(m => m.expected_revenue).filter(r => r > 0);
  const avgRevenue = revenues.length > 0
    ? revenues.reduce((a, b) => a + b, 0) / revenues.length
    : 0;
  const revenueRange = {
    min: revenues.length > 0 ? Math.min(...revenues) : 0,
    max: revenues.length > 0 ? Math.max(...revenues) : 0,
  };

  return {
    topSectors,
    topLostReasons,
    avgRevenue,
    revenueRange,
  };
}

/**
 * Generate human-readable cluster summary.
 */
function generateClusterSummary(themes: PatternCluster['commonThemes'], size: number): string {
  const parts: string[] = [];

  parts.push(`${size} opportunities`);

  if (themes.topSectors.length > 0) {
    const sectors = themes.topSectors.map(s => s.sector).join(', ');
    parts.push(`primarily in ${sectors}`);
  }

  if (themes.avgRevenue > 0) {
    parts.push(`avg deal size $${Math.round(themes.avgRevenue).toLocaleString()}`);
  }

  if (themes.topLostReasons.length > 0) {
    const topReason = themes.topLostReasons[0];
    parts.push(`most common loss: ${topReason.reason} (${topReason.count})`);
  }

  return parts.join('; ');
}

/**
 * Discover patterns in CRM data using clustering.
 */
export async function discoverPatterns(
  analysisType: 'lost_reasons' | 'winning_factors' | 'deal_segments' | 'objection_themes',
  filter: { is_lost?: boolean; is_won?: boolean; sector?: string; min_revenue?: number },
  numClusters: number = 5
): Promise<PatternDiscoveryResult> {
  const startTime = Date.now();

  // Build filter based on analysis type
  const vectorFilter: Record<string, unknown> = {};

  if (analysisType === 'lost_reasons' || analysisType === 'objection_themes') {
    vectorFilter.is_lost = true;
  } else if (analysisType === 'winning_factors') {
    vectorFilter.is_won = true;
  }

  if (filter.sector) {
    vectorFilter.sector = filter.sector;
  }

  if (filter.min_revenue) {
    vectorFilter.expected_revenue = { $gte: filter.min_revenue };
  }

  // Get all matching vectors (up to 1000 for clustering)
  const dummyVector = new Array(1024).fill(0);
  const searchResult = await search({
    vector: dummyVector,
    topK: 1000,
    filter: vectorFilter as any,
    minScore: 0, // Get all regardless of similarity
    includeMetadata: true,
  });

  if (searchResult.matches.length < numClusters * 2) {
    return {
      analysisType,
      totalRecordsAnalyzed: searchResult.matches.length,
      numClusters: 0,
      clusters: [],
      insights: [`Not enough data for clustering: ${searchResult.matches.length} records found`],
      durationMs: Date.now() - startTime,
    };
  }

  // Extract embeddings and metadata
  // Note: We need to re-fetch embeddings from Qdrant since search doesn't return vectors
  // For now, we'll use the query to generate new embeddings from metadata text
  const embeddings: number[][] = [];
  const metadata: VectorMetadata[] = [];

  for (const match of searchResult.matches) {
    if (match.metadata) {
      const embedding = await embed(match.metadata.embedding_text, 'document');
      embeddings.push(embedding);
      metadata.push(match.metadata);
    }
  }

  // Cluster
  const { clusters: clusterAssignments, centroids } = clusterEmbeddings(embeddings, numClusters);

  // Build cluster objects
  const clusterResults: PatternCluster[] = [];

  for (let clusterId = 0; clusterId < numClusters; clusterId++) {
    const memberIndices = clusterAssignments
      .map((c, idx) => c === clusterId ? idx : -1)
      .filter(idx => idx >= 0);

    if (memberIndices.length === 0) continue;

    const clusterMetadata = memberIndices.map(idx => metadata[idx]);
    const closest = findClosestToCenter(embeddings, metadata, centroids[clusterId], memberIndices, 3);
    const themes = analyzeClusterThemes(clusterMetadata);

    // Calculate average distance to centroid
    const avgDistance = closest.reduce((sum, c) => sum + c.distance, 0) / closest.length;

    clusterResults.push({
      clusterId,
      size: memberIndices.length,
      centroidDistance: avgDistance,
      representativeDeals: closest.map(c => ({
        id: c.metadata.odoo_id,
        name: c.metadata.name,
        similarity: 1 - c.distance,
      })),
      commonThemes: themes,
      summary: generateClusterSummary(themes, memberIndices.length),
    });
  }

  // Sort clusters by size
  clusterResults.sort((a, b) => b.size - a.size);

  // Generate insights
  const insights: string[] = [];

  if (clusterResults.length > 0) {
    const largest = clusterResults[0];
    insights.push(`Largest pattern: ${largest.summary}`);

    if (analysisType === 'lost_reasons' && largest.commonThemes.topLostReasons.length > 0) {
      const topReason = largest.commonThemes.topLostReasons[0];
      const percentage = Math.round((topReason.count / largest.size) * 100);
      insights.push(`${percentage}% of cluster 1 lost due to: ${topReason.reason}`);
    }
  }

  return {
    analysisType,
    totalRecordsAnalyzed: metadata.length,
    numClusters: clusterResults.length,
    clusters: clusterResults,
    insights,
    durationMs: Date.now() - startTime,
  };
}
```

#### Test Scenarios for Stage 6

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T6.1 | clusterEmbeddings with 100 vectors | Cluster assignments | Call with test data |
| T6.2 | discoverPatterns for lost_reasons | PatternDiscoveryResult | Call after sync |
| T6.3 | Cluster summaries are readable | Human-readable text | Check summary field |
| T6.4 | Too few records handled | Graceful message | Call with numClusters > data |
| T6.5 | Build compiles | No errors | `npm run build` |

#### Rollback Plan for Stage 6

```bash
# If Stage 6 fails:
rm src/services/clustering-service.ts
```

**Stage 6 Completion**: ⬜

---

### Stage 7: Zod Schemas

**Goal**: Add Zod validation schemas for vector tools.

**Files to modify:**
- `src/schemas/index.ts`

#### Step 7.1: Add Schemas to `src/schemas/index.ts`

```typescript
// =============================================================================
// VECTOR TOOL SCHEMAS
// =============================================================================

import { SIMILARITY_THRESHOLDS } from '../constants.js';

/**
 * Schema for semantic search tool.
 */
export const SemanticSearchSchema = z.object({
  query: z.string()
    .min(10, 'Query must be at least 10 characters')
    .max(500, 'Query too long (max 500 characters)')
    .describe("Natural language search query. Examples: 'education projects similar to university jobs', 'large commercial HVAC projects we lost to competitors'"),

  limit: z.number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Number of results to return'),

  min_similarity: z.number()
    .min(0)
    .max(1)
    .default(SIMILARITY_THRESHOLDS.DEFAULT_MIN)
    .describe('Minimum similarity score (0-1). Default 0.6 = meaningfully similar'),

  // Filters
  stage_id: z.number().int().positive().optional()
    .describe('Filter by pipeline stage ID'),

  user_id: z.number().int().positive().optional()
    .describe('Filter by salesperson ID'),

  team_id: z.number().int().positive().optional()
    .describe('Filter by sales team ID'),

  is_won: z.boolean().optional()
    .describe('Filter for won opportunities only'),

  is_lost: z.boolean().optional()
    .describe('Filter for lost opportunities only'),

  min_revenue: z.number().optional()
    .describe('Minimum expected revenue'),

  max_revenue: z.number().optional()
    .describe('Maximum expected revenue'),

  state_id: z.number().int().positive().optional()
    .describe('Filter by Australian state/territory ID'),

  sector: z.string().optional()
    .describe('Filter by sector name'),

  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN)
    .describe('Output format: markdown, json, or csv'),
});
export type SemanticSearchInput = z.infer<typeof SemanticSearchSchema>;

/**
 * Schema for find similar deals tool.
 */
export const FindSimilarDealsSchema = z.object({
  lead_id: z.number()
    .int()
    .positive()
    .describe('The Odoo opportunity ID to find similar records for'),

  limit: z.number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Number of similar opportunities to return'),

  include_outcomes: z.array(z.enum(['won', 'lost', 'active']))
    .default(['won', 'lost', 'active'])
    .describe('Which outcomes to include in results'),

  exclude_same_partner: z.boolean()
    .default(false)
    .describe('Exclude opportunities from the same partner/company'),

  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
});
export type FindSimilarDealsInput = z.infer<typeof FindSimilarDealsSchema>;

/**
 * Schema for discover patterns tool.
 */
export const DiscoverPatternsSchema = z.object({
  analysis_type: z.enum(['lost_reasons', 'winning_factors', 'deal_segments', 'objection_themes'])
    .describe('Type of pattern analysis to perform'),

  num_clusters: z.number()
    .int()
    .min(2)
    .max(10)
    .default(5)
    .describe('Number of pattern clusters to identify'),

  // Filters
  sector: z.string().optional()
    .describe('Focus on specific sector'),

  min_revenue: z.number().optional()
    .describe('Minimum revenue threshold (e.g., 55000000 for $55M+)'),

  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date for analysis (YYYY-MM-DD)'),

  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date for analysis (YYYY-MM-DD)'),

  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
});
export type DiscoverPatternsInput = z.infer<typeof DiscoverPatternsSchema>;

/**
 * Schema for sync embeddings tool.
 */
export const SyncEmbeddingsSchema = z.object({
  action: z.enum(['status', 'sync_new', 'full_rebuild', 'sync_record'])
    .describe("'status' checks sync state, 'sync_new' syncs changed records, 'full_rebuild' rebuilds entire index, 'sync_record' syncs specific record"),

  lead_id: z.number().int().positive().optional()
    .describe('For sync_record action: the specific lead ID to sync'),

  batch_size: z.number()
    .int()
    .min(10)
    .max(500)
    .default(200)
    .describe('For full_rebuild: records per batch'),
});
export type SyncEmbeddingsInput = z.infer<typeof SyncEmbeddingsSchema>;

/**
 * Schema for vector status tool.
 */
export const VectorStatusSchema = z.object({
  include_sample: z.boolean()
    .default(false)
    .describe('Include a sample vector for debugging'),
});
export type VectorStatusInput = z.infer<typeof VectorStatusSchema>;
```

#### Test Scenarios for Stage 7

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T7.1 | SemanticSearchSchema validates good input | No errors | `Schema.parse({ query: "test query here" })` |
| T7.2 | SemanticSearchSchema rejects short query | ZodError | `Schema.parse({ query: "short" })` |
| T7.3 | Default values applied | min_similarity = 0.6 | `Schema.parse({})` |
| T7.4 | DiscoverPatternsSchema validates | No errors | Parse with analysis_type |
| T7.5 | Build compiles | No errors | `npm run build` |

#### Rollback Plan for Stage 7

```bash
# If Stage 7 fails:
git checkout src/schemas/index.ts
```

**Stage 7 Completion**: ⬜

---

### Stage 8: MCP Tools Implementation

**Goal**: Register all 5 vector MCP tools.

**Files to create:**
- `src/tools/vector-tools.ts`

**Files to modify:**
- `src/tools/crm-tools.ts` (import and register)

#### Step 8.1: Create `src/tools/vector-tools.ts`

```typescript
/**
 * Vector Tools - MCP Tool Registration
 *
 * Registers 5 new vector-powered tools:
 * - odoo_crm_semantic_search
 * - odoo_crm_find_similar_deals
 * - odoo_crm_discover_patterns
 * - odoo_crm_sync_embeddings
 * - odoo_crm_vector_status
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  SemanticSearchSchema,
  FindSimilarDealsSchema,
  DiscoverPatternsSchema,
  SyncEmbeddingsSchema,
  VectorStatusSchema,
} from '../schemas/index.js';
import { QDRANT_CONFIG, SIMILARITY_THRESHOLDS } from '../constants.js';
import { embed, isEmbeddingServiceAvailable } from '../services/embedding-service.js';
import { search, getPoint, healthCheck, getCircuitBreakerState } from '../services/vector-client.js';
import { fullSync, incrementalSync, syncRecord, getVectorStatus, isSyncInProgress } from '../services/sync-service.js';
import { discoverPatterns } from '../services/clustering-service.js';
import { useClient } from '../services/odoo-pool.js';
import { CrmLead } from '../types.js';
import { CRM_FIELDS } from '../constants.js';
import {
  formatSemanticSearchResults,
  formatSimilarDeals,
  formatPatternDiscovery,
  formatSyncResult,
  formatVectorStatus,
} from '../services/formatters.js';

// Error message templates
const ERROR_TEMPLATES = {
  QDRANT_UNAVAILABLE: (retrySeconds?: number) => `**Semantic Search Unavailable**

The vector database is temporarily unreachable. This can happen if:
- Qdrant service is restarting
- Network connectivity issue

**Alternative**: Use \`odoo_crm_search_leads\` with the \`query\` parameter for keyword-based search.

${retrySeconds ? `Retry in: ${retrySeconds}s` : ''}`,

  NO_EMBEDDINGS: (recordCount: number) => `**No Embeddings Found**

Vector search requires embeddings to be generated first.

**Action Required**: Run \`odoo_crm_sync_embeddings\` with action="full_rebuild" to generate embeddings for your CRM data.

Estimated time: ~5 minutes for ${recordCount} opportunities.`,

  VOYAGE_ERROR: (message: string) => `**Embedding Service Error**

Unable to generate search embedding. API error: ${message}

**Fallback**: Try again in a few minutes, or use \`odoo_crm_search_leads\` for keyword search.`,
};

/**
 * Register all vector tools with the MCP server.
 */
export function registerVectorTools(server: Server): void {
  // Skip if vector features disabled
  if (!QDRANT_CONFIG.ENABLED) {
    console.error('[VectorTools] Vector features disabled - skipping tool registration');
    return;
  }

  // =========================================================================
  // Tool: odoo_crm_semantic_search
  // =========================================================================
  server.tool(
    'odoo_crm_semantic_search',
    `Semantic search across CRM opportunities using natural language.

    Examples:
    - "Find education projects similar to university jobs"
    - "Large commercial HVAC projects we lost to competitors"
    - "Projects in Victoria with complex installation requirements"

    Returns opportunities ranked by semantic similarity (min 60% match by default).`,
    SemanticSearchSchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const input = SemanticSearchSchema.parse(args);

        // Check services
        const cbState = getCircuitBreakerState();
        if (cbState.state === 'OPEN') {
          return {
            content: [{ type: 'text', text: ERROR_TEMPLATES.QDRANT_UNAVAILABLE(cbState.secondsUntilRetry) }],
          };
        }

        if (!isEmbeddingServiceAvailable()) {
          return {
            content: [{ type: 'text', text: ERROR_TEMPLATES.VOYAGE_ERROR('Service not initialized') }],
          };
        }

        // Generate query embedding
        const queryEmbedding = await embed(input.query, 'query');

        // Build filter
        const filter: Record<string, unknown> = {};
        if (input.stage_id) filter.stage_id = input.stage_id;
        if (input.user_id) filter.user_id = input.user_id;
        if (input.team_id) filter.team_id = input.team_id;
        if (input.is_won !== undefined) filter.is_won = input.is_won;
        if (input.is_lost !== undefined) filter.is_lost = input.is_lost;
        if (input.state_id) filter.state_id = input.state_id;
        if (input.sector) filter.sector = input.sector;
        if (input.min_revenue || input.max_revenue) {
          const revenueFilter: Record<string, number> = {};
          if (input.min_revenue) revenueFilter.$gte = input.min_revenue;
          if (input.max_revenue) revenueFilter.$lte = input.max_revenue;
          filter.expected_revenue = revenueFilter;
        }

        // Vector search
        const searchResult = await search({
          vector: queryEmbedding,
          topK: input.limit,
          filter: Object.keys(filter).length > 0 ? filter as any : undefined,
          minScore: input.min_similarity,
          includeMetadata: true,
        });

        if (searchResult.matches.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No opportunities found matching "${input.query}" with similarity >= ${Math.round(input.min_similarity * 100)}%.

Try:
- Lowering min_similarity (e.g., 0.5)
- Broadening your query
- Removing filters`,
            }],
          };
        }

        // Enrich with full Odoo data
        const leadIds = searchResult.matches.map(m => parseInt(m.id));
        const leads = await useClient(async (client) => {
          return client.searchRead<CrmLead>(
            'crm.lead',
            [['id', 'in', leadIds]],
            CRM_FIELDS.LEAD_DETAIL
          );
        });

        // Format output
        const output = formatSemanticSearchResults(
          searchResult.matches,
          leads,
          input.query,
          input.response_format
        );

        return { content: [{ type: 'text', text: output }] };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // =========================================================================
  // Tool: odoo_crm_find_similar_deals
  // =========================================================================
  server.tool(
    'odoo_crm_find_similar_deals',
    `Find opportunities similar to a reference deal.

    Use cases:
    - Proposal preparation (find similar won deals)
    - Pattern analysis (find similar lost deals)
    - Relationship discovery`,
    FindSimilarDealsSchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const input = FindSimilarDealsSchema.parse(args);

        // Get reference deal embedding
        const refPoint = await getPoint(String(input.lead_id));
        if (!refPoint) {
          return {
            content: [{
              type: 'text',
              text: `Lead ID ${input.lead_id} not found in vector database. Run sync first.`,
            }],
          };
        }

        // Build filter for outcomes
        const outcomeFilter: Record<string, boolean> = {};
        if (!input.include_outcomes.includes('won')) outcomeFilter.is_won = false;
        if (!input.include_outcomes.includes('lost')) outcomeFilter.is_lost = false;
        if (!input.include_outcomes.includes('active')) outcomeFilter.is_active = false;

        // Search for similar
        const searchResult = await search({
          vector: refPoint.values,
          topK: input.limit + 1, // +1 to exclude self
          filter: Object.keys(outcomeFilter).length > 0 ? outcomeFilter as any : undefined,
          minScore: SIMILARITY_THRESHOLDS.LOOSELY_RELATED,
          includeMetadata: true,
        });

        // Exclude self
        const matches = searchResult.matches.filter(m => m.id !== String(input.lead_id));

        // Get full lead data
        const leadIds = matches.map(m => parseInt(m.id));
        const leads = await useClient(async (client) => {
          return client.searchRead<CrmLead>(
            'crm.lead',
            [['id', 'in', leadIds]],
            CRM_FIELDS.LEAD_DETAIL
          );
        });

        const output = formatSimilarDeals(
          matches,
          leads,
          refPoint.metadata!,
          input.response_format
        );

        return { content: [{ type: 'text', text: output }] };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // =========================================================================
  // Tool: odoo_crm_discover_patterns
  // =========================================================================
  server.tool(
    'odoo_crm_discover_patterns',
    `Discover patterns in CRM data using clustering analysis.

    Analysis types:
    - lost_reasons: Patterns in lost opportunities
    - winning_factors: Patterns in won opportunities
    - deal_segments: Segment all opportunities
    - objection_themes: Group by objection patterns`,
    DiscoverPatternsSchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const input = DiscoverPatternsSchema.parse(args);

        const result = await discoverPatterns(
          input.analysis_type,
          {
            sector: input.sector,
            min_revenue: input.min_revenue,
          },
          input.num_clusters
        );

        const output = formatPatternDiscovery(result, input.response_format);

        return { content: [{ type: 'text', text: output }] };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // =========================================================================
  // Tool: odoo_crm_sync_embeddings
  // =========================================================================
  server.tool(
    'odoo_crm_sync_embeddings',
    `Manage vector database synchronization.

    Actions:
    - status: Check sync state
    - sync_new: Sync changed records since last sync
    - full_rebuild: Rebuild entire index (~5 min for 6K records)
    - sync_record: Sync a specific record by ID`,
    SyncEmbeddingsSchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const input = SyncEmbeddingsSchema.parse(args);

        if (input.action === 'status') {
          const status = await getVectorStatus();
          return {
            content: [{ type: 'text', text: formatVectorStatus(status) }],
          };
        }

        if (isSyncInProgress()) {
          return {
            content: [{ type: 'text', text: 'Sync already in progress. Please wait.' }],
          };
        }

        let result;

        if (input.action === 'full_rebuild') {
          result = await fullSync((progress) => {
            console.error(`[Sync] ${progress.phase}: ${progress.percentComplete}%`);
          });
        } else if (input.action === 'sync_new') {
          result = await incrementalSync();
        } else if (input.action === 'sync_record') {
          if (!input.lead_id) {
            return {
              content: [{ type: 'text', text: 'lead_id required for sync_record action' }],
            };
          }
          result = await syncRecord(input.lead_id);
        }

        return {
          content: [{ type: 'text', text: formatSyncResult(result!) }],
        };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  // =========================================================================
  // Tool: odoo_crm_vector_status
  // =========================================================================
  server.tool(
    'odoo_crm_vector_status',
    `Health check for vector infrastructure.

    Returns connection status, vector count, sync state, and circuit breaker status.`,
    VectorStatusSchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const status = await getVectorStatus();
        const output = formatVectorStatus(status);

        return { content: [{ type: 'text', text: output }] };

      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }
  );

  console.error('[VectorTools] 5 vector tools registered');
}
```

#### Test Scenarios for Stage 8

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T8.1 | Server starts with new tools | No errors, tools listed | `npm run dev`, check logs |
| T8.2 | odoo_crm_vector_status works | Returns status JSON | Call tool |
| T8.3 | odoo_crm_sync_embeddings status | Shows sync state | Call with action="status" |
| T8.4 | odoo_crm_sync_embeddings full_rebuild | Syncs records | Call with action="full_rebuild" |
| T8.5 | odoo_crm_semantic_search works | Returns matches | Call with test query |
| T8.6 | odoo_crm_find_similar_deals works | Returns similar deals | Call with valid lead_id |
| T8.7 | odoo_crm_discover_patterns works | Returns clusters | Call with analysis_type |
| T8.8 | Existing tools still work | No regression | Test odoo_crm_search_leads |
| T8.9 | Build compiles | No errors | `npm run build` |

#### Rollback Plan for Stage 8

```bash
# If Stage 8 fails:
rm src/tools/vector-tools.ts
git checkout src/tools/crm-tools.ts
```

**Stage 8 Completion**: ⬜

---

### Stage 9: Formatters

**Goal**: Add output formatters for vector tool results.

**Files to modify:**
- `src/services/formatters.ts`

#### Step 9.1: Add Formatters to `src/services/formatters.ts`

```typescript
// =============================================================================
// VECTOR RESULT FORMATTERS
// =============================================================================

import { VectorMatch, VectorMetadata, VectorStatus, SyncResult, PatternDiscoveryResult, CrmLead } from '../types.js';
import { ResponseFormat, SIMILARITY_THRESHOLDS } from '../constants.js';

/**
 * Get human-readable similarity explanation.
 */
function getSimilarityExplanation(score: number): string {
  if (score >= SIMILARITY_THRESHOLDS.VERY_SIMILAR) {
    return 'Very similar (near duplicate)';
  } else if (score >= SIMILARITY_THRESHOLDS.MEANINGFULLY_SIMILAR) {
    return 'Meaningfully similar';
  } else if (score >= SIMILARITY_THRESHOLDS.LOOSELY_RELATED) {
    return 'Loosely related';
  }
  return 'Weak match';
}

/**
 * Format semantic search results.
 */
export function formatSemanticSearchResults(
  matches: VectorMatch[],
  leads: CrmLead[],
  query: string,
  format: ResponseFormat
): string {
  const leadMap = new Map(leads.map(l => [l.id, l]));

  if (format === ResponseFormat.JSON) {
    return JSON.stringify({
      query,
      total: matches.length,
      results: matches.map(m => ({
        id: parseInt(m.id),
        name: m.metadata?.name,
        similarity: Math.round(m.score * 100),
        explanation: getSimilarityExplanation(m.score),
        lead: leadMap.get(parseInt(m.id)),
      })),
    }, null, 2);
  }

  // Markdown format
  const lines: string[] = [];
  lines.push(`## Semantic Search Results`);
  lines.push(`**Query**: "${query}"`);
  lines.push(`**Found**: ${matches.length} opportunities\n`);

  matches.forEach((match, idx) => {
    const lead = leadMap.get(parseInt(match.id));
    const percent = Math.round(match.score * 100);
    const explanation = getSimilarityExplanation(match.score);

    lines.push(`### ${idx + 1}. ${match.metadata?.name || 'Unknown'}`);
    lines.push(`**Similarity**: ${percent}% - ${explanation}`);

    if (lead) {
      lines.push(`- **Revenue**: $${(lead.expected_revenue || 0).toLocaleString()}`);
      lines.push(`- **Stage**: ${getRelationName(lead.stage_id)}`);
      lines.push(`- **Salesperson**: ${getRelationName(lead.user_id)}`);
      if (lead.sector) lines.push(`- **Sector**: ${lead.sector}`);
      if (lead.city || lead.state_id) {
        lines.push(`- **Location**: ${[lead.city, getRelationName(lead.state_id)].filter(Boolean).join(', ')}`);
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format similar deals results.
 */
export function formatSimilarDeals(
  matches: VectorMatch[],
  leads: CrmLead[],
  reference: VectorMetadata,
  format: ResponseFormat
): string {
  const leadMap = new Map(leads.map(l => [l.id, l]));

  if (format === ResponseFormat.JSON) {
    return JSON.stringify({
      reference: {
        id: reference.odoo_id,
        name: reference.name,
      },
      similar: matches.map(m => ({
        id: parseInt(m.id),
        name: m.metadata?.name,
        similarity: Math.round(m.score * 100),
        lead: leadMap.get(parseInt(m.id)),
      })),
    }, null, 2);
  }

  // Markdown format
  const lines: string[] = [];
  lines.push(`## Similar to: ${reference.name}`);
  lines.push(`Found ${matches.length} similar opportunities\n`);

  matches.forEach((match, idx) => {
    const lead = leadMap.get(parseInt(match.id));
    const percent = Math.round(match.score * 100);

    lines.push(`### ${idx + 1}. ${match.metadata?.name || 'Unknown'} (${percent}% match)`);

    if (lead) {
      const status = lead.lost_reason_id ? '❌ Lost' :
                     (lead.stage_id && typeof lead.stage_id !== 'number' && lead.stage_id[1]?.toLowerCase().includes('won')) ? '✅ Won' : '🔄 Active';
      lines.push(`- **Status**: ${status}`);
      lines.push(`- **Revenue**: $${(lead.expected_revenue || 0).toLocaleString()}`);
      if (lead.sector) lines.push(`- **Sector**: ${lead.sector}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format pattern discovery results.
 */
export function formatPatternDiscovery(
  result: PatternDiscoveryResult,
  format: ResponseFormat
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(result, null, 2);
  }

  // Markdown format
  const lines: string[] = [];
  lines.push(`## Pattern Discovery: ${result.analysisType}`);
  lines.push(`Analyzed ${result.totalRecordsAnalyzed} records into ${result.numClusters} clusters`);
  lines.push(`Analysis time: ${result.durationMs}ms\n`);

  if (result.insights.length > 0) {
    lines.push(`### Key Insights`);
    result.insights.forEach(insight => lines.push(`- ${insight}`));
    lines.push('');
  }

  result.clusters.forEach((cluster, idx) => {
    lines.push(`### Cluster ${idx + 1}: ${cluster.size} opportunities`);
    lines.push(`> ${cluster.summary}`);
    lines.push('');

    if (cluster.commonThemes.topSectors.length > 0) {
      lines.push(`**Top Sectors**: ${cluster.commonThemes.topSectors.map(s => `${s.sector} (${s.count})`).join(', ')}`);
    }

    if (cluster.commonThemes.topLostReasons.length > 0) {
      lines.push(`**Top Lost Reasons**: ${cluster.commonThemes.topLostReasons.map(r => `${r.reason} (${r.count})`).join(', ')}`);
    }

    lines.push(`**Avg Revenue**: $${Math.round(cluster.commonThemes.avgRevenue).toLocaleString()}`);
    lines.push('');

    lines.push(`**Representative Deals**:`);
    cluster.representativeDeals.forEach(d => {
      lines.push(`- ${d.name} (${Math.round(d.similarity * 100)}% similarity to center)`);
    });
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format sync result.
 */
export function formatSyncResult(result: SyncResult): string {
  const lines: string[] = [];
  lines.push(`## Sync ${result.success ? 'Completed' : 'Failed'}`);
  lines.push(`- **Records Synced**: ${result.recordsSynced}`);
  lines.push(`- **Records Failed**: ${result.recordsFailed}`);
  lines.push(`- **Records Deleted**: ${result.recordsDeleted}`);
  lines.push(`- **Duration**: ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push(`- **Sync Version**: ${result.syncVersion}`);

  if (result.errors && result.errors.length > 0) {
    lines.push('');
    lines.push(`### Errors`);
    result.errors.forEach(e => lines.push(`- ${e}`));
  }

  return lines.join('\n');
}

/**
 * Format vector status.
 */
export function formatVectorStatus(status: VectorStatus): string {
  const lines: string[] = [];
  lines.push(`## Vector Database Status`);
  lines.push(`- **Enabled**: ${status.enabled ? '✅' : '❌'}`);
  lines.push(`- **Qdrant Connected**: ${status.qdrantConnected ? '✅' : '❌'}`);
  lines.push(`- **Voyage AI Connected**: ${status.voyageConnected ? '✅' : '❌'}`);
  lines.push(`- **Collection**: ${status.collectionName}`);
  lines.push(`- **Total Vectors**: ${status.totalVectors.toLocaleString()}`);
  lines.push(`- **Last Sync**: ${status.lastSync || 'Never'}`);
  lines.push(`- **Sync Version**: ${status.syncVersion}`);
  lines.push(`- **Circuit Breaker**: ${status.circuitBreakerState}`);

  if (status.errorMessage) {
    lines.push(`- **Error**: ${status.errorMessage}`);
  }

  return lines.join('\n');
}
```

#### Test Scenarios for Stage 9

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T9.1 | formatSemanticSearchResults markdown | Valid markdown | Call with test data |
| T9.2 | formatSemanticSearchResults JSON | Valid JSON | Call with JSON format |
| T9.3 | formatPatternDiscovery markdown | Readable clusters | Call with test data |
| T9.4 | formatVectorStatus shows all fields | All status fields | Call with status object |
| T9.5 | Build compiles | No errors | `npm run build` |

#### Rollback Plan for Stage 9

```bash
# If Stage 9 fails:
git checkout src/services/formatters.ts
```

**Stage 9 Completion**: ⬜

---

### Stage 10: Integration

**Goal**: Wire everything together in the main server.

**Files to modify:**
- `src/index.ts`
- `src/tools/crm-tools.ts`

#### Step 10.1: Update `src/index.ts`

Add after existing imports:

```typescript
import { initializeEmbeddingService } from './services/embedding-service.js';
import { warmVectorClient } from './services/vector-client.js';
```

Add to server startup (after pool warm-up):

```typescript
// Warm up vector services
initializeEmbeddingService();
await warmVectorClient();
```

#### Step 10.2: Update `src/tools/crm-tools.ts`

Add import:

```typescript
import { registerVectorTools } from './vector-tools.js';
```

Add at end of registerCrmTools function:

```typescript
// Register vector-powered tools
registerVectorTools(server);
```

#### Test Scenarios for Stage 10

| Test ID | Test Description | Expected Result | How to Verify |
|---------|------------------|-----------------|---------------|
| T10.1 | Server starts successfully | No errors | `npm run dev` |
| T10.2 | Vector services initialize | Logs show connection | Check stderr logs |
| T10.3 | All 5 vector tools registered | Tools appear in list | Call tools/list |
| T10.4 | Existing tools work | No regression | Test existing tools |
| T10.5 | Full end-to-end test | Semantic search works | Query after sync |

#### Rollback Plan for Stage 10

```bash
# If Stage 10 fails:
git checkout src/index.ts src/tools/crm-tools.ts
```

**Stage 10 Completion**: ⬜

---

### Stage 11: Testing

**Goal**: Comprehensive testing and documentation.

#### Docker Compose for Testing

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334

volumes:
  qdrant_data:
```

#### Manual Test Checklist

| Test ID | Test Description | Expected Result | Status |
|---------|------------------|-----------------|--------|
| T11.1 | Semantic search: "budget concerns" | Returns budget-related deals | ⬜ |
| T11.2 | Semantic search: "education projects" | Returns education sector deals | ⬜ |
| T11.3 | Similar deals: Given won deal | Returns similar opportunities | ⬜ |
| T11.4 | Similar deals: Given lost deal | Shows what lost deals were similar | ⬜ |
| T11.5 | Pattern discovery: lost_reasons | Meaningful clusters with reasons | ⬜ |
| T11.6 | Pattern discovery: winning_factors | Clusters of won deals | ⬜ |
| T11.7 | Sync: full_rebuild | All records synced successfully | ⬜ |
| T11.8 | Sync: incremental | Only changed records synced | ⬜ |
| T11.9 | Graceful degradation: Qdrant down | Helpful error message | ⬜ |
| T11.10 | Graceful degradation: Voyage down | Helpful error message | ⬜ |
| T11.11 | Circuit breaker: 3 failures | Circuit opens | ⬜ |
| T11.12 | Circuit breaker: recovery | Circuit closes after success | ⬜ |

#### Rollback Plan for Stage 11

```bash
# If Stage 11 reveals critical issues, rollback all vector changes:
git checkout src/constants.ts src/types.ts src/schemas/index.ts
git checkout src/services/formatters.ts src/tools/crm-tools.ts src/index.ts
rm src/services/embedding-service.ts src/services/vector-client.ts
rm src/services/sync-service.ts src/services/clustering-service.ts
rm src/tools/vector-tools.ts
npm uninstall @qdrant/js-client-rest voyageai ml-kmeans object-hash p-limit
npm uninstall -D @types/object-hash
```

**Stage 11 Completion**: ⬜

---

## Gaps & Mitigations

### Gap 1: Clustering in JavaScript
**Issue**: HDBSCAN (best for embeddings) is Python-only.
**Mitigation**: Use `ml-kmeans` npm package with user-specified cluster count.

### Gap 2: Similarity Score Calibration
**Issue**: Raw cosine scores lack intuitive meaning.
**Mitigation**: Default to 0.6, add explanatory output (92% = "Very similar").

### Gap 3: Payload Index Timing
**Issue**: Indexes must exist before data for optimal HNSW.
**Mitigation**: `ensureCollection()` creates indexes before any upserts.

### Gap 4: Pre-filter Performance
**Issue**: Pre-filtering slow for large result sets (>30% of data).
**Mitigation**: Smart strategy - use Qdrant filters directly for large sets.

### Gap 5: Chunking Strategy
**Issue**: Long descriptions need handling.
**Mitigation**: Truncate at 2000 words (Voyage handles 32K tokens).

### Gap 6: Testing Strategy
**Issue**: Vector search hard to unit test.
**Mitigation**: Mock embeddings + local Qdrant Docker for integration tests.

### Gap 7: Error Message Design
**Issue**: Generic errors unhelpful for MCP.
**Mitigation**: Actionable templates with fallback suggestions.

### Gap 8: Voyage input_type
**Issue**: Missing quality optimization.
**Mitigation**: Use "document" for records, "query" for searches.

### Gap 9: Embedding Dimensions
**Issue**: Fixed at 1024, no cost optimization.
**Mitigation**: `EMBEDDING_DIMENSIONS` env var (512 option for lower cost).

### Gap 10: Sync Conflict Handling
**Issue**: Race conditions during sync.
**Mitigation**: write_date versioning, re-fetch if changed.

---

## Stage Completion Checklist

| Stage | Description | Tests | Status |
|-------|-------------|-------|--------|
| 1 | Dependencies & Configuration | T1.1-T1.5 | ⬜ |
| 2 | Type Definitions | T2.1-T2.4 | ⬜ |
| 3 | Embedding Service | T3.1-T3.7 | ⬜ |
| 4 | Vector Client | T4.1-T4.9 | ⬜ |
| 5 | Sync Service | T5.1-T5.7 | ⬜ |
| 6 | Clustering Service | T6.1-T6.5 | ⬜ |
| 7 | Zod Schemas | T7.1-T7.5 | ⬜ |
| 8 | MCP Tools | T8.1-T8.9 | ⬜ |
| 9 | Formatters | T9.1-T9.5 | ⬜ |
| 10 | Integration | T10.1-T10.5 | ⬜ |
| 11 | Testing | T11.1-T11.12 | ⬜ |

**Total Test Cases: 68**

---

## Research Sources

### Vector Database & Qdrant
- [Qdrant Indexing Documentation](https://qdrant.tech/documentation/concepts/indexing/)
- [Qdrant Filtering Guide](https://qdrant.tech/articles/vector-search-filtering/)
- [Qdrant JS Client](https://github.com/qdrant/qdrant-js)
- [Qdrant MCP Server](https://github.com/qdrant/mcp-server-qdrant)

### Embeddings
- [Voyage AI Documentation](https://docs.voyageai.com/docs/embeddings)
- [Voyage TypeScript SDK](https://github.com/voyage-ai/typescript-sdk)

### Hybrid Search
- [Pre vs Post Filtering](https://dev.to/volland/pre-and-post-filtering-in-vector-search-with-metadata-and-rag-pipelines-2hji)
- [Azure AI Search Benchmarks](https://learn.microsoft.com/en-us/azure/search/vector-search-filters)

### MCP Best Practices
- [MCP Error Handling Guide](https://mcpcat.io/guides/error-handling-custom-mcp-servers/)

---

*Document created: 2025-12-12*
*Last updated: 2025-12-12*
*Ready for implementation*
*Comparison Score: 8.25/10 (vs memory1984: 6.5/10)*
