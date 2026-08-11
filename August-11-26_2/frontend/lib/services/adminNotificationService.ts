import api from '@/lib/axios';

export interface AdminNotification {
  id: number;
  // 'audit' = legacy SystemAuditLog-backed entry (no per-row state — clicking
  // only navigates, same as before). 'notification' = a real notifications
  // row (recipient_admin_id) with true per-row mark-read/clear.
  key: string;
  source: 'audit' | 'notification';
  title: string;
  body: string | null;
  module_key: string | null;
  is_read: boolean;
  created_at: string;
  link: string | null;
}

export interface NavUnreadCounts {
  tasks: number;
  projects: number;
}

export const adminNotificationService = {
  list: async (): Promise<{ notifications: AdminNotification[]; unread_count: number }> =>
    (await api.get('/admin/notifications')).data.data,
  markAllRead: async (): Promise<void> => {
    await api.patch('/admin/notifications/read-all');
  },
  unreadCounts: async (): Promise<NavUnreadCounts> =>
    (await api.get('/admin/notifications/unread-counts')).data.data,
  markCategoryRead: async (category: 'tasks' | 'projects'): Promise<void> => {
    await api.patch('/admin/notifications/mark-category-read', { category });
  },
  // Only valid for source==='notification' entries — the backend 404s
  // otherwise (an audit-log entry has no per-row id in this table).
  markRead: async (id: number): Promise<void> => {
    await api.patch(`/admin/notifications/${id}/read`);
  },
  clear: async (id: number): Promise<void> => {
    await api.delete(`/admin/notifications/${id}`);
  },
  clearAll: async (): Promise<void> => {
    await api.delete('/admin/notifications');
  },
};
