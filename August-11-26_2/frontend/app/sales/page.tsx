'use client';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userLeadService, SalesDashboard } from '@/lib/services/adminLeadService';
import { can } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  HiUserGroup, HiCheckCircle, HiXCircle, HiArrowPath,
  HiCurrencyDollar, HiCalendarDays, HiExclamationCircle,
  HiSparkles, HiPhone, HiBriefcase, HiChartBar,
} from 'react-icons/hi2';

// Mirrors frontend/app/admin/sales/page.tsx exactly (same data shape from
// Api\User\SalesDashboardController), scoped to routes/nav the sub-user
// portal actually has (/leads/pipeline, /leads/follow-ups).

const PKR    = (n: number) => '$' + (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STAGE_COLOR: Record<string, string> = {
  new: '#2563eb', contacted: '#16a34a', qualified: '#7c3aed',
  proposal: '#ea580c', negotiation: '#d97706',
};

const StatCard = ({
  icon, label, value, sub, color, onClick,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color: string; onClick?: () => void;
}) => (
  <div onClick={onClick} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{sub}</div>}
    </div>
  </div>
);

export default function UserSalesDashboardPage() {
  useAdminGuard();
  const router = useRouter();
  const [data, setData]       = useState<SalesDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear]       = useState(new Date().getFullYear());

  useEffect(() => {
    if (!can('sales', 'canViewSalesDashboard') && !can('sales', 'canViewLeads')) {
      router.replace('/dashboard');
      return;
    }
    setLoading(true);
    userLeadService.salesDashboard(year).then(setData).finally(() => setLoading(false));
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data) return <DashboardLayout title="Sales Dashboard"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;

  const { summary, monthly, by_stage, sellers } = data;
  const maxMonthly = Math.max(...monthly.map(m => m.total), 1);
  const winRate    = summary.total > 0 ? Math.round((summary.won / summary.total) * 100) : 0;

  return (
    <DashboardLayout title="Sales Dashboard">
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Sales Dashboard</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Overview of your sales funnel and performance</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, color: '#0f172a', cursor: 'pointer' }}>
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => router.push('/leads/pipeline')}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              View Pipeline →
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Pipeline Funnel</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <StatCard icon={<HiUserGroup size={20} />}  label="Total Leads"     value={summary.total}      color="#2563eb" />
            <StatCard icon={<HiSparkles size={20} />}   label="New Leads"       value={summary.new}        color="#7c3aed" />
            <StatCard icon={<HiPhone size={20} />}      label="Contacted"       value={summary.contacted}  color="#16a34a" />
            <StatCard icon={<HiBriefcase size={20} />}  label="Qualified"       value={summary.qualified}  color="#0891b2" />
            <StatCard icon={<HiCheckCircle size={20} />} label="Won"            value={summary.won}        sub={PKR(summary.won_value)} color="#059669" />
            <StatCard icon={<HiXCircle size={20} />}    label="Lost"            value={summary.lost}       color="#dc2626" />
            <StatCard icon={<HiArrowPath size={20} />}  label="Converted to Clients" value={summary.converted} color="#7c3aed" />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Deal Value & Follow-ups</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <StatCard icon={<HiCurrencyDollar size={20} />} label="Open Pipeline Value"  value={PKR(summary.pipeline_value)} sub={`${summary.open_deals} open deals`} color="#d97706" />
            <StatCard icon={<HiCurrencyDollar size={20} />} label="Won Deal Value"        value={PKR(summary.won_value)}      sub={`${winRate}% win rate`}             color="#059669" />
            <StatCard icon={<HiCalendarDays size={20} />}   label="Follow-ups Due Today"  value={summary.today_followups}    color="#0891b2"
              onClick={() => router.push('/leads/follow-ups')} />
            <StatCard icon={<HiExclamationCircle size={20} />} label="Overdue Follow-ups" value={summary.overdue_followups}  color="#ea580c"
              onClick={() => router.push('/leads/follow-ups')} />
            <StatCard icon={<HiChartBar size={20} />}       label="Win Rate"              value={`${winRate}%`}              sub={`${summary.won} of ${summary.total} leads`} color="#7c3aed" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Monthly Leads — {year}</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 120 }}>
              {monthly.map(m => {
                const h    = Math.round((m.total / maxMonthly) * 100);
                const wonH = m.total > 0 ? Math.round((m.won / m.total) * h) : 0;
                return (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 100 }}>
                      <div style={{ width: '100%', height: wonH, background: '#059669', borderRadius: wonH === h ? '4px 4px 0 0' : 0, minHeight: wonH > 0 ? 2 : 0 }} />
                      <div style={{ width: '100%', height: h - wonH, background: '#2563eb', borderRadius: h > 0 && wonH === 0 ? '4px 4px 0 0' : '4px 4px 0 0', minHeight: h > 0 ? 2 : 0 }} />
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>{MONTHS[m.month - 1]}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 16 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#2563eb', display: 'inline-block' }} />Total</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#059669', display: 'inline-block' }} />Won</span>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Open Pipeline by Stage</h3>
            {Object.entries(by_stage).length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 20 }}>No open deals</div>
            ) : (
              Object.entries(by_stage).map(([stage, info]) => {
                const color = STAGE_COLOR[stage] ?? '#64748b';
                const label = stage.charAt(0).toUpperCase() + stage.slice(1);
                return (
                  <div key={stage} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{info.count} · {PKR(info.value)}</span>
                    </div>
                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (info.count / (summary.open_deals || 1)) * 100)}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Only meaningful when the Seller has canViewAllCompanyLeads — with
            own-scope only, this naturally shows just their own row. */}
        {sellers.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Seller Performance</h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Year {year}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Seller', 'Total', 'Open', 'Won', 'Lost', 'Win Rate', 'Won Value'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sellers.map((s, idx) => {
                  const wr = s.total > 0 ? Math.round((s.won / s.total) * 100) : 0;
                  return (
                    <tr key={s.id ?? idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{s.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{s.total}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#2563eb' }}>{s.open}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#059669' }}>{s.won}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>{s.lost}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ height: 4, width: 60, background: '#f1f5f9', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${wr}%`, background: wr >= 50 ? '#059669' : wr >= 25 ? '#d97706' : '#dc2626', borderRadius: 2 }} />
                          </div>
                          <span style={{ color: '#64748b' }}>{wr}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#059669' }}>{PKR(s.won_value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
