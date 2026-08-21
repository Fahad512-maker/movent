'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Project, TeamMember } from '@/lib/services/adminProjectService';
import { TEAM_ROLE_LABEL } from '@/components/admin/projects/shared';
import { ROLE_LABELS } from '@/lib/roleUtils';

interface UserRow { userId: number; name: string; projects: { id: number; name: string; role: string }[] }

// A team member's actual job (role_type, e.g. "Seller") is more useful here
// than the generic 4-value project role_in_project — fall back to the
// latter only if the user has no role_type set. Same pattern as
// frontend/app/projects/team/page.tsx and frontend/app/admin/projects/[id]/
// team/page.tsx — this page previously showed role_in_project raw, so a
// Seller self-managing their own project (role_in_project defaults to
// 'project_manager' — see Api\User\ProjectController::store()) showed as
// "Project Manager" here instead of their real role, "Seller".
const memberRoleLabel = (m: TeamMember): string =>
  (m.user?.role_type && ROLE_LABELS[m.user.role_type]) || TEAM_ROLE_LABEL[m.role_in_project];

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
      row.projects.push({ id: p.id, name: p.name, role: memberRoleLabel(m) });
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
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{p.role}</span>
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
