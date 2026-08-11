'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

interface Company { id: number; name: string; currency: string }

const MODULES = [
  { key: 'projects',  label: 'Projects',        desc: 'View projects, tasks, progress' },
  { key: 'invoices',  label: 'Invoices',         desc: 'View invoices and request payments' },
  { key: 'payments',  label: 'Payment History',  desc: 'Read-only payment record' },
  { key: 'documents', label: 'Documents',        desc: 'Download shared files' },
  { key: 'chat',      label: 'Chat',             desc: 'Message with your team' },
  { key: 'support',   label: 'Support Tickets',  desc: 'Raise and track issues' },
  { key: 'reports',   label: 'Reports',          desc: 'Project and invoice reports' },
];

const defaultPerms = () =>
  Object.fromEntries(MODULES.map(m => [m.key, true])) as Record<string, boolean>;

const inp: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff',
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '24px 28px', marginBottom: 20 };

export default function CreateClientPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [saving,    setSaving]    = useState(false);
  const [showPwd,   setShowPwd]   = useState(false);
  const [perms,     setPerms]     = useState<Record<string, boolean>>(defaultPerms());

  const [form, setForm] = useState({
    company_id: '', name: '', email: '', phone: '',
    company_name: '', address: '', notes: '', status: 'active',
    enable_portal: false, portal_password: '',
  });

  useEffect(() => {
    api.get('/admin/companies').then(r => {
      const list: Company[] = r.data.data || [];
      setCompanies(list);
      if (list.length === 1) setF('company_id', String(list[0].id));
    }).catch(() => {});
  }, []);

  const setF = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const togglePerm = (key: string) => setPerms(p => ({ ...p, [key]: !p[key] }));

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (form.enable_portal && !form.email) {
      toast.error('Contact Email is required to enable Portal Access — it doubles as the login email.');
      return;
    }
    setSaving(true);
    try {
      // 1. Create client
      const res = await api.post('/admin/clients', {
        company_id:    Number(form.company_id),
        name:          form.name,
        email:         form.email || null,
        phone:         form.phone || null,
        company_name:  form.company_name || null,
        address:       form.address || null,
        notes:         form.notes || null,
        status:        form.status,
        enable_portal: form.enable_portal,
        portal_email:  form.enable_portal ? form.email : undefined,
        portal_password: form.enable_portal ? form.portal_password : undefined,
      });

      const clientId = res.data.data?.id;

      // 2. Save permissions (only if any differ from default all-true)
      const hasCustomPerms = Object.values(perms).some(v => !v);
      if (clientId && hasCustomPerms) {
        await api.put(`/admin/clients/${clientId}/permissions`, { permissions: perms });
      }

      toast.success('Client created!');
      router.push(clientId ? `/admin/clients/${clientId}` : '/admin/clients');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Add Client">

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Add New Client</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>Set details, portal access and permissions</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

          {/* ── Left ─────────────────────────────────────────────── */}
          <div>

            {/* Info card */}
            <div style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 18px' }}>Client Information</h3>

              {companies.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Company *</label>
                  <select value={form.company_id} onChange={e => setF('company_id', e.target.value)} required style={inp}>
                    <option value="">Select company…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Client Name *</label>
                  <input value={form.name} onChange={e => setF('name', e.target.value)} required placeholder="Full name" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Contact Email{form.enable_portal ? ' *' : ''}</label>
                  <input type="email" value={form.email} onChange={e => setF('email', e.target.value)}
                    required={form.enable_portal} placeholder="contact@example.com" style={inp} />
                  {form.enable_portal && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Also used as the client&apos;s portal login email.</div>
                  )}
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+92-300-0000000" style={inp} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Client's Business Name</label>
                <input value={form.company_name} onChange={e => setF('company_name', e.target.value)} placeholder="e.g. ABC Pvt Ltd" style={inp} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Address</label>
                <input value={form.address} onChange={e => setF('address', e.target.value)} placeholder="Street, City, Country" style={inp} />
              </div>

              <div>
                <label style={lbl}>Notes</label>
                <textarea value={form.notes} onChange={e => setF('notes', e.target.value)}
                  rows={3} placeholder="Internal notes…" style={{ ...inp, resize: 'vertical' }} />
              </div>
            </div>

            {/* Portal access card */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: form.enable_portal ? 16 : 0 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Portal Access</h3>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
                    Client logs in at <strong>/client/login</strong>
                  </p>
                </div>
                <div onClick={() => setF('enable_portal', !form.enable_portal)} style={{
                  width: 44, height: 24, borderRadius: 12, flexShrink: 0,
                  background: form.enable_portal ? '#2563eb' : '#e2e8f0',
                  position: 'relative', cursor: 'pointer', marginTop: 2,
                }}>
                  <div style={{
                    position: 'absolute', top: 4, width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                    left: form.enable_portal ? 24 : 4, transition: 'left .2s',
                  }} />
                </div>
              </div>

              {form.enable_portal && (
                <div>
                  <label style={lbl}>Login Email</label>
                  <input type="email" value={form.email} disabled
                    placeholder="Set Contact Email above" style={{ ...inp, background: '#f1f5f9', color: '#64748b' }} />
                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Password *</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showPwd ? 'text' : 'password'}
                        value={form.portal_password}
                        onChange={e => setF('portal_password', e.target.value)}
                        required={form.enable_portal} minLength={6}
                        placeholder="Min. 6 characters"
                        style={{ ...inp, paddingRight: 52 }} />
                      <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer',
                      }}>{showPwd ? 'Hide' : 'Show'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── Right — Permissions ──────────────────────────────── */}
          <div style={{ ...card, position: 'sticky', top: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Portal Permissions</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>Which sections can this client access?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODULES.map(m => {
                const on = perms[m.key] !== false;
                return (
                  <div key={m.key} onClick={() => togglePerm(m.key)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    background: on ? '#eff6ff' : '#f8fafc',
                    border: `1px solid ${on ? '#bfdbfe' : '#e2e8f0'}`,
                    userSelect: 'none',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#1d4ed8' : '#64748b' }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.desc}</div>
                    </div>
                    <div style={{
                      width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                      background: on ? '#2563eb' : '#e2e8f0', position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%',
                        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
                        left: on ? 19 : 3, transition: 'left .18s',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                <strong>{Object.values(perms).filter(Boolean).length}</strong> / {MODULES.length} sections enabled
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="submit" disabled={saving} style={{
            padding: '11px 28px', background: saving ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Creating…' : 'Create Client'}
          </button>
          <button type="button" onClick={() => router.back()} style={{
            padding: '11px 22px', background: '#fff', color: '#64748b',
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </form>
    </DashboardLayout>
  );
}
