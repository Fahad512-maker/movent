import api from '@/lib/axios';

export interface PaymentRecord {
  id: number;
  invoice_id: number;
  amount: string;
  method: string | null;
  gateway: string | null;
  gateway_ref: string | null;
  status: string;
  payment_date: string;
  notes: string | null;
  invoice: {
    id: number;
    invoice_number: string;
    currency: string;
    client: { id: number; name: string } | null;
  } | null;
}

export interface PaymentSummary {
  total: number;
  count: number;
  by_method: Record<string, number>;
}

export const adminPaymentService = {
  list: async (params?: Record<string, string>): Promise<{ payments: PaymentRecord[]; summary: PaymentSummary }> => {
    const res = await api.get('/admin/payments', { params });
    return res.data.data;
  },

  remove: async (paymentId: number): Promise<void> => {
    await api.delete(`/admin/payments/${paymentId}`);
  },

  confirm: async (paymentId: number): Promise<void> => {
    await api.patch(`/admin/payments/${paymentId}/confirm`);
  },

  reject: async (paymentId: number, reason?: string): Promise<void> => {
    await api.patch(`/admin/payments/${paymentId}/reject`, { reason });
  },
};
