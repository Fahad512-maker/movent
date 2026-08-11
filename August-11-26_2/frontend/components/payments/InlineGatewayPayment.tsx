'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';

// Same inline card-collection pattern as frontend/app/payment/page.tsx
// (signup/subscription payment) — Stripe Elements, PayPal Buttons SDK, and
// Authorize.net Accept.js, all charged synchronously with no redirect and no
// webhook involved. That page is never imported from here; this component is
// a parameterized port of its approach so it can point at invoice-scoped
// endpoints (company-level gateway credentials, invoice-derived amount)
// instead of the platform-level subscription endpoints.
declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: {
        style?: object;
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError?: (err: unknown) => void;
        onCancel?: () => void;
      }) => { render: (selector: string) => void };
    };
    Accept?: {
      dispatchData: (
        secureData: {
          authData: { apiLoginID: string; clientKey: string };
          cardData: { cardNumber: string; month: string; year: string; cardCode: string };
        },
        callback: (response: AcceptJsResponse) => void,
      ) => void;
    };
  }
}

interface AcceptJsResponse {
  messages: { resultCode: 'Ok' | 'Error'; message: Array<{ code: string; text: string }> };
  opaqueData: { dataDescriptor: string; dataValue: string };
}

interface GatewayInitData {
  publishable_key?: string;
  client_id?: string;
  api_login_id?: string;
  client_key?: string;
  mode?: string;
}

export interface InlineGatewayPaymentHandle {
  submit: () => Promise<void>;
}

export interface InlineGatewayPaymentProps {
  gateway: 'stripe' | 'paypal' | 'authorize_net';
  apiClient: AxiosInstance;
  initUrl: string;
  createOrderUrl?: string;
  chargeUrl: string;
  // Which specific company gateway account (not just gateway type) to
  // charge — required once a tenant can hold more than one account of the
  // same type. Omit/null for callers still on the legacy single-account
  // resolution (backend falls back to the type's default account).
  companyGatewayId?: number | null;
  currency: string;
  disabled?: boolean;
  onProcessingChange?: (processing: boolean) => void;
  onSuccess: (result: { gateway_ref: string; receipt_number?: string }) => void;
  onError: (message: string) => void;
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box', color: '#0f172a',
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 };
const spinner = (
  <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #94a3b8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
);

const InlineGatewayPayment = forwardRef<InlineGatewayPaymentHandle, InlineGatewayPaymentProps>(function InlineGatewayPayment(
  { gateway, apiClient, initUrl, createOrderUrl, chargeUrl, companyGatewayId, currency, disabled, onProcessingChange, onSuccess, onError },
  ref,
) {
  const [initData, setInitData]       = useState<GatewayInitData | null>(null);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError]     = useState('');

  const stripeRef     = useRef<Stripe | null>(null);
  const stripeCardRef = useRef<StripeCardElement | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  const [cardNumber, setCardNumber]     = useState('');
  const [cardExpiry, setCardExpiry]     = useState('');
  const [cardCvc, setCardCvc]           = useState('');
  const [acceptJsReady, setAcceptJsReady] = useState(false);

  const setProcessing = (v: boolean) => onProcessingChange?.(v);

  // ── Fetch public gateway init data whenever the gateway changes ──────────
  useEffect(() => {
    setInitData(null);
    setInitLoading(true);
    setInitError('');
    setStripeReady(false);
    apiClient.get(initUrl)
      .then(res => setInitData(res.data.data))
      .catch((err: unknown) => {
        const ex = err as { response?: { data?: { message?: string } } };
        setInitError(ex.response?.data?.message ?? 'Failed to load this payment method. Please try again or choose another.');
      })
      .finally(() => setInitLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, initUrl]);

  // ── Mount Stripe card element ─────────────────────────────────────────────
  useEffect(() => {
    if (gateway !== 'stripe' || !initData) return;
    if (!initData.publishable_key) { onError('Stripe is not fully configured for this company.'); return; }

    let cancelled = false;
    (async () => {
      try {
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(initData.publishable_key!);
        if (cancelled || !stripe) return;

        stripeRef.current = stripe;
        const elements = stripe.elements();
        const cardEl = elements.create('card', {
          // Same as app/payment/page.tsx — no billing-address collection
          // anywhere on this form, so hide Stripe's default ZIP/postal field.
          hidePostalCode: true,
          style: {
            base: { fontSize: '15px', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', '::placeholder': { color: '#94a3b8' } },
            invalid: { color: '#dc2626' },
          },
        });
        cardEl.mount('#invoice-stripe-card-element');
        stripeCardRef.current = cardEl;
        if (!cancelled) setStripeReady(true);
      } catch {
        if (!cancelled) onError('Failed to load Stripe. Please refresh and try again.');
      }
    })();

    return () => {
      cancelled = true;
      if (stripeCardRef.current) { stripeCardRef.current.destroy(); stripeCardRef.current = null; }
      stripeRef.current = null;
      setStripeReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, initData?.publishable_key]);

  // ── Load PayPal SDK and render Buttons (in-page approval, no navigation) ──
  useEffect(() => {
    if (gateway !== 'paypal' || !initData?.client_id || !createOrderUrl) return;

    const renderButtons = () => {
      const container = document.getElementById('invoice-paypal-button-container');
      if (!container || !window.paypal) return;
      container.innerHTML = '';

      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        createOrder: async () => {
          try {
            const res = await apiClient.post(createOrderUrl, { company_gateway_id: companyGatewayId });
            return res.data.data.order_id;
          } catch (err: unknown) {
            const ex = err as { response?: { data?: { message?: string } } };
            const msg = ex.response?.data?.message ?? 'Failed to start PayPal payment. Please try again.';
            onError(msg);
            throw new Error(msg);
          }
        },
        onApprove: async (data) => {
          setProcessing(true);
          try {
            const res = await apiClient.post(chargeUrl, { paypal_order_id: data.orderID, company_gateway_id: companyGatewayId });
            onSuccess(res.data.data);
          } catch (err: unknown) {
            const ex = err as { response?: { data?: { message?: string } } };
            onError(ex.response?.data?.message ?? 'Payment failed. Please try again or choose another payment method.');
          } finally {
            setProcessing(false);
          }
        },
        onError: () => onError('PayPal payment could not be completed. Please try again.'),
        onCancel: () => {},
      }).render('#invoice-paypal-button-container');
    };

    if (window.paypal) {
      renderButtons();
    } else {
      const existing = document.querySelector('script[data-paypal-sdk-invoice]');
      if (existing) existing.remove();
      delete window.paypal;

      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${initData.client_id}&currency=${encodeURIComponent(currency || 'USD')}`;
      script.setAttribute('data-paypal-sdk-invoice', '1');
      script.onload = renderButtons;
      script.onerror = () => onError('Failed to load PayPal. Please check your internet connection.');
      document.body.appendChild(script);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, initData?.client_id, createOrderUrl, currency, companyGatewayId]);

  // ── Load Accept.js for Authorize.net ──────────────────────────────────────
  useEffect(() => {
    if (gateway !== 'authorize_net' || !initData) return;
    setAcceptJsReady(false);

    const mode = initData.mode ?? 'sandbox';
    const src = mode === 'live' ? 'https://js.authorize.net/v1/Accept.js' : 'https://jstest.authorize.net/v1/Accept.js';

    if (window.Accept) { setAcceptJsReady(true); return; }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => setAcceptJsReady(true));
      existing.addEventListener('error', () => onError('Payment form could not be loaded. Please try again.'));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload  = () => setAcceptJsReady(true);
    script.onerror = () => onError('Payment form could not be loaded. Please try again.');
    document.body.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, initData?.mode]);

  // ── Imperative submit — used by the page's own "Pay Now" button for
  // stripe/authorize_net (PayPal completes via its own in-page button above) ──
  useImperativeHandle(ref, () => ({
    submit: async () => {
      if (gateway === 'stripe') {
        if (!stripeRef.current || !stripeCardRef.current) {
          onError('Card form not ready. Please wait a moment and try again.');
          return;
        }
        setProcessing(true);
        try {
          const { paymentMethod, error: pmError } = await stripeRef.current.createPaymentMethod({
            type: 'card', card: stripeCardRef.current,
          });
          if (pmError) { onError(pmError.message ?? 'Invalid card details'); return; }
          const res = await apiClient.post(chargeUrl, { payment_method_id: paymentMethod!.id, company_gateway_id: companyGatewayId });
          onSuccess(res.data.data);
        } catch (err: unknown) {
          const ex = err as { response?: { data?: { message?: string } } };
          onError(ex.response?.data?.message ?? 'Payment failed. Please try again or choose another payment method.');
        } finally {
          setProcessing(false);
        }
        return;
      }

      if (gateway === 'authorize_net') {
        if (!initData?.api_login_id || !initData?.client_key) {
          onError('Authorize.Net is not configured properly for this company.');
          return;
        }
        if (!cardNumber || !cardExpiry || !cardCvc) { onError('Please fill in all card details.'); return; }
        if (!acceptJsReady || !window.Accept) { onError('Payment form could not be loaded. Please try again.'); return; }

        const [rawMonth, rawYear] = cardExpiry.split('/');
        const expMonth = rawMonth?.trim().padStart(2, '0') ?? '';
        const expYear  = rawYear?.trim().length === 2 ? `20${rawYear.trim()}` : rawYear?.trim() ?? '';

        setProcessing(true);
        window.Accept.dispatchData(
          {
            authData: { apiLoginID: initData.api_login_id ?? '', clientKey: initData.client_key ?? '' },
            cardData: { cardNumber: cardNumber.replace(/\s/g, ''), month: expMonth, year: expYear, cardCode: cardCvc },
          },
          async (response: AcceptJsResponse) => {
            if (response.messages.resultCode === 'Error') {
              onError(response.messages.message[0]?.text ?? 'Card tokenization failed');
              setProcessing(false);
              return;
            }
            try {
              const res = await apiClient.post(chargeUrl, {
                opaque_data_descriptor: response.opaqueData.dataDescriptor,
                opaque_data_value:      response.opaqueData.dataValue,
                company_gateway_id:     companyGatewayId,
              });
              onSuccess(res.data.data);
            } catch (err: unknown) {
              const ex = err as { response?: { data?: { message?: string } } };
              onError(ex.response?.data?.message ?? 'Payment failed. Please try again or choose another payment method.');
            } finally {
              setProcessing(false);
            }
          },
        );
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [gateway, initData, cardNumber, cardExpiry, cardCvc, acceptJsReady, chargeUrl, companyGatewayId]);

  const wrapStyle: React.CSSProperties = { opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' };

  if (initLoading) {
    return <div style={{ ...wrapStyle, fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>Preparing payment form…</div>;
  }

  if (initError) {
    return <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{initError}</div>;
  }

  if (gateway === 'stripe') {
    return (
      <div style={wrapStyle}>
        <div id="invoice-stripe-card-element" style={{ padding: '13px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', minHeight: 44 }} />
        {!stripeReady && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
            {spinner} Loading secure card form…
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>🔒 Card details processed securely by Stripe — never stored on our servers</div>
      </div>
    );
  }

  if (gateway === 'paypal') {
    return (
      <div style={wrapStyle}>
        <div id="invoice-paypal-button-container" style={{ minHeight: 50 }} />
        <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>🔒 You will complete payment in a secure PayPal window</div>
      </div>
    );
  }

  // authorize_net
  return (
    <div style={wrapStyle}>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Card Number</label>
        <input
          value={cardNumber}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 16);
            setCardNumber(v.replace(/(.{4})/g, '$1 ').trim());
          }}
          placeholder="1234 5678 9012 3456"
          style={{ ...inp, fontFamily: 'monospace', letterSpacing: 2 }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>Expiry Date</label>
          <input
            value={cardExpiry}
            onChange={e => {
              let v = e.target.value.replace(/\D/g, '').slice(0, 4);
              if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
              setCardExpiry(v);
            }}
            placeholder="MM/YY"
            style={{ ...inp, fontFamily: 'monospace' }}
          />
        </div>
        <div>
          <label style={lbl}>CVC / CVV</label>
          <input
            value={cardCvc}
            onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="123"
            style={{ ...inp, fontFamily: 'monospace' }}
          />
        </div>
      </div>
      {!acceptJsReady && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
          {spinner} Loading secure payment form…
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>🔒 Card details tokenized by Authorize.Net Accept.js — not sent to our servers</div>
    </div>
  );
});

export default InlineGatewayPayment;
