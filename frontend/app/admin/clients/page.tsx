'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';

interface Company { id: number; name: string }
interface Client {
  id: number; name: string; email: string | null; phone: string | null;
  company_name: string | null; portal_access: boolean; status: string;
  created_at: string;
  user: { id: number; email: string } | null;
  company: { id: number; name: string } | null;
}
interface Seat { limit: number | null; portal_used: number; clients_total: number; remaining: number | null; can_add: boolean }

const STATUS_C: Record<string, { bg: string; color: string }> = {
  active:   { bg: '#ecfdf5', color: '#059669' },
  inactive: { bg: '#f1f5f9', color: '#64748b' },
  blocked:  { bg: '#fef2f2', color: '#dc2626' },
};

const errorMessage = (err: unknown, fallback: string) => {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  return fallback;
};

export default function AdminClientsPage() {
  // Every AdminClientController endpoint this page calls requires the real
  // Client module — 'client_portal' is the actual purchasable module_key
  // ('clients' was never a real CompanyModule row for any company, see
  // ModuleSeeder.php). Sales ('leads') alone only grants the limited Basic
  // Clients permission bundle to sub-users, not this admin page.
  useModuleGuard('client_portal');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients,   setClients]   = useState<Client[]>([]);
  const [seat,      setSeat]      = useState<Seat | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [portalF,   setPortalF]   = useState('');
  const [companyF,  setCompanyF]  = useState('');
  const [enablingId, setEnablingId] = useState<number | null>(null);

  useEffect(() => {
    api.get('/admin/companies').then(r => {
      const list = r.data.data || [];
      setCompanies(list);
      if (list.length === 1) setCompanyF(String(list[0].id));
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search)   params.search     = search;
      if (portalF)  params.portal     = portalF;
      if (companyF) params.company_id = companyF;
      const res = await api.get('/admin/clients', { params });
      setClients(res.data.data?.clients || []);
      setSeat(res.data.data?.seat || null);
    } catch { toast.error('Failed to load clients'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disable = async (c: Client) => {
    if (!confirm(`Disable portal for ${c.name}?`)) return;
    try {
      await api.post(`/admin/clients/${c.id}/disable-portal`);
      toast.success('Portal disabled');
      load();
    } catch { toast.error('Failed'); }
  };

  const enable = async (c: Client) => {
    setEnablingId(c.id);
    try {
      await api.post(`/admin/clients/${c.id}/enable-portal`);
      toast.success('Portal enabled');
      load();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to enable portal'));
    } finally {
      setEnablingId(null);
    }
  };

  // Soft delete (Client uses SoftDeletes) — the client's invoices/projects
  // stay intact, they just stop appearing everywhere. Their portal login (if
  // any) is deactivated server-side too.
  const del = async (c: Client) => {
    if (!confirm(`Delete "${c.name}"? This can't be undone from here.`)) return;
    try {
      await api.delete(`/admin/clients/${c.id}`);
      toast.success('Client deleted');
      load();
    } catch (err: unknown) { toast.error(errorMessage(err, 'Failed to delete client')); }
  };

  const seatPct = seat?.limit ? Math.round((seat.portal_used / seat.limit) * 100) : 0;

  return (
    <DashboardLayout title="Clients">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Clients</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Client portal management
          </p>
        </div>
        <Link
          href="/admin/clients/create"
          style={{
            padding: '9px 18px', background: '#2563eb', color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>
          + Add Client
        </Link>
      </div>

      {/* Seat meter */}
      {seat && (
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
          padding: '14px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Seat Usage</span>
              <span style={{ fontSize: 13, color: '#64748b' }}>
                {seat.portal_used} / {seat.limit ?? '∞'} portal users
              </span>
            </div>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${Math.min(seatPct, 100)}%`,
                background: seatPct >= 90 ? '#dc2626' : seatPct >= 70 ? '#d97706' : '#2563eb',
                transition: 'width .3s',
              }} />
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Clients</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{seat.clients_total}</div>
          </div>
          {!seat.can_add && (
            <div style={{
              fontSize: 12, padding: '6px 14px', background: '#fef2f2',
              color: '#dc2626', borderRadius: 8, fontWeight: 600, flexShrink: 0,
            }}>
              Seat limit reached
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Search name, email…"
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 220 }}
        />
        {companies.length > 1 && (
          <select value={companyF} onChange={e => setCompanyF(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 180, background: '#fff' }}>
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={portalF} onChange={e => setPortalF(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 160, background: '#fff' }}>
          <option value="">All Portal Status</option>
          <option value="enabled">Portal Enabled</option>
          <option value="disabled">Portal Disabled</option>
        </select>
        <button onClick={load} style={{
          padding: '8px 18px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Search</button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            No clients found.{' '}
            <Link href="/admin/clients/create" style={{ color: '#2563eb', fontWeight: 600 }}>Add one</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Client', 'Company', 'Contact', 'Status', 'Portal', 'Login Email', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const sc = STATUS_C[c.status] || { bg: '#f1f5f9', color: '#64748b' };
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.name}</div>
                      {c.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{c.company?.name || '—'}</div>
                      {c.company_name && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.company_name}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500, textTransform: 'capitalize' }}>{c.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.portal_access
                        ? <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>✓ Enabled</span>
                        : <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8', fontWeight: 500 }}>Disabled</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 11, color: '#64748b' }}>{c.user?.email || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <Link href={`/admin/clients/${c.id}`} style={{
                          padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                          background: '#2563eb', color: '#fff', textDecoration: 'none',
                        }}>Manage</Link>
                        {c.portal_access && (
                          <button onClick={() => disable(c)} style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6,
                          }}>Disable</button>
                        )}
                        {!c.portal_access && (
                          <button onClick={() => enable(c)} disabled={enablingId === c.id} style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: enablingId === c.id ? 'wait' : 'pointer',
                            background: '#fff', color: '#059669', border: '1px solid #bbf7d0', borderRadius: 6,
                            opacity: enablingId === c.id ? 0.65 : 1,
                          }}>{enablingId === c.id ? 'Enabling...' : 'Enable'}</button>
                        )}
                        <button onClick={() => del(c)} style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                          background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6,
                        }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </DashboardLayout>
  );
}
