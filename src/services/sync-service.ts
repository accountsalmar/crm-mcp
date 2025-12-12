/**
 * Sync Service - Odoo to Vector Database Synchronization
 *
 * Orchestrates data flow from Odoo CRM to Qdrant vector database.
 * Supports incremental sync and full rebuild with conflict handling.
 */

import { VECTOR_SYNC_CONFIG, CRM_FIELDS, QDRANT_CONFIG } from '../constants.js';
import { CrmLead, VectorRecord, VectorMetadata, SyncProgress, SyncResult, VectorStatus } from '../types.js';
import { useClient } from './odoo-pool.js';
import { buildEmbeddingText, embedBatch, isEmbeddingServiceAvailable } from './embedding-service.js';
import { upsertPoints, deletePoints, getCollectionInfo, getCircuitBreakerState, healthCheck, ensureCollection } from './vector-client.js';
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
  // Determine if opportunity is won
  // Priority: 1) won_status field, 2) stage name patterns, 3) 'won' in stage name
  const stageName = (lead.stage_id && typeof lead.stage_id !== 'number')
    ? lead.stage_id[1]?.toLowerCase() || ''
    : '';

  const isWon = lead.won_status === 'won' ||
                stageName.includes('invoiced') ||
                stageName.includes('signed oc') ||
                stageName.includes('in production') ||
                stageName.includes('won');
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
 * Uses streaming batches to minimize memory usage for large datasets.
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
    // Ensure collection exists before syncing
    await ensureCollection();

    // Get total count first (memory-efficient)
    const domain: Array<string | boolean | Array<string | boolean>> = [];
    const context = { active_test: false };

    const total = await useClient(async (client) => {
      return client.searchCount('crm.lead', domain, context);
    });

    // Use smaller batch size for memory efficiency
    // Process 100 records at a time: fetch → embed → upsert → release memory
    const batchSize = 100;
    const totalBatches = Math.ceil(total / batchSize);

    // Stream through all records in batches
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const offset = batchNum * batchSize;

      // Phase 1: Fetch ONE batch from Odoo
      const batchLeads = await useClient(async (client) => {
        return client.searchRead<CrmLead>(
          'crm.lead',
          domain,
          CRM_FIELDS.LEAD_DETAIL,
          { offset, limit: batchSize, context }
        );
      });

      if (batchLeads.length === 0) {
        break; // No more records
      }

      // Report fetching progress
      if (onProgress) {
        onProgress({
          phase: 'fetching',
          currentBatch: batchNum + 1,
          totalBatches,
          recordsProcessed: offset + batchLeads.length,
          totalRecords: total,
          percentComplete: Math.round(((offset + batchLeads.length) / total) * 33),
          elapsedMs: Date.now() - startTime,
        });
      }

      // Phase 2: Generate embeddings for THIS batch only
      const embeddingData = batchLeads.map(lead => buildEmbeddingText(lead));
      const documents = embeddingData.map(d => d.text);

      let embeddings: number[][];
      try {
        embeddings = await embedBatch(documents, 'document');
      } catch (error) {
        recordsFailed += batchLeads.length;
        errors.push(`Batch ${batchNum + 1} embedding failed: ${error}`);
        continue; // Skip to next batch
      }

      // Report embedding progress
      if (onProgress) {
        onProgress({
          phase: 'embedding',
          currentBatch: batchNum + 1,
          totalBatches,
          recordsProcessed: offset + batchLeads.length,
          totalRecords: total,
          percentComplete: 33 + Math.round(((offset + batchLeads.length) / total) * 33),
          elapsedMs: Date.now() - startTime,
        });
      }

      // Phase 3: Upsert THIS batch to Qdrant
      const records: VectorRecord[] = batchLeads.map((lead, idx) => ({
        id: String(lead.id),
        values: embeddings[idx],
        metadata: buildMetadata(lead, embeddingData[idx].text, embeddingData[idx].truncated),
      }));

      try {
        await upsertPoints(records);
        recordsSynced += records.length;
      } catch (error) {
        recordsFailed += records.length;
        errors.push(`Batch ${batchNum + 1} upsert failed: ${error}`);
      }

      // Report upserting progress
      if (onProgress) {
        onProgress({
          phase: 'upserting',
          currentBatch: batchNum + 1,
          totalBatches,
          recordsProcessed: offset + batchLeads.length,
          totalRecords: total,
          percentComplete: 66 + Math.round(((offset + batchLeads.length) / total) * 34),
          elapsedMs: Date.now() - startTime,
        });
      }

      // Memory is now freed as we move to the next batch iteration
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
    // Ensure collection exists before syncing
    await ensureCollection();

    // Fetch changed records from Odoo (including lost and won)
    // Use active_test: false to include inactive (lost/won) records
    const leads = await useClient(async (client) => {
      const domain = [
        ['write_date', '>=', sinceDate],
      ];
      const context = { active_test: false };
      return client.searchRead<CrmLead>('crm.lead', domain, CRM_FIELDS.LEAD_DETAIL, { context });
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

  if (!QDRANT_CONFIG.ENABLED) {
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
