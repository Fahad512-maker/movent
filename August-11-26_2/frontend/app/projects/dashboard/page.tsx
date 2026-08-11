'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { Project } from '@/lib/services/adminProjectService';
import { can, getAuthUser } from '@/lib/auth';
import { User } from '@/types';
import { StatCard, Badge, STATUS_SC, fmtDate } from '@/components/admin/projects/shared';
import Link from 'next/link';

export default function UserProjectDashboardPage() {
  useAdminGuard();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!can('project_management', 'canViewProjectDashboard')) {
      router.replace('/dashboard');
      return;
    }
    userProjectService.list()
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const me = getAuthUser() as User | null;
  const byStatus = (s: string) => projects.filter(p => p.status === s).length;
  const overdue = projects.filter(p => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'completed').length;
  const assignedToMe = projects.filter(p => p.project_manager_id === me?.id).length;
  const recent = [...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);

  return (
    <DashboardLayout title="Project Dashboard">
      <div style={{ maxWidth: 1200 }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
              <StatCard label="Total Projects" value={String(projects.length)} color="#2563eb" />
              <StatCard label="Active"         value={String(byStatus('active'))} color="#059669" />
              <StatCard label="On Hold"         value={String(byStatus('on_hold'))} color="#d97706" />
              <StatCard label="Overdue"         value={String(overdue)} color="#dc2626" />
              <StatCard label="Managed by Me"   value={String(assignedToMe)} color="#7c3aed" />
            </div>

            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Recent Projects</div>
              {recent.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No projects visible yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Project', 'Status', 'Progress', 'Deadline'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }} onClick={() => router.push(`/projects/${p.id}`)}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                          <Link href={`/projects/${p.id}`} style={{ color: '#0f172a', textDecoration: 'none' }}>{p.name}</Link>
                        </td>
                        <td style={{ padding: '12px 16px' }}><Badge label={p.status} sc={STATUS_SC[p.status]} /></td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.progress ?? 0}%</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(p.deadline)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
