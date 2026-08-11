'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminInvoiceService } from '@/lib/services/adminInvoiceService';
import api from '@/lib/axios';
import { getAuthType } from '@/lib/auth';
import { Invoice } from '@/types';
import { HiArrowLeft, HiPaperAirplane, HiClipboard, HiClipboardDocumentCheck, HiEnvelope } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:          { bg: '#f1f5f9', color: '#64748b', label: 'Draft' },
  sent:           { bg: '#eff6ff', color: '#2563eb', label: 'Sent' },
  partially_paid: { bg: '#fff7ed', color: '#ea580c', label: 'Partially Paid' },
  paid:           { bg: '#ecfdf5', color: '#059669', label: 'Paid' },
  overdue:        { bg: '#fef2f2', color: '#dc2626', label: 'Overdue' },
  cancelled:      { bg: '#f8fafc', color: '#94a3b8', label: 'Cancelled' },
};

export default function SendInvoicePage() {
  const router    = useRouter();
  const { id }    = useParams<{ id: string }>();
  const invoiceId = Number(id);
  const isSubUser = getAuthType() === 'user';

  const [invoice, setInvoice]   = useState<Invoice | null>(null);
  const [loading, setLoading]   = useState(true);
  const [email, setEmail]       = useState('');
  const [expiry, setExpiry]     = useState('30');
  const [sending, setSending]   = useState(false);
  const [result, setResult]     = useState<{ payment_url: string; sent_to: string } | null>(null);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    const fetch = isSubUser
      ? api.get(`/user/invoices/${invoiceId}`).then(r => r.data.data)
      : adminInvoiceService.getOne(invoiceId);
    fetch
      .then((inv: Invoice) => {
        setInvoice(inv);
        const clientEmail = (inv as any).client?.email ?? '';
        if (clientEmail) setEmail(clientEmail);
      })
      .catch(() => router.push('/invoices'))
      .finally(() => setLoading(false));
  }, [invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      const expiryDays = expiry ? Number(expiry) : undefined;
      const res = isSubUser
        ? await api.post(`/user/invoices/${invoiceId}/send-email`, { email: email.trim(), expiry_days: expiryDays }).then(r => r.data.data)
        : await adminInvoiceService.sendEmail(invoiceId, email.trim(), expiryDays);
      setResult(res);
      toast.success(`Invoice sent to ${res.sent_to}`);
      if (invoice?.status === 'draft') {
        const refresh = isSubUser
          ? api.get(`/user/invoices/${invoiceId}`).then(r => r.data.data)
          : adminInvoiceService.getOne(invoiceId);
        refresh.then(setInvoice).catch(() => {});
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send invoice');
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    if (!result?.payment_url) return;
    navigator.clipboard.writeText(result.payment_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const fmt = (n: number) => `${invoice?.currency ?? 'USD'} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (loading) return (
    <DashboardLayout title="Send Invoice">
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
    </DashboardLayout>
  );

  if (!invoice) return null;

  const st          = STATUS_STYLE[invoice.status] ?? STATUS_STYLE.draft;
  const amountDue   = Math.max(0, invoice.total_amount - invoice.paid_amount);
  const clientEmail = (invoice as any).client?.email ?? '';

  return (
    <DashboardLayout title="Send Invoice">
      <div style={{ maxWidth: 640 }}>
        {/* Back */}
        <button
          onClick={() => router.push('/invoices')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to Invoices
        </button>

        {/* Page title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Send Invoice</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Email the invoice link to the client so they can view and pay online.
          </p>
        </div>

        {/* Invoice Summary card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{invoice.invoice_number}</span>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, ...st }}>{st.label}</span>
              </div>
              {(invoice as any).client && (
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {(invoice as any).client.name}
                  {(invoice as any).client.company_name && ` · ${(invoice as any).client.company_name}`}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Amount Due</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: amountDue > 0 ? '#dc2626' : '#059669' }}>
                {fmt(amountDue)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 14, borderTop: '1px solid #f8fafc' }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>Total</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{fmt(invoice.total_amount)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>Paid</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{fmt(invoice.paid_amount)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>Due Date</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB') : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Draft notice */}
        {invoice.status === 'draft' && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>This invoice is a <strong>draft</strong> — sending will mark it as <strong>Sent</strong>.</span>
          </div>
        )}

        {/* Send form */}
        <form onSubmit={handleSend}>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '24px', marginBottom: 16 }}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Recipient Email <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <HiEnvelope size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  autoFocus
                  style={{
                    width: '100%', padding: '11px 12px 11px 36px',
                    border: '1.5px solid #e2e8f0', borderRadius: 9,
                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              {clientEmail && email !== clientEmail && (
                <button
                  type="button"
                  onClick={() => setEmail(clientEmail)}
                  style={{ marginTop: 6, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  ← Use client email: {clientEmail}
                </button>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Payment Link Expiry
                <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>(days)</span>
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
                placeholder="30"
                style={{
                  width: 160, padding: '10px 12px',
                  border: '1.5px solid #e2e8f0', borderRadius: 9,
                  fontSize: 13, outline: 'none',
                }}
              />
              <span style={{ marginLeft: 10, fontSize: 12, color: '#94a3b8' }}>
                Leave blank for no expiry
              </span>
            </div>
          </div>

          {/* Result — payment link after successful send */}
          {result && (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 12 }}>
                ✅ Invoice sent to {result.sent_to}
              </div>
              <div style={{ fontSize: 12, color: '#166534', marginBottom: 8, fontWeight: 600 }}>
                Payment Link (share directly with client)
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  readOnly
                  value={result.payment_url}
                  style={{
                    flex: 1, padding: '10px 12px',
                    border: '1.5px solid #86efac', borderRadius: 8,
                    fontSize: 12, background: '#fff', color: '#374151',
                    outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                />
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px', borderRadius: 8, border: 'none',
                    background: copied ? '#059669' : '#16a34a',
                    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}>
                  {copied
                    ? <><HiClipboardDocumentCheck size={14} /> Copied!</>
                    : <><HiClipboard size={14} /> Copy Link</>}
                </button>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: '#166534' }}>
                The client can open this link to view and pay the invoice — no login required.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={sending || !email.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '13px',
              borderRadius: 10, border: 'none',
              background: sending || !email.trim()
                ? '#a5b4fc'
                : 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: sending || !email.trim() ? 'not-allowed' : 'pointer',
            }}>
            <HiPaperAirplane size={17} />
            {sending ? 'Sending…' : result ? 'Resend Invoice' : 'Send Invoice'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
