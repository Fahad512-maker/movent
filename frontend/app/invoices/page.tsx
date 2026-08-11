'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminInvoiceService } from '@/lib/services/adminInvoiceService';
import api from '@/lib/axios';
import { getAuthType, can } from '@/lib/auth';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { Invoice } from '@/types';
import { HiPlusCircle, HiMagnifyingGlass, HiFunnel, HiPaperAirplane, HiLink, HiClipboard, HiClipboardDocumentCheck, HiXMark } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:          { bg: '#f8fafc', color: '#64748b', label: 'Draft' },
  sent:           { bg: '#eff6ff', color: '#2563eb', label: 'Sent' },
  partially_paid: { bg: '#fff7ed', color: '#ea580c', label: 'Partial' },
  paid:           { bg: '#ecfdf5', color: '#059669', label: 'Paid' },
  overdue:        { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  cancelled:      { bg: '#f8fafc', color: '#94a3b8', label: 'Cancelled' },
};

export default function InvoicesPage() {
  useAdminGuard();
  useModuleGuard('invoices');
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [from, setFrom]         = useState('');
  const [to, setTo]             = useState('');
  const [canCreate, setCanCreate]     = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [sharedLinks, setSharedLinks]   = useState<Record<number, string>>({});
  const [copiedId, setCopiedId]         = useState<number | null>(null);

  useEffect(() => { setCanCreate(can('invoice', 'canCreateInvoices')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    const sub = getAuthType() === 'user';
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (from)   params.from   = from;
      if (to)     params.to     = to;
      const data: Invoice[] = sub
        ? await api.get('/user/invoices', { params }).then(r => r.data.data)
        : await adminInvoiceService.list(params);
      setInvoices(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };
  const clearFilters = () => { setSearch(''); setStatus(''); setFrom(''); setTo(''); };

  const fmt = (n: number, cur = 'USD') => `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  const handleShareLink = async (invId: number) => {
    if (generatingId === invId) return;
    setGeneratingId(invId);
    try {
      const sub = getAuthType() === 'user';
      const res = sub
        ? await api.post(`/user/invoices/${invId}/generate-link`, {}).then(r => r.data.data)
        : await adminInvoiceService.generatePaymentLink(invId);
      setSharedLinks(prev => ({ ...prev, [invId]: res.payment_url }));
      // Refresh list so status shows 'sent' if it was auto-promoted from draft
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to generate share link');
    } finally { setGeneratingId(null); }
  };

  const copyLink = (invId: number) => {
    const url = sharedLinks[invId];
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(invId);
      setTimeout(() => setCopiedId(n => n === invId ? null : n), 2500);
    });
  };

  const closeLink = (invId: number) =>
    setSharedLinks(prev => { const n = { ...prev }; delete n[invId]; return n; });

  return (
    <DashboardLayout title="Invoices">
      <div style={{ maxWidth: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Invoices</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>{invoices.length} invoices</p>
          </div>
          {canCreate && (
            <button onClick={() => router.push('/invoices/new')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <HiPlusCircle size={17} /> New Invoice
            </button>
          )}
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px', position: 'relative' }}>
              <HiMagnifyingGlass size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice # or client…" style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HiFunnel size={14} color="#94a3b8" />
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa' }}>
                <option value="">All Statuses</option>
                {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#475569' }} />
              <span style={{ color: '#94a3b8', fontSize: 13 }}>to</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '9px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#475569' }} />
            </div>
            <button type="submit" style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            {(search || status || from || to) && <button type="button" onClick={clearFilters} style={{ padding: '9px 16px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Clear</button>}
          </div>
        </form>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🧾</div>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No invoices found</div>
              <div style={{ fontSize: 13 }}>Create your first invoice to get started</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Invoice #', 'Client', 'Date', 'Due', 'Amount', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const st      = STATUS_STYLE[inv.status] ?? STATUS_STYLE.draft;
                  const balance = inv.total_amount - inv.paid_amount;
                  const canSend = !['paid', 'cancelled'].includes(inv.status);
                  return (
                    <tr
                      key={inv.id}
                      style={{ borderBottom: i < invoices.length - 1 ? '1px solid #f8fafc' : 'none', cursor: 'pointer' }}
                      onClick={() => router.push(`/invoices/${inv.id}`)}>
                      <td style={{ padding: '13px 14px', fontWeight: 700, color: '#2563eb', fontSize: 13 }}>{inv.invoice_number}</td>
                      <td style={{ padding: '13px 14px', color: '#0f172a', fontSize: 13, fontWeight: 500 }}>{(inv as any).client?.name ?? '—'}</td>
                      <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>{new Date(inv.created_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ padding: '13px 14px', color: inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid' ? '#dc2626' : '#64748b', fontSize: 12 }}>
                        {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td style={{ padding: '13px 14px', color: '#0f172a', fontSize: 13, fontWeight: 600 }}>{fmt(inv.total_amount, inv.currency)}</td>
                      <td style={{ padding: '13px 14px', color: '#059669', fontSize: 13 }}>{fmt(inv.paid_amount, inv.currency)}</td>
                      <td style={{ padding: '13px 14px', color: balance > 0 ? '#ea580c' : '#059669', fontSize: 13, fontWeight: balance > 0 ? 600 : 400 }}>
                        {balance > 0 ? fmt(balance, inv.currency) : '—'}
                      </td>
                      <td style={{ padding: '13px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, ...st }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '13px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => router.push(`/invoices/${inv.id}`)}
                              style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                              View
                            </button>
                            {canSend && (
                              <button
                                onClick={() => router.push(`/invoices/${inv.id}/send`)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: '1.5px solid #d1fae5', background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <HiPaperAirplane size={12} /> Send
                              </button>
                            )}
                            {canSend && (
                              <button
                                onClick={() => handleShareLink(inv.id)}
                                disabled={generatingId === inv.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e0f2fe', background: '#f0f9ff', color: '#0284c7', fontSize: 12, fontWeight: 600, cursor: generatingId === inv.id ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: generatingId === inv.id ? 0.6 : 1 }}>
                                <HiLink size={12} /> {generatingId === inv.id ? '…' : 'Share Link'}
                              </button>
                            )}
                          </div>
                          {sharedLinks[inv.id] && (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#f8fafc', borderRadius: 8, padding: '7px 10px', border: '1px solid #e2e8f0', minWidth: 0 }}>
                              <input
                                readOnly
                                value={sharedLinks[inv.id]}
                                onClick={e => (e.target as HTMLInputElement).select()}
                                style={{ flex: 1, fontSize: 11, border: 'none', background: 'transparent', color: '#475569', outline: 'none', minWidth: 0 }}
                              />
                              <button
                                onClick={() => copyLink(inv.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 10px', borderRadius: 6, border: 'none', background: copiedId === inv.id ? '#059669' : '#0284c7', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {copiedId === inv.id ? <><HiClipboardDocumentCheck size={11} /> Copied</> : <><HiClipboard size={11} /> Copy</>}
                              </button>
                              <button
                                onClick={() => closeLink(inv.id)}
                                style={{ display: 'flex', alignItems: 'center', padding: '4px', borderRadius: 5, border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', flexShrink: 0 }}>
                                <HiXMark size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
