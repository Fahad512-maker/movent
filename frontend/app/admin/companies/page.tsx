'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

interface CompanyRow {
  id: number;
  name: string;
  currency?: string | null;
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/companies')
      .then(res => setCompanies(res.data.data ?? []))
      .catch(() => toast.error('Failed to load companies'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout title="Companies">
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Companies</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Manage the companies under this admin account.</p>
          </div>
          <Link
            href="/admin/companies/create"
            style={{
              padding: '10px 14px', borderRadius: 8, background: '#2563eb',
              color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700,
            }}
          >
            Add Company
          </Link>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px', gap: 12, padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <div>Company Name</div>
            <div>Currency</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>

          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : companies.length ? companies.map(company => (
            <div
              key={company.id}
              style={{ display: 'grid', gridTemplateColumns: '1fr 130px 120px', gap: 12, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}
            >
              <div style={{ minWidth: 0, color: '#0f172a', fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{company.name}</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>{company.currency ?? '—'}</div>
              <div style={{ textAlign: 'right' }}>
                <Link href={`/admin/companies/${company.id}/edit`} style={{ color: '#2563eb', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  Edit
                </Link>
              </div>
            </div>
          )) : (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>No companies found.</div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
