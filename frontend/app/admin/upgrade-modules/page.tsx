'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HiUsers, HiDocumentText, HiShieldCheck, HiBanknotes,
  HiClipboardDocumentList, HiCheck, HiCube,
} from 'react-icons/hi2';
import { IconType } from 'react-icons';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { moduleUpgradeService, CatalogModule } from '@/lib/services/moduleUpgradeService';
import { subscriptionPaymentService, GatewayInitData } from '@/lib/services/subscriptionPaymentService';
import { ActiveGateway } from '@/lib/services/publicService';
import { getToken, setAuthData } from '@/lib/auth';
import { Admin } from '@/types';

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

// Presentational style per top-level module key — mirrors the same map used
// on the registration page (frontend/app/register/page.tsx CATEGORIES), so
// the "buy more modules" cards look identical. Live label/description/price
// come from GET /admin/modules/catalog.
const CATEGORY_STYLE: Record<string, { icon: IconType; color: string; bg: string; border: string; badge: string }> = {
  sales:         { icon: HiDocumentText,           color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', badge: 'Requires Invoice' },
  client_portal: { icon: HiUsers,                  color: '#10b981', bg: '#ecfdf5', border: '#6ee7b7', badge: 'Requires Invoice or Project' },
  projects:      { icon: HiClipboardDocumentList,  color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', badge: 'Can be used alone' },
  compliance:    { icon: HiShieldCheck,             color: '#dc2626', bg: '#fef2f2', border: '#fecaca', badge: 'Can be used alone' },
  hr:            { icon: HiUsers,                  color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', badge: 'Can be used alone' },
  finance:       { icon: HiBanknotes,               color: '#d97706', bg: '#fffbeb', border: '#fde68a', badge: 'Requires Invoice' },
  invoice:       { icon: HiDocumentText,           color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', badge: 'Can be used alone' },
};
const DEFAULT_STYLE = { icon: HiCube, color: '#475569', bg: '#f8fafc', border: '#e2e8f0', badge: 'Can be used alone' };

const DEPENDENCY_ERRORS: Record<string, string> = {
  sales: 'Invoice module is required because Sales includes invoice features.',
  client_portal: 'Client module requires Invoice or Project.',
  finance: 'Invoice module is required because Finance depends on invoice and payment data.',
};

function requiredDependencyKeys(keys: string[]): string[] {
  const deps: string[] = [];
  if ((keys.includes('sales') || keys.includes('finance')) && keys.includes('invoice')) {
    deps.push('invoice');
  }
  return deps;
}

function moduleDependencyErrors(keys: string[]): string[] {
  const errors: string[] = [];
  if (keys.includes('sales') && !keys.includes('invoice')) errors.push(DEPENDENCY_ERRORS.sales);
  if (keys.includes('finance') && !keys.includes('invoice')) errors.push(DEPENDENCY_ERRORS.finance);
  if (keys.includes('client_portal') && !keys.includes('invoice') && !keys.includes('projects')) {
    errors.push(DEPENDENCY_ERRORS.client_portal);
  }
  return errors;
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

export default function UpgradeModulesPage() {
  const router = useRouter();

  const [step, setStep] = useState<'select' | 'payment' | 'done'>('select');
  const [modules, setModules] = useState<CatalogModule[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment step — mirrors frontend/app/payment/page.tsx
  const [gateways, setGateways] = useState<ActiveGateway[]>([]);
  const [loadingGW, setLoadingGW] = useState(true);
  const [selectedGW, setSelectedGW] = useState<ActiveGateway | null>(null);
  const [initData, setInitData] = useState<GatewayInitData | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [purchasedAdmin, setPurchasedAdmin] = useState<Admin | null>(null);

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
    moduleUpgradeService.catalog()
      .then(d => { setModules(d.modules); setOwned(d.owned_modules); })
      .catch(() => toast.error('Failed to load module catalog'))
      .finally(() => setLoading(false));
  }, []);

  // Reads `selected`/`owned` directly (not via a setState updater callback) so
  // toast.*() — which itself updates the Toaster's state — never fires while
  // React is still resolving setSelected's update; both run as plain
  // synchronous statements inside this click handler instead.
  const toggleModule = (key: string) => {
    if (owned.includes(key)) return;

    if (key === 'invoice' && selected.includes('invoice') && (selected.includes('sales') || selected.includes('finance'))) {
      toast.error(selected.includes('sales') ? DEPENDENCY_ERRORS.sales : DEPENDENCY_ERRORS.finance);
      return;
    }

    if (selected.includes(key)) {
      setSelected(selected.filter(k => k !== key));
      return;
    }

    const next = [...selected, key];
    if ((key === 'sales' || key === 'finance') && !next.includes('invoice') && !owned.includes('invoice')) {
      next.push('invoice');
      toast.success(`Invoice added automatically — required by ${key === 'sales' ? 'Sales' : 'Finance'}.`);
    }
    setSelected(next);
  };

  const requiredDeps = requiredDependencyKeys(selected);
  const dependencyErrors = moduleDependencyErrors([...owned, ...selected]);
  const selectedModules = modules.filter(m => selected.includes(m.key));
  const totalUsd = selectedModules.reduce((s, m) => s + Number(m.price_usd), 0);
  const canProceed = selected.length > 0 && dependencyErrors.length === 0;

  const handleContinue = () => {
    if (selected.length === 0) { toast.error('Select at least one module'); return; }
    if (dependencyErrors.length > 0) { dependencyErrors.forEach(message => toast.error(message)); return; }
    setStep('payment');
  };

  // ── Payment step wiring ─────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'payment') return;
    moduleUpgradeService.activeGateways()
      .then(gws => {
        const active = gws.filter(g => g.is_active);
        setGateways(active);
        if (active.length) setSelectedGW(active[0]);
      })
      .catch(() => toast.error('Failed to load payment methods'))
      .finally(() => setLoadingGW(false));
  }, [step]);

  useEffect(() => {
    if (!selectedGW || step !== 'payment') return;
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
  }, [selectedGW?.id, step]);

  useEffect(() => {
    if (selectedGW?.name !== 'stripe' || !initData || step !== 'payment') return;
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
        cardEl.mount('#upgrade-stripe-card-element');
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
  }, [selectedGW?.name, initData?.publishable_key, step]);

  useEffect(() => {
    if (selectedGW?.name !== 'paypal' || !initData?.client_id || step !== 'payment') return;
    const paypalCurrency = 'USD';
    const paypalAmount = totalUsd;

    const renderButtons = () => {
      const container = document.getElementById('upgrade-paypal-button-container');
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
            const admin = await moduleUpgradeService.purchase({
              module_keys: selected, gateway: 'paypal', paypal_order_id: data.orderID, currency: paypalCurrency,
            });
            await completePurchase(admin);
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
      }).render('#upgrade-paypal-button-container');
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
  }, [selectedGW?.name, initData?.client_id, step, totalUsd]);

  useEffect(() => {
    if (selectedGW?.name !== 'authorize_net' || !initData || step !== 'payment') return;
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
  }, [selectedGW?.name, initData?.mode, step]);

  const completePurchase = async (admin: Admin) => {
    setAuthData(getToken()!, admin, 'admin');
    window.dispatchEvent(new Event('auth_refreshed'));
    setPurchasedAdmin(admin);
    setStep('done');
  };

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
        const admin = await moduleUpgradeService.purchase({
          module_keys: selected, gateway: 'stripe', payment_method_id: paymentMethod!.id, currency: 'USD',
        });
        await completePurchase(admin);
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
            const admin = await moduleUpgradeService.purchase({
              module_keys: selected, gateway: 'authorize_net', currency: 'USD',
              opaque_data_descriptor: response.opaqueData.dataDescriptor,
              opaque_data_value: response.opaqueData.dataValue,
            });
            devLog('backend payment success');
            await completePurchase(admin);
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

  // ── Success screen ─────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <DashboardLayout title="Upgrade Modules">
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ width: 80, height: 80, background: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 44 }}>✅</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>Modules Activated!</h2>
            <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              {selectedModules.map(m => m.label).join(', ')} {selectedModules.length > 1 ? 'are' : 'is'} now active on your account.
            </p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 28 }}>
              {(purchasedAdmin?.modules ?? []).length > 0 && (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Sidebar has been updated — no need to log out.</span>
              )}
            </div>
            <button onClick={() => router.push('/admin/dashboard')} style={{
              padding: '13px 36px', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', borderRadius: 50,
              color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
            }}>Go to Dashboard →</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Step 2: Payment ────────────────────────────────────────────────────
  if (step === 'payment') {
    const meta = selectedGW ? getGwMeta(selectedGW.name) : null;
    const isPayPal = selectedGW?.name === 'paypal';
    const isStripe = selectedGW?.name === 'stripe';
    const isAuthNet = selectedGW?.name === 'authorize_net';
    const showPayBtn = !isPayPal;

    return (
      <DashboardLayout title="Upgrade Modules">
        <div style={{ maxWidth: 820 }}>
          <button onClick={() => setStep('select')} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b', marginBottom: 20 }}>← Back to modules</button>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Complete Payment</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Choose your payment method to activate the selected modules</p>

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
                  <div id="upgrade-stripe-card-element" style={{ padding: '13px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', minHeight: 44 }} />
                  {!stripeReady && <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Loading secure card form…</div>}
                </div>
              )}

              {isPayPal && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 22, marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>Pay with PayPal</div>
                  {initLoading ? (
                    <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Connecting to PayPal…</div>
                  ) : initData ? (
                    <div id="upgrade-paypal-button-container" style={{ minHeight: 50 }} />
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
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>New modules:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {selectedModules.map(m => (
                      <span key={m.key} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 10, fontSize: 11, color: '#475569' }}>{m.label}</span>
                    ))}
                  </div>
                </div>
                <div style={{ borderTop: '1.5px dashed #e2e8f0', paddingTop: 12, marginTop: 12, marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>Total</span>
                    <div style={{ fontWeight: 900, fontSize: 22, color: '#2563eb' }}>${totalUsd}<span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>/mo</span></div>
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
      </DashboardLayout>
    );
  }

  // ── Step 1: Select modules ─────────────────────────────────────────────
  return (
    <DashboardLayout title="Upgrade Modules">
      <div style={{ maxWidth: 1000 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Upgrade Modules</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Purchase additional modules for your account</p>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 16 }}>
              {modules.map(mod => {
                const style = CATEGORY_STYLE[mod.key] ?? DEFAULT_STYLE;
                const CatIcon = style.icon;
                const isOwned = owned.includes(mod.key);
                const active = selected.includes(mod.key);
                const locked = mod.key === 'invoice' && requiredDeps.includes('invoice');

                return (
                  <div key={mod.key} onClick={() => toggleModule(mod.key)} style={{
                    padding: '16px 14px', borderRadius: 10, position: 'relative', userSelect: 'none',
                    cursor: isOwned || locked ? 'not-allowed' : 'pointer',
                    border: `1.5px solid ${active ? style.color : isOwned ? '#d1fae5' : '#e2e8f0'}`,
                    background: isOwned ? '#f0fdf4' : active ? style.bg : '#fff',
                    opacity: isOwned ? 0.85 : 1,
                    boxShadow: active ? `0 2px 10px ${style.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
                  }}>
                    {(active || isOwned) && (
                      <div style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%', background: isOwned ? '#059669' : style.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <HiCheck size={10} />
                      </div>
                    )}
                    <CatIcon size={22} style={{ color: isOwned ? '#059669' : active ? style.color : '#9ca3af', marginBottom: 8 }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: isOwned ? '#059669' : active ? style.color : '#111827', marginBottom: 2 }}>{mod.label}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, lineHeight: 1.3 }}>{mod.description}</div>
                    <div style={{ fontSize: 10, marginBottom: 8, fontWeight: 600, color: isOwned ? '#059669' : locked ? style.color : '#6b7280' }}>
                      {isOwned ? '✓ Purchased' : locked ? 'Required dependency' : style.badge}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: isOwned ? '#059669' : active ? style.color : '#6b7280' }}>
                      {isOwned ? 'Active' : `$${mod.price_usd}/mo`}
                    </div>
                  </div>
                );
              })}
            </div>

            {dependencyErrors.length > 0 && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {dependencyErrors.map(message => <span key={message}>{message}</span>)}
              </div>
            )}

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{selected.length} module{selected.length !== 1 ? 's' : ''} selected</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>${totalUsd}<span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>/mo</span></div>
              </div>
              <button
                onClick={handleContinue}
                disabled={!canProceed}
                style={{
                  padding: '12px 32px', borderRadius: 10, border: 'none',
                  background: canProceed ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
                  color: canProceed ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700,
                  cursor: canProceed ? 'pointer' : 'not-allowed',
                }}>Continue to Payment →</button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
