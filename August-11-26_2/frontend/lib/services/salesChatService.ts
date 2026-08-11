import api from '@/lib/axios';
import { ChatMessage } from './adminProjectService';

// "Sales Chat" — a Seller's conversation surface for a specific Lead or
// Client, kept separate from Project Chat. Reads/writes the same admin vs.
// sanctum base paths every other module in this app uses.
function buildSalesChatService(base: '/admin' | '/user') {
  return {
    leadMessages: async (leadId: number): Promise<ChatMessage[]> => {
      const res = await api.get(`${base}/leads/${leadId}/chat`);
      return res.data.data.messages;
    },
    sendLeadMessage: async (leadId: number, content: string, file?: File | null): Promise<ChatMessage> => {
      if (file) {
        const form = new FormData();
        if (content) form.append('content', content);
        form.append('file', file);
        const res = await api.post(`${base}/leads/${leadId}/chat`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      }
      const res = await api.post(`${base}/leads/${leadId}/chat`, { content });
      return res.data.data;
    },
    downloadLeadAttachment: async (leadId: number, messageId: number, fileName: string): Promise<void> => {
      const res = await api.get(`${base}/leads/${leadId}/chat/${messageId}/attachment`, { responseType: 'blob' });
      downloadBlob(res.data, fileName);
    },
    clientMessages: async (clientId: number): Promise<ChatMessage[]> => {
      const res = await api.get(`${base}/clients/${clientId}/chat`);
      return res.data.data.messages;
    },
    sendClientMessage: async (clientId: number, content: string, file?: File | null): Promise<ChatMessage> => {
      if (file) {
        const form = new FormData();
        if (content) form.append('content', content);
        form.append('file', file);
        const res = await api.post(`${base}/clients/${clientId}/chat`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      }
      const res = await api.post(`${base}/clients/${clientId}/chat`, { content });
      return res.data.data;
    },
    downloadClientAttachment: async (clientId: number, messageId: number, fileName: string): Promise<void> => {
      const res = await api.get(`${base}/clients/${clientId}/chat/${messageId}/attachment`, { responseType: 'blob' });
      downloadBlob(res.data, fileName);
    },
  };
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const adminSalesChatService = buildSalesChatService('/admin');
export const userSalesChatService = buildSalesChatService('/user');
