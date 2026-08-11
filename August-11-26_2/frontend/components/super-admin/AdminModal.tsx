'use client';
import { useEffect, useState } from 'react';
import { AdminFull, Package } from '@/types';

interface Props {
  open: boolean;
  admin?: AdminFull | null;
  packages: Package[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  saving?: boolean;
}

const blank = {
  name: '',
  email: '',
  password: '',
  confirm_password: '',
  phone: '',
  package_id: '',
  subscription_status: 'trial',
  trial_ends_at: '',
  subscription_ends_at: '',
};

export default function AdminModal({ open, admin, packages, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState({ ...blank });
  const [pwdErr, setPwdErr] = useState('');

  useEffect(() => {
    if (admin) {
      setForm({
        name:                  admin.name,
        email:                 admin.email,
        password:              '',
        confirm_password:      '',
        phone:                 admin.phone ?? '',
        package_id:            admin.package ? String(admin.package.id) : '',
        subscription_status:   admin.subscription_status,
        trial_ends_at:         admin.trial_ends_at?.slice(0, 10) ?? '',
        subscription_ends_at:  admin.subscription_ends_at?.slice(0, 10) ?? '',
      });
    } else {
      setForm({ ...blank });
    }
    setPwdErr('');
  }, [admin, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin && form.password !== form.confirm_password) {
      setPwdErr('Passwords do not match');
      return;
    }
    const payload: Record<string, unknown> = {
      name:                 form.name,
      email:                form.email,
      phone:                form.phone || null,
      package_id:           form.package_id ? Number(form.package_id) : null,
      subscription_status:  form.subscription_status,
      trial_ends_at:        form.trial_ends_at || null,
      subscription_ends_at: form.subscription_ends_at || null,
    };
    if (form.password) payload.password = form.password;
    await onSave(payload);
  };

  if (!open) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    background: '#f8fafc',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#475569',
    marginBottom: 5,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            {admin ? 'Edit Company Admin' : 'Create Company Admin'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#94a3b8' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>{admin ? 'New Password' : 'Password *'}</label>
              <input style={inputStyle} type="password" value={form.password} onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setPwdErr(''); }} required={!admin} placeholder={admin ? 'Leave blank to keep' : ''} />
            </div>
            <div>
              <label style={labelStyle}>{admin ? 'Confirm New Password' : 'Confirm Password *'}</label>
              <input style={inputStyle} type="password" value={form.confirm_password} onChange={e => { setForm(f => ({ ...f, confirm_password: e.target.value })); setPwdErr(''); }} required={!admin} />
            </div>
          </div>
          {pwdErr && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, marginTop: -8 }}>{pwdErr}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label style={labelStyle}>Package</label>
              <select style={inputStyle} value={form.package_id} onChange={e => setForm(f => ({ ...f, package_id: e.target.value }))}>
                <option value="">— No Package —</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.tier})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>Status *</label>
              <select style={inputStyle} value={form.subscription_status} onChange={e => setForm(f => ({ ...f, subscription_status: e.target.value }))}>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Trial Ends</label>
              <input style={inputStyle} type="date" value={form.trial_ends_at} onChange={e => setForm(f => ({ ...f, trial_ends_at: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Subscription Ends</label>
              <input style={inputStyle} type="date" value={form.subscription_ends_at} onChange={e => setForm(f => ({ ...f, subscription_ends_at: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 20px', borderRadius: 8,
              border: '1.5px solid #e2e8f0',
              background: '#fff', color: '#64748b',
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{
              padding: '9px 24px', borderRadius: 8,
              background: saving ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              border: 'none', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Saving...' : (admin ? 'Update Admin' : 'Create Admin')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
