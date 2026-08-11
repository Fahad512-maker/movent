'use client';
import { useEffect, useState } from 'react';
import { clientService } from '@/lib/services/clientService';
import Link from 'next/link';

const SC: Record<string, { bg: string; color: string }> = {
  open:        { bg: '#eff6ff', color: '#2563eb' },
  in_progress: { bg: '#fffbeb', color: '#d97706' },
  resolved:    { bg: '#ecfdf5', color: '#059669' },
  closed:      { bg: '#f1f5f9', color: '#64748b' },
};

const PRIORITY_C: Record<string, string> = {
  low: '#16a34a', medium: '#d97706', high: '#dc2626', urgent: '#7c2d12',
};

export default function ClientSupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientService.support().then(setTickets).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Support Tickets</h1>
        <Link href="/client/support/create" style={{
          padding: '8px 18px', background: '#10b981', color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>+ Raise Ticket</Link>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            No tickets yet. <Link href="/client/support/create" style={{ color: '#10b981' }}>Raise one</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Ticket #', 'Subject', 'Category', 'Priority', 'Status', 'Created'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
                <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t: any) => {
                const sc = SC[t.status] || { bg: '#f1f5f9', color: '#64748b' };
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>#{t.id}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 500, color: '#1e293b', maxWidth: 200 }}>{t.subject}</td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{t.category}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: PRIORITY_C[t.priority] || '#64748b', textTransform: 'capitalize' }}>{t.priority}</span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500 }}>
                        {t.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 12, color: '#64748b' }}>{t.created_at?.split('T')[0]}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <Link href={`/client/support/${t.id}`} style={{
                        fontSize: 12, color: '#10b981', fontWeight: 600, textDecoration: 'none',
                        padding: '4px 12px', border: '1px solid #a7f3d0', borderRadius: 6,
                      }}>View</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
