'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { adminService, CreateAdminPayload } from '@/lib/services/adminService';
import { packageService } from '@/lib/services/packageService';
import { Package } from '@/types';
import { HiArrowLeft } from 'react-icons/hi2';
import SubmitButton from '@/components/ui/SubmitButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import PhoneInput from '@/components/ui/PhoneInput';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function NewAdminPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<Package[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm_password: '',
    phone: '', package_id: '',
    subscription_status: 'trial' as 'trial' | 'active' | 'suspended',
    trial_ends_at: '', subscription_ends_at: '',
  });

  useEffect(() => {
    packageService.getAll().then(setPackages).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    if (form.password !== form.confirm_password) { setPwdErr('Passwords do not match'); return; }
    setSaving(true); setError(''); setPwdErr('');
    try {
      const payload: CreateAdminPayload = {
        name: form.name, email: form.email, password: form.password,
        phone: form.phone || undefined,
        package_id: form.package_id ? Number(form.package_id) : null,
        subscription_status: form.subscription_status,
        trial_ends_at: form.trial_ends_at || undefined,
        subscription_ends_at: form.subscription_ends_at || undefined,
      };
      await adminService.create(payload);
      router.push('/super-admin/admins');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message ?? 'Failed to create admin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminLayout>
      <LoadingOverlay show={saving} message="Creating Admin…" />
      <div style={{ maxWidth: 700, padding: '28px 32px' }}>
        <button
          onClick={() => router.push('/super-admin/admins')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}
        >
          <HiArrowLeft size={16} /> Back to Company Admins
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Create Company Admin</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Add a new company admin account</p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 28 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 20 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Account Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Full Name *</label>
                  <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="John Smith" />
                </div>
                <div>
                  <label style={lbl}>Email Address *</label>
                  <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="john@company.com" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: pwdErr ? 4 : 16 }}>
                <div>
                  <label style={lbl}>Password *</label>
                  <input style={inp} type="password" value={form.password} onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setPwdErr(''); }} required placeholder="Min 8 characters" />
                </div>
                <div>
                  <label style={lbl}>Confirm Password *</label>
                  <input style={inp} type="password" value={form.confirm_password} onChange={e => { setForm(f => ({ ...f, confirm_password: e.target.value })); setPwdErr(''); }} required />
                </div>
              </div>
              {pwdErr && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 16 }}>{pwdErr}</div>}
              <div>
                <label style={lbl}>Phone Number</label>
                <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Subscription</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Package</label>
                  <select style={inp} value={form.package_id} onChange={e => setForm(f => ({ ...f, package_id: e.target.value }))}>
                    <option value="">— No Package —</option>
                    {packages.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.tier})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Subscription Status *</label>
                  <select style={inp} value={form.subscription_status} onChange={e => setForm(f => ({ ...f, subscription_status: e.target.value as typeof form.subscription_status }))}>
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lbl}>Trial Ends At</label>
                  <input style={inp} type="date" value={form.trial_ends_at} onChange={e => setForm(f => ({ ...f, trial_ends_at: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Subscription Ends At</label>
                  <input style={inp} type="date" value={form.subscription_ends_at} onChange={e => setForm(f => ({ ...f, subscription_ends_at: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={() => router.push('/super-admin/admins')} disabled={saving} style={{ padding: '10px 24px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
              <SubmitButton loading={saving} loadingText="Creating Admin…" style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: saving ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                Create Admin
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
