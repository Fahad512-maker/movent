'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { getActiveCompany, setActiveCompany } from '@/lib/auth';

interface CompanyOption {
  id: number;
  name: string;
}

// Company-Wise Dashboard Filtering — lets a multi-company Admin pick which
// of their companies the Dashboard (and, once they navigate there, the
// Projects/Invoices/Clients/Users/Tasks/Payments lists) should scope to.
// Persists via the same active_company_id cookie frontend/lib/auth.ts
// already exposes — frontend/lib/axios.ts's request interceptor already
// attaches it as the X-Active-Company-Id header on every request, so
// picking a company here is enough on its own to re-scope any Admin list
// page the user navigates to next; only the current page needs to be told
// to refetch its own data (onChange below).
export default function CompanySelector({ onChange }: { onChange?: (companyId: number) => void }) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    api.get('/admin/companies')
      .then(r => {
        const list: CompanyOption[] = r.data.data || [];
        setCompanies(list);
        if (list.length === 0) return;

        // Default selected company follows whatever's already active; if
        // nothing is set yet (first visit), default to the first company.
        const current = getActiveCompany();
        const initial = (current && list.some(c => c.id === current)) ? current : list[0].id;
        setSelected(initial);
        if (initial !== current) setActiveCompany(initial);
      })
      .catch(() => {});
  }, []);

  // A single-company Admin (the common case) has nothing to actually
  // filter — matches the same "hide when there's only one" convention
  // used for the Company field on admin/projects/create/page.tsx.
  if (companies.length <= 1) return null;

  const handleChange = (id: number) => {
    setSelected(id);
    setActiveCompany(id);
    onChange?.(id);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>🏢 Company:</label>
      <select
        value={selected ?? ''}
        onChange={e => handleChange(Number(e.target.value))}
        style={{
          padding: '11px 16px', border: '1.5px solid #e2e8f0', borderRadius: 10,
          fontSize: 14.5, outline: 'none', background: '#fff', color: '#0f172a',
          fontWeight: 700, cursor: 'pointer', minWidth: 240,
        }}
      >
        {companies.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
