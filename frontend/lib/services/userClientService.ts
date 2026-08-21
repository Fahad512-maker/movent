import api from '@/lib/axios';
import { Client } from '@/types';

// Sub-user side of Client management — basic record management plus portal
// access (gated by canEnableClientPortal/canDisableClientPortal). Document/
// support features remain Company-Admin-only.
export interface UserClientPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  address?: string | null;
  country?: string | null;
  notes?: string | null;
  status?: 'active' | 'inactive' | 'blocked';
}

export const userClientService = {
  list: async (): Promise<Client[]> => {
    const res = await api.get('/user/clients');
    return res.data.data;
  },

  getOne: async (id: number): Promise<Client> => {
    const res = await api.get(`/user/clients/${id}`);
    return res.data.data;
  },

  create: async (payload: UserClientPayload): Promise<Client> => {
    const res = await api.post('/user/clients', payload);
    return res.data.data;
  },

  update: async (id: number, payload: Partial<UserClientPayload>): Promise<Client> => {
    const res = await api.put(`/user/clients/${id}`, payload);
    return res.data.data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/user/clients/${id}`);
  },

  enablePortal: async (id: number, email: string, password: string): Promise<void> => {
    await api.post(`/user/clients/${id}/enable-portal`, { portal_email: email, portal_password: password });
  },

  disablePortal: async (id: number): Promise<void> => {
    await api.post(`/user/clients/${id}/disable-portal`);
  },

  updatePermissions: async (id: number, permissions: Record<string, boolean>): Promise<void> => {
    await api.put(`/user/clients/${id}/permissions`, { permissions });
  },
};
