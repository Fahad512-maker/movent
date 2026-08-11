import api from '@/lib/axios';
import type { SupportTicket, SupportTicketReply } from './adminSupportService';

export type { SupportTicket, SupportTicketReply };

export const userSupportService = {
  list: async (params?: Record<string, string>): Promise<SupportTicket[]> => {
    const res = await api.get('/user/support', { params });
    return res.data.data;
  },

  get: async (id: number): Promise<{ ticket: SupportTicket; replies: SupportTicketReply[] }> => {
    const res = await api.get(`/user/support/${id}`);
    return res.data.data;
  },

  reply: async (id: number, message: string, attachment?: File | null): Promise<SupportTicketReply> => {
    const form = new FormData();
    form.append('message', message);
    if (attachment) form.append('attachment', attachment);
    const res = await api.post(`/user/support/${id}/reply`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  assign: async (id: number, userId: number | null): Promise<SupportTicket> => {
    const res = await api.patch(`/user/support/${id}/assign`, { user_id: userId });
    return res.data.data;
  },

  updateStatus: async (id: number, status: string): Promise<SupportTicket> => {
    const res = await api.patch(`/user/support/${id}/status`, { status });
    return res.data.data;
  },
};
