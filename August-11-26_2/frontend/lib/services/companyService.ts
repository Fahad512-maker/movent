import api from '@/lib/axios';
import { CompanyFull, DashboardStats } from '@/types';

export const companyService = {
  getAll: async (): Promise<CompanyFull[]> => {
    const res = await api.get('/super-admin/companies');
    return res.data.data;
  },

  toggleStatus: async (id: number): Promise<{ is_active: boolean }> => {
    const res = await api.patch(`/super-admin/companies/${id}/toggle`);
    return res.data.data;
  },

  getModules: async (id: number): Promise<string[]> => {
    const res = await api.get(`/super-admin/companies/${id}/modules`);
    return res.data.data.modules;
  },

  syncModules: async (id: number, modules: string[]): Promise<void> => {
    await api.put(`/super-admin/companies/${id}/modules`, { modules });
  },
};

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const res = await api.get('/super-admin/dashboard');
    return res.data.data;
  },
};
