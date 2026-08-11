'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminLeadService, userLeadService, Lead } from '@/lib/services/adminLeadService';
import { adminClientService, ClientCompany } from '@/lib/services/adminClientService';
import { getAuthType, getAuthUser, can } from '@/lib/auth';
import { Admin } from '@/types';
import { HiPlusCircle, HiMagnifyingGlass } from 'react-icons/hi2';

const STATUSES = [
  { key: '',            label: 'All' },
  { key: 'new',        label: 'New' },
  { key: 'contacted',  label: 'Contacted' },
  { key: 'qualified',  label: 'Qualified' },
  { key: 'proposal',   label: 'Proposal' },
  { key: 'negotiation',label: 'Negotiation' },
  { key: 'won',        label: 'Won' },
  { key: 'lost',       label: 'Lost' },
];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#eff6ff', color: '#2563eb' },
  contacted:   { bg: '#f0fdf4', color: '#16a34a' },
  qualified:   { bg: '#f5f3ff', color: '#7c3aed' },
  proposal:    { bg: '#fff7ed', color: '#ea580c' },
  negotiation: { bg: '#fffbeb', color: '#d97706' },
  won:         { bg: '#ecfdf5', color: '#059669' },
  lost:        { bg: '#fef2f2', color: '#dc2626' },
};

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  low:    { bg: '#f1f5f9', color: '#64748b' },
  medium: { bg: '#fff7ed', color: '#d97706' },
  high:   { bg: '#fef2f2', color: '#dc2626' },
  urgent: { bg: '#7f1d1d', color: '#fca5a5' },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PKR = (n: number) => n > 0 ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';

export default function LeadsPage() {
  const router  = useRouter();
  const authType = getAuthType();
  const isAdmin = authType === 'admin';
  const isUser  = authType === 'user';

  // Auth guard
  useEffect(() => {
    if (isAdmin) {
      const admin = getAuthUser() as Admin | null;
      if (admin?.modules?.length && !admin.modules.includes('leads')) {
        router.replace('/admin/dashboard');
      }
    } else if (isUser) {
      if (!can('sales', 'canViewLeads')) router.replace('/dashboard');
    } else {
      router.replace('/admin/login');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canCreate = isAdmin || can('sales', 'canCreateLeads');

  const [leads, setLeads]         = useState<Lead[]>([]);
  const [companies, setCompanies] = useState<ClientCompany[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [priority, setPriority]   = useState('');
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    if (isAdmin) adminClientService.companies().then(setCompanies).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search)    params.search     = search;
      if (status)    params.status     = status;
      if (priority)  params.priority   = priority;
      if (companyId) params.company_id = companyId;
      const data = isAdmin
        ? await adminLeadService.list(params)
        : await userLeadService.list(params);
      setLeads(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, priority, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.SyntheticEvent<HTMLFormElement>) => { e.preventDefault(); load(); };
  const clearFilters = () => { setSearch(''); setStatus(''); setPriority(''); setCompanyId(''); };

  const wonCount  = leads.filter(l => l.status === 'won').length;
  const lostCount = leads.filter(l => l.status === 'lost').length;
  const newCount  = leads.filter(l => l.status === 'new').length;
  const totalVal  = leads.filter(l => l.status !== 'lost').reduce((s, l) => s + l.estimated_value, 0);

  const leadRoot = isAdmin ? '/admin/leads' : '/leads';

  return (
    <DashboardLayout title="Leads">
      <div style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Leads</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>{leads.length} total · {newCount} new · {wonCount} won · {lostCount} lost</p>
          </div>
          {canCreate && (
            <button onClick={() => router.push(`${leadRoot}/new`)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <HiPlusCircle size={17} /> New Lead
            </button>
          )}
        </div>

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Leads',    value: leads.length, color: '#2563eb' },
            { label: 'New',            value: newCount,     color: '#7c3aed' },
            { label: 'Won',            value: wonCount,     color: '#059669' },
            { label: 'Pipeline Value', value: PKR(totalVal), color: '#d97706' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button key={s.key} onClick={() => setStatus(s.key)}
              style={{ padding: '6px 14px', borderRadius: 20, border: status === s.key ? 'none' : '1.5px solid #e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: status === s.key ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : '#fff',
                color: status === s.key ? '#fff' : '#64748b' }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <HiMagnifyingGlass size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, company…" style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', boxSizing: 'border-box' }} />
            </div>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa' }}>
              <option value="">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            {isAdmin && companies.length > 1 && (
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa' }}>
                <option value="">All Companies</option>
                {companies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            )}
            <button type="submit" style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            {(search || priority || companyId) && <button type="button" onClick={clearFilters} style={{ padding: '8px 14px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Clear</button>}
          </div>
        </form>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading leads…</div>
          ) : leads.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🎯</div>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No leads found</div>
              <div style={{ fontSize: 13 }}>Start tracking your sales pipeline by adding a lead</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Name', 'Company', 'Status', 'Priority', 'Est. Value', 'Source', 'Assigned', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => {
                  const ss = STATUS_STYLE[lead.status] ?? { bg: '#f1f5f9', color: '#64748b' };
                  const ps = PRIORITY_STYLE[lead.priority] ?? { bg: '#f1f5f9', color: '#64748b' };
                  const href = `${leadRoot}/${lead.id}`;
                  return (
                    <tr key={lead.id} style={{ borderBottom: i < leads.length - 1 ? '1px solid #f8fafc' : 'none', cursor: 'pointer' }} onClick={() => router.push(href)}>
                      <td style={{ padding: '13px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{lead.name}</div>
                        {lead.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.email}</div>}
                      </td>
                      <td style={{ padding: '13px 14px', color: '#475569', fontSize: 13 }}>{lead.company_name ?? '—'}</td>
                      <td style={{ padding: '13px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, ...ss }}>{cap(lead.status)}</span>
                      </td>
                      <td style={{ padding: '13px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, ...ps }}>{cap(lead.priority)}</span>
                      </td>
                      <td style={{ padding: '13px 14px', color: '#059669', fontSize: 13, fontWeight: 600 }}>{PKR(lead.estimated_value)}</td>
                      <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>{lead.source ? cap(lead.source.replace('_', ' ')) : '—'}</td>
                      <td style={{ padding: '13px 14px', color: '#475569', fontSize: 12 }}>{lead.assigned_user?.name ?? '—'}</td>
                      <td style={{ padding: '13px 14px' }}>
                        <button onClick={e => { e.stopPropagation(); router.push(href); }} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
