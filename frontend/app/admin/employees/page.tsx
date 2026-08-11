'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, Employee } from '@/lib/services/adminHrService';
import { Badge, inp } from '@/components/admin/projects/shared';
import { EMPLOYEE_STATUS_SC } from '@/components/admin/hr/shared';
import toast from 'react-hot-toast';

export default function EmployeesPage() {
  useModuleGuard('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusF, setStatusF]     = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search)  params.search = search;
      if (statusF) params.status = statusF;
      setEmployees(await adminHrService.employees.list(params));
    } catch { toast.error('Failed to load employees'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusF]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout title="Employees">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Employees</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>{employees.length} employees</p>
        </div>
        <Link href="/admin/employees/create" style={{
          padding: '9px 18px', background: '#2563eb', color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>+ Add Employee</Link>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Search name, email, employee code…"
          style={{ ...inp, width: 260 }}
        />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ ...inp, width: 160, background: '#fff' }}>
          <option value="">All Statuses</option>
          {Object.keys(EMPLOYEE_STATUS_SC).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <button onClick={load} style={{
          padding: '8px 18px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Search</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : employees.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            No employees found.{' '}
            <Link href="/admin/employees/create" style={{ color: '#2563eb', fontWeight: 600 }}>Add one</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Employee', 'Code', 'Department', 'Designation', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{e.name}</div>
                    {e.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.email}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{e.employee_code ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{e.department ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{e.designation ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge label={e.status} sc={EMPLOYEE_STATUS_SC[e.status]} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{e.join_date ? new Date(e.join_date).toLocaleDateString('en-GB') : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/admin/employees/${e.id}`} style={{
                      padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                      background: '#2563eb', color: '#fff', textDecoration: 'none',
                    }}>View</Link>
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
