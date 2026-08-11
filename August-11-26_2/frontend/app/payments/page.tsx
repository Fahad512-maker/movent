'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminPaymentService, PaymentRecord, PaymentSummary } from '@/lib/services/adminPaymentService';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { HiMagnifyingGlass, HiFunnel, HiTrash, HiCheck, HiXMark } from 'react-icons/hi2';

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash:          'Cash',
  card:          'Card',
  cheque:        'Cheque',
  gateway:       'Online Gateway',
};

const METHOD_COLOR: Record<string, { bg: string; color: string }> = {
  bank_transfer: { bg: '#eff6ff', color: '#2563eb' },
  cash:          { bg: '#ecfdf5', color: '#059669' },
  card:          { bg: '#f5f3ff', color: '#7c3aed' },
  cheque:        { bg: '#fff7ed', color: '#ea580c' },
  gateway:       { bg: '#fdf4ff', color: '#9333ea' },
};

const STATUS_LABEL: Record<string, string> = {
  pending:   'Pending Confirmation',
  confirmed: 'Confirmed',
  failed:    'Rejected',
};

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#fef9c3', color: '#a16207' },
  confirmed: { bg: '#ecfdf5', color: '#059669' },
  failed:    { bg: '#fef2f2', color: '#dc2626' },
};

const fmt = (n: number, cur = 'USD') =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function PaymentsPage() {
  useAdminGuard();
  useModuleGuard('payments');
  const router = useRouter();
  const [payments, setPayments]   = useState<PaymentRecord[]>([]);
  const [summary, setSummary]     = useState<PaymentSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [method, setMethod]       = useState('');
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [deleting, setDeleting]   = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [rejecting, setRejecting]   = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (method) params.method = method;
      if (from)   params.from   = from;
      if (to)     params.to     = to;
      const data = await adminPaymentService.list(params);
      setPayments(data.payments);
      setSummary(data.summary);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };
  const clearFilters = () => { setSearch(''); setMethod(''); setFrom(''); setTo(''); };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this payment? Invoice balance will be recalculated.')) return;
    setDeleting(id);
    try {
      await adminPaymentService.remove(id);
      await load();
    } catch { /* silent */ }
    finally { setDeleting(null); }
  };

  const handleConfirm = async (id: number) => {
    if (!confirm('Confirm this payment? The invoice will be marked paid/partially paid and stakeholders notified.')) return;
    setConfirming(id);
    try {
      await adminPaymentService.confirm(id);
      await load();
    } catch { /* silent */ }
    finally { setConfirming(null); }
  };

  const handleReject = async (id: number) => {
    const reason = window.prompt('Reason for rejecting this payment claim (optional):') ?? undefined;
    setRejecting(id);
    try {
      await adminPaymentService.reject(id, reason);
      await load();
    } catch { /* silent */ }
    finally { setRejecting(null); }
  };

  const currency = payments[0]?.invoice?.currency ?? 'USD';

  return (
    <DashboardLayout title="Payments">
      <div style={{ maxWidth: 1200 }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Payments</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>All payments received across invoices</p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Received</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{fmt(summary.total, currency)}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{summary.count} payments</div>
            </div>
            {Object.entries(summary.by_method).map(([m, amt]) => {
              const mc = METHOD_COLOR[m] ?? { bg: '#f8fafc', color: '#64748b' };
              return (
                <div key={m} style={{ background: mc.bg, borderRadius: 12, border: `1px solid ${mc.color}20`, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: mc.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{METHOD_LABEL[m] ?? m}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: mc.color, marginTop: 4 }}>{fmt(amt, currency)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <form onSubmit={handleSearch} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px', position: 'relative' }}>
              <HiMagnifyingGlass size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search invoice # or client…"
                style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HiFunnel size={14} color="#94a3b8" />
              <select value={method} onChange={e => setMethod(e.target.value)} style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa' }}>
                <option value="">All Methods</option>
                {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#475569' }} />
              <span style={{ color: '#94a3b8', fontSize: 13 }}>to</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#475569' }} />
            </div>
            <button type="submit" style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            {(search || method || from || to) && (
              <button type="button" onClick={clearFilters} style={{ padding: '9px 16px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Clear</button>
            )}
          </div>
        </form>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading payments…</div>
          ) : payments.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>💳</div>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No payments found</div>
              <div style={{ fontSize: 13 }}>Payments are recorded from invoice detail pages</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Date', 'Invoice #', 'Client', 'Amount', 'Method', 'Status', 'Gateway Ref', 'Notes', ''].map(h => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => {
                    const mc = METHOD_COLOR[p.method ?? ''] ?? { bg: '#f8fafc', color: '#64748b' };
                    return (
                      <tr key={p.id} style={{ borderBottom: i < payments.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                        <td style={{ padding: '13px 14px', color: '#475569', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB') : '—'}
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          <span
                            onClick={() => p.invoice && router.push(`/invoices/${p.invoice.id}`)}
                            style={{ fontWeight: 700, color: '#2563eb', fontSize: 13, cursor: p.invoice ? 'pointer' : 'default' }}
                          >
                            {p.invoice?.invoice_number ?? '—'}
                          </span>
                        </td>
                        <td style={{ padding: '13px 14px', color: '#0f172a', fontSize: 13 }}>
                          {p.invoice?.client?.name ?? '—'}
                        </td>
                        <td style={{ padding: '13px 14px', fontWeight: 700, color: '#059669', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {fmt(parseFloat(p.amount), p.invoice?.currency ?? 'USD')}
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          {p.method ? (
                            <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, background: mc.bg, color: mc.color }}>
                              {METHOD_LABEL[p.method] ?? p.method}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          {(() => {
                            const sc = STATUS_COLOR[p.status] ?? { bg: '#f8fafc', color: '#64748b' };
                            return (
                              <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                                {STATUS_LABEL[p.status] ?? p.status}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>
                          {p.gateway_ref ? (
                            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.gateway_ref}</span>
                          ) : p.gateway ? (
                            <span style={{ color: '#94a3b8' }}>{p.gateway}</span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12, maxWidth: 200 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.notes ?? '—'}
                          </span>
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {p.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleConfirm(p.id)}
                                  disabled={confirming === p.id || rejecting === p.id}
                                  title="Confirm payment"
                                  style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #bbf7d0', background: '#ecfdf5', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: confirming === p.id ? 0.5 : 1 }}
                                >
                                  <HiCheck size={14} />
                                </button>
                                <button
                                  onClick={() => handleReject(p.id)}
                                  disabled={confirming === p.id || rejecting === p.id}
                                  title="Reject payment"
                                  style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #fde68a', background: '#fffbeb', color: '#b45309', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: rejecting === p.id ? 0.5 : 1 }}
                                >
                                  <HiXMark size={14} />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deleting === p.id}
                              title="Remove payment"
                              style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #fee2e2', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: deleting === p.id ? 0.5 : 1 }}
                            >
                              <HiTrash size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
