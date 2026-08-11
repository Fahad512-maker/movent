'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { companyService } from '@/lib/services/companyService';
import { HiArrowLeft, HiCheckCircle } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const ALL_MODULES = [
  { key: 'leads',         label: 'Leads / Pipeline', group: 'Sales' },

  // Client module — separate from Invoice
  { key: 'clients',       label: 'Clients',          group: 'Client' },
  { key: 'client_portal', label: 'Client Portal',    group: 'Client' },

  // Invoice module — separate from Client
  { key: 'invoices',      label: 'Invoices',         group: 'Invoice' },
  { key: 'payments',      label: 'Payments',         group: 'Invoice' },

  { key: 'projects',       label: 'Projects',           group: 'Work' },
  { key: 'tasks',          label: 'Tasks',              group: 'Work' },
  { key: 'timesheets',     label: 'Timesheets',         group: 'Work' },
  { key: 'production',     label: 'Production',         group: 'Work' },
  { key: 'hr',             label: 'HR',                 group: 'HR' },
  { key: 'attendance',     label: 'Attendance',         group: 'HR' },
  { key: 'leaves',         label: 'Leaves',             group: 'HR' },
  { key: 'payroll',        label: 'Payroll',            group: 'HR' },
  { key: 'recruitment',    label: 'Recruitment',        group: 'HR' },
  { key: 'documents',      label: 'Documents',          group: 'Files' },
  { key: 'compliance',     label: 'Compliance',         group: 'Files' },
  { key: 'reports',        label: 'Reports',            group: 'Analytics' },
  { key: 'chat',           label: 'Chat',               group: 'Communication' },
];

const GROUP_COLORS: Record<string, string> = {
  Sales:         '#2563eb',
  Client:        '#0891b2',
  Invoice:       '#059669',
  Work:          '#7c3aed',
  HR:            '#16a34a',
  Files:         '#d97706',
  Analytics:     '#6366f1',
  Communication: '#dc2626',
};

const GROUPS = [...new Set(ALL_MODULES.map(m => m.group))];

export default function CompanyModulesPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    companyService.getModules(id)
      .then(mods => setSelected(mods))
      .catch(() => toast.error('Failed to load modules'))
      .finally(() => setLoading(false));
  }, [id]);

  const toggle = (key: string) => {
    setSelected(s => s.includes(key) ? s.filter(k => k !== key) : [...s, key]);
  };

  const toggleGroup = (group: string) => {
    const keys = ALL_MODULES.filter(m => m.group === group).map(m => m.key);
    const allOn = keys.every(k => selected.includes(k));
    setSelected(s => allOn ? s.filter(k => !keys.includes(k)) : [...new Set([...s, ...keys])]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await companyService.syncModules(id, selected);
      toast.success('Modules updated');
      router.push('/super-admin/companies');
    } catch {
      toast.error('Failed to update modules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div style={{ maxWidth: 700 }}>
        <button
          onClick={() => router.push('/super-admin/companies')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}
        >
          <HiArrowLeft size={16} /> Back to Companies
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Company Modules</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              Control which modules this company can access. Changes take effect on next login.
            </p>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : (
            <div style={{ padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{selected.length} / {ALL_MODULES.length} modules enabled</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setSelected(ALL_MODULES.map(m => m.key))} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Select all</button>
                  <span style={{ color: '#e2e8f0' }}>|</span>
                  <button onClick={() => setSelected([])} style={{ fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Clear all</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {GROUPS.map(group => {
                  const items = ALL_MODULES.filter(m => m.group === group);
                  const allOn = items.every(m => selected.includes(m.key));
                  const color = GROUP_COLORS[group] ?? '#64748b';
                  return (
                    <div key={group}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</span>
                        </div>
                        <button onClick={() => toggleGroup(group)} style={{ fontSize: 11, color, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          {allOn ? 'Disable all' : 'Enable all'}
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {items.map(item => {
                          const on = selected.includes(item.key);
                          return (
                            <label key={item.key} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                              border: `1.5px solid ${on ? color + '55' : '#e2e8f0'}`,
                              background: on ? color + '0d' : '#fafafa',
                              transition: 'all 0.12s',
                            }}>
                              <input type="checkbox" checked={on} onChange={() => toggle(item.key)}
                                style={{ accentColor: color, width: 14, height: 14 }} />
                              {on && <HiCheckCircle size={13} style={{ color, flexShrink: 0 }} />}
                              <span style={{ fontSize: 13, fontWeight: on ? 600 : 400, color: on ? color : '#64748b' }}>
                                {item.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 28, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => router.push('/super-admin/companies')} style={{ padding: '10px 24px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '10px 32px', borderRadius: 8, border: 'none', background: saving ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Modules'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
