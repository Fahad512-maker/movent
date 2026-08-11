'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { salesTargetService, SalesTarget } from '@/lib/services/salesExtrasService';
import { can } from '@/lib/auth';
import { inp, lbl, card, StatCard } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function SalesTargetsPage() {
  useAdminGuard();
  const router = useRouter();
  const [target, setTarget] = useState<SalesTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetValue, setTargetValue] = useState('');
  const [targetDeals, setTargetDeals] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    salesTargetService.get()
      .then(t => { setTarget(t); setTargetValue(t.target_value != null ? String(t.target_value) : ''); setTargetDeals(t.target_deals != null ? String(t.target_deals) : ''); })
      .catch(() => toast.error('Failed to load targets'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!can('sales', 'canViewSalesTargets')) { router.replace('/dashboard'); return; }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await salesTargetService.update({
        target_value: targetValue ? Number(targetValue) : null,
        target_deals: targetDeals ? Number(targetDeals) : null,
      });
      toast.success('Target updated');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update target');
    } finally { setSaving(false); }
  };

  if (loading || !target) return <DashboardLayout title="Sales Targets"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;

  const valuePct = target.target_value ? Math.min(100, Math.round((target.achieved_value / target.target_value) * 100)) : null;
  const dealsPct = target.target_deals ? Math.min(100, Math.round((target.achieved_deals / target.target_deals) * 100)) : null;

  return (
    <DashboardLayout title="Sales Targets">
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Sales Targets</h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94a3b8' }}>{target.period_start} – {target.period_end}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          <StatCard label="Won Deal Value" value={`$${target.achieved_value.toLocaleString()}`}
            sub={target.target_value ? `of $${target.target_value.toLocaleString()} target (${valuePct}%)` : 'No target set'} color="#059669" />
          <StatCard label="Won Deals" value={String(target.achieved_deals)}
            sub={target.target_deals ? `of ${target.target_deals} target (${dealsPct}%)` : 'No target set'} color="#2563eb" />
        </div>

        {target.target_value != null && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Value Progress</div>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4 }}>
              <div style={{ height: '100%', width: `${valuePct}%`, background: '#059669', borderRadius: 4 }} />
            </div>
          </div>
        )}

        {target.can_update && (
          <form onSubmit={save} style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Set This Month&apos;s Target</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Target Deal Value ($)</label>
                <input type="number" min={0} step="0.01" value={targetValue} onChange={e => setTargetValue(e.target.value)} style={inp} placeholder="e.g. 20000" />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Target Deals (count)</label>
                <input type="number" min={0} value={targetDeals} onChange={e => setTargetDeals(e.target.value)} style={inp} placeholder="e.g. 10" />
              </div>
            </div>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save Target'}
            </button>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
