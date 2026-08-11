'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminClientService } from '@/lib/services/adminClientService';
import api from '@/lib/axios';
import { getAuthType, can } from '@/lib/auth';
import { Client } from '@/types';
import { HiUserPlus, HiMagnifyingGlass, HiCheckCircle, HiXCircle, HiEye, HiPencilSquare } from 'react-icons/hi2';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:   { bg: '#ecfdf5', color: '#059669' },
  inactive: { bg: '#f8fafc', color: '#64748b' },
  blocked:  { bg: '#fef2f2', color: '#dc2626' },
};

export default function ClientsPage() {
  const router    = useRouter();
  const isSubUser = getAuthType() === 'user';
  const canCreate = !isSubUser || can('client', 'canCreateClients');
  const canEdit   = !isSubUser || can('client', 'canEditClients');

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [portal, setPortal]   = useState('');

  const load = async () => {
    setLoading(true);
    try {
      if (isSubUser) {
        const data = await api.get('/user/clients').then(r => r.data.data);
        setClients(data);
      } else {
        const params: Record<string, string> = {};
        if (search) params.search = search;
        if (portal) params.portal = portal;
        const data = await adminClientService.list(params);
        setClients(data.clients);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  return (
    <DashboardLayout title="Clients">
      <div style={{ maxWidth: 1100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Clients</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>{clients.length} total</p>
          </div>
          {canCreate && (
            <button
              onClick={() => router.push('/clients/new')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              <HiUserPlus size={17} /> Add Client
            </button>
          )}
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <HiMagnifyingGlass size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, company..."
              style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }}
            />
          </div>
          {!isSubUser && (
            <select value={portal} onChange={e => setPortal(e.target.value)} style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}>
              <option value="">All</option>
              <option value="enabled">Portal On</option>
              <option value="disabled">Portal Off</option>
            </select>
          )}
          <button type="submit" style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
        </form>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading clients…</div>
          ) : clients.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No clients yet</div>
              <div style={{ fontSize: 13 }}>Add your first client to get started</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Client', 'Company', 'Contact', 'Status', ...(!isSubUser ? ['Portal'] : []), 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < clients.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{c.name}</div>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569', fontSize: 13 }}>
                      {c.company_name ?? <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {c.email && <div style={{ fontSize: 13, color: '#475569' }}>{c.email}</div>}
                      {c.phone && <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.phone}</div>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, textTransform: 'capitalize', ...STATUS_STYLE[c.status] }}>
                        {c.status}
                      </span>
                    </td>
                    {!isSubUser && (
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: c.portal_access ? '#059669' : '#94a3b8' }}>
                          {c.portal_access ? <HiCheckCircle size={14} /> : <HiXCircle size={14} />}
                          {c.portal_access ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                    )}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button onClick={() => router.push(`/clients/${c.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                          <HiEye size={13} /> View
                        </button>
                        {canEdit && (
                          <button onClick={() => router.push(`/clients/${c.id}/edit`)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#2563eb', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                            <HiPencilSquare size={13} /> Edit
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
    </DashboardLayout>
  );
}
