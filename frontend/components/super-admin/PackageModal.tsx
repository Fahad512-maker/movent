'use client';
import { useEffect, useState } from 'react';
import { Package } from '@/types';

const ALL_MODULES = [
  { key: 'leads',         label: 'Leads' },
  // 'clients' is deliberately NOT offered here — it was never a real,
  // purchasable module_key (see ModuleSeeder.php's comment); the actual
  // Client module is 'client_portal'. Checking 'clients' here used to add a
  // dead entry to a package's module list that could never be enabled for
  // any company (routes/api.php's module gate checks 'client_portal').
  { key: 'client_portal', label: 'Client Portal' },
  { key: 'invoices',      label: 'Invoices' },
  { key: 'projects',   label: 'Projects' },
  { key: 'tasks',      label: 'Tasks' },
  { key: 'production', label: 'Production' },
  { key: 'hr',         label: 'HR' },
  { key: 'finance',    label: 'Finance' },
  { key: 'documents',  label: 'Documents' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'reports',    label: 'Reports' },
  { key: 'chat',       label: 'Chat' },
];

export interface PackageSaveData {
  name: string;
  tier: Package['tier'];
  price: number;
  billing_cycle: Package['billing_cycle'];
  max_companies: number | null;
  max_users_per_company: number | null;
  description: string | null;
  is_visible: boolean;
  modules: string[];
}

interface Props {
  open: boolean;
  pkg?: Package | null;
  onClose: () => void;
  onSave: (data: PackageSaveData) => Promise<void>;
  saving?: boolean;
}

interface FormState {
  name: string;
  tier: Package['tier'];
  price: string;
  billing_cycle: Package['billing_cycle'];
  max_companies: string;
  max_users_per_company: string;
  description: string;
  is_visible: boolean;
  modules: string[];
}

const blank: FormState = {
  name: '',
  tier: 'basic',
  price: '',
  billing_cycle: 'monthly',
  max_companies: '',
  max_users_per_company: '',
  description: '',
  is_visible: true,
  modules: [],
};

export default function PackageModal({ open, pkg, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState<FormState>({ ...blank });

  useEffect(() => {
    if (pkg) {
      setForm({
        name:                   pkg.name,
        tier:                   pkg.tier,
        price:                  String(pkg.price),
        billing_cycle:          pkg.billing_cycle,
        max_companies:          pkg.max_companies != null ? String(pkg.max_companies) : '',
        max_users_per_company:  pkg.max_users_per_company != null ? String(pkg.max_users_per_company) : '',
        description:            pkg.description ?? '',
        is_visible:             pkg.is_visible,
        modules:                pkg.modules.map(m => m.module_key),
      });
    } else {
      setForm({ ...blank });
    }
  }, [pkg, open]);

  const toggleModule = (key: string) => {
    setForm(f => ({
      ...f,
      modules: f.modules.includes(key) ? f.modules.filter(m => m !== key) : [...f.modules, key],
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSave({
      name:                  form.name,
      tier:                  form.tier,
      price:                 Number(form.price),
      billing_cycle:         form.billing_cycle,
      max_companies:         form.max_companies ? Number(form.max_companies) : null,
      max_users_per_company: form.max_users_per_company ? Number(form.max_users_per_company) : null,
      description:           form.description || null,
      is_visible:            form.is_visible,
      modules:               form.modules,
    });
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
        maxWidth: 640,
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            {pkg ? 'Edit Package' : 'Create Package'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#94a3b8', lineHeight: 1 }}>&times;</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Package Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Professional" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Tier *</label>
              <select style={inputStyle} value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as Package['tier'] }))}>
                <option value="basic">Basic</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Price (USD) *</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required placeholder="0.00" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Billing Cycle *</label>
              <select style={inputStyle} value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value as Package['billing_cycle'] }))}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max Companies</label>
              <input style={inputStyle} type="number" min="1" value={form.max_companies} onChange={e => setForm(f => ({ ...f, max_companies: e.target.value }))} placeholder="Unlimited" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Max Users Per Company</label>
            <input style={inputStyle} type="number" min="1" value={form.max_users_per_company} onChange={e => setForm(f => ({ ...f, max_users_per_company: e.target.value }))} placeholder="Unlimited" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Package description..." />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_visible} onChange={e => setForm(f => ({ ...f, is_visible: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#7c3aed' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Visible to new registrations</span>
            </label>
          </div>

          {/* Modules */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ ...labelStyle, marginBottom: 10 }}>
              Modules ({form.modules.length} selected)
            </label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              padding: 14,
              background: '#f8fafc',
              borderRadius: 10,
              border: '1.5px solid #e2e8f0',
            }}>
              {ALL_MODULES.map(({ key, label }) => {
                const checked = form.modules.includes(key);
                return (
                  <label key={key} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 6,
                    background: checked ? 'rgba(124,58,237,0.08)' : '#fff',
                    border: `1.5px solid ${checked ? '#a78bfa' : '#e2e8f0'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleModule(key)} style={{ accentColor: '#7c3aed', width: 14, height: 14 }} />
                    <span style={{ fontSize: 12, fontWeight: checked ? 600 : 400, color: checked ? '#7c3aed' : '#64748b' }}>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Footer */}
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
              {saving ? 'Saving...' : (pkg ? 'Update Package' : 'Create Package')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
