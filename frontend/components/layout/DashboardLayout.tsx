'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getAuthType, getAuthUser, setAuthData, getToken, logout } from '@/lib/auth';
import { Admin } from '@/types';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import api from '@/lib/axios';

export default function DashboardLayout({
  children,
  title = 'Dashboard',
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) { router.push('/login'); return; }

    // This layout is only ever valid for 'admin' or 'user' sessions — a
    // super_admin token must never render it (the backend's auth:admin/
    // auth:sanctum guards would reject its API calls anyway, but a clean
    // redirect to its own console is much better than a broken page). Also,
    // an /admin/* route must not render with a non-admin session.
    const type = getAuthType();
    const isAdminRoute = window.location.pathname.startsWith('/admin');

    if (type === 'super_admin') { router.replace('/super-admin/dashboard'); return; }
    if (isAdminRoute && type !== 'admin') { router.replace(type === 'user' ? '/dashboard' : '/login'); return; }

    // A pending_payment admin only ever holds a payment-scoped token (see
    // routes/api.php's 'subscription.active' middleware) — every API call
    // this layout's own pages make already 402s, but without this check the
    // page shell itself still renders (just empty), which reads as "it let
    // me in anyway." Send them back to /login instead of straight to
    // /payment — landing on /payment directly with this stale/plain session
    // (not the fresh payment-scoped token issued by useAuth's resumePayment())
    // doesn't reliably let them actually pay; going through /login's
    // "Complete Payment" button re-verifies credentials and issues that
    // proper token first. Clears the stale session so /login doesn't loop
    // back here. Checked from the cached cookie first (no flash of the real
    // page while an async refresh is in flight), then again once the fresh
    // /me response comes back below in case the cached copy was stale.
    const isPaymentRoute = window.location.pathname.startsWith('/payment');
    if (type === 'admin' && !isPaymentRoute) {
      const cachedAdmin = getAuthUser() as Admin | null;
      if (cachedAdmin?.subscription_status === 'pending_payment') {
        logout();
        router.replace('/login');
        return;
      }
    }

    // Refresh session so module/permission changes are picked up without re-login.
    // Also polled on an interval (not just on mount): this layout re-mounts on
    // navigation, but a sub-user sitting on one page while Company Admin
    // edits their permissions would otherwise see the stale grant until they
    // navigate away and back.
    if (type === 'admin' || type === 'user') {
      const endpoint = type === 'admin' ? '/admin/me' : '/user/me';
      const refresh = () => {
        api.get(endpoint).then(res => {
          const fresh = res.data?.data;
          const token = getToken();
          if (fresh && token) {
            setAuthData(token, fresh, type as 'admin' | 'user');
            window.dispatchEvent(new Event('auth_refreshed'));
            if (type === 'admin' && fresh.subscription_status === 'pending_payment' && !isPaymentRoute) {
              logout();
              router.replace('/login');
            }
          }
        }).catch(() => {});
      };
      refresh();
      const interval = setInterval(refresh, 60000);
      return () => clearInterval(interval);
    }
  }, [router]);

  return (
    <div>
      <Sidebar />
      <div className="main-content">
        <Navbar title={title} />
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
}
