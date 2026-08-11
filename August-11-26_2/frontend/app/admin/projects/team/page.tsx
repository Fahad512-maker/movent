'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Project } from '@/lib/services/adminProjectService';
import { TEAM_ROLE_LABEL } from '@/components/admin/projects/shared';

interface UserRow { userId: number; name: string; projects: { id: number; name: string; role: string }[] }

export default function TeamOverviewPage() {
  useModuleGuard('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    adminProjectService.list()
      .then(setProjects)
      .catch(() => toast.error('Failed to load team overview'))
      .finally(() => setLoading(false));
  }, []);

  const byUser = new Map<number, UserRow>();
  projects.forEach(p => {
    (p.team_members ?? []).forEach(m => {
      if (!m.user) return;
      const row = byUser.get(m.user.id) ?? { userId: m.user.id, name: m.user.name, projects: [] };
      row.projects.push({ id: p.id, name: p.name, role: m.role_in_project });
      byUser.set(m.user.id, row);
    });
  });
  const rows = Array.from(byUser.values());

  return (
    <DashboardLayout title="Team / Resources">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Team / Resources</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Who is assigned to which project</p>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No team members assigned to any project yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Team Member', 'Projects'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.userId} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b', verticalAlign: 'top' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {r.projects.map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, maxWidth: 420 }}>
                          <Link href={`/admin/projects/${p.id}/team`} style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>{p.name}</Link>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{TEAM_ROLE_LABEL[p.role] ?? p.role}</span>
                        </div>
                      ))}
                    </div>
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
