import api from '@/lib/axios';
import { ChatMessage } from './adminProjectService';

export interface ChatThreadParticipant {
  user_id: number;
  name: string | null;
  role: string | null;
}

export interface ChatThreadLastMessage {
  content: string | null;
  message_type: 'text' | 'file' | 'image' | 'system';
  sender_name: string;
  sent_at: string;
}

export interface ChatThreadSummary {
  id: number;
  company?: string | null;
  thread_type: 'direct' | 'group';
  title: string;
  participants: ChatThreadParticipant[];
  is_muted?: boolean;
  last_message_at: string | null;
  last_message?: ChatThreadLastMessage | null;
  // Admin has no chat_participants row/last_read_at (see
  // Api\Admin\GeneralChatController::index()), so this is only ever present
  // on the User-guard thread list.
  unread_count?: number;
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

// User-side General Chat — direct/group messaging gated on canUseGeneralChat,
// not tied to any project/lead. See Api\User\GeneralChatController.
export const userGeneralChatService = {
  list: async (): Promise<ChatThreadSummary[]> => (await api.get('/user/chat')).data.data,

  createDirect: async (recipientUserId: number): Promise<{ thread_id: number }> =>
    (await api.post('/user/chat/direct', { recipient_user_id: recipientUserId })).data.data,

  createGroup: async (title: string, participantUserIds: number[]): Promise<{ thread_id: number }> =>
    (await api.post('/user/chat/group', { title, participant_user_ids: participantUserIds })).data.data,

  addParticipant: async (threadId: number, userId: number): Promise<void> => {
    await api.post(`/user/chat/${threadId}/participants`, { user_id: userId });
  },
  removeParticipant: async (threadId: number, userId: number): Promise<void> => {
    await api.delete(`/user/chat/${threadId}/participants/${userId}`);
  },
  toggleMute: async (threadId: number): Promise<{ is_muted: boolean }> =>
    (await api.patch(`/user/chat/${threadId}/mute`)).data.data,

  messages: async (threadId: number): Promise<ChatMessage[]> =>
    (await api.get(`/user/chat/${threadId}/messages`)).data.data,

  send: async (threadId: number, content: string, file?: File | null): Promise<ChatMessage> => {
    if (file) {
      const form = new FormData();
      if (content) form.append('content', content);
      form.append('file', file);
      const res = await api.post(`/user/chat/${threadId}/messages`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    }
    const res = await api.post(`/user/chat/${threadId}/messages`, { content });
    return res.data.data;
  },

  updateMessage: async (threadId: number, messageId: number, content: string): Promise<ChatMessage> =>
    (await api.patch(`/user/chat/${threadId}/messages/${messageId}`, { content })).data.data,

  deleteMessage: async (threadId: number, messageId: number): Promise<void> => {
    await api.delete(`/user/chat/${threadId}/messages/${messageId}`);
  },

  downloadAttachment: async (threadId: number, messageId: number, fileName: string): Promise<void> => {
    const res = await api.get(`/user/chat/${threadId}/messages/${messageId}/attachment`, { responseType: 'blob' });
    downloadBlob(res.data, fileName);
  },
};

// Admin-side General Chat — company-wide oversight, no participant-row
// membership (Company Admin isn't a `users` row). See Api\Admin\GeneralChatController.
export const adminGeneralChatService = {
  list: async (): Promise<ChatThreadSummary[]> => (await api.get('/admin/chat')).data.data,

  eligibleUsers: async (companyId: number): Promise<{ id: number; name: string; role_type: string }[]> =>
    (await api.get('/admin/chat/eligible-users', { params: { company_id: companyId } })).data.data,

  createDirect: async (companyId: number, userId: number): Promise<{ thread_id: number }> =>
    (await api.post('/admin/chat/direct', { company_id: companyId, user_id: userId })).data.data,

  createGroup: async (companyId: number, title: string, participantUserIds: number[]): Promise<{ thread_id: number }> =>
    (await api.post('/admin/chat/group', { company_id: companyId, title, participant_user_ids: participantUserIds })).data.data,

  removeParticipant: async (threadId: number, userId: number): Promise<void> => {
    await api.delete(`/admin/chat/${threadId}/participants/${userId}`);
  },

  messages: async (threadId: number): Promise<ChatMessage[]> =>
    (await api.get(`/admin/chat/${threadId}/messages`)).data.data,

  send: async (threadId: number, content: string, file?: File | null): Promise<ChatMessage> => {
    if (file) {
      const form = new FormData();
      if (content) form.append('content', content);
      form.append('file', file);
      const res = await api.post(`/admin/chat/${threadId}/messages`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    }
    const res = await api.post(`/admin/chat/${threadId}/messages`, { content });
    return res.data.data;
  },

  updateMessage: async (threadId: number, messageId: number, content: string): Promise<ChatMessage> =>
    (await api.patch(`/admin/chat/${threadId}/messages/${messageId}`, { content })).data.data,

  deleteMessage: async (threadId: number, messageId: number): Promise<void> => {
    await api.delete(`/admin/chat/${threadId}/messages/${messageId}`);
  },

  downloadAttachment: async (threadId: number, messageId: number, fileName: string): Promise<void> => {
    const res = await api.get(`/admin/chat/${threadId}/messages/${messageId}/attachment`, { responseType: 'blob' });
    downloadBlob(res.data, fileName);
  },
};
