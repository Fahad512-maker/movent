'use client';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService } from '@/lib/services/adminHrService';
import { card, inp, lbl } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function HrReportsPage() {
  useModuleGuard('employees');
  const [headcount, setHeadcount] = useState<Record<string, number>>({});
  const [attendanceSummary, setAttendanceSummary] = useState<Record<string, number>>({});
  const [leaveSummary, setLeaveSummary] = useState<{ by_status: Record<string, number>; by_type: Record<string, number> }>({ by_status: {}, by_type: {} });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const [hc, att, lv] = await Promise.all([
        adminHrService.reports.headcount(),
        adminHrService.reports.attendanceSummary(params),
        adminHrService.reports.leaveSummary(),
      ]);
      setHeadcount(hc);
      setAttendanceSummary(att);
      setLeaveSummary(lv);
    } catch { toast.error('Failed to load HR reports'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderRows = (data: Record<string, number>) => Object.entries(data).map(([key, val]) => (
    <tr key={key} style={{ borderBottom: '1px solid #f8fafc' }}>
      <td style={{ padding: '10px 16px', fontSize: 13, color: '#1e293b', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</td>
      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b', textAlign: 'right' }}>{val}</td>
    </tr>
  ));

  return (
    <DashboardLayout title="HR Reports">
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>HR Reports</h2>

      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <label style={lbl}>Attendance From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Attendance To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} />
        </div>
        <button onClick={load} style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Apply
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Headcount by Department</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{renderRows(headcount)}</tbody></table>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Attendance Summary</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{renderRows(attendanceSummary)}</tbody></table>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Leave Summary — by Status</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{renderRows(leaveSummary.by_status)}</tbody></table>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Leave Summary — by Type</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{renderRows(leaveSummary.by_type)}</tbody></table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
