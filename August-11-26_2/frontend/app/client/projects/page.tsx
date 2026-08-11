'use client';
import { useEffect, useState } from 'react';
import { clientService } from '@/lib/services/clientService';
import Link from 'next/link';

const GREEN = '#10b981';
const STATUS_OPTS = ['', 'planning', 'active', 'on_hold', 'completed', 'cancelled'];
const SC: Record<string, { bg: string; color: string }> = {
  planning:  { bg: '#eff6ff', color: '#2563eb' },
  active:    { bg: '#ecfdf5', color: '#059669' },
  on_hold:   { bg: '#fffbeb', color: '#d97706' },
  completed: { bg: '#f0fdf4', color: '#16a34a' },
  cancelled: { bg: '#fef2f2', color: '#dc2626' },
};

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [status, setStatus]     = useState('');
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);

  const load = (s: string, q: string) => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (s) params.status = s;
    if (q) params.search = q;
    clientService.projects(Object.keys(params).length ? params : undefined)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load('', ''); }, []);

  const inputStyle: React.CSSProperties = {
    padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, outline: 'none', background: '#f8fafc',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Projects</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Your active and completed projects</p>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(status, search)}
          placeholder="Search projects…"
          style={{ ...inputStyle, width: 200 }}
        />
        <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
        {STATUS_OPTS.map(s => (
          <button
            key={s}
            onClick={() => { setStatus(s); load(s, search); }}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid',
              borderColor: status === s ? GREEN : '#e2e8f0',
              background: status === s ? '#ecfdf5' : '#fff',
              color: status === s ? GREEN : '#64748b',
            }}>
            {s || 'All'}
          </button>
        ))}
        <button
          onClick={() => load(status, search)}
          style={{
            marginLeft: 'auto', padding: '6px 16px', background: GREEN, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
          Search
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading projects…</div>
        ) : projects.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No projects found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Project Name', 'Status', 'Start Date', 'Deadline', 'Progress', 'PM'].map(h => (
                  <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
                <th style={{ padding: '10px 18px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p: any) => {
                const sc  = SC[p.status] || { bg: '#f1f5f9', color: '#64748b' };
                const pct = p.progress ?? 0;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.name}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500, textTransform: 'capitalize' }}>
                        {p.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>{p.start_date || '—'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>{p.deadline || '—'}</td>
                    <td style={{ padding: '12px 18px', minWidth: 100 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16a34a' : GREEN, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>
                      {p.project_manager?.name || '—'}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                      <Link href={`/client/projects/${p.id}`} style={{
                        fontSize: 12, color: GREEN, fontWeight: 600, textDecoration: 'none',
                        padding: '4px 12px', border: '1px solid #a7f3d0', borderRadius: 6,
                      }}>View</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
