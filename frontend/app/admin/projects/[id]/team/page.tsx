'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, TeamMember, TeamRole } from '@/lib/services/adminProjectService';
import { userService } from '@/lib/services/userService';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import { inp, lbl, card, TEAM_ROLE_LABEL } from '@/components/admin/projects/shared';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { User } from '@/types';
import Link from 'next/link';

const hasProjectManagementAccess = (u: User) =>
  (u.company_assignments ?? []).some(a => (a.permissions?.project_management ?? []).length > 0);

// Only roles that can meaningfully sit on a project team — never
// Seller/Client/Invoice/HR/Finance/Compliance staff.
const TEAM_ELIGIBLE_ROLES = ['project_manager', 'production', 'developer', 'designer', 'qa', 'team_member'];

// A user must be an ACTIVE member of THIS project's own company — not just
// any company the admin owns — and hold one of the team-eligible roles.
const isEligibleForProjectCompany = (u: User, companyId: number | null) =>
  !!companyId &&
  TEAM_ELIGIBLE_ROLES.includes(u.role_type) &&
  (u.company_assignments ?? []).some(a => a.company_id === companyId && a.status === 'active');

// A team member's actual job (role_type, e.g. "Developer") is more useful
// here than the generic 4-value project role_in_project — fall back to the
// latter only if the user has no role_type set.
const memberRoleLabel = (m: TeamMember): string =>
  (m.user?.role_type && ROLE_LABELS[m.user.role_type]) || TEAM_ROLE_LABEL[m.role_in_project];

export default function ProjectTeamPage() {
  useModuleGuard('projects');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [users, setUsers]     = useState<User[]>([]);
  const [projectCompanyId, setProjectCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId]   = useState('');
  // Role is no longer picked/edited on this page — just plain team members.
  const role: TeamRole = 'team_member';
  const [saving, setSaving]   = useState(false);
  const [projectClosed, setProjectClosed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const p = await adminProjectService.getOne(projectId);
      setMembers(p.team_members ?? []);
      setProjectClosed(p.status === 'closed');
      setProjectCompanyId(p.company_id);
    } catch { toast.error('Failed to load team'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Team members must be existing, active company users — not free text.
    userService.list().then(d => setUsers(d.users.filter(u => u.is_active))).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scoped to THIS project's own company (not every company the admin owns)
  // and to roles that can meaningfully sit on a project team.
  const eligibleUsers = users.filter(u => isEligibleForProjectCompany(u, projectCompanyId));
  const selectedUser = eligibleUsers.find(u => String(u.id) === userId) ?? null;

  const addMember = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!userId) { toast.error('Select a user'); return; }
    setSaving(true);
    try {
      await adminProjectService.assignTeam(projectId, [{ user_id: Number(userId), role_in_project: role }]);
      toast.success('Team member added');
      setUserId('');
      load();
    } catch { toast.error('Failed to add team member'); }
    finally { setSaving(false); }
  };

  const removeMember = async (memberId: number) => {
    if (!confirm('Remove this team member from the project?')) return;
    try {
      await adminProjectService.removeTeamMember(projectId, memberId);
      toast.success('Team member removed');
      load();
    } catch { toast.error('Failed to remove team member'); }
  };

  return (
    <DashboardLayout title="Project Team">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Team</h2>
      </div>

      <ProjectTabs projectId={projectId} active="team" />

      {!projectClosed && (
      <form onSubmit={addMember} style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Add Team Member</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} style={inp}>
              <option value="">Select user…</option>
              {eligibleUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} — {ROLE_LABELS[u.role_type] ?? u.role_type}{u.company?.name ? ` (${u.company.name})` : ''}
                </option>
              ))}
            </select>
            {eligibleUsers.length === 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                No eligible users found for this company.
              </div>
            )}
          </div>
          <button type="submit" disabled={saving} style={{
            padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Adding…' : 'Add'}</button>
        </div>

        {selectedUser && !hasProjectManagementAccess(selectedUser) && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
            This user does not have Project Management access. They will be added to the team but won&apos;t be able to use it after logging in.{' '}
            <Link href={`/admin/users/${selectedUser.id}/edit`} style={{ color: '#2563eb', fontWeight: 600 }}>Grant access from Users &amp; Permissions</Link>.
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
          Don&apos;t see who you&apos;re looking for?{' '}
          <Link href="/admin/users" style={{ color: '#2563eb' }}>Create user first from Users &amp; Permissions.</Link>
        </div>
      </form>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No team members assigned yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Member', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    {m.user?.name ?? '—'}
                    <span style={{ fontWeight: 400, color: '#94a3b8' }}> ({memberRoleLabel(m)})</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {!projectClosed && <button onClick={() => removeMember(m.id)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6 }}>Remove</button>}
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
