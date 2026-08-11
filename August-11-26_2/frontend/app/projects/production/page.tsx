'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { ProductionQueueItem } from '@/lib/services/adminProjectService';
import { can } from '@/lib/auth';
import { Badge, PRIORITY_SC, PRODUCTION_SC, PRODUCTION_LABEL, fmtDate, asRelation } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function UserProductionPage() {
  useAdminGuard();
  const [queue, setQueue]     = useState<ProductionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const canStart   = can('project_management', 'canStartProductionTasks');
  const canSubmit  = can('project_management', 'canSubmitProductionTasks');
  const canApprove = can('project_management', 'canApproveDeliverables');
  // PM/Admin oversight view (all items across visible projects) vs a
  // Production User's own queue — same split as the Tasks/My Tasks nav item.
  // Resolved inside an effect, not synchronously at render time — see the
  // matching comment in app/tasks/page.tsx for why (hydration mismatch).
  const [seeAllQueue, setSeeAllQueue] = useState(false);

  const load = async (allQueue: boolean) => {
    setLoading(true);
    try {
      setQueue(allQueue ? await userProjectService.production.queue() : await userProjectService.production.myQueue());
    } catch { toast.error('Failed to load production queue'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const allQueue = can('project_management', 'canViewProductionQueue');
    setSeeAllQueue(allQueue);
    load(allQueue);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (id: number) => {
    try { await userProjectService.production.start(id); toast.success('Started'); load(seeAllQueue); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to start'); }
  };

  const submit = async (id: number) => {
    try { await userProjectService.production.submit(id); toast.success('Submitted for review'); load(seeAllQueue); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to submit'); }
  };

  const approve = async (deliverableId: number) => {
    try { await userProjectService.deliverables.approve(deliverableId); toast.success('Deliverable approved'); load(seeAllQueue); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to approve'); }
  };

  const reject = async (deliverableId: number) => {
    try { await userProjectService.deliverables.reject(deliverableId); toast.success('Deliverable rejected'); load(seeAllQueue); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to reject'); }
  };

  const title = seeAllQueue ? 'Production Queue' : 'My Production Queue';

  return (
    <DashboardLayout title="Production">
      <div style={{ maxWidth: 1100 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{title}</h1>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94a3b8' }}>{queue.length} {seeAllQueue ? 'items across your projects' : 'items assigned to you'}</p>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : queue.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Nothing in your production queue.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Task', 'Project', 'Assigned To', 'Priority', 'Due', 'Status', 'Progress', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: i < queue.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <td style={{ padding: '13px 14px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                      {item.task?.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{item.task.task_number}</div>}
                      {item.task ? (
                        <Link href={`/projects/${item.task.project_id}/tasks/${item.task_id}`} style={{ color: '#0f172a', textDecoration: 'none' }}>{item.task.title}</Link>
                      ) : `#${item.task_id}`}
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 12 }}>
                      {item.task?.project ? <Link href={`/projects/${item.task.project.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{item.task.project.name}</Link> : '—'}
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{asRelation(item.assigned_to)?.name ?? '—'}</td>
                    <td style={{ padding: '13px 14px' }}>
                      {item.task?.priority ? <Badge label={item.task.priority} sc={PRIORITY_SC[item.task.priority]} /> : '—'}
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{fmtDate(item.task?.due_date)}</td>
                    <td style={{ padding: '13px 14px' }}><Badge label={PRODUCTION_LABEL[item.status] ?? item.status} sc={PRODUCTION_SC[item.status]} /></td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{item.task?.progress ?? 0}%</td>
                    <td style={{ padding: '13px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canStart && item.status === 'queued' && (
                          <button onClick={() => start(item.id)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Start</button>
                        )}
                        {canSubmit && item.status === 'in_progress' && (
                          <button onClick={() => submit(item.id)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#fffbeb', color: '#d97706', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Submit</button>
                        )}
                        {canApprove && item.status === 'submitted' && item.task?.deliverables?.[0] && (
                          <>
                            <button onClick={() => approve(item.task!.deliverables![0].id)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Approve</button>
                            <button onClick={() => reject(item.task!.deliverables![0].id)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reject</button>
                          </>
                        )}
                      </div>
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
