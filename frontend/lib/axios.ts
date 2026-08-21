import axios from 'axios';
import Cookies from 'js-cookie';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const activeCompanyId = Cookies.get('active_company_id');
  if (activeCompanyId) config.headers['X-Active-Company-Id'] = activeCompanyId;
  return config;
});

// Tracks the last 403 toast's timestamp so a page that fires several
// requests at once (e.g. Promise.all on mount) doesn't stack the same
// message multiple times.
let last403ToastAt = 0;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403) {
      // Every 403 in this app — a missing canX permission, a module the
      // company hasn't purchased/enabled, or an inactive subscription — is
      // something only a Company Admin can fix. Individual pages still
      // show their own "Failed to load X" fallback in most catch blocks
      // (harmless, just redundant), but this guarantees the one message
      // that actually matters — what to do next — always shows, even for
      // the many catch blocks that never read err.response.data.message.
      const now = Date.now();
      if (now - last403ToastAt > 1000) {
        last403ToastAt = now;
        toast.error("You don't have permission for this. Ask your Company Admin to enable it for your account.");
      }
    }

    if (error.response?.status === 401) {
      const url: string = error.config?.url ?? '';

      // Login/Google-exchange/resume-payment endpoints return 401 for wrong
      // credentials — that's a normal validation failure the calling page
      // already shows via toast + field errors, not an expired session.
      // Redirecting here wiped the error off the login screen before the
      // user could read it.
      const isAuthEndpoint = /\/(login|auth\/google\/exchange|resume-payment)(\?|$)/.test(url);
      if (isAuthEndpoint) return Promise.reject(error);

      const authType = Cookies.get('auth_type');
      // Sub users legitimately get 401 on /admin/* endpoints — don't log them out.
      // Only clear session when the user's own endpoint (e.g. /user/me) returns 401,
      // which means their token has expired or is invalid.
      const isAdminEndpoint = url.startsWith('/admin/') || url.startsWith('/super-admin/');
      if (!(authType === 'user' && isAdminEndpoint)) {
        Cookies.remove('auth_token');
        Cookies.remove('auth_user');
        Cookies.remove('auth_type');
        window.localStorage.removeItem('auth_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
