'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, Payroll } from '@/lib/services/adminHrService';
import toast from 'react-hot-toast';

export default function PayslipPage() {
  useModuleGuard('payroll');
  const { id } = useParams<{ id: string }>();
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminHrService.payroll.payslip(Number(id))
      .then(setPayroll)
      .catch(() => toast.error('Failed to load payslip'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <DashboardLayout title="Payslip"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!payroll) return <DashboardLayout title="Payslip"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Payslip not found.</div></DashboardLayout>;

  return (
    <DashboardLayout title="Payslip">
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }} className="no-print">
          <button onClick={() => window.print()} style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Print
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>{payroll.employee?.company?.name}</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Payslip for {payroll.month_year}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, fontSize: 13 }}>
            <div><span style={{ color: '#64748b' }}>Employee: </span><strong style={{ color: '#1e293b' }}>{payroll.employee?.name}</strong></div>
            <div><span style={{ color: '#64748b' }}>Employee Code: </span><strong style={{ color: '#1e293b' }}>{payroll.employee?.employee_code ?? '—'}</strong></div>
            <div><span style={{ color: '#64748b' }}>Department: </span><strong style={{ color: '#1e293b' }}>{payroll.employee?.department ?? '—'}</strong></div>
            <div><span style={{ color: '#64748b' }}>Status: </span><strong style={{ color: '#1e293b', textTransform: 'capitalize' }}>{payroll.status}</strong></div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 0', fontSize: 13, color: '#64748b' }}>Basic Salary</td>
                <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right', color: '#1e293b' }}>{payroll.basic_salary}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 0', fontSize: 13, color: '#64748b' }}>Allowances</td>
                <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right', color: '#059669' }}>+ {payroll.allowances}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 0', fontSize: 13, color: '#64748b' }}>Deductions</td>
                <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right', color: '#dc2626' }}>- {payroll.deductions}</td>
              </tr>
              <tr>
                <td style={{ padding: '14px 0 0', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Net Pay</td>
                <td style={{ padding: '14px 0 0', fontSize: 15, fontWeight: 700, textAlign: 'right', color: '#1e293b' }}>{payroll.net_pay}</td>
              </tr>
            </tbody>
          </table>

          {payroll.paid_at && (
            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', margin: 0 }}>Paid on {new Date(payroll.paid_at).toLocaleDateString('en-GB')}</p>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          nav, aside, header { display: none !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
