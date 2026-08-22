'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { packageService, PackagePayload } from '@/lib/services/packageService';
import { moduleService, ModuleItem } from '@/lib/services/moduleService';
import { Package } from '@/types';
import { HiArrowLeft } from 'react-icons/hi2';
import SubmitButton from '@/components/ui/SubmitButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function NewPackagePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modulesLoading, setModulesLoading] = useState(true);
  const [availableModules, setAvailableModules] = useState<ModuleItem[]>([]);
  const [form, setForm] = useState({
    name: '', tier: 'basic' as Package['tier'], price: '',
    price_usd: '', trial_days: '14',
    billing_cycle: 'monthly' as Package['billing_cycle'],
    max_companies: '', max_users_per_company: '',
    description: '', is_visible: true, is_popular: false,
    modules: [] as string[],
  });

  useEffect(() => {
    moduleService.getAll()
      .then(all => setAvailableModules(all.filter(m => m.is_active)))
      .catch(() => {})
      .finally(() => setModulesLoading(false));
  }, []);

  const toggleModule = (mod: ModuleItem) =>
    setForm(f => {
      const checked = mod.sub_modules.every(m => f.modules.includes(m));
      return checked
        ? { ...f, modules: f.modules.filter(m => !mod.sub_modules.includes(m)) }
        : { ...f, modules: [...new Set([...f.modules, ...mod.sub_modules])] };
    });

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    if (form.modules.length === 0) { setError('Select at least one module'); return; }
    setSaving(true); setError('');
    try {
      const payload: PackagePayload = {
        name: form.name, tier: form.tier,
        price: Number(form.price),
        price_usd: form.price_usd ? Number(form.price_usd) : null,
        billing_cycle: form.billing_cycle,
        trial_days: form.trial_days ? Number(form.trial_days) : null,
        max_companies: form.max_companies ? Number(form.max_companies) : null,
        max_users_per_company: form.max_users_per_company ? Number(form.max_users_per_company) : null,
        description: form.description || null,
        is_visible: form.is_visible,
        is_popular: form.is_popular,
        modules: form.modules,
      };
      await packageService.create(payload);
      router.push('/super-admin/packages');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message ?? 'Failed to create package');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminLayout>
      <LoadingOverlay show={saving} message="Creating Package…" />
      <div style={{ maxWidth: 760, padding: '28px 32px' }}>
        <button
          onClick={() => router.push('/super-admin/packages')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}
        >
          <HiArrowLeft size={16} /> Back to Packages
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Create New Package</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Define a new subscription plan for your customers</p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 28 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 20 }}>
                {error}
              </div>
            )}

            {/* Basic Info */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Basic Information</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Package Name *</label>
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Business Pro" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Tier *</label>
                  <select style={inp} value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as Package['tier'] }))}>
                    <option value="basic">Basic</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Billing Cycle *</label>
                  <select style={inp} value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value as Package['billing_cycle'] }))}>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Description</label>
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description shown on pricing page..." />
              </div>
            </div>

            {/* Pricing */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Pricing</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lbl}>Base Price (USD) *</label>
                  <input style={inp} type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required placeholder="0.00" />
                </div>
                <div>
                  <label style={lbl}>Trial Days</label>
                  <input style={inp} type="number" min="0" value={form.trial_days} onChange={e => setForm(f => ({ ...f, trial_days: e.target.value }))} placeholder="14" />
                </div>
              </div>
            </div>

            {/* Limits */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Limits</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lbl}>Max Companies</label>
                  <input style={inp} type="number" min="1" value={form.max_companies} onChange={e => setForm(f => ({ ...f, max_companies: e.target.value }))} placeholder="Unlimited" />
                </div>
                <div>
                  <label style={lbl}>Max Users Per Company</label>
                  <input style={inp} type="number" min="1" value={form.max_users_per_company} onChange={e => setForm(f => ({ ...f, max_users_per_company: e.target.value }))} placeholder="Unlimited" />
                </div>
              </div>
            </div>

            {/* Visibility */}
            <div style={{ marginBottom: 28, display: 'flex', gap: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_visible} onChange={e => setForm(f => ({ ...f, is_visible: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#7c3aed' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Visible on pricing page</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_popular} onChange={e => setForm(f => ({ ...f, is_popular: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#7c3aed' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Mark as Popular</span>
              </label>
            </div>

            {/* Modules */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Modules <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none', fontSize: 12 }}>({form.modules.length} selected)</span>
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
                Select which modules are included in this package. Manage the list under <a href="/super-admin/modules" style={{ color: '#7c3aed' }}>Modules</a>.
              </p>
              {modulesLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading modules…</div>
              ) : availableModules.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No active modules. Add one under Modules first.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {availableModules.map(mod => {
                    const checked = mod.sub_modules.every(m => form.modules.includes(m));
                    return (
                      <label key={mod.key} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '10px 12px', borderRadius: 8,
                        cursor: 'pointer',
                        background: checked ? 'rgba(124,58,237,0.07)' : '#fafafa',
                        border: `1.5px solid ${checked ? '#a78bfa' : '#e2e8f0'}`,
                        transition: 'all 0.12s',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleModule(mod)}
                          style={{ accentColor: '#7c3aed', width: 14, height: 14, marginTop: 2, cursor: 'pointer' }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: checked ? 600 : 500, color: checked ? '#6d28d9' : '#334155' }}>{mod.label}</div>
                          {mod.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{mod.description}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={() => router.push('/super-admin/packages')} disabled={saving} style={{ padding: '10px 24px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
              <SubmitButton loading={saving} loadingText="Creating Package…" style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: saving ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                Create Package
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
