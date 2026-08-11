import api from '@/lib/axios';

export interface SupportTicket {
  id: number;
  company_id: number;
  raised_by: number | null;
  assigned_to: number | null;
  subject: string;
  category: 'billing' | 'technical' | 'project' | 'general';
  description?: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
  created_at: string;
  resolved_at: string | null;
  raisedBy?: { id: number; name: string } | null;
  assignedTo?: { id: number; name: string } | null;
}

export interface SupportTicketReply {
  id: number;
  ticket_id: number;
  replied_by: number | null;
  replied_by_admin_id: number | null;
  message: string;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
  created_at: string;
  repliedBy?: { id: number; name: string; role_type?: string } | null;
  repliedByAdmin?: { id: number; name: string } | null;
}

export const adminSupportService = {
  list: async (params?: Record<string, string>): Promise<SupportTicket[]> => {
    const res = await api.get('/admin/support', { params });
    return res.data.data;
  },

  get: async (id: number): Promise<{ ticket: SupportTicket; replies: SupportTicketReply[] }> => {
    const res = await api.get(`/admin/support/${id}`);
    return res.data.data;
  },

  reply: async (id: number, message: string, attachment?: File | null): Promise<SupportTicketReply> => {
    const form = new FormData();
    form.append('message', message);
    if (attachment) form.append('attachment', attachment);
    const res = await api.post(`/admin/support/${id}/reply`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  assign: async (id: number, userId: number | null): Promise<SupportTicket> => {
    const res = await api.patch(`/admin/support/${id}/assign`, { user_id: userId });
    return res.data.data;
  },

  updateStatus: async (id: number, status: string): Promise<SupportTicket> => {
    const res = await api.patch(`/admin/support/${id}/status`, { status });
    return res.data.data;
  },
};
