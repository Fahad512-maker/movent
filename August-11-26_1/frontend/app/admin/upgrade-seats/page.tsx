'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import GatewayPaymentStep, { GatewayChargeFields } from '@/components/billing/GatewayPaymentStep';
import toast from 'react-hot-toast';
import { seatPurchaseService, SeatCatalog, TierOption } from '@/lib/services/seatPurchaseService';
import { getToken, setAuthData } from '@/lib/auth';
import { Admin } from '@/types';

type PurchaseType = 'seats' | 'companies';

function UpgradeSeatsContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [type, setType] = useState<PurchaseType>(params.get('type') === 'companies' ? 'companies' : 'seats');
  const [step, setStep] = useState<'select' | 'payment' | 'done'>('select');
  const [catalog, setCatalog] = useState<SeatCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedValue, setSelectedValue] = useState<number | null | undefined>(undefined);
  const [purchasedAdmin, setPurchasedAdmin] = useState<Admin | null>(null);

  useEffect(() => {
    seatPurchaseService.catalog()
      .then(setCatalog)
      .catch(() => toast.error('Failed to load pricing'))
      .finally(() => setLoading(false));
  }, []);

  const tiers: TierOption[] = type === 'seats' ? catalog?.seat_tiers ?? [] : catalog?.company_tiers ?? [];
  const current = type === 'seats' ? catalog?.current.max_users_per_company ?? null : catalog?.current.max_companies ?? null;
  const isUpgrade = (v: number | null) => current === null ? false : (v === null || v > current);
  const selectedTier = tiers.find(t => t.value === selectedValue);

  const switchType = (next: PurchaseType) => {
    setType(next);
    setSelectedValue(undefined);
  };

  const handlePurchase = async (gateway: 'stripe' | 'paypal' | 'authorize_net', fields: GatewayChargeFields) => {
    const admin = await seatPurchaseService.purchase({ type, tier_value: selectedValue ?? null, gateway, ...fields });
    setAuthData(getToken()!, admin, 'admin');
    window.dispatchEvent(new Event('auth_refreshed'));
    setPurchasedAdmin(admin);
    setStep('done');
  };

  if (step === 'done') {
    return (
      <DashboardLayout title="Upgrade">
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ width: 80, height: 80, background: '#ecfdf5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 44 }}>✅</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>
              {type === 'seats' ? 'Seat Limit Upgraded!' : 'Company Slots Upgraded!'}
            </h2>
            <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              {type === 'seats'
                ? `Your client portal seat limit per company is now ${purchasedAdmin?.max_users_per_company ?? 'Unlimited'}.`
                : `Your company slot limit is now ${purchasedAdmin?.max_companies ?? 'Unlimited'}.`}
            </p>
            <button onClick={() => router.push('/admin/plan')} style={{
              padding: '13px 36px', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', borderRadius: 50,
              color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
            }}>Go to Plan →</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (step === 'payment' && selectedTier) {
    return (
      <DashboardLayout title="Upgrade">
        <GatewayPaymentStep
          amountUsd={selectedTier.price_usd}
          summaryLabel={type === 'seats' ? 'New seat limit:' : 'New company limit:'}
          summaryChips={[selectedTier.label]}
          onBack={() => setStep('select')}
          onPurchase={handlePurchase}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Upgrade">
      <div style={{ maxWidth: 780 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Upgrade Seats / Company Slots</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Raise your account's client-portal seat or company limits</p>
        </div>

        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 20 }}>
          {(['seats', 'companies'] as PurchaseType[]).map(t => (
            <button key={t} onClick={() => switchType(t)} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: type === t ? '#fff' : 'transparent',
              color: type === t ? '#0f172a' : '#64748b',
              fontWeight: 700, fontSize: 13,
              boxShadow: type === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              {t === 'seats' ? 'Client Portal Seats' : 'Company Slots'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : current === null ? (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '40px 24px', textAlign: 'center', color: '#64748b' }}>
            You're already on the <strong>Unlimited</strong> tier — nothing to upgrade.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#475569' }}>
              Your current limit: <strong>{current} {type === 'seats' ? 'users per company' : 'companies'}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
              {tiers.map(tier => {
                const disabled = !isUpgrade(tier.value);
                const active = selectedValue === tier.value;
                return (
                  <div key={tier.label} onClick={() => { if (!disabled) setSelectedValue(tier.value); }} style={{
                    padding: '18px 16px', borderRadius: 10, position: 'relative', userSelect: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    border: `1.5px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                    background: disabled ? '#f8fafc' : active ? '#eff6ff' : '#fff',
                    opacity: disabled ? 0.6 : 1,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#2563eb' : '#0f172a', marginBottom: 6 }}>{tier.label}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                      {tier.value === current ? 'Current plan' : disabled ? 'Already included' : `$${tier.price_usd}/mo`}
                    </div>
                    {tier.value === current && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', padding: '2px 8px', borderRadius: 10, background: '#ecfdf5' }}>CURRENT</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>
                  {selectedTier ? `Upgrading to ${selectedTier.label}` : 'Select a tier above'}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {selectedTier ? `$${selectedTier.price_usd}/mo` : '—'}
                </div>
              </div>
              <button
                onClick={() => setStep('payment')}
                disabled={!selectedTier}
                style={{
                  padding: '12px 32px', borderRadius: 10, border: 'none',
                  background: selectedTier ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
                  color: selectedTier ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700,
                  cursor: selectedTier ? 'pointer' : 'not-allowed',
                }}>Continue to Payment →</button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function UpgradeSeatsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ color: '#6b7280', fontSize: 15 }}>Loading…</div>
      </div>
    }>
      <UpgradeSeatsContent />
    </Suspense>
  );
}
