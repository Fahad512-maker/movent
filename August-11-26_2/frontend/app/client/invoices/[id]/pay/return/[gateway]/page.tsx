'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientService } from '@/lib/services/clientService';

type ReturnState = 'checking' | 'paid' | 'processing' | 'error';

const GREEN = '#10b981';

const GATEWAY_LABEL: Record<string, string> = {
  stripe: 'Stripe', paypal: 'PayPal', authorize_net: 'Authorize.net',
};

export default function ClientGatewayReturnPage() {
  const { id, gateway } = useParams<{ id: string; gateway: string }>();
  const router    = useRouter();
  const invoiceId = Number(id);

  const [state, setState] = useState<ReturnState>('checking');

  useEffect(() => {
    if (!invoiceId || !gateway) { setState('error'); return; }
    const query = typeof window !== 'undefined' ? window.location.search : '';

    let attempts = 0;
    const check = () => {
      clientService.gatewayReturnStatus(invoiceId, gateway, query)
        .then(res => {
          if (res.status === 'paid' || res.status === 'partially_paid') { setState('paid'); return; }
          attempts += 1;
          if (attempts < 4) { setTimeout(check, 1500); return; }
          setState('processing');
        })
        .catch(() => setState('error'));
    };
    check();
  }, [invoiceId, gateway]); // eslint-disable-line react-hooks/exhaustive-deps

  const gatewayLabel = GATEWAY_LABEL[gateway] ?? gateway;

  const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '48px 36px', textAlign: 'center' };

  if (state === 'checking') return (
    <div style={{ maxWidth: 480 }}><div style={card}>
      <div style={{ fontSize: 34, marginBottom: 14 }}>⏳</div>
      <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>Confirming your {gatewayLabel} payment…</p>
    </div></div>
  );

  if (state === 'paid') return (
    <div style={{ maxWidth: 480 }}><div style={{ ...card, background: '#f0fdf4', border: '1.5px solid #86efac' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', border: '3px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 28 }}>✅</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#15803d' }}>Payment Successful</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#166534' }}>Your payment via {gatewayLabel} was confirmed. A receipt has been sent to your email.</p>
      <button
        onClick={() => router.push(`/client/invoices/${invoiceId}`)}
        style={{ width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', background: GREEN, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        Back to Invoice
      </button>
    </div></div>
  );

  if (state === 'processing') return (
    <div style={{ maxWidth: 480 }}><div style={{ ...card, background: '#fffbeb', border: '1.5px solid #fde68a' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 26 }}>⏳</div>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#92400e' }}>Almost There</h2>
      <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
        Your {gatewayLabel} payment is being confirmed — this can take a minute. You&apos;ll get an email receipt once it&apos;s done.
      </p>
    </div></div>
  );

  return (
    <div style={{ maxWidth: 480 }}><div style={card}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#1e293b' }}>Could Not Confirm Payment</h2>
      <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
        Something went wrong checking your payment status. If you were charged, you&apos;ll still receive a confirmation email shortly.
      </p>
    </div></div>
  );
}
