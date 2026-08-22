'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientService } from '@/lib/services/clientService';
import clientApi from '@/lib/clientAxios';
import InlineGatewayPayment, { InlineGatewayPaymentHandle } from '@/components/payments/InlineGatewayPayment';
import toast from 'react-hot-toast';

const GREEN = '#10b981';

interface ConversionPreview {
  amount: number;
  currency: string;
  rate: number;
}

interface Gateway {
  id: number | null;
  type: string;
  label: string;
  supports_invoice_currency?: boolean;
  conversion_preview?: ConversionPreview | null;
}

interface BankDetails {
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  iban?: string;
  swift?: string;
}

interface GatewayPageData {
  invoice: {
    id: number;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    currency: string;
  };
  gateways: Gateway[];
  bank: BankDetails | null;
}

const GATEWAY_ICONS: Record<string, string> = {
  paypal:        '🅿️',
  stripe:        '⚡',
  authorize_net: '🏢',
};

export default function ClientPaymentPage() {
  const { id }    = useParams();
  const router    = useRouter();
  const invoiceId = Number(id);

  const [data, setData]               = useState<GatewayPageData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [selectedMethod, setSelected] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [ref, setRef]                 = useState('');
  const [notes, setNotes]             = useState('');
  const [paying, setPaying]           = useState(false);
  const [receipt, setReceipt]         = useState<{ number: string; amount: number; currency: string; paid?: boolean; gatewayRef?: string } | null>(null);
  const inlineRef = useRef<InlineGatewayPaymentHandle>(null);

  useEffect(() => {
    clientService.invoiceGateways(invoiceId)
      .then((d: GatewayPageData) => {
        setData(d);
        if (d.gateways.length > 0) {
          setSelected(d.gateways[0].type);
          setSelectedAccountId(d.gateways[0].id);
        } else if (d.bank) {
          setSelected('bank_transfer');
        }
      })
      .catch(() => router.push(`/client/invoices/${invoiceId}`))
      .finally(() => setLoading(false));

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cancelled') === '1') {
      toast.error('Payment was cancelled. You can try again below.');
    }
  }, [invoiceId]);

  const isRealGateway = (type: string) => data?.gateways.some(g => g.type === type) ?? false;

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMethod) return;

    // Stripe/Authorize.net — the mounted InlineGatewayPayment component owns
    // the actual charge (card element / Accept.js tokenization) and reports
    // back via onSuccess/onError below. PayPal completes via its own in-page
    // button instead (the submit button is hidden for that gateway).
    if (isRealGateway(selectedMethod)) {
      await inlineRef.current?.submit();
      return;
    }

    setPaying(true);
    try {
      const res = await clientService.payInvoice(invoiceId, {
        method:      selectedMethod,
        gateway_ref: ref || undefined,
        notes:       notes || undefined,
      });
      setReceipt({
        number:   res?.data?.receipt_number ?? '',
        amount:   data?.invoice ? Math.max(0, Number(data.invoice.total_amount) - Number(data.invoice.paid_amount)) : 0,
        currency: data?.invoice?.currency ?? 'USD',
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit payment');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#94a3b8' }}>Loading…</div>;
  if (!data)   return null;

  if (receipt) return (
    <div style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
      <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 14, padding: '32px 28px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', border: '3px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 28 }}>✅</div>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#15803d' }}>
          {receipt.paid ? 'Payment Successful' : 'Payment Submitted'}
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#166534' }}>
          {receipt.paid
            ? 'Payment successful. Thank you.'
            : 'Your payment is pending verification. Our team will confirm within 1–2 business days.'}
        </p>
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #bbf7d0', padding: '18px 20px', textAlign: 'left', marginBottom: 20 }}>
          {receipt.number && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Receipt #</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{receipt.number}</span>
            </div>
          )}
          {data && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Invoice</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{data.invoice.invoice_number}</span>
            </div>
          )}
          {receipt.gatewayRef && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Transaction ID</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{receipt.gatewayRef}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Amount</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>{receipt.currency} {receipt.amount.toLocaleString()}</span>
          </div>
        </div>
        <button
          onClick={() => router.push(`/client/invoices/${invoiceId}`)}
          style={{ width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', background: GREEN, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Back to Invoice
        </button>
      </div>
    </div>
  );

  const due          = Math.max(0, Number(data.invoice.total_amount) - Number(data.invoice.paid_amount));
  const isGateway    = ['paypal', 'stripe', 'authorize_net'].includes(selectedMethod);
  const isBankXfer   = selectedMethod === 'bank_transfer';

  const allMethods: Array<{ optionKey: string | number; type: string; accountId: number | null; label: string; icon: string; conversionPreview?: ConversionPreview | null }> = [
    ...data.gateways.map(g => ({
      optionKey: g.id ?? g.type,
      type:      g.type,
      accountId: g.id,
      label:     g.label,
      icon:      GATEWAY_ICONS[g.type] ?? '💳',
      conversionPreview: g.conversion_preview,
    })),
    ...(data.bank ? [{ optionKey: 'bank_transfer', type: 'bank_transfer', accountId: null, label: 'Bank Transfer', icon: '🏦' }] : []),
  ];

  const selectedMethodMeta = allMethods.find(m => (m.accountId !== null ? m.accountId === selectedAccountId : m.type === selectedMethod));
  // PayPal's Buttons SDK loads with a `currency` query param that must match
  // the order it's about to create — once the backend converts an
  // unsupported invoice currency, that's the converted currency, not the
  // invoice's own.
  const chargeCurrency = selectedMethodMeta?.conversionPreview?.currency ?? data.invoice.currency;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
    borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 580 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>
          ←
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Submit Payment</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
            Invoice {data.invoice.invoice_number}
          </p>
        </div>
      </div>

      {/* Amount Due Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #065f46, #10b981)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 24, color: '#fff',
      }}>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>Amount Due</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>
          {data.invoice.currency} {due.toLocaleString()}
        </div>
        {Number(data.invoice.paid_amount) > 0 && (
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            {data.invoice.currency} {Number(data.invoice.paid_amount).toLocaleString()} already paid
          </div>
        )}
      </div>

      <form onSubmit={handlePay}>
        {/* Payment Method Cards */}
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
          padding: 24, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>
            Select Payment Method
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allMethods.map(m => {
              const active = m.accountId !== null ? selectedAccountId === m.accountId : selectedMethod === m.type;
              return (
                <div key={m.optionKey}>
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                      border: `2px solid ${active ? GREEN : '#e2e8f0'}`,
                      borderRadius: 10, cursor: 'pointer',
                      background: active ? '#f0fdf4' : '#fff',
                    }}>
                    <input
                      type="radio"
                      name="method"
                      value={m.optionKey}
                      checked={active}
                      onChange={() => { setSelected(m.type); setSelectedAccountId(m.accountId); }}
                      style={{ accentColor: GREEN, width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{m.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{m.label}</span>
                  </label>
                  {m.conversionPreview && (
                    <div style={{
                      fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a',
                      borderRadius: 6, padding: '6px 10px', marginTop: 6,
                    }}>
                      {m.label} doesn&apos;t support {data.invoice.currency} — you&apos;ll be charged{' '}
                      <strong>{m.conversionPreview.currency} {m.conversionPreview.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      {' '}for {data.invoice.currency} {due.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      {' '}(1 {data.invoice.currency} = {m.conversionPreview.rate.toFixed(4)} {m.conversionPreview.currency}).
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bank Transfer Instructions */}
        {isBankXfer && data.bank && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: 12, padding: '16px 20px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 12, letterSpacing: '0.05em' }}>
              BANK ACCOUNT DETAILS
            </div>
            {data.bank.bank_name      && <BankRow label="Bank"           value={data.bank.bank_name} />}
            {data.bank.account_name   && <BankRow label="Account Name"   value={data.bank.account_name} />}
            {data.bank.account_number && <BankRow label="Account Number" value={data.bank.account_number} />}
            {data.bank.iban           && <BankRow label="IBAN"           value={data.bank.iban} />}
            {data.bank.swift          && <BankRow label="SWIFT / BIC"    value={data.bank.swift} />}
            <div style={{ fontSize: 12, color: '#2563eb', marginTop: 10 }}>
              Use invoice <strong>{data.invoice.invoice_number}</strong> as the payment reference.
            </div>
          </div>
        )}

        {/* Card details — inline, no redirect */}
        {isGateway && (
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
            padding: 24, marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>Card Details</div>
            <InlineGatewayPayment
              key={selectedAccountId ?? selectedMethod}
              ref={inlineRef}
              gateway={selectedMethod as 'stripe' | 'paypal' | 'authorize_net'}
              apiClient={clientApi}
              initUrl={`/client/invoices/${invoiceId}/gateways/${selectedMethod}/init${selectedAccountId ? `?company_gateway_id=${selectedAccountId}` : ''}`}
              createOrderUrl={selectedMethod === 'paypal' ? `/client/invoices/${invoiceId}/gateways/paypal/create-order` : undefined}
              chargeUrl={`/client/invoices/${invoiceId}/gateways/${selectedMethod}/charge`}
              companyGatewayId={selectedAccountId}
              currency={chargeCurrency}
              disabled={paying}
              onProcessingChange={setPaying}
              onSuccess={result => {
                setReceipt({
                  number:    result.receipt_number ?? '',
                  amount:    due,
                  currency:  data.invoice.currency,
                  paid:      true,
                  gatewayRef: result.gateway_ref,
                });
              }}
              onError={msg => toast.error(msg)}
            />
          </div>
        )}

        {/* Reference + Notes — manual methods only; real gateways collect
            payment details on the gateway's own hosted page. */}
        {!isGateway && (
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
            padding: 24, marginBottom: 16,
          }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                Reference / Transaction ID{' '}
                <span style={{ fontSize: 11, color: '#94a3b8' }}>(optional)</span>
              </label>
              <input
                value={ref}
                onChange={e => setRef(e.target.value)}
                placeholder={isBankXfer ? 'Bank transfer reference…' : 'Reference number…'}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                Additional Notes{' '}
                <span style={{ fontSize: 11, color: '#94a3b8' }}>(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional information…"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>
        )}

        {/* Pending verification notice — manual methods only */}
        {!isGateway && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
            padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#92400e',
          }}>
            ⚠️ Payment will be marked as <strong>Pending Verification</strong>.
            Our team will confirm within 1–2 business days.
          </div>
        )}

        {/* Hidden for PayPal, which completes via its own in-page button above */}
        {selectedMethod !== 'paypal' && (
          <button
            type="submit"
            disabled={paying || !selectedMethod}
            style={{
              width: '100%', padding: 14,
              background: paying ? '#a7f3d0' : GREEN,
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              cursor: paying ? 'not-allowed' : 'pointer',
            }}>
            {paying
              ? 'Processing…'
              : isGateway
                ? `Pay Now — ${data.invoice.currency} ${due.toLocaleString()}`
                : `Submit Payment — ${data.invoice.currency} ${due.toLocaleString()}`}
          </button>
        )}
      </form>
    </div>
  );
}

function BankRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{value}</span>
    </div>
  );
}
