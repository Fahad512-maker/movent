'use client';
import { useEffect, useState } from 'react';
import { clientService } from '@/lib/services/clientService';

const GREEN = '#10b981';
const SC: Record<string, string> = {
  planning: '#2563eb', active: '#10b981', on_hold: '#d97706', completed: '#16a34a', cancelled: '#dc2626',
};

export default function ClientReportsPage() {
  const [tab, setTab]         = useState<'projects' | 'invoices'>('projects');
  const [projData, setProjData] = useState<any>(null);
  const [invData, setInvData]   = useState<any>(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      clientService.reportProjects(),
      clientService.reportInvoices(),
    ]).then(([p, i]) => { setProjData(p); setInvData(i); }).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>Reports</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
        {(['projects', 'invoices'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            background: 'none', border: 'none',
            color: tab === t ? GREEN : '#64748b',
            borderBottom: tab === t ? `2px solid ${GREEN}` : '2px solid transparent',
            textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
      ) : tab === 'projects' && projData ? (
        <div>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Projects', val: projData.summary?.total || 0 },
              { label: 'Active',         val: projData.summary?.active || 0,    color: '#10b981' },
              { label: 'Completed',      val: projData.summary?.completed || 0, color: '#16a34a' },
              { label: 'On Hold',        val: projData.summary?.on_hold || 0,   color: '#d97706' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '18px 22px', border: '1px solid #e2e8f0', minWidth: 130, flex: 1 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: color || '#1e293b' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Project list */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Project', 'Status', 'Start Date', 'Deadline', 'Completed At'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(projData.projects || []).map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{p.name}</td>
                    <td style={{ padding: '11px 20px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: SC[p.status] || '#64748b', fontWeight: 600 }}>{p.status}</span>
                    </td>
                    <td style={{ padding: '11px 20px', fontSize: 12, color: '#64748b' }}>{p.start_date || '—'}</td>
                    <td style={{ padding: '11px 20px', fontSize: 12, color: '#64748b' }}>{p.deadline || '—'}</td>
                    <td style={{ padding: '11px 20px', fontSize: 12, color: '#64748b' }}>{p.completed_at?.split('T')[0] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'invoices' && invData ? (
        <div>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Invoiced', val: `PKR ${Number(invData.summary?.total_invoiced || 0).toLocaleString()}` },
              { label: 'Total Paid',     val: `PKR ${Number(invData.summary?.total_paid || 0).toLocaleString()}`,   color: '#10b981' },
              { label: 'Pending',        val: `PKR ${Number(invData.summary?.total_pending || 0).toLocaleString()}`, color: '#dc2626' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '18px 22px', border: '1px solid #e2e8f0', flex: 1 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: color || '#1e293b' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Monthly breakdown */}
          {(invData.monthly || []).length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 14 }}>Monthly Breakdown</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 100 }}>
                {(invData.monthly || []).map((m: any) => {
                  const maxVal = Math.max(...(invData.monthly || []).map((x: any) => x.total || 1));
                  const h = Math.round(((m.total || 0) / maxVal) * 80);
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', height: h, background: GREEN, borderRadius: '4px 4px 0 0', minHeight: 4 }} title={`PKR ${Number(m.total).toLocaleString()}`} />
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{m.month?.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Invoice list */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Invoice #', 'Date', 'Amount', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(invData.list || []).map((inv: any) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{inv.invoice_number}</td>
                    <td style={{ padding: '11px 20px', fontSize: 12, color: '#64748b' }}>{inv.created_at?.split('T')[0]}</td>
                    <td style={{ padding: '11px 20px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                      {inv.currency} {Number(inv.total_amount).toLocaleString()}
                    </td>
                    <td style={{ padding: '11px 20px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#64748b' }}>{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
