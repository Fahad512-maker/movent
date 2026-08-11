'use client';
import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminInvoiceService } from '@/lib/services/adminInvoiceService';
import api from '@/lib/axios';
import { getAuthType, can } from '@/lib/auth';
import { Invoice, InvoicePayment } from '@/types';
import {
  HiArrowLeft, HiPencilSquare, HiPaperAirplane, HiXCircle,
  HiPlusCircle, HiTrash, HiLink, HiClipboard, HiClipboardDocumentCheck
} from 'react-icons/hi2';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:          { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
  sent:           { bg: '#eff6ff', color: '#2563eb', label: 'Sent' },
  partially_paid: { bg: '#fff7ed', color: '#ea580c', label: 'Partially Paid' },
  paid:           { bg: '#ecfdf5', color: '#059669', label: 'Paid' },
  overdue:        { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  cancelled:      { bg: '#f8fafc', color: '#94a3b8', label: 'Cancelled' },
};

const METHODS = ['bank_transfer', 'cash', 'card', 'cheque', 'gateway'];

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 };

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const invoiceId = Number(params.id);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');

  // Payment form state
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount]     = useState('');
  const [payMethod, setPayMethod]     = useState('bank_transfer');
  const [payDate, setPayDate]         = useState('');
  const [payNotes, setPayNotes]       = useState('');
  const [payGateway, setPayGateway]   = useState('');
  const [payRef, setPayRef]           = useState('');
  const [payLoading, setPayLoading]   = useState(false);
  const [payError, setPayError]       = useState('');

  // Payment link state
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkLoading, setLinkLoading]     = useState(false);
  const [linkErr, setLinkErr]             = useState('');
  const [linkMsg, setLinkMsg]             = useState('');
  const [expiryDays, setExpiryDays]       = useState('');
  const [copied, setCopied]               = useState(false);
  const [paymentUrl, setPaymentUrl]       = useState<string | null>(null);

  const isSubUser = getAuthType() === 'user';
  const isAdmin   = getAuthType() === 'admin';
  const canHandoff = isAdmin || can('project_management', 'canCreateProjectHandoff');

  const load = () => {
    const fetch = isSubUser
      ? api.get(`/user/invoices/${invoiceId}`).then(r => r.data.data)
      : adminInvoiceService.getOne(invoiceId);
    fetch.then(setInvoice).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (invoice?.payment_token) {
      setPaymentUrl(`${window.location.origin}/pay/invoice/${invoice.payment_token}`);
    } else {
      setPaymentUrl(null);
    }
  }, [invoice?.payment_token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (action: 'send' | 'cancel') => {
    const confirm_msg = action === 'cancel' ? 'Cancel this invoice?' : 'Mark invoice as Sent?';
    if (!confirm(confirm_msg)) return;
    setActionErr(''); setActionMsg('');
    try {
      if (action === 'send')   await adminInvoiceService.send(invoiceId);
      if (action === 'cancel') await adminInvoiceService.cancel(invoiceId);
      setActionMsg(action === 'send' ? 'Invoice marked as sent.' : 'Invoice cancelled.');
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setActionErr(ex.response?.data?.message ?? 'Action failed');
    }
  };

  const handleRecordPayment = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPayLoading(true); setPayError('');
    try {
      await adminInvoiceService.recordPayment(invoiceId, {
        amount:       parseFloat(payAmount),
        method:       payMethod,
        payment_date: payDate || undefined,
        notes:        payNotes || undefined,
        gateway:      payGateway || undefined,
        gateway_ref:  payRef || undefined,
      });
      setShowPayForm(false);
      setPayAmount(''); setPayMethod('bank_transfer'); setPayDate(''); setPayNotes(''); setPayGateway(''); setPayRef('');
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setPayError(ex.response?.data?.message ?? 'Failed to record payment');
    } finally { setPayLoading(false); }
  };

  const handleRemovePayment = async (p: InvoicePayment) => {
    if (!confirm(`Remove this ${invoice?.currency ?? ''} ${p.amount} payment?`)) return;
    await adminInvoiceService.removePayment(p.id).catch(() => {});
    load();
  };

  const handleGenerateLink = async () => {
    setLinkLoading(true); setLinkErr(''); setLinkMsg('');
    try {
      await adminInvoiceService.generatePaymentLink(invoiceId, {
        expiry_days: expiryDays ? Number(expiryDays) : undefined,
      });
      setLinkMsg('Payment link generated.');
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setLinkErr(ex.response?.data?.message ?? 'Failed to generate link');
    } finally { setLinkLoading(false); }
  };

  const handleRevokeLink = async () => {
    if (!confirm('Revoke this payment link? The existing URL will stop working.')) return;
    setLinkLoading(true); setLinkErr('');
    try {
      await adminInvoiceService.revokePaymentLink(invoiceId);
      setLinkMsg('Payment link revoked.');
      load();
    } catch { setLinkErr('Failed to revoke link'); }
    finally { setLinkLoading(false); }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const fmt = (n: number, cur?: string) => `${cur ?? invoice?.currency ?? 'USD'} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <DashboardLayout title="Invoice"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!invoice) return <DashboardLayout title="Invoice"><div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>Invoice not found.</div></DashboardLayout>;

  const st = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.draft;
  const outstanding = invoice.total_amount - invoice.paid_amount;
  const canEdit   = invoice.status === 'draft' || invoice.status === 'sent';
  const canSend   = invoice.status === 'draft';
  const canCancel = invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const canPay    = invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.status !== 'draft';
  const canLink = ['sent', 'partially_paid', 'overdue'].includes(invoice.status);

  return (
    <DashboardLayout title={invoice.invoice_number}>
      <div style={{ maxWidth: 900 }}>
        <button onClick={() => router.push('/invoices')} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to Invoices
        </button>

        {/* Header card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '24px 28px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{invoice.invoice_number}</h1>
                <span style={{ padding: '4px 12px', borderRadius: 50, fontSize: 12, fontWeight: 700, ...st }}>{st.label}</span>
              </div>
              {invoice.client && (
                <div>
                  <button onClick={() => router.push(`/clients/${invoice.client_id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#2563eb', fontWeight: 600, fontSize: 14 }}>
                    {invoice.client.name}
                  </button>
                  {invoice.client.company_name && <span style={{ color: '#94a3b8', fontSize: 13 }}> · {invoice.client.company_name}</span>}
                </div>
              )}
              {!invoice.client && invoice.customer_name && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{invoice.customer_name}</span>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {invoice.customer_email   && <span style={{ fontSize: 12, color: '#64748b' }}>{invoice.customer_email}</span>}
                    {invoice.customer_phone   && <span style={{ fontSize: 12, color: '#64748b' }}>{invoice.customer_phone}</span>}
                    {invoice.customer_address && <span style={{ fontSize: 12, color: '#94a3b8' }}>{invoice.customer_address}</span>}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isSubUser && canEdit && (
                <button onClick={() => router.push(`/invoices/${invoiceId}/edit`)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiPencilSquare size={14} /> Edit
                </button>
              )}
              {!isSubUser && canSend && (
                <button onClick={() => handleAction('send')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 7, border: 'none', background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiPaperAirplane size={14} /> Mark Sent
                </button>
              )}
              {!isSubUser && !['paid', 'cancelled'].includes(invoice.status) && (
                <button onClick={() => router.push(`/invoices/${invoiceId}/send`)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiPaperAirplane size={14} /> Send Invoice
                </button>
              )}
              {!isSubUser && canPay && (
                <button onClick={() => setShowPayForm(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiPlusCircle size={14} /> Record Payment
                </button>
              )}
              {!isSubUser && canLink && (
                <button onClick={() => setShowLinkPanel(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: showLinkPanel ? '#eff6ff' : '#fff', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiLink size={14} /> Payment Link
                </button>
              )}
              {!isSubUser && canCancel && (
                <button onClick={() => handleAction('cancel')} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiXCircle size={14} /> Cancel
                </button>
              )}
              {/* Create Project Handoff — once this invoice is paid and not
                  already linked to a project. Visible to Admin and Seller
                  alike (unlike the admin-only buttons above). */}
              {canHandoff && invoice.status === 'paid' && !invoice.project_id && (
                <button onClick={() => router.push(isAdmin ? `/admin/projects/create?invoice_id=${invoiceId}` : `/projects?invoice_id=${invoiceId}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiPlusCircle size={14} /> Create Project Handoff
                </button>
              )}
            </div>
          </div>

          {canHandoff && invoice.status !== 'paid' && invoice.status !== 'cancelled' && !invoice.project_id && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
              Project can be created after invoice payment is completed.
            </div>
          )}
          {invoice.project_id && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 13, color: '#5b21b6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>This invoice is linked to a project.</span>
              <button onClick={() => router.push(`/projects/${invoice.project_id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontWeight: 700, fontSize: 13 }}>
                View Project →
              </button>
            </div>
          )}

          {/* Deal/Project reference — spec §5: client must know exactly
              which service/proposed project this invoice is for, before a
              Project record exists. Swaps to "Related Project" once one
              has been created from this Deal. */}
          {(invoice.invoice_purpose || invoice.lead?.proposed_project_title) && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
              {invoice.lead?.proposed_project_title && (
                <div style={{ fontSize: 13, color: '#0f172a', marginBottom: 3 }}>
                  <strong>{invoice.lead.fulfillment_status === 'project_created' ? 'Related Project: ' : 'Related Deal: '}</strong>
                  {invoice.lead.proposed_project_title}
                  {invoice.lead.deal_reference && <span style={{ color: '#94a3b8' }}> — {invoice.lead.deal_reference}</span>}
                </div>
              )}
              {invoice.invoice_purpose && (
                <div style={{ fontSize: 12, color: '#64748b' }}>Purpose: {invoice.invoice_purpose}</div>
              )}
            </div>
          )}

          {actionMsg && <div style={{ marginTop: 14, padding: '9px 14px', background: '#f0fdf4', borderRadius: 7, color: '#16a34a', fontSize: 13 }}>{actionMsg}</div>}
          {actionErr && <div style={{ marginTop: 14, padding: '9px 14px', background: '#fef2f2', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{actionErr}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 22, paddingTop: 18, borderTop: '1px solid #f1f5f9' }}>
            {[
              { label: 'Total', value: fmt(invoice.total_amount), color: '#0f172a' },
              { label: 'Paid', value: fmt(invoice.paid_amount), color: '#059669' },
              { label: 'Outstanding', value: fmt(outstanding), color: outstanding > 0 ? '#ea580c' : '#059669' },
              { label: 'Due Date', value: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB') : '—', color: '#0f172a' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Link panel */}
        {showLinkPanel && canLink && (
          <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: 22, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1e3a5f' }}>Payment Link</h4>

            {linkMsg && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 7, color: '#16a34a', fontSize: 13 }}>{linkMsg}</div>}
            {linkErr && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{linkErr}</div>}

            {paymentUrl ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <input
                    readOnly
                    value={paymentUrl}
                    style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #93c5fd', borderRadius: 7, fontSize: 12, background: '#fff', color: '#1e293b', outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  />
                  <button
                    onClick={() => copyLink(paymentUrl)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 14px', borderRadius: 7, border: 'none', background: copied ? '#059669' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {copied ? <><HiClipboardDocumentCheck size={14} /> Copied!</> : <><HiClipboard size={14} /> Copy Link</>}
                  </button>
                </div>
                {invoice.token_expires_at && (
                  <div style={{ fontSize: 12, color: '#3b82f6', marginBottom: 12 }}>
                    Expires: {new Date(invoice.token_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handleGenerateLink} disabled={linkLoading} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #93c5fd', background: '#fff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {linkLoading ? 'Working…' : 'Regenerate'}
                  </button>
                  <button onClick={handleRevokeLink} disabled={linkLoading} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #fca5a5', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    Revoke Link
                  </button>
                  <a href={paymentUrl!} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #86efac', background: '#f0fdf4', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    Open Payment Page ↗
                  </a>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569' }}>
                  Generate a secure, shareable link so your client can pay this invoice online — no login required.
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                  <div>
                    <label style={{ ...lbl, color: '#1e3a5f' }}>Link expiry (days)</label>
                    <input
                      type="number" min={1} max={365} placeholder="No expiry"
                      value={expiryDays} onChange={e => setExpiryDays(e.target.value)}
                      style={{ width: 130, padding: '9px 12px', border: '1.5px solid #93c5fd', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff' }}
                    />
                  </div>
                  <button onClick={handleGenerateLink} disabled={linkLoading} style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: linkLoading ? 'not-allowed' : 'pointer' }}>
                    {linkLoading ? 'Generating…' : 'Generate Link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Record Payment form (inline) */}
        {showPayForm && (
          <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: 22, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#14532d' }}>Record Payment — Outstanding: {fmt(outstanding)}</h4>
            {payError && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{payError}</div>}
            <form onSubmit={handleRecordPayment}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ ...lbl, color: '#166534' }}>Amount *</label>
                  <input type="number" min={0.01} max={outstanding} step="0.01" required style={{ ...({ ...{}, ...{ border: '1.5px solid #86efac' }, background: '#fff' } as React.CSSProperties), width: '100%', padding: '9px 12px', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max ${outstanding}`} />
                </div>
                <div>
                  <label style={{ ...lbl, color: '#166534' }}>Method</label>
                  <select style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #86efac', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff' }} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    {METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...lbl, color: '#166534' }}>Date</label>
                  <input type="date" style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #86efac', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }} value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>
              {payMethod === 'gateway' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ ...lbl, color: '#166534' }}>Gateway</label>
                    <input style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #86efac', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }} value={payGateway} onChange={e => setPayGateway(e.target.value)} placeholder="Stripe / PayPal…" />
                  </div>
                  <div>
                    <label style={{ ...lbl, color: '#166534' }}>Reference #</label>
                    <input style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #86efac', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }} value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="txn_xxxx" />
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={{ ...lbl, color: '#166534' }}>Notes</label>
                <input style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #86efac', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }} value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional note…" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={payLoading} style={{ padding: '9px 24px', borderRadius: 7, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: payLoading ? 'not-allowed' : 'pointer' }}>
                  {payLoading ? 'Saving…' : 'Save Payment'}
                </button>
                <button type="button" onClick={() => setShowPayForm(false)} style={{ padding: '9px 18px', borderRadius: 7, border: '1px solid #86efac', background: '#fff', color: '#059669', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
          {/* Line items */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Line Items</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Description', 'Qty', 'Unit Price', 'Total'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Description' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(invoice.items ?? []).map((item, i) => (
                  <tr key={item.id ?? i} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: '#0f172a' }}>{item.description}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: '#475569' }}>{item.quantity}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: '#475569' }}>{fmt(item.unit_price)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{fmt(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals footer */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
              {[
                { label: 'Subtotal', value: fmt(invoice.subtotal) },
                { label: `Tax (${invoice.tax_rate}%)`, value: fmt(invoice.tax_amount) },
                { label: 'Discount', value: `- ${fmt(invoice.discount_amount)}` },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, fontSize: 13, color: '#64748b', marginBottom: 5 }}>
                  <span>{r.label}</span><span style={{ minWidth: 110, textAlign: 'right' }}>{r.value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, marginTop: 8, paddingTop: 8, borderTop: '2px solid #e2e8f0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                <span>Total</span><span style={{ minWidth: 110, textAlign: 'right', color: '#2563eb' }}>{fmt(invoice.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Payments */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Payments</h3>
            </div>
            {(invoice.payments ?? []).length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No payments recorded yet</div>
            ) : (
              <div>
                {(invoice.payments ?? []).map((p, i) => (
                  <div key={p.id} style={{ padding: '13px 18px', borderBottom: i < (invoice.payments?.length ?? 0) - 1 ? '1px solid #f8fafc' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>{fmt(p.amount)}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {p.method?.replace('_', ' ')}
                        {p.payment_date && ` · ${new Date(p.payment_date).toLocaleDateString('en-GB')}`}
                      </div>
                      {p.notes && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{p.notes}</div>}
                    </div>
                    <button onClick={() => handleRemovePayment(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}>
                      <HiTrash size={14} />
                    </button>
                  </div>
                ))}
                <div style={{ padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Total Paid</span>
                  <span style={{ fontWeight: 700, color: '#059669' }}>{fmt(invoice.paid_amount)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {invoice.notes && (
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '18px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
            <p style={{ margin: 0, fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
