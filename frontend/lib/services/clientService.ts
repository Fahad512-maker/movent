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
  // One single Sales Chat conversation (Seller <-> Client <-> Company
  // Admin) — no thread picker, matching Api\Client\ChatController.
  chatMessages: async () => {
    const res = await clientApi.get('/client/chat/messages');
    return res.data.data;
  },
  chatReply: async (data: FormData) => {
    const res = await clientApi.post('/client/chat/reply', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  // Per-PROJECT chat — a separate conversation for each project, between the
  // client, that project's own Seller and Company Admin (see
  // Api\Client\ProjectChatController). Unrelated to the account-level Sales
  // Chat above.
  projectChat: async (projectId: number) => {
    const res = await clientApi.get(`/client/projects/${projectId}/chat`);
    return res.data.data;
  },
  // `data` carries content/file plus any mentions[] entries — see
  // Api\Client\ProjectChatController::store().
  projectChatSend: async (projectId: number, data: FormData) => {
    const res = await clientApi.post(`/client/projects/${projectId}/chat`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },
  projectChatAttachment: async (projectId: number, messageId: number, fileName: string) => {
    const res = await clientApi.get(`/client/projects/${projectId}/chat/${messageId}/attachment`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
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
