'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';

type ReturnState = 'checking' | 'paid' | 'processing' | 'error';

const GATEWAY_LABEL: Record<string, string> = {
  stripe: 'Stripe', paypal: 'PayPal', authorize_net: 'Authorize.net',
};

// Same visual language as the main pay page (frontend/app/pay/invoice/[token]/page.tsx) —
// this is just where the customer lands back from the gateway's hosted page.
const wrap: React.CSSProperties  = { minHeight: '100vh', background: '#f1f5f9', padding: '36px 16px 72px', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const card: React.CSSProperties  = {
  background: '#fff', borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,.07), 0 1px 8px rgba(0,0,0,.04)',
  border: '1px solid #e2e8f0', textAlign: 'center', padding: '56px 40px', maxWidth: 460, width: '100%',
};

export default function GatewayReturnPage() {
  const params = useParams<{ token: string; gateway: string }>();
  const router = useRouter();
  const token    = params.token ?? '';
  const gateway  = params.gateway ?? '';

  const [state, setState] = useState<ReturnState>('checking');

  useEffect(() => {
    if (!token || !gateway) { setState('error'); return; }
    const base = process.env.NEXT_PUBLIC_API_URL ?? '';
    const query = typeof window !== 'undefined' ? window.location.search : '';

    let attempts = 0;
    const check = () => {
      axios.get(`${base}/public/invoices/${token}/return/${gateway}${query}`)
        .then(res => {
          const status = res.data?.data?.status;
          if (status === 'paid' || status === 'partially_paid') { setState('paid'); return; }
          // The webhook can take a few seconds to arrive — retry briefly
          // before falling back to a "we'll email you" message.
          attempts += 1;
          if (attempts < 4) { setTimeout(check, 1500); return; }
          setState('processing');
        })
        .catch(() => setState('error'));
    };
    check();
  }, [token, gateway]); // eslint-disable-line react-hooks/exhaustive-deps

  const gatewayLabel = GATEWAY_LABEL[gateway] ?? gateway;

  if (state === 'checking') return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 38, marginBottom: 14 }}>⏳</div>
        <p style={{ margin: 0, fontSize: 15, color: '#64748b' }}>Confirming your {gatewayLabel} payment…</p>
      </div>
    </div>
  );

  if (state === 'paid') return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', border: '3px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>✅</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#16a34a' }}>Payment Successful</h2>
        <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          Thank you — your payment via {gatewayLabel} was confirmed. A receipt has been sent to your email.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/pay/invoice/${token}`)}
          style={{ padding: '12px 24px', borderRadius: 9, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          View Invoice
        </button>
      </div>
    </div>
  );

  if (state === 'processing') return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>⏳</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#a16207' }}>Almost There</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          Your {gatewayLabel} payment is being confirmed. This can take a minute — you&apos;ll receive an email receipt as soon as it&apos;s done.
        </p>
      </div>
    </div>
  );

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ margin: '0 0 10px', fontSize: 20, color: '#1e293b' }}>Could Not Confirm Payment</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          Something went wrong checking your payment status.<br />If you were charged, you&apos;ll still receive a confirmation email shortly.
        </p>
      </div>
    </div>
  );
}
