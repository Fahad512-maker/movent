'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clientService } from '@/lib/services/clientService';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  sent:           { bg: '#eff6ff', color: '#2563eb', label: 'Sent' },
  overdue:        { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  paid:           { bg: '#ecfdf5', color: '#059669', label: 'Paid' },
  partially_paid: { bg: '#fff7ed', color: '#ea580c', label: 'Partial' },
  planning:       { bg: '#eff6ff', color: '#2563eb', label: 'Planning' },
  active:         { bg: '#ecfdf5', color: '#059669', label: 'Active' },
  on_hold:        { bg: '#fffbeb', color: '#d97706', label: 'On Hold' },
  completed:      { bg: '#f0fdf4', color: '#16a34a', label: 'Completed' },
};

function fmt(n: number, cur = 'USD') {
  return `${cur} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

function StatCard({ label, value, sub, color, href }: { label: string; value: string | number; sub?: string; color?: string; href?: string }) {
  const inner = (
    <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #e2e8f0', height: '100%', boxSizing: 'border-box', cursor: href ? 'pointer' : 'default', transition: 'box-shadow .15s' }}
      onMouseEnter={e => href && ((e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
      onMouseLeave={e => href && ((e.currentTarget as HTMLElement).style.boxShadow = 'none')}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#1e293b' }}>{value}</div>
      {/* Always rendered (invisible when absent) so every card reserves the
          same footer space and matches height, regardless of whether it has
          a sub line — never collapse this to `sub && <div>...` again. */}
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, visibility: sub ? 'visible' : 'hidden' }}>{sub || ' '}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{inner}</Link> : <div style={{ height: '100%' }}>{inner}</div>;
}

export default function ClientDashboardPage() {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientService.dashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ color: '#94a3b8', fontSize: 14 }}>Loading dashboard…</div>
    </div>
  );

  const s   = data?.stats   || {};
  const hasProjects = (data?.modules || []).includes('projects');
  const recentInvoices: any[] = data?.recent_invoices || [];
  const recentProjects: any[] = data?.recent_projects || [];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>Dashboard</h1>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 24px' }}>Welcome to your client portal</p>

      {/* ── Summary stat widgets — fixed 4-per-row grid, wraps to a new row
          instead of packing however many fit the screen width ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard
          label="Total Invoices"
          value={s.total_invoices ?? 0}
          color="#1e293b"
          href="/client/invoices"
        />
        <StatCard
          label="Paid Invoices"
          value={s.paid_count ?? 0}
          sub={fmt(s.paid_amount ?? 0, 'USD')}
          color="#059669"
          href="/client/invoices"
        />
        <StatCard
          label="Pending Invoices"
          value={s.pending_count ?? 0}
          sub={fmt(s.pending_amount ?? 0, 'USD')}
          color="#d97706"
          href="/client/invoices"
        />
        {hasProjects && (
          <>
            <StatCard
              label="Total Projects"
              value={s.total_projects ?? 0}
              color="#1e293b"
              href="/client/projects"
            />
            <StatCard
              label="Pending Projects"
              value={s.pending_projects ?? 0}
              color="#d97706"
              href="/client/projects"
            />
            <StatCard
              label="Ongoing Projects"
              value={s.ongoing_projects ?? 0}
              color="#2563eb"
              href="/client/projects"
            />
            <StatCard
              label="Completed Projects"
              value={s.completed_projects ?? 0}
              color="#16a34a"
              href="/client/projects"
            />
          </>
        )}
      </div>

      {/* ── No invoices yet — empty state ── */}
      {s.total_invoices === 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px dashed #e2e8f0', padding: '48px 24px', textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>No invoices yet</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Your invoices will appear here once they have been sent to you</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: hasProjects && recentProjects.length > 0 ? '1fr 1fr' : '1fr', gap: 20 }}>

        {/* ── Recent Invoices ── */}
        {recentInvoices.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Recent Invoices</h3>
              <Link href="/client/invoices" style={{ fontSize: 12, color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
            </div>
            {recentInvoices.map((inv: any, i: number) => {
              const st = STATUS_STYLE[inv.status] || { bg: '#f1f5f9', color: '#64748b', label: inv.status };
              const balance = (inv.total_amount || 0) - (inv.paid_amount || 0);
              return (
                <Link key={inv.id} href={`/client/invoices/${inv.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '13px 20px', borderBottom: i < recentInvoices.length - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{inv.invoice_number}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {inv.due_date ? `Due: ${new Date(inv.due_date).toLocaleDateString('en-GB')}` : 'No due date'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{fmt(inv.total_amount || 0, inv.currency || 'USD')}</div>
                      {balance > 0 && inv.status !== 'paid' && (
                        <div style={{ fontSize: 11, color: '#ea580c', marginTop: 1 }}>Balance: {fmt(balance, inv.currency || 'USD')}</div>
                      )}
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, marginTop: 2, display: 'inline-block', ...st }}>{st.label}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* ── Recent Projects (only if module enabled) ── */}
        {hasProjects && recentProjects.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Recent Projects</h3>
              <Link href="/client/projects" style={{ fontSize: 12, color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
            </div>
            {recentProjects.map((p: any, i: number) => {
              const st = STATUS_STYLE[p.status] || { bg: '#f1f5f9', color: '#64748b', label: p.status };
              return (
                <Link key={p.id} href={`/client/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '13px 20px', borderBottom: i < recentProjects.length - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, flexShrink: 0, marginLeft: 8, ...st }}>{st.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Overdue alert banner ── */}
      {s.overdue_count > 0 && (
        <div style={{ marginTop: 20, padding: '14px 20px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>⚠ {s.overdue_count} overdue invoice{s.overdue_count > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>Please settle your outstanding balance to avoid service interruption</div>
          </div>
          <Link href="/client/invoices?status=overdue" style={{ padding: '8px 16px', borderRadius: 8, background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
            View Overdue
          </Link>
        </div>
      )}
    </div>
  );
}
