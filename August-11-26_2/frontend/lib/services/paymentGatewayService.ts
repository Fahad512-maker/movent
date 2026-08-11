import api from '@/lib/axios';

export interface PaymentGateway {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  config: Record<string, string> | null;
  updated_at: string;
}

export const paymentGatewayService = {
  getAll: async (): Promise<PaymentGateway[]> => {
    const res = await api.get('/super-admin/payment-gateways');
    return res.data.data;
  },

  toggle: async (id: number): Promise<PaymentGateway> => {
    const res = await api.patch(`/super-admin/payment-gateways/${id}/toggle`);
    return res.data.data;
  },

  updateConfig: async (id: number, config: Record<string, string>): Promise<PaymentGateway> => {
    const res = await api.put(`/super-admin/payment-gateways/${id}/config`, { config });
    return res.data.data;
  },

  testConnection: async (id: number): Promise<{ success: boolean; message: string }> => {
    const res = await api.post(`/super-admin/payment-gateways/${id}/test`);
    return res.data;
  },
};
