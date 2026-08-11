'use client';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, Attendance, AttendanceStatus, Employee } from '@/lib/services/adminHrService';
import { Badge, inp, lbl, card } from '@/components/admin/projects/shared';
import { ATTENDANCE_SC } from '@/components/admin/hr/shared';
import toast from 'react-hot-toast';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'half_day', 'holiday'];

export default function AttendancePage() {
  useModuleGuard('attendance');
  const [records, setRecords] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminHrService.employees.list({ status: 'active' }).then(setEmployees).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setRecords(await adminHrService.attendance.list({ date }));
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) { toast.error('Select an employee'); return; }
    setSaving(true);
    try {
      await adminHrService.attendance.mark({ employee_id: Number(employeeId), date, status });
      toast.success('Attendance marked');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to mark attendance'); }
    finally { setSaving(false); }
  };

  return (
    <DashboardLayout title="Attendance">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Attendance</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Daily attendance register</p>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: 180 }} />
      </div>

      <form onSubmit={mark} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Employee</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={inp}>
            <option value="">Select employee…</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code})</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as AttendanceStatus)} style={inp}>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving} style={{ padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Marking…' : 'Mark Attendance'}
        </button>
      </form>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : records.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No attendance marked for this date yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Employee', 'Code', 'Department', 'Status', 'Notes'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{r.employee?.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{r.employee?.employee_code}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{r.employee?.department ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge label={r.status} sc={ATTENDANCE_SC[r.status]} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{r.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}
