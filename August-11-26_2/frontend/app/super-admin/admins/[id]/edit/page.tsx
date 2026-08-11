'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { adminService, UpdateAdminPayload } from '@/lib/services/adminService';
import { packageService } from '@/lib/services/packageService';
import { Package } from '@/types';
import { HiArrowLeft } from 'react-icons/hi2';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function EditAdminPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [loading, setLoading] = useState(true);
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
    Promise.all([adminService.getOne(id), packageService.getAll()])
      .then(([admin, pkgs]) => {
        setPackages(pkgs);
        setForm({
          name: admin.name,
          email: admin.email,
          password: '',
          confirm_password: '',
          phone: admin.phone ?? '',
          package_id: admin.package ? String(admin.package.id) : '',
          subscription_status: admin.subscription_status as 'trial' | 'active' | 'suspended',
          trial_ends_at: admin.trial_ends_at?.slice(0, 10) ?? '',
          subscription_ends_at: admin.subscription_ends_at?.slice(0, 10) ?? '',
        });
      })
      .catch(() => setError('Failed to load admin'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.password && form.password !== form.confirm_password) { setPwdErr('Passwords do not match'); return; }
    setSaving(true); setError(''); setPwdErr('');
    try {
      const payload: UpdateAdminPayload = {
        name: form.name, email: form.email,
        phone: form.phone || undefined,
        package_id: form.package_id ? Number(form.package_id) : null,
        subscription_status: form.subscription_status,
        trial_ends_at: form.trial_ends_at || undefined,
        subscription_ends_at: form.subscription_ends_at || undefined,
      };
      if (form.password) payload.password = form.password;
      await adminService.update(id, payload);
      router.push('/super-admin/admins');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message ?? 'Failed to update admin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div style={{ maxWidth: 700, padding: '28px 32px' }}>
        <button
          onClick={() => router.push('/super-admin/admins')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}
        >
          <HiArrowLeft size={16} /> Back to Company Admins
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Edit Company Admin</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Update admin account and subscription details</p>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : (
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
                    <label style={lbl}>New Password</label>
                    <input style={inp} type="password" value={form.password} onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setPwdErr(''); }} placeholder="Leave blank to keep current" />
                  </div>
                  <div>
                    <label style={lbl}>Confirm New Password</label>
                    <input style={inp} type="password" value={form.confirm_password} onChange={e => { setForm(f => ({ ...f, confirm_password: e.target.value })); setPwdErr(''); }} />
                  </div>
                </div>
                {pwdErr && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 16 }}>{pwdErr}</div>}
                <div>
                  <label style={lbl}>Phone Number</label>
                  <input style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
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
                <button type="button" onClick={() => router.push('/super-admin/admins')} style={{ padding: '10px 24px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: saving ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
