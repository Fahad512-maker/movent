'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminClientService, ClientPayload } from '@/lib/services/adminClientService';
import { userClientService } from '@/lib/services/userClientService';
import { getAuthType } from '@/lib/auth';
import { Client } from '@/types';
import { HiArrowLeft } from 'react-icons/hi2';

const inp: React.CSSProperties = { width: '100%', padding: '10px 13px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function EditClientPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const isSubUser = getAuthType() === 'user';

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [form, setForm] = useState<Partial<ClientPayload>>({});

  useEffect(() => {
    const load = isSubUser ? userClientService.getOne(clientId) : adminClientService.getOne(clientId).then(r => r.client);
    load.then(c => {
      setClient(c);
      setForm({
        name: c.name,
        email: c.email ?? '',
        phone: c.phone ?? '',
        company_name: c.company_name ?? '',
        address: c.address ?? '',
        notes: c.notes ?? '',
        status: c.status,
      });
    }).catch(() => setError('Failed to load client')).finally(() => setLoading(false));
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = {
      name:         form.name,
      email:        form.email  || null,
      phone:        form.phone  || null,
      company_name: form.company_name || null,
      address:      form.address || null,
      notes:        form.notes   || null,
      status:       form.status,
    };
    try {
      if (isSubUser) {
        await userClientService.update(clientId, payload);
      } else {
        await adminClientService.update(clientId, payload);
      }
      router.push(`/clients/${clientId}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = e.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(e.response?.data?.message ?? 'Failed to update client');
    } finally { setSaving(false); }
  };

  if (loading) return <DashboardLayout title="Edit Client"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!client) return <DashboardLayout title="Edit Client"><div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>Client not found.</div></DashboardLayout>;

  return (
    <DashboardLayout title="Edit Client">
      <div style={{ maxWidth: 720 }}>
        <button onClick={() => router.push(`/clients/${clientId}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to {client.name}
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Edit Client</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Update client information</p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 28 }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 20 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input style={inp} value={form.name ?? ''} onChange={e => set('name', e.target.value)} required placeholder="Jane Smith" />
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
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.address ?? ''} onChange={e => set('address', e.target.value)} placeholder="Street, City, Country" />
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Internal notes…" />
              </div>
            </div>
            <div style={{ marginBottom: 28 }}>
              <label style={lbl}>Status</label>
              <select style={{ ...inp, width: 'auto', minWidth: 160 }} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={() => router.push(`/clients/${clientId}`)} style={{ padding: '10px 24px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
