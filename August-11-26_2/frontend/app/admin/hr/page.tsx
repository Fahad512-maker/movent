'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, HrDashboardStats } from '@/lib/services/adminHrService';
import { StatCard } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function HrDashboardPage() {
  useModuleGuard('employees');
  const [stats, setStats] = useState<HrDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminHrService.dashboard()
      .then(setStats)
      .catch(() => toast.error('Failed to load HR dashboard'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout title="HR Dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>HR Dashboard</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Employees, attendance, leave & payroll overview</p>
        </div>
        <Link href="/admin/employees/create" style={{
          padding: '9px 18px', background: '#2563eb', color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>+ Add Employee</Link>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      ) : stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <StatCard label="Total Employees" value={String(stats.total_employees)} color="#2563eb" />
            <StatCard label="Active" value={String(stats.active_employees)} color="#059669" />
            <StatCard label="On Leave" value={String(stats.on_leave_employees)} color="#d97706" />
            <StatCard label="Pending Leave Requests" value={String(stats.pending_leave_requests)} color="#7c3aed" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <StatCard label="Present Today" value={String(stats.attendance_today.present)} sub={`${stats.attendance_today.absent} absent · ${stats.attendance_today.late} late`} color="#059669" />
            <StatCard label="Open Positions" value={String(stats.open_recruitment_postings)} color="#2563eb" />
            <StatCard label="Payroll Pending" value={String(stats.payroll_pending)} color="#d97706" />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/admin/employees" style={{ padding: '10px 18px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', textDecoration: 'none' }}>Manage Employees</Link>
            <Link href="/admin/attendance" style={{ padding: '10px 18px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', textDecoration: 'none' }}>Mark Attendance</Link>
            <Link href="/admin/leaves" style={{ padding: '10px 18px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', textDecoration: 'none' }}>Review Leave Requests</Link>
            <Link href="/admin/payroll" style={{ padding: '10px 18px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', textDecoration: 'none' }}>Process Payroll</Link>
            <Link href="/admin/recruitment" style={{ padding: '10px 18px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1e293b', textDecoration: 'none' }}>Recruitment</Link>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
