'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminSupportService, SupportTicket } from '@/lib/services/adminSupportService';

const SC: Record<string, { bg: string; color: string }> = {
  open:        { bg: '#eff6ff', color: '#2563eb' },
  in_progress: { bg: '#fffbeb', color: '#d97706' },
  resolved:    { bg: '#ecfdf5', color: '#059669' },
  closed:      { bg: '#f1f5f9', color: '#64748b' },
};

const PRIORITY_C: Record<string, string> = {
  low: '#16a34a', medium: '#d97706', high: '#dc2626', urgent: '#7c2d12',
};

const STATUS_OPTS = ['', 'open', 'in_progress', 'resolved', 'closed'];

export default function AdminSupportPage() {
  useModuleGuard('clients');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState('');

  const load = (s: string) => {
    setLoading(true);
    adminSupportService.list(s ? { status: s } : undefined)
      .then(setTickets)
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(''); }, []);

  return (
    <DashboardLayout title="Support Tickets">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Client Support Tickets</h2>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10,
      }}>
        {STATUS_OPTS.map(s => (
          <button key={s} onClick={() => { setStatus(s); load(s); }} style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            border: '1px solid',
            borderColor: status === s ? '#2563eb' : '#e2e8f0',
            background: status === s ? '#eff6ff' : '#fff',
            color: status === s ? '#2563eb' : '#64748b',
            textTransform: 'capitalize',
          }}>{s ? s.replace(/_/g, ' ') : 'All'}</button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No support tickets yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Ticket #', 'Subject', 'Raised By', 'Assigned To', 'Category', 'Priority', 'Status', 'Created'].map(h => (
                  <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
                <th style={{ padding: '10px 18px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const sc = SC[t.status] || { bg: '#f1f5f9', color: '#64748b' };
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>#{t.id}</td>
                    <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{t.subject}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>{t.raisedBy?.name || '—'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>{t.assignedTo?.name || '—'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{t.category}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: PRIORITY_C[t.priority] || '#64748b', textTransform: 'capitalize' }}>{t.priority}</span>
                    </td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500 }}>
                        {t.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>{t.created_at?.split('T')[0]}</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                      <Link href={`/admin/support/${t.id}`} style={{
                        fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none',
                        padding: '4px 12px', border: '1px solid #bfdbfe', borderRadius: 6,
                      }}>View</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}
