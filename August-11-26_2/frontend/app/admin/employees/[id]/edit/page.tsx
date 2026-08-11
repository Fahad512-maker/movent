'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, EmployeeStatus, EmploymentType } from '@/lib/services/adminHrService';
import { inp, lbl, card } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function EditEmployeePage() {
  useModuleGuard('employees');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const employeeId = Number(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time');
  const [salary, setSalary] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [status, setStatus] = useState<EmployeeStatus>('active');

  useEffect(() => {
    adminHrService.employees.getOne(employeeId).then(emp => {
      setName(emp.name);
      setEmail(emp.email ?? '');
      setPhone(emp.phone ?? '');
      setDepartment(emp.department ?? '');
      setDesignation(emp.designation ?? '');
      setEmploymentType(emp.employment_type);
      setSalary(emp.salary != null ? String(emp.salary) : '');
      setJoinDate(emp.join_date ? emp.join_date.slice(0, 10) : '');
      setStatus(emp.status);
    }).catch(() => toast.error('Failed to load employee')).finally(() => setLoading(false));
  }, [employeeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminHrService.employees.update(employeeId, {
        name, email: email || null, phone: phone || null,
        department: department || null, designation: designation || null,
        employment_type: employmentType,
        salary: salary ? Number(salary) : null,
        join_date: joinDate || null,
        status,
      });
      toast.success('Employee updated');
      router.push(`/admin/employees/${employeeId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update employee');
    } finally { setSaving(false); }
  };

  if (loading) return <DashboardLayout title="Edit Employee"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout title="Edit Employee">
      <div style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>Edit Employee</h2>

        <form onSubmit={handleSubmit} style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Full Name *</label>
              <input style={inp} value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input type="email" style={inp} value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp} value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Department</label>
              <input style={inp} value={department} onChange={e => setDepartment(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Designation</label>
              <input style={inp} value={designation} onChange={e => setDesignation(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Employment Type</label>
              <select style={inp} value={employmentType} onChange={e => setEmploymentType(e.target.value as EmploymentType)}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Salary</label>
              <input type="number" min={0} step="0.01" style={inp} value={salary} onChange={e => setSalary(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Join Date</label>
              <input type="date" style={inp} value={joinDate} onChange={e => setJoinDate(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select style={inp} value={status} onChange={e => setStatus(e.target.value as EmployeeStatus)}>
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => router.back()} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
