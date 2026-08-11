import api from '@/lib/axios';

export interface GatewayInitData {
  // Stripe
  publishable_key?: string;
  // PayPal
  client_id?: string;
  // Authorize.Net
  api_login_id?: string;
  client_key?: string;
  // All gateways
  mode: string;
}

export interface ProcessPayload {
  gateway: 'stripe' | 'paypal' | 'authorize_net';
  amount: number;
  currency: string;
  payment_method_id?: string;
  paypal_order_id?: string;
  opaque_data_descriptor?: string;
  opaque_data_value?: string;
}

export interface OrderSummary {
  package_name: string;
  mode: string;
  modules: string[];
  required_dependencies: string[];
  seats: string;
  companies: string;
  total_pkr: number;
  total_usd: number;
  currency: 'USD';
  trial_days: number;
}

export const subscriptionPaymentService = {
  init: async (gateway: string): Promise<GatewayInitData> => {
    const res = await api.get('/admin/subscription/payment-init', { params: { gateway } });
    return res.data.data;
  },

  // Fallback source for the Order Summary card when localStorage.pending_order
  // isn't available (e.g. resuming payment on a session that never saw the
  // registration page) — rebuilt server-side from the admin's saved package.
  orderSummary: async (): Promise<OrderSummary> => {
    const res = await api.get('/admin/subscription/order-summary');
    return res.data.data;
  },

  createPaypalOrder: async (amount: number, currency: string): Promise<{ order_id: string }> => {
    const res = await api.post('/admin/subscription/paypal/create-order', { amount, currency });
    return res.data.data;
  },

  process: async (payload: ProcessPayload) => {
    const res = await api.post('/admin/subscription/process', payload);
    return res.data.data as { status: string; gateway: string; gateway_ref: string };
  },
};
