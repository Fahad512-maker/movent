import clientApi from '@/lib/clientAxios';

export interface ClientNotification {
  id: number;
  user_id: number;
  company_id: number;
  type: string | null;
  title: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  cleared_at: string | null;
  created_at: string;
}

// Portal counterpart of lib/services/notificationService.ts — same endpoints
// under /client, and the link still travels inside data.link rather than as a
// top-level field (see App\Services\InvoiceNotificationService).
export const clientNotificationService = {
  list: async (): Promise<{ notifications: ClientNotification[]; unread_count: number }> =>
    (await clientApi.get('/client/notifications')).data.data,
  markRead: async (id: number): Promise<ClientNotification> =>
    (await clientApi.patch(`/client/notifications/${id}/read`)).data.data,
  markAllRead: async (): Promise<void> => {
    await clientApi.patch('/client/notifications/read-all');
  },
  clear: async (id: number): Promise<void> => {
    await clientApi.delete(`/client/notifications/${id}`);
  },
  clearAll: async (): Promise<void> => {
    await clientApi.delete('/client/notifications');
  },
};
