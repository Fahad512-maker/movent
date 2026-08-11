import api from '@/lib/axios';
import { Admin } from '@/types';

export interface TierOption {
  value: number | null;
  label: string;
  price_usd: number;
  price_pkr: number;
}

export interface SeatCatalog {
  seat_tiers: TierOption[];
  company_tiers: TierOption[];
  current: { max_users_per_company: number | null; max_companies: number | null };
}

export interface SeatPurchasePayload {
  type: 'seats' | 'companies';
  tier_value: number | null;
  gateway: 'stripe' | 'paypal' | 'authorize_net';
  currency: string;
  payment_method_id?: string;
  paypal_order_id?: string;
  opaque_data_descriptor?: string;
  opaque_data_value?: string;
}

export const seatPurchaseService = {
  catalog: async (): Promise<SeatCatalog> => {
    const res = await api.get('/admin/seats/catalog');
    return res.data.data;
  },

  purchase: async (payload: SeatPurchasePayload): Promise<Admin> => {
    const res = await api.post('/admin/seats/purchase', payload);
    return res.data.data;
  },
};
