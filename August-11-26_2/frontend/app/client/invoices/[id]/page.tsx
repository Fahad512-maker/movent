'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientService } from '@/lib/services/clientService';

const GREEN = '#10b981';
const SC: Record<string, { bg: string; color: string }> = {
  sent:            { bg: '#eff6ff', color: '#2563eb' },
  overdue:         { bg: '#fef2f2', color: '#dc2626' },
  paid:            { bg: '#ecfdf5', color: '#059669' },
  partially_paid:  { bg: '#fffbeb', color: '#d97706' },
  payment_pending: { bg: '#f5f3ff', color: '#7c3aed' },
  cancelled:       { bg: '#f1f5f9', color: '#64748b' },
};

export default function ClientInvoiceDetailPage() {
  const { id }  = useParams();
  const router  = useRouter();
  const [inv, setInv]         = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientService.invoice(Number(id))
      .then(setInv)
      .catch(() => router.push('/client/invoices'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, color: '#94a3b8' }}>Loading…</div>;
  if (!inv)    return null;

  const sc  = SC[inv.status] || { bg: '#f1f5f9', color: '#64748b' };
  const due = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount));
  const canPay = ['sent', 'overdue', 'partially_paid'].includes(inv.status);

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>←</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Invoice {inv.invoice_number}</h1>
        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 600, textTransform: 'capitalize' }}>
          {inv.status?.replace(/_/g, ' ')}
        </span>
        {canPay && (
          <button
            onClick={() => router.push(`/client/invoices/${id}/pay`)}
            style={{ marginLeft: 'auto', padding: '8px 20px', background: GREEN, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Pay Now
          </button>
        )}
      </div>

      {/* Invoice body */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 32, marginBottom: 16 }}>
        {/* Invoice meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Invoice Number</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{inv.invoice_number}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Issue Date</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{inv.created_at?.split('T')[0]}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Due Date</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: inv.status === 'overdue' ? '#dc2626' : '#1e293b' }}>
              {inv.due_date || '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Currency</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{inv.currency}</div>
          </div>
        </div>

        {/* Bill To */}
        {inv.client && (
          <div style={{ marginBottom: 24, padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>BILL TO</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{inv.client.name}</div>
            {inv.client.company_name && <div style={{ fontSize: 12, color: '#64748b' }}>{inv.client.company_name}</div>}
            {inv.client.email && <div style={{ fontSize: 12, color: '#64748b' }}>{inv.client.email}</div>}
          </div>
        )}

        {/* Line items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Description', 'Qty', 'Unit Price', 'Total'].map(h => (
                <th key={h} style={{
                  padding: '9px 14px', textAlign: h === 'Description' ? 'left' : 'right',
                  fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(inv.items || []).map((item: any) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '11px 14px', fontSize: 13, color: '#1e293b' }}>{item.description}</td>
                <td style={{ padding: '11px 14px', fontSize: 13, color: '#64748b', textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ padding: '11px 14px', fontSize: 13, color: '#64748b', textAlign: 'right' }}>
                  {Number(item.unit_price).toLocaleString()}
                </td>
                <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500, color: '#1e293b', textAlign: 'right' }}>
                  {Number(item.total).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, maxWidth: 280, marginLeft: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Subtotal</span>
            <span style={{ fontSize: 13 }}>{Number(inv.subtotal || 0).toLocaleString()}</span>
          </div>
          {Number(inv.tax_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Tax {inv.tax_rate ? `(${inv.tax_rate}%)` : ''}</span>
              <span style={{ fontSize: 13 }}>{Number(inv.tax_amount).toLocaleString()}</span>
            </div>
          )}
          {Number(inv.discount_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: '#10b981' }}>Discount</span>
              <span style={{ fontSize: 13, color: '#10b981' }}>-{Number(inv.discount_amount).toLocaleString()}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '2px solid #e2e8f0' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
              {inv.currency} {Number(inv.total_amount).toLocaleString()}
            </span>
          </div>
          {Number(inv.paid_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 13, color: GREEN }}>Paid</span>
              <span style={{ fontSize: 13, color: GREEN }}>{inv.currency} {Number(inv.paid_amount).toLocaleString()}</span>
            </div>
          )}
          {due > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '10px 0', borderTop: '1px solid #fee2e2' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>Amount Due</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>{inv.currency} {due.toLocaleString()}</span>
            </div>
          )}
        </div>

        {inv.notes && (
          <div style={{ marginTop: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>NOTES</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{inv.notes}</div>
          </div>
        )}
      </div>

    </div>
  );
}
