'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService, CompanyUserOption } from '@/lib/services/userProjectService';
import { Project, TeamMember, TeamRole } from '@/lib/services/adminProjectService';
import { can, getUserModulePermissions } from '@/lib/auth';
import { MODULE_CATALOG } from '@/lib/moduleCatalog';
import { inp, lbl, card, TEAM_ROLE_LABEL } from '@/components/admin/projects/shared';
import { ROLE_LABELS } from '@/lib/roleUtils';
import toast from 'react-hot-toast';

const PROJECT_MODULE = MODULE_CATALOG.find(m => m.key === 'project_management');

// A team member's actual job (role_type, e.g. "Developer") is more useful
// here than the generic 4-value project role_in_project — fall back to the
// latter only if the user has no role_type set.
const memberRoleLabel = (m: TeamMember): string =>
  (m.user?.role_type && ROLE_LABELS[m.user.role_type]) || TEAM_ROLE_LABEL[m.role_in_project];

function UserTeamPageInner() {
  useAdminGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  // Pre-selected when arriving from a specific project's "Manage Team" link
  // (e.g. /projects/team?project=50) — falls back to the empty picker state.
  const [projectId, setProjectId] = useState(searchParams.get('project') ?? '');
  const [users, setUsers]       = useState<CompanyUserOption[]>([]);
  const [userId, setUserId]     = useState('');
  // Role is no longer picked/edited on this page — just plain team members.
  const role: TeamRole = 'team_member';
  const [saving, setSaving]     = useState(false);

  const canAssign   = can('project_management', 'canAssignTeamResources');
  const canAddUsers = can('account', 'canAddUsers');
  const myGrantablePerms = getUserModulePermissions('project_management');

  // New-user form — only shown to staff with canAddUsers; can only grant
  // permissions the PM themselves already holds (enforced again server-side).
  const [showAddUser, setShowAddUser]   = useState(false);
  const [newName, setNewName]           = useState('');
  const [newEmail, setNewEmail]         = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [newPerms, setNewPerms]         = useState<string[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);

  const toggleNewPerm = (key: string) =>
    setNewPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword) { toast.error('Name, email and password are required'); return; }
    setCreatingUser(true);
    try {
      await userProjectService.team.createUser({
        name: newName.trim(), email: newEmail.trim(), password: newPassword,
        permissions: newPerms.length ? { project_management: newPerms } : {},
      });
      toast.success('User created');
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewPerms([]); setShowAddUser(false);
      userProjectService.team.companyUsers().then(setUsers).catch(() => {});
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    } finally { setCreatingUser(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      setProjects(await userProjectService.list());
    } catch { toast.error('Failed to load team overview'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!can('project_management', 'canViewTeamResources') && !canAssign && !canAddUsers) {
      router.replace('/dashboard');
      return;
    }
    load();
    if (canAssign) userProjectService.team.companyUsers().then(setUsers).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = projects.find(p => String(p.id) === projectId) ?? null;
  const members = selected?.team_members ?? [];
  const selectedCandidate = users.find(u => String(u.id) === userId) ?? null;

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !userId) { toast.error('Select a project and a user'); return; }
    setSaving(true);
    try {
      await userProjectService.team.assign(Number(projectId), [{ user_id: Number(userId), role_in_project: role }]);
      toast.success('Team member added');
      setUserId('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add team member');
    } finally { setSaving(false); }
  };

  const removeMember = async (memberId: number) => {
    if (!projectId) return;
    try {
      await userProjectService.team.remove(Number(projectId), memberId);
      toast.success('Team member removed');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to remove team member');
    }
  };

  return (
    <DashboardLayout title="Team / Resources">
      <div style={{ maxWidth: 1000 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Team / Resources</h1>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '16px 20px', marginBottom: 16 }}>
          <label style={lbl}>Select Project</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inp, maxWidth: 320 }}>
            <option value="">Choose a project…</option>
            {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </div>

        {projectId && canAssign && (
          <form onSubmit={addMember} style={card}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Add Team Member</label>
                <select value={userId} onChange={e => setUserId(e.target.value)} style={inp}>
                  <option value="">Select user…</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={saving} style={{ padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Adding…' : 'Add'}
              </button>
            </div>

            {selectedCandidate && !selectedCandidate.has_project_management_access && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                This user does not have Project Management access. Ask your Company Admin to grant it from Users &amp; Permissions before they can use it after logging in.
              </div>
            )}

            {!canAddUsers && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                Don&apos;t see who you&apos;re looking for? Ask your Company Admin to create the user first from Users &amp; Permissions.
              </div>
            )}
          </form>
        )}

        {/* "Add New User" toggle — gated purely on canAddUsers, independent of
            canAssign (a staff member can be able to add users without also
            being able to assign the project team, and vice versa). */}
        {projectId && canAddUsers && (
          <div style={{ margin: canAssign ? '-8px 0 10px' : '0 0 10px', fontSize: 12, color: '#94a3b8' }}>
            <button type="button" onClick={() => setShowAddUser(v => !v)} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: 12, padding: 0 }}>
              {showAddUser ? 'Cancel' : "Don't see who you're looking for? + Add New User"}
            </button>
          </div>
        )}

        {projectId && canAddUsers && showAddUser && (
          <form onSubmit={createUser} style={card}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 12 }}>Add New User</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} style={inp} placeholder="Full name" />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <label style={lbl}>Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inp} placeholder="email@company.com" />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label style={lbl}>Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inp} placeholder="Min 8 characters" />
              </div>
            </div>

            {myGrantablePerms.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Project Management Permissions</label>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>You can only grant permissions you yourself have.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4 }}>
                  {(PROJECT_MODULE?.permissions ?? [])
                    .filter(p => myGrantablePerms.includes(p.key))
                    .map(p => (
                      <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newPerms.includes(p.key)} onChange={() => toggleNewPerm(p.key)} />
                        {p.label}
                      </label>
                    ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={creatingUser} style={{ padding: '9px 20px', background: creatingUser ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: creatingUser ? 'not-allowed' : 'pointer' }}>
              {creatingUser ? 'Creating…' : 'Create User'}
            </button>
          </form>
        )}

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {!projectId ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Select a project to view its team.</div>
          ) : loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No team members assigned to this project yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Member', canAssign ? 'Actions' : ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                      {m.user?.name ?? '—'}
                      <span style={{ fontWeight: 400, color: '#94a3b8' }}> ({memberRoleLabel(m)})</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {canAssign && (
                        <button onClick={() => removeMember(m.id)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6 }}>Remove</button>
                      )}
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

export default function UserTeamPage() {
  return (
    <Suspense fallback={
      <DashboardLayout title="Team / Resources">
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      </DashboardLayout>
    }>
      <UserTeamPageInner />
    </Suspense>
  );
}
