// Odoo connection configuration
export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  password: string;
}

// Generic Odoo record
export interface OdooRecord {
  id: number;
  [key: string]: unknown;
}

// CRM Lead/Opportunity
export interface CrmLead extends OdooRecord {
  id: number;
  name: string;
  contact_name?: string;
  email_from?: string;
  phone?: string;
  mobile?: string;
  expected_revenue?: number;
  probability?: number;
  stage_id?: [number, string]; // [id, name]
  user_id?: [number, string];
  team_id?: [number, string];
  create_date?: string;
  write_date?: string;
  date_deadline?: string;
  date_closed?: string;
  description?: string;
  partner_id?: [number, string];
  company_id?: [number, string];
  priority?: string;
  type?: 'lead' | 'opportunity';
  active?: boolean;
  lost_reason_id?: [number, string];
  source_id?: [number, string];
  medium_id?: [number, string];
  campaign_id?: [number, string];
  tag_ids?: number[];
  city?: string;
  country_id?: [number, string];
  street?: string;
}

// CRM Stage
export interface CrmStage extends OdooRecord {
  id: number;
  name: string;
  sequence: number;
  is_won?: boolean;
  fold?: boolean;
}

// Contact/Partner
export interface ResPartner extends OdooRecord {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
  city?: string;
  country_id?: [number, string];
  company_id?: [number, string];
  is_company?: boolean;
}

// Activity
export interface MailActivity extends OdooRecord {
  id: number;
  summary?: string;
  activity_type_id?: [number, string];
  date_deadline?: string;
  user_id?: [number, string];
  res_id?: number;
  state?: string;
}

// Pagination response wrapper
export interface PaginatedResponse<T> {
  [key: string]: unknown;
  total: number;
  count: number;
  offset: number;
  limit: number;
  items: T[];
  has_more: boolean;
  next_offset?: number;
  context_note?: string; // Helpful note about context management
}

// Pipeline summary statistics
export interface PipelineSummary {
  [key: string]: unknown;
  stage_name: string;
  stage_id: number;
  count: number;
  total_revenue: number;
  avg_probability: number;
  opportunities: Array<{
    id: number;
    name: string;
    expected_revenue: number;
    probability: number;
  }>;
}

// Sales analytics
export interface SalesAnalytics {
  [key: string]: unknown;
  period: string;
  total_leads: number;
  total_opportunities: number;
  total_won: number;
  total_lost: number;
  total_revenue_expected: number;
  total_revenue_won: number;
  conversion_rate: number;
  avg_deal_size: number;
  by_stage: Array<{
    stage: string;
    count: number;
    revenue: number;
  }>;
  by_salesperson?: Array<{
    name: string;
    count: number;
    revenue: number;
    won: number;
  }>;
  top_opportunities: Array<{
    name: string;
    revenue: number;
    probability: number;
    stage: string;
  }>;
}

// Activity summary
export interface ActivitySummary {
  [key: string]: unknown;
  total_activities: number;
  overdue: number;
  today: number;
  upcoming: number;
  by_type: Array<{
    type: string;
    count: number;
    overdue: number;
  }>;
  by_user: Array<{
    user: string;
    total: number;
    overdue: number;
  }>;
}

// Lost Reason
export interface CrmLostReason extends OdooRecord {
  id: number;
  name: string;
  active?: boolean;
}

// Lost Reason with count
export interface LostReasonWithCount extends CrmLostReason {
  opportunity_count: number;
}

// Lost Analysis Summary
export interface LostAnalysisSummary {
  [key: string]: unknown;
  period: string;
  total_lost: number;
  total_lost_revenue: number;
  avg_deal_size: number;
  // Win/loss context
  total_won?: number;
  total_won_revenue?: number;
  win_rate?: number;
  // Grouped data
  by_reason?: Array<{
    reason_id: number;
    reason_name: string;
    count: number;
    percentage: number;
    lost_revenue: number;
    avg_deal: number;
  }>;
  by_salesperson?: Array<{
    user_id: number;
    user_name: string;
    count: number;
    percentage: number;
    lost_revenue: number;
    avg_deal: number;
  }>;
  by_team?: Array<{
    team_id: number;
    team_name: string;
    count: number;
    percentage: number;
    lost_revenue: number;
    avg_deal: number;
  }>;
  by_stage?: Array<{
    stage_id: number;
    stage_name: string;
    count: number;
    percentage: number;
    lost_revenue: number;
    avg_deal: number;
  }>;
  by_month?: Array<{
    month: string;
    count: number;
    lost_revenue: number;
  }>;
  // Top lost opportunities
  top_lost?: Array<{
    id: number;
    name: string;
    revenue: number;
    reason: string;
    salesperson: string;
    date_closed: string;
  }>;
}

// Lost Opportunity (extended from CrmLead)
export interface LostOpportunity extends CrmLead {
  lost_reason_id?: [number, string];
  lost_feedback?: string;
}

// Lost Trends Summary
export interface LostTrendsSummary {
  [key: string]: unknown;
  period: string;
  granularity: string;
  periods: Array<{
    period_label: string;
    lost_count: number;
    lost_revenue: number;
    won_count?: number;
    won_revenue?: number;
    win_rate?: number;
    top_lost_reason?: string;
  }>;
  // Insights
  avg_monthly_lost: number;
  avg_monthly_revenue: number;
  worst_period?: {
    label: string;
    lost_count: number;
    win_rate?: number;
  };
  best_period?: {
    label: string;
    lost_count: number;
    win_rate?: number;
  };
  most_common_reason?: string;
}
