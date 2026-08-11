'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Timesheet, Task } from '@/lib/services/adminProjectService';
import { userService } from '@/lib/services/userService';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import { inp, lbl, card, Badge, TIMESHEET_SC, fmtDate } from '@/components/admin/projects/shared';

interface UserOption { id: number; name: string }

export default function ProjectTimesheetsPage() {
  useModuleGuard('timesheets');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [sheets, setSheets] = useState<Timesheet[]>([]);
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [users, setUsers]   = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ task_id: '', user_id: '', hours_logged: '', log_date: '', notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const all = await adminProjectService.timesheets.list();
      setSheets(all.filter(s => s.task?.project_id === projectId));
    } catch { toast.error('Failed to load timesheets'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    adminProjectService.tasks.list(projectId).then(setTasks).catch(() => {});
    // Scoped to THIS project's own company — not every company the admin
    // owns (userService.list() returns users across all of them).
    adminProjectService.getOne(projectId).then(p => {
      userService.list().then(d => setUsers(d.users.filter(u =>
        (u.company_assignments ?? []).some(a => a.company_id === p.company_id && a.status === 'active')
      ))).catch(() => {});
    }).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!form.task_id || !form.user_id || !form.hours_logged || !form.log_date) {
      toast.error('Fill in task, user, hours and date'); return;
    }
    setSaving(true);
    try {
      await adminProjectService.timesheets.create({
        task_id: Number(form.task_id), user_id: Number(form.user_id),
        hours_logged: Number(form.hours_logged), log_date: form.log_date, notes: form.notes || null,
      });
      toast.success('Time logged');
      setForm({ task_id: '', user_id: '', hours_logged: '', log_date: '', notes: '' });
      load();
    } catch { toast.error('Failed to log time'); }
    finally { setSaving(false); }
  };

  const approve = async (t: Timesheet, status: 'approved' | 'rejected') => {
    try {
      await adminProjectService.timesheets.approve(t.id, status);
      toast.success(`Timesheet ${status}`);
      load();
    } catch { toast.error('Failed to update timesheet'); }
  };

  const totalHours = sheets.reduce((s, t) => s + Number(t.hours_logged), 0);

  return (
    <DashboardLayout title="Project Timesheets">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0, flex: 1 }}>Timesheets</h2>
        <button onClick={() => adminProjectService.timesheets.downloadExport(projectId)} style={{
          padding: '8px 16px', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe',
          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>Export CSV</button>
      </div>

      <ProjectTabs projectId={projectId} active="timesheets" />

      <form onSubmit={submit} style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Task *</label>
            <select value={form.task_id} onChange={e => setF('task_id', e.target.value)} style={inp}>
              <option value="">Select task…</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.task_number ? `${t.task_number} - ${t.title}` : t.title}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>User *</label>
            <select value={form.user_id} onChange={e => setF('user_id', e.target.value)} style={inp}>
              <option value="">Select user…</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Hours *</label>
            <input type="number" min="0.1" max="24" step="0.5" value={form.hours_logged} onChange={e => setF('hours_logged', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Date *</label>
            <input type="date" value={form.log_date} onChange={e => setF('log_date', e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Notes</label>
          <input value={form.notes} onChange={e => setF('notes', e.target.value)} style={inp} />
        </div>
        <button type="submit" disabled={saving} style={{
          padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
        }}>{saving ? 'Saving…' : 'Log Time'}</button>
      </form>

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
                  {['Date', 'Task', 'User', 'Hours', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheets.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(s.log_date)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#1e293b' }}>
                      {s.task ? (
                        <Link href={`/admin/projects/${projectId}/tasks/${s.task_id}`} style={{ color: '#1e293b', textDecoration: 'none' }}>
                          {s.task.task_number ? `${s.task.task_number} - ${s.task.title}` : s.task.title}
                        </Link>
                      ) : '—'}
                    </td>
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
