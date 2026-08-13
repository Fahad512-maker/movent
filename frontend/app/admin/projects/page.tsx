'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Project } from '@/lib/services/adminProjectService';
import { adminNotificationService } from '@/lib/services/adminNotificationService';
import { Badge, STATUS_SC, PRIORITY_SC, fmtDate, asRelation } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function ProjectsPage() {
  useModuleGuard('projects');
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusF, setStatusF]   = useState('');
  const [priorityF, setPriorityF] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search)    params.search   = search;
      if (statusF)   params.status   = statusF;
      if (priorityF) params.priority = priorityF;
      const list = await adminProjectService.list(params);
      setProjects(list);
    } catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Clears the Sidebar's Projects red dot now that the admin has seen this list.
    adminNotificationService.markCategoryRead('projects')
      .then(() => window.dispatchEvent(new Event('nav_badges_refresh')))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout title="Projects">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Projects</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Manage all company projects</p>
        </div>
        <Link href="/admin/projects/create" style={{
          padding: '9px 18px', background: '#2563eb', color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>+ New Project</Link>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Search project name…"
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 220 }}
        />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 160, background: '#fff' }}>
          <option value="">All Statuses</option>
          {Object.keys(STATUS_SC).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={priorityF} onChange={e => setPriorityF(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 150, background: '#fff' }}>
          <option value="">All Priorities</option>
          {Object.keys(PRIORITY_SC).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={load} style={{
          padding: '8px 18px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Search</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : projects.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            No projects found for this company.{' '}
            <Link href="/admin/projects/create" style={{ color: '#2563eb', fontWeight: 600 }}>Create one</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Project', 'Company', 'Client', 'Status', 'Priority', 'Progress', 'Deadline', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/admin/projects/${p.id}`)}
                  style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>by {asRelation(p.created_by)?.name ?? p.created_by_admin?.name ?? 'Unknown'}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.company?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.client?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge label={p.status} sc={STATUS_SC[p.status]} /></td>
                  <td style={{ padding: '12px 16px' }}><Badge label={p.priority} sc={PRIORITY_SC[p.priority]} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.progress ?? 0}%</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: p.is_overdue ? '#dc2626' : '#64748b', fontWeight: p.is_overdue ? 700 : 400 }}>{fmtDate(p.deadline)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/admin/projects/${p.id}`} onClick={e => e.stopPropagation()} style={{
                      padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                      background: '#2563eb', color: '#fff', textDecoration: 'none',
                    }}>Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}
