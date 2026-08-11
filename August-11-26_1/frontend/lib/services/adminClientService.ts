import api from '@/lib/axios';
import { Client } from '@/types';

export interface ClientPayload {
  company_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  address?: string | null;
  notes?: string | null;
  status?: 'active' | 'inactive' | 'blocked';
}

export interface ClientCompany { id: number; name: string; currency: string; }

export const adminClientService = {
  companies: async (): Promise<ClientCompany[]> => {
    const res = await api.get('/admin/companies');
    return res.data.data;
  },

  list: async (params?: Record<string, string>): Promise<{ clients: Client[]; seat: unknown }> => {
    const res = await api.get('/admin/clients', { params });
    return res.data.data;
  },

  getOne: async (id: number): Promise<{
    client: Client;
    permissions: Record<string, { label: string; is_enabled: boolean }>;
    seat: unknown;
  }> => {
    const res = await api.get(`/admin/clients/${id}`);
    return res.data.data;
  },

  create: async (payload: ClientPayload): Promise<Client> => {
    const res = await api.post('/admin/clients', payload);
    return res.data.data;
  },

  update: async (id: number, payload: Partial<ClientPayload>): Promise<Client> => {
    const res = await api.put(`/admin/clients/${id}`, payload);
    return res.data.data;
  },

  enablePortal: async (id: number, email: string, password: string): Promise<void> => {
    await api.post(`/admin/clients/${id}/enable-portal`, { portal_email: email, portal_password: password });
  },

  disablePortal: async (id: number): Promise<void> => {
    await api.post(`/admin/clients/${id}/disable-portal`);
  },

  updatePermissions: async (id: number, permissions: Record<string, boolean>): Promise<void> => {
    await api.put(`/admin/clients/${id}/permissions`, { permissions });
  },
};
