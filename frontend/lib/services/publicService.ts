import api from '@/lib/axios';
import { PublicPackage } from '@/types';

export interface RegisterData {
  company_name: string;
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  phone?: string;
  package_id: number;
  selected_modules: string[];
  currency: 'USD';
  start_type: 'trial' | 'paid';
  timezone: string;
  country?: string;
  max_users?: number | null;
  max_companies?: number | null;
}

export interface ActiveGateway {
  id: number;
  name: string;
  display_name: string;
  is_active: boolean;
}

export interface PublicModule {
  key: string;
  label: string;
  description: string | null;
  sub_modules: string[];
  price_pkr: number;
  price_usd: number;
}

export const publicService = {
  getPackages: async (): Promise<PublicPackage[]> => {
    const res = await api.get('/public/packages');
    return res.data.data;
  },

  getModules: async (): Promise<PublicModule[]> => {
    const res = await api.get('/public/modules');
    return res.data.data;
  },

  checkEmail: async (email: string): Promise<boolean> => {
    const res = await api.post('/public/check-email', { email });
    return res.data.data.available;
  },

  checkCompanyName: async (companyName: string): Promise<boolean> => {
    const res = await api.post('/public/check-company-name', { company_name: companyName });
    return res.data.data.available;
  },

  register: async (data: RegisterData) => {
    const res = await api.post('/public/register', data);
    return res.data;
  },

  getActiveGateways: async (): Promise<ActiveGateway[]> => {
    const res = await api.get('/public/payment-gateways');
    return res.data.data;
  },
};
