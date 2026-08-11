'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { salesReportService, LeadReport, ConversionReport, PerformanceReport } from '@/lib/services/salesExtrasService';
import { can } from '@/lib/auth';
import { card, StatCard } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function SalesReportsPage() {
  useAdminGuard();
  const router = useRouter();
  const [leadReport, setLeadReport] = useState<LeadReport | null>(null);
  const [conversion, setConversion] = useState<ConversionReport | null>(null);
  const [performance, setPerformance] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const canExport = can('sales', 'canExportSalesReports');

  useEffect(() => {
    if (!can('sales', 'canViewSalesReports')) { router.replace('/dashboard'); return; }
    Promise.all([
      salesReportService.leadReport(),
      salesReportService.conversionReport(),
      salesReportService.performanceReport(),
    ]).then(([lr, cr, pr]) => { setLeadReport(lr); setConversion(cr); setPerformance(pr); })
      .catch(() => toast.error('Failed to load reports'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = async () => {
    try { await salesReportService.downloadLeadsCsv(); }
    catch { toast.error('Export failed'); }
  };

  if (loading || !leadReport || !conversion || !performance) {
    return <DashboardLayout title="Sales Reports"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Sales Reports">
      <div style={{ maxWidth: 1000 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Sales Reports</h1>
          {canExport && (
            <button onClick={exportCsv} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Export Leads CSV
            </button>
          )}
        </div>

        {/* Performance summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Leads" value={String(performance.leads.total)} color="#2563eb" />
          <StatCard label="Won Deals" value={String(performance.leads.won)} sub={`$${performance.leads.won_value.toLocaleString()}`} color="#059669" />
          <StatCard label="Lost Deals" value={String(performance.leads.lost)} color="#dc2626" />
          <StatCard label="Win Rate" value={`${conversion.overall_win_rate}%`} color="#7c3aed" />
          {performance.invoices && (
            <>
              <StatCard label="Invoices from Sales" value={String(performance.invoices.created_from_sales)} sub={`${performance.invoices.paid_from_sales} paid`} color="#0891b2" />
              <StatCard label="Invoiced Value" value={`$${performance.invoices.total_value.toLocaleString()}`} sub={`$${performance.invoices.total_paid.toLocaleString()} collected`} color="#d97706" />
            </>
          )}
          {performance.projects && (
            <StatCard label="Projects Handed Off" value={String(performance.projects.linked_from_leads)} color="#7c3aed" />
          )}
        </div>

        {/* Lead report by status/source */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Leads by Status</div>
            {Object.values(leadReport.by_status).length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No leads yet.</div>
            ) : Object.values(leadReport.by_status).map(row => (
              <div key={row.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                <span style={{ textTransform: 'capitalize', color: '#334155' }}>{row.status.replace(/_/g, ' ')}</span>
                <span style={{ color: '#64748b' }}>{row.count} · ${Number(row.value || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Leads by Source</div>
            {Object.keys(leadReport.by_source).length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No source data yet.</div>
            ) : Object.entries(leadReport.by_source).map(([source, count]) => (
              <div key={source} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                <span style={{ textTransform: 'capitalize', color: '#334155' }}>{source.replace(/_/g, ' ')}</span>
                <span style={{ color: '#64748b' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
