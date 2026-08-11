'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';

interface CompanyRow {
  id: number; name: string; is_active: boolean;
  clients_count: number;
  portal_clients_count: number;
  active_staff_count: number;
}
interface PaymentRow {
  id: number; amount: number; currency: string; gateway: string | null;
  status: string; label: string; created_at: string | null;
}
interface Usage {
  package: {
    name: string; tier: string;
    max_companies: number | null;
    max_users_per_company: number | null;
  } | null;
  subscription: {
    status: string;
    trial_ends_at: string | null;
    subscription_ends_at: string | null;
  };
  staff_seats_used: number;
  staff_seats_limit: number | null;
  staff_seats_remaining: number | null;
  companies_used: number;
  companies_max: number | null;
  can_add_company: boolean;
  companies: CompanyRow[];
  payments_total_paid: number;
  payments: PaymentRow[];
}

const PAYMENT_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  paid:     { bg: '#ecfdf5', color: '#059669' },
  failed:   { bg: '#fef2f2', color: '#dc2626' },
  refunded: { bg: '#f1f5f9', color: '#64748b' },
};

const TIER_BADGE: Record<string, { bg: string; color: string }> = {
  basic:        { bg: '#f1f5f9', color: '#475569' },
  professional: { bg: '#eff6ff', color: '#2563eb' },
  enterprise:   { bg: '#faf5ff', color: '#7c3aed' },
  custom:       { bg: '#fdf4ff', color: '#a21caf' },
};
const SUB_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  active:          { bg: '#ecfdf5', color: '#059669', label: 'Active' },
  trial:           { bg: '#fffbeb', color: '#d97706', label: 'Trial' },
  suspended:       { bg: '#fef2f2', color: '#dc2626', label: 'Suspended' },
  cancelled:       { bg: '#f1f5f9', color: '#64748b', label: 'Cancelled' },
  pending_payment: { bg: '#fff7ed', color: '#ea580c', label: 'Pending Payment' },
};

function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  if (!limit) return <span style={{ fontSize: 11, color: '#94a3b8' }}>Unlimited</span>;
  const pct   = Math.min(Math.round((used / limit) * 100), 100);
  const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#2563eb';
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
      <div style={{ fontSize: 10, color, marginTop: 3, fontWeight: 600 }}>{pct}% used</div>
    </div>
  );
}

export default function PlanPage() {
  const [usage,   setUsage]   = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/usage')
      .then(r => setUsage(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pkg  = usage?.package;
  const sub  = usage?.subscription;
  const tier = TIER_BADGE[pkg?.tier ?? ''] ?? { bg: '#f1f5f9', color: '#64748b' };
  const subB = SUB_BADGE[sub?.status ?? ''] ?? { bg: '#f1f5f9', color: '#64748b', label: sub?.status ?? '—' };

  const totalClients       = usage?.companies.reduce((s, c) => s + c.clients_count, 0) ?? 0;
  const totalPortalClients = usage?.companies.reduce((s, c) => s + c.portal_clients_count, 0) ?? 0;
  const companiesCreated   = usage?.companies_used ?? 0;

  // Note: pkg.max_users_per_company (used per-row below via `maxU`) is a
  // PER-COMPANY cap on client-portal logins — distinct from staff_seats_*
  // above, which is an ORG-WIDE cap on staff/team members, even though both
  // reuse the same underlying package/admin-override numeric value.

  return (
    <DashboardLayout title="My Plan">

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>My Plan</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '3px 0 0' }}>Your plan usage at a glance</p>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      ) : (
        <>
          <div style={{
            background: '#1e293b', borderRadius: 14, padding: '18px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 20, flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>Active Plan</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 2 }}>
                  {pkg?.name ?? 'No Package'}
                </div>
              </div>
              <span style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600,
                background: tier.bg, color: tier.color, textTransform: 'capitalize',
              }}>{pkg?.tier ?? '—'}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <span style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 20, fontWeight: 600,
                background: subB.bg, color: subB.color,
              }}>{subB.label}</span>

              {sub?.trial_ends_at && !sub?.subscription_ends_at && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>Trial ends</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>{sub.trial_ends_at}</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Companies
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Purchased</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>
                    {usage?.companies_max ?? '∞'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Created</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                    {companiesCreated}
                  </div>
                </div>
              </div>
              <UsageBar used={companiesCreated} limit={usage?.companies_max ?? null} />
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Staff Seats
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Purchased</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>
                    {usage?.staff_seats_limit ?? '∞'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Used</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                    {usage?.staff_seats_used ?? 0}
                  </div>
                </div>
              </div>
              <UsageBar used={usage?.staff_seats_used ?? 0} limit={usage?.staff_seats_limit ?? null} />
              {usage?.staff_seats_remaining !== null && usage?.staff_seats_remaining !== undefined && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                  {usage.staff_seats_remaining} seat{usage.staff_seats_remaining === 1 ? '' : 's'} remaining
                </div>
              )}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Total Clients
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>All Records</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                    {totalClients}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Portal Active</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', lineHeight: 1 }}>
                    {totalPortalClients}
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: (usage?.companies_max != null && (usage.companies_max - companiesCreated) === 0)
                ? '#fef2f2' : '#f0fdf4',
              borderRadius: 12,
              border: `1px solid ${(usage?.companies_max != null && (usage.companies_max - companiesCreated) === 0) ? '#fecaca' : '#bbf7d0'}`,
              padding: '20px 22px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Company Slots
              </div>
              <div style={{
                fontSize: 42, fontWeight: 900, lineHeight: 1,
                color: (usage?.companies_max != null && (usage.companies_max - companiesCreated) === 0)
                  ? '#dc2626' : '#16a34a',
              }}>
                {usage?.companies_max != null
                  ? Math.max(usage.companies_max - companiesCreated, 0)
                  : '∞'}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                {usage?.companies_max != null && (usage.companies_max - companiesCreated) === 0
                  ? 'No slots left — upgrade to add more'
                  : 'slots remaining'}
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{
              padding: '16px 22px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                My Companies
              </h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {usage?.can_add_company && (
                  <Link href="/admin/companies/create" style={{
                    fontSize: 12, color: '#fff', fontWeight: 600, textDecoration: 'none',
                    padding: '5px 12px', background: '#2563eb', borderRadius: 6,
                  }}>
                    + Add Company
                  </Link>
                )}
                <Link href="/admin/upgrade-seats?type=seats" style={{
                  fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none',
                  padding: '5px 12px', border: '1px solid #bfdbfe', borderRadius: 6,
                }}>
                  Upgrade Seats →
                </Link>
                <Link href="/admin/upgrade-seats?type=companies" style={{
                  fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none',
                  padding: '5px 12px', border: '1px solid #bfdbfe', borderRadius: 6,
                }}>
                  Upgrade Company Slots →
                </Link>
                <Link href="/admin/upgrade-modules" style={{
                  fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none',
                  padding: '5px 12px', border: '1px solid #bfdbfe', borderRadius: 6,
                }}>
                  Upgrade Modules →
                </Link>
                <Link href="/admin/users" style={{
                  fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none',
                  padding: '5px 12px', border: '1px solid #bfdbfe', borderRadius: 6,
                }}>
                  Manage Staff →
                </Link>
                <Link href="/admin/clients" style={{
                  fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none',
                  padding: '5px 12px', border: '1px solid #bfdbfe', borderRadius: 6,
                }}>
                  Manage Clients →
                </Link>
              </div>
            </div>

            {!usage?.companies.length ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No companies yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Company', 'Status', 'Staff Users', 'Portal Seat Limit', 'Total Clients', 'Portal Active', 'Portal Seat Usage', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: '10px 20px', textAlign: 'left', fontSize: 11,
                        fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usage?.companies.map(c => {
                    const maxU = pkg?.max_users_per_company ?? null;
                    const pct  = maxU ? Math.min(Math.round((c.portal_clients_count / maxU) * 100), 100) : 0;
                    const bc   = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#059669';
                    const remaining = maxU != null ? Math.max(maxU - c.portal_clients_count, 0) : null;
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.name}</div>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                            background: c.is_active ? '#ecfdf5' : '#f1f5f9',
                            color: c.is_active ? '#059669' : '#94a3b8',
                          }}>{c.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
                            {c.active_staff_count}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>
                            {maxU ?? '∞'}
                          </span>
                          {remaining !== null && (
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                              {remaining} remaining
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                            {c.clients_count}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>
                            {c.portal_clients_count}
                          </span>
                          {maxU && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}> / {maxU}</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', minWidth: 160 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: maxU ? `${pct}%` : '0%', background: bc, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, color: bc, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {maxU ? `${pct}%` : '—'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <Link href={`/admin/companies/${c.id}/edit`} style={{
                            padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                            background: '#2563eb', color: '#fff', textDecoration: 'none',
                          }}>Edit</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: 20 }}>
            <div style={{
              padding: '16px 22px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                Payment History
              </h3>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>Total Paid</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>
                  ${Number(usage?.payments_total_paid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {!usage?.payments.length ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No payments made yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Date', 'Description', 'Gateway', 'Amount', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '10px 20px', textAlign: 'left', fontSize: 11,
                        fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usage.payments.map(p => {
                    const sb = PAYMENT_STATUS_BADGE[p.status] ?? { bg: '#f1f5f9', color: '#64748b' };
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 20px', fontSize: 12, color: '#64748b' }}>
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.label}</td>
                        <td style={{ padding: '12px 20px', fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{p.gateway?.replace('_', ' ') ?? '—'}</td>
                        <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                          {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {p.currency}
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                            background: sb.bg, color: sb.color, textTransform: 'capitalize',
                          }}>{p.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
