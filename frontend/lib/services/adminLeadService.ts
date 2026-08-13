import api from '@/lib/axios';

export interface Lead {
  id: number;
  company_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  source: string | null;
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_value: number;
  notes: string | null;
  next_followup_date: string | null;
  next_followup_time: string | null;
  lost_reason: string | null;
  assigned_to: number | null;
  assigned_user: { id: number; name: string } | null;
  converted_at: string | null;
  client_id: number | null;
  created_at: string;
  updated_at: string;
  // Deal fields — a Won lead doubles as a lightweight "Deal"
  deal_reference?: string | null;
  proposed_project_title?: string | null;
  service_category?: string | null;
  scope_summary?: string | null;
  detailed_scope?: string | null;
  quotation_reference?: string | null;
  required_kickoff_amount?: number | null;
  required_kickoff_percentage?: number | null;
  expected_start_date?: string | null;
  expected_end_date?: string | null;
  fulfillment_status?: string | null;
  won_at?: string | null;
  // Detail view extras
  follow_ups?: FollowUp[];
  activities?: LeadActivity[];
}

export interface DealConfirmationFields {
  proposed_project_title: string;
  service_category?: string;
  scope_summary?: string;
  detailed_scope?: string;
  quotation_reference?: string;
  required_kickoff_amount?: number;
  required_kickoff_percentage?: number;
  expected_start_date?: string;
  expected_end_date?: string;
}

export interface DealEligibility {
  deal_reference: string | null;
  proposed_project_title: string | null;
  required_kickoff_amount: number;
  net_paid_amount: number;
  remaining_amount: number;
  fulfillment_status: string | null;
  project_creation_eligible: boolean;
  invoice_count: number;
  latest_invoice: {
    id: number;
    invoice_number: string;
    status: string;
    total_amount: number;
    paid_amount: number;
    due_date: string | null;
  } | null;
  has_project: boolean;
  project_id?: number | null;
  project_reference?: string | null;
}

export interface FollowUp {
  id: number;
  lead_id: number;
  lead_name?: string | null;
  lead_status?: string | null;
  type: 'call' | 'email' | 'meeting' | 'whatsapp' | 'demo' | 'other';
  scheduled_at: string;
  completed_at: string | null;
  notes: string | null;
  status: 'pending' | 'completed' | 'missed' | 'cancelled';
  reminder_enabled: boolean;
  assigned_to: number | null;
  assigned_user: { id: number; name: string } | null;
  created_at: string;
}

export interface LeadActivity {
  id: number;
  type: string;
  description: string;
  causer_name: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface LeadPayload {
  company_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  source?: string | null;
  status?: string;
  priority?: string;
  estimated_value?: number | null;
  notes?: string | null;
  next_followup_date?: string | null;
  next_followup_time?: string | null;
  assigned_to?: number | null;
}

export interface FollowUpPayload {
  type: string;
  scheduled_at: string;
  notes?: string | null;
  assigned_to?: number | null;
  reminder_enabled?: boolean;
}

export interface CompanyUser {
  id: number;
  name: string;
  email: string;
}

export interface SalesDashboard {
  summary: {
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    won: number;
    lost: number;
    converted: number;
    open_deals: number;
    pipeline_value: number;
    won_value: number;
    today_followups: number;
    overdue_followups: number;
  };
  monthly: { month: number; total: number; won: number; lost: number; value: number }[];
  by_stage: Record<string, { count: number; value: number }>;
  sellers: { id: number; name: string; total: number; won: number; lost: number; open: number; won_value: number }[];
  year: number;
}

export const adminLeadService = {
  list: async (params?: Record<string, string>): Promise<Lead[]> => {
    const res = await api.get('/admin/leads', { params });
    return res.data.data.leads;
  },

  getOne: async (id: number): Promise<Lead> => {
    const res = await api.get(`/admin/leads/${id}`);
    return res.data.data;
  },

  create: async (payload: LeadPayload): Promise<Lead> => {
    const res = await api.post('/admin/leads', payload);
    return res.data.data;
  },

  update: async (id: number, payload: Partial<LeadPayload>): Promise<Lead> => {
    const res = await api.put(`/admin/leads/${id}`, payload);
    return res.data.data;
  },

  updateStatus: async (id: number, status: string, lostReason?: string, dealFields?: DealConfirmationFields): Promise<Lead> => {
    const res = await api.patch(`/admin/leads/${id}/status`, { status, lost_reason: lostReason, ...dealFields });
    return res.data.data;
  },

  projectEligibility: async (id: number): Promise<DealEligibility> => {
    const res = await api.get(`/admin/leads/${id}/project-eligibility`);
    return res.data.data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/admin/leads/${id}`);
  },

  convert: async (id: number): Promise<{ client_id: number }> => {
    const res = await api.post(`/admin/leads/${id}/convert`);
    return res.data.data;
  },

  pipeline: async (): Promise<Lead[]> => {
    const res = await api.get('/admin/leads/pipeline');
    return res.data.data.leads;
  },

  transfer: async (id: number, toUserId: number, reason?: string): Promise<Lead> => {
    const res = await api.post(`/admin/leads/${id}/transfer`, { to_user_id: toUserId, reason: reason || null });
    return res.data.data;
  },

  companyUsers: async (companyId: number): Promise<CompanyUser[]> => {
    const res = await api.get('/admin/leads/company-users', { params: { company_id: companyId } });
    return res.data.data;
  },

  // Follow-ups
  getFollowUps: async (leadId: number): Promise<FollowUp[]> => {
    const res = await api.get(`/admin/leads/${leadId}/follow-ups`);
    return res.data.data.follow_ups;
  },

  addFollowUp: async (leadId: number, payload: FollowUpPayload): Promise<FollowUp> => {
    const res = await api.post(`/admin/leads/${leadId}/follow-ups`, payload);
    return res.data.data;
  },

  updateFollowUp: async (id: number, payload: Partial<FollowUpPayload>): Promise<FollowUp> => {
    const res = await api.put(`/admin/follow-ups/${id}`, payload);
    return res.data.data;
  },

  completeFollowUp: async (id: number): Promise<FollowUp> => {
    const res = await api.patch(`/admin/follow-ups/${id}/complete`);
    return res.data.data;
  },

  missFollowUp: async (id: number): Promise<FollowUp> => {
    const res = await api.patch(`/admin/follow-ups/${id}/miss`);
    return res.data.data;
  },

  cancelFollowUp: async (id: number): Promise<FollowUp> => {
    const res = await api.patch(`/admin/follow-ups/${id}/cancel`);
    return res.data.data;
  },

  deleteFollowUp: async (id: number): Promise<void> => {
    await api.delete(`/admin/follow-ups/${id}`);
  },

  followUpQueue: async (filter: 'today' | 'upcoming' | 'overdue' | 'all' = 'today'): Promise<{
    follow_ups: FollowUp[];
    counts: { today: number; overdue: number; upcoming: number };
  }> => {
    const res = await api.get('/admin/follow-ups', { params: { filter } });
    return res.data.data;
  },

  // Sales dashboard
  salesDashboard: async (year?: number): Promise<SalesDashboard> => {
    const res = await api.get('/admin/sales/dashboard', { params: year ? { year } : {} });
    return res.data.data;
  },
};

// ── Sub-user (seller) lead service — calls /user/* endpoints ─────────────────
export const userLeadService = {
  list: async (params?: Record<string, string>): Promise<Lead[]> => {
    const res = await api.get('/user/leads', { params });
    return res.data.data.leads;
  },

  getOne: async (id: number): Promise<Lead> => {
    const res = await api.get(`/user/leads/${id}`);
    return res.data.data;
  },

  create: async (payload: Omit<LeadPayload, 'company_id'> & { company_id?: number }): Promise<Lead> => {
    const res = await api.post('/user/leads', payload);
    return res.data.data;
  },

  update: async (id: number, payload: Partial<LeadPayload>): Promise<Lead> => {
    const res = await api.put(`/user/leads/${id}`, payload);
    return res.data.data;
  },

  updateStatus: async (id: number, status: string, lostReason?: string, dealFields?: DealConfirmationFields): Promise<Lead> => {
    const res = await api.patch(`/user/leads/${id}/status`, { status, lost_reason: lostReason, ...dealFields });
    return res.data.data;
  },

  projectEligibility: async (id: number): Promise<DealEligibility> => {
    const res = await api.get(`/user/leads/${id}/project-eligibility`);
    return res.data.data;
  },

  addFollowUp: async (leadId: number, payload: FollowUpPayload): Promise<FollowUp> => {
    const res = await api.post(`/user/leads/${leadId}/follow-ups`, payload);
    return res.data.data;
  },

  pipeline: async (): Promise<Lead[]> => {
    const res = await api.get('/user/leads/pipeline');
    return res.data.data.leads;
  },

  transfer: async (id: number, toUserId: number, reason?: string): Promise<Lead> => {
    const res = await api.post(`/user/leads/${id}/transfer`, { to_user_id: toUserId, reason: reason || null });
    return res.data.data;
  },

  convert: async (id: number): Promise<{ client_id: number }> => {
    const res = await api.post(`/user/leads/${id}/convert`);
    return res.data.data;
  },

  companyUsers: async (): Promise<CompanyUser[]> => {
    const res = await api.get('/user/leads/company-users');
    return res.data.data;
  },

  salesDashboard: async (year?: number): Promise<SalesDashboard> => {
    const res = await api.get('/user/sales/dashboard', { params: year ? { year } : {} });
    return res.data.data;
  },

  followUpQueue: async (filter: 'today' | 'upcoming' | 'overdue' | 'all' = 'today'): Promise<{
    follow_ups: FollowUp[];
    counts: { today: number; overdue: number; upcoming: number };
  }> => {
    const res = await api.get('/user/follow-ups', { params: { filter } });
    return res.data.data;
  },

  completeFollowUp: async (id: number): Promise<FollowUp> => {
    const res = await api.patch(`/user/follow-ups/${id}/complete`);
    return res.data.data;
  },

  missFollowUp: async (id: number): Promise<FollowUp> => {
    const res = await api.patch(`/user/follow-ups/${id}/miss`);
    return res.data.data;
  },

  cancelFollowUp: async (id: number): Promise<FollowUp> => {
    const res = await api.patch(`/user/follow-ups/${id}/cancel`);
    return res.data.data;
  },
};
