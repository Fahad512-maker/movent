'use client';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, LeaveRequestRecord, LeaveType, Employee } from '@/lib/services/adminHrService';
import { Badge, inp, lbl, card } from '@/components/admin/projects/shared';
import { LEAVE_SC } from '@/components/admin/hr/shared';
import toast from 'react-hot-toast';

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'casual', 'maternity', 'unpaid'];

export default function LeavesPage() {
  useModuleGuard('leaves');
  const [leaves, setLeaves] = useState<LeaveRequestRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    adminHrService.employees.list({ status: 'active' }).then(setEmployees).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusF) params.status = statusF;
      setLeaves(await adminHrService.leaves.list(params));
    } catch { toast.error('Failed to load leave requests'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusF]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !fromDate || !toDate) { toast.error('Employee, from and to dates are required'); return; }
    setSaving(true);
    try {
      await adminHrService.leaves.create({ employee_id: Number(employeeId), leave_type: leaveType, from_date: fromDate, to_date: toDate, reason: reason || undefined });
      toast.success('Leave request added');
      setShowForm(false);
      setEmployeeId(''); setFromDate(''); setToDate(''); setReason('');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to add leave request'); }
    finally { setSaving(false); }
  };

  const decide = async (id: number, status: 'approved' | 'rejected') => {
    setBusyId(id);
    try {
      await adminHrService.leaves.updateStatus(id, status);
      toast.success(`Leave ${status}`);
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to update leave'); }
    finally { setBusyId(null); }
  };

  return (
    <DashboardLayout title="Leave Management">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Leave Management</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>{leaves.length} leave requests</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Add Leave Request'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Employee</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={inp}>
                <option value="">Select…</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Leave Type</label>
              <select value={leaveType} onChange={e => setLeaveType(e.target.value as LeaveType)} style={inp}>
                {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)} style={inp} placeholder="Optional" />
          </div>
          <button type="submit" disabled={saving} style={{ padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Submit Request'}
          </button>
        </form>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 16 }}>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inp, width: 180, background: '#fff' }}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : leaves.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No leave requests found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaves.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{l.employee?.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{l.leave_type}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{new Date(l.from_date).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{new Date(l.to_date).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{l.total_days ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{l.reason ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge label={l.status} sc={LEAVE_SC[l.status]} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    {l.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button disabled={busyId === l.id} onClick={() => decide(l.id, 'approved')} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>Approve</button>
                        <button disabled={busyId === l.id} onClick={() => decide(l.id, 'rejected')} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}>Reject</button>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}
