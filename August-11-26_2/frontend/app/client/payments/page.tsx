'use client';
import { useEffect, useState } from 'react';
import { clientService } from '@/lib/services/clientService';

const SC: Record<string, { bg: string; color: string }> = {
  confirmed:            { bg: '#ecfdf5', color: '#059669' },
  pending_verification: { bg: '#fffbeb', color: '#d97706' },
  failed:               { bg: '#fef2f2', color: '#dc2626' },
};

export default function ClientPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    clientService.payments().then(setPayments).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>Payment History</h1>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : payments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No payments yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Invoice #', 'Date', 'Amount', 'Method', 'Gateway', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((pay: any) => {
                const sc = SC[pay.status] || { bg: '#f1f5f9', color: '#64748b' };
                return (
                  <tr key={pay.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 500, color: '#1e293b' }}>
                      {pay.invoice?.invoice_number || '—'}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#64748b' }}>{pay.payment_date}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                      {pay.invoice?.currency || ''} {Number(pay.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{pay.method}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{pay.gateway || '—'}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500 }}>
                        {pay.status.replace(/_/g, ' ')}
                      </span>
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
