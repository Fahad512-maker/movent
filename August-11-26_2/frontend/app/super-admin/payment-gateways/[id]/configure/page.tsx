'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { paymentGatewayService, PaymentGateway } from '@/lib/services/paymentGatewayService';
import { HiArrowLeft, HiCheckCircle, HiXCircle } from 'react-icons/hi2';

const GATEWAY_META: Record<string, {
  color: string; bg: string; icon: string;
  fields: { key: string; label: string; secret?: boolean; hint?: string }[];
}> = {
  stripe: {
    color: '#635bff', bg: '#f0efff', icon: 'S',
    fields: [
      { key: 'publishable_key', label: 'Publishable Key',  hint: 'Starts with pk_test_ or pk_live_' },
      { key: 'secret_key',      label: 'Secret Key',       secret: true, hint: 'Starts with sk_test_ or sk_live_ — backend only, never exposed' },
      { key: 'webhook_secret',  label: 'Webhook Secret',   secret: true, hint: 'Starts with whsec_ — found in Stripe Dashboard → Webhooks' },
    ],
  },
  paypal: {
    color: '#003087', bg: '#e8f0fe', icon: 'P',
    fields: [
      { key: 'client_id',     label: 'Client ID',     hint: 'Found in PayPal Developer Dashboard → Apps & Credentials' },
      { key: 'client_secret', label: 'Client Secret', secret: true, hint: 'Keep this secret — backend only' },
    ],
  },
  authorize_net: {
    color: '#e31837', bg: '#fdecea', icon: 'A',
    fields: [
      { key: 'api_login_id',    label: 'API Login ID',             hint: 'Found in Authorize.net Account → Settings → API Login ID' },
      { key: 'transaction_key', label: 'Transaction Key',          secret: true, hint: 'Generated in Security Settings' },
      { key: 'client_key',      label: 'Client Key (Accept.js)',   hint: 'Generated in Security Settings → Manage Public Client Key' },
    ],
  },
};

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function ConfigureGatewayPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [gateway, setGateway]     = useState<PaymentGateway | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');
  const [mode, setMode]           = useState<string>('sandbox');
  const [fields, setFields]       = useState<Record<string, string>>({});
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    paymentGatewayService.getAll()
      .then(list => {
        const gw = list.find(g => g.id === id);
        if (!gw) { setError('Gateway not found'); return; }
        setGateway(gw);
        setMode(gw.config?.mode ?? 'sandbox');
        const meta = GATEWAY_META[gw.name];
        setFields(Object.fromEntries((meta?.fields ?? []).map(f => [f.key, gw.config?.[f.key] ?? ''])));
      })
      .catch(() => setError('Failed to load gateway'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false); setTestResult(null);
    try {
      await paymentGatewayService.updateConfig(id, { ...fields, mode });
      setSaved(true);
      setTimeout(() => router.push('/super-admin/payment-gateways'), 1200);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setError(ex.response?.data?.message ?? 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await paymentGatewayService.testConnection(id);
      setTestResult({ ok: res.success, msg: res.message });
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setTestResult({ ok: false, msg: ex.response?.data?.message ?? 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const meta = gateway ? GATEWAY_META[gateway.name] : null;
  const acceptJsUrl = gateway?.name === 'authorize_net'
    ? (mode === 'live' ? 'https://js.authorize.net/v1/Accept.js' : 'https://jstest.authorize.net/v1/Accept.js')
    : null;

  return (
    <SuperAdminLayout>
      <div style={{ maxWidth: 640, padding: '28px 32px' }}>
        <button
          onClick={() => router.push('/super-admin/payment-gateways')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}
        >
          <HiArrowLeft size={16} /> Back to Payment Gateways
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {/* Header */}
          {gateway && meta && (
            <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, color: meta.color }}>
                {meta.icon}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{gateway.display_name} Configuration</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Platform-level gateway for registration payments</span>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: gateway.is_active ? '#dcfce7' : '#f1f5f9', color: gateway.is_active ? '#16a34a' : '#94a3b8' }}>
                    {gateway.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: mode === 'live' ? '#fef9c3' : '#f0f9ff', color: mode === 'live' ? '#854d0e' : '#0369a1' }}>
                    {mode === 'live' ? 'Live' : 'Sandbox'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : error && !gateway ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#ef4444' }}>{error}</div>
          ) : (
            <form onSubmit={handleSubmit} style={{ padding: 28 }}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 20 }}>
                  {error}
                </div>
              )}
              {saved && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', color: '#16a34a', fontSize: 13, marginBottom: 20 }}>
                  ✓ Configuration saved! Redirecting…
                </div>
              )}

              {/* Mode toggle */}
              <div style={{ marginBottom: 24 }}>
                <label style={lbl}>Environment Mode</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['sandbox', 'live'] as const).map(m => (
                    <button
                      key={m} type="button"
                      onClick={() => setMode(m)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid',
                        borderColor: mode === m ? '#2563eb' : '#e2e8f0',
                        background: mode === m ? '#eff6ff' : '#fff',
                        color: mode === m ? '#2563eb' : '#64748b',
                        fontWeight: mode === m ? 700 : 400,
                        fontSize: 14, cursor: 'pointer',
                      }}
                    >{m === 'sandbox' ? 'Sandbox / Test' : 'Live / Production'}</button>
                  ))}
                </div>
                {mode === 'live' && (
                  <p style={{ fontSize: 12, color: '#d97706', marginTop: 8, padding: '8px 12px', background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a' }}>
                    ⚠ Live mode — real charges will be made. Double-check all credentials before saving.
                  </p>
                )}
                {mode === 'sandbox' && (
                  <p style={{ fontSize: 12, color: '#0369a1', marginTop: 8, padding: '8px 12px', background: '#f0f9ff', borderRadius: 6, border: '1px solid #bae6fd' }}>
                    Test mode — no real transactions. Safe for development and QA.
                  </p>
                )}
              </div>

              {/* API Credential fields */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ ...lbl, marginBottom: 14 }}>API Credentials</label>
                {meta?.fields.map(f => (
                  <div key={f.key} style={{ marginBottom: 16 }}>
                    <label style={lbl}>
                      {f.label}
                      {f.secret && <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>backend-only · encrypted</span>}
                    </label>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      value={fields[f.key] ?? ''}
                      onChange={e => { setFields(p => ({ ...p, [f.key]: e.target.value })); setTestResult(null); }}
                      placeholder={`Enter ${f.label}`}
                      autoComplete="off"
                      style={{ ...inp, fontFamily: f.secret ? 'monospace' : 'inherit' }}
                    />
                    {f.hint && <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>{f.hint}</p>}
                  </div>
                ))}

                {/* Accept.js URL (Authorize.Net — computed, read-only) */}
                {acceptJsUrl && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Accept.js Library URL <span style={{ fontWeight: 400, fontSize: 10, textTransform: 'none', color: '#94a3b8' }}>auto-computed from mode</span></label>
                    <div style={{ ...inp, background: '#f8fafc', color: '#475569', fontFamily: 'monospace', fontSize: 12, display: 'flex', alignItems: 'center' }}>
                      {acceptJsUrl}
                    </div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Include this script on your payment page to use Accept.js</p>
                  </div>
                )}
              </div>

              {/* Security note */}
              <div style={{ padding: '12px 16px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
                  🔒 Secret keys are masked in the UI and stored securely. They are never exposed to the browser.
                </p>
              </div>

              {/* Test result */}
              {testResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', borderRadius: 8, background: testResult.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}` }}>
                  {testResult.ok
                    ? <HiCheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                    : <HiXCircle    size={18} style={{ color: '#dc2626', flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, color: testResult.ok ? '#15803d' : '#dc2626' }}>{testResult.msg}</span>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 20, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => router.push('/super-admin/payment-gateways')}
                  style={{ padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || saving}
                  style={{ padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 14, fontWeight: 500, cursor: testing || saving ? 'not-allowed' : 'pointer', opacity: testing || saving ? 0.6 : 1 }}
                >
                  {testing ? '⏳ Testing…' : '🔌 Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ marginLeft: 'auto', padding: '10px 32px', borderRadius: 8, border: 'none', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Saving…' : 'Save Configuration'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
