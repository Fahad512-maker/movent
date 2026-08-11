import api from '@/lib/axios';
import { ActiveGateway } from './publicService';
import { Admin } from '@/types';

export interface CatalogModule {
  key: string;
  label: string;
  description: string | null;
  sub_modules: string[];
  price_pkr: number;
  price_usd: number;
}

export interface ModuleCatalog {
  modules: CatalogModule[];
  owned_modules: string[];
}

export interface PurchasePayload {
  module_keys: string[];
  gateway: 'stripe' | 'paypal' | 'authorize_net';
  currency: string;
  payment_method_id?: string;
  paypal_order_id?: string;
  opaque_data_descriptor?: string;
  opaque_data_value?: string;
}

export const moduleUpgradeService = {
  catalog: async (): Promise<ModuleCatalog> => {
    const res = await api.get('/admin/modules/catalog');
    return res.data.data;
  },

  activeGateways: async (): Promise<ActiveGateway[]> => {
    const res = await api.get('/admin/payment-gateways');
    return res.data.data;
  },

  purchase: async (payload: PurchasePayload): Promise<Admin> => {
    const res = await api.post('/admin/modules/purchase', payload);
    return res.data.data;
  },
};
