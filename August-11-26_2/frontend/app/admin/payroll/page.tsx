'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, Payroll, Employee } from '@/lib/services/adminHrService';
import { Badge, inp, lbl, card } from '@/components/admin/projects/shared';
import { PAYROLL_SC } from '@/components/admin/hr/shared';
import toast from 'react-hot-toast';

export default function PayrollPage() {
  useModuleGuard('payroll');
  const [rows, setRows] = useState<Payroll[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [monthYear, setMonthYear] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [allowances, setAllowances] = useState('');
  const [deductions, setDeductions] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    adminHrService.employees.list({ status: 'active' }).then(setEmployees).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try { setRows(await adminHrService.payroll.list()); }
    catch { toast.error('Failed to load payroll'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !monthYear || !basicSalary) { toast.error('Employee, month and basic salary are required'); return; }
    setSaving(true);
    try {
      await adminHrService.payroll.create({
        employee_id: Number(employeeId), month_year: monthYear,
        basic_salary: Number(basicSalary),
        allowances: allowances ? Number(allowances) : undefined,
        deductions: deductions ? Number(deductions) : undefined,
      });
      toast.success('Payroll draft created');
      setShowForm(false);
      setEmployeeId(''); setMonthYear(''); setBasicSalary(''); setAllowances(''); setDeductions('');
      load();
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to create payroll'); }
    finally { setSaving(false); }
  };

  const process = async (id: number) => {
    setBusyId(id);
    try { await adminHrService.payroll.process(id); toast.success('Payroll processed'); load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to process payroll'); }
    finally { setBusyId(null); }
  };

  const markPaid = async (id: number) => {
    setBusyId(id);
    try { await adminHrService.payroll.markPaid(id); toast.success('Marked as paid'); load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to mark as paid'); }
    finally { setBusyId(null); }
  };

  return (
    <DashboardLayout title="Payroll">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Payroll</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>{rows.length} payroll records</p>
        </div>
        <button onClick={() => setShowForm(s => !s)} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Add Payroll'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Employee</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={inp}>
                <option value="">Select…</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Month</label>
              <input type="month" value={monthYear} onChange={e => setMonthYear(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Basic Salary</label>
              <input type="number" min={0} step="0.01" value={basicSalary} onChange={e => setBasicSalary(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Allowances</label>
              <input type="number" min={0} step="0.01" value={allowances} onChange={e => setAllowances(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Deductions</label>
              <input type="number" min={0} step="0.01" value={deductions} onChange={e => setDeductions(e.target.value)} style={inp} />
            </div>
          </div>
          <button type="submit" disabled={saving} style={{ padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Create Draft'}
          </button>
        </form>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No payroll records found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Employee', 'Month', 'Basic', 'Allowances', 'Deductions', 'Net Pay', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.employee?.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.month_year}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.basic_salary}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.allowances}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{p.deductions}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.net_pay}</td>
                  <td style={{ padding: '12px 16px' }}><Badge label={p.status} sc={PAYROLL_SC[p.status]} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {p.status === 'draft' && (
                        <button disabled={busyId === p.id} onClick={() => process(p.id)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Process</button>
                      )}
                      {p.status === 'processed' && (
                        <button disabled={busyId === p.id} onClick={() => markPaid(p.id)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>Mark Paid</button>
                      )}
                      <Link href={`/admin/payroll/${p.id}/payslip`} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, background: '#f1f5f9', color: '#475569', textDecoration: 'none' }}>Payslip</Link>
                    </div>
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
