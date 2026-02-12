# Command 1984: Vector-Native Conversational Memory Implementation Guide

> **Project**: Odoo CRM MCP Server - Memory Extension
> **Created**: December 2024
> **Status**: Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Stage 1: Configuration & Types](#stage-1-configuration--types)
4. [Stage 2: Memory Client](#stage-2-memory-client)
5. [Stage 3: Memory Service](#stage-3-memory-service)
6. [Stage 4: Memory Tool](#stage-4-memory-tool)
7. [Stage 5: Auto-Capture Integration](#stage-5-auto-capture-integration)
8. [Stage 6: Server Integration](#stage-6-server-integration)
9. [End-to-End Testing](#end-to-end-testing)
10. [Future: Phase 2 Streamable HTTP](#future-phase-2-streamable-http)

---

## Executive Summary

### What We're Building

A **vector-native conversational memory system** that:
- Records conversations to a Qdrant vector database
- Enables semantic search across past conversations
- Auto-captures all tool interactions when recording is active
- Supports multi-user isolation

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Collection Strategy | Separate `conversation_memory` | Isolate from CRM data, different payload schema |
| Embedding Strategy | Pure content (session ID in payload) | Better semantic clustering |
| Tool Design | 1 unified `memory` tool with 5 actions | Simpler than 6 separate tools |
| Recording Mode | Server-side auto-capture | Automatic, no manual recording needed |
| Session ID Format | Auto-generated timestamp (YYYYMMDD_HHMMSS) | Unique, sortable |
| User Isolation | Multi-user with user_id filtering | Private memories per user |

### Files Overview

| File | Action | Lines |
|------|--------|-------|
| `src/constants.ts` | MODIFY | +50 |
| `src/types.ts` | MODIFY | +80 |
| `src/services/memory-client.ts` | CREATE | ~200 |
| `src/services/memory-service.ts` | CREATE | ~150 |
| `src/schemas/index.ts` | MODIFY | +40 |
| `src/tools/memory-tools.ts` | CREATE | ~200 |
| `src/services/formatters.ts` | MODIFY | +50 |
| `src/tools/crm-tools.ts` | MODIFY | +30 |
| `src/tools/vector-tools.ts` | MODIFY | +10 |
| `src/index.ts` | MODIFY | +20 |
| **Total** | | **~830** |

---

## Architecture Overview

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Conversation                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    memory action:start                           │
│                    ─────────────────                             │
│                    Sets recording flag ON                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Any Tool Call                                │
│              (search_leads, pipeline, etc.)                      │
│                    ─────────────────                             │
│    if (isMemoryRecording()) {                                    │
│      captureInteraction(toolName, input, output);                │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    memory action:save                            │
│                    ─────────────────                             │
│    1. Generate embeddings for all captured messages              │
│    2. Upsert to conversation_memory collection                   │
│    3. Clear session state                                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Qdrant                                     │
│              conversation_memory collection                      │
│    ┌─────────────────────────────────────────────┐              │
│    │ session_id: "20241215_103045"               │              │
│    │ user_id: "kasun"                            │              │
│    │ sequence_number: 1, 2, 3...                 │              │
│    │ role: "user" | "assistant"                  │              │
│    │ content: "..."                              │              │
│    │ embedding: [0.1, 0.2, ...]                  │              │
│    └─────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Collection Configuration

```typescript
const MEMORY_COLLECTION_CONFIG = {
  COLLECTION_NAME: 'conversation_memory',
  VECTOR_SIZE: 512,  // voyage-3-lite
  DISTANCE_METRIC: 'Cosine',

  HNSW_M: 24,            // Higher than CRM for better recall
  HNSW_EF_CONSTRUCT: 128,

  PAYLOAD_INDEXES: [
    { field: 'session_id', type: 'keyword' },
    { field: 'session_prefix', type: 'keyword' },
    { field: 'user_id', type: 'keyword' },
    { field: 'message_timestamp', type: 'datetime' },
    { field: 'sequence_number', type: 'integer' },
    { field: 'role', type: 'keyword' },
    { field: 'session_status', type: 'keyword' },
  ],
};
```

---

## Stage 1: Configuration & Types

### Goal
Add configuration constants and TypeScript interfaces for the memory system.

### Files to Modify

#### 1.1 `src/constants.ts`

Add at the end of the file:

```typescript
// ============================================
// MEMORY CONFIGURATION
// ============================================

export const MEMORY_CONFIG = {
  ENABLED: process.env.MEMORY_ENABLED !== 'false',
  COLLECTION_NAME: process.env.MEMORY_COLLECTION_NAME || 'conversation_memory',

  // Session defaults
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  CONTEXT_WINDOW: 2,  // Messages before/after for context

  // Auto-archive
  AUTO_ARCHIVE_DAYS: parseInt(process.env.MEMORY_AUTO_ARCHIVE_DAYS || '90'),
} as const;

export const MEMORY_COLLECTION_CONFIG = {
  COLLECTION_NAME: MEMORY_CONFIG.COLLECTION_NAME,
  VECTOR_SIZE: VOYAGE_CONFIG.DIMENSIONS,  // 512
  DISTANCE_METRIC: 'Cosine' as const,

  // HNSW tuned for conversational queries (higher recall)
  HNSW_M: 24,
  HNSW_EF_CONSTRUCT: 128,

  // Payload indexes for efficient filtering
  PAYLOAD_INDEXES: [
    { field: 'session_id', type: 'keyword' as const },
    { field: 'session_prefix', type: 'keyword' as const },
    { field: 'user_id', type: 'keyword' as const },
    { field: 'message_timestamp', type: 'datetime' as const },
    { field: 'sequence_number', type: 'integer' as const },
    { field: 'role', type: 'keyword' as const },
    { field: 'session_status', type: 'keyword' as const },
  ],
} as const;
```

#### 1.2 `src/types.ts`

Add at the end of the file:

```typescript
// ============================================
// MEMORY TYPES
// ============================================

export type MemoryRole = 'user' | 'assistant';
export type SessionStatus = 'recording' | 'saved' | 'archived';

export interface MemoryMessage {
  role: MemoryRole;
  content: string;
  toolName?: string;
  toolInput?: unknown;
  timestamp: Date;
}

export interface MemorySession {
  sessionId: string;
  sessionPrefix: string;
  userId: string;
  description?: string;
  tags?: string[];
  status: SessionStatus;
  startTime: Date;
  endTime?: Date;
  messages: MemoryMessage[];
}

export interface MemoryMetadata {
  // Identifiers
  message_id: string;
  session_id: string;
  session_prefix: string;
  user_id: string;

  // Message attributes
  role: MemoryRole;
  sequence_number: number;
  message_timestamp: string;

  // Content
  content: string;
  tool_name?: string;
  embedding_text: string;

  // Session metadata
  session_status: SessionStatus;
  session_created: string;
  session_saved?: string;
  session_description?: string;
  tags?: string[];

  // Sync tracking
  sync_version: number;
  last_synced: string;
}

export interface MemoryQueryOptions {
  sessionId?: string;
  userId: string;
  query?: string;
  role?: MemoryRole | 'all';
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  limit?: number;
  minScore?: number;
  includeContext?: boolean;
  contextWindow?: number;
}

export interface MemoryQueryResult {
  matches: Array<{
    id: string;
    score: number;
    metadata?: MemoryMetadata;
  }>;
  searchTimeMs: number;
}

export interface MemoryHealthStatus {
  connected: boolean;
  collectionExists: boolean;
  vectorCount: number;
  activeSession: {
    sessionId: string;
    messageCount: number;
    startTime: string;
  } | null;
}
```

### Test Scenarios for Stage 1

```typescript
// Test 1.1: Configuration loads correctly
import { MEMORY_CONFIG, MEMORY_COLLECTION_CONFIG } from './constants';

console.log('MEMORY_CONFIG:', MEMORY_CONFIG);
// Expected: { ENABLED: true, COLLECTION_NAME: 'conversation_memory', ... }

console.log('MEMORY_COLLECTION_CONFIG:', MEMORY_COLLECTION_CONFIG);
// Expected: { COLLECTION_NAME: 'conversation_memory', VECTOR_SIZE: 512, ... }

// Test 1.2: Types compile without errors
import { MemorySession, MemoryMetadata, MemoryQueryOptions } from './types';

const testSession: MemorySession = {
  sessionId: '20241215_103045',
  sessionPrefix: 'memory_20241215_103045',
  userId: 'test_user',
  status: 'recording',
  startTime: new Date(),
  messages: [],
};
console.log('Test session created:', testSession.sessionId);
```

### Verification Checklist

- [ ] `npm run build` succeeds without TypeScript errors
- [ ] MEMORY_CONFIG is accessible throughout the codebase
- [ ] All type interfaces are properly exported
- [ ] Environment variables override defaults correctly

---

## Stage 2: Memory Client

### Goal
Create Qdrant client wrapper for the `conversation_memory` collection.

### Files to Create

#### 2.1 `src/services/memory-client.ts`

```typescript
/**
 * Memory Client - Qdrant wrapper for conversation_memory collection
 *
 * Follows the pattern of vector-client.ts but for memory storage.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { MEMORY_COLLECTION_CONFIG, QDRANT_CONFIG } from '../constants';
import { MemoryMetadata, MemoryQueryOptions, MemoryQueryResult, MemoryHealthStatus } from '../types';

// ============================================
// CLIENT STATE
// ============================================

let memoryClient: QdrantClient | null = null;
let isInitialized = false;

// ============================================
// INITIALIZATION
// ============================================

export function initializeMemoryClient(): boolean {
  if (memoryClient) {
    return true;
  }

  try {
    const config: { url: string; apiKey?: string } = {
      url: QDRANT_CONFIG.HOST,
    };

    if (QDRANT_CONFIG.API_KEY) {
      config.apiKey = QDRANT_CONFIG.API_KEY;
    }

    memoryClient = new QdrantClient(config);
    console.error('[MemoryClient] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[MemoryClient] Initialization failed:', error);
    return false;
  }
}

export function getMemoryClient(): QdrantClient | null {
  return memoryClient;
}

// ============================================
// COLLECTION MANAGEMENT
// ============================================

export async function ensureMemoryCollection(): Promise<boolean> {
  if (!memoryClient) {
    console.error('[MemoryClient] Client not initialized');
    return false;
  }

  try {
    const collections = await memoryClient.getCollections();
    const exists = collections.collections.some(
      c => c.name === MEMORY_COLLECTION_CONFIG.COLLECTION_NAME
    );

    if (exists) {
      console.error('[MemoryClient] Collection already exists');
      isInitialized = true;
      return true;
    }

    // Create collection
    await memoryClient.createCollection(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
      vectors: {
        size: MEMORY_COLLECTION_CONFIG.VECTOR_SIZE,
        distance: MEMORY_COLLECTION_CONFIG.DISTANCE_METRIC,
      },
      hnsw_config: {
        m: MEMORY_COLLECTION_CONFIG.HNSW_M,
        ef_construct: MEMORY_COLLECTION_CONFIG.HNSW_EF_CONSTRUCT,
      },
    });

    console.error('[MemoryClient] Collection created');

    // Create payload indexes
    for (const index of MEMORY_COLLECTION_CONFIG.PAYLOAD_INDEXES) {
      await memoryClient.createPayloadIndex(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
        field_name: index.field,
        field_schema: index.type,
      });
      console.error(`[MemoryClient] Created index: ${index.field}`);
    }

    isInitialized = true;
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to ensure collection:', error);
    return false;
  }
}

// ============================================
// CRUD OPERATIONS
// ============================================

export async function upsertMemoryPoints(
  records: Array<{
    id: string;
    vector: number[];
    metadata: MemoryMetadata;
  }>
): Promise<{ upsertedCount: number }> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  const points = records.map((r, index) => ({
    id: `${r.metadata.session_id}_${r.metadata.sequence_number}`,
    vector: r.vector,
    payload: r.metadata as unknown as Record<string, unknown>,
  }));

  await memoryClient.upsert(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
    wait: true,
    points,
  });

  return { upsertedCount: points.length };
}

export async function searchMemory(options: MemoryQueryOptions & { vector: number[] }): Promise<MemoryQueryResult> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  const startTime = Date.now();

  // Build filter
  const must: object[] = [];

  // Always filter by user_id for isolation
  must.push({ key: 'user_id', match: { value: options.userId } });

  if (options.sessionId) {
    must.push({ key: 'session_id', match: { value: options.sessionId } });
  }

  if (options.role && options.role !== 'all') {
    must.push({ key: 'role', match: { value: options.role } });
  }

  if (options.dateFrom) {
    must.push({ key: 'message_timestamp', range: { gte: options.dateFrom } });
  }

  if (options.dateTo) {
    must.push({ key: 'message_timestamp', range: { lte: options.dateTo } });
  }

  const result = await memoryClient.search(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
    vector: options.vector,
    limit: options.limit || 20,
    filter: must.length > 0 ? { must } : undefined,
    score_threshold: options.minScore || 0.5,
    with_payload: true,
  });

  return {
    matches: result.map(m => ({
      id: String(m.id),
      score: m.score,
      metadata: m.payload as unknown as MemoryMetadata | undefined,
    })),
    searchTimeMs: Date.now() - startTime,
  };
}

export async function scrollMemoryBySession(
  sessionId: string,
  userId: string
): Promise<MemoryMetadata[]> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  const results: MemoryMetadata[] = [];
  let offset: string | number | null | undefined = undefined;

  while (true) {
    const response = await memoryClient.scroll(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'session_id', match: { value: sessionId } },
          { key: 'user_id', match: { value: userId } },
        ],
      },
      limit: 100,
      offset: offset,
      with_payload: true,
      with_vector: false,
    });

    for (const point of response.points) {
      results.push(point.payload as unknown as MemoryMetadata);
    }

    if (!response.next_page_offset) {
      break;
    }
    offset = response.next_page_offset;
  }

  // Sort by sequence number
  return results.sort((a, b) => a.sequence_number - b.sequence_number);
}

export async function getSessionList(
  userId: string,
  status?: string,
  limit: number = 50
): Promise<Array<{ sessionId: string; messageCount: number; created: string }>> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  const must: object[] = [
    { key: 'user_id', match: { value: userId } },
  ];

  if (status) {
    must.push({ key: 'session_status', match: { value: status } });
  }

  // Get first message of each session to list sessions
  const response = await memoryClient.scroll(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
    filter: {
      must: [
        ...must,
        { key: 'sequence_number', match: { value: 1 } },  // First message only
      ],
    },
    limit: limit,
    with_payload: true,
    with_vector: false,
  });

  return response.points.map(p => {
    const meta = p.payload as unknown as MemoryMetadata;
    return {
      sessionId: meta.session_id,
      messageCount: 0,  // Would need separate count query
      created: meta.session_created,
    };
  });
}

// ============================================
// HEALTH CHECK
// ============================================

export async function memoryHealthCheck(): Promise<MemoryHealthStatus> {
  if (!memoryClient) {
    return {
      connected: false,
      collectionExists: false,
      vectorCount: 0,
      activeSession: null,
    };
  }

  try {
    const collections = await memoryClient.getCollections();
    const exists = collections.collections.some(
      c => c.name === MEMORY_COLLECTION_CONFIG.COLLECTION_NAME
    );

    let vectorCount = 0;
    if (exists) {
      const info = await memoryClient.getCollection(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME);
      vectorCount = info.points_count || 0;
    }

    // Import dynamically to avoid circular dependency
    const { getActiveSession } = await import('./memory-service');
    const activeSession = getActiveSession();

    return {
      connected: true,
      collectionExists: exists,
      vectorCount,
      activeSession: activeSession ? {
        sessionId: activeSession.sessionId,
        messageCount: activeSession.messages.length,
        startTime: activeSession.startTime.toISOString(),
      } : null,
    };
  } catch (error) {
    console.error('[MemoryClient] Health check failed:', error);
    return {
      connected: false,
      collectionExists: false,
      vectorCount: 0,
      activeSession: null,
    };
  }
}

// ============================================
// WARM-UP
// ============================================

export async function warmMemoryClient(): Promise<void> {
  console.error('[MemoryClient] Warming up...');

  if (!initializeMemoryClient()) {
    console.error('[MemoryClient] Failed to initialize');
    return;
  }

  await ensureMemoryCollection();

  const health = await memoryHealthCheck();
  console.error(`[MemoryClient] Ready - ${health.vectorCount} vectors`);
}
```

### Test Scenarios for Stage 2

```typescript
// Test 2.1: Memory client initializes
import { initializeMemoryClient, getMemoryClient } from './services/memory-client';

const result = initializeMemoryClient();
console.log('Initialization result:', result);
// Expected: true

const client = getMemoryClient();
console.log('Client exists:', client !== null);
// Expected: true

// Test 2.2: Collection created with indexes
import { ensureMemoryCollection, memoryHealthCheck } from './services/memory-client';

await ensureMemoryCollection();
const health = await memoryHealthCheck();
console.log('Health check:', health);
// Expected: { connected: true, collectionExists: true, vectorCount: 0, activeSession: null }

// Test 2.3: Upsert and search work
import { upsertMemoryPoints, searchMemory } from './services/memory-client';
import { embed } from './services/embedding-service';

const testVector = await embed('Test message about CRM leads', 'document');
await upsertMemoryPoints([{
  id: 'test_1',
  vector: testVector,
  metadata: {
    message_id: 'test_1',
    session_id: '20241215_103045',
    session_prefix: 'memory_20241215_103045',
    user_id: 'test_user',
    role: 'user',
    sequence_number: 1,
    message_timestamp: new Date().toISOString(),
    content: 'Test message about CRM leads',
    embedding_text: 'Test message about CRM leads',
    session_status: 'saved',
    session_created: new Date().toISOString(),
    sync_version: 1,
    last_synced: new Date().toISOString(),
  },
}]);

const queryVector = await embed('CRM leads', 'query');
const results = await searchMemory({
  vector: queryVector,
  userId: 'test_user',
  limit: 10,
});
console.log('Search results:', results.matches.length);
// Expected: 1
```

### Verification Checklist

- [ ] `conversation_memory` collection created in Qdrant
- [ ] All 7 payload indexes visible in Qdrant dashboard
- [ ] Health check returns correct status
- [ ] Upsert and search operations work

---

## Stage 3: Memory Service

### Goal
Create session state management and auto-capture logic.

### Files to Create

#### 3.1 `src/services/memory-service.ts`

```typescript
/**
 * Memory Service - Session state management and auto-capture
 *
 * Manages active recording sessions and provides capture functions
 * that other tools call automatically.
 */

import { v4 as uuidv4 } from 'uuid';
import { MemorySession, MemoryMessage, MemoryMetadata, MemoryRole } from '../types';
import { MEMORY_CONFIG } from '../constants';
import { embed, embedBatch } from './embedding-service';
import { upsertMemoryPoints, scrollMemoryBySession } from './memory-client';

// ============================================
// SESSION STATE
// ============================================

let activeSession: MemorySession | null = null;

// ============================================
// SESSION MANAGEMENT
// ============================================

export function generateSessionId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

export function startSession(
  userId: string,
  options?: { description?: string; tags?: string[] }
): MemorySession {
  if (activeSession) {
    throw new Error(`Session already active: ${activeSession.sessionId}. Call save first.`);
  }

  const sessionId = generateSessionId();
  const sessionPrefix = `memory_${sessionId}`;

  activeSession = {
    sessionId,
    sessionPrefix,
    userId,
    description: options?.description,
    tags: options?.tags,
    status: 'recording',
    startTime: new Date(),
    messages: [],
  };

  console.error(`[MemoryService] Session started: ${sessionId}`);
  return activeSession;
}

export function getActiveSession(): MemorySession | null {
  return activeSession;
}

export function isMemoryRecording(): boolean {
  return activeSession !== null;
}

// ============================================
// AUTO-CAPTURE (Called by other tools)
// ============================================

export function captureInteraction(
  toolName: string,
  input: unknown,
  output: string
): void {
  if (!activeSession) {
    return;  // Not recording, silently skip
  }

  const timestamp = new Date();

  // Capture user input (the tool call)
  activeSession.messages.push({
    role: 'user',
    content: `[Tool: ${toolName}]\n${JSON.stringify(input, null, 2)}`,
    toolName,
    toolInput: input,
    timestamp,
  });

  // Capture assistant output (the response)
  activeSession.messages.push({
    role: 'assistant',
    content: output,
    toolName,
    timestamp: new Date(),
  });

  console.error(`[MemoryService] Captured: ${toolName} (${activeSession.messages.length} messages)`);
}

// ============================================
// SAVE SESSION
// ============================================

export async function saveSession(
  options?: { generateSummary?: boolean }
): Promise<{
  sessionId: string;
  messageCount: number;
  savedAt: string;
}> {
  if (!activeSession) {
    throw new Error('No active session to save');
  }

  if (activeSession.messages.length === 0) {
    throw new Error('Session has no messages to save');
  }

  const session = activeSession;
  const savedAt = new Date().toISOString();

  console.error(`[MemoryService] Saving session: ${session.sessionId} (${session.messages.length} messages)`);

  // Build embedding texts
  const embeddingTexts = session.messages.map((msg, idx) =>
    buildMemoryEmbeddingText(msg, idx, session.messages)
  );

  // Generate embeddings in batch
  const embeddings = await embedBatch(embeddingTexts, 'document');

  // Build records for Qdrant
  const records = session.messages.map((msg, idx) => ({
    id: `${session.sessionId}_${idx + 1}`,
    vector: embeddings[idx],
    metadata: {
      message_id: uuidv4(),
      session_id: session.sessionId,
      session_prefix: session.sessionPrefix,
      user_id: session.userId,
      role: msg.role,
      sequence_number: idx + 1,
      message_timestamp: msg.timestamp.toISOString(),
      content: msg.content,
      tool_name: msg.toolName,
      embedding_text: embeddingTexts[idx],
      session_status: 'saved' as const,
      session_created: session.startTime.toISOString(),
      session_saved: savedAt,
      session_description: session.description,
      tags: session.tags,
      sync_version: 1,
      last_synced: savedAt,
    } as MemoryMetadata,
  }));

  // Upsert to Qdrant
  await upsertMemoryPoints(records);

  // Clear active session
  const result = {
    sessionId: session.sessionId,
    messageCount: session.messages.length,
    savedAt,
  };

  activeSession = null;
  console.error(`[MemoryService] Session saved: ${result.sessionId}`);

  return result;
}

// ============================================
// EMBEDDING TEXT BUILDER
// ============================================

function buildMemoryEmbeddingText(
  message: MemoryMessage,
  index: number,
  allMessages: MemoryMessage[]
): string {
  const parts: string[] = [];

  // Role prefix
  parts.push(`[${message.role.toUpperCase()}]`);

  // Tool context if applicable
  if (message.toolName) {
    parts.push(`Tool: ${message.toolName}`);
  }

  // Main content
  parts.push(message.content);

  // Add brief context from previous message if available
  if (index > 0) {
    const prev = allMessages[index - 1];
    const prevSnippet = prev.content.slice(0, 100);
    parts.push(`Context: ${prevSnippet}...`);
  }

  return parts.join('\n');
}

// ============================================
// RETRIEVE SESSION
// ============================================

export async function retrieveSession(
  sessionId: string,
  userId: string
): Promise<MemoryMetadata[]> {
  return scrollMemoryBySession(sessionId, userId);
}

// ============================================
// CANCEL SESSION
// ============================================

export function cancelSession(): { sessionId: string; messageCount: number } | null {
  if (!activeSession) {
    return null;
  }

  const result = {
    sessionId: activeSession.sessionId,
    messageCount: activeSession.messages.length,
  };

  activeSession = null;
  console.error(`[MemoryService] Session cancelled: ${result.sessionId}`);

  return result;
}
```

### Test Scenarios for Stage 3

```typescript
// Test 3.1: Start session
import { startSession, getActiveSession, isMemoryRecording } from './services/memory-service';

const session = startSession('test_user', { description: 'Test session' });
console.log('Session started:', session.sessionId);
// Expected: 20241215_HHMMSS format

console.log('Is recording:', isMemoryRecording());
// Expected: true

// Test 3.2: Capture interactions
import { captureInteraction } from './services/memory-service';

captureInteraction('odoo_crm_search_leads', { query: 'education' }, 'Found 5 leads...');

const active = getActiveSession();
console.log('Messages captured:', active?.messages.length);
// Expected: 2 (user input + assistant output)

// Test 3.3: Save session
import { saveSession } from './services/memory-service';

const result = await saveSession();
console.log('Saved:', result);
// Expected: { sessionId: '...', messageCount: 2, savedAt: '...' }

console.log('Is recording after save:', isMemoryRecording());
// Expected: false

// Test 3.4: Cannot start second session while recording
try {
  startSession('test_user');
  startSession('test_user');  // Should throw
} catch (error) {
  console.log('Error caught:', error.message);
  // Expected: "Session already active..."
}
```

### Verification Checklist

- [ ] Session ID generates in correct format (YYYYMMDD_HHMMSS)
- [ ] Messages are captured with correct structure
- [ ] Embeddings are generated and saved to Qdrant
- [ ] Session state is cleared after save
- [ ] Cannot start second session while recording

---

## Stage 4: Memory Tool

### Goal
Create the unified `memory` MCP tool with 5 actions.

### Files to Modify/Create

#### 4.1 `src/schemas/index.ts`

Add to the file:

```typescript
// ============================================
// MEMORY SCHEMA
// ============================================

export const MemoryActionEnum = z.enum(['start', 'save', 'retrieve', 'list', 'status']);

export const MemorySchema = z.object({
  action: MemoryActionEnum
    .describe("Action to perform: start (begin recording), save (end recording), retrieve (search/get messages), list (show sessions), status (health check)"),

  // For retrieve action
  session_id: z.string()
    .max(20)
    .optional()
    .describe("Retrieve specific session by ID (e.g., '20241215_103045')"),

  query: z.string()
    .max(500)
    .optional()
    .describe("Semantic search query across all your sessions"),

  // For start action
  description: z.string()
    .max(500)
    .optional()
    .describe("Optional description for the recording session"),

  tags: z.array(z.string().max(50))
    .max(10)
    .optional()
    .describe("Optional tags for categorization"),

  // For retrieve/list actions
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Number of results to return"),

  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: markdown (human-readable) or json (structured)"),
});

export type MemoryInput = z.infer<typeof MemorySchema>;
```

#### 4.2 `src/tools/memory-tools.ts` (CREATE)

```typescript
/**
 * Memory Tools - Unified memory MCP tool
 *
 * Single tool with 5 actions for conversational memory management.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MemorySchema, MemoryInput } from '../schemas';
import { MEMORY_CONFIG } from '../constants';
import { ResponseFormat } from '../types';
import {
  startSession,
  saveSession,
  getActiveSession,
  isMemoryRecording,
  retrieveSession,
  cancelSession,
} from '../services/memory-service';
import {
  memoryHealthCheck,
  searchMemory,
  getSessionList,
} from '../services/memory-client';
import { embed } from '../services/embedding-service';
import { formatMemorySession, formatMemorySearch, formatSessionList, formatMemoryStatus } from '../services/formatters';

// ============================================
// TOOL REGISTRATION
// ============================================

export function registerMemoryTools(server: McpServer): void {
  if (!MEMORY_CONFIG.ENABLED) {
    console.error('[MemoryTools] Memory features disabled - skipping registration');
    return;
  }

  server.tool(
    'memory',
    `Manage conversational memory - record, save, and retrieve conversations.

Actions:
- start: Begin recording (auto-captures all tool interactions)
- save: End recording and save to vector database
- retrieve: Search/get messages from saved sessions
- list: Show all your saved sessions
- status: Health check and current recording status

When recording is active, ALL tool calls are automatically captured.`,
    MemorySchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const input = MemorySchema.parse(args);
        const userId = 'default_user';  // TODO: Get from auth context

        switch (input.action) {
          case 'start':
            return handleStart(userId, input);

          case 'save':
            return handleSave(input);

          case 'retrieve':
            return handleRetrieve(userId, input);

          case 'list':
            return handleList(userId, input);

          case 'status':
            return handleStatus(input);

          default:
            return {
              isError: true,
              content: [{ type: 'text', text: `Unknown action: ${input.action}` }],
            };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Memory error: ${message}` }],
        };
      }
    }
  );

  console.error('[MemoryTools] Registered memory tool with 5 actions');
}

// ============================================
// ACTION HANDLERS
// ============================================

async function handleStart(
  userId: string,
  input: MemoryInput
): Promise<CallToolResult> {
  const session = startSession(userId, {
    description: input.description,
    tags: input.tags,
  });

  const output = `## Memory Recording Started

**Session ID:** ${session.sessionId}
**Prefix:** ${session.sessionPrefix}
**Started:** ${session.startTime.toISOString()}

Recording is now **active**. All tool interactions will be automatically captured.

### To Save
Say \`memory action:save\` or \`memory_clause\` when done.

### To Cancel
Say \`memory action:cancel\` to discard without saving.`;

  return {
    content: [{ type: 'text', text: output }],
  };
}

async function handleSave(input: MemoryInput): Promise<CallToolResult> {
  const result = await saveSession({ generateSummary: true });

  const output = `## Memory Session Saved

**Session ID:** ${result.sessionId}
**Messages:** ${result.messageCount}
**Saved:** ${result.savedAt}

### To Retrieve
- \`memory action:retrieve session_id:${result.sessionId}\`
- \`memory action:retrieve query:"your search terms"\``;

  return {
    content: [{ type: 'text', text: output }],
  };
}

async function handleRetrieve(
  userId: string,
  input: MemoryInput
): Promise<CallToolResult> {
  // Option 1: Retrieve specific session
  if (input.session_id) {
    const messages = await retrieveSession(input.session_id, userId);

    if (messages.length === 0) {
      return {
        content: [{ type: 'text', text: `No messages found for session: ${input.session_id}` }],
      };
    }

    const output = formatMemorySession(messages, input.response_format);
    return { content: [{ type: 'text', text: output }] };
  }

  // Option 2: Semantic search
  if (input.query) {
    const queryVector = await embed(input.query, 'query');
    const results = await searchMemory({
      vector: queryVector,
      userId,
      limit: input.limit,
    });

    const output = formatMemorySearch(results, input.query, input.response_format);
    return { content: [{ type: 'text', text: output }] };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: 'Please provide session_id or query for retrieve action' }],
  };
}

async function handleList(
  userId: string,
  input: MemoryInput
): Promise<CallToolResult> {
  const sessions = await getSessionList(userId, 'saved', input.limit);
  const output = formatSessionList(sessions, input.response_format);
  return { content: [{ type: 'text', text: output }] };
}

async function handleStatus(input: MemoryInput): Promise<CallToolResult> {
  const health = await memoryHealthCheck();
  const output = formatMemoryStatus(health, input.response_format);
  return { content: [{ type: 'text', text: output }] };
}
```

#### 4.3 `src/services/formatters.ts`

Add these functions:

```typescript
// ============================================
// MEMORY FORMATTERS
// ============================================

export function formatMemorySession(
  messages: MemoryMetadata[],
  format: ResponseFormat
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({ messages }, null, 2);
  }

  const sessionId = messages[0]?.session_id || 'Unknown';
  const lines: string[] = [
    `## Memory Session: ${sessionId}`,
    `**Messages:** ${messages.length}`,
    `**Created:** ${messages[0]?.session_created || 'Unknown'}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    const roleIcon = msg.role === 'user' ? '👤' : '🤖';
    lines.push(`### ${roleIcon} ${msg.role.toUpperCase()} (#${msg.sequence_number})`);
    if (msg.tool_name) {
      lines.push(`*Tool: ${msg.tool_name}*`);
    }
    lines.push('');
    lines.push(msg.content.slice(0, 500) + (msg.content.length > 500 ? '...' : ''));
    lines.push('');
  }

  return lines.join('\n');
}

export function formatMemorySearch(
  results: MemoryQueryResult,
  query: string,
  format: ResponseFormat
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({ query, results }, null, 2);
  }

  const lines: string[] = [
    `## Memory Search Results`,
    `**Query:** "${query}"`,
    `**Found:** ${results.matches.length} messages`,
    `**Search Time:** ${results.searchTimeMs}ms`,
    '',
    '---',
    '',
  ];

  for (const match of results.matches) {
    const meta = match.metadata;
    if (!meta) continue;

    const score = (match.score * 100).toFixed(1);
    lines.push(`### [${score}%] Session: ${meta.session_id} (#${meta.sequence_number})`);
    lines.push(`*${meta.role}* | ${meta.message_timestamp}`);
    lines.push('');
    lines.push(meta.content.slice(0, 300) + (meta.content.length > 300 ? '...' : ''));
    lines.push('');
  }

  return lines.join('\n');
}

export function formatSessionList(
  sessions: Array<{ sessionId: string; messageCount: number; created: string }>,
  format: ResponseFormat
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({ sessions }, null, 2);
  }

  const lines: string[] = [
    `## Your Memory Sessions`,
    `**Total:** ${sessions.length}`,
    '',
    '| Session ID | Created | Messages |',
    '|------------|---------|----------|',
  ];

  for (const session of sessions) {
    lines.push(`| ${session.sessionId} | ${session.created.split('T')[0]} | ${session.messageCount} |`);
  }

  return lines.join('\n');
}

export function formatMemoryStatus(
  health: MemoryHealthStatus,
  format: ResponseFormat
): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(health, null, 2);
  }

  const statusIcon = health.connected ? '✅' : '❌';
  const lines: string[] = [
    `## Memory Status`,
    '',
    `| Component | Status |`,
    `|-----------|--------|`,
    `| Qdrant Connection | ${statusIcon} ${health.connected ? 'Connected' : 'Disconnected'} |`,
    `| Collection | ${health.collectionExists ? '✅ Exists' : '❌ Missing'} |`,
    `| Total Vectors | ${health.vectorCount.toLocaleString()} |`,
    '',
  ];

  if (health.activeSession) {
    lines.push('### Active Recording');
    lines.push(`- **Session:** ${health.activeSession.sessionId}`);
    lines.push(`- **Messages:** ${health.activeSession.messageCount}`);
    lines.push(`- **Started:** ${health.activeSession.startTime}`);
  } else {
    lines.push('*No active recording*');
  }

  return lines.join('\n');
}
```

### Test Scenarios for Stage 4

```typescript
// Test 4.1: Memory start action
// In Claude Desktop or Claude Code:
// > memory action:start description:"Testing CRM analysis"
// Expected: "Memory Recording Started" message with session ID

// Test 4.2: Memory status action
// > memory action:status
// Expected: Shows connected status, vector count, active session info

// Test 4.3: Memory save action (after some tool calls)
// > memory action:save
// Expected: "Memory Session Saved" with message count

// Test 4.4: Memory retrieve by session
// > memory action:retrieve session_id:20241215_103045
// Expected: Full conversation with all messages

// Test 4.5: Memory retrieve by query
// > memory action:retrieve query:"lost opportunities in education"
// Expected: Relevant messages ranked by similarity

// Test 4.6: Memory list action
// > memory action:list
// Expected: Table of saved sessions
```

### Verification Checklist

- [ ] Tool appears in Claude's tool list
- [ ] All 5 actions work correctly
- [ ] Error handling provides helpful messages
- [ ] Response formats (markdown/json) work

---

## Stage 5: Auto-Capture Integration

### Goal
Add auto-capture calls to all existing CRM and vector tools.

### Files to Modify

#### 5.1 `src/tools/crm-tools.ts`

Add at the top:

```typescript
import { isMemoryRecording, captureInteraction } from '../services/memory-service';
```

Then, at the end of each tool handler (before the return statement), add:

```typescript
// Auto-capture if memory recording is active
if (isMemoryRecording()) {
  captureInteraction('odoo_crm_search_leads', args, output);
}
```

**Example modification for `odoo_crm_search_leads`:**

```typescript
// Before:
return {
  content: [{ type: 'text', text: output }],
  structuredContent: response,
};

// After:
if (isMemoryRecording()) {
  captureInteraction('odoo_crm_search_leads', args, output);
}

return {
  content: [{ type: 'text', text: output }],
  structuredContent: response,
};
```

**List of 23 CRM tools to modify:**
1. odoo_crm_search_leads
2. odoo_crm_get_lead_detail
3. odoo_crm_search_contacts
4. odoo_crm_get_pipeline_summary
5. odoo_crm_get_sales_analytics
6. odoo_crm_get_activity_summary
7. odoo_crm_search_lost_opportunities
8. odoo_crm_get_lost_analysis
9. odoo_crm_get_lost_trends
10. odoo_crm_list_lost_reasons
11. odoo_crm_search_won_opportunities
12. odoo_crm_get_won_analysis
13. odoo_crm_get_won_trends
14. odoo_crm_compare_performance
15. odoo_crm_compare_states
16. odoo_crm_list_stages
17. odoo_crm_list_salespeople
18. odoo_crm_list_teams
19. odoo_crm_list_states
20. odoo_crm_list_fields
21. odoo_crm_export_data
22. odoo_crm_cache_status
23. odoo_crm_health_check

#### 5.2 `src/tools/vector-tools.ts`

Add at the top:

```typescript
import { isMemoryRecording, captureInteraction } from '../services/memory-service';
```

Add auto-capture to these 5 vector tools:
1. odoo_crm_semantic_search
2. odoo_crm_find_similar_deals
3. odoo_crm_discover_patterns
4. odoo_crm_sync_embeddings
5. odoo_crm_vector_status

### Test Scenarios for Stage 5

```typescript
// Test 5.1: Auto-capture works
// 1. Start recording: memory action:start
// 2. Call a CRM tool: Show me the pipeline summary
// 3. Check session: memory action:status
// Expected: Shows 2 messages captured (user tool call + assistant response)

// Test 5.2: Multiple tool calls captured
// 1. Start recording: memory action:start
// 2. Call: Show me lost opportunities
// 3. Call: Get pipeline summary
// 4. Call: Search for "education" leads
// 5. Save: memory action:save
// Expected: 6 messages saved (3 tools × 2 messages each)

// Test 5.3: No capture when not recording
// 1. Ensure no recording: memory action:status shows no active session
// 2. Call: Show me the pipeline summary
// 3. Check: memory action:status
// Expected: Still shows no active session, no messages captured
```

### Verification Checklist

- [ ] Import statement added to crm-tools.ts
- [ ] Import statement added to vector-tools.ts
- [ ] All 23 CRM tools have auto-capture
- [ ] All 5 vector tools have auto-capture
- [ ] Capture only happens when recording is active

---

## Stage 6: Server Integration

### Goal
Register memory tools and warm up memory client on server start.

### Files to Modify

#### 6.1 `src/index.ts`

Add imports:

```typescript
import { registerMemoryTools } from './tools/memory-tools';
import { warmMemoryClient } from './services/memory-client';
import { MEMORY_CONFIG } from './constants';
```

Add to warm-up Promise.all:

```typescript
Promise.all([
  warmCache(),
  warmPool(),
  (async () => {
    initializeEmbeddingService();
    await warmVectorClient();

    // NEW: Warm memory client
    if (MEMORY_CONFIG.ENABLED) {
      await warmMemoryClient();
    }
  })()
])
```

Add tool registration:

```typescript
// Register tools
registerCrmTools(server);
registerVectorTools(server);

// NEW: Register memory tools
if (MEMORY_CONFIG.ENABLED) {
  registerMemoryTools(server);
}
```

### Test Scenarios for Stage 6

```typescript
// Test 6.1: Server starts with memory enabled
// Set MEMORY_ENABLED=true in .env
// Run: npm run dev
// Expected: Log shows "[MemoryClient] Ready - 0 vectors" and "[MemoryTools] Registered memory tool"

// Test 6.2: Server starts with memory disabled
// Set MEMORY_ENABLED=false in .env
// Run: npm run dev
// Expected: Log shows "[MemoryTools] Memory features disabled - skipping registration"

// Test 6.3: Memory tool available in Claude
// Connect Claude Desktop to server
// Ask: "What tools do you have?"
// Expected: "memory" tool listed among available tools
```

### Verification Checklist

- [ ] Memory client warms up on server start
- [ ] Memory tool registered when enabled
- [ ] Memory tool NOT registered when disabled
- [ ] No errors in server startup logs

---

## End-to-End Testing

### Complete Workflow Test

```
# Step 1: Start the server
npm run dev

# Step 2: Connect Claude Desktop

# Step 3: Start recording
You: memory action:start description:"CRM Analysis Session"
Expected: "Memory Recording Started" with session ID

# Step 4: Use CRM tools
You: Show me the pipeline summary
Expected: Pipeline data returned, message captured

You: What are the top lost reasons?
Expected: Lost reasons returned, message captured

You: Find opportunities similar to deal #123
Expected: Similar deals returned, message captured

# Step 5: Check recording status
You: memory action:status
Expected: Shows 6 messages captured (3 tool calls × 2)

# Step 6: Save the session
You: memory action:save
Expected: "Session Saved" with 6 messages

# Step 7: Verify in Qdrant
# Check Qdrant dashboard: conversation_memory collection should have 6 vectors

# Step 8: Retrieve by session ID
You: memory action:retrieve session_id:[session_id_from_step_3]
Expected: Full conversation with 6 messages

# Step 9: Semantic search
You: memory action:retrieve query:"pipeline analysis"
Expected: Relevant messages from the session

# Step 10: List all sessions
You: memory action:list
Expected: Table showing the saved session
```

### Error Handling Tests

```
# Test E1: Start session twice
You: memory action:start
You: memory action:start
Expected: Error "Session already active..."

# Test E2: Save without recording
You: memory action:save
Expected: Error "No active session to save"

# Test E3: Retrieve non-existent session
You: memory action:retrieve session_id:99999999_999999
Expected: "No messages found for session..."

# Test E4: Invalid action
You: memory action:invalid
Expected: Error "Unknown action: invalid"
```

---

## Future: Phase 2 Streamable HTTP

### When to Implement

After Phase 1 is stable and you want to capture 100% of messages (including pure chat without tool calls).

### What Changes

```typescript
// Current (stdio)
const transport = new StdioServerTransport();

// Future (Streamable HTTP)
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamablehttp.js';

const transport = new StreamableHTTPServerTransport({
  sessionManagement: true,
  onMessage: (message) => {
    // Capture every message
    if (isMemoryRecording()) {
      captureMessage(message);
    }
  },
});
```

### Benefits

- Capture ALL messages (not just tool calls)
- Better session recovery on disconnection
- Real-time streaming responses
- More robust for production deployment

### Resources

- [MCP Streamable HTTP Specification](https://modelcontextprotocol.io/specification/2025-03-26)
- [How MCP Uses Streamable HTTP](https://thenewstack.io/how-mcp-uses-streamable-http-for-real-time-ai-tool-interaction/)

---

## Environment Variables

```bash
# Feature toggle
MEMORY_ENABLED=true

# Collection name
MEMORY_COLLECTION_NAME=conversation_memory

# Defaults
MEMORY_DEFAULT_LIMIT=20
MEMORY_AUTO_ARCHIVE_DAYS=90
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Memory client not initialized" | Server didn't warm up | Check QDRANT_HOST env var |
| "Session already active" | Forgot to save previous session | Call memory action:save first |
| No messages captured | Recording not started | Call memory action:start first |
| Search returns empty | No saved sessions | Save some sessions first |
| Embeddings fail | Voyage API issue | Check VOYAGE_API_KEY env var |

### Debug Logging

All memory operations log to stderr with prefix `[MemoryClient]` or `[MemoryService]`.

```bash
# Watch logs
npm run dev 2>&1 | grep -E "\[Memory"
```

---

## Summary

This implementation guide provides a complete roadmap for building the vector-native conversational memory system. Each stage builds on the previous one, with clear test scenarios to verify functionality before moving forward.

**Total Implementation Time**: Approximately 4-6 hours for an experienced developer.

**Key Success Metrics**:
- Memory recording starts/stops correctly
- Tool interactions are auto-captured
- Sessions are saved to Qdrant with proper embeddings
- Semantic search returns relevant results
- Multi-user isolation works correctly

Good luck with the implementation! 🚀
