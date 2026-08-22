'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isAuthenticated, getAuthType, getAuthUser, setActiveCompany, resolveStaffRedirect } from '@/lib/auth';
import { User } from '@/types';
import { HiBuildingOffice2, HiArrowRightOnRectangle, HiCheckCircle } from 'react-icons/hi2';

const safeReturnTo = (target: string | null): string | null => {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return null;
  if (target === '/select-company' || target.startsWith('/select-company?')) return null;
  if (target === '/login' || target.startsWith('/login?')) return null;
  return target;
};

export default function SelectCompanyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser]           = useState<User | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  useEffect(() => {
    if (!isAuthenticated() || getAuthType() !== 'user') {
      router.replace('/login');
      return;
    }
    const u = getAuthUser() as User | null;
    if (!u) { router.replace('/login'); return; }

    // Single ACTIVE company (regardless of how many suspended ones also
    // exist) — no need to pick, set it and proceed. A suspended-only
    // assignment must never get auto-selected as the active company; with
    // zero active ones this falls through to resolveStaffRedirect(undefined)
    // → '/dashboard', where DashboardLayout's own active-only check already
    // shows the "not assigned to any company" empty state.
    const assignments = u.company_assignments ?? [];
    const activeAssignments = assignments.filter(a => a.status === 'active');
    if (activeAssignments.length <= 1) {
      const active = activeAssignments[0];
      if (active) setActiveCompany(active.company_id);
      router.replace(returnTo ?? resolveStaffRedirect(active));
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(u);
  }, [router, returnTo]);

  const choose = (companyId: number) => {
    setSelecting(companyId);
    setActiveCompany(companyId);
    const assignment = (user?.company_assignments ?? []).find(a => a.company_id === companyId);
    router.push(returnTo ?? resolveStaffRedirect(assignment));
  };

  if (!user) return null;

  const assignments = user.company_assignments ?? [];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 50%, #f0fdf4 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52,
            background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
            borderRadius: 14, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            boxShadow: '0 8px 24px rgba(37,99,235,0.25)',
          }}>
            <HiBuildingOffice2 size={26} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            Select a Workspace
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            You belong to multiple companies. Choose which one to open.
          </p>
        </div>

        {/* Company cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {assignments.map(a => {
            const isActive   = a.status === 'active';
            const moduleCount = Object.keys(a.permissions ?? {}).length;
            const loading    = selecting === a.company_id;

            return (
              <button
                key={a.company_id}
                onClick={() => isActive && choose(a.company_id)}
                disabled={!isActive || !!selecting}
                style={{
                  width: '100%', textAlign: 'left',
                  background: '#fff',
                  border: `1.5px solid ${isActive ? '#e2e8f0' : '#f1f5f9'}`,
                  borderRadius: 14, padding: '18px 20px',
                  cursor: isActive && !selecting ? 'pointer' : 'not-allowed',
                  opacity: isActive ? 1 : 0.55,
                  display: 'flex', alignItems: 'center', gap: 14,
                  transition: 'border-color .15s, box-shadow .15s',
                  boxShadow: loading ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
                }}
                onMouseEnter={e => {
                  if (isActive && !selecting) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#bfdbfe';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
                  }
                }}
                onMouseLeave={e => {
                  if (!loading) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = isActive ? '#e2e8f0' : '#f1f5f9';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                  }
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <HiBuildingOffice2 size={22} color="#2563eb" />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
                    {a.company_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {moduleCount} module{moduleCount !== 1 ? 's' : ''} assigned
                    {!isActive && ' · Suspended'}
                  </div>
                </div>

                {/* Status / arrow */}
                {loading ? (
                  <div style={{ width: 20, height: 20, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                ) : isActive ? (
                  <HiCheckCircle size={20} color="#bfdbfe" style={{ flexShrink: 0 }} />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Sign out */}
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <button
            onClick={() => { import('@/lib/auth').then(({ logout }) => { logout(); router.push('/login'); }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <HiArrowRightOnRectangle size={15} /> Sign out
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
