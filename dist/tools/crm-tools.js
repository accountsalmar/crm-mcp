import { getOdooClient } from '../services/odoo-client.js';
import { formatLeadList, formatLeadDetail, formatPipelineSummary, formatSalesAnalytics, formatContactList, formatActivitySummary, getRelationName, formatLostReasonsList, formatLostAnalysis, formatLostOpportunitiesList, formatLostTrends, formatDate } from '../services/formatters.js';
import { LeadSearchSchema, LeadDetailSchema, PipelineSummarySchema, SalesAnalyticsSchema, ContactSearchSchema, ActivitySummarySchema, StageListSchema, LostReasonsListSchema, LostAnalysisSchema, LostOpportunitiesSearchSchema, LostTrendsSchema } from '../schemas/index.js';
import { CRM_FIELDS, CONTEXT_LIMITS, ResponseFormat } from '../constants.js';
// Register all CRM tools
export function registerCrmTools(server) {
    // ============================================
    // TOOL: Search Leads/Opportunities
    // ============================================
    server.registerTool('odoo_crm_search_leads', {
        title: 'Search CRM Leads/Opportunities',
        description: `Search and filter Odoo CRM leads and opportunities with context-aware pagination.

Use this tool to find leads/opportunities by various criteria. Results are paginated to preserve context window space.

**When to use:**
- Finding specific leads by name, contact, or email
- Filtering opportunities by stage, salesperson, or revenue range
- Browsing pipeline with pagination

**Context Management Tips:**
- Start with limit=10 (default) to preview results
- Use filters to narrow results before increasing limit
- For large datasets, use odoo_crm_get_pipeline_summary instead

Returns paginated list with: name, contact, email, stage, revenue, probability`,
        inputSchema: LeadSearchSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Build domain filter
            const domain = [];
            if (params.active_only) {
                domain.push(['active', '=', true]);
            }
            if (params.query) {
                // OR search across name, contact, and email using Polish notation
                domain.push('|', '|', ['name', 'ilike', params.query], ['contact_name', 'ilike', params.query], ['email_from', 'ilike', params.query]);
            }
            if (params.stage_id) {
                domain.push(['stage_id', '=', params.stage_id]);
            }
            if (params.stage_name) {
                domain.push(['stage_id.name', 'ilike', params.stage_name]);
            }
            if (params.user_id) {
                domain.push(['user_id', '=', params.user_id]);
            }
            if (params.type) {
                domain.push(['type', '=', params.type]);
            }
            if (params.min_revenue !== undefined) {
                domain.push(['expected_revenue', '>=', params.min_revenue]);
            }
            if (params.max_revenue !== undefined) {
                domain.push(['expected_revenue', '<=', params.max_revenue]);
            }
            if (params.min_probability !== undefined) {
                domain.push(['probability', '>=', params.min_probability]);
            }
            if (params.date_from) {
                domain.push(['create_date', '>=', params.date_from]);
            }
            if (params.date_to) {
                domain.push(['create_date', '<=', params.date_to]);
            }
            // Get total count
            const total = await client.searchCount('crm.lead', domain);
            // Fetch records
            const leads = await client.searchRead('crm.lead', domain, CRM_FIELDS.LEAD_LIST, {
                offset: params.offset,
                limit: params.limit,
                order: `${params.order_by} ${params.order_dir}`
            });
            // Build paginated response
            const response = {
                total,
                count: leads.length,
                offset: params.offset,
                limit: params.limit,
                items: leads,
                has_more: total > params.offset + leads.length,
                next_offset: total > params.offset + leads.length ? params.offset + leads.length : undefined
            };
            // Add context note if large dataset
            if (total > CONTEXT_LIMITS.SUMMARY_THRESHOLD && params.limit < total) {
                response.context_note = `Large dataset (${total} records). Consider using filters or odoo_crm_get_pipeline_summary for overview.`;
            }
            const output = formatLeadList(response, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: response
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error searching leads: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Get Lead Details
    // ============================================
    server.registerTool('odoo_crm_get_lead_detail', {
        title: 'Get Lead/Opportunity Details',
        description: `Retrieve complete details for a single lead or opportunity by ID.

Use this tool when you need full information about a specific lead, including all contact details, assignment, dates, and notes.

**When to use:**
- After finding a lead ID from search results
- When user asks about a specific opportunity
- To get detailed notes or description

Returns all available fields for the lead including description/notes.`,
        inputSchema: LeadDetailSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            const leads = await client.read('crm.lead', [params.lead_id], CRM_FIELDS.LEAD_DETAIL);
            if (leads.length === 0) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Lead with ID ${params.lead_id} not found.` }]
                };
            }
            const lead = leads[0];
            if (params.response_format === ResponseFormat.JSON) {
                return {
                    content: [{ type: 'text', text: JSON.stringify(lead, null, 2) }],
                    structuredContent: lead
                };
            }
            return {
                content: [{ type: 'text', text: formatLeadDetail(lead) }],
                structuredContent: lead
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching lead: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Pipeline Summary (Aggregated)
    // ============================================
    server.registerTool('odoo_crm_get_pipeline_summary', {
        title: 'Get Pipeline Summary',
        description: `Get aggregated pipeline statistics grouped by stage - ideal for context-efficient overview.

This tool returns summary statistics instead of individual records, making it perfect for understanding pipeline health without consuming context window space.

**When to use:**
- Getting pipeline overview
- Analyzing opportunity distribution across stages
- Comparing revenue by stage
- When there are many opportunities (use this before search)

Returns: count, total revenue, avg probability per stage, plus optional top opportunities per stage.`,
        inputSchema: PipelineSummarySchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Build domain
            const domain = [['active', '=', true]];
            if (params.team_id) {
                domain.push(['team_id', '=', params.team_id]);
            }
            if (params.user_id) {
                domain.push(['user_id', '=', params.user_id]);
            }
            // Get stages
            const stages = await client.searchRead('crm.stage', [], ['id', 'name', 'sequence', 'is_won'], { order: 'sequence asc' });
            // Get aggregated data by stage
            const groupedData = await client.readGroup('crm.lead', domain, ['stage_id', 'expected_revenue:sum', 'probability:avg', '__count'], ['stage_id']);
            // Build summary
            const stageSummaries = [];
            for (const stage of stages) {
                const stageData = groupedData.find((g) => Array.isArray(g.stage_id) && g.stage_id[0] === stage.id);
                if (!stageData && !params.include_lost)
                    continue;
                const summary = {
                    stage_name: stage.name,
                    stage_id: stage.id,
                    count: stageData?.__count || 0,
                    total_revenue: stageData?.expected_revenue || 0,
                    avg_probability: stageData?.probability || 0,
                    opportunities: []
                };
                // Optionally fetch top opportunities per stage
                if (params.max_opps_per_stage > 0 && summary.count > 0) {
                    const stageDomain = [...domain, ['stage_id', '=', stage.id]];
                    const topOpps = await client.searchRead('crm.lead', stageDomain, ['id', 'name', 'expected_revenue', 'probability'], { limit: params.max_opps_per_stage, order: 'expected_revenue desc' });
                    summary.opportunities = topOpps.map(o => ({
                        id: o.id,
                        name: o.name,
                        expected_revenue: o.expected_revenue || 0,
                        probability: o.probability || 0
                    }));
                }
                stageSummaries.push(summary);
            }
            const output = formatPipelineSummary(stageSummaries, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: { stages: stageSummaries }
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching pipeline summary: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Sales Analytics
    // ============================================
    server.registerTool('odoo_crm_get_sales_analytics', {
        title: 'Get Sales Analytics',
        description: `Get comprehensive sales analytics and KPIs - the most context-efficient way to understand CRM performance.

Returns aggregated metrics including conversion rates, revenue analysis, and performance by stage/salesperson.

**When to use:**
- Understanding overall CRM performance
- Analyzing win/loss rates
- Comparing salesperson performance
- Identifying top opportunities

**Ideal for:** Initial analysis, reporting, performance reviews`,
        inputSchema: SalesAnalyticsSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Build base domain
            const domain = [];
            if (params.team_id) {
                domain.push(['team_id', '=', params.team_id]);
            }
            if (params.date_from) {
                domain.push(['create_date', '>=', params.date_from]);
            }
            if (params.date_to) {
                domain.push(['create_date', '<=', params.date_to]);
            }
            // Get counts
            const totalLeads = await client.searchCount('crm.lead', [...domain, ['type', '=', 'lead']]);
            const totalOpps = await client.searchCount('crm.lead', [...domain, ['type', '=', 'opportunity']]);
            const wonOpps = await client.searchCount('crm.lead', [...domain, ['probability', '=', 100]]);
            const lostOpps = await client.searchCount('crm.lead', [...domain, ['active', '=', false], ['probability', '=', 0]]);
            // Get revenue by stage
            const byStage = await client.readGroup('crm.lead', [...domain, ['active', '=', true]], ['stage_id', 'expected_revenue:sum', '__count'], ['stage_id']);
            // Get revenue totals
            const revenueExpected = byStage.reduce((sum, s) => sum + (s.expected_revenue || 0), 0);
            const wonRevenue = await client.readGroup('crm.lead', [...domain, ['probability', '=', 100]], ['expected_revenue:sum'], []);
            const revenueWon = wonRevenue[0]?.expected_revenue || 0;
            // Calculate analytics
            const analytics = {
                period: params.date_from || params.date_to
                    ? `${params.date_from || 'Start'} to ${params.date_to || 'Now'}`
                    : 'All Time',
                total_leads: totalLeads,
                total_opportunities: totalOpps,
                total_won: wonOpps,
                total_lost: lostOpps,
                total_revenue_expected: revenueExpected,
                total_revenue_won: revenueWon,
                conversion_rate: totalOpps > 0 ? (wonOpps / totalOpps) * 100 : 0,
                avg_deal_size: wonOpps > 0 ? revenueWon / wonOpps : 0,
                by_stage: byStage.map(s => ({
                    stage: Array.isArray(s.stage_id) ? s.stage_id[1] : 'Unknown',
                    count: s.__count || 0,
                    revenue: s.expected_revenue || 0
                })),
                top_opportunities: []
            };
            // Get by salesperson if requested
            if (params.include_by_salesperson) {
                const bySalesperson = await client.readGroup('crm.lead', [...domain, ['active', '=', true]], ['user_id', 'expected_revenue:sum', '__count'], ['user_id']);
                // Get won counts per user
                const wonBySalesperson = await client.readGroup('crm.lead', [...domain, ['probability', '=', 100]], ['user_id', '__count'], ['user_id']);
                analytics.by_salesperson = bySalesperson.map(s => {
                    const wonData = wonBySalesperson.find(w => Array.isArray(w.user_id) && Array.isArray(s.user_id) && w.user_id[0] === s.user_id[0]);
                    return {
                        name: Array.isArray(s.user_id) ? s.user_id[1] : 'Unassigned',
                        count: s.__count || 0,
                        revenue: s.expected_revenue || 0,
                        won: wonData?.__count || 0
                    };
                });
            }
            // Get top opportunities
            if (params.top_opportunities_count > 0) {
                const topOpps = await client.searchRead('crm.lead', [...domain, ['active', '=', true], ['probability', '<', 100]], ['name', 'expected_revenue', 'probability', 'stage_id'], { limit: params.top_opportunities_count, order: 'expected_revenue desc' });
                analytics.top_opportunities = topOpps.map(o => ({
                    name: o.name,
                    revenue: o.expected_revenue || 0,
                    probability: o.probability || 0,
                    stage: getRelationName(o.stage_id)
                }));
            }
            const output = formatSalesAnalytics(analytics, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: analytics
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching analytics: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Search Contacts
    // ============================================
    server.registerTool('odoo_crm_search_contacts', {
        title: 'Search CRM Contacts',
        description: `Search Odoo contacts/partners with pagination.

**When to use:**
- Finding customer or prospect contact details
- Looking up company information
- Finding contacts by location

Returns: name, email, phone, city, country`,
        inputSchema: ContactSearchSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Build domain
            const domain = [];
            if (params.query) {
                // OR search across name, email, and phone using Polish notation
                domain.push('|', '|', ['name', 'ilike', params.query], ['email', 'ilike', params.query], ['phone', 'ilike', params.query]);
            }
            if (params.is_company !== undefined) {
                domain.push(['is_company', '=', params.is_company]);
            }
            if (params.country) {
                domain.push(['country_id.name', 'ilike', params.country]);
            }
            if (params.city) {
                domain.push(['city', 'ilike', params.city]);
            }
            if (params.has_opportunities) {
                // Get partner IDs with opportunities
                const opps = await client.searchRead('crm.lead', [['partner_id', '!=', false]], ['partner_id'], { limit: 1000 });
                const partnerIds = [...new Set(opps.map(o => o.partner_id?.[0]).filter(Boolean))];
                if (partnerIds.length > 0) {
                    domain.push(['id', 'in', partnerIds]);
                }
            }
            // Get total count
            const total = await client.searchCount('res.partner', domain);
            // Fetch records
            const contacts = await client.searchRead('res.partner', domain, CRM_FIELDS.CONTACT_LIST, {
                offset: params.offset,
                limit: params.limit,
                order: 'name asc'
            });
            const response = {
                total,
                count: contacts.length,
                offset: params.offset,
                limit: params.limit,
                items: contacts,
                has_more: total > params.offset + contacts.length,
                next_offset: total > params.offset + contacts.length ? params.offset + contacts.length : undefined
            };
            const output = formatContactList(response, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: response
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error searching contacts: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Activity Summary
    // ============================================
    server.registerTool('odoo_crm_get_activity_summary', {
        title: 'Get Activity Summary',
        description: `Get aggregated summary of CRM activities (calls, meetings, tasks).

Returns activity counts by status (overdue, today, upcoming) and by type/user.

**When to use:**
- Checking workload distribution
- Finding overdue activities
- Planning follow-ups`,
        inputSchema: ActivitySummarySchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            const today = new Date().toISOString().split('T')[0];
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + params.days_ahead);
            const futureStr = futureDate.toISOString().split('T')[0];
            // Build base domain
            const baseDomain = [['res_model', '=', 'crm.lead']];
            if (params.user_id) {
                baseDomain.push(['user_id', '=', params.user_id]);
            }
            // Count by status
            const overdue = await client.searchCount('mail.activity', [
                ...baseDomain,
                ['date_deadline', '<', today]
            ]);
            const todayCount = await client.searchCount('mail.activity', [
                ...baseDomain,
                ['date_deadline', '=', today]
            ]);
            const upcoming = await client.searchCount('mail.activity', [
                ...baseDomain,
                ['date_deadline', '>', today],
                ['date_deadline', '<=', futureStr]
            ]);
            const total = overdue + todayCount + upcoming;
            // Get by type
            const byType = await client.readGroup('mail.activity', baseDomain, ['activity_type_id', '__count'], ['activity_type_id']);
            // Get overdue by type
            const overdueByType = await client.readGroup('mail.activity', [...baseDomain, ['date_deadline', '<', today]], ['activity_type_id', '__count'], ['activity_type_id']);
            // Get by user
            const byUser = await client.readGroup('mail.activity', baseDomain, ['user_id', '__count'], ['user_id']);
            const overdueByUser = await client.readGroup('mail.activity', [...baseDomain, ['date_deadline', '<', today]], ['user_id', '__count'], ['user_id']);
            const summary = {
                total_activities: total,
                overdue,
                today: todayCount,
                upcoming,
                by_type: byType.map(t => {
                    const overdueData = overdueByType.find(o => Array.isArray(o.activity_type_id) && Array.isArray(t.activity_type_id) &&
                        o.activity_type_id[0] === t.activity_type_id[0]);
                    return {
                        type: Array.isArray(t.activity_type_id) ? t.activity_type_id[1] : 'Unknown',
                        count: t.__count || 0,
                        overdue: overdueData?.__count || 0
                    };
                }),
                by_user: byUser.map(u => {
                    const overdueData = overdueByUser.find(o => Array.isArray(o.user_id) && Array.isArray(u.user_id) &&
                        o.user_id[0] === u.user_id[0]);
                    return {
                        user: Array.isArray(u.user_id) ? u.user_id[1] : 'Unassigned',
                        total: u.__count || 0,
                        overdue: overdueData?.__count || 0
                    };
                })
            };
            const output = formatActivitySummary(summary, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: summary
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching activities: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: List Stages
    // ============================================
    server.registerTool('odoo_crm_list_stages', {
        title: 'List CRM Stages',
        description: `Get all CRM pipeline stages with their IDs.

Use this to understand the pipeline structure and get stage IDs for filtering.

**When to use:**
- Before filtering leads by stage
- Understanding pipeline configuration`,
        inputSchema: StageListSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            const stages = await client.searchRead('crm.stage', [], ['id', 'name', 'sequence', 'is_won', 'fold'], { order: 'sequence asc' });
            if (params.response_format === ResponseFormat.JSON) {
                return {
                    content: [{ type: 'text', text: JSON.stringify({ stages }, null, 2) }],
                    structuredContent: { stages }
                };
            }
            let output = '## CRM Pipeline Stages\n\n';
            for (const stage of stages) {
                output += `- **${stage.name}** (ID: ${stage.id})`;
                if (stage.is_won)
                    output += ' ✅ Won';
                if (stage.fold)
                    output += ' 📁 Folded';
                output += '\n';
            }
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: { stages }
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching stages: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: List Lost Reasons
    // ============================================
    server.registerTool('odoo_crm_list_lost_reasons', {
        title: 'List Lost Reasons',
        description: `Retrieve all configured lost reasons from the CRM system.

Returns the list of predefined reasons for losing opportunities, with a count of opportunities associated with each reason.

**When to use:**
- Understanding why deals are being lost
- Getting reason IDs for filtering lost opportunity queries
- Reviewing the lost reason configuration`,
        inputSchema: LostReasonsListSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Try to get lost reasons from the dedicated model first
            let reasonsWithCounts = [];
            try {
                // Build domain for lost reasons
                const domain = params.include_inactive ? [] : [['active', '=', true]];
                // Get lost reasons from crm.lost.reason model
                const reasons = await client.searchRead('crm.lost.reason', domain, CRM_FIELDS.LOST_REASON, { order: 'name asc' });
                // Get count of opportunities per reason using read_group
                const countsByReason = await client.readGroup('crm.lead', [['lost_reason_id', '!=', false], ['active', '=', false], ['probability', '=', 0]], ['lost_reason_id', '__count'], ['lost_reason_id']);
                // Map counts to reasons
                reasonsWithCounts = reasons.map(reason => {
                    const countData = countsByReason.find((c) => Array.isArray(c.lost_reason_id) && c.lost_reason_id[0] === reason.id);
                    return {
                        ...reason,
                        opportunity_count: countData?.__count || 0
                    };
                });
            }
            catch {
                // Fallback: Extract lost reasons directly from crm.lead lost_reason_id values
                // This works even if crm.lost.reason model is not accessible
                const countsByReason = await client.readGroup('crm.lead', [['lost_reason_id', '!=', false], ['type', '=', 'opportunity']], ['lost_reason_id', '__count'], ['lost_reason_id']);
                // Build reasons from the grouped data
                reasonsWithCounts = countsByReason
                    .filter(c => Array.isArray(c.lost_reason_id) && c.lost_reason_id.length >= 2)
                    .map(c => {
                    const reasonArr = c.lost_reason_id;
                    return {
                        id: reasonArr[0],
                        name: reasonArr[1],
                        active: true,
                        opportunity_count: c.__count || 0
                    };
                })
                    .sort((a, b) => a.name.localeCompare(b.name));
            }
            const output = formatLostReasonsList(reasonsWithCounts, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: { reasons: reasonsWithCounts }
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching lost reasons: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Get Lost Analysis
    // ============================================
    server.registerTool('odoo_crm_get_lost_analysis', {
        title: 'Get Lost Opportunity Analysis',
        description: `Get aggregated analytics on lost opportunities - the primary tool for understanding why deals are being lost.

Returns summary statistics including total lost count and revenue, breakdown by the selected grouping, and optionally the top largest lost opportunities.

**When to use:**
- Understanding why deals are being lost (group by reason)
- Analyzing which salespeople have highest loss rates (group by salesperson)
- Finding at which stage deals are lost most (group by stage)
- Reviewing monthly loss trends (group by month)

**Best Practices:**
- Start with group_by='reason' for initial analysis
- Use date filters to focus on specific time periods
- Compare with won data for context (win/loss ratio)`,
        inputSchema: LostAnalysisSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Build domain for lost opportunities
            // Lost = active=False AND probability=0 OR lost_reason_id is set
            const domain = [
                ['type', '=', 'opportunity'],
                '|',
                '&', ['active', '=', false], ['probability', '=', 0],
                ['lost_reason_id', '!=', false]
            ];
            // Apply filters
            if (params.date_from) {
                domain.push(['date_closed', '>=', params.date_from]);
            }
            if (params.date_to) {
                domain.push(['date_closed', '<=', params.date_to]);
            }
            if (params.user_id) {
                domain.push(['user_id', '=', params.user_id]);
            }
            if (params.team_id) {
                domain.push(['team_id', '=', params.team_id]);
            }
            if (params.lost_reason_id) {
                domain.push(['lost_reason_id', '=', params.lost_reason_id]);
            }
            if (params.stage_id) {
                domain.push(['stage_id', '=', params.stage_id]);
            }
            if (params.min_revenue !== undefined) {
                domain.push(['expected_revenue', '>=', params.min_revenue]);
            }
            // Get total lost count and revenue
            const lostTotals = await client.readGroup('crm.lead', domain, ['expected_revenue:sum', '__count'], []);
            const totalLost = lostTotals[0]?.__count || 0;
            const totalLostRevenue = lostTotals[0]?.expected_revenue || 0;
            // Build analysis summary
            const analysis = {
                period: params.date_from || params.date_to
                    ? `${params.date_from || 'Start'} to ${params.date_to || 'Now'}`
                    : 'All Time',
                total_lost: totalLost,
                total_lost_revenue: totalLostRevenue,
                avg_deal_size: totalLost > 0 ? totalLostRevenue / totalLost : 0
            };
            // Get won data for context
            const wonDomain = [
                ['type', '=', 'opportunity'],
                ['probability', '=', 100]
            ];
            if (params.date_from)
                wonDomain.push(['date_closed', '>=', params.date_from]);
            if (params.date_to)
                wonDomain.push(['date_closed', '<=', params.date_to]);
            if (params.user_id)
                wonDomain.push(['user_id', '=', params.user_id]);
            if (params.team_id)
                wonDomain.push(['team_id', '=', params.team_id]);
            const wonTotals = await client.readGroup('crm.lead', wonDomain, ['expected_revenue:sum', '__count'], []);
            analysis.total_won = wonTotals[0]?.__count || 0;
            analysis.total_won_revenue = wonTotals[0]?.expected_revenue || 0;
            analysis.win_rate = (analysis.total_won + totalLost) > 0
                ? (analysis.total_won / (analysis.total_won + totalLost)) * 100
                : 0;
            // Get grouped data based on group_by parameter
            if (params.group_by === 'reason') {
                const byReason = await client.readGroup('crm.lead', domain, ['lost_reason_id', 'expected_revenue:sum', '__count'], ['lost_reason_id']);
                analysis.by_reason = byReason.map(r => ({
                    reason_id: Array.isArray(r.lost_reason_id) ? r.lost_reason_id[0] : 0,
                    reason_name: Array.isArray(r.lost_reason_id) ? r.lost_reason_id[1] : 'No Reason Specified',
                    count: r.__count || 0,
                    percentage: totalLost > 0 ? (r.__count / totalLost) * 100 : 0,
                    lost_revenue: r.expected_revenue || 0,
                    avg_deal: r.__count > 0 ? (r.expected_revenue || 0) / r.__count : 0
                })).sort((a, b) => b.count - a.count);
            }
            if (params.group_by === 'salesperson') {
                const byUser = await client.readGroup('crm.lead', domain, ['user_id', 'expected_revenue:sum', '__count'], ['user_id']);
                analysis.by_salesperson = byUser.map(u => ({
                    user_id: Array.isArray(u.user_id) ? u.user_id[0] : 0,
                    user_name: Array.isArray(u.user_id) ? u.user_id[1] : 'Unassigned',
                    count: u.__count || 0,
                    percentage: totalLost > 0 ? (u.__count / totalLost) * 100 : 0,
                    lost_revenue: u.expected_revenue || 0,
                    avg_deal: u.__count > 0 ? (u.expected_revenue || 0) / u.__count : 0
                })).sort((a, b) => b.count - a.count);
            }
            if (params.group_by === 'team') {
                const byTeam = await client.readGroup('crm.lead', domain, ['team_id', 'expected_revenue:sum', '__count'], ['team_id']);
                analysis.by_team = byTeam.map(t => ({
                    team_id: Array.isArray(t.team_id) ? t.team_id[0] : 0,
                    team_name: Array.isArray(t.team_id) ? t.team_id[1] : 'No Team',
                    count: t.__count || 0,
                    percentage: totalLost > 0 ? (t.__count / totalLost) * 100 : 0,
                    lost_revenue: t.expected_revenue || 0,
                    avg_deal: t.__count > 0 ? (t.expected_revenue || 0) / t.__count : 0
                })).sort((a, b) => b.count - a.count);
            }
            if (params.group_by === 'stage') {
                const byStage = await client.readGroup('crm.lead', domain, ['stage_id', 'expected_revenue:sum', '__count'], ['stage_id']);
                analysis.by_stage = byStage.map(s => ({
                    stage_id: Array.isArray(s.stage_id) ? s.stage_id[0] : 0,
                    stage_name: Array.isArray(s.stage_id) ? s.stage_id[1] : 'Unknown',
                    count: s.__count || 0,
                    percentage: totalLost > 0 ? (s.__count / totalLost) * 100 : 0,
                    lost_revenue: s.expected_revenue || 0,
                    avg_deal: s.__count > 0 ? (s.expected_revenue || 0) / s.__count : 0
                })).sort((a, b) => b.count - a.count);
            }
            if (params.group_by === 'month') {
                const byMonth = await client.readGroup('crm.lead', domain, ['date_closed:month', 'expected_revenue:sum', '__count'], ['date_closed:month']);
                analysis.by_month = byMonth.map(m => ({
                    month: m['date_closed:month'] || 'Unknown',
                    count: m.__count || 0,
                    lost_revenue: m.expected_revenue || 0
                }));
            }
            // Get top lost opportunities
            if (params.include_top_lost > 0) {
                const topLost = await client.searchRead('crm.lead', domain, ['id', 'name', 'expected_revenue', 'lost_reason_id', 'user_id', 'date_closed'], { limit: params.include_top_lost, order: 'expected_revenue desc' });
                analysis.top_lost = topLost.map(o => ({
                    id: o.id,
                    name: o.name,
                    revenue: o.expected_revenue || 0,
                    reason: getRelationName(o.lost_reason_id),
                    salesperson: getRelationName(o.user_id),
                    date_closed: formatDate(o.date_closed)
                }));
            }
            const output = formatLostAnalysis(analysis, params.group_by, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: analysis
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching lost analysis: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Search Lost Opportunities
    // ============================================
    server.registerTool('odoo_crm_search_lost_opportunities', {
        title: 'Search Lost Opportunities',
        description: `Search and browse lost opportunities with filtering and pagination.

Returns a paginated list of lost opportunities with details including the lost reason, revenue, stage when lost, and salesperson.

**When to use:**
- Finding specific lost deals by name or contact
- Drilling down into opportunities lost to competitors
- Reviewing lost deals for a specific salesperson or time period
- Finding the biggest deals that were lost`,
        inputSchema: LostOpportunitiesSearchSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Build domain for lost opportunities
            const domain = [
                ['type', '=', 'opportunity'],
                '|',
                '&', ['active', '=', false], ['probability', '=', 0],
                ['lost_reason_id', '!=', false]
            ];
            // Apply search filters
            if (params.query) {
                domain.push('|', '|', ['name', 'ilike', params.query], ['contact_name', 'ilike', params.query], ['email_from', 'ilike', params.query]);
            }
            if (params.lost_reason_id) {
                domain.push(['lost_reason_id', '=', params.lost_reason_id]);
            }
            if (params.lost_reason_name) {
                domain.push(['lost_reason_id.name', 'ilike', params.lost_reason_name]);
            }
            if (params.user_id) {
                domain.push(['user_id', '=', params.user_id]);
            }
            if (params.team_id) {
                domain.push(['team_id', '=', params.team_id]);
            }
            if (params.stage_id) {
                domain.push(['stage_id', '=', params.stage_id]);
            }
            if (params.date_from) {
                domain.push(['date_closed', '>=', params.date_from]);
            }
            if (params.date_to) {
                domain.push(['date_closed', '<=', params.date_to]);
            }
            if (params.min_revenue !== undefined) {
                domain.push(['expected_revenue', '>=', params.min_revenue]);
            }
            if (params.max_revenue !== undefined) {
                domain.push(['expected_revenue', '<=', params.max_revenue]);
            }
            // Get total count
            const total = await client.searchCount('crm.lead', domain);
            // Fetch records
            const opportunities = await client.searchRead('crm.lead', domain, CRM_FIELDS.LOST_OPPORTUNITY_DETAIL, {
                offset: params.offset,
                limit: params.limit,
                order: `${params.order_by} ${params.order_dir}`
            });
            // Build paginated response
            const response = {
                total,
                count: opportunities.length,
                offset: params.offset,
                limit: params.limit,
                items: opportunities,
                has_more: total > params.offset + opportunities.length,
                next_offset: total > params.offset + opportunities.length ? params.offset + opportunities.length : undefined
            };
            const output = formatLostOpportunitiesList(response, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: response
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error searching lost opportunities: ${message}` }]
            };
        }
    });
    // ============================================
    // TOOL: Get Lost Trends
    // ============================================
    server.registerTool('odoo_crm_get_lost_trends', {
        title: 'Get Lost Opportunity Trends',
        description: `Analyze lost opportunity trends over time for pattern identification.

Returns time-series data showing lost opportunities grouped by week, month, or quarter, with optional win/loss comparison.

**When to use:**
- Identifying seasonal patterns in lost deals
- Tracking if loss rates are improving or worsening
- Finding periods with unusual loss activity
- Correlating losses with business changes

**Insights provided:**
- Lost count and revenue per period
- Win/loss ratio trends
- Best and worst performing periods
- Most common lost reason overall`,
        inputSchema: LostTrendsSchema,
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    }, async (params) => {
        try {
            const client = getOdooClient();
            // Build domain for lost opportunities
            const lostDomain = [
                ['type', '=', 'opportunity'],
                '|',
                '&', ['active', '=', false], ['probability', '=', 0],
                ['lost_reason_id', '!=', false]
            ];
            // Apply filters
            if (params.date_from) {
                lostDomain.push(['date_closed', '>=', params.date_from]);
            }
            if (params.date_to) {
                lostDomain.push(['date_closed', '<=', params.date_to]);
            }
            if (params.user_id) {
                lostDomain.push(['user_id', '=', params.user_id]);
            }
            if (params.team_id) {
                lostDomain.push(['team_id', '=', params.team_id]);
            }
            // Helper function to get period label from date string
            const getPeriodLabel = (dateStr, granularity) => {
                if (!dateStr)
                    return 'Unknown';
                const date = new Date(dateStr);
                if (isNaN(date.getTime()))
                    return 'Unknown';
                const year = date.getFullYear();
                const month = date.getMonth(); // 0-indexed
                switch (granularity) {
                    case 'week': {
                        // Get ISO week number
                        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
                        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
                        return `${year}-W${weekNo.toString().padStart(2, '0')}`;
                    }
                    case 'quarter': {
                        const quarter = Math.floor(month / 3) + 1;
                        return `${year}-Q${quarter}`;
                    }
                    case 'month':
                    default: {
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return `${monthNames[month]} ${year}`;
                    }
                }
            };
            // Fetch lost opportunities with date_closed, expected_revenue, and lost_reason_id
            const lostOpps = await client.searchRead('crm.lead', lostDomain, ['id', 'date_closed', 'expected_revenue', 'lost_reason_id'], { limit: 10000, order: 'date_closed desc' });
            // Group lost opportunities by period
            const lostByPeriodMap = new Map();
            for (const opp of lostOpps) {
                const periodLabel = getPeriodLabel(opp.date_closed, params.granularity);
                if (!lostByPeriodMap.has(periodLabel)) {
                    lostByPeriodMap.set(periodLabel, { count: 0, revenue: 0, reasons: new Map() });
                }
                const periodData = lostByPeriodMap.get(periodLabel);
                periodData.count++;
                periodData.revenue += opp.expected_revenue || 0;
                // Track lost reasons
                if (Array.isArray(opp.lost_reason_id) && opp.lost_reason_id.length >= 2) {
                    const reasonName = opp.lost_reason_id[1];
                    periodData.reasons.set(reasonName, (periodData.reasons.get(reasonName) || 0) + 1);
                }
            }
            // Fetch won opportunities if comparison requested
            const wonByPeriodMap = new Map();
            if (params.compare_to_won) {
                const wonDomain = [
                    ['type', '=', 'opportunity'],
                    ['probability', '=', 100]
                ];
                if (params.date_from)
                    wonDomain.push(['date_closed', '>=', params.date_from]);
                if (params.date_to)
                    wonDomain.push(['date_closed', '<=', params.date_to]);
                if (params.user_id)
                    wonDomain.push(['user_id', '=', params.user_id]);
                if (params.team_id)
                    wonDomain.push(['team_id', '=', params.team_id]);
                const wonOpps = await client.searchRead('crm.lead', wonDomain, ['id', 'date_closed', 'expected_revenue'], { limit: 10000, order: 'date_closed desc' });
                for (const opp of wonOpps) {
                    const periodLabel = getPeriodLabel(opp.date_closed, params.granularity);
                    if (!wonByPeriodMap.has(periodLabel)) {
                        wonByPeriodMap.set(periodLabel, { count: 0, revenue: 0 });
                    }
                    const periodData = wonByPeriodMap.get(periodLabel);
                    periodData.count++;
                    periodData.revenue += opp.expected_revenue || 0;
                }
            }
            // Process into periods array
            const periods = [];
            // Sort periods chronologically
            const sortedPeriods = Array.from(lostByPeriodMap.keys()).sort();
            for (const periodLabel of sortedPeriods) {
                const lostData = lostByPeriodMap.get(periodLabel);
                const wonData = wonByPeriodMap.get(periodLabel);
                // Find top lost reason for this period
                let topLostReason;
                let maxReasonCount = 0;
                for (const [reason, count] of lostData.reasons.entries()) {
                    if (count > maxReasonCount) {
                        maxReasonCount = count;
                        topLostReason = reason;
                    }
                }
                const wonCount = params.compare_to_won ? (wonData?.count || 0) : undefined;
                const wonRevenue = params.compare_to_won ? (wonData?.revenue || 0) : undefined;
                const winRate = params.compare_to_won && wonCount !== undefined && (lostData.count + wonCount) > 0
                    ? (wonCount / (lostData.count + wonCount)) * 100
                    : undefined;
                periods.push({
                    period_label: periodLabel,
                    lost_count: lostData.count,
                    lost_revenue: lostData.revenue,
                    won_count: wonCount,
                    won_revenue: wonRevenue,
                    win_rate: winRate,
                    top_lost_reason: topLostReason
                });
            }
            // Calculate insights
            const totalLost = periods.reduce((sum, p) => sum + p.lost_count, 0);
            const totalLostRevenue = periods.reduce((sum, p) => sum + p.lost_revenue, 0);
            const avgLost = periods.length > 0 ? totalLost / periods.length : 0;
            const avgRevenue = periods.length > 0 ? totalLostRevenue / periods.length : 0;
            // Find worst and best periods
            const sortedByLost = [...periods].sort((a, b) => b.lost_count - a.lost_count);
            const worstPeriod = sortedByLost[0];
            const bestPeriod = sortedByLost[sortedByLost.length - 1];
            // Find most common reason overall
            const reasonCounts = new Map();
            for (const [, periodData] of lostByPeriodMap) {
                for (const [reason, count] of periodData.reasons) {
                    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + count);
                }
            }
            let mostCommonReason;
            let maxCount = 0;
            for (const [name, count] of reasonCounts.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    mostCommonReason = name;
                }
            }
            const trends = {
                period: params.date_from || params.date_to
                    ? `${params.date_from || 'Start'} to ${params.date_to || 'Now'}`
                    : 'All Time',
                granularity: params.granularity,
                periods,
                avg_monthly_lost: avgLost,
                avg_monthly_revenue: avgRevenue,
                worst_period: worstPeriod ? {
                    label: worstPeriod.period_label,
                    lost_count: worstPeriod.lost_count,
                    win_rate: worstPeriod.win_rate
                } : undefined,
                best_period: bestPeriod && bestPeriod !== worstPeriod ? {
                    label: bestPeriod.period_label,
                    lost_count: bestPeriod.lost_count,
                    win_rate: bestPeriod.win_rate
                } : undefined,
                most_common_reason: mostCommonReason
            };
            const output = formatLostTrends(trends, params.response_format);
            return {
                content: [{ type: 'text', text: output }],
                structuredContent: trends
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isError: true,
                content: [{ type: 'text', text: `Error fetching lost trends: ${message}` }]
            };
        }
    });
}
//# sourceMappingURL=crm-tools.js.map