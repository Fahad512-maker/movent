'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getAuthType, getAuthUser, setAuthData, getToken, logout, getActiveCompany, setActiveCompany } from '@/lib/auth';
import { Admin, User } from '@/types';
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
  // Unassign Company from User — set once the periodic refresh below finds
  // this User session has zero active company_assignments left. Renders in
  // place of the normal sidebar/content rather than navigating away, so
  // "block company-specific CRM access" holds no matter which page they
  // were on when their last company was unassigned. Initialized synchronously
  // from the cached login cookie (not just `false`) so a session that's
  // already zero-company right after login never flashes the real
  // Sidebar/page content (and their data-fetches) before the async refresh
  // below gets a chance to run.
  const [noCompanyAssigned, setNoCompanyAssigned] = useState(() => {
    if (typeof window === 'undefined' || !isAuthenticated() || getAuthType() !== 'user') return false;
    const cachedUser = getAuthUser() as User | null;
    const active = (cachedUser?.company_assignments ?? []).filter(a => a.status === 'active');
    return active.length === 0;
  });

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

            // Unassign Company from User — react the moment THIS session's
            // own company list shrinks (an admin removing them from a
            // company happens in a different session entirely, so this poll
            // is how the affected user's own browser finds out).
            if (type === 'user') {
              const active = ((fresh as User).company_assignments ?? []).filter(a => a.status === 'active');
              setNoCompanyAssigned(active.length === 0);

              const activeId = getActiveCompany();
              const stillValid = activeId !== null && active.some(a => a.company_id === activeId);
              if (active.length > 0 && !stillValid) {
                if (active.length === 1) {
                  // Automatically switch — nothing to ask, there's only one.
                  setActiveCompany(active[0].company_id);
                } else if (window.location.pathname !== '/select-company') {
                  // Ask them to pick, same as the post-login flow.
                  router.replace('/select-company');
                }
              }
            }
          }
        }).catch(() => {});
      };
      refresh();
      const interval = setInterval(refresh, 60000);
      return () => clearInterval(interval);
    }
  }, [router]);

  if (noCompanyAssigned) {
    return (
      <div>
        <div className="main-content" style={{ marginLeft: 0 }}>
          <Navbar title={title} />
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              maxWidth: 480, marginTop: 60, textAlign: 'center', background: '#fff',
              border: '1px solid #f1f5f9', borderRadius: 14, padding: '40px 32px',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
                You have not been assigned to any company yet. Please contact your administrator.
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                Access will resume automatically as soon as you&apos;re assigned to a company.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
