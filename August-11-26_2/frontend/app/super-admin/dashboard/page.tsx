'use client';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '@/components/super-admin/SuperAdminLayout';
import { DashboardStats } from '@/types';
import { dashboardService } from '@/lib/services/companyService';
import {
  HiRectangleStack,
  HiUserGroup,
  HiBuildingOffice2,
  HiCheckBadge,
} from 'react-icons/hi2';

export default function SuperAdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardService.getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: 'Total Packages',        value: stats?.total_packages ?? '—',       icon: HiRectangleStack,  color: '#7c3aed', bg: '#fdf4ff' },
    { label: 'Company Admins',         value: stats?.total_admins ?? '—',         icon: HiUserGroup,       color: '#2563eb', bg: '#eff6ff' },
    { label: 'Total Companies',        value: stats?.total_companies ?? '—',      icon: HiBuildingOffice2, color: '#059669', bg: '#ecfdf5' },
    { label: 'Active Subscriptions',   value: stats?.active_subscriptions ?? '—', icon: HiCheckBadge,      color: '#d97706', bg: '#fffbeb' },
  ];

  return (
    <SuperAdminLayout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Dashboard</h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Platform overview</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginBottom: 32 }}>
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} style={{
            background: '#fff',
            borderRadius: 14,
            padding: '22px 24px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                  {loading ? <span style={{ color: '#e2e8f0' }}>—</span> : value}
                </div>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color={color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        {/* Recent Admins */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Recent Admins</h3>
            <a href="/super-admin/admins" style={{ fontSize: 13, color: '#7c3aed', textDecoration: 'none', fontWeight: 500 }}>View all →</a>
          </div>
          <div>
            {loading ? (
              <div style={{ padding: '24px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>Loading...</div>
            ) : stats?.recent_admins.length === 0 ? (
              <div style={{ padding: '24px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>No admins yet</div>
            ) : stats?.recent_admins.map(admin => (
              <div key={admin.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 22px', borderBottom: '1px solid #f8fafc' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{admin.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{admin.email}</div>
                </div>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  background: admin.subscription_status === 'active' ? '#ecfdf5' : admin.subscription_status === 'trial' ? '#eff6ff' : '#fef2f2',
                  color: admin.subscription_status === 'active' ? '#059669' : admin.subscription_status === 'trial' ? '#2563eb' : '#ef4444',
                }}>
                  {admin.subscription_status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Companies */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Recent Companies</h3>
            <a href="/super-admin/companies" style={{ fontSize: 13, color: '#7c3aed', textDecoration: 'none', fontWeight: 500 }}>View all →</a>
          </div>
          <div>
            {loading ? (
              <div style={{ padding: '24px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>Loading...</div>
            ) : stats?.recent_companies.length === 0 ? (
              <div style={{ padding: '24px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>No companies yet</div>
            ) : stats?.recent_companies.map(company => (
              <div key={company.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 22px', borderBottom: '1px solid #f8fafc' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{company.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{company.admin?.name ?? 'No admin'}</div>
                </div>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  background: company.is_active ? '#ecfdf5' : '#fef2f2',
                  color: company.is_active ? '#059669' : '#ef4444',
                }}>
                  {company.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
