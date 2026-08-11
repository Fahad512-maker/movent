'use client';
import { useEffect, useState } from 'react';
import { clientService } from '@/lib/services/clientService';
import Link from 'next/link';

const SC: Record<string, { bg: string; color: string }> = {
  sent:           { bg: '#eff6ff', color: '#2563eb' },
  overdue:        { bg: '#fef2f2', color: '#dc2626' },
  paid:           { bg: '#ecfdf5', color: '#059669' },
  partially_paid: { bg: '#fffbeb', color: '#d97706' },
  cancelled:      { bg: '#f1f5f9', color: '#64748b' },
};

const STATUS_OPTS = ['', 'sent', 'paid', 'overdue', 'partially_paid'];

export default function ClientInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [status, setStatus]     = useState('');
  const [loading, setLoading]   = useState(true);

  const load = (s: string) => {
    setLoading(true);
    clientService.invoices(s ? { status: s } : undefined)
      .then(setInvoices)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(''); }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>Invoices</h1>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
          {STATUS_OPTS.map(s => (
            <button key={s} onClick={() => { setStatus(s); load(s); }} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid',
              borderColor: status === s ? '#10b981' : '#e2e8f0',
              background: status === s ? '#ecfdf5' : '#fff',
              color: status === s ? '#10b981' : '#64748b',
            }}>{s || 'All'}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No invoices found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Invoice #', 'Date', 'Due Date', 'Amount', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
                <th style={{ padding: '10px 20px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: any) => {
                const sc = SC[inv.status] || { bg: '#f1f5f9', color: '#64748b' };
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{inv.invoice_number}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#64748b' }}>{inv.created_at?.split('T')[0]}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#64748b' }}>{inv.due_date || '—'}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                      {inv.currency} {Number(inv.total_amount).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500 }}>{inv.status}</span>
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <Link href={`/client/invoices/${inv.id}`} style={{
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
