import api from '@/lib/axios';
import { Invoice, InvoicePayment } from '@/types';

export interface InvoicePayload {
  company_id: number;
  client_id?: number | null;
  lead_id?: number | null;
  send_now?: boolean;
  due_date?: string | null;
  currency?: string;
  tax_rate?: number;
  discount_amount?: number;
  notes?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  items: { description: string; quantity: number; unit_price: number }[];
  gateway_account_ids?: number[];
  invoice_purpose?: string;
  payment_type?: string;
  required_payment_amount?: number;
  counts_toward_project_activation?: boolean;
}

export interface ClientInvoiceStats {
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  overdue_count: number;
}

export const adminInvoiceService = {
  list: async (params?: Record<string, string>): Promise<Invoice[]> => {
    const res = await api.get('/admin/invoices', { params });
    return res.data.data;
  },

  getOne: async (id: number): Promise<Invoice> => {
    const res = await api.get(`/admin/invoices/${id}`);
    return res.data.data;
  },

  create: async (payload: InvoicePayload): Promise<Invoice> => {
    const res = await api.post('/admin/invoices', payload);
    return res.data.data;
  },

  update: async (id: number, payload: Partial<InvoicePayload>): Promise<Invoice> => {
    const res = await api.put(`/admin/invoices/${id}`, payload);
    return res.data.data;
  },

  send: async (id: number): Promise<void> => {
    await api.patch(`/admin/invoices/${id}/send`);
  },

  cancel: async (id: number): Promise<void> => {
    await api.patch(`/admin/invoices/${id}/cancel`);
  },

  forClient: async (clientId: number): Promise<{ invoices: Invoice[]; stats: ClientInvoiceStats }> => {
    const res = await api.get(`/admin/clients/${clientId}/invoices`);
    return res.data.data;
  },

  recordPayment: async (invoiceId: number, data: {
    amount: number;
    method?: string;
    payment_date?: string;
    notes?: string;
    gateway?: string;
    gateway_ref?: string;
  }): Promise<{ payment: InvoicePayment; invoice: Partial<Invoice> }> => {
    const res = await api.post(`/admin/invoices/${invoiceId}/payments`, data);
    return res.data.data;
  },

  removePayment: async (paymentId: number): Promise<void> => {
    await api.delete(`/admin/payments/${paymentId}`);
  },

  sendEmail: async (invoiceId: number, email: string, expiryDays?: number): Promise<{ payment_url: string; sent_to: string }> => {
    const res = await api.post(`/admin/invoices/${invoiceId}/send-email`, { email, expiry_days: expiryDays });
    return res.data.data;
  },

  generatePaymentLink: async (invoiceId: number, options?: {
    expiry_days?: number;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    customer_address?: string;
  }): Promise<{ payment_token: string; token_expires_at: string | null; payment_url: string }> => {
    const res = await api.post(`/admin/invoices/${invoiceId}/generate-link`, options ?? {});
    return res.data.data;
  },

  revokePaymentLink: async (invoiceId: number): Promise<void> => {
    await api.delete(`/admin/invoices/${invoiceId}/generate-link`);
  },
};
