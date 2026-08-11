'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminInvoiceService } from '@/lib/services/adminInvoiceService';
import { Invoice, InvoiceItem } from '@/types';
import api from '@/lib/axios';
import { HiArrowLeft, HiPlusCircle, HiTrash } from 'react-icons/hi2';

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };

interface LineItem { description: string; quantity: number; unit_price: number; }
interface GatewayAccountOption { id: number; gateway_type: string; label: string; is_default: boolean; is_active?: boolean }

// Per gateway TYPE, not globally: if a type has exactly one active account,
// auto-select it; otherwise select whichever account of that type is
// explicitly flagged default. A type with 2+ accounts and none marked
// default is left unselected — the user picks.
function defaultGatewaySelection(accounts: GatewayAccountOption[]): number[] {
  const byType = new Map<string, GatewayAccountOption[]>();
  accounts.forEach(a => byType.set(a.gateway_type, [...(byType.get(a.gateway_type) ?? []), a]));
  const ids: number[] = [];
  byType.forEach(list => {
    if (list.length === 1) ids.push(list[0].id);
    else { const def = list.find(a => a.is_default); if (def) ids.push(def.id); }
  });
  return ids;
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const invoiceId = Number(params.id);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const [items, setItems]     = useState<LineItem[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [dueDate, setDueDate]   = useState('');
  const [taxRate, setTaxRate]   = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes]       = useState('');
  const [gatewayAccounts, setGatewayAccounts]       = useState<GatewayAccountOption[]>([]);
  const [selectedGatewayIds, setSelectedGatewayIds] = useState<number[]>([]);
  const [gatewaysLoaded, setGatewaysLoaded]         = useState(false);

  useEffect(() => {
    adminInvoiceService.getOne(invoiceId).then(inv => {
      setInvoice(inv);
      setCurrency(inv.currency);
      setDueDate(inv.due_date ?? '');
      setTaxRate(inv.tax_rate);
      setDiscount(inv.discount_amount);
      setNotes(inv.notes ?? '');
      setItems((inv.items ?? []).map((it: InvoiceItem) => ({
        description: it.description,
        quantity:    it.quantity,
        unit_price:  it.unit_price,
      })));

      api.get('/admin/settings').then(r => {
        const accounts = (r.data.data.gateways as GatewayAccountOption[]).filter(g => g.is_active);
        setGatewayAccounts(accounts);
        const explicit = inv.gateway_account_ids ?? [];
        setSelectedGatewayIds(explicit.length ? explicit : defaultGatewaySelection(accounts));
        setGatewaysLoaded(true);
      }).catch(() => setGatewaysLoaded(true));
    }).catch(() => setError('Failed to load invoice')).finally(() => setLoading(false));
  }, [invoiceId]);

  // Only one account per gateway TYPE can be selected at once for an invoice
  // — selecting one clears any other selected account of that same type.
  // Different types (e.g. Stripe + PayPal) stay independent.
  const toggleGatewaySelection = (id: number) => {
    const account = gatewayAccounts.find(a => a.id === id);
    if (!account) return;
    setSelectedGatewayIds(p => {
      const withoutSameType = p.filter(x => {
        const a = gatewayAccounts.find(g => g.id === x);
        return !a || a.gateway_type !== account.gateway_type;
      });
      return p.includes(id) ? withoutSameType : [...withoutSameType, id];
    });
  };

  const setItem = (i: number, k: keyof LineItem, v: string | number) =>
    setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
  const addItem    = () => setItems(p => [...p, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const taxAmt   = (subtotal * taxRate) / 100;
  const total    = Math.max(0, subtotal + taxAmt - discount);

  const fmt = (n: number) => `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (items.some(r => !r.description.trim())) { setError('All items need a description'); return; }
    setSaving(true); setError('');
    try {
      await adminInvoiceService.update(invoiceId, {
        currency,
        tax_rate:        taxRate,
        discount_amount: discount,
        notes:    notes || null,
        due_date: dueDate || null,
        items: items.map(r => ({ description: r.description, quantity: r.quantity, unit_price: r.unit_price })),
        gateway_account_ids: selectedGatewayIds,
      });
      router.push(`/invoices/${invoiceId}`);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = ex.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(ex.response?.data?.message ?? 'Failed to update invoice');
    } finally { setSaving(false); }
  };

  if (loading) return <DashboardLayout title="Edit Invoice"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!invoice) return <DashboardLayout title="Edit Invoice"><div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>Invoice not found.</div></DashboardLayout>;
  if (invoice.status !== 'draft' && invoice.status !== 'sent') {
    return <DashboardLayout title="Edit Invoice"><div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>Cannot edit a {invoice.status} invoice.</div></DashboardLayout>;
  }

  return (
    <DashboardLayout title={`Edit ${invoice.invoice_number}`}>
      <div style={{ maxWidth: 900 }}>
        <button onClick={() => router.push(`/invoices/${invoiceId}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to {invoice.invoice_number}
        </button>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
            {/* Left */}
            <div>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Invoice Details</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>Client: <strong style={{ color: '#0f172a' }}>{invoice.client?.name}</strong></p>
                </div>
                <div style={{ padding: 22 }}>
                  {error && <div style={{ marginBottom: 14, padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{error}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={lbl}>Currency</label>
                      <select style={inp} value={currency} onChange={e => setCurrency(e.target.value)}>
                        <option value="PKR">PKR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Due Date</label>
                      <input type="date" style={inp} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>Notes</label>
                      <input style={inp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note…" />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Line Items</h3>
                  <button type="button" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <HiPlusCircle size={14} /> Add Item
                  </button>
                </div>
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 110px 40px', gap: 8, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
                      <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                    ))}
                  </div>
                  {items.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 110px 40px', gap: 8, padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
                      <input style={inp} value={row.description} onChange={e => setItem(i, 'description', e.target.value)} placeholder="Item description" required />
                      <input style={{ ...inp, textAlign: 'right' }} type="number" min={1} step="0.01" value={row.quantity} onChange={e => setItem(i, 'quantity', parseFloat(e.target.value) || 1)} />
                      <input style={{ ...inp, textAlign: 'right' }} type="number" min={0} step="0.01" value={row.unit_price} onChange={e => setItem(i, 'unit_price', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#0f172a', paddingRight: 4 }}>{fmt(row.quantity * row.unit_price)}</div>
                      <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} style={{ background: 'none', border: 'none', cursor: items.length === 1 ? 'not-allowed' : 'pointer', color: '#f87171', padding: 4, opacity: items.length === 1 ? 0.3 : 1 }}>
                        <HiTrash size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Gateways card */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', marginTop: 16 }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Payment Gateways for this Invoice</h3>
                </div>
                <div style={{ padding: 22 }}>
                  {!gatewaysLoaded ? (
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</div>
                  ) : gatewayAccounts.length === 0 ? (
                    <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>
                      No payment gateway is configured for this company. Please configure a payment gateway before sending invoice.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {gatewayAccounts.map(g => (
                        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: gatewayAccounts.length > 1 ? 'pointer' : 'default' }}>
                          <input
                            type="checkbox"
                            checked={selectedGatewayIds.includes(g.id)}
                            onChange={() => toggleGatewaySelection(g.id)}
                            disabled={gatewayAccounts.length === 1}
                            style={{ width: 16, height: 16, accentColor: '#2563eb' }}
                          />
                          <span style={{ fontSize: 13, color: '#0f172a' }}>{g.label}</span>
                          {g.is_default && <span style={{ padding: '2px 8px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontSize: 10.5, fontWeight: 700 }}>DEFAULT</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right */}
            <div style={{ position: 'sticky', top: 20 }}>
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Summary</h3>
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Tax Rate (%)</label>
                    <input type="number" min={0} max={100} step="0.01" style={inp} value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={lbl}>Discount ({currency})</label>
                    <input type="number" min={0} step="0.01" style={inp} value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                    {[
                      { label: 'Subtotal', value: fmt(subtotal) },
                      { label: `Tax (${taxRate}%)`, value: fmt(taxAmt) },
                      { label: 'Discount', value: `- ${fmt(discount)}` },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
                        <span>{row.label}</span><span style={{ fontWeight: 500 }}>{row.value}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '2px solid #e2e8f0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      <span>Total</span><span style={{ color: '#2563eb' }}>{fmt(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => router.push(`/invoices/${invoiceId}`)} style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: 9, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
