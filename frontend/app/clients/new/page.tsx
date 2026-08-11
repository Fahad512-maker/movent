'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminClientService, ClientCompany, ClientPayload } from '@/lib/services/adminClientService';
import { userClientService } from '@/lib/services/userClientService';
import { getAuthType } from '@/lib/auth';
import { HiArrowLeft } from 'react-icons/hi2';

const inp: React.CSSProperties = { width: '100%', padding: '10px 13px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function NewClientPage() {
  const router = useRouter();
  const isSubUser = getAuthType() === 'user';
  const [companies, setCompanies] = useState<ClientCompany[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm] = useState<ClientPayload & { portal_email: string; portal_password: string; enable_portal: boolean }>({
    company_id: 0, name: '', email: '', phone: '', company_name: '', address: '', notes: '', status: 'active',
    enable_portal: false, portal_email: '', portal_password: '',
  });

  useEffect(() => {
    // A sub-user belongs to a single company (inferred server-side from
    // their own token) — there's no company picker for them, unlike Company
    // Admin who manages multiple companies.
    if (isSubUser) return;
    adminClientService.companies().then(cs => {
      setCompanies(cs);
      if (cs.length) setForm(f => ({ ...f, company_id: cs[0].id }));
    }).catch(() => {});
  }, [isSubUser]);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isSubUser && !form.company_id) { setError('Please select a company'); return; }
    setSaving(true); setError('');
    try {
      if (isSubUser) {
        await userClientService.create({
          name:         form.name,
          email:        form.email  || null,
          phone:        form.phone  || null,
          company_name: form.company_name || null,
          address:      form.address || null,
          notes:        form.notes   || null,
          status:       form.status,
        });
      } else {
        await adminClientService.create({
          company_id:   form.company_id,
          name:         form.name,
          email:        form.email  || null,
          phone:        form.phone  || null,
          company_name: form.company_name || null,
          address:      form.address || null,
          notes:        form.notes   || null,
          status:       form.status,
          ...(form.enable_portal ? {
            enable_portal:   true,
            portal_email:    form.portal_email,
            portal_password: form.portal_password,
          } : {}),
        } as ClientPayload);
      }
      router.push('/clients');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = e.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(e.response?.data?.message ?? 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Add Client">
      <div style={{ maxWidth: 720 }}>
        <button onClick={() => router.push('/clients')} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to Clients
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Add New Client</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Create a client profile and optionally grant portal access</p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 28 }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 20 }}>{error}</div>}

            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Client Details</h3>
              {!isSubUser && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Company *</label>
                  <select style={inp} value={form.company_id} onChange={e => set('company_id', Number(e.target.value))}>
                    <option value={0}>Select company…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Full Name *</label>
                  <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Jane Smith" />
                </div>
                <div>
                  <label style={lbl}>Client Company</label>
                  <input style={inp} value={form.company_name ?? ''} onChange={e => set('company_name', e.target.value)} placeholder="Acme Corp" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={inp} type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="jane@acme.com" />
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <input style={inp} value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+92 300 0000000" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Address</label>
                  <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.address ?? ''} onChange={e => set('address', e.target.value)} placeholder="Street, City, Country" />
                </div>
                <div>
                  <label style={lbl}>Notes</label>
                  <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Internal notes…" />
                </div>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={{ ...inp, width: 'auto', minWidth: 160 }} value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </div>

            {/* Portal access — Company Admin only, no sub-user equivalent feature */}
            {!isSubUser && (
            <div style={{ marginBottom: 28, padding: 18, background: form.enable_portal ? '#eff6ff' : '#f8fafc', borderRadius: 10, border: `1.5px solid ${form.enable_portal ? '#bfdbfe' : '#e2e8f0'}` }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.enable_portal ? 16 : 0 }}>
                <input type="checkbox" checked={form.enable_portal} onChange={e => set('enable_portal', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: form.enable_portal ? '#1d4ed8' : '#475569' }}>Enable Client Portal Access</span>
              </label>
              {form.enable_portal && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 4 }}>
                  <div>
                    <label style={lbl}>Portal Email *</label>
                    <input style={inp} type="email" value={form.portal_email} onChange={e => set('portal_email', e.target.value)} required={form.enable_portal} placeholder="client@portal.com" />
                  </div>
                  <div>
                    <label style={lbl}>Portal Password *</label>
                    <input style={inp} type="password" value={form.portal_password} onChange={e => set('portal_password', e.target.value)} required={form.enable_portal} placeholder="Min 6 characters" />
                  </div>
                </div>
              )}
            </div>
            )}

            <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={() => router.push('/clients')} style={{ padding: '10px 24px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Create Client'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
