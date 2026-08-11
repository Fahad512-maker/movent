import api from '@/lib/axios';
import { AdminFull } from '@/types';

export interface CreateAdminPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  package_id?: number | null;
  subscription_status: 'trial' | 'active' | 'suspended';
  trial_ends_at?: string;
  subscription_ends_at?: string;
}

export interface UpdateAdminPayload extends Omit<CreateAdminPayload, 'password'> {
  password?: string;
}

export const adminService = {
  getAll: async (): Promise<AdminFull[]> => {
    const res = await api.get('/super-admin/admins');
    return res.data.data;
  },

  create: async (data: CreateAdminPayload): Promise<AdminFull> => {
    const res = await api.post('/super-admin/admins', data);
    return res.data.data;
  },

  getOne: async (id: number): Promise<AdminFull> => {
    const res = await api.get(`/super-admin/admins/${id}`);
    return res.data.data;
  },

  update: async (id: number, data: UpdateAdminPayload): Promise<AdminFull> => {
    const res = await api.put(`/super-admin/admins/${id}`, data);
    return res.data.data;
  },

  toggleStatus: async (id: number): Promise<{ is_active: boolean }> => {
    const res = await api.patch(`/super-admin/admins/${id}/toggle`);
    return res.data.data;
  },
};
