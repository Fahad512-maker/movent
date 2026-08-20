'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { paymentGatewayService, PaymentGateway } from '@/lib/services/paymentGatewayService';
import toast from 'react-hot-toast';

const GATEWAY_META: Record<string, { color: string; bg: string; icon: string }> = {
  stripe:        { color: '#635bff', bg: '#f0efff', icon: 'S' },
  paypal:        { color: '#003087', bg: '#e8f0fe', icon: 'P' },
  authorize_net: { color: '#e31837', bg: '#fdecea', icon: 'A' },
};

function ToggleSwitch({ active, onChange, loading }: { active: boolean; onChange: () => void; loading: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: active ? '#2563eb' : '#cbd5e1',
        border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s', padding: 0,
        opacity: loading ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: active ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left 0.2s', display: 'block',
      }} />
    </button>
  );
}

export default function PaymentGatewaysPage() {
  const router = useRouter();
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentGatewayService.getAll()
      .then(setGateways)
      .catch(() => setError('Failed to load payment gateways'))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (gateway: PaymentGateway) => {
    setToggling(gateway.id);
    try {
      const updated = await paymentGatewayService.toggle(gateway.id);
      setGateways(prev => prev.map(g => g.id === updated.id ? updated : g));
      toast.success(updated.is_active ? 'Gateway enabled' : 'Gateway disabled');
    } catch {
      setError('Failed to update gateway status');
      toast.error('Failed to update gateway status');
    } finally {
      setToggling(null);
    }
  };

  const activeCount = gateways.filter(g => g.is_active).length;

  return (
    <SuperAdminLayout>
      <div style={{ padding: '28px 32px', maxWidth: 880 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Payment Gateways</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            Manage which payment gateways are available for subscription payments.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Active</span>
              <span style={{ background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: 15, padding: '2px 10px', borderRadius: 20 }}>{activeCount}</span>
            </div>
            <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 10, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Total</span>
              <span style={{ background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 15, padding: '2px 10px', borderRadius: 20 }}>{gateways.length}</span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#dc2626', marginBottom: 20, fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {gateways.map(gateway => {
              const meta = GATEWAY_META[gateway.name];
              const hasConfig = gateway.config && Object.entries(gateway.config).some(([k, v]) => k !== 'mode' && v);

              return (
                <div
                  key={gateway.id}
                  style={{
                    background: '#fff',
                    border: `1px solid ${gateway.is_active ? '#e0f2fe' : '#f1f5f9'}`,
                    borderRadius: 14,
                    boxShadow: gateway.is_active ? '0 2px 12px rgba(37,99,235,0.06)' : '0 1px 3px rgba(0,0,0,0.04)',
                    padding: '22px 24px',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    opacity: gateway.is_active ? 1 : 0.75,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 12,
                      background: meta?.bg ?? '#f1f5f9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 20, color: meta?.color ?? '#475569', flexShrink: 0,
                    }}>
                      {meta?.icon ?? gateway.display_name[0]}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{gateway.display_name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: gateway.is_active ? '#dcfce7' : '#f1f5f9', color: gateway.is_active ? '#16a34a' : '#94a3b8' }}>
                          {gateway.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {gateway.config?.mode && (
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: gateway.config.mode === 'live' ? '#fef9c3' : '#f0f9ff', color: gateway.config.mode === 'live' ? '#854d0e' : '#0369a1' }}>
                            {gateway.config.mode === 'live' ? 'Live' : 'Sandbox'}
                          </span>
                        )}
                        {hasConfig && (
                          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a' }}>
                            ✓ Configured
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', lineHeight: 1.5 }}>
                        {gateway.description}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                      <button
                        onClick={() => router.push(`/super-admin/payment-gateways/${gateway.id}/configure`)}
                        style={{
                          padding: '7px 16px', borderRadius: 8, fontSize: 13,
                          border: '1.5px solid #e2e8f0', background: '#fff',
                          color: '#475569', cursor: 'pointer', fontWeight: 500,
                        }}
                      >
                        ⚙ Configure
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          {gateway.is_active ? 'Enabled' : 'Disabled'}
                        </span>
                        <ToggleSwitch
                          active={gateway.is_active}
                          onChange={() => handleToggle(gateway)}
                          loading={toggling === gateway.id}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 24, padding: '14px 18px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
          <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
            Only active payment gateways will be shown to customers during checkout.
            Configure API credentials before going live. Use <strong>Sandbox</strong> mode for testing.
          </p>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
