/**
 * Memory Client - Qdrant wrapper for conversation_memory collection
 *
 * This service manages the vector database operations for conversational memory.
 * It follows the pattern of vector-client.ts but for memory storage.
 *
 * Key features:
 * - Separate collection from CRM vectors
 * - Session-based message storage
 * - Multi-user isolation via user_id filtering
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { MEMORY_COLLECTION_CONFIG, QDRANT_CONFIG } from '../constants.js';
import { MemoryMetadata, MemoryQueryOptions, MemoryQueryResult, MemoryHealthStatus } from '../types.js';

// ============================================
// CLIENT STATE
// ============================================

let memoryClient: QdrantClient | null = null;
let isInitialized = false;

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the Qdrant client for memory operations.
 * Uses the same connection as CRM vectors but different collection.
 */
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

/**
 * Get the memory client instance.
 */
export function getMemoryClient(): QdrantClient | null {
  return memoryClient;
}

// ============================================
// COLLECTION MANAGEMENT
// ============================================

/**
 * Ensure the conversation_memory collection exists with proper indexes.
 * Creates the collection if it doesn't exist.
 */
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

    // Create collection with HNSW configuration
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

    // Create payload indexes for efficient filtering
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

/**
 * Upsert memory records (messages) to the collection.
 */
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

  const points = records.map(r => ({
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

/**
 * Search memory with semantic similarity and filters.
 * Always filters by user_id for isolation.
 */
export async function searchMemory(
  options: MemoryQueryOptions & { vector: number[] }
): Promise<MemoryQueryResult> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  const startTime = Date.now();

  // Build filter - always include user_id for isolation
  const must: object[] = [];

  // Required: user isolation
  must.push({ key: 'user_id', match: { value: options.userId } });

  // Optional: session filter
  if (options.sessionId) {
    must.push({ key: 'session_id', match: { value: options.sessionId } });
  }

  // Optional: role filter
  if (options.role && options.role !== 'all') {
    must.push({ key: 'role', match: { value: options.role } });
  }

  // Optional: date range
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

/**
 * Retrieve all messages from a specific session.
 * Returns messages sorted by sequence number.
 */
export async function scrollMemoryBySession(
  sessionId: string,
  userId: string
): Promise<MemoryMetadata[]> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  const results: MemoryMetadata[] = [];
  let offset: string | number | null | undefined = undefined as string | number | undefined;

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
    offset = response.next_page_offset as string | number | undefined;
  }

  // Sort by sequence number for proper conversation order
  return results.sort((a, b) => a.sequence_number - b.sequence_number);
}

/**
 * Get list of saved sessions for a user.
 * Returns first message of each session (sequence_number = 1).
 */
export async function getSessionList(
  userId: string,
  status?: string,
  limit: number = 50
): Promise<Array<{ sessionId: string; messageCount: number; created: string; description?: string }>> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  const must: object[] = [
    { key: 'user_id', match: { value: userId } },
  ];

  if (status) {
    must.push({ key: 'session_status', match: { value: status } });
  }

  // Get first message of each session (sequence_number = 1)
  const response = await memoryClient.scroll(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
    filter: {
      must: [
        ...must,
        { key: 'sequence_number', match: { value: 1 } },
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
      description: meta.session_description,
    };
  });
}

/**
 * Delete all messages from a specific session.
 */
export async function deleteSession(sessionId: string, userId: string): Promise<number> {
  if (!memoryClient) {
    throw new Error('Memory client not initialized');
  }

  // First count how many points we'll delete
  const messages = await scrollMemoryBySession(sessionId, userId);
  const count = messages.length;

  if (count === 0) {
    return 0;
  }

  // Delete by filter
  await memoryClient.delete(MEMORY_COLLECTION_CONFIG.COLLECTION_NAME, {
    filter: {
      must: [
        { key: 'session_id', match: { value: sessionId } },
        { key: 'user_id', match: { value: userId } },
      ],
    },
  });

  console.error(`[MemoryClient] Deleted session ${sessionId} (${count} messages)`);
  return count;
}

// ============================================
// HEALTH CHECK
// ============================================

/**
 * Check health of memory infrastructure.
 * Returns connection status, collection info, and active session.
 */
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
    let activeSession = null;
    try {
      const { getActiveSession } = await import('./memory-service.js');
      const session = getActiveSession();
      if (session) {
        activeSession = {
          sessionId: session.sessionId,
          messageCount: session.messages.length,
          startTime: session.startTime.toISOString(),
        };
      }
    } catch {
      // memory-service not loaded yet, that's ok
    }

    return {
      connected: true,
      collectionExists: exists,
      vectorCount,
      activeSession,
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

/**
 * Warm up the memory client.
 * Called during server startup to ensure collection exists.
 */
export async function warmMemoryClient(): Promise<void> {
  console.error('[MemoryClient] Warming up...');

  if (!initializeMemoryClient()) {
    console.error('[MemoryClient] Failed to initialize');
    return;
  }

  await ensureMemoryCollection();

  const health = await memoryHealthCheck();
  console.error(`[MemoryClient] Ready - ${health.vectorCount} vectors in collection`);
}
