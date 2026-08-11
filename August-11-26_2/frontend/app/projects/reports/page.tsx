'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { Task } from '@/lib/services/adminProjectService';
import { can } from '@/lib/auth';
import { Badge, STATUS_SC, TASK_SC, card, fmtDate, asRelation } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function UserProjectReportsPage() {
  useAdminGuard();
  const router = useRouter();
  const [statusCounts, setStatusCounts]     = useState<Record<string, number>>({});
  const [taskCounts, setTaskCounts]         = useState<Record<string, number>>({});
  const [overdue, setOverdue]               = useState<Task[]>([]);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    // canViewTaskReports alone (no canViewProjectReports) is a real, narrower
    // grant — taskStatusReport() on the backend already accepts either
    // permission on its own. Reject only when the user holds neither.
    if (!can('project_management', 'canViewProjectReports') && !can('project_management', 'canViewTaskReports')) {
      router.replace('/dashboard');
      return;
    }
    // Each report is fetched independently (not Promise.all) so a
    // canViewTaskReports-only holder still sees Tasks by Status even though
    // statusReport()/overdueReport() 403 for them (those two still require
    // canViewProjectReports specifically) — one missing section shouldn't
    // blank out the whole page.
    Promise.allSettled([
      userProjectService.reports.status(),
      userProjectService.reports.taskStatus(),
      userProjectService.reports.overdue(),
    ]).then(([s, t, o]) => {
      if (s.status === 'fulfilled') setStatusCounts(s.value);
      if (t.status === 'fulfilled') setTaskCounts(t.value);
      if (o.status === 'fulfilled') setOverdue(o.value);
      if (s.status === 'rejected' && t.status === 'rejected' && o.status === 'rejected') {
        toast.error('Failed to load reports');
      }
    }).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <DashboardLayout title="Project Reports"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout title="Project Reports">
      <div style={{ maxWidth: 1100 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Project Reports</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={card}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 14 }}>Projects by Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(statusCounts).map(([status, total]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge label={status} sc={STATUS_SC[status]} />
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{total}</span>
                </div>
              ))}
              {Object.keys(statusCounts).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No data.</div>}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 14 }}>Tasks by Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(taskCounts).map(([status, total]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge label={status} sc={TASK_SC[status]} />
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{total}</span>
                </div>
              ))}
              {Object.keys(taskCounts).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No data.</div>}
            </div>
          </div>
        </div>

        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Overdue Tasks ({overdue.length})</div>
          {overdue.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nothing overdue.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Task', 'Project', 'Assigned To', 'Due'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overdue.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                      {t.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{t.task_number}</div>}
                      <Link href={`/projects/${t.project_id}/tasks/${t.id}`} style={{ color: '#0f172a', textDecoration: 'none' }}>{t.title}</Link>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12 }}>
                      <Link href={`/projects/${t.project_id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{t.project?.name ?? `#${t.project_id}`}</Link>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>{asRelation(t.assigned_to)?.name ?? '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: '#dc2626', fontWeight: 700 }}>{fmtDate(t.due_date)}</td>
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
