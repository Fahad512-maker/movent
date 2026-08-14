'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Task, Project } from '@/lib/services/adminProjectService';
import { adminNotificationService } from '@/lib/services/adminNotificationService';
import { Badge, TASK_SC, PRIORITY_SC, fmtDate, asRelation } from '@/components/admin/projects/shared';

export default function AllTasksPage() {
  useModuleGuard('tasks');
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF]   = useState('');
  const [priorityF, setPriorityF] = useState('');
  const [projectF, setProjectF] = useState('');
  const [search, setSearch] = useState('');
  const [reassigningId, setReassigningId] = useState<number | null>(null);
  // A task always belongs to a project, so creating one from this
  // cross-project list first needs Admin to pick which project — mirrors
  // frontend/app/tasks/page.tsx's own "+ Create Task" picker, then hands off
  // to that project's own Tasks tab, which already has the full create form.
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [pickedProjectId, setPickedProjectId] = useState('');
  const creatableProjects = projects.filter(p => !['draft', 'closed', 'completed'].includes(p.status));

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusF)   params.status     = statusF;
      if (priorityF) params.priority   = priorityF;
      if (projectF)  params.project_id = projectF;
      if (search.trim()) params.search = search.trim();
      setTasks(await adminProjectService.tasks.listAll(params));
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    adminProjectService.list().then(setProjects).catch(() => {});
    // Clears the Sidebar's Tasks red dot now that the admin has seen this list.
    adminNotificationService.markCategoryRead('tasks')
      .then(() => window.dispatchEvent(new Event('nav_badges_refresh')))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reassignTask = async (task: Task, newAssigneeId: string) => {
    setReassigningId(task.id);
    try {
      const updated = await adminProjectService.tasks.update(task.project_id, task.id, {
        assigned_to: newAssigneeId ? Number(newAssigneeId) : null,
      });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      toast.success('Task assignee updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update assignee');
    } finally { setReassigningId(null); }
  };

  return (
    <DashboardLayout title="Tasks">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Tasks</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>All tasks across every project</p>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or task #"
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 190, background: '#fff' }}
        />
        <select value={projectF} onChange={e => { setProjectF(e.target.value); }}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 200, background: '#fff' }}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 150, background: '#fff' }}>
          <option value="">All Statuses</option>
          {Object.keys(TASK_SC).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={priorityF} onChange={e => setPriorityF(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 140, background: '#fff' }}>
          <option value="">All Priorities</option>
          {Object.keys(PRIORITY_SC).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={load} style={{
          padding: '8px 18px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Filter</button>
        <button onClick={() => { setPickedProjectId(''); setShowProjectPicker(true); }} style={{
          marginLeft: 'auto', padding: '8px 18px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>+ Create Task</button>
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
            {creatableProjects.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No active projects available to add a task to.</div>
            ) : (
              <>
                <select value={pickedProjectId} onChange={e => setPickedProjectId(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', marginBottom: 16, boxSizing: 'border-box' }}>
                  <option value="">Select a project…</option>
                  {creatableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => pickedProjectId && router.push(`/admin/projects/${pickedProjectId}/tasks`)}
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

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No tasks found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Task', 'Project', 'Assigned To', 'Priority', 'Status', 'Due'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px' }}>
                    {t.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{t.task_number}</div>}
                    <Link href={`/admin/projects/${t.project_id}/tasks`} style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', textDecoration: 'none' }}>{t.title}</Link>
                    {!!t.attachments_count && <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>📎 {t.attachments_count}</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>{t.project?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12 }}>
                    <select
                      value={typeof t.assigned_to === 'object' && t.assigned_to ? t.assigned_to.id : (t.assigned_to ?? '')}
                      disabled={reassigningId === t.id}
                      onChange={e => reassignTask(t, e.target.value)}
                      style={{
                        padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 7,
                        fontSize: 12, outline: 'none', background: '#fafafa', color: '#334155',
                        maxWidth: 170, cursor: reassigningId === t.id ? 'wait' : 'pointer',
                      }}
                    >
                      <option value="">Unassigned</option>
                      {/* Only this task's own project team is assignable —
                          not every user in the company (same fix already
                          applied to the Projects listing's PM dropdown). */}
                      {(t.project?.team_members ?? []).filter(tm => tm.user).map(tm => (
                        <option key={tm.user_id} value={tm.user_id}>{tm.user!.name}</option>
                      ))}
                      {/* Keep the current assignee selectable even if they're not
                          a formal team_members row (e.g. since removed from the
                          team) so the dropdown never silently shows the wrong
                          selection. */}
                      {asRelation(t.assigned_to) && !(t.project?.team_members ?? []).some(tm => tm.user_id === asRelation(t.assigned_to)?.id) && (
                        <option value={asRelation(t.assigned_to)?.id}>{asRelation(t.assigned_to)?.name}</option>
                      )}
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px' }}><Badge label={t.priority} sc={PRIORITY_SC[t.priority]} /></td>
                  <td style={{ padding: '12px 16px' }}><Badge label={t.status} sc={TASK_SC[t.status]} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(t.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}
