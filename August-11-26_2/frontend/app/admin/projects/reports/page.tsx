'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Task, Project } from '@/lib/services/adminProjectService';
import { Badge, STATUS_SC, TASK_SC, StatCard, fmtDate, asRelation } from '@/components/admin/projects/shared';

interface WorkloadRow { user_id: number; total: number; completed: number; user: { id: number; name: string } }
interface TimesheetRow { user_id: number; task_id: number; total_hours: number; user: { id: number; name: string }; task: { id: number; title: string; task_number?: string | null; project?: { id: number; name: string } } }

export default function ProjectReportsPage() {
  useModuleGuard('projects');
  const [loading, setLoading] = useState(true);
  const [status, setStatus]   = useState<Record<string, number>>({});
  const [taskStatus, setTaskStatus] = useState<Record<string, number>>({});
  const [workload, setWorkload] = useState<WorkloadRow[]>([]);
  const [timesheetRows, setTimesheetRows] = useState<TimesheetRow[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<(Project & { duration_days: number | null })[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminProjectService.reports.status(),
      adminProjectService.reports.taskStatus(),
      adminProjectService.reports.workload(),
      adminProjectService.reports.timesheets(),
      adminProjectService.reports.overdue(),
      adminProjectService.reports.completed(),
    ]).then(([s, ts, w, th, ov, cp]) => {
      setStatus(s); setTaskStatus(ts); setWorkload(w); setTimesheetRows(th); setOverdue(ov); setCompleted(cp);
    }).catch(() => toast.error('Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

  const totalProjects = Object.values(status).reduce((a, b) => a + b, 0);
  const totalTasks     = Object.values(taskStatus).reduce((a, b) => a + b, 0);

  return (
    <DashboardLayout title="Project Reports">
      <div style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Project Reports</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Status breakdowns, workload and timesheet analytics</p>
        </div>

        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>Loading reports…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              <StatCard label="Total Projects" value={String(totalProjects)} color="#0f172a" />
              <StatCard label="Total Tasks"    value={String(totalTasks)}    color="#2563eb" />
              <StatCard label="Overdue Tasks"  value={String(overdue.length)} color="#dc2626" />
              <StatCard label="Completed Projects" value={String(completed.length)} color="#16a34a" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 16 }}>Project Status Report</div>
                {Object.entries(status).length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No projects yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(status).map(([s, count]) => (
                      <div key={s}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Badge label={s} sc={STATUS_SC[s]} />
                          <span style={{ fontSize: 12, color: '#64748b' }}>{count}</span>
                        </div>
                        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${totalProjects ? (count / totalProjects) * 100 : 0}%`, background: STATUS_SC[s]?.color ?? '#94a3b8', borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 16 }}>Task Status Report</div>
                {Object.entries(taskStatus).length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>No tasks yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(taskStatus).map(([s, count]) => (
                      <div key={s}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Badge label={s} sc={TASK_SC[s]} />
                          <span style={{ fontSize: 12, color: '#64748b' }}>{count}</span>
                        </div>
                        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${totalTasks ? (count / totalTasks) * 100 : 0}%`, background: TASK_SC[s]?.color ?? '#94a3b8', borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>User Workload Report</div>
              {workload.length === 0 ? (
                <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>No assigned tasks yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['User', 'Total Tasks', 'Completed'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {workload.map(w => (
                      <tr key={w.user_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{w.user?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{w.total}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#059669' }}>{w.completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Timesheet Report</div>
              {timesheetRows.length === 0 ? (
                <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>No time logged yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['User', 'Task', 'Project', 'Hours'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {timesheetRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#0f172a' }}>{r.user?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>
                          {r.task && r.task.project?.id ? (
                            <Link href={`/admin/projects/${r.task.project.id}/tasks/${r.task_id}`} style={{ color: '#475569', textDecoration: 'none' }}>
                              {r.task.task_number ? `${r.task.task_number} - ${r.task.title}` : r.task.title}
                            </Link>
                          ) : (r.task ? (r.task.task_number ? `${r.task.task_number} - ${r.task.title}` : r.task.title) : '—')}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>{r.task?.project?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{r.total_hours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Overdue Tasks</div>
              {overdue.length === 0 ? (
                <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>No overdue tasks. 🎉</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['Task', 'Project', 'Assigned To', 'Due Date'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {overdue.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#0f172a' }}>
                          <Link href={`/admin/projects/${t.project_id}/tasks/${t.id}`} style={{ color: '#0f172a', textDecoration: 'none' }}>
                            {t.task_number ? `${t.task_number} - ${t.title}` : t.title}
                          </Link>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>{t.project?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{asRelation(t.assigned_to)?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>{fmtDate(t.due_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Completed Projects</div>
              {completed.length === 0 ? (
                <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>No completed projects yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['Project', 'Client', 'Manager', 'Completed On', 'Duration'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {completed.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 16px' }}><Link href={`/admin/projects/${p.id}`} style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>{p.name}</Link></td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>{p.client?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{p.project_manager?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{fmtDate(p.completed_at)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{p.duration_days != null ? `${p.duration_days}d` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
