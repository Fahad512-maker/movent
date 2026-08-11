'use client';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import { getAuthType } from '@/lib/auth';
import { useAdminGuard } from '@/hooks/useAdminGuard';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:          { bg: '#f8fafc', color: '#64748b', label: 'Draft' },
  sent:           { bg: '#eff6ff', color: '#2563eb', label: 'Sent' },
  partially_paid: { bg: '#fff7ed', color: '#ea580c', label: 'Partial' },
  paid:           { bg: '#ecfdf5', color: '#059669', label: 'Paid' },
  overdue:        { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  cancelled:      { bg: '#f8fafc', color: '#94a3b8', label: 'Cancelled' },
};

interface Summary {
  total_invoiced: number; total_paid: number; total_outstanding: number;
  total_count: number; paid_count: number; unpaid_count: number;
  overdue_count: number; cancelled_count: number;
}
interface StatusEntry { count: number; amount: number; }
interface MonthEntry  { month: number; invoiced: number; paid: number; count: number; }
interface TopClient   { client_id: number; name: string; company: string | null; total: number; paid: number; outstanding: number; count: number; }
interface RecentPay   { id: number; amount: number; method: string | null; payment_date: string | null; invoice_number: string; client_name: string; }

interface ReportData {
  summary: Summary;
  by_status: Record<string, StatusEntry>;
  monthly: MonthEntry[];
  top_clients: TopClient[];
  recent_payments: RecentPay[];
  year: number;
}

const PKR = (n: number, cur = 'USD') => `${cur} ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export default function ReportsPage() {
  useAdminGuard();
  const [data, setData]       = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied]   = useState(false);
  const [year, setYear]       = useState(new Date().getFullYear());
  const currentYear           = new Date().getFullYear();

  useEffect(() => {
    const isSubUser = getAuthType() === 'user';
    setLoading(true);
    setDenied(false);
    const endpoint = isSubUser ? '/user/reports/invoices' : '/admin/reports/invoices';
    api.get(endpoint, { params: { year } })
      .then(r => setData(r.data.data))
      .catch(err => {
        if (err.response?.status === 403) setDenied(true);
      })
      .finally(() => setLoading(false));
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = data?.summary;

  // Bar chart max for scaling
  const maxMonthly = data ? Math.max(...data.monthly.map(m => m.invoiced), 1) : 1;

  const collectionRate = s && s.total_invoiced > 0
    ? Math.round((s.total_paid / s.total_invoiced) * 100)
    : 0;

  return (
    <DashboardLayout title="Reports">
      <div style={{ maxWidth: 1200 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Invoice Reports</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Financial overview and invoice analytics</p>
          </div>
          {/* Year selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[currentYear - 1, currentYear].map(y => (
              <button key={y} onClick={() => setYear(y)} style={{ padding: '8px 18px', borderRadius: 8, border: `1.5px solid ${year === y ? '#2563eb' : '#e2e8f0'}`, background: year === y ? '#eff6ff' : '#fff', color: year === y ? '#2563eb' : '#64748b', fontWeight: year === y ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
                {y}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>Loading reports…</div>
        ) : denied ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 16, marginBottom: 6 }}>Access Denied</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>You do not have permission to view reports. Ask your administrator to grant you the <strong>View Invoice Reports</strong> permission.</div>
          </div>
        ) : !s ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>Failed to load report data.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Summary Cards ─────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              <StatCard label="Total Invoiced"   value={PKR(s.total_invoiced)}   sub={`${s.total_count} invoices`}      color="#0f172a" />
              <StatCard label="Total Collected"  value={PKR(s.total_paid)}       sub={`${s.paid_count} paid`}           color="#059669" />
              <StatCard label="Outstanding"      value={PKR(s.total_outstanding)} sub={`${s.unpaid_count} unpaid`}      color="#ea580c" />
              <StatCard label="Overdue"          value={String(s.overdue_count)} sub="invoices past due date"           color="#dc2626" />
              <StatCard label="Collection Rate"  value={`${collectionRate}%`}    sub="of invoiced amount collected"     color={collectionRate >= 80 ? '#059669' : collectionRate >= 50 ? '#d97706' : '#dc2626'} />
            </div>

            {/* ── Monthly Trend ─────────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 20 }}>Monthly Trend — {year}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, overflowX: 'auto', paddingBottom: 4 }}>
                {(data?.monthly ?? []).map(m => {
                  const hInv = Math.round((m.invoiced / maxMonthly) * 140);
                  const hPaid = Math.round((m.paid / maxMonthly) * 140);
                  return (
                    <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '1 0 44px', minWidth: 44 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 140 }}>
                        <div title={`Invoiced: ${PKR(m.invoiced)}`} style={{ width: 14, height: hInv || 2, background: '#bfdbfe', borderRadius: '3px 3px 0 0' }} />
                        <div title={`Paid: ${PKR(m.paid)}`}         style={{ width: 14, height: hPaid || 2, background: '#2563eb', borderRadius: '3px 3px 0 0' }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>{MONTHS[m.month - 1]}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}><span style={{ width: 12, height: 12, background: '#bfdbfe', borderRadius: 3, display: 'inline-block' }} /> Invoiced</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}><span style={{ width: 12, height: 12, background: '#2563eb', borderRadius: 3, display: 'inline-block' }} /> Collected</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* ── By Status ─────────────────────────────────────────────────── */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 16 }}>Invoices by Status</div>
                {Object.keys(data?.by_status ?? {}).length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No invoices yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(data?.by_status ?? {}).map(([status, d]) => {
                      const st  = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
                      const pct = s.total_count > 0 ? Math.round((d.count / s.total_count) * 100) : 0;
                      return (
                        <div key={status}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ padding: '2px 8px', borderRadius: 50, fontSize: 11, fontWeight: 600, ...st }}>{st.label}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{d.count} · {PKR(d.amount)}</span>
                          </div>
                          <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: st.color, borderRadius: 3 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Recent Payments ─────────────────────────────────────────────── */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 16 }}>Recent Payments</div>
                {(data?.recent_payments ?? []).length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No payments recorded yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data!.recent_payments.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #f8fafc' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.client_name}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.invoice_number} · {p.method ?? 'cash'} · {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB') : '—'}</div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{PKR(p.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Top Clients ─────────────────────────────────────────────────── */}
            {(data?.top_clients ?? []).length > 0 && (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                  Top Clients by Invoice Amount
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['#', 'Client', 'Invoices', 'Total Invoiced', 'Collected', 'Outstanding'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data!.top_clients.map((c, i) => (
                        <tr key={c.client_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>#{i + 1}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{c.name}</div>
                            {c.company && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.company}</div>}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#475569', fontSize: 13 }}>{c.count}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{PKR(c.total)}</td>
                          <td style={{ padding: '12px 16px', color: '#059669', fontSize: 13 }}>{PKR(c.paid)}</td>
                          <td style={{ padding: '12px 16px', color: c.outstanding > 0 ? '#ea580c' : '#94a3b8', fontWeight: c.outstanding > 0 ? 600 : 400, fontSize: 13 }}>
                            {c.outstanding > 0 ? PKR(c.outstanding) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
