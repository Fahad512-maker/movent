'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Project, ProjectDashboard } from '@/lib/services/adminProjectService';
import { StatCard, Badge, STATUS_SC, fmtDate, asRelation } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function ProjectDashboardPage() {
  useModuleGuard('projects');
  const [stats, setStats]     = useState<ProjectDashboard | null>(null);
  const [recent, setRecent]   = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([adminProjectService.dashboard(), adminProjectService.list()])
      .then(([d, projects]) => {
        setStats(d);
        setRecent(projects.slice(0, 5));
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = recent
    .filter(p => p.deadline && p.status !== 'completed' && p.status !== 'cancelled')
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 5);

  return (
    <DashboardLayout title="Project Dashboard">
      <div style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Project Dashboard</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Overview of all projects and tasks</p>
          </div>
          <Link href="/admin/projects/create" style={{
            padding: '9px 18px', background: '#2563eb', color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>+ New Project</Link>
        </div>

        {loading || !stats ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              <StatCard label="Total Projects"     value={String(stats.total)}     color="#0f172a" />
              <StatCard label="Active"             value={String(stats.active)}    color="#059669" />
              <StatCard label="Completed"          value={String(stats.completed)} color="#16a34a" />
              <StatCard label="On Hold"            value={String(stats.on_hold)}   color="#d97706" />
              <StatCard label="Overdue"            value={String(stats.overdue)}   color="#dc2626" />
              <StatCard label="Assigned to Me"     value={String(stats.assigned)}  color="#2563eb" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 16 }}>Recent Projects</div>
                {recent.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No projects yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {recent.map(p => (
                      <Link key={p.id} href={`/admin/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #f8fafc' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.client?.name ?? '—'} · by {asRelation(p.created_by)?.name ?? p.created_by_admin?.name ?? 'Unknown'}</div>
                          </div>
                          <Badge label={p.status} sc={STATUS_SC[p.status]} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 16 }}>Upcoming Deadlines</div>
                {upcoming.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No upcoming deadlines.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {upcoming.map(p => (
                      <Link key={p.id} href={`/admin/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #f8fafc' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: p.is_overdue ? '#dc2626' : '#64748b', fontWeight: p.is_overdue ? 700 : 400 }}>{fmtDate(p.deadline)}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
