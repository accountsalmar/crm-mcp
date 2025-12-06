import { z } from 'zod';
import { ResponseFormat } from '../constants.js';
export declare const PaginationSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    offset: number;
    limit: number;
    response_format: ResponseFormat;
}, {
    offset?: number | undefined;
    limit?: number | undefined;
    response_format?: ResponseFormat | undefined;
}>;
export declare const LeadSearchSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
} & {
    query: z.ZodOptional<z.ZodString>;
    stage_id: z.ZodOptional<z.ZodNumber>;
    stage_name: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodNumber>;
    type: z.ZodOptional<z.ZodEnum<["lead", "opportunity"]>>;
    min_revenue: z.ZodOptional<z.ZodNumber>;
    max_revenue: z.ZodOptional<z.ZodNumber>;
    min_probability: z.ZodOptional<z.ZodNumber>;
    active_only: z.ZodDefault<z.ZodBoolean>;
    date_from: z.ZodOptional<z.ZodString>;
    date_to: z.ZodOptional<z.ZodString>;
    order_by: z.ZodDefault<z.ZodEnum<["create_date", "expected_revenue", "probability", "name"]>>;
    order_dir: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strict", z.ZodTypeAny, {
    offset: number;
    limit: number;
    response_format: ResponseFormat;
    active_only: boolean;
    order_by: "name" | "expected_revenue" | "probability" | "create_date";
    order_dir: "asc" | "desc";
    stage_id?: number | undefined;
    user_id?: number | undefined;
    type?: "lead" | "opportunity" | undefined;
    stage_name?: string | undefined;
    query?: string | undefined;
    min_revenue?: number | undefined;
    max_revenue?: number | undefined;
    min_probability?: number | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
}, {
    stage_id?: number | undefined;
    user_id?: number | undefined;
    type?: "lead" | "opportunity" | undefined;
    offset?: number | undefined;
    limit?: number | undefined;
    stage_name?: string | undefined;
    response_format?: ResponseFormat | undefined;
    query?: string | undefined;
    min_revenue?: number | undefined;
    max_revenue?: number | undefined;
    min_probability?: number | undefined;
    active_only?: boolean | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    order_by?: "name" | "expected_revenue" | "probability" | "create_date" | undefined;
    order_dir?: "asc" | "desc" | undefined;
}>;
export declare const LeadDetailSchema: z.ZodObject<{
    lead_id: z.ZodNumber;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    response_format: ResponseFormat;
    lead_id: number;
}, {
    lead_id: number;
    response_format?: ResponseFormat | undefined;
}>;
export declare const PipelineSummarySchema: z.ZodObject<{
    team_id: z.ZodOptional<z.ZodNumber>;
    user_id: z.ZodOptional<z.ZodNumber>;
    include_lost: z.ZodDefault<z.ZodBoolean>;
    max_opps_per_stage: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    response_format: ResponseFormat;
    include_lost: boolean;
    max_opps_per_stage: number;
    user_id?: number | undefined;
    team_id?: number | undefined;
}, {
    user_id?: number | undefined;
    team_id?: number | undefined;
    response_format?: ResponseFormat | undefined;
    include_lost?: boolean | undefined;
    max_opps_per_stage?: number | undefined;
}>;
export declare const SalesAnalyticsSchema: z.ZodObject<{
    date_from: z.ZodOptional<z.ZodString>;
    date_to: z.ZodOptional<z.ZodString>;
    team_id: z.ZodOptional<z.ZodNumber>;
    include_by_salesperson: z.ZodDefault<z.ZodBoolean>;
    top_opportunities_count: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    response_format: ResponseFormat;
    include_by_salesperson: boolean;
    top_opportunities_count: number;
    team_id?: number | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
}, {
    team_id?: number | undefined;
    response_format?: ResponseFormat | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    include_by_salesperson?: boolean | undefined;
    top_opportunities_count?: number | undefined;
}>;
export declare const ContactSearchSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
} & {
    query: z.ZodOptional<z.ZodString>;
    is_company: z.ZodOptional<z.ZodBoolean>;
    has_opportunities: z.ZodOptional<z.ZodBoolean>;
    country: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    offset: number;
    limit: number;
    response_format: ResponseFormat;
    city?: string | undefined;
    is_company?: boolean | undefined;
    query?: string | undefined;
    has_opportunities?: boolean | undefined;
    country?: string | undefined;
}, {
    city?: string | undefined;
    is_company?: boolean | undefined;
    offset?: number | undefined;
    limit?: number | undefined;
    response_format?: ResponseFormat | undefined;
    query?: string | undefined;
    has_opportunities?: boolean | undefined;
    country?: string | undefined;
}>;
export declare const ActivitySummarySchema: z.ZodObject<{
    user_id: z.ZodOptional<z.ZodNumber>;
    days_ahead: z.ZodDefault<z.ZodNumber>;
    include_completed: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    response_format: ResponseFormat;
    days_ahead: number;
    include_completed: boolean;
    user_id?: number | undefined;
}, {
    user_id?: number | undefined;
    response_format?: ResponseFormat | undefined;
    days_ahead?: number | undefined;
    include_completed?: boolean | undefined;
}>;
export declare const StageListSchema: z.ZodObject<{
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    response_format: ResponseFormat;
}, {
    response_format?: ResponseFormat | undefined;
}>;
export declare const LostReasonsListSchema: z.ZodObject<{
    include_inactive: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    response_format: ResponseFormat;
    include_inactive: boolean;
}, {
    response_format?: ResponseFormat | undefined;
    include_inactive?: boolean | undefined;
}>;
export declare const LostAnalysisSchema: z.ZodObject<{
    date_from: z.ZodOptional<z.ZodString>;
    date_to: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodNumber>;
    team_id: z.ZodOptional<z.ZodNumber>;
    lost_reason_id: z.ZodOptional<z.ZodNumber>;
    stage_id: z.ZodOptional<z.ZodNumber>;
    min_revenue: z.ZodOptional<z.ZodNumber>;
    group_by: z.ZodDefault<z.ZodEnum<["reason", "salesperson", "team", "stage", "month"]>>;
    include_top_lost: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    response_format: ResponseFormat;
    group_by: "month" | "reason" | "salesperson" | "team" | "stage";
    include_top_lost: number;
    stage_id?: number | undefined;
    user_id?: number | undefined;
    team_id?: number | undefined;
    lost_reason_id?: number | undefined;
    min_revenue?: number | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
}, {
    stage_id?: number | undefined;
    user_id?: number | undefined;
    team_id?: number | undefined;
    lost_reason_id?: number | undefined;
    response_format?: ResponseFormat | undefined;
    min_revenue?: number | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    group_by?: "month" | "reason" | "salesperson" | "team" | "stage" | undefined;
    include_top_lost?: number | undefined;
}>;
export declare const LostOpportunitiesSearchSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
} & {
    query: z.ZodOptional<z.ZodString>;
    lost_reason_id: z.ZodOptional<z.ZodNumber>;
    lost_reason_name: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodNumber>;
    team_id: z.ZodOptional<z.ZodNumber>;
    stage_id: z.ZodOptional<z.ZodNumber>;
    date_from: z.ZodOptional<z.ZodString>;
    date_to: z.ZodOptional<z.ZodString>;
    min_revenue: z.ZodOptional<z.ZodNumber>;
    max_revenue: z.ZodOptional<z.ZodNumber>;
    order_by: z.ZodDefault<z.ZodEnum<["date_closed", "expected_revenue", "name", "create_date"]>>;
    order_dir: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strict", z.ZodTypeAny, {
    offset: number;
    limit: number;
    response_format: ResponseFormat;
    order_by: "name" | "expected_revenue" | "create_date" | "date_closed";
    order_dir: "asc" | "desc";
    stage_id?: number | undefined;
    user_id?: number | undefined;
    team_id?: number | undefined;
    lost_reason_id?: number | undefined;
    query?: string | undefined;
    min_revenue?: number | undefined;
    max_revenue?: number | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    lost_reason_name?: string | undefined;
}, {
    stage_id?: number | undefined;
    user_id?: number | undefined;
    team_id?: number | undefined;
    lost_reason_id?: number | undefined;
    offset?: number | undefined;
    limit?: number | undefined;
    response_format?: ResponseFormat | undefined;
    query?: string | undefined;
    min_revenue?: number | undefined;
    max_revenue?: number | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    order_by?: "name" | "expected_revenue" | "create_date" | "date_closed" | undefined;
    order_dir?: "asc" | "desc" | undefined;
    lost_reason_name?: string | undefined;
}>;
export declare const LostTrendsSchema: z.ZodObject<{
    date_from: z.ZodOptional<z.ZodString>;
    date_to: z.ZodOptional<z.ZodString>;
    granularity: z.ZodDefault<z.ZodEnum<["week", "month", "quarter"]>>;
    user_id: z.ZodOptional<z.ZodNumber>;
    team_id: z.ZodOptional<z.ZodNumber>;
    compare_to_won: z.ZodDefault<z.ZodBoolean>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    granularity: "month" | "week" | "quarter";
    response_format: ResponseFormat;
    compare_to_won: boolean;
    user_id?: number | undefined;
    team_id?: number | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
}, {
    user_id?: number | undefined;
    team_id?: number | undefined;
    granularity?: "month" | "week" | "quarter" | undefined;
    response_format?: ResponseFormat | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    compare_to_won?: boolean | undefined;
}>;
export type LeadSearchInput = z.infer<typeof LeadSearchSchema>;
export type LeadDetailInput = z.infer<typeof LeadDetailSchema>;
export type PipelineSummaryInput = z.infer<typeof PipelineSummarySchema>;
export type SalesAnalyticsInput = z.infer<typeof SalesAnalyticsSchema>;
export type ContactSearchInput = z.infer<typeof ContactSearchSchema>;
export type ActivitySummaryInput = z.infer<typeof ActivitySummarySchema>;
export type StageListInput = z.infer<typeof StageListSchema>;
export type LostReasonsListInput = z.infer<typeof LostReasonsListSchema>;
export type LostAnalysisInput = z.infer<typeof LostAnalysisSchema>;
export type LostOpportunitiesSearchInput = z.infer<typeof LostOpportunitiesSearchSchema>;
export type LostTrendsInput = z.infer<typeof LostTrendsSchema>;
//# sourceMappingURL=index.d.ts.map