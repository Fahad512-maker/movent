'use client';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { companyService } from '@/lib/services/companyService';
import { CompanyFull } from '@/types';
import toast from 'react-hot-toast';
import { HiPower, HiUsers, HiPuzzlePiece } from 'react-icons/hi2';
import { useRouter } from 'next/navigation';

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyFull[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    companyService.getAll()
      .then(setCompanies)
      .catch(() => toast.error('Failed to load companies'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggle = async (company: CompanyFull) => {
    const action = company.is_active ? 'deactivate' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${company.name}"?`)) return;
    try {
      const res = await companyService.toggleStatus(company.id);
      setCompanies(cs => cs.map(c => c.id === company.id ? { ...c, is_active: res.is_active } : c));
      toast.success(`Company ${action}d`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const active   = companies.filter(c => c.is_active).length;
  const inactive = companies.filter(c => !c.is_active).length;

  return (
    <SuperAdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Companies</h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>
            {companies.length} total &nbsp;·&nbsp;
            <span style={{ color: '#059669' }}>{active} active</span>
            {inactive > 0 && <> &nbsp;·&nbsp; <span style={{ color: '#ef4444' }}>{inactive} inactive</span></>}
          </p>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : companies.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No companies yet</div>
            <div style={{ fontSize: 13 }}>Companies appear here once company admins register them</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Company', 'Admin', 'Industry', 'Users', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map(company => (
                <tr key={company.id} style={{ borderBottom: '1px solid #f8fafc' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{company.name}</div>
                    {company.email && <div style={{ fontSize: 12, color: '#94a3b8' }}>{company.email}</div>}
                    {company.phone && <div style={{ fontSize: 12, color: '#94a3b8' }}>{company.phone}</div>}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    {company.admin ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{company.admin.name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{company.admin.email}</div>
                      </>
                    ) : <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>}
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748b', fontSize: 13 }}>
                    {company.industry ?? '—'}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 13 }}>
                      <HiUsers size={14} />
                      {company.users_count}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: company.is_active ? '#ecfdf5' : '#fef2f2',
                      color: company.is_active ? '#059669' : '#ef4444',
                    }}>
                      {company.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => router.push(`/super-admin/companies/${company.id}/modules`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 7,
                          border: '1px solid #e0e7ff', background: '#eef2ff',
                          color: '#4f46e5', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                        <HiPuzzlePiece size={14} /> Modules
                      </button>
                      <button
                        onClick={() => handleToggle(company)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 7,
                          border: `1px solid ${company.is_active ? '#fecaca' : '#bbf7d0'}`,
                          background: company.is_active ? '#fef2f2' : '#f0fdf4',
                          color: company.is_active ? '#ef4444' : '#059669',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                        <HiPower size={14} />
                        {company.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SuperAdminLayout>
  );
}
