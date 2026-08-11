import clientApi from '@/lib/clientAxios';

export const clientService = {
  login: async (email: string, password: string) => {
    const res = await clientApi.post('/client/login', { email, password });
    return res.data.data;
  },
  logout: async () => {
    await clientApi.post('/client/logout');
  },
  me: async () => {
    const res = await clientApi.get('/client/me');
    return res.data.data;
  },
  dashboard: async () => {
    const res = await clientApi.get('/client/dashboard');
    return res.data.data;
  },
  projects: async (params?: Record<string, string>) => {
    const res = await clientApi.get('/client/projects', { params });
    return res.data.data;
  },
  project: async (id: number) => {
    const res = await clientApi.get(`/client/projects/${id}`);
    return res.data.data;
  },
  approveDeliverable: async (id: number) => {
    const res = await clientApi.post(`/client/deliverables/${id}/approve`);
    return res.data;
  },
  requestRevision: async (id: number, notes?: string) => {
    const res = await clientApi.post(`/client/deliverables/${id}/revision`, { notes });
    return res.data;
  },
  invoices: async (params?: Record<string, string>) => {
    const res = await clientApi.get('/client/invoices', { params });
    return res.data.data;
  },
  invoice: async (id: number) => {
    const res = await clientApi.get(`/client/invoices/${id}`);
    return res.data.data;
  },
  invoiceGateways: async (id: number) => {
    const res = await clientApi.get(`/client/invoices/${id}/gateways`);
    return res.data.data;
  },
  payInvoice: async (id: number, data: { method: string; gateway_ref?: string; notes?: string }) => {
    const res = await clientApi.post(`/client/invoices/${id}/pay`, data);
    return res.data;
  },
  initiateGatewayCheckout: async (id: number, gateway: string) => {
    const res = await clientApi.post(`/client/invoices/${id}/gateways/${gateway}/initiate`);
    return res.data.data as { navigation: 'redirect' | 'post_form'; action: string; fields: Record<string, string> };
  },
  gatewayReturnStatus: async (id: number, gateway: string, query: string) => {
    const res = await clientApi.get(`/client/invoices/${id}/gateways/${gateway}/return${query}`);
    return res.data.data as { status: string };
  },
  payments: async () => {
    const res = await clientApi.get('/client/payments');
    return res.data.data;
  },
  documents: async (params?: Record<string, string>) => {
    const res = await clientApi.get('/client/documents', { params });
    return res.data.data;
  },
  documentDownloadUrl: (id: number) => {
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    return `${base}/client/documents/${id}/download`;
  },
  chatThreads: async () => {
    const res = await clientApi.get('/client/chat/threads');
    return res.data.data;
  },
  chatEligibleContacts: async (): Promise<Array<{ type: 'admin' | 'user'; id: number; name: string; role: string }>> => {
    const res = await clientApi.get('/client/chat/eligible-contacts');
    return res.data.data;
  },
  chatStart: async (recipient: { type: 'admin' } | { type: 'user'; id: number }): Promise<{ thread_id: number }> => {
    const res = await clientApi.post('/client/chat/start', {
      recipient_type: recipient.type,
      recipient_user_id: recipient.type === 'user' ? recipient.id : undefined,
    });
    return res.data.data;
  },
  chatMessages: async (threadId: number) => {
    const res = await clientApi.get(`/client/chat/threads/${threadId}/messages`);
    return res.data.data;
  },
  chatReply: async (threadId: number, data: FormData) => {
    const res = await clientApi.post(`/client/chat/threads/${threadId}/reply`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  support: async () => {
    const res = await clientApi.get('/client/support');
    return res.data.data;
  },
  createTicket: async (data: FormData) => {
    const res = await clientApi.post('/client/support', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  ticket: async (id: number) => {
    const res = await clientApi.get(`/client/support/${id}`);
    return res.data.data;
  },
  ticketReply: async (id: number, data: FormData) => {
    const res = await clientApi.post(`/client/support/${id}/reply`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  reportProjects: async () => {
    const res = await clientApi.get('/client/reports/projects');
    return res.data.data;
  },
  reportInvoices: async () => {
    const res = await clientApi.get('/client/reports/invoices');
    return res.data.data;
  },
};
