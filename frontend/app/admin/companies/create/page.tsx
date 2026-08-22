'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import SubmitButton from '@/components/ui/SubmitButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import PhoneInput from '@/components/ui/PhoneInput';
import { ALL_COUNTRIES } from '@/lib/countries';

interface FormState {
  name: string;
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

export default function CreateCompanyPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name:     '',
    industry: '',
    email:    '',
    phone:    '',
    address:  '',
    timezone: 'America/New_York',
    country:  '',
  });

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const setCompanyName = (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, name: e.target.value }));

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (saving) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      await api.post('/admin/companies', form);
      toast.success('Company created!');
      router.push('/admin/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg || 'Failed to create company');
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

  return (
    <DashboardLayout title="Add Company">
      <LoadingOverlay show={saving} message="Creating Account…" />
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
        <span
          onClick={() => router.push('/admin/dashboard')}
          style={{ cursor: 'pointer', color: '#2563eb' }}
        >Dashboard</span>
        {' / '}
        <span style={{ color: '#1e293b', fontWeight: 600 }}>Add Company</span>
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

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Industry</label>
              <select value={form.industry} onChange={set('industry')} style={inputStyle}>
                <option value="">— Select —</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
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

          {/* Right: info + submit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 12, padding: '18px 20px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 10 }}>
                About companies
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#3b82f6', lineHeight: 1.8 }}>
                <li>Each company has its own clients, projects, invoices</li>
                <li>Every invoice is raised in USD</li>
                <li>All your companies share the same client portal seat pool</li>
                <li>Modules are copied from your first company automatically</li>
                <li>You can manage which company a client belongs to on the client page</li>
              </ul>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 20px' }}>
              <SubmitButton
                loading={saving}
                loadingText="Creating Account…"
                style={{
                  width: '100%', padding: '12px 0', background: saving ? '#93c5fd' : '#2563eb',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 14, fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                Create Company
              </SubmitButton>
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
