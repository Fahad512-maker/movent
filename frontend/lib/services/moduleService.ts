import api from '@/lib/axios';

export interface ModuleItem {
  id: number;
  key: string;
  label: string;
  description: string | null;
  sub_modules: string[];
  price_pkr: number;
  price_usd: number;
  is_active: boolean;
  is_system: boolean;
}

export interface ModulePayload {
  key: string;
  label: string;
  description?: string | null;
  price_usd?: number | null;
}

export const moduleService = {
  getAll: async (): Promise<ModuleItem[]> => {
    const res = await api.get('/super-admin/modules');
    return res.data.data;
  },

  create: async (data: ModulePayload): Promise<ModuleItem> => {
    const res = await api.post('/super-admin/modules', data);
    return res.data.data;
  },

  update: async (id: number, data: Omit<ModulePayload, 'key'>): Promise<ModuleItem> => {
    const res = await api.put(`/super-admin/modules/${id}`, data);
    return res.data.data;
  },

  toggle: async (id: number): Promise<{ is_active: boolean }> => {
    const res = await api.patch(`/super-admin/modules/${id}/toggle`);
    return res.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/super-admin/modules/${id}`);
  },
};
