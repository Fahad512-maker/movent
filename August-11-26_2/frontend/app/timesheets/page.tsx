'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { Timesheet, Task } from '@/lib/services/adminProjectService';
import { can } from '@/lib/auth';
import { Badge, TIMESHEET_SC, inp, lbl, card } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function UserTimesheetsPage() {
  useAdminGuard();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [myTasks, setMyTasks]       = useState<Task[]>([]);
  const [loading, setLoading]       = useState(true);
  const [taskId, setTaskId]         = useState('');
  const [hours, setHours]           = useState('');
  const [logDate, setLogDate]       = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);

  const canApprove = can('project_management', 'canApproveTimesheets');

  const load = async () => {
    setLoading(true);
    try {
      setTimesheets(await userProjectService.timesheets.list());
    } catch { toast.error('Failed to load timesheets'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Tasks assigned to the current user — the only ones they can log time
    // against — so "Task ID" can be a name dropdown instead of a raw number.
    userProjectService.tasks.myTasks().then(setMyTasks).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId || !hours || !logDate) { toast.error('Task, hours, and date are required'); return; }
    setSaving(true);
    try {
      await userProjectService.timesheets.create({
        task_id: Number(taskId),
        hours_logged: Number(hours),
        log_date: logDate,
        notes: notes || null,
      });
      toast.success('Time logged');
      setTaskId(''); setHours(''); setLogDate(''); setNotes('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to log time');
    } finally { setSaving(false); }
  };

  const approve = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await userProjectService.timesheets.approve(id, status);
      toast.success(`Timesheet ${status}`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update timesheet');
    }
  };

  return (
    <DashboardLayout title="Timesheets">
      <div style={{ maxWidth: 1100 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Timesheets</h1>

        <div style={card}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 14 }}>Log Time</div>
          <form onSubmit={submit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 220 }}>
              <label style={lbl}>Task</label>
              <select value={taskId} onChange={e => setTaskId(e.target.value)} style={inp}>
                <option value="">Select task…</option>
                {myTasks.map(t => (
                  <option key={t.id} value={t.id}>{t.task_number ? `${t.task_number} - ` : ''}{t.title}{t.project?.name ? ` — ${t.project.name}` : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ width: 120 }}>
              <label style={lbl}>Hours</label>
              <input value={hours} onChange={e => setHours(e.target.value)} type="number" step="0.1" min="0.1" max="24" style={inp} />
            </div>
            <div style={{ width: 160 }}>
              <label style={lbl}>Date</label>
              <input value={logDate} onChange={e => setLogDate(e.target.value)} type="date" style={inp} />
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <label style={lbl}>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} style={inp} placeholder="Optional" />
            </div>
            <button type="submit" disabled={saving} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Log Time'}
            </button>
          </form>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : timesheets.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>No timesheets logged yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Task', 'User', 'Hours', 'Date', 'Status', canApprove ? 'Actions' : ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timesheets.map((ts, i) => (
                  <tr key={ts.id} style={{ borderBottom: i < timesheets.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                      {ts.task ? (
                        <Link href={`/projects/${ts.task.project_id}/tasks/${ts.task_id}`} style={{ color: '#0f172a', textDecoration: 'none' }}>
                          {ts.task.task_number ? `${ts.task.task_number} - ${ts.task.title}` : ts.task.title}
                        </Link>
                      ) : `#${ts.task_id}`}
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{ts.user?.name ?? '—'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#0f172a' }}>{ts.hours_logged}h</td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{new Date(ts.log_date).toLocaleDateString('en-GB')}</td>
                    <td style={{ padding: '13px 14px' }}><Badge label={ts.status} sc={TIMESHEET_SC[ts.status]} /></td>
                    <td style={{ padding: '13px 14px' }}>
                      {canApprove && ts.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => approve(ts.id, 'approved')} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Approve</button>
                          <button onClick={() => approve(ts.id, 'rejected')} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Reject</button>
                        </div>
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
