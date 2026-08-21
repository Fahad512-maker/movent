'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import PhoneInput from '@/components/ui/PhoneInput';
import { ALL_COUNTRIES } from '@/lib/countries';

interface FormState {
  name: string;
  currency: string;
  industry: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
  country: string;
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'UTC',
];

const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Retail', 'Education',
  'Manufacturing', 'Real Estate', 'Marketing', 'Legal', 'Other',
];

export default function EditCompanyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const companyId = Number(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: '', currency: 'USD', industry: '', email: '', phone: '', address: '', timezone: 'America/New_York', country: '',
  });

  useEffect(() => {
    api.get(`/admin/companies/${companyId}`).then(res => {
      const c = res.data.data;
      setForm({
        name:     c.name ?? '',
        currency: c.currency ?? 'USD',
        industry: c.industry ?? '',
        email:    c.email ?? '',
        phone:    c.phone ?? '',
        address:  c.address ?? '',
        timezone: c.timezone ?? 'Asia/Karachi',
        country:  c.country ?? '',
      });
    }).catch(() => toast.error('Failed to load company')).finally(() => setLoading(false));
  }, [companyId]);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const setCompanyName = (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, name: e.target.value }));

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      await api.put(`/admin/companies/${companyId}`, form);
      toast.success('Company updated!');
      router.push('/admin/plan');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg || 'Failed to update company');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0',
    borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
    color: '#1e293b',
  };
  const labelStyle = {
    display: 'block' as const, fontSize: 12, fontWeight: 600 as const,
    color: '#475569', marginBottom: 6,
  };

  if (loading) return <DashboardLayout title="Edit Company"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout title="Edit Company">
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
        <span
          onClick={() => router.push('/admin/plan')}
          style={{ cursor: 'pointer', color: '#2563eb' }}
        >My Plan</span>
        {' / '}
        <span style={{ color: '#1e293b', fontWeight: 600 }}>Edit Company</span>
      </div>

      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

          {/* Left: main details */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 22px' }}>
              Company Details
            </h2>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Company Name *</label>
              <input
                value={form.name}
                onChange={setCompanyName}
                placeholder="e.g. Acme Corp"
                style={inputStyle}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Currency *</label>
                <select value={form.currency} onChange={set('currency')} style={inputStyle}>
                  <option value="PKR">PKR — Pakistani Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Industry</label>
                <select value={form.industry} onChange={set('industry')} style={inputStyle}>
                  <option value="">— Select —</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="company@example.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Address</label>
              <textarea
                value={form.address}
                onChange={set('address')}
                placeholder="Company address…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Country</label>
                <select value={form.country} onChange={set('country')} style={inputStyle}>
                  <option value="">— Select —</option>
                  {ALL_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <select value={form.timezone} onChange={set('timezone')} style={inputStyle}>
                  {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Right: submit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 20px' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  width: '100%', padding: '12px 0', background: saving ? '#93c5fd' : '#2563eb',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                  marginBottom: 10,
                }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                style={{
                  width: '100%', padding: '10px 0', background: '#fff',
                  color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </form>
    </DashboardLayout>
  );
}
