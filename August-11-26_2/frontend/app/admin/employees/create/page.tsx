'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, EmploymentType } from '@/lib/services/adminHrService';
import { adminClientService, ClientCompany } from '@/lib/services/adminClientService';
import { inp, lbl, card } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function CreateEmployeePage() {
  useModuleGuard('employees');
  const router = useRouter();

  const [companies, setCompanies] = useState<ClientCompany[]>([]);
  const [companyId, setCompanyId] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time');
  const [salary, setSalary] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminClientService.companies().then(cs => {
      setCompanies(cs);
      if (cs.length) setCompanyId(cs[0].id);
    }).catch(() => {});
  }, []);

  // Falls back to the (only) company even if the dropdown state hasn't
  // caught up yet — the dropdown is only shown when there's a real choice.
  const effectiveCompanyId = companyId || companies[0]?.id || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (companies.length === 0) { toast.error('No active company found for your account.'); return; }
    setSaving(true);
    try {
      const employee = await adminHrService.employees.create({
        company_id: effectiveCompanyId,
        name, email: email || null, phone: phone || null,
        department: department || null, designation: designation || null,
        employment_type: employmentType,
        salary: salary ? Number(salary) : null,
        join_date: joinDate || null,
      });
      toast.success('Employee created');
      router.push(`/admin/employees/${employee.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create employee');
    } finally { setSaving(false); }
  };

  return (
    <DashboardLayout title="Add Employee">
      <div style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>Add Employee</h2>

        <form onSubmit={handleSubmit} style={card}>
          {companies.length >= 1 && (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Company *</label>
              <select style={inp} value={companyId} onChange={e => setCompanyId(Number(e.target.value))} required>
                <option value={0}>Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

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
              <input style={inp} value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
            </div>
            <div>
              <label style={lbl}>Designation</label>
              <input style={inp} value={designation} onChange={e => setDesignation(e.target.value)} placeholder="e.g. Software Engineer" />
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
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => router.back()} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
