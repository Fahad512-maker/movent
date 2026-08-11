'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import LandingNavbar from '@/components/landing/Navbar';
import LandingFooter from '@/components/landing/Footer';
import { publicService, ActiveGateway } from '@/lib/services/publicService';
import { subscriptionPaymentService, GatewayInitData } from '@/lib/services/subscriptionPaymentService';
import api from '@/lib/axios';
import { getAuthType, getAuthUser, getToken, setAuthData } from '@/lib/auth';
import { Admin } from '@/types';
import toast from 'react-hot-toast';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';

// Augment window for PayPal SDK and Accept.js
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
  messages: {
    resultCode: 'Ok' | 'Error';
    message: Array<{ code: string; text: string }>;
  };
  opaqueData: {
    dataDescriptor: string;
    dataValue: string;
  };
}

const GATEWAY_META: Record<string, { color: string; bg: string; border: string; desc: string }> = {
  paypal: {
    color: '#003087', bg: '#e8f0fe', border: '#a8c4f0',
    desc: 'Pay securely with your PayPal account or any credit card.',
  },
  stripe: {
    color: '#635bff', bg: '#f0f0ff', border: '#c7c5ff',
    desc: 'Pay with any credit or debit card. Powered by Stripe.',
  },
  authorize_net: {
    color: '#e31837', bg: '#fdecea', border: '#f5b0b8',
    desc: 'Authorize.Net — secure payment processing with advanced fraud detection.',
  },
};

function getGwMeta(name: string) {
  return GATEWAY_META[name.toLowerCase()] ?? {
    color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe',
    desc: 'Complete your payment securely.',
  };
}

const GW_ICONS: Record<string, string> = {
  paypal: '🅿',
  stripe: '💳',
  authorize_net: '🔐',
};

interface PendingOrder {
  package_name: string;
  modules: string[];
  required_dependencies?: string[];
  mode: string;
  seats: string;
  companies: string;
  total_pkr: number;
  total_usd: number;
  currency: 'USD';
  trial_days: number;
}

const inp: React.CSSProperties = {
  width: '100%', padding: '11px 14px',
  border: '1.5px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, outline: 'none', background: '#f8fafc',
  boxSizing: 'border-box', color: '#0f172a',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 6,
};

export default function PaymentPage() {
  const router = useRouter();

  const [order,        setOrder]        = useState<PendingOrder | null>(null);
  const [gateways,     setGateways]     = useState<ActiveGateway[]>([]);
  const [loadingGW,    setLoadingGW]    = useState(true);
  const [selectedGW,   setSelectedGW]   = useState<ActiveGateway | null>(null);
  const [initData,     setInitData]     = useState<GatewayInitData | null>(null);
  const [initLoading,  setInitLoading]  = useState(false);
  const [confirmed,    setConfirmed]    = useState(false);
  const [processing,   setProcessing]   = useState(false);
  const [error,        setError]        = useState('');

  // Stripe
  const stripeRef     = useRef<Stripe | null>(null);
  const stripeCardRef = useRef<StripeCardElement | null>(null);
  const stripeContainerRef = useRef<HTMLDivElement>(null);
  const [stripeReady,  setStripeReady]  = useState(false);

  // Authorize.Net form
  const [cardName,     setCardName]     = useState('');
  const [cardNumber,   setCardNumber]   = useState('');
  const [cardExpiry,   setCardExpiry]   = useState('');
  const [cardCvc,      setCardCvc]      = useState('');
  const [acceptJsReady, setAcceptJsReady] = useState(false);

  const devLog = (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.debug('[authorize_net]', ...args);
  };

  // subscription_status just flipped to 'active' server-side (SubscriptionPaymentController::process()),
  // but the cached auth_user cookie this tab is holding still says
  // 'pending_payment' from before — DashboardLayout's payment-gate check
  // reads that cache and would otherwise bounce straight back here the
  // instant the user lands on /admin/dashboard. Re-fetch /admin/me and
  // re-cache it before ever navigating away from this page.
  const refreshSessionAfterPayment = async () => {
    try {
      const res = await api.get('/admin/me');
      const fresh = res.data?.data;
      const token = getToken();
      if (fresh && token) {
        setAuthData(token, fresh, 'admin');
        window.dispatchEvent(new Event('auth_refreshed'));
      }
    } catch {
      // Non-fatal — the 60s poll in DashboardLayout will eventually catch up.
    }
  };

  // ── Bounce straight to the dashboard if there's nothing left to pay for ────
  // Covers reloading this page after the "Payment Successful!" screen (or
  // just landing here again on an already-active/trial account) — the
  // cached cookie should already say so post-payment (see
  // refreshSessionAfterPayment() below), but re-check against /admin/me too
  // in case it's stale for any reason.
  useEffect(() => {
    if (getAuthType() !== 'admin') return;

    const cached = getAuthUser() as Admin | null;
    if (cached && cached.subscription_status !== 'pending_payment') {
      router.replace('/admin/dashboard');
      return;
    }

    api.get('/admin/me').then(res => {
      const fresh = res.data?.data;
      if (fresh && fresh.subscription_status !== 'pending_payment') {
        const token = getToken();
        if (token) setAuthData(token, fresh, 'admin');
        router.replace('/admin/dashboard');
      }
    }).catch(() => {});
  }, [router]);

  // ── Load order + gateways on mount ────────────────────────────────────────
  useEffect(() => {
    let hasLocalOrder = false;
    try {
      const raw = localStorage.getItem('pending_order');
      if (raw) { setOrder(JSON.parse(raw)); hasLocalOrder = true; }
    } catch { /* ignore */ }

    // localStorage.pending_order only ever exists in the browser/tab that
    // originally submitted the registration form — resuming payment from a
    // different session (or after it was cleared) landed here with nothing
    // to show. Fall back to the admin's actual saved package/seat allotment.
    if (!hasLocalOrder) {
      subscriptionPaymentService.orderSummary().then(setOrder).catch(() => {});
    }

    publicService.getActiveGateways()
      .then(gws => {
        const active = gws.filter(g => g.is_active);
        setGateways(active);
        if (active.length) setSelectedGW(active[0]);
      })
      .catch(() => {
        const fallback: ActiveGateway[] = [
          { id: 1, name: 'stripe',        display_name: 'Stripe',        is_active: true },
          { id: 2, name: 'paypal',        display_name: 'PayPal',        is_active: true },
          { id: 3, name: 'authorize_net', display_name: 'Authorize.Net', is_active: true },
        ];
        setGateways(fallback);
        setSelectedGW(fallback[0]);
      })
      .finally(() => setLoadingGW(false));
  }, []);

  // ── Fetch init data when gateway changes ──────────────────────────────────
  useEffect(() => {
    if (!selectedGW) return;
    setInitData(null);
    setInitLoading(true);
    setError('');
    setStripeReady(false);

    subscriptionPaymentService.init(selectedGW.name)
      .then(data => setInitData(data))
      .catch((err: unknown) => {
        const ex = err as { response?: { data?: { message?: string } } };
        setError(ex.response?.data?.message ?? 'Failed to load gateway configuration. Please try again.');
      })
      .finally(() => setInitLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGW?.id]);

  // ── Mount Stripe card element ──────────────────────────────────────────────
  useEffect(() => {
    if (selectedGW?.name !== 'stripe' || !initData) return;

    // Publishable key missing — show error, don't attempt to load
    if (!initData.publishable_key) {
      setError('Stripe is not fully configured yet. Please contact support or check Super Admin → Payment Gateways.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(initData.publishable_key!);
        if (cancelled || !stripe) return;

        stripeRef.current = stripe;
        const elements = stripe.elements();
        const cardEl = elements.create('card', {
          style: {
            base: {
              fontSize: '15px',
              color: '#0f172a',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              '::placeholder': { color: '#94a3b8' },
            },
            invalid: { color: '#dc2626' },
          },
        });

        // Use CSS id — more reliable than passing a ref inside async
        cardEl.mount('#stripe-card-element');
        stripeCardRef.current = cardEl;
        if (!cancelled) setStripeReady(true);
      } catch {
        if (!cancelled) setError('Failed to load Stripe. Please refresh and try again.');
      }
    })();

    return () => {
      cancelled = true;
      if (stripeCardRef.current) {
        stripeCardRef.current.destroy();
        stripeCardRef.current = null;
      }
      stripeRef.current = null;
      setStripeReady(false);
    };
  }, [selectedGW?.name, initData?.publishable_key]);

  // ── Load PayPal SDK and render buttons ────────────────────────────────────
  useEffect(() => {
    if (selectedGW?.name !== 'paypal' || !initData?.client_id || !order) return;

    // PayPal only supports specific currencies — always use USD
    const paypalCurrency = 'USD';
    const paypalAmount   = order.total_usd;

    const renderButtons = () => {
      const container = document.getElementById('paypal-button-container');
      if (!container || !window.paypal) return;
      container.innerHTML = '';

      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        createOrder: async () => {
          try {
            const { order_id } = await subscriptionPaymentService.createPaypalOrder(paypalAmount, paypalCurrency);
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
            await subscriptionPaymentService.process({
              gateway: 'paypal',
              paypal_order_id: data.orderID,
              amount: paypalAmount,
              currency: paypalCurrency,
            });
            localStorage.removeItem('pending_order');
            await refreshSessionAfterPayment();
            setConfirmed(true);
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
      }).render('#paypal-button-container');
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
  }, [selectedGW?.name, initData?.client_id, order]);

  // ── Load Accept.js for Authorize.Net ──────────────────────────────────────
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

  // ── Pay handler (Stripe + Authorize.Net) ──────────────────────────────────
  const handlePay = async () => {
    if (!selectedGW || !initData || !order) return;
    setError('');

    const currency = 'USD';
    const amount   = order.total_usd;

    // ── Stripe ──
    if (selectedGW.name === 'stripe') {
      if (!stripeRef.current || !stripeCardRef.current) {
        setError('Card form not ready. Please wait a moment and try again.');
        return;
      }
      setProcessing(true);
      try {
        const { paymentMethod, error: pmError } = await stripeRef.current.createPaymentMethod({
          type: 'card',
          card: stripeCardRef.current,
        });
        if (pmError) {
          setError(pmError.message ?? 'Invalid card details');
          return;
        }
        await subscriptionPaymentService.process({
          gateway: 'stripe',
          payment_method_id: paymentMethod!.id,
          amount,
          currency,
        });
        localStorage.removeItem('pending_order');
        await refreshSessionAfterPayment();
        setConfirmed(true);
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

    // ── Authorize.Net ──
    if (selectedGW.name === 'authorize_net') {
      if (!initData.api_login_id || !initData.client_key) {
        setError('Authorize.Net is not configured properly.');
        return;
      }
      if (!cardNumber || !cardExpiry || !cardCvc) {
        setError('Please fill in all card details.');
        return;
      }
      if (!acceptJsReady || !window.Accept) {
        setError('Authorize.Net payment form could not be loaded. Please try again.');
        return;
      }

      const [rawMonth, rawYear] = cardExpiry.split('/');
      const expMonth = rawMonth?.trim().padStart(2, '0') ?? '';
      const expYear  = rawYear?.trim().length === 2
        ? `20${rawYear.trim()}`
        : rawYear?.trim() ?? '';

      setProcessing(true);
      devLog('dispatching tokenization', { mode: initData.mode ?? 'sandbox' });

      window.Accept.dispatchData(
        {
          authData: {
            apiLoginID: initData.api_login_id ?? '',
            clientKey:  initData.client_key   ?? '',
          },
          cardData: {
            cardNumber: cardNumber.replace(/\s/g, ''),
            month:      expMonth,
            year:       expYear,
            cardCode:   cardCvc,
          },
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
            await subscriptionPaymentService.process({
              gateway: 'authorize_net',
              opaque_data_descriptor: response.opaqueData.dataDescriptor,
              opaque_data_value:      response.opaqueData.dataValue,
              amount,
              currency,
            });
            devLog('backend payment success');
            localStorage.removeItem('pending_order');
            await refreshSessionAfterPayment();
            setConfirmed(true);
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

  const fmt = (_pkr: number, usd: number) => `$${usd}`;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <>
        <LandingNavbar />
        <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 24px 40px', background: '#f8fafc' }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ width: 80, height: 80, background: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 44 }}>
              ✅
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>Payment Successful!</h2>
            <p style={{ color: '#64748b', fontSize: 16, lineHeight: 1.65, marginBottom: 10 }}>
              Your subscription is now active. Welcome aboard!
            </p>
            {order && (
              <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 28, textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Plan</span>
                  <span style={{ fontWeight: 700 }}>{order.package_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Seats</span>
                  <span style={{ fontWeight: 700 }}>{order.seats}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: '#64748b' }}>Paid</span>
                  <span style={{ fontWeight: 800, color: '#2563eb' }}>{fmt(order.total_pkr, order.total_usd)}/mo</span>
                </div>
              </div>
            )}
            <button
              onClick={() => router.push('/admin/dashboard')}
              style={{
                display: 'inline-block', padding: '13px 36px',
                background: 'linear-gradient(135deg,#2563eb,#3b82f6)',
                borderRadius: 50, color: '#fff', fontWeight: 700, fontSize: 15,
                border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
              }}>
              Go to Dashboard →
            </button>
          </div>
        </div>
        <LandingFooter />
      </>
    );
  }

  const meta = selectedGW ? getGwMeta(selectedGW.name) : null;
  const isPayPal    = selectedGW?.name === 'paypal';
  const isStripe    = selectedGW?.name === 'stripe';
  const isAuthNet   = selectedGW?.name === 'authorize_net';
  const showPayBtn  = !isPayPal;  // PayPal has its own buttons

  return (
    <>
      <LandingNavbar />
      <div style={{ paddingTop: 96, paddingBottom: 80, background: '#f8fafc', minHeight: '100vh' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px' }}>

          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Complete Payment</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 32 }}>Choose your payment method and activate your subscription</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

            {/* ── Left: Gateway selection + payment form ── */}
            <div>

              {/* Gateway selector */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>
                  Select Payment Method
                </div>
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
                        <div
                          key={gw.id}
                          onClick={() => { if (!processing) setSelectedGW(gw); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '14px 18px', borderRadius: 12,
                            cursor: processing ? 'not-allowed' : 'pointer',
                            border: `2px solid ${active ? gwMeta.color : '#e2e8f0'}`,
                            background: active ? gwMeta.bg : '#fff',
                            transition: 'all 0.15s',
                            boxShadow: active ? `0 4px 14px ${gwMeta.color}22` : 'none',
                            opacity: processing ? 0.6 : 1,
                          }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${active ? gwMeta.color : '#cbd5e1'}`,
                            background: active ? gwMeta.color : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                          </div>
                          <div style={{
                            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                            background: active ? gwMeta.color : '#f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, transition: 'all 0.15s',
                          }}>
                            {GW_ICONS[gw.name.toLowerCase()] ?? '💳'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: active ? gwMeta.color : '#0f172a' }}>
                              {gw.display_name}
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{gwMeta.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Error banner */}
              {error && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* ── Stripe card element ── */}
              {isStripe && !initLoading && initData && !error && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Card Details</div>

                  {/* id used by cardEl.mount('#stripe-card-element') */}
                  <div
                    id="stripe-card-element"
                    ref={stripeContainerRef}
                    style={{
                      padding: '13px 14px',
                      border: `1.5px solid ${stripeReady ? '#e2e8f0' : '#e2e8f0'}`,
                      borderRadius: 10,
                      background: '#fff',
                      minHeight: 44,
                    }}
                  />
                  {!stripeReady && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #94a3b8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Loading secure card form…
                    </div>
                  )}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                    <span>🔒</span><span>Card details processed securely by Stripe — never stored on our servers</span>
                  </div>
                </div>
              )}

              {/* ── PayPal buttons ── */}
              {isPayPal && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>Pay with PayPal</div>
                  {initLoading ? (
                    <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Connecting to PayPal…</div>
                  ) : initData ? (
                    <>
                      <div id="paypal-button-container" style={{ minHeight: 50 }} />
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                        <span>🔒</span><span>You will complete payment in a secure PayPal window</span>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {/* ── Authorize.Net card form ── */}
              {isAuthNet && !initLoading && initData && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Card Details</div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Cardholder Name</label>
                    <input
                      value={cardName} onChange={e => setCardName(e.target.value)}
                      placeholder="Ahmed Khan"
                      style={inp}
                    />
                  </div>

                  <div style={{ marginBottom: 14 }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                      <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #94a3b8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Loading secure payment form…
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                    <span>🔒</span><span>Card details tokenized by Authorize.Net Accept.js — not sent to our servers</span>
                  </div>
                </div>
              )}

              {/* Loading state for init */}
              {initLoading && !isPayPal && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  Preparing payment form…
                </div>
              )}

            </div>

            {/* ── Right: Order summary + Pay button ── */}
            <div style={{ position: 'sticky', top: 88 }}>
              <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Order Summary</h4>

                {order ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                      <span style={{ color: '#64748b' }}>Plan</span>
                      <span style={{ fontWeight: 700 }}>{order.package_name}</span>
                    </div>
                    {order.mode === 'custom' && order.modules.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Modules:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {order.modules.map(m => (
                            <span key={m} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 10, fontSize: 11, color: '#475569' }}>{m}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {order.mode === 'custom' && (order.required_dependencies?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Required dependencies:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {order.required_dependencies!.map(m => (
                            <span key={m} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 10, fontSize: 11, color: '#475569' }}>{m}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: '#64748b' }}>👤 Seats</span>
                      <span style={{ fontWeight: 600 }}>{order.seats}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: '#64748b' }}>🏢 Companies</span>
                      <span style={{ fontWeight: 600 }}>{order.companies}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 14 }}>
                      <span style={{ color: '#64748b' }}>Free trial</span>
                      <span style={{ fontWeight: 600, color: '#22c55e' }}>{order.trial_days} days</span>
                    </div>

                    <div style={{ borderTop: '1.5px dashed #e2e8f0', paddingTop: 12, marginBottom: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>Total</span>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 900, fontSize: 22, color: '#2563eb' }}>
                            {fmt(order.total_pkr, order.total_usd)}
                            <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>/mo</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>after free trial</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '12px 0 16px' }}>
                    No order information found
                  </div>
                )}

                {/* Pay button — only for non-PayPal gateways */}
                {showPayBtn && (
                  <button
                    onClick={handlePay}
                    disabled={processing || !selectedGW || initLoading || !initData}
                    style={{
                      width: '100%', padding: '13px',
                      background: (processing || !selectedGW || initLoading || !initData)
                        ? '#e2e8f0'
                        : `linear-gradient(135deg, ${meta?.color ?? '#2563eb'}, ${meta?.color ?? '#3b82f6'})`,
                      border: 'none', borderRadius: 10,
                      color: (processing || !selectedGW || initLoading || !initData) ? '#94a3b8' : '#fff',
                      fontSize: 14, fontWeight: 700,
                      cursor: (processing || !selectedGW || initLoading || !initData) ? 'not-allowed' : 'pointer',
                      boxShadow: (processing || !selectedGW || initLoading || !initData) ? 'none' : '0 4px 14px rgba(37,99,235,0.3)',
                      transition: 'all 0.15s',
                    }}>
                    {processing ? '⏳ Processing…' : '🔒 Pay Now'}
                  </button>
                )}

                {/* PayPal note (buttons are rendered in the left panel) */}
                {isPayPal && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', padding: '8px 0' }}>
                    Click the PayPal button on the left to complete payment
                  </div>
                )}

                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
                  🔒 256-bit SSL encrypted · Secure payment
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      <LandingFooter />
    </>
  );
}
