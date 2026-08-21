'use client';
import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminLeadService, userLeadService, FollowUp } from '@/lib/services/adminLeadService';
import { getAuthType, can } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  HiCheckCircle, HiXCircle, HiClock, HiPhone,
  HiEnvelope, HiUserGroup, HiChatBubbleLeft, HiCalendarDays,
} from 'react-icons/hi2';

const ICON: Record<string, React.ReactNode> = {
  call: <HiPhone size={14} />, email: <HiEnvelope size={14} />,
  meeting: <HiUserGroup size={14} />, whatsapp: <HiChatBubbleLeft size={14} />,
  demo: <HiUserGroup size={14} />, other: <HiClock size={14} />,
};

const cap   = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
const fmtDT = (d: string) => new Date(d).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  completed: { bg: '#ecfdf5', color: '#059669' },
  missed:    { bg: '#fef2f2', color: '#dc2626' },
  cancelled: { bg: '#f1f5f9', color: '#64748b' },
};

type Filter = 'today' | 'overdue' | 'upcoming';

export default function FollowUpsPage() {
  const router   = useRouter();
  const isAdmin  = getAuthType() === 'admin';

  useEffect(() => {
    if (!isAdmin && !can('sales', 'canViewLeads')) router.replace('/dashboard');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [filter, setFilter]     = useState<Filter>('today');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [counts, setCounts]     = useState({ today: 0, overdue: 0, upcoming: 0 });
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const svc = isAdmin ? adminLeadService : userLeadService;
      const data = await svc.followUpQueue(filter);
      setFollowUps(data.follow_ups);
      setCounts(data.counts);
    } finally { setLoading(false); }
  }, [filter, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: number, action: 'complete' | 'miss' | 'cancel') => {
    const svc = isAdmin ? adminLeadService : userLeadService;
    try {
      if (action === 'complete') await svc.completeFollowUp(id);
      else if (action === 'miss') await svc.missFollowUp(id);
      else await svc.cancelFollowUp(id);
      load();
    } catch { /* ignore */ }
  };

  const leadRoot = isAdmin ? '/admin/leads' : '/leads';

  const TABS: { key: Filter; label: string }[] = [
    { key: 'today',    label: `Today (${counts.today})` },
    { key: 'overdue',  label: `Overdue (${counts.overdue})` },
    { key: 'upcoming', label: `Upcoming (${counts.upcoming})` },
  ];

  return (
    <DashboardLayout title="Follow-ups">
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Follow-up Queue</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Track your scheduled calls, meetings, and emails</p>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: filter === t.key ? '#fff' : 'transparent', color: filter === t.key ? (t.key === 'overdue' ? '#dc2626' : '#0f172a') : '#64748b', fontSize: 13, fontWeight: filter === t.key ? 700 : 500, cursor: 'pointer', boxShadow: filter === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : followUps.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <HiCalendarDays size={32} style={{ color: '#cbd5e1', marginBottom: 8 }} />
              <div style={{ color: '#94a3b8', fontSize: 14 }}>No {filter} follow-ups</div>
            </div>
          ) : followUps.map((fu, idx) => {
            const isOverdue = filter === 'overdue';
            const accentColor = isOverdue ? '#ea580c' : '#2563eb';
            return (
              <div key={fu.id} style={{ padding: '14px 20px', borderBottom: idx < followUps.length - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `${accentColor}12`, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {ICON[fu.type] ?? <HiClock size={14} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{cap(fu.type)}</span>
                    {fu.lead_name && (
                      <button onClick={() => fu.lead_id && router.push(`${leadRoot}/${fu.lead_id}`)}
                        style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
                        {fu.lead_name}
                      </button>
                    )}
                    {fu.assigned_user && <span style={{ fontSize: 11, color: '#64748b' }}>→ {fu.assigned_user.name}</span>}
                    {fu.status !== 'pending' && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'capitalize', ...(STATUS_STYLE[fu.status] ?? STATUS_STYLE.cancelled) }}>
                        {fu.status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: isOverdue ? '#ea580c' : '#64748b', marginTop: 2 }}>{fmtDT(fu.scheduled_at)}</div>
                  {fu.notes && <div style={{ fontSize: 12, color: '#475569', marginTop: 3, fontStyle: 'italic' }}>{fu.notes}</div>}
                </div>
                {fu.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleAction(fu.id, 'complete')}
                      style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <HiCheckCircle size={14} /> Done
                    </button>
                    <button onClick={() => handleAction(fu.id, 'miss')}
                      style={{ padding: '6px 8px', borderRadius: 7, border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <HiXCircle size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
