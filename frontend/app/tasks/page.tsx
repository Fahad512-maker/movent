'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { Project, Task, TaskStatus } from '@/lib/services/adminProjectService';
import { notificationService } from '@/lib/services/notificationService';
import { can, getAuthType, getAuthUser, getUserModulePermissions } from '@/lib/auth';
import { Badge, TASK_SC, PRIORITY_SC, fmtDate, asRelation } from '@/components/admin/projects/shared';
import { TASK_STATUS_LABELS, getAllowedNextTaskStatuses, taskStatusRequiresComment } from '@/lib/taskStatusFlow';
import toast from 'react-hot-toast';

// Unwraps a relation-or-id field (qa_assigned_to/production_assigned_to come
// back as the loaded {id,name} relation on GET but must round-trip as a
// bare id on PUT) into the plain numeric id the update payload expects.
function relationId(v: number | { id: number } | null | undefined): number | undefined {
  if (v == null) return undefined;
  return typeof v === 'object' ? v.id : v;
}

export default function UserTasksPage() {
  useAdminGuard();
  const router = useRouter();
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState('');
  const [search, setSearch]   = useState('');

  // PM/Admin (canViewTasks) see every task across their visible projects;
  // a Production User without that permission sees only their own — the same
  // "Tasks" vs "My Tasks" split the sidebar computes for this nav item.
  // Resolved inside an effect (not synchronously at render time) — cookies
  // are already present in the browser at first paint but not during SSR,
  // so reading them directly in the render body causes a hydration mismatch.
  const [seeAllTasks, setSeeAllTasks] = useState(false);
  const [ready, setReady] = useState(false);

  const me = getAuthUser() as { id?: number; role_type?: string } | null;
  // Mirrors the backend bypass in TaskStatusService::canTransition() — a
  // Developer/Team Member gets free rein on their OWN task's status/assignee.
  const isDevOrTeamRole = me?.role_type === 'developer' || me?.role_type === 'team_member';
  // Display-only — mirrors Api\User\TaskController::isTaskManager(), which
  // canEditTasks/canViewTasks do NOT satisfy (they're default grants on
  // every project role, not a company-wide "see everyone's tasks" signal).
  // Only used for the title/subtext below; seeAllTasks below still drives
  // which endpoint is called (indexAll already scopes itself correctly for
  // a non-manager server-side, and unlike myTasks() also supports the
  // search box, so it stays the one always called).
  const isTaskManagerTier = me?.role_type === 'project_manager' || can('project_management', 'canViewAllCompanyProjects');
  // Mirrors frontend/app/projects/[id]/page.tsx's own "+ Create Task" gate —
  // a task always belongs to a project, so creating one from this
  // cross-project list first needs the caller to pick which project.
  const canCreateTasks = can('project_management', 'canCreateTasks');
  const canCreateLinkedTask = can('project_management', 'canCreateLinkedProjectTask');
  const canCreateAnyTask = canCreateTasks || canCreateLinkedTask;
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [pickerProjects, setPickerProjects] = useState<Project[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickedProjectId, setPickedProjectId] = useState('');

  const openProjectPicker = () => {
    setShowProjectPicker(true);
    setPickedProjectId('');
    setPickerLoading(true);
    userProjectService.list()
      .then(list => setPickerProjects(list.filter(p => !['draft', 'closed', 'completed'].includes(p.status))))
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => setPickerLoading(false));
  };

  useEffect(() => {
    if (getAuthType() === 'admin') {
      router.replace('/admin/tasks');
      return;
    }
    // The Task feature is retired for Seller entirely (backend hard-blocks
    // it regardless of any permission held) — send them away immediately
    // rather than rendering a page that'll just 403 on load().
    if (me?.role_type === 'seller') {
      router.replace('/dashboard');
      return;
    }
    const canAll = me?.role_type === 'project_manager' || getAuthType() === 'admin' || can('project_management', 'canViewTasks');
    if (!canAll && getUserModulePermissions('project_management').length === 0) {
      router.replace('/dashboard');
      return;
    }
    setSeeAllTasks(canAll);
    setReady(true);
    // Clears the Sidebar's Tasks red dot now that the sub-user has seen this list.
    notificationService.markCategoryRead('tasks')
      .then(() => window.dispatchEvent(new Event('nav_badges_refresh')))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Who this task can actually be reassigned to: this task's own project
  // team (added via "Manage Team" — project.team_members, not every company
  // user), excluding the Project Manager — this is the developer-side "who
  // can do the work" list (mirrors Api\User\TaskController::assignedToRule()).
  const assignableUsersFor = (t: Task): { id: number; name: string; role_type?: string }[] =>
    (t.project?.team_members ?? [])
      .filter(tm => tm.user && tm.user.role_type !== 'project_manager' && tm.user.role_type !== 'seller' && tm.user.role_type !== 'client')
      .map(tm => tm.user!);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusF) params.status = statusF;
      if (search.trim()) params.search = search.trim();
      setTasks(seeAllTasks ? await userProjectService.tasks.listAll(params) : await userProjectService.tasks.myTasks(params));
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (ready) load(); }, [statusF, search, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const canEditTasks = isTaskManagerTier || can('project_management', 'canEditTasks');
  const canAssignTasks = isTaskManagerTier || can('project_management', 'canAssignTasks');
  const taskStatusPerms = [
    isTaskManagerTier && 'canOverrideTaskStatus',
    can('project_management', 'canEditTasks') && 'canEditTasks',
    can('project_management', 'canMarkTaskBlocked') && 'canMarkTaskBlocked',
    can('project_management', 'canVerifyDeliverables') && 'canVerifyDeliverables',
    can('project_management', 'canAssignProductionTasks') && 'canAssignProductionTasks',
    can('project_management', 'canCompleteTasks') && 'canCompleteTasks',
    can('project_management', 'canReopenTasks') && 'canReopenTasks',
    can('project_management', 'canOverrideTaskStatus') && 'canOverrideTaskStatus',
  ].filter(Boolean) as string[];

  const updateStatus = async (task: Task, status: TaskStatus) => {
    let comment: string | undefined;
    if (taskStatusRequiresComment(status)) {
      const input = window.prompt(status === 'blocked' ? 'Reason for marking this task Blocked:' : 'QA comment / reason for QA Failed:');
      if (!input || !input.trim()) { toast.error('A comment is required for this status change.'); return; }
      comment = input.trim();
    }
    // No more QA/Production-user prompts here. qa_assigned_to is unused/
    // optional; production_assigned_to (settable from the project's task
    // listing) just passes through if already set.
    const productionAssignedTo = relationId(task.production_assigned_to);
    try {
      await userProjectService.tasks.update(task.project_id, task.id, {
        status,
        ...(comment ? { comment } : {}),
        ...(status === 'ready_for_production' && productionAssignedTo ? { production_assigned_to: productionAssignedTo } : {}),
      });
      toast.success('Task updated');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update task');
    }
  };

  const updateAssignee = async (task: Task, assignedTo: string) => {
    try {
      await userProjectService.tasks.update(task.project_id, task.id, { assigned_to: assignedTo ? Number(assignedTo) : null });
      toast.success('Task reassigned');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reassign task');
    }
  };

  const title = isTaskManagerTier ? 'Tasks' : 'My Tasks';
  // Always shown, even on the My Tasks view — any role can reassign their
  // OWN task to anyone via this column's dropdown (see updateAssignee
  // below); other rows just show the current assignee's name read-only.
  const columns = [
    'Task', 'Project', 'Assigned To',
    'Priority', 'Status',
    'Due', 'Update',
  ];

  return (
    <DashboardLayout title={title}>
      <div style={{ maxWidth: 1100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{title}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              {isTaskManagerTier ? `${tasks.length} tasks across your projects` : `${tasks.length} tasks assigned to you`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or task #"
              style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', width: 190 }}
            />
            <select value={statusF} onChange={e => setStatusF(e.target.value)}
              style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa' }}>
              <option value="">All Statuses</option>
              {Object.entries(TASK_STATUS_LABELS).map(([s, label]) => <option key={s} value={s}>{label}</option>)}
            </select>
            {canCreateAnyTask && (
              <button onClick={openProjectPicker} style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                + Create Task
              </button>
            )}
          </div>
        </div>

        {showProjectPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Create Task</h3>
                <button onClick={() => setShowProjectPicker(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
              </div>
              <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 16px' }}>
                A task always belongs to a project — pick which one this task is for.
              </p>
              {pickerLoading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading projects…</div>
              ) : pickerProjects.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No active projects available to add a task to.</div>
              ) : (
                <>
                  <select value={pickedProjectId} onChange={e => setPickedProjectId(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', marginBottom: 16, boxSizing: 'border-box' }}>
                    <option value="">Select a project…</option>
                    {pickerProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => pickedProjectId && router.push(`/projects/${pickedProjectId}/tasks/create`)}
                      disabled={!pickedProjectId}
                      style={{ flex: 1, padding: '10px', background: pickedProjectId ? '#2563eb' : '#93c5fd', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: pickedProjectId ? 'pointer' : 'not-allowed' }}>
                      Continue
                    </button>
                    <button onClick={() => setShowProjectPicker(false)} style={{ padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No tasks {isTaskManagerTier ? 'yet' : 'assigned'}</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {columns.map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/projects/${t.project_id}/tasks/${t.id}`)}
                    style={{ borderBottom: i < tasks.length - 1 ? '1px solid #f8fafc' : 'none', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '13px 14px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                      {t.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{t.task_number}</div>}
                      {t.title}
                      {!!t.attachments_count && <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>📎 {t.attachments_count}</span>}
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 12 }} onClick={e => e.stopPropagation()}>
                      <Link href={`/projects/${t.project_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{t.project?.name ?? `#${t.project_id}`}</Link>
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }} onClick={e => e.stopPropagation()}>
                      {(() => {
                        const currentAssigneeId = asRelation(t.assigned_to)?.id ?? t.assigned_to;
                        const isSelfTask = currentAssigneeId === me?.id;
                        if (!canEditTasks && !canAssignTasks && !isSelfTask) {
                          return asRelation(t.assigned_to)?.name ?? '—';
                        }
                        const options = assignableUsersFor(t);
                        return (
                          <select value={currentAssigneeId != null ? String(currentAssigneeId) : ''} onChange={e => updateAssignee(t, e.target.value)}
                            style={{ padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', background: '#fafafa' }}>
                            <option value="">Unassigned</option>
                            {options.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                            {/* Keep a task's existing assignee showing correctly
                                even if their role is no longer eligible here, or
                                they've since left the project team — a single
                                fallback entry so the select isn't blank, not a
                                normal re-pickable choice. */}
                            {currentAssigneeId != null && !options.some(u => u.id === currentAssigneeId) && (
                              <option value={String(currentAssigneeId)}>{asRelation(t.assigned_to)?.name ?? `User #${currentAssigneeId}`}</option>
                            )}
                          </select>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '13px 14px' }}><Badge label={t.priority} sc={PRIORITY_SC[t.priority]} /></td>
                    <td style={{ padding: '13px 14px' }}><Badge label={t.status} sc={TASK_SC[t.status]} /></td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{fmtDate(t.due_date)}</td>
                    <td style={{ padding: '13px 14px' }} onClick={e => e.stopPropagation()}>
                      <select value={t.status} onChange={e => updateStatus(t, e.target.value as TaskStatus)}
                        style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', background: '#fafafa' }}>
                        <option value={t.status}>{TASK_STATUS_LABELS[t.status] ?? t.status.replace(/_/g, ' ')}</option>
                        {getAllowedNextTaskStatuses(t.status, { isAssignee: (asRelation(t.assigned_to)?.id ?? t.assigned_to) === me?.id, isPm: isTaskManagerTier, isAdmin: false, perms: taskStatusPerms, isDevOrTeamAssignee: isDevOrTeamRole && (asRelation(t.assigned_to)?.id ?? t.assigned_to) === me?.id }).map(s => (
                          <option key={s} value={s}>{TASK_STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
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
