import api from '@/lib/axios';
import { Package } from '@/types';

export interface PackagePayload {
  name: string;
  tier: Package['tier'];
  price: number;
  price_usd?: number | null;
  billing_cycle: Package['billing_cycle'];
  trial_days?: number | null;
  max_companies?: number | null;
  max_users_per_company?: number | null;
  description?: string | null;
  is_visible?: boolean;
  is_popular?: boolean;
  modules?: string[];
}

export const packageService = {
  getAll: async (): Promise<Package[]> => {
    const res = await api.get('/super-admin/packages');
    return res.data.data;
  },

  getOne: async (id: number): Promise<Package> => {
    const res = await api.get(`/super-admin/packages/${id}`);
    return res.data.data;
  },

  create: async (data: PackagePayload): Promise<Package> => {
    const res = await api.post('/super-admin/packages', data);
    return res.data.data;
  },

  update: async (id: number, data: PackagePayload): Promise<Package> => {
    const res = await api.put(`/super-admin/packages/${id}`, data);
    return res.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/super-admin/packages/${id}`);
  },

  toggle: async (id: number): Promise<{ is_active: boolean }> => {
    const res = await api.patch(`/super-admin/packages/${id}/toggle`);
    return res.data.data;
  },
};
