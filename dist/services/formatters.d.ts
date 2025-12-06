import { ResponseFormat } from '../constants.js';
import type { CrmLead, PaginatedResponse, PipelineSummary, SalesAnalytics, ActivitySummary, ResPartner, LostReasonWithCount, LostAnalysisSummary, LostOpportunity, LostTrendsSummary } from '../types.js';
export declare function formatCurrency(value: number | undefined | null): string;
export declare function formatPercent(value: number | undefined | null): string;
export declare function formatDate(dateStr: string | undefined | null): string;
export declare function getRelationName(field: [number, string] | undefined | null): string;
export declare function truncateText(text: string, maxLength?: number): string;
export declare function formatLeadListItem(lead: CrmLead): string;
export declare function formatLeadDetail(lead: CrmLead): string;
export declare function formatLeadList(data: PaginatedResponse<CrmLead>, format: ResponseFormat): string;
export declare function formatPipelineSummary(stages: PipelineSummary[], format: ResponseFormat): string;
export declare function formatSalesAnalytics(analytics: SalesAnalytics, format: ResponseFormat): string;
export declare function formatActivitySummary(summary: ActivitySummary, format: ResponseFormat): string;
export declare function formatContactList(data: PaginatedResponse<ResPartner>, format: ResponseFormat): string;
export declare function checkContextLimit(response: string): {
    ok: boolean;
    note?: string;
};
export declare function formatLostReasonsList(reasons: LostReasonWithCount[], format: ResponseFormat): string;
export declare function formatLostAnalysis(analysis: LostAnalysisSummary, groupBy: string, format: ResponseFormat): string;
export declare function formatLostOpportunitiesList(data: PaginatedResponse<LostOpportunity>, format: ResponseFormat): string;
export declare function formatLostTrends(trends: LostTrendsSummary, format: ResponseFormat): string;
//# sourceMappingURL=formatters.d.ts.map