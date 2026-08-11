import api from '@/lib/axios';
import { Admin, User } from '@/types';

// Storage::url() on the backend returns a path relative to the Laravel host
// (e.g. "/storage/users/63/avatar/x.png") — but only /api/* is proxied to
// that host from the Next.js dev server (see next.config.ts), so a bare
// relative path 404s against the frontend's own origin instead. Resolve it
// against the API origin (NEXT_PUBLIC_API_URL minus its trailing /api).
const STORAGE_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api\/?$/, '');

export function resolveAvatarUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${STORAGE_ORIGIN}${url}`;
}

// "My Profile" — self-service name/phone/avatar/password, for either guard.
// Never accepts/sends a user id — the backend always resolves the actor from
// the auth token, so this can only ever update the logged-in account itself.
function buildProfileService<T extends Admin | User>(base: '/admin' | '/user') {
  return {
    get: async (): Promise<T> => (await api.get(`${base}/profile`)).data.data,

    update: async (payload: { name: string; phone?: string | null }): Promise<T> =>
      (await api.put(`${base}/profile`, payload)).data.data,

    uploadAvatar: async (file: File): Promise<T> => {
      const form = new FormData();
      form.append('avatar', file);
      const res = await api.post(`${base}/profile/avatar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },

    changePassword: async (payload: {
      current_password: string;
      password: string;
      password_confirmation: string;
    }): Promise<void> => {
      await api.put(`${base}/profile/password`, payload);
    },
  };
}

export const adminProfileService = buildProfileService<Admin>('/admin');
export const userProfileService = buildProfileService<User>('/user');
