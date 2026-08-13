import api from '@/lib/axios';
import { ChatMessage } from './adminProjectService';

// Per-project CLIENT chat — Client <-> the project's own Seller <-> Company
// Admin, one conversation per project (see App\Services\ProjectClientChatService).
// Deliberately NOT the internal team messenger in projectMessengerService.ts:
// that thread is invisible to the client, this one is the client's own.

export interface ProjectClientChatParticipant {
  // null for the synthetic "Company Admin" entry — Admin is never a
  // chat_participants row (it has no `users` id).
  user_id: number | null;
  name: string | null;
  role_type: string | null;
}

// A Project Manager the Seller may invite. The list is empty when the project
// has no separate PM to invite — most commonly a seller-run project where
// project_manager_id is the Seller themselves (backfilled for display only),
// which still SHOWS a manager name on the project page.
export interface ProjectClientChatPm {
  user_id: number;
  name: string | null;
  invited: boolean;
  // How much of the thread the PM may read: 'all' = everything including
  // messages from before the invite, 'from_now' = post-invite only. null
  // until they're actually invited.
  history: 'all' | 'from_now' | null;
  invited_at: string | null;
}

export interface ProjectClientChatPayload {
  // status is here so the composer can lock itself on a draft project,
  // matching the server's own isDraft() rejection.
  project: { id: number; name: string; status?: string };
  // Everyone the caller may @mention — the rest of the conversation, plus a
  // synthetic { user_id: 0, name: 'Company Admin' } entry for every caller
  // except Admin itself.
  mentionables?: { user_id: number; name: string | null; role_type: string | null }[];
  // 'seller' owns the conversation and its invite controls; 'pm' is a guest
  // the Seller invited, who can read (within their history window) and reply.
  // Only present on the User-guard response — Admin has no such distinction.
  role?: 'seller' | 'pm';
  // Empty = nobody to invite on this project.
  pms?: ProjectClientChatPm[];
  thread: { id: number; participants: ProjectClientChatParticipant[] };
  messages: ChatMessage[];
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

function buildForm(content: string, file?: File | null, mentions?: number[]): FormData {
  const form = new FormData();
  if (content) form.append('content', content);
  if (file) form.append('file', file);
  (mentions ?? []).forEach(id => form.append('mentions[]', String(id)));
  return form;
}

// Seller side — the API 404s for anyone who isn't this project's own
// projects.seller_id, so the page must only be linked for that user.
export const userProjectClientChatService = {
  get: async (projectId: number): Promise<ProjectClientChatPayload> =>
    (await api.get(`/user/projects/${projectId}/client-chat`)).data.data,

  send: async (projectId: number, content: string, file?: File | null, mentions?: number[]): Promise<ChatMessage> => {
    if (file) {
      const res = await api.post(`/user/projects/${projectId}/client-chat`, buildForm(content, file, mentions), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    }
    return (await api.post(`/user/projects/${projectId}/client-chat`, { content, mentions })).data.data;
  },

  downloadAttachment: async (projectId: number, messageId: number, fileName: string): Promise<void> => {
    const res = await api.get(`/user/projects/${projectId}/client-chat/${messageId}/attachment`, { responseType: 'blob' });
    downloadBlob(res.data, fileName);
  },

  // Own message only — enforced server-side too.
  deleteMessage: async (projectId: number, messageId: number): Promise<void> => {
    await api.delete(`/user/projects/${projectId}/client-chat/${messageId}`);
  },

  // Own message or the client's — never another staff member's. Purely a
  // staff-side view toggle, invisible to the client (enforced server-side).
  toggleHide: async (projectId: number, messageId: number): Promise<{ hidden_for_staff: boolean }> =>
    (await api.post(`/user/projects/${projectId}/client-chat/${messageId}/toggle-hide`)).data.data,

  // Seller-only. 'all' lets the PM read the conversation from the beginning;
  // 'from_now' shows them only what is said after this moment. Calling it
  // again on an already-invited PM just switches their window. userId is only
  // needed when the project has more than one eligible PM.
  invitePm: async (projectId: number, history: 'all' | 'from_now', userId?: number): Promise<void> => {
    await api.post(`/user/projects/${projectId}/client-chat/invite-pm`, { history, user_id: userId });
  },

  // Pings every Company Admin to come and look at this conversation. Admin
  // can already read/post here unconditionally — this is only the alert.
  notifyAdmin: async (projectId: number, note?: string): Promise<void> => {
    await api.post(`/user/projects/${projectId}/client-chat/notify-admin`, { note: note || undefined });
  },
};

// Company Admin side — reaches every project's client chat in its companies.
export const adminProjectClientChatService = {
  get: async (projectId: number): Promise<ProjectClientChatPayload> =>
    (await api.get(`/admin/projects/${projectId}/client-chat`)).data.data,

  send: async (projectId: number, content: string, file?: File | null, mentions?: number[]): Promise<ChatMessage> => {
    if (file) {
      const res = await api.post(`/admin/projects/${projectId}/client-chat`, buildForm(content, file, mentions), {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    }
    return (await api.post(`/admin/projects/${projectId}/client-chat`, { content, mentions })).data.data;
  },

  downloadAttachment: async (projectId: number, messageId: number, fileName: string): Promise<void> => {
    const res = await api.get(`/admin/projects/${projectId}/client-chat/${messageId}/attachment`, { responseType: 'blob' });
    downloadBlob(res.data, fileName);
  },

  // Admin can delete ANY message in the client conversation.
  deleteMessage: async (projectId: number, messageId: number): Promise<void> => {
    await api.delete(`/admin/projects/${projectId}/client-chat/${messageId}`);
  },

  // Admin can hide/unhide ANY message. Purely a staff-side view toggle,
  // invisible to the client (enforced server-side).
  toggleHide: async (projectId: number, messageId: number): Promise<{ hidden_for_staff: boolean }> =>
    (await api.post(`/admin/projects/${projectId}/client-chat/${messageId}/toggle-hide`)).data.data,
};
