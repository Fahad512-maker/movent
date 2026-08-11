'use client';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { moduleService, ModuleItem } from '@/lib/services/moduleService';
import { HiPlus, HiPower, HiTrash, HiPencil } from 'react-icons/hi2';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px',
  border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

const EMPTY_FORM = { key: '', label: '', description: '', price_pkr: '', price_usd: '' };

export default function ModulesPage() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    moduleService.getAll().then(setModules).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  };

  const openEdit = (m: ModuleItem) => {
    setEditingId(m.id);
    setForm({
      key: m.key,
      label: m.label,
      description: m.description ?? '',
      price_pkr: String(m.price_pkr ?? 0),
      price_usd: String(m.price_usd ?? 0),
    });
    setError('');
    setShowForm(true);
  };

  const handleToggle = async (m: ModuleItem) => {
    try {
      const res = await moduleService.toggle(m.id);
      setModules(ms => ms.map(x => x.id === m.id ? { ...x, is_active: res.is_active } : x));
    } catch {
      alert('Failed to toggle module');
    }
  };

  const handleDelete = async (m: ModuleItem) => {
    if (!confirm(`Delete "${m.label}"? This cannot be undone.`)) return;
    try {
      await moduleService.delete(m.id);
      load();
    } catch {
      alert('Failed to delete module');
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const price_pkr = form.price_pkr ? Number(form.price_pkr) : 0;
      const price_usd = form.price_usd ? Number(form.price_usd) : 0;
      if (editingId) {
        await moduleService.update(editingId, { label: form.label, description: form.description || null, price_pkr, price_usd });
      } else {
        const key = form.key.trim().toLowerCase().replace(/\s+/g, '_');
        if (!key) { setError('Key is required'); setSaving(false); return; }
        await moduleService.create({ key, label: form.label, description: form.description || null, price_pkr, price_usd });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message ?? 'Failed to save module');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Modules</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>{modules.length} modules · controls what packages & registration can offer</p>
          </div>
          <button
            onClick={() => (showForm ? setShowForm(false) : openCreate())}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <HiPlus size={18} /> New Module
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: 24, marginBottom: 20 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Key *</label>
                <input style={{ ...inp, opacity: editingId ? 0.6 : 1 }} value={form.key} disabled={!!editingId}
                  onChange={e => setForm(f => ({ ...f, key: e.target.value }))} required placeholder="e.g. marketing" />
              </div>
              <div>
                <label style={lbl}>Label *</label>
                <input style={inp} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required placeholder="e.g. Marketing" />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Description</label>
              <input style={inp} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Price (PKR)</label>
                <input style={inp} type="number" min="0" value={form.price_pkr} onChange={e => setForm(f => ({ ...f, price_pkr: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Price (USD)</label>
                <input style={inp} type="number" min="0" value={form.price_usd} onChange={e => setForm(f => ({ ...f, price_usd: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Module'}
              </button>
            </div>
          </form>
        )}

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : modules.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>No modules yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Module', 'Type', 'Price', 'Includes', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{m.label}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.key}{m.description ? ` · ${m.description}` : ''}</div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: m.is_system ? '#eff6ff' : '#fff7ed', color: m.is_system ? '#2563eb' : '#ea580c' }}>
                        {m.is_system ? 'System' : 'Custom'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#0f172a', fontSize: 13, fontWeight: 600 }}>
                      ${Number(m.price_usd)}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748b', fontSize: 12 }}>
                      {m.sub_modules.length} feature{m.sub_modules.length !== 1 ? 's' : ''}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: m.is_active ? '#ecfdf5' : '#fef2f2', color: m.is_active ? '#059669' : '#ef4444' }}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(m)} title="Edit" style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#2563eb' }}>
                          <HiPencil size={14} />
                        </button>
                        <button onClick={() => handleToggle(m)} title={m.is_active ? 'Deactivate' : 'Activate'} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: m.is_active ? '#d97706' : '#059669' }}>
                          <HiPower size={14} />
                        </button>
                        {!m.is_system && (
                          <button onClick={() => handleDelete(m)} title="Delete" style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', color: '#ef4444' }}>
                            <HiTrash size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
