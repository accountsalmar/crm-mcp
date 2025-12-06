import { z } from 'zod';
import { CONTEXT_LIMITS, ResponseFormat } from '../constants.js';

// Common pagination schema
export const PaginationSchema = z.object({
  limit: z.number()
    .int()
    .min(1)
    .max(CONTEXT_LIMITS.MAX_PAGE_SIZE)
    .default(CONTEXT_LIMITS.DEFAULT_PAGE_SIZE)
    .describe(`Number of records to return (1-${CONTEXT_LIMITS.MAX_PAGE_SIZE}, default: ${CONTEXT_LIMITS.DEFAULT_PAGE_SIZE})`),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of records to skip for pagination'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

// Lead/Opportunity search schema
export const LeadSearchSchema = PaginationSchema.extend({
  query: z.string()
    .max(200)
    .optional()
    .describe('Search text to match against lead name, contact, or email'),
  stage_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by specific stage ID'),
  stage_name: z.string()
    .optional()
    .describe('Filter by stage name (partial match)'),
  user_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by salesperson user ID'),
  type: z.enum(['lead', 'opportunity'])
    .optional()
    .describe("Filter by type: 'lead' or 'opportunity'"),
  min_revenue: z.number()
    .min(0)
    .optional()
    .describe('Minimum expected revenue'),
  max_revenue: z.number()
    .min(0)
    .optional()
    .describe('Maximum expected revenue'),
  min_probability: z.number()
    .min(0)
    .max(100)
    .optional()
    .describe('Minimum probability (0-100)'),
  active_only: z.boolean()
    .default(true)
    .describe('Include only active records (default: true)'),
  date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Filter leads created on or after this date (YYYY-MM-DD)'),
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Filter leads created on or before this date (YYYY-MM-DD)'),
  order_by: z.enum(['create_date', 'expected_revenue', 'probability', 'name'])
    .default('create_date')
    .describe('Field to sort by'),
  order_dir: z.enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort direction')
}).strict();

// Single lead detail schema
export const LeadDetailSchema = z.object({
  lead_id: z.number()
    .int()
    .positive()
    .describe('The ID of the lead/opportunity to retrieve'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Pipeline summary schema
export const PipelineSummarySchema = z.object({
  team_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by sales team ID'),
  user_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by salesperson user ID'),
  include_lost: z.boolean()
    .default(false)
    .describe('Include lost opportunities in summary'),
  max_opps_per_stage: z.number()
    .int()
    .min(0)
    .max(10)
    .default(3)
    .describe('Max opportunities to list per stage (0-10, set 0 for counts only)'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Sales analytics schema
export const SalesAnalyticsSchema = z.object({
  date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Start date for analysis period (YYYY-MM-DD)'),
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('End date for analysis period (YYYY-MM-DD)'),
  team_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by sales team ID'),
  include_by_salesperson: z.boolean()
    .default(true)
    .describe('Include breakdown by salesperson'),
  top_opportunities_count: z.number()
    .int()
    .min(0)
    .max(10)
    .default(5)
    .describe('Number of top opportunities to include (0-10)'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Contact search schema
export const ContactSearchSchema = PaginationSchema.extend({
  query: z.string()
    .max(200)
    .optional()
    .describe('Search text to match against name, email, or phone'),
  is_company: z.boolean()
    .optional()
    .describe('Filter: true for companies only, false for individuals only'),
  has_opportunities: z.boolean()
    .optional()
    .describe('Filter contacts that have associated opportunities'),
  country: z.string()
    .optional()
    .describe('Filter by country name (partial match)'),
  city: z.string()
    .optional()
    .describe('Filter by city name (partial match)')
}).strict();

// Activity summary schema
export const ActivitySummarySchema = z.object({
  user_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter activities by assigned user ID'),
  days_ahead: z.number()
    .int()
    .min(1)
    .max(90)
    .default(7)
    .describe('Number of days ahead to include for upcoming activities'),
  include_completed: z.boolean()
    .default(false)
    .describe('Include completed activities in summary'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Stage list schema
export const StageListSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Lost reasons list schema
export const LostReasonsListSchema = z.object({
  include_inactive: z.boolean()
    .default(false)
    .describe('Include inactive/archived reasons'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Lost analysis schema
export const LostAnalysisSchema = z.object({
  date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Start date filter (YYYY-MM-DD)'),
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('End date filter (YYYY-MM-DD)'),
  user_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by salesperson user ID'),
  team_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by sales team ID'),
  lost_reason_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by specific lost reason ID'),
  stage_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by stage when lost'),
  min_revenue: z.number()
    .min(0)
    .optional()
    .describe('Minimum revenue threshold'),
  group_by: z.enum(['reason', 'salesperson', 'team', 'stage', 'month'])
    .default('reason')
    .describe("Group results by: 'reason', 'salesperson', 'team', 'stage', or 'month'"),
  include_top_lost: z.number()
    .int()
    .min(0)
    .max(20)
    .default(5)
    .describe('Number of top lost opportunities to include (0-20)'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Lost opportunities search schema
export const LostOpportunitiesSearchSchema = PaginationSchema.extend({
  query: z.string()
    .max(200)
    .optional()
    .describe('Search text to match against opportunity name, contact, or email'),
  lost_reason_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by lost reason ID'),
  lost_reason_name: z.string()
    .optional()
    .describe('Filter by lost reason name (partial match)'),
  user_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by salesperson user ID'),
  team_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by sales team ID'),
  stage_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by stage when lost'),
  date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Lost after this date (YYYY-MM-DD)'),
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Lost before this date (YYYY-MM-DD)'),
  min_revenue: z.number()
    .min(0)
    .optional()
    .describe('Minimum expected revenue'),
  max_revenue: z.number()
    .min(0)
    .optional()
    .describe('Maximum expected revenue'),
  order_by: z.enum(['date_closed', 'expected_revenue', 'name', 'create_date'])
    .default('date_closed')
    .describe('Field to sort by'),
  order_dir: z.enum(['asc', 'desc'])
    .default('desc')
    .describe('Sort direction')
}).strict();

// Lost trends schema
export const LostTrendsSchema = z.object({
  date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Start date (YYYY-MM-DD)'),
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('End date (YYYY-MM-DD)'),
  granularity: z.enum(['week', 'month', 'quarter'])
    .default('month')
    .describe("Time period granularity: 'week', 'month', or 'quarter'"),
  user_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by salesperson user ID'),
  team_id: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by sales team ID'),
  compare_to_won: z.boolean()
    .default(true)
    .describe('Include won comparison for win/loss ratio'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

// Export inferred types
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
