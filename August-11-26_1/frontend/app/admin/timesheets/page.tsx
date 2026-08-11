'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Timesheet, Project } from '@/lib/services/adminProjectService';
import { Badge, TIMESHEET_SC, fmtDate } from '@/components/admin/projects/shared';

export default function AllTimesheetsPage() {
  useModuleGuard('timesheets');
  const [sheets, setSheets]     = useState<Timesheet[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [projectF, setProjectF] = useState('');
  const [statusF, setStatusF]   = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (projectF) params.project_id = projectF;
      if (statusF)  params.status = statusF;
      setSheets(await adminProjectService.timesheets.list(params));
    } catch { toast.error('Failed to load timesheets'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    adminProjectService.list().then(setProjects).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = async (t: Timesheet, status: 'approved' | 'rejected') => {
    try {
      await adminProjectService.timesheets.approve(t.id, status);
      toast.success(`Timesheet ${status}`);
      load();
    } catch { toast.error('Failed to update timesheet'); }
  };

  const totalHours = sheets.reduce((s, t) => s + Number(t.hours_logged), 0);

  return (
    <DashboardLayout title="Timesheets">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Timesheets</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>All time entries across every project</p>
        </div>
        <button onClick={() => adminProjectService.timesheets.downloadExport(projectF ? Number(projectF) : undefined)} style={{
          padding: '9px 18px', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe',
          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>Export CSV</button>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <select value={projectF} onChange={e => setProjectF(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 200, background: '#fff' }}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', width: 150, background: '#fff' }}>
          <option value="">All Statuses</option>
          {Object.keys(TIMESHEET_SC).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} style={{
          padding: '8px 18px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Filter</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : sheets.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No time logged yet.</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Date', 'Project', 'Task', 'User', 'Hours', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheets.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(s.log_date)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.task?.project ? (
                        <Link href={`/admin/projects/${s.task.project.id}/timesheets`} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>{s.task.project.name}</Link>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#1e293b' }}>{s.task?.title ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{s.user?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{s.hours_logged}h</td>
                    <td style={{ padding: '12px 16px' }}><Badge label={s.status} sc={TIMESHEET_SC[s.status]} /></td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => approve(s, 'approved')} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#059669', border: '1px solid #a7f3d0', borderRadius: 6 }}>Approve</button>
                          <button onClick={() => approve(s, 'rejected')} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6 }}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#1e293b', borderTop: '1px solid #f1f5f9' }}>
              Total: {totalHours}h
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
