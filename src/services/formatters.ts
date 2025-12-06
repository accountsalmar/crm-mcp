import { CONTEXT_LIMITS, ResponseFormat } from '../constants.js';
import type { CrmLead, PaginatedResponse, PipelineSummary, SalesAnalytics, ActivitySummary, ResPartner, LostReasonWithCount, LostAnalysisSummary, LostOpportunity, LostTrendsSummary } from '../types.js';

// Format currency value
export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

// Format percentage
export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return '-';
  return `${Math.round(value)}%`;
}

// Format date
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

// Extract name from Odoo relation field [id, name]
export function getRelationName(field: [number, string] | undefined | null): string {
  return field?.[1] || '-';
}

// Truncate text to preserve context
export function truncateText(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Format lead for list view (minimal fields)
export function formatLeadListItem(lead: CrmLead): string {
  return `- **${lead.name}** (ID: ${lead.id})
  Contact: ${lead.contact_name || '-'} | ${lead.email_from || '-'}
  Stage: ${getRelationName(lead.stage_id)} | Revenue: ${formatCurrency(lead.expected_revenue)} | Prob: ${formatPercent(lead.probability)}`;
}

// Format lead detail view
export function formatLeadDetail(lead: CrmLead): string {
  return `## ${lead.name}
**ID:** ${lead.id} | **Type:** ${lead.type || 'opportunity'}

### Contact Information
- **Contact:** ${lead.contact_name || '-'}
- **Email:** ${lead.email_from || '-'}
- **Phone:** ${lead.phone || '-'} | **Mobile:** ${lead.mobile || '-'}
- **Address:** ${[lead.street, lead.city, getRelationName(lead.country_id)].filter(Boolean).join(', ') || '-'}

### Opportunity Details
- **Stage:** ${getRelationName(lead.stage_id)}
- **Expected Revenue:** ${formatCurrency(lead.expected_revenue)}
- **Probability:** ${formatPercent(lead.probability)}
- **Priority:** ${lead.priority || '-'}

### Assignment
- **Salesperson:** ${getRelationName(lead.user_id)}
- **Sales Team:** ${getRelationName(lead.team_id)}
- **Partner/Company:** ${getRelationName(lead.partner_id)}

### Dates
- **Created:** ${formatDate(lead.create_date)}
- **Deadline:** ${formatDate(lead.date_deadline)}
- **Closed:** ${formatDate(lead.date_closed)}
- **Last Updated:** ${formatDate(lead.write_date)}

### Source
- **Source:** ${getRelationName(lead.source_id)}
- **Medium:** ${getRelationName(lead.medium_id)}
- **Campaign:** ${getRelationName(lead.campaign_id)}

${lead.description ? `### Notes\n${truncateText(lead.description, 500)}` : ''}`;
}

// Format paginated leads response
export function formatLeadList(data: PaginatedResponse<CrmLead>, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }
  
  let output = `## Leads/Opportunities (${data.count} of ${data.total})\n\n`;
  
  if (data.items.length === 0) {
    output += '_No leads found matching your criteria._\n';
  } else {
    output += data.items.map(formatLeadListItem).join('\n\n');
  }
  
  output += '\n\n---\n';
  output += `**Showing:** ${data.offset + 1}-${data.offset + data.count} of ${data.total}`;
  
  if (data.has_more) {
    output += ` | **Next page:** Use offset=${data.next_offset}`;
  }
  
  if (data.context_note) {
    output += `\n\n_💡 ${data.context_note}_`;
  }
  
  return output;
}

// Format pipeline summary
export function formatPipelineSummary(stages: PipelineSummary[], format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({ stages }, null, 2);
  }
  
  let output = '## Pipeline Summary\n\n';
  
  const totalRevenue = stages.reduce((sum, s) => sum + s.total_revenue, 0);
  const totalCount = stages.reduce((sum, s) => sum + s.count, 0);
  
  output += `**Total Pipeline:** ${totalCount} opportunities | ${formatCurrency(totalRevenue)}\n\n`;
  
  for (const stage of stages) {
    output += `### ${stage.stage_name}\n`;
    output += `- **Count:** ${stage.count} | **Revenue:** ${formatCurrency(stage.total_revenue)} | **Avg Prob:** ${formatPercent(stage.avg_probability)}\n`;
    
    if (stage.opportunities.length > 0) {
      output += '- **Top opportunities:**\n';
      for (const opp of stage.opportunities) {
        output += `  - ${opp.name}: ${formatCurrency(opp.expected_revenue)} (${formatPercent(opp.probability)})\n`;
      }
    }
    output += '\n';
  }
  
  return output;
}

// Format sales analytics
export function formatSalesAnalytics(analytics: SalesAnalytics, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(analytics, null, 2);
  }
  
  let output = `## Sales Analytics ${analytics.period ? `(${analytics.period})` : ''}\n\n`;
  
  output += `### Overview
- **Total Leads:** ${analytics.total_leads}
- **Total Opportunities:** ${analytics.total_opportunities}
- **Won:** ${analytics.total_won} | **Lost:** ${analytics.total_lost}
- **Conversion Rate:** ${formatPercent(analytics.conversion_rate)}
- **Average Deal Size:** ${formatCurrency(analytics.avg_deal_size)}

### Revenue
- **Expected:** ${formatCurrency(analytics.total_revenue_expected)}
- **Won:** ${formatCurrency(analytics.total_revenue_won)}

### By Stage\n`;
  
  for (const stage of analytics.by_stage) {
    output += `- ${stage.stage}: ${stage.count} opp | ${formatCurrency(stage.revenue)}\n`;
  }
  
  if (analytics.by_salesperson && analytics.by_salesperson.length > 0) {
    output += '\n### By Salesperson\n';
    for (const sp of analytics.by_salesperson) {
      output += `- **${sp.name}:** ${sp.count} opp | ${formatCurrency(sp.revenue)} | ${sp.won} won\n`;
    }
  }
  
  if (analytics.top_opportunities.length > 0) {
    output += '\n### Top Opportunities\n';
    for (const opp of analytics.top_opportunities) {
      output += `- ${opp.name}: ${formatCurrency(opp.revenue)} (${formatPercent(opp.probability)}) - ${opp.stage}\n`;
    }
  }
  
  return output;
}

// Format activity summary
export function formatActivitySummary(summary: ActivitySummary, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(summary, null, 2);
  }
  
  let output = `## Activity Summary\n\n`;
  
  output += `### Overview
- **Total Activities:** ${summary.total_activities}
- **⚠️ Overdue:** ${summary.overdue}
- **📅 Today:** ${summary.today}
- **🔜 Upcoming:** ${summary.upcoming}

### By Type\n`;
  
  for (const type of summary.by_type) {
    output += `- ${type.type}: ${type.count} total (${type.overdue} overdue)\n`;
  }
  
  if (summary.by_user.length > 0) {
    output += '\n### By User\n';
    for (const user of summary.by_user) {
      output += `- ${user.user}: ${user.total} total (${user.overdue} overdue)\n`;
    }
  }
  
  return output;
}

// Format contact list
export function formatContactList(data: PaginatedResponse<ResPartner>, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }
  
  let output = `## Contacts (${data.count} of ${data.total})\n\n`;
  
  if (data.items.length === 0) {
    output += '_No contacts found matching your criteria._\n';
  } else {
    for (const contact of data.items) {
      output += `- **${contact.name}** (ID: ${contact.id})${contact.is_company ? ' 🏢' : ''}\n`;
      output += `  ${contact.email || '-'} | ${contact.phone || contact.mobile || '-'}\n`;
      output += `  ${[contact.city, getRelationName(contact.country_id)].filter(x => x && x !== '-').join(', ') || '-'}\n\n`;
    }
  }
  
  output += '---\n';
  output += `**Showing:** ${data.offset + 1}-${data.offset + data.count} of ${data.total}`;
  
  if (data.has_more) {
    output += ` | **Next page:** Use offset=${data.next_offset}`;
  }
  
  return output;
}

// Check if response exceeds context limits
export function checkContextLimit(response: string): { ok: boolean; note?: string } {
  if (response.length > CONTEXT_LIMITS.MAX_RESPONSE_CHARS) {
    return {
      ok: false,
      note: `Response truncated. Use pagination (smaller limit) or filters to reduce data.`
    };
  }
  return { ok: true };
}

// Format lost reasons list
export function formatLostReasonsList(reasons: LostReasonWithCount[], format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify({ reasons }, null, 2);
  }

  let output = '## Lost Reasons\n\n';

  if (reasons.length === 0) {
    output += '_No lost reasons configured in the system._\n';
    return output;
  }

  output += '| ID | Reason | Active | Opportunities |\n';
  output += '|----|--------|--------|---------------|\n';

  for (const reason of reasons) {
    const activeIcon = reason.active !== false ? '✓' : '✗';
    output += `| ${reason.id} | ${reason.name} | ${activeIcon} | ${reason.opportunity_count.toLocaleString()} |\n`;
  }

  return output;
}

// Format lost analysis summary
export function formatLostAnalysis(analysis: LostAnalysisSummary, groupBy: string, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(analysis, null, 2);
  }

  let output = `## Lost Opportunity Analysis\n\n`;

  if (analysis.period) {
    output += `**Period:** ${analysis.period}\n`;
  }
  output += `**Total Lost:** ${analysis.total_lost.toLocaleString()} opportunities | ${formatCurrency(analysis.total_lost_revenue)}\n`;
  output += `**Average Deal Size:** ${formatCurrency(analysis.avg_deal_size)}\n\n`;

  // Win/Loss Context
  if (analysis.total_won !== undefined && analysis.win_rate !== undefined) {
    output += `### Win/Loss Context\n`;
    output += `- **Win Rate:** ${formatPercent(analysis.win_rate)} (${analysis.total_won?.toLocaleString()} won vs ${analysis.total_lost.toLocaleString()} lost)\n`;
    output += `- **Won Revenue:** ${formatCurrency(analysis.total_won_revenue)}\n`;
    output += `- **Lost Revenue:** ${formatCurrency(analysis.total_lost_revenue)}\n\n`;
  }

  // Grouped data based on group_by parameter
  if (groupBy === 'reason' && analysis.by_reason && analysis.by_reason.length > 0) {
    output += `### By Reason\n`;
    output += '| Reason | Count | % of Total | Lost Revenue | Avg Deal |\n';
    output += '|--------|-------|------------|--------------|----------|\n';
    for (const item of analysis.by_reason) {
      output += `| ${item.reason_name} | ${item.count.toLocaleString()} | ${formatPercent(item.percentage)} | ${formatCurrency(item.lost_revenue)} | ${formatCurrency(item.avg_deal)} |\n`;
    }
    output += '\n';
  }

  if (groupBy === 'salesperson' && analysis.by_salesperson && analysis.by_salesperson.length > 0) {
    output += `### By Salesperson\n`;
    output += '| Salesperson | Count | % of Total | Lost Revenue | Avg Deal |\n';
    output += '|-------------|-------|------------|--------------|----------|\n';
    for (const item of analysis.by_salesperson) {
      output += `| ${item.user_name} | ${item.count.toLocaleString()} | ${formatPercent(item.percentage)} | ${formatCurrency(item.lost_revenue)} | ${formatCurrency(item.avg_deal)} |\n`;
    }
    output += '\n';
  }

  if (groupBy === 'team' && analysis.by_team && analysis.by_team.length > 0) {
    output += `### By Team\n`;
    output += '| Team | Count | % of Total | Lost Revenue | Avg Deal |\n';
    output += '|------|-------|------------|--------------|----------|\n';
    for (const item of analysis.by_team) {
      output += `| ${item.team_name} | ${item.count.toLocaleString()} | ${formatPercent(item.percentage)} | ${formatCurrency(item.lost_revenue)} | ${formatCurrency(item.avg_deal)} |\n`;
    }
    output += '\n';
  }

  if (groupBy === 'stage' && analysis.by_stage && analysis.by_stage.length > 0) {
    output += `### By Stage (when lost)\n`;
    output += '| Stage | Count | % of Total | Lost Revenue | Avg Deal |\n';
    output += '|-------|-------|------------|--------------|----------|\n';
    for (const item of analysis.by_stage) {
      output += `| ${item.stage_name} | ${item.count.toLocaleString()} | ${formatPercent(item.percentage)} | ${formatCurrency(item.lost_revenue)} | ${formatCurrency(item.avg_deal)} |\n`;
    }
    output += '\n';
  }

  if (groupBy === 'month' && analysis.by_month && analysis.by_month.length > 0) {
    output += `### By Month\n`;
    output += '| Month | Count | Lost Revenue |\n';
    output += '|-------|-------|---------------|\n';
    for (const item of analysis.by_month) {
      output += `| ${item.month} | ${item.count.toLocaleString()} | ${formatCurrency(item.lost_revenue)} |\n`;
    }
    output += '\n';
  }

  // Top lost opportunities
  if (analysis.top_lost && analysis.top_lost.length > 0) {
    output += `### Top ${analysis.top_lost.length} Largest Lost Opportunities\n`;
    for (let i = 0; i < analysis.top_lost.length; i++) {
      const opp = analysis.top_lost[i];
      output += `${i + 1}. **${opp.name}** - ${formatCurrency(opp.revenue)} - ${opp.reason || 'No reason'} - ${opp.salesperson || 'Unassigned'}\n`;
    }
  }

  return output;
}

// Format lost opportunities list
export function formatLostOpportunitiesList(data: PaginatedResponse<LostOpportunity>, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(data, null, 2);
  }

  let output = `## Lost Opportunities (${data.count} of ${data.total})\n\n`;

  if (data.items.length === 0) {
    output += '_No lost opportunities found matching your criteria._\n';
  } else {
    for (let i = 0; i < data.items.length; i++) {
      const opp = data.items[i];
      output += `${data.offset + i + 1}. **${opp.name}** (ID: ${opp.id})\n`;
      output += `   - Contact: ${opp.contact_name || '-'} | ${opp.email_from || '-'}\n`;
      output += `   - Lost Reason: ${getRelationName(opp.lost_reason_id)}\n`;
      output += `   - Revenue: ${formatCurrency(opp.expected_revenue)} | Stage: ${getRelationName(opp.stage_id)}\n`;
      output += `   - Salesperson: ${getRelationName(opp.user_id)} | Lost: ${formatDate(opp.date_closed)}\n`;
      if (opp.description) {
        output += `   - Notes: ${truncateText(opp.description, 100)}\n`;
      }
      output += '\n';
    }
  }

  output += '---\n';
  output += `**Showing:** ${data.offset + 1}-${data.offset + data.count} of ${data.total}`;

  if (data.has_more) {
    output += ` | **Next page:** Use offset=${data.next_offset}`;
  }

  return output;
}

// Format lost trends
export function formatLostTrends(trends: LostTrendsSummary, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) {
    return JSON.stringify(trends, null, 2);
  }

  let output = `## Lost Opportunity Trends\n\n`;
  output += `**Period:** ${trends.period} | **Granularity:** ${trends.granularity}\n\n`;

  // Trends table
  const hasWonData = trends.periods.some(p => p.won_count !== undefined);

  if (hasWonData) {
    output += '| Period | Lost | Lost Revenue | Won | Won Revenue | Win Rate | Top Lost Reason |\n';
    output += '|--------|------|--------------|-----|-------------|----------|------------------|\n';
    for (const period of trends.periods) {
      output += `| ${period.period_label} | ${period.lost_count} | ${formatCurrency(period.lost_revenue)} | ${period.won_count || '-'} | ${formatCurrency(period.won_revenue)} | ${formatPercent(period.win_rate)} | ${period.top_lost_reason || '-'} |\n`;
    }
  } else {
    output += '| Period | Lost | Lost Revenue | Top Lost Reason |\n';
    output += '|--------|------|--------------|------------------|\n';
    for (const period of trends.periods) {
      output += `| ${period.period_label} | ${period.lost_count} | ${formatCurrency(period.lost_revenue)} | ${period.top_lost_reason || '-'} |\n`;
    }
  }

  output += '\n### Trend Insights\n';
  output += `- **Avg Lost per Period:** ${trends.avg_monthly_lost.toFixed(0)} opportunities (${formatCurrency(trends.avg_monthly_revenue)})\n`;

  if (trends.worst_period) {
    output += `- **Worst Period:** ${trends.worst_period.label} (${trends.worst_period.lost_count} lost`;
    if (trends.worst_period.win_rate !== undefined) {
      output += `, ${formatPercent(trends.worst_period.win_rate)} win rate`;
    }
    output += ')\n';
  }

  if (trends.best_period) {
    output += `- **Best Period:** ${trends.best_period.label} (${trends.best_period.lost_count} lost`;
    if (trends.best_period.win_rate !== undefined) {
      output += `, ${formatPercent(trends.best_period.win_rate)} win rate`;
    }
    output += ')\n';
  }

  if (trends.most_common_reason) {
    output += `- **Most Common Reason:** "${trends.most_common_reason}"\n`;
  }

  return output;
}
