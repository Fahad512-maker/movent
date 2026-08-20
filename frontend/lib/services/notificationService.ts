import api from '@/lib/axios';

export interface AppNotification {
  id: number;
  user_id: number;
  company_id: number;
  company?: { id: number; name: string } | null;
  type: string | null;
  title: string | null;
  body: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  read_at: string | null;
  cleared_at: string | null;
  created_at: string;
}

export interface NotificationOpenResult {
  company_id: number;
  company_name: string | null;
  link: string | null;
  access_granted: boolean;
}

export interface NavUnreadCounts {
  tasks: number;
  projects: number;
}

export const notificationService = {
  list: async (): Promise<{ notifications: AppNotification[]; unread_count: number }> =>
    (await api.get('/user/notifications')).data.data,
  markRead: async (id: number): Promise<AppNotification> =>
    (await api.patch(`/user/notifications/${id}/read`)).data.data,
  open: async (id: number): Promise<NotificationOpenResult> =>
    (await api.patch(`/user/notifications/${id}/open`)).data.data,
  markAllRead: async (): Promise<void> => {
    await api.patch('/user/notifications/read-all');
  },
  unreadCounts: async (): Promise<NavUnreadCounts> =>
    (await api.get('/user/notifications/unread-counts')).data.data,
  markCategoryRead: async (category: 'tasks' | 'projects'): Promise<void> => {
    await api.patch('/user/notifications/mark-category-read', { category });
  },
  clear: async (id: number): Promise<void> => {
    await api.delete(`/user/notifications/${id}`);
  },
  clearAll: async (): Promise<void> => {
    await api.delete('/user/notifications');
  },
};
