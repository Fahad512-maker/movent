'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { packageService } from '@/lib/services/packageService';
import { Package } from '@/types';
import { HiPlus, HiPencil, HiTrash, HiPower } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  basic:        { bg: '#f0fdf4', color: '#16a34a' },
  professional: { bg: '#eff6ff', color: '#2563eb' },
  enterprise:   { bg: '#fdf4ff', color: '#7c3aed' },
  custom:       { bg: '#fff7ed', color: '#ea580c' },
};

export default function PackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    packageService.getAll()
      .then(setPackages)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (pkg: Package) => {
    if (!confirm(`Delete "${pkg.name}"? This cannot be undone.`)) return;
    try {
      await packageService.delete(pkg.id);
      load();
      toast.success('Package deleted');
    } catch {
      toast.error('Failed to delete package');
    }
  };

  const handleToggle = async (pkg: Package) => {
    try {
      const res = await packageService.toggle(pkg.id);
      setPackages(ps => ps.map(p => p.id === pkg.id ? { ...p, is_active: res.is_active } : p));
      toast.success(res.is_active ? 'Package activated' : 'Package deactivated');
    } catch {
      toast.error('Failed to toggle status');
    }
  };

  return (
    <SuperAdminLayout>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Packages</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>{packages.length} subscription plans</p>
          </div>
          <button
            onClick={() => router.push('/super-admin/packages/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <HiPlus size={18} /> New Package
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : packages.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No packages yet</div>
              <div style={{ fontSize: 13 }}>Create your first subscription package</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Name', 'Tier', 'Price', 'Billing', 'Max Co.', 'Modules', 'Admins', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packages.map(pkg => {
                  const tier = TIER_COLORS[pkg.tier] ?? TIER_COLORS.basic;
                  return (
                    <tr key={pkg.id} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{pkg.name}</div>
                        {pkg.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{pkg.description.slice(0, 40)}…</div>}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: tier.bg, color: tier.color, textTransform: 'capitalize' }}>{pkg.tier}</span>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a', fontSize: 15 }}>
                        ${Number(pkg.price).toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontSize: 13, textTransform: 'capitalize' }}>{pkg.billing_cycle}</td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontSize: 13 }}>{pkg.max_companies ?? '∞'}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f8fafc', color: '#475569' }}>
                          {pkg.modules.length} modules
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', color: '#64748b', fontSize: 13 }}>{pkg.company_admins_count ?? 0}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: pkg.is_active ? '#ecfdf5' : '#fef2f2', color: pkg.is_active ? '#059669' : '#ef4444' }}>
                          {pkg.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => router.push(`/super-admin/packages/${pkg.id}/edit`)} title="Edit" style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#2563eb' }}>
                            <HiPencil size={14} />
                          </button>
                          <button onClick={() => handleToggle(pkg)} title={pkg.is_active ? 'Deactivate' : 'Activate'} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: pkg.is_active ? '#d97706' : '#059669' }}>
                            <HiPower size={14} />
                          </button>
                          <button onClick={() => handleDelete(pkg)} title="Delete" style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', color: '#ef4444' }}>
                            <HiTrash size={14} />
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
