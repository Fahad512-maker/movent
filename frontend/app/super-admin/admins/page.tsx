'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { adminService } from '@/lib/services/adminService';
import { AdminFull } from '@/types';
import { HiPlus, HiPencil, HiPower } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  active:    { bg: '#ecfdf5', color: '#059669' },
  trial:     { bg: '#eff6ff', color: '#2563eb' },
  suspended: { bg: '#fef2f2', color: '#ef4444' },
  pending_payment: { bg: '#fff7ed', color: '#ea580c' },
};

export default function AdminsPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminFull[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminService.getAll()
      .then(setAdmins)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggle = async (admin: AdminFull) => {
    const action = admin.is_active ? 'suspend' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${admin.name}"?`)) return;
    try {
      const res = await adminService.toggleStatus(admin.id);
      setAdmins(list => list.map(a => a.id === admin.id ? { ...a, is_active: res.is_active } : a));
      toast.success(res.is_active ? 'Admin activated' : 'Admin suspended');
    } catch {
      toast.error('Failed to toggle status');
    }
  };

  return (
    <SuperAdminLayout>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Company Admins</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>{admins.length} registered admins</p>
          </div>
          <button
            onClick={() => router.push('/super-admin/admins/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <HiPlus size={18} /> New Admin
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : admins.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No admins yet</div>
              <div style={{ fontSize: 13 }}>Create your first company admin</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Admin', 'Package', 'Status', 'Companies', 'Account', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {admins.map(admin => {
                  const status = STATUS_STYLES[admin.subscription_status] ?? STATUS_STYLES.suspended;
                  return (
                    <tr key={admin.id} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{admin.name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{admin.email}</div>
                        {admin.phone && <div style={{ fontSize: 12, color: '#94a3b8' }}>{admin.phone}</div>}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#475569', fontSize: 13 }}>
                        {admin.package ? <span style={{ fontWeight: 500 }}>{admin.package.name}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: status.bg, color: status.color, textTransform: 'capitalize' }}>
                          {admin.subscription_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontSize: 13 }}>{admin.companies_count ?? 0}</td>
                      <td style={{ padding: '14px 18px' }}>
                        {!admin.is_active && (
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, background: '#fef2f2', color: '#ef4444', fontWeight: 600 }}>Inactive</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => router.push(`/super-admin/admins/${admin.id}/edit`)} title="Edit" style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#2563eb' }}>
                            <HiPencil size={14} />
                          </button>
                          <button onClick={() => handleToggle(admin)} title={admin.is_active ? 'Suspend' : 'Activate'} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: admin.is_active ? '#d97706' : '#059669' }}>
                            <HiPower size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
