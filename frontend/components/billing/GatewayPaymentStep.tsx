'use client';
import { useEffect, useRef, useState } from 'react';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';
import toast from 'react-hot-toast';
import api from '@/lib/axios';
import { subscriptionPaymentService, GatewayInitData } from '@/lib/services/subscriptionPaymentService';
import { ActiveGateway } from '@/lib/services/publicService';

// Generic payment-collection UI extracted from
// frontend/app/admin/upgrade-modules/page.tsx's payment step — gateway
// selection, Stripe Elements, PayPal SDK, and Authorize.net Accept.js wiring
// have zero business-logic content, so this is shared rather than
// duplicated a third time (upgrade-modules/page.tsx itself is left as-is,
// not retrofitted, to avoid regression risk on a shipped flow).

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

export interface GatewayChargeFields {
  currency: string;
  payment_method_id?: string;
  paypal_order_id?: string;
  opaque_data_descriptor?: string;
  opaque_data_value?: string;
}

const GATEWAY_META: Record<string, { color: string; bg: string; desc: string }> = {
  paypal: { color: '#003087', bg: '#e8f0fe', desc: 'Pay securely with your PayPal account or any credit card.' },
  stripe: { color: '#635bff', bg: '#f0f0ff', desc: 'Pay with any credit or debit card. Powered by Stripe.' },
  authorize_net: { color: '#e31837', bg: '#fdecea', desc: 'Authorize.Net — secure payment processing with advanced fraud detection.' },
};
function getGwMeta(name: string) {
  return GATEWAY_META[name.toLowerCase()] ?? { color: '#2563eb', bg: '#eff6ff', desc: 'Complete your payment securely.' };
}
const GW_ICONS: Record<string, string> = { paypal: '🅿', stripe: '💳', authorize_net: '🔐' };

const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', background: '#f8fafc', boxSizing: 'border-box', color: '#0f172a' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 };

interface GatewayPaymentStepProps {
  amountUsd: number;
  summaryLabel: string;
  summaryChips: string[];
  onBack: () => void;
  onPurchase: (gateway: 'stripe' | 'paypal' | 'authorize_net', fields: GatewayChargeFields) => Promise<void>;
}

export default function GatewayPaymentStep({ amountUsd, summaryLabel, summaryChips, onBack, onPurchase }: GatewayPaymentStepProps) {
  const [gateways, setGateways] = useState<ActiveGateway[]>([]);
  const [loadingGW, setLoadingGW] = useState(true);
  const [selectedGW, setSelectedGW] = useState<ActiveGateway | null>(null);
  const [initData, setInitData] = useState<GatewayInitData | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const stripeRef = useRef<Stripe | null>(null);
  const stripeCardRef = useRef<StripeCardElement | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [acceptJsReady, setAcceptJsReady] = useState(false);

  const devLog = (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.debug('[authorize_net]', ...args);
  };

  useEffect(() => {
    api.get('/admin/payment-gateways')
      .then(res => {
        const active = (res.data.data as ActiveGateway[]).filter(g => g.is_active);
        setGateways(active);
        if (active.length) setSelectedGW(active[0]);
      })
      .catch(() => toast.error('Failed to load payment methods'))
      .finally(() => setLoadingGW(false));
  }, []);

  useEffect(() => {
    if (!selectedGW) return;
    setInitData(null);
    setInitLoading(true);
    setError('');
    setStripeReady(false);
    subscriptionPaymentService.init(selectedGW.name)
      .then(setInitData)
      .catch((err: unknown) => {
        const ex = err as { response?: { data?: { message?: string } } };
        setError(ex.response?.data?.message ?? 'Failed to load gateway configuration. Please try again.');
      })
      .finally(() => setInitLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGW?.id]);

  useEffect(() => {
    if (selectedGW?.name !== 'stripe' || !initData) return;
    if (!initData.publishable_key) {
      setError('Stripe is not fully configured yet. Please contact support.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(initData.publishable_key!);
        if (cancelled || !stripe) return;
        stripeRef.current = stripe;
        const cardEl = stripe.elements().create('card', {
          style: { base: { fontSize: '15px', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', '::placeholder': { color: '#94a3b8' } }, invalid: { color: '#dc2626' } },
        });
        cardEl.mount('#gw-stripe-card-element');
        stripeCardRef.current = cardEl;
        if (!cancelled) setStripeReady(true);
      } catch {
        if (!cancelled) setError('Failed to load Stripe. Please refresh and try again.');
      }
    })();
    return () => {
      cancelled = true;
      if (stripeCardRef.current) { stripeCardRef.current.destroy(); stripeCardRef.current = null; }
      stripeRef.current = null;
      setStripeReady(false);
    };
  }, [selectedGW?.name, initData?.publishable_key]);

  useEffect(() => {
    if (selectedGW?.name !== 'paypal' || !initData?.client_id) return;
    const paypalCurrency = 'USD';

    const renderButtons = () => {
      const container = document.getElementById('gw-paypal-button-container');
      if (!container || !window.paypal) return;
      container.innerHTML = '';
      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        createOrder: async () => {
          try {
            const { order_id } = await subscriptionPaymentService.createPaypalOrder(amountUsd, paypalCurrency);
            return order_id;
          } catch (err: unknown) {
            const ex = err as { response?: { data?: { message?: string } } };
            const msg = ex.response?.data?.message ?? 'Failed to create PayPal order. Please try again.';
            setError(msg);
            throw new Error(msg);
          }
        },
        onApprove: async (data) => {
          setProcessing(true);
          setError('');
          try {
            await onPurchase('paypal', { paypal_order_id: data.orderID, currency: paypalCurrency });
          } catch (err: unknown) {
            const ex = err as { response?: { data?: { message?: string } } };
            const msg = ex.response?.data?.message ?? 'Payment failed. Please try again.';
            setError(msg);
            toast.error(msg);
          } finally {
            setProcessing(false);
          }
        },
        onError: () => setError('PayPal payment could not be completed. Please try again.'),
        onCancel: () => setError('Payment was cancelled.'),
      }).render('#gw-paypal-button-container');
    };

    if (window.paypal) {
      renderButtons();
    } else {
      const existing = document.querySelector('script[data-paypal-sdk]');
      if (existing) existing.remove();
      delete window.paypal;
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${initData.client_id}&currency=USD`;
      script.setAttribute('data-paypal-sdk', '1');
      script.onload = renderButtons;
      script.onerror = () => setError('Failed to load PayPal. Please check your internet connection.');
      document.body.appendChild(script);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGW?.name, initData?.client_id, amountUsd]);

  useEffect(() => {
    if (selectedGW?.name !== 'authorize_net' || !initData) return;
    setAcceptJsReady(false);

    const mode = initData.mode ?? 'sandbox';
    const src = mode === 'live'
      ? 'https://js.authorize.net/v1/Accept.js'
      : 'https://jstest.authorize.net/v1/Accept.js';

    devLog('loading Accept.js', { mode, src });

    if (window.Accept) { setAcceptJsReady(true); return; }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => { devLog('Accept.js loaded'); setAcceptJsReady(true); });
      existing.addEventListener('error', () => {
        devLog('Accept.js failed to load');
        setError('Authorize.Net payment form could not be loaded. Please try again.');
      });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = () => { devLog('Accept.js loaded'); setAcceptJsReady(true); };
    script.onerror = () => {
      devLog('Accept.js failed to load');
      setError('Authorize.Net payment form could not be loaded. Please try again.');
    };
    document.body.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGW?.name, initData?.mode]);

  const handlePay = async () => {
    if (!selectedGW || !initData) return;
    setError('');

    if (selectedGW.name === 'stripe') {
      if (!stripeRef.current || !stripeCardRef.current) {
        setError('Card form not ready. Please wait a moment and try again.');
        return;
      }
      setProcessing(true);
      try {
        const { paymentMethod, error: pmError } = await stripeRef.current.createPaymentMethod({ type: 'card', card: stripeCardRef.current });
        if (pmError) { setError(pmError.message ?? 'Invalid card details'); return; }
        await onPurchase('stripe', { payment_method_id: paymentMethod!.id, currency: 'USD' });
      } catch (err: unknown) {
        const ex = err as { response?: { data?: { message?: string } } };
        const msg = ex.response?.data?.message ?? 'Payment failed. Please try again.';
        setError(msg);
        toast.error(msg);
      } finally {
        setProcessing(false);
      }
      return;
    }

    if (selectedGW.name === 'authorize_net') {
      if (!initData.api_login_id || !initData.client_key) {
        setError('Authorize.Net is not configured properly.');
        return;
      }
      if (!cardNumber || !cardExpiry || !cardCvc) { setError('Please fill in all card details.'); return; }
      if (!acceptJsReady || !window.Accept) {
        setError('Authorize.Net payment form could not be loaded. Please try again.');
        return;
      }

      const [rawMonth, rawYear] = cardExpiry.split('/');
      const expMonth = rawMonth?.trim().padStart(2, '0') ?? '';
      const expYear = rawYear?.trim().length === 2 ? `20${rawYear.trim()}` : rawYear?.trim() ?? '';

      setProcessing(true);
      devLog('dispatching tokenization', { mode: initData.mode ?? 'sandbox' });
      window.Accept.dispatchData(
        {
          authData: { apiLoginID: initData.api_login_id ?? '', clientKey: initData.client_key ?? '' },
          cardData: { cardNumber: cardNumber.replace(/\s/g, ''), month: expMonth, year: expYear, cardCode: cardCvc },
        },
        async (response: AcceptJsResponse) => {
          if (response.messages.resultCode === 'Error') {
            const msg = response.messages.message[0]?.text ?? 'Card tokenization failed';
            devLog('tokenization failed', { code: response.messages.message[0]?.code, message: msg });
            setError(msg);
            setProcessing(false);
            return;
          }
          devLog('tokenization success');
          try {
            await onPurchase('authorize_net', {
              currency: 'USD',
              opaque_data_descriptor: response.opaqueData.dataDescriptor,
              opaque_data_value: response.opaqueData.dataValue,
            });
            devLog('backend payment success');
          } catch (err: unknown) {
            const ex = err as { response?: { data?: { message?: string } } };
            const msg = ex.response?.data?.message ?? 'Payment failed. Please try again.';
            devLog('backend payment failed', msg);
            setError(msg);
            toast.error(msg);
          } finally {
            setProcessing(false);
          }
        },
      );
    }
  };

  const meta = selectedGW ? getGwMeta(selectedGW.name) : null;
  const isPayPal = selectedGW?.name === 'paypal';
  const isStripe = selectedGW?.name === 'stripe';
  const isAuthNet = selectedGW?.name === 'authorize_net';
  const showPayBtn = !isPayPal;

  return (
    <div style={{ maxWidth: 820 }}>
      <button onClick={onBack} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b', marginBottom: 20 }}>← Back</button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Complete Payment</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Choose your payment method to activate the upgrade</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
        <div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>Select Payment Method</div>
            {loadingGW ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading payment methods…</div>
            ) : gateways.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No payment gateway is configured. Please contact support.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {gateways.map(gw => {
                  const gwMeta = getGwMeta(gw.name);
                  const active = selectedGW?.id === gw.id;
                  return (
                    <div key={gw.id} onClick={() => { if (!processing) setSelectedGW(gw); }} style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12,
                      cursor: processing ? 'not-allowed' : 'pointer',
                      border: `2px solid ${active ? gwMeta.color : '#e2e8f0'}`,
                      background: active ? gwMeta.bg : '#fff', opacity: processing ? 0.6 : 1,
                    }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? gwMeta.color : '#cbd5e1'}`, background: active ? gwMeta.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: active ? gwMeta.color : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                        {GW_ICONS[gw.name.toLowerCase()] ?? '💳'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: active ? gwMeta.color : '#0f172a' }}>{gw.display_name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{gwMeta.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          {isStripe && !initLoading && initData && !error && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Card Details</div>
              <div id="gw-stripe-card-element" style={{ padding: '13px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', minHeight: 44 }} />
              {!stripeReady && <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Loading secure card form…</div>}
            </div>
          )}

          {isPayPal && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>Pay with PayPal</div>
              {initLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Connecting to PayPal…</div>
              ) : initData ? (
                <div id="gw-paypal-button-container" style={{ minHeight: 50 }} />
              ) : null}
            </div>
          )}

          {isAuthNet && !initLoading && initData && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Card Details</div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Card Number</label>
                <input value={cardNumber} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 16); setCardNumber(v.replace(/(.{4})/g, '$1 ').trim()); }} placeholder="1234 5678 9012 3456" style={{ ...inp, fontFamily: 'monospace', letterSpacing: 2 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Expiry Date</label>
                  <input value={cardExpiry} onChange={e => { let v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2); setCardExpiry(v); }} placeholder="MM/YY" style={{ ...inp, fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={lbl}>CVC / CVV</label>
                  <input value={cardCvc} onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="123" style={{ ...inp, fontFamily: 'monospace' }} />
                </div>
              </div>
              {!acceptJsReady && <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Loading secure payment form…</div>}
            </div>
          )}

          {initLoading && !isPayPal && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Preparing payment form…</div>
          )}
        </div>

        <div style={{ position: 'sticky', top: 88 }}>
          <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Order Summary</h4>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{summaryLabel}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {summaryChips.map(chip => (
                  <span key={chip} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 10, fontSize: 11, color: '#475569' }}>{chip}</span>
                ))}
              </div>
            </div>
            <div style={{ borderTop: '1.5px dashed #e2e8f0', paddingTop: 12, marginTop: 12, marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>Total</span>
                <div style={{ fontWeight: 900, fontSize: 22, color: '#2563eb' }}>${amountUsd}</div>
              </div>
            </div>
            {showPayBtn && (
              <button onClick={handlePay} disabled={processing || !selectedGW || initLoading || !initData} style={{
                width: '100%', padding: '13px',
                background: (processing || !selectedGW || initLoading || !initData) ? '#e2e8f0' : `linear-gradient(135deg, ${meta?.color ?? '#2563eb'}, ${meta?.color ?? '#3b82f6'})`,
                border: 'none', borderRadius: 10, color: (processing || !selectedGW || initLoading || !initData) ? '#94a3b8' : '#fff',
                fontSize: 14, fontWeight: 700, cursor: (processing || !selectedGW || initLoading || !initData) ? 'not-allowed' : 'pointer',
              }}>{processing ? '⏳ Processing…' : '🔒 Pay Now'}</button>
            )}
            {isPayPal && <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', padding: '8px 0' }}>Click the PayPal button on the left to complete payment</div>}
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#94a3b8' }}>🔒 256-bit SSL encrypted · Secure payment</div>
          </div>
        </div>
      </div>
    </div>
  );
}
