'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import axios from 'axios';
import InlineGatewayPayment, { InlineGatewayPaymentHandle } from '@/components/payments/InlineGatewayPayment';

interface PublicInvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Gateway {
  id: number | null;
  type: string;
  label: string;
}

interface BankDetails {
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  iban?: string;
  swift?: string;
}

interface PublicInvoice {
  invoice_number: string;
  company_name: string;
  company_logo?: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_address?: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  currency: string;
  status: 'sent' | 'partially_paid' | 'paid' | 'overdue';
  due_date?: string;
  notes?: string;
  token_expires_at?: string;
  items: PublicInvoiceItem[];
  available_gateways: Gateway[];
  gateway_unavailable_message?: string | null;
  bank_details?: BankDetails | null;
  has_pending_payment: boolean;
  project?: PublicProjectSummary | null;
}

interface PublicProjectSummary {
  id: number;
  name: string;
  reference?: string | null;
  status: string;
  progress: number;
  is_main_invoice: boolean;
  invoice_count: number;
  portal_active: boolean;
  view_mode: 'full' | 'progress';
  start_date?: string | null;
  deadline?: string | null;
  total_invoiced?: number | null;
  total_paid?: number | null;
  outstanding?: number | null;
  invoices?: PublicProjectInvoice[];
}

interface PublicProjectInvoice {
  id: number;
  invoice_number: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  currency: string;
  due_date?: string | null;
  is_current: boolean;
}

type PageState = 'loading' | 'invalid' | 'expired' | 'paid' | 'active' | 'success' | 'pending_confirmation';

const GATEWAY_META: Record<string, { icon: string; desc: string }> = {
  stripe:        { icon: '💳', desc: 'Visa, Mastercard, American Express' },
  paypal:        { icon: '🌐', desc: 'Pay with your PayPal account' },
  authorize_net: { icon: '💳', desc: 'Secure card payment via Authorize.net' },
  bank_transfer: { icon: '🏦', desc: 'Direct bank deposit (1–3 business days)' },
};

function fmt(n: number, cur = 'USD') {
  return `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function cap(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function PublicInvoicePayContent() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token  = params.token ?? '';
  const base   = process.env.NEXT_PUBLIC_API_URL ?? '';

  const [pageState, setPageState]             = useState<PageState>('loading');
  const [invoice, setInvoice]                 = useState<PublicInvoice | null>(null);
  const [selectedGateway, setSelectedGateway] = useState(''); // gateway TYPE (stripe/paypal/authorize_net/bank_transfer) — picks which UI to render
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null); // the specific company_gateway_id to charge
  const [gatewayRef, setGatewayRef]           = useState('');
  const [notes, setNotes]                     = useState('');
  const [paying, setPaying]                   = useState(false);
  const [payError, setPayError]               = useState('');
  const [receiptNumber, setReceiptNumber]     = useState('');
  const [onlinePaymentRef, setOnlinePaymentRef] = useState('');
  const inlineRef = useRef<InlineGatewayPaymentHandle>(null);

  useEffect(() => {
    if (!token) { setPageState('invalid'); return; }
    axios.get(`${base}/public/invoices/${token}`)
      .then(res => {
        const inv = res.data.data as PublicInvoice;
        setInvoice(inv);
        if (inv.status === 'paid') { setPageState('paid'); return; }
        if (inv.has_pending_payment) { setPageState('pending_confirmation'); return; }
        if (inv.available_gateways.length > 0) {
          setSelectedGateway(inv.available_gateways[0].type);
          setSelectedAccountId(inv.available_gateways[0].id);
        }
        setPageState('active');
        if (searchParams.get('cancelled') === '1') {
          setPayError('Payment was cancelled. You can try again below.');
        }
      })
      .catch(err => {
        const status = err.response?.status;
        if (status === 410) setPageState('expired');
        else setPageState('invalid');
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = async () => {
    if (!selectedGateway) { setPayError('Please select a payment method to continue.'); return; }
    setPayError('');

    // Bank transfer has no gateway to charge — same manual claim flow as before.
    if (selectedGateway === 'bank_transfer') {
      setPaying(true);
      try {
        const res = await axios.post(`${base}/public/invoices/${token}/pay`, {
          gateway:     selectedGateway,
          gateway_ref: gatewayRef.trim() || undefined,
          notes:       notes.trim() || undefined,
        });
        setReceiptNumber(res.data?.data?.receipt_number ?? '');
        setPageState('success');
      } catch (err: unknown) {
        const ex = err as { response?: { data?: { message?: string } } };
        setPayError(ex.response?.data?.message ?? 'Submission failed. Please try again.');
      } finally {
        setPaying(false);
      }
      return;
    }

    // Stripe/Authorize.net — the mounted InlineGatewayPayment component owns
    // the actual charge (card element / Accept.js tokenization) and reports
    // back via onSuccess/onError below. PayPal completes via its own in-page
    // button instead (this "Pay Now" button is hidden for that gateway).
    await inlineRef.current?.submit();
  };

  const wrap: React.CSSProperties  = { minHeight: '100vh', background: '#f1f5f9', padding: '36px 16px 72px' };
  const inner: React.CSSProperties = { maxWidth: 680, margin: '0 auto' };
  const card: React.CSSProperties  = {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,.07), 0 1px 8px rgba(0,0,0,.04)',
    border: '1px solid #e2e8f0', padding: '24px 28px', marginBottom: 16,
  };
  const centreCard: React.CSSProperties = { ...card, textAlign: 'center', padding: '56px 40px', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' };
  const renderProjectCard = (inv: PublicInvoice) => {
    const p = inv.project;
    if (!p) return null;
    const full = p.view_mode === 'full';
    const projectInvoices = p.invoices ?? [];

    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 4 }}>Project Status</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{p.name}</div>
            {full && p.reference && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{p.reference}</div>}
          </div>
          <span style={{ padding: '4px 10px', borderRadius: 999, background: '#eff6ff', color: '#2563eb', fontSize: 11, fontWeight: 700 }}>
            {cap(p.status)}
          </span>
        </div>

        <div style={{ marginBottom: full ? 16 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Progress</span>
            <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>{p.progress}%</span>
          </div>
          <div style={{ height: 9, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, Math.min(100, p.progress))}%`, height: '100%', background: 'linear-gradient(135deg, #2563eb, #10b981)' }} />
          </div>
        </div>

        {full && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 12, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
              <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Start Date</div><div style={{ marginTop: 4, fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{fmtDate(p.start_date ?? undefined)}</div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Due Date</div><div style={{ marginTop: 4, fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{fmtDate(p.deadline ?? undefined)}</div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Project Invoices</div><div style={{ marginTop: 4, fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{p.invoice_count}</div></div>
              <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Outstanding</div><div style={{ marginTop: 4, fontSize: 13, color: (p.outstanding ?? 0) > 0 ? '#ea580c' : '#059669', fontWeight: 700 }}>{fmt(p.outstanding ?? 0, inv.currency)}</div></div>
            </div>
            {projectInvoices.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Linked Invoices</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projectInvoices.map(pi => (
                    <div key={pi.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: pi.is_current ? '#eff6ff' : '#f8fafc', border: `1px solid ${pi.is_current ? '#bfdbfe' : '#e2e8f0'}` }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                          {pi.invoice_number}{pi.is_current ? ' (Current)' : ''}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                          {cap(pi.status)}{pi.due_date ? ` • Due ${fmtDate(pi.due_date)}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{fmt(pi.total_amount, pi.currency)}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: pi.outstanding > 0 ? '#ea580c' : '#059669', marginTop: 3 }}>
                          Outstanding {fmt(pi.outstanding, pi.currency)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  if (pageState === 'loading') return (
    <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 38, marginBottom: 14 }}>⏳</div>
        <p style={{ margin: 0, fontSize: 15 }}>Loading invoice…</p>
      </div>
    </div>
  );

  if (pageState === 'invalid') return (
    <div style={wrap}><div style={inner}>
      <div style={centreCard}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>🔗</div>
        <h2 style={{ margin: '0 0 10px', fontSize: 20, color: '#1e293b' }}>Invalid Payment Link</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          This payment link is invalid or does not exist.<br />Please contact the sender for a valid link.
        </p>
      </div>
    </div></div>
  );

  if (pageState === 'expired') return (
    <div style={wrap}><div style={inner}>
      <div style={centreCard}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>⏰</div>
        <h2 style={{ margin: '0 0 10px', fontSize: 20, color: '#1e293b' }}>Link Expired</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          This payment link has expired.<br />Please contact the sender to request a new link.
        </p>
      </div>
    </div></div>
  );

  if (pageState === 'paid' && invoice) return (
    <div style={wrap}><div style={inner}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{invoice.company_name}</div>
      </div>
      <div style={centreCard}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✅</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#16a34a' }}>Invoice Already Paid</h2>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>This invoice has been paid in full. Thank you!</p>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '16px 20px', textAlign: 'left' }}>
          {[['Invoice', invoice.invoice_number], ['Customer', invoice.customer_name]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Amount Paid</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>{fmt(invoice.paid_amount, invoice.currency)}</span>
          </div>
        </div>
      </div>
      {renderProjectCard(invoice)}
    </div></div>
  );

  if (pageState === 'pending_confirmation' && invoice) return (
    <div style={wrap}><div style={inner}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{invoice.company_name}</div>
      </div>
      <div style={centreCard}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>⏳</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#a16207' }}>Payment Awaiting Confirmation</h2>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          A payment for this invoice has already been submitted and is awaiting confirmation by <strong>{invoice.company_name}</strong>. You will be contacted once it&apos;s verified.
        </p>
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '16px 20px', textAlign: 'left' }}>
          {[['Invoice', invoice.invoice_number], ['Customer', invoice.customer_name]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      {renderProjectCard(invoice)}
    </div></div>
  );

  if (pageState === 'success' && invoice) {
    const gw             = invoice.available_gateways.find(g => g.id === selectedAccountId) ?? invoice.available_gateways.find(g => g.type === selectedGateway);
    const isBankTransfer = selectedGateway === 'bank_transfer';
    return (
      <div style={wrap}><div style={inner}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{invoice.company_name}</div>
        </div>
        <div style={{ ...card, textAlign: 'center', padding: '48px 40px' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', border: '3px solid #86efac',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32,
          }}>✅</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#16a34a' }}>
            {isBankTransfer ? 'Transfer Registered' : 'Payment Successful'}
          </h2>
          <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            {isBankTransfer
              ? <>Thank you, <strong>{invoice.customer_name}</strong>. Please complete the bank transfer using the details provided.<br />Your payment will be confirmed once the transfer is received.</>
              : <>Payment successful. Thank you, <strong>{invoice.customer_name}</strong>.</>
            }
          </p>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '20px 24px', textAlign: 'left' }}>
            {([
              ...(receiptNumber ? [['Receipt #', receiptNumber]] : []),
              ['Invoice',        invoice.invoice_number],
              ['Customer',       invoice.customer_name],
              ['Payment Method', gw?.label ?? selectedGateway],
              ...(isBankTransfer && gatewayRef ? [['Reference', gatewayRef]] : []),
              ...(!isBankTransfer && onlinePaymentRef ? [['Transaction ID', onlinePaymentRef]] : []),
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{l}</span>
                <span style={{ fontSize: 13, color: '#1e293b' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #e2e8f0', marginTop: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Amount</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>
                {fmt(invoice.total_amount - invoice.paid_amount, invoice.currency)}
              </span>
            </div>
          </div>
          <p style={{ margin: '16px 0 0', fontSize: 12, color: '#94a3b8' }}>
            {isBankTransfer ? `Status will be updated after verification by ${invoice.company_name}` : 'A receipt has been recorded for this payment.'}
          </p>
        </div>
        {renderProjectCard(invoice)}
      </div></div>
    );
  }

  if (!invoice) return null;

  const outstanding     = invoice.total_amount - invoice.paid_amount;
  const isOverdue       = invoice.status === 'overdue';
  const isPartial       = invoice.status === 'partially_paid';
  const isBankSelected  = selectedGateway === 'bank_transfer';
  const isOnlineGateway = selectedGateway && selectedGateway !== 'bank_transfer';

  return (
    <div style={wrap}>
      <div style={inner}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{invoice.company_name}</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>🔒 Secure Invoice Payment</div>
        </div>

        {/* Invoice Summary */}
        <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 4 }}>Invoice</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{invoice.invoice_number}</div>
            {invoice.due_date && (
              <div style={{ fontSize: 13, color: isOverdue ? '#dc2626' : '#64748b', marginTop: 6 }}>
                {isOverdue ? '⚠️ Overdue — was due ' : 'Due '}{fmtDate(invoice.due_date)}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 4 }}>
              {isPartial ? 'Balance Due' : 'Amount Due'}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: isOverdue ? '#dc2626' : '#0f172a', letterSpacing: '-0.02em' }}>
              {fmt(outstanding, invoice.currency)}
            </div>
            {isPartial && (
              <div style={{ fontSize: 12, color: '#ea580c', marginTop: 4 }}>
                {fmt(invoice.paid_amount, invoice.currency)} already paid
              </div>
            )}
          </div>
        </div>

        {/* Billed To */}
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 12 }}>Billed To</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{invoice.customer_name}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>{invoice.customer_email}</div>
          {invoice.customer_phone   && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>{invoice.customer_phone}</div>}
          {invoice.customer_address && <div style={{ fontSize: 13, color: '#64748b' }}>{invoice.customer_address}</div>}
        </div>

        {renderProjectCard(invoice)}

        {/* Line Items */}
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 14 }}>Invoice Items</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Description', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
                    <th key={h} style={{ padding: '0 0 10px', fontWeight: 700, color: '#475569', fontSize: 12, textAlign: i === 0 ? 'left' : 'right', borderBottom: '2px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ padding: '11px 0', borderBottom: '1px solid #f1f5f9', color: '#1e293b' }}>{item.description}</td>
                    <td style={{ padding: '11px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#64748b' }}>{item.quantity}</td>
                    <td style={{ padding: '11px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#64748b' }}>{fmt(item.unit_price, invoice.currency)}</td>
                    <td style={{ padding: '11px 0', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{fmt(item.total, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <div style={{ width: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>Subtotal</span>
                <span style={{ fontSize: 13, color: '#1e293b' }}>{fmt(invoice.subtotal, invoice.currency)}</span>
              </div>
              {invoice.tax_rate > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Tax ({invoice.tax_rate}%)</span>
                  <span style={{ fontSize: 13, color: '#1e293b' }}>{fmt(invoice.tax_amount, invoice.currency)}</span>
                </div>
              )}
              {invoice.discount_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Discount</span>
                  <span style={{ fontSize: 13, color: '#16a34a' }}>− {fmt(invoice.discount_amount, invoice.currency)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '2px solid #f1f5f9' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Total</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{fmt(invoice.total_amount, invoice.currency)}</span>
              </div>
              {isPartial && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>Paid</span>
                    <span style={{ fontSize: 13, color: '#16a34a' }}>− {fmt(invoice.paid_amount, invoice.currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '2px solid #f1f5f9', marginTop: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#ea580c' }}>Balance Due</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#ea580c' }}>{fmt(outstanding, invoice.currency)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ ...card, background: '#fefce8', border: '1px solid #fef08a' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#a16207', marginBottom: 8 }}>Note</div>
            <p style={{ margin: 0, fontSize: 13, color: '#713f12', lineHeight: 1.6 }}>{invoice.notes}</p>
          </div>
        )}

        {/* No payment methods */}
        {invoice.available_gateways.length === 0 && (
          <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca', textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>No Payment Methods Available</div>
            <div style={{ fontSize: 13, color: '#ef4444' }}>
              {invoice.gateway_unavailable_message ?? `Please contact ${invoice.company_name} to arrange payment.`}
            </div>
          </div>
        )}

        {/* Payment Method Selection */}
        {invoice.available_gateways.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 14 }}>Select Payment Method</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {invoice.available_gateways.map(gw => {
                const meta   = GATEWAY_META[gw.type] ?? { icon: '💰', desc: '' };
                const active = gw.id !== null ? selectedAccountId === gw.id : selectedGateway === gw.type;
                return (
                  <button
                    key={gw.id ?? gw.type}
                    type="button"
                    onClick={() => { setSelectedGateway(gw.type); setSelectedAccountId(gw.id); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                      padding: '14px 16px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
                      background: active ? '#eff6ff' : '#fff',
                    }}
                  >
                    <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{meta.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{gw.label}</div>
                      {meta.desc && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{meta.desc}</div>}
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${active ? '#3b82f6' : '#cbd5e1'}`,
                      background: active ? '#3b82f6' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                    }}>
                      {active ? '✓' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bank Transfer Details */}
        {isBankSelected && invoice.bank_details && (
          <div style={{ ...card, background: '#f0f9ff', border: '1.5px solid #bae6fd' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0369a1', marginBottom: 14 }}>
              🏦 Bank Transfer Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                ['Bank Name',       invoice.bank_details.bank_name],
                ['Account Name',    invoice.bank_details.account_name],
                ['Account Number',  invoice.bank_details.account_number],
                ['IBAN',            invoice.bank_details.iban],
                ['SWIFT / BIC',     invoice.bank_details.swift],
              ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #e0f2fe' }}>
                  <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0c4a6e' }}>{value}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: '14px 0 0', fontSize: 12, color: '#0369a1', lineHeight: 1.6 }}>
              Use invoice number <strong>{invoice.invoice_number}</strong> as payment reference. Enter your transfer reference below after sending.
            </p>
          </div>
        )}

        {/* Online Gateway — inline card fields, no redirect */}
        {isOnlineGateway && (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: 14 }}>Card Details</div>
            <InlineGatewayPayment
              key={selectedAccountId ?? selectedGateway}
              ref={inlineRef}
              gateway={selectedGateway as 'stripe' | 'paypal' | 'authorize_net'}
              apiClient={axios}
              initUrl={`${base}/public/invoices/${token}/gateways/${selectedGateway}/init${selectedAccountId ? `?company_gateway_id=${selectedAccountId}` : ''}`}
              createOrderUrl={selectedGateway === 'paypal' ? `${base}/public/invoices/${token}/gateways/paypal/create-order` : undefined}
              chargeUrl={`${base}/public/invoices/${token}/gateways/${selectedGateway}/charge`}
              companyGatewayId={selectedAccountId}
              currency={invoice.currency}
              disabled={paying}
              onProcessingChange={setPaying}
              onSuccess={result => {
                setReceiptNumber(result.receipt_number ?? '');
                setOnlinePaymentRef(result.gateway_ref);
                setPageState('success');
              }}
              onError={msg => setPayError(msg)}
            />
          </div>
        )}

        {/* Reference & Notes — bank transfer only; online gateways collect
            payment details on the gateway's own hosted page. */}
        {isBankSelected && (
          <div style={card}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Transfer Reference / Transaction ID
                <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={gatewayRef}
                onChange={e => setGatewayRef(e.target.value)}
                placeholder="e.g. TXN123456789"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Additional Notes
                <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any additional information…"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {payError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
            {payError}
          </div>
        )}

        {/* Submit — hidden for PayPal, which completes via its own in-page button above */}
        {invoice.available_gateways.length > 0 && selectedGateway !== 'paypal' && (
          <button
            type="button"
            onClick={handlePay}
            disabled={paying || !selectedGateway}
            style={{
              width: '100%', padding: '17px 24px', borderRadius: 10, fontSize: 16, fontWeight: 700,
              cursor: paying || !selectedGateway ? 'not-allowed' : 'pointer', border: 'none',
              background: paying || !selectedGateway ? '#93c5fd' : (isOverdue ? '#dc2626' : '#2563eb'),
              color: '#fff', boxShadow: '0 2px 10px rgba(37,99,235,.22)',
            }}
          >
            {paying
              ? '⏳  Processing…'
              : isBankSelected
                ? `Confirm Transfer  ${fmt(outstanding, invoice.currency)}`
                : `Pay Now  ${fmt(outstanding, invoice.currency)}`
            }
          </button>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#94a3b8' }}>
          🔒 Secure payment link from {invoice.company_name}
        </div>

      </div>
    </div>
  );
}

export default function PublicInvoicePayPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>⏳</div>
          <p style={{ margin: 0, fontSize: 15 }}>Loading invoice…</p>
        </div>
      </div>
    }>
      <PublicInvoicePayContent />
    </Suspense>
  );
}
