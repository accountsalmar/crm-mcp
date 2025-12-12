/**
 * Clustering Service - Pattern Discovery
 *
 * Uses K-means clustering to identify patterns in CRM data.
 * Groups similar opportunities to discover common themes.
 */
import { kmeans } from 'ml-kmeans';
import { scrollPoints } from './vector-client.js';
import { embed } from './embedding-service.js';
/**
 * Cluster embeddings using K-means.
 *
 * @param embeddings - Array of embedding vectors
 * @param numClusters - Number of clusters to create (2-10)
 * @returns Cluster assignments for each embedding
 */
export function clusterEmbeddings(embeddings, numClusters) {
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
function findClosestToCenter(embeddings, metadata, centroid, clusterIndices, topN) {
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
function analyzeClusterThemes(members) {
    // Count sectors
    const sectorCounts = new Map();
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
    const reasonCounts = new Map();
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
function generateClusterSummary(themes, size) {
    const parts = [];
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
export async function discoverPatterns(analysisType, filter, numClusters = 5) {
    const startTime = Date.now();
    // Build filter based on analysis type
    const scrollFilter = {};
    if (analysisType === 'lost_reasons' || analysisType === 'objection_themes') {
        scrollFilter.is_lost = true;
    }
    else if (analysisType === 'winning_factors') {
        scrollFilter.is_won = true;
    }
    if (filter.sector) {
        scrollFilter.sector = filter.sector;
    }
    if (filter.min_revenue) {
        scrollFilter.expected_revenue = { $gte: filter.min_revenue };
    }
    // Get all matching points using scroll (no dummy vector needed)
    console.error(`[Clustering] Fetching records for ${analysisType} analysis...`);
    const scrollResults = await scrollPoints(scrollFilter, 1000);
    console.error(`[Clustering] Found ${scrollResults.length} records matching filter`);
    if (scrollResults.length < numClusters * 2) {
        // Provide detailed error message
        const filterDesc = analysisType === 'lost_reasons' || analysisType === 'objection_themes'
            ? 'lost opportunities (is_lost=true)'
            : analysisType === 'winning_factors'
                ? 'won opportunities (is_won=true)'
                : 'all opportunities';
        return {
            analysisType,
            totalRecordsAnalyzed: scrollResults.length,
            numClusters: 0,
            clusters: [],
            insights: [
                `Not enough data for clustering: found ${scrollResults.length} ${filterDesc}`,
                `Minimum required: ${numClusters * 2} records (${numClusters} clusters x 2)`,
                scrollResults.length === 0
                    ? 'Tip: Run full_rebuild sync to ensure vector metadata is up to date'
                    : 'Tip: Try reducing numClusters or using deal_segments analysis type'
            ],
            durationMs: Date.now() - startTime,
        };
    }
    // Extract embeddings and metadata
    console.error(`[Clustering] Generating embeddings for ${scrollResults.length} records...`);
    const embeddings = [];
    const metadata = [];
    for (const result of scrollResults) {
        if (result.metadata?.embedding_text) {
            const embedding = await embed(result.metadata.embedding_text, 'document');
            embeddings.push(embedding);
            metadata.push(result.metadata);
        }
    }
    // Cluster
    const { clusters: clusterAssignments, centroids } = clusterEmbeddings(embeddings, numClusters);
    // Build cluster objects
    const clusterResults = [];
    for (let clusterId = 0; clusterId < numClusters; clusterId++) {
        const memberIndices = clusterAssignments
            .map((c, idx) => c === clusterId ? idx : -1)
            .filter(idx => idx >= 0);
        if (memberIndices.length === 0)
            continue;
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
                // Enhanced semantic fields from VectorMetadata
                partner_name: c.metadata.partner_name,
                stage_name: c.metadata.stage_name,
                expected_revenue: c.metadata.expected_revenue,
                city: c.metadata.city,
                state_name: c.metadata.state_name,
                sector: c.metadata.sector,
                specification_name: c.metadata.specification_name,
                is_won: c.metadata.is_won,
                is_lost: c.metadata.is_lost,
                lost_reason_name: c.metadata.lost_reason_name,
            })),
            commonThemes: themes,
            summary: generateClusterSummary(themes, memberIndices.length),
        });
    }
    // Sort clusters by size
    clusterResults.sort((a, b) => b.size - a.size);
    // Generate insights
    const insights = [];
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
//# sourceMappingURL=clustering-service.js.map