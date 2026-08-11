'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, ProductionQueueItem, Project } from '@/lib/services/adminProjectService';
import { userService } from '@/lib/services/userService';
import { inp, StatCard, Badge, PRIORITY_SC, PRODUCTION_SC, PRODUCTION_LABEL, fmtDate, asRelation } from '@/components/admin/projects/shared';

interface UserOption { id: number; name: string }

const SORTABLE_STATUSES: { key: keyof Summary; label: string; color: string }[] = [
  { key: 'assigned', label: 'Assigned', color: '#64748b' },
  { key: 'in_progress', label: 'In Progress', color: '#2563eb' },
  { key: 'blocked', label: 'Blocked', color: '#dc2626' },
  { key: 'submitted', label: 'Submitted', color: '#d97706' },
  { key: 'revision_requested', label: 'Revision Requested', color: '#ea580c' },
  { key: 'delivered', label: 'Delivered', color: '#0d9488' },
  { key: 'completed', label: 'Completed', color: '#16a34a' },
  { key: 'overdue', label: 'Overdue', color: '#dc2626' },
];

interface Summary {
  assigned: number; in_progress: number; blocked: number; submitted: number;
  revision_requested: number; approved: number; delivered: number; completed: number;
  cancelled: number; overdue: number;
}

export default function ProductionPage() {
  useModuleGuard('projects');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [queue, setQueue] = useState<ProductionQueueItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState('');
  const [assigneeF, setAssigneeF] = useState('');
  const [projectF, setProjectF] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusF) params.status = statusF;
      if (assigneeF) params.assigned_to = assigneeF;
      const [s, q] = await Promise.all([
        adminProjectService.production.dashboard(),
        adminProjectService.production.queue(params),
      ]);
      setSummary(s);
      setQueue(q);
    } catch { toast.error('Failed to load production data'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    adminProjectService.list().then(setProjects).catch(() => {});
    userService.list().then(d => setUsers(d.users)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (item: ProductionQueueItem, status: string) => {
    try {
      await adminProjectService.production.updateItem(item.id, { status: status as never });
      load();
    } catch { toast.error('Failed to update status'); }
  };

  const filtered = projectF ? queue.filter(q => q.task?.project_id === Number(projectF)) : queue;
  const sorted = [...filtered].sort((a, b) => a.priority_order - b.priority_order);

  return (
    <DashboardLayout title="Production">
      <div style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Production</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Production task summary and queue</p>
        </div>

        {loading || !summary ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
              {SORTABLE_STATUSES.map(s => (
                <StatCard key={s.key} label={s.label} value={String(summary[s.key])} color={s.color} />
              ))}
            </div>

            <div style={{
              background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
              padding: '12px 16px', marginBottom: 16,
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <select value={projectF} onChange={e => setProjectF(e.target.value)}
                style={{ ...inp, width: 200 }}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inp, width: 180 }}>
                <option value="">All Statuses</option>
                {Object.entries(PRODUCTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select value={assigneeF} onChange={e => setAssigneeF(e.target.value)} style={{ ...inp, width: 180 }}>
                <option value="">All Assignees</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button onClick={load} style={{
                padding: '8px 18px', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>Filter</button>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {sorted.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No production tasks found.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Task', 'Project', 'Assigned To', 'Due', 'Status', 'Priority', 'Progress'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '12px 16px' }}>
                          {item.task ? (
                            <>
                              {item.task.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{item.task.task_number}</div>}
                              <Link href={`/admin/projects/${item.task.project_id}/tasks/${item.task_id}`} style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', textDecoration: 'none' }}>{item.task.title}</Link>
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>{item.task?.project?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{asRelation(item.assigned_to)?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(item.task?.due_date)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <select value={item.status} onChange={e => updateStatus(item, e.target.value)} style={{
                            ...inp, width: 'auto', padding: '4px 8px', fontSize: 11, fontWeight: 500,
                            background: PRODUCTION_SC[item.status]?.bg, color: PRODUCTION_SC[item.status]?.color, border: 'none',
                          }}>
                            {Object.entries(PRODUCTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {item.task?.priority ? <Badge label={item.task.priority} sc={PRIORITY_SC[item.task.priority]} /> : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{item.task?.progress ?? 0}%</td>
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
