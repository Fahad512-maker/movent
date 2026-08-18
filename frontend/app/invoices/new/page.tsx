'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminInvoiceService, InvoicePayload } from '@/lib/services/adminInvoiceService';
import { adminClientService, ClientCompany } from '@/lib/services/adminClientService';
import { userClientService } from '@/lib/services/userClientService';
import { adminLeadService, userLeadService, Lead } from '@/lib/services/adminLeadService';
import { adminProjectService, Project } from '@/lib/services/adminProjectService';
import { userProjectService } from '@/lib/services/userProjectService';
import { Admin, Client, User } from '@/types';
import { getAuthType, getAuthUser, can } from '@/lib/auth';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { HiArrowLeft, HiFolder, HiFolderPlus, HiPlusCircle, HiTrash, HiUserCircle, HiUsers } from 'react-icons/hi2';
import SubmitButton from '@/components/ui/SubmitButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };

interface LineItem { description: string; quantity: number; unit_price: number; }
const EMPTY_ITEM = (): LineItem => ({ description: '', quantity: 1, unit_price: 0 });

interface GatewayAccountOption { id: number; gateway_type: string; label: string; is_default: boolean; is_active?: boolean }

// Per gateway TYPE, not globally: if a type has exactly one active account,
// auto-select it (nothing else to choose from); otherwise select whichever
// account of that type is explicitly flagged default. A type with 2+
// accounts and none marked default is left unselected — the user picks.
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

type CustomerType = 'client' | 'guest';
type ProjectMode = 'new' | 'existing';

function NewInvoiceForm() {
  useAdminGuard();
  const router  = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get('lead_id') ? Number(searchParams.get('lead_id')) : null;
  const clientIdParam = searchParams.get('client_id') ? Number(searchParams.get('client_id')) : null;
  const companyIdParam = searchParams.get('company_id') ? Number(searchParams.get('company_id')) : null;

  // isAdmin is cookie-derived — must be state to avoid SSR/client hydration mismatch.
  // authResolved guards every effect below that branches on isAdmin: without
  // it, the lead/client-prefill effects can fire once on mount while isAdmin
  // is still its default `false`, calling userLeadService (GET /user/leads/…)
  // for an actual Company Admin — a wrong-guard 401 that force-logs-out via
  // the global axios interceptor, even though the very next render would
  // have called the correct admin endpoint.
  const [isAdmin, setIsAdmin] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [leadPrefilled, setLeadPrefilled] = useState(false);
  const [dealLead, setDealLead] = useState<Lead | null>(null);
  const [clientPrefilled, setClientPrefilled] = useState(false);

  // Company + settings
  const [companies, setCompanies]   = useState<ClientCompany[]>([]);
  const [companyId, setCompanyId]   = useState(0);
  const [currency, setCurrency]     = useState('USD');
  const [dueDate, setDueDate]       = useState('');
  const [taxRate, setTaxRate]       = useState(0);
  const [discount, setDiscount]     = useState(0);
  const [notes, setNotes]           = useState('');
  const [invoicePurpose, setInvoicePurpose] = useState('');
  const [items, setItems]           = useState<LineItem[]>([EMPTY_ITEM()]);

  // Customer type — starts as 'client'; useEffect corrects to 'guest' for sub-users
  const [customerType, setCustomerType] = useState<CustomerType>('client');
  const [clients, setClients]           = useState<Client[]>([]);
  // Starts true (not false) — companyId resolves asynchronously on mount, and
  // the lead/client prefill effects below gate on `!loadingClients` to avoid
  // reading a stale, still-empty `clients` list. Defaulting to false left a
  // window where that guard was wrongly open before the real fetch ever
  // started, so a lead that had already been converted to a client would
  // get permanently prefilled as "Guest" (clients.some(...) against an empty
  // array) before its actual client ever loaded.
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientId, setClientId]         = useState<number | null>(null);
  // Why the client list came back empty, when it wasn't simply "none exist".
  // A 403 from GET /user/clients (missing canViewClients) used to be swallowed
  // and rendered as "No clients found for this company", which reads as an empty
  // database rather than the permission problem it actually is.
  const [clientsError, setClientsError] = useState('');

  // Guest fields
  const [guestName, setGuestName]       = useState('');
  const [guestEmail, setGuestEmail]     = useState('');
  const [guestPhone, setGuestPhone]     = useState('');
  const [guestAddress, setGuestAddress] = useState('');

  // Project — 'existing' mirrors the manual Line Items flow this form
  // already had; 'new' replaces Line Items entirely with a single
  // title/reference/amount, since the project (and its billing) doesn't
  // exist yet.
  const [projectMode, setProjectMode]         = useState<ProjectMode>('new');
  const [projectModuleAvailable, setProjectModuleAvailable] = useState(false);
  const [projects, setProjects]               = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectId, setProjectId]             = useState<number | null>(null);
  const [projectTitle, setProjectTitle]       = useState('');
  const [projectReference, setProjectReference] = useState('');
  const [projectAmount, setProjectAmount]     = useState(0);

  // Payment gateway selection for this invoice
  const [gatewayAccounts, setGatewayAccounts]     = useState<GatewayAccountOption[]>([]);
  const [selectedGatewayIds, setSelectedGatewayIds] = useState<number[]>([]);
  const [canSelectGateway, setCanSelectGateway]   = useState(false);
  const [gatewaysLoaded, setGatewaysLoaded]        = useState(false);

  // Submit
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [linking, setLinking] = useState(false);
  const [createdLink, setCreatedLink] = useState('');

  // Load companies on mount — also resolves isAdmin from cookies (client-only)
  useEffect(() => {
    if (!can('invoice', 'canCreateInvoices')) { router.replace('/invoices'); return; }
    const adminFlag = getAuthType() === 'admin';
    setIsAdmin(adminFlag);
    setAuthResolved(true);
    if (!adminFlag) {
      const user = getAuthUser() as User | null;
      const hasProjects = can('project_management', 'canViewProjects') || can('project_management', 'canViewLinkedProjects');
      setProjectModuleAvailable(hasProjects);
      if (hasProjects && !leadId) setProjectMode('existing');
      if (user?.company) {
        const c: ClientCompany = { id: user.company.id, name: user.company.name, currency: user.company.currency ?? 'USD' };
        setCompanies([c]);
        setCompanyId(c.id);
      }
      // Company Admin's own Settings-configured currency — authoritative,
      // unlike the legacy per-company `currency` above (see
      // Company::invoicingProfile() on the backend).
      if (user?.company?.admin?.currency) setCurrency(user.company.admin.currency);
    } else {
      const admin = getAuthUser() as Admin | null;
      if (admin?.currency) setCurrency(admin.currency);
      const hasProjects = (admin?.modules ?? []).includes('projects') || (admin?.modules ?? []).includes('project_management');
      setProjectModuleAvailable(hasProjects);
      if (hasProjects && !leadId) setProjectMode('existing');
      adminClientService.companies().then(cs => {
        setCompanies(cs);
        if (cs.length) setCompanyId(companyIdParam && cs.some(c => c.id === companyIdParam) ? companyIdParam : cs[0].id);
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load clients when company changes — sub-users see their own company's
  // basic-client list too (userClientService), not just Admins.
  useEffect(() => {
    if (!companyId) { setClients([]); return; }
    setLoadingClients(true);
    setClientId(null);
    setClientsError('');
    const load = isAdmin
      ? adminClientService.list({ company_id: String(companyId) }).then(res => res.clients)
      : userClientService.list();
    load
      .then(list => setClients(list))
      .catch((err: unknown) => {
        setClients([]);
        const status = (err as { response?: { status?: number } }).response?.status;
        setClientsError(status === 403
          ? 'You don’t have permission to view this company’s clients. Ask your Company Admin to grant you "View Clients", or switch to Guest.'
          : 'Could not load clients. Please retry, or switch to Guest.');
      })
      .finally(() => setLoadingClients(false));
  }, [companyId, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load this company's projects for the "Existing Project" picker — the
  // same visibility rule the Projects module already applies (created by
  // this staff member, or a Seller's own assigned/handed-off projects).
  useEffect(() => {
    if (!companyId || !projectModuleAvailable) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadingProjects(true);
      setProjectId(null);
    });
    const load = isAdmin
      ? adminProjectService.list({ company_id: String(companyId) })
      : userProjectService.list();
    load
      .then(list => { if (!cancelled) setProjects(list); })
      .catch(() => { if (!cancelled) setProjects([]); })
      .finally(() => { if (!cancelled) setLoadingProjects(false); });
    return () => { cancelled = true; };
  }, [companyId, isAdmin, projectModuleAvailable]);

  // Pre-fill from a Lead (e.g. arriving via /invoices/new?lead_id=50 from a
  // won lead's detail page) — once. Doesn't wait on (or validate against)
  // the client list: lead.client_id is already company-scoped and
  // permission-checked server-side, so it's trusted directly rather than
  // gated on clients having already loaded — the <select> below reflects
  // the selection correctly as soon as its options populate either way,
  // and gating on the client list here was a source of a real race
  // condition (the client list can still be loading, or briefly empty,
  // when this resolves).
  useEffect(() => {
    if (!authResolved || !leadId || leadPrefilled) return;
    const svc = isAdmin ? adminLeadService : userLeadService;
    svc.getOne(leadId).then(lead => {
      setCompanyId(lead.company_id);

      if (lead.client_id) {
        setCustomerType('client');
        setClientId(lead.client_id);
      } else {
        setCustomerType('guest');
        setGuestName(lead.name);
        if (lead.email) setGuestEmail(lead.email);
        if (lead.phone) setGuestPhone(lead.phone);
      }

      // Carry the Deal's own figures onto the invoice — without this the
      // form starts with an empty PKR 0 line item, so ANY payment (however
      // small) trivially satisfies total_amount and the invoice shows
      // "Paid" even though nothing meaningful was actually collected.
      setDealLead(lead);
      if (lead.proposed_project_title) {
        setInvoicePurpose(lead.required_kickoff_amount ? 'Kickoff Payment' : lead.proposed_project_title);
      }

      // A won lead has no project yet — default to naming one, carrying the
      // deal's own proposed title/reference so they travel with the invoice.
      setProjectMode('new');
      setProjectTitle(lead.name);
      if (lead.deal_reference) setProjectReference(lead.deal_reference);
      const kickoff = lead.required_kickoff_amount ?? lead.estimated_value ?? 0;
      if (kickoff > 0) {
        setItems([{
          description: lead.proposed_project_title
            ? `${lead.proposed_project_title}${lead.scope_summary ? ' — ' + lead.scope_summary : ''}`
            : (lead.scope_summary || 'Kickoff payment'),
          quantity: 1,
          unit_price: kickoff,
        }]);
      }

      setLeadPrefilled(true);
    }).catch(() => setLeadPrefilled(true));
  }, [authResolved, leadId, leadPrefilled, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from a Client (e.g. arriving via /invoices/new?client_id=12 from
  // a client's own detail page) — once, and only after that company's client
  // list has loaded so we can confirm the id actually belongs to it.
  useEffect(() => {
    if (!authResolved || !clientIdParam || leadId || clientPrefilled || loadingClients) return;
    if (clients.some(c => c.id === clientIdParam)) {
      setCustomerType('client');
      setClientId(clientIdParam);
    }
    setClientPrefilled(true);
  }, [authResolved, clientIdParam, leadId, clientPrefilled, loadingClients, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load this tenant's active gateway accounts once auth is resolved —
  // Admin reads the full Settings gateway list (already has everything);
  // a sub-user reads the lightweight read-only endpoint instead, which also
  // reports whether they're allowed to change the selection at all.
  useEffect(() => {
    if (!authResolved) return;
    const load = isAdmin
      ? api.get('/admin/settings').then(r => ({
          accounts: (r.data.data.gateways as GatewayAccountOption[]).filter(g => g.is_active),
          canSelect: true,
        }))
      : api.get('/user/invoices/gateway-accounts').then(r => ({
          accounts: r.data.data.accounts as GatewayAccountOption[],
          canSelect: !!r.data.data.can_select_gateway,
        }));

    load.then(({ accounts, canSelect }) => {
      setGatewayAccounts(accounts);
      setCanSelectGateway(canSelect);
      setSelectedGatewayIds(defaultGatewaySelection(accounts));
      setGatewaysLoaded(true);
    }).catch(() => setGatewaysLoaded(true));
  }, [authResolved, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only one account per gateway TYPE can be selected at once for an invoice
  // (offering two PayPal accounts on the same invoice is ambiguous — which
  // one actually gets charged) — selecting one clears any other selected
  // account of that same type. Different types (e.g. Stripe + PayPal) stay
  // independent and can both be selected.
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
  const noGatewayConfigured = gatewaysLoaded && gatewayAccounts.length === 0;

  const setItem = (i: number, k: keyof LineItem, v: string | number) =>
    setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
  const addItem    = () => setItems(p => [...p, EMPTY_ITEM()]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  // "New Project" normally replaces the manual Line Items list with a single
  // title/amount row — there's no project yet to itemize billing against.
  // Arriving from a won lead is the exception: that lead's own figures are
  // already prefilled into Line Items above, so those stand as the billing
  // detail and only the project's title/reference are named here.
  const showLineItems = projectMode === 'existing' || !!leadId;

  const effectiveItems: LineItem[] = showLineItems
    ? items
    : [{ description: projectTitle.trim() || 'New Project', quantity: 1, unit_price: projectAmount }];

  const subtotal = effectiveItems.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const taxAmt   = (subtotal * taxRate) / 100;
  const total    = Math.max(0, subtotal + taxAmt - discount);

  const fmt = (n: number) => `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [sending, setSending] = useState(false);

  // Shared validation + payload build — reused by Save as Draft, Create &
  // Send, and Create Invoice (link-only). Returns null (having already set
  // the error state) if the form isn't ready to submit.
  const buildPayload = (): InvoicePayload | null => {
    if (!companyId) { setError('Select a company'); return null; }
    if (noGatewayConfigured) { setError('Please activate a payment gateway before creating an invoice.'); return null; }
    if (customerType === 'client' && !clientId) { setError('Select a client, or switch to Guest for an external customer'); return null; }
    if (customerType === 'guest' && !guestName.trim()) { setError('Customer name is required for guest invoices'); return null; }
    if (projectMode === 'existing' && !projectId) { setError('Select an existing project, or switch to New Project'); return null; }
    if (projectMode === 'new' && !projectTitle.trim()) { setError('Project title is required'); return null; }
    if (showLineItems) {
      if (items.some(r => !r.description.trim())) { setError('All items need a description'); return null; }
    } else if (!projectAmount || projectAmount <= 0) {
      setError('Enter the amount for this invoice');
      return null;
    }

    return {
      company_id:      companyId,
      lead_id:         leadId || undefined,
      // Not sent — `currency` here is just a read-only preview of the
      // Company Admin's Settings-configured currency (see the comment where
      // it's set above). Sending a value cached at login/page-load could go
      // stale if currency was changed since; the backend always derives it
      // fresh from Company::invoicingProfile() when omitted (see
      // Api\Admin\InvoiceController::store()/Api\User\InvoiceController::store()).
      tax_rate:        taxRate,
      discount_amount: discount,
      notes:           notes || null,
      due_date:        dueDate || null,
      invoice_purpose: invoicePurpose || undefined,
      items: effectiveItems.map(r => ({ description: r.description, quantity: r.quantity, unit_price: r.unit_price })),
      gateway_account_ids: selectedGatewayIds,
      ...(customerType === 'client'
        ? { client_id: clientId }
        : {
            client_id:        null,
            customer_name:    guestName.trim()    || null,
            customer_email:   guestEmail.trim()   || null,
            customer_phone:   guestPhone.trim()   || null,
            customer_address: guestAddress.trim() || null,
          }
      ),
      ...(projectMode === 'existing'
        ? { project_id: projectId }
        : { project_id: null, project_title: projectTitle.trim(), project_reference: projectReference.trim() || null }
      ),
    };
  };

  const handleCreate = async (sendAfter: boolean) => {
    if (saving || sending || linking) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    const recipientEmail = customerType === 'client'
      ? clients.find(c => c.id === clientId)?.email
      : guestEmail.trim();

    setError('');
    setCreatedLink('');
    const payload = buildPayload();
    if (!payload) return;

    if (sendAfter && !recipientEmail) {
      setError('Customer email is required to send invoice.');
      return;
    }

    sendAfter ? setSending(true) : setSaving(true);
    try {
      const inv = isAdmin
        ? await adminInvoiceService.create(payload)
        : await api.post('/user/invoices', payload).then(r => r.data.data);

      if (sendAfter && recipientEmail) {
        try {
          if (isAdmin) {
            await adminInvoiceService.sendEmail(inv.id, recipientEmail);
          } else {
            await api.post(`/user/invoices/${inv.id}/send-email`, { email: recipientEmail });
          }
          toast.success('Invoice created and sent');
        } catch (sendErr: unknown) {
          const ex = sendErr as { response?: { data?: { message?: string } } };
          toast.error(ex.response?.data?.message ?? 'Invoice created, but email could not be sent. Please try sending again.');
        }
      } else {
        toast.success('Invoice created');
      }

      router.push(`/invoices/${inv.id}`);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = ex.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(ex.response?.data?.message ?? 'Failed to create invoice');
    } finally { setSaving(false); setSending(false); }
  };

  // Create Invoice — creates it, then immediately generates its shareable
  // public payment link. Deliberately does NOT send an email (no recipient
  // email required, unlike Create & Send) — generateLink already marks the
  // invoice as sent on its own, matching existing invoice-module behavior.
  const handleCreateAndLink = async () => {
    if (saving || sending || linking) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    setError('');
    setCreatedLink('');
    const payload = buildPayload();
    if (!payload) return;

    setLinking(true);
    try {
      const inv = isAdmin
        ? await adminInvoiceService.create(payload)
        : await api.post('/user/invoices', payload).then(r => r.data.data);

      const linkRes = isAdmin
        ? await adminInvoiceService.generatePaymentLink(inv.id)
        : await api.post(`/user/invoices/${inv.id}/generate-link`, {}).then(r => r.data.data);

      try {
        await navigator.clipboard.writeText(linkRes.payment_url);
        toast.success('Invoice created — payment link copied to clipboard');
      } catch {
        setCreatedLink(linkRes.payment_url);
        toast.success('Invoice created');
      }

      router.push(`/invoices/${inv.id}`);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = ex.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(ex.response?.data?.message ?? 'Failed to create invoice or generate its payment link');
    } finally { setLinking(false); }
  };

  const typeBtn = (type: CustomerType, icon: React.ReactNode, label: string, sub: string): React.ReactNode => {
    const active = customerType === type;
    return (
      <button
        type="button"
        onClick={() => setCustomerType(type)}
        style={{
          flex: 1, padding: '12px 16px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
          border: `2px solid ${active ? '#2563eb' : '#e2e8f0'}`,
          background: active ? '#eff6ff' : '#fafafa',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <span style={{ color: active ? '#2563eb' : '#94a3b8' }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#1d4ed8' : '#374151' }}>{label}</span>
          {active && <span style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 900, flexShrink: 0 }}>✓</span>}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', paddingLeft: 25 }}>{sub}</div>
      </button>
    );
  };

  const projectModeBtn = (mode: ProjectMode, icon: React.ReactNode, label: string, sub: string): React.ReactNode => {
    const active = projectMode === mode;
    return (
      <button
        type="button"
        onClick={() => setProjectMode(mode)}
        style={{
          flex: 1, padding: '12px 16px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
          border: `2px solid ${active ? '#2563eb' : '#e2e8f0'}`,
          background: active ? '#eff6ff' : '#fafafa',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <span style={{ color: active ? '#2563eb' : '#94a3b8' }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#1d4ed8' : '#374151' }}>{label}</span>
          {active && <span style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 900, flexShrink: 0 }}>✓</span>}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', paddingLeft: 25 }}>{sub}</div>
      </button>
    );
  };

  return (
    <DashboardLayout title="New Invoice">
      <LoadingOverlay
        show={saving || sending || linking}
        message={sending ? 'Creating & Sending Invoice…' : 'Creating Invoice…'}
      />
      <div>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back
        </button>

        <form onSubmit={e => { e.preventDefault(); handleCreate(false); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18, alignItems: 'start' }}>
            {/* Left column */}
            <div>
              {/* Invoice Details card */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Invoice Details</h3>
                </div>
                <div style={{ padding: 22 }}>
                  {error && (
                    <div style={{ marginBottom: 14, padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>
                      {error}
                    </div>
                  )}

                  {/* Deal banner — this invoice is being created FOR a
                      specific Won lead/Deal; shows exactly what it's for and
                      the kickoff figure the line item below was prefilled
                      from, so the seller can see/adjust it before sending. */}
                  {dealLead && (
                    <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                      <div style={{ fontSize: 13, color: '#1e3a5f', fontWeight: 600 }}>
                        For Deal: {dealLead.proposed_project_title || dealLead.name}
                        {dealLead.deal_reference && <span style={{ color: '#3b82f6', fontWeight: 500 }}> — {dealLead.deal_reference}</span>}
                      </div>
                      {(dealLead.required_kickoff_amount || dealLead.estimated_value) ? (
                        <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 3 }}>
                          Required kickoff amount: {(dealLead.required_kickoff_amount ?? dealLead.estimated_value)?.toLocaleString()} — pre-filled as the line item below, adjust if this invoice is for a different amount.
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 3 }}>
                          No kickoff amount is set on this Deal — enter the correct amount in the line item below before sending.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Company */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Company *</label>
                    <select style={inp} value={companyId} onChange={e => setCompanyId(Number(e.target.value))}>
                      <option value={0}>Select company…</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Currency / Due Date / Notes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 0 }}>
                    <div>
                      <label style={lbl}>Currency</label>
                      {/* Locked to whatever Company Admin configured in
                          Settings (see Company::invoicingProfile() on the
                          backend) — never picked per-invoice. */}
                      <input style={{ ...inp, background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }} value={currency} disabled readOnly />
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

                  {/* Invoice Purpose — what this invoice is FOR, shown
                      prominently to the client (spec §5), even before any
                      Project exists. */}
                  <div style={{ marginTop: 14 }}>
                    <label style={lbl}>Invoice Purpose</label>
                    <input style={inp} value={invoicePurpose} onChange={e => setInvoicePurpose(e.target.value)} placeholder="e.g. 50% Advance Payment" />
                  </div>
                </div>
              </div>

              {/* Customer card */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Customer</h3>
                </div>
                <div style={{ padding: 22 }}>

                  {/* Type toggle — shown whenever a client list is available (Admin's
                      full Client list, or a sub-user's Basic Clients access) */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                    {typeBtn('client', <HiUsers size={15} />, 'Existing Client', 'Select from your client list')}
                    {typeBtn('guest',  <HiUserCircle size={15} />, 'Guest / External', 'Enter customer details manually')}
                  </div>

                  {/* Existing Client dropdown */}
                  {customerType === 'client' && (
                    <div>
                      <label style={lbl}>Select Client *</label>
                      {loadingClients ? (
                        <div style={{ padding: '10px 0', fontSize: 13, color: '#94a3b8' }}>Loading clients…</div>
                      ) : clientsError ? (
                        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>
                          {clientsError} <button type="button" onClick={() => setCustomerType('guest')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, fontSize: 13, padding: 0 }}>Switch to Guest</button>
                        </div>
                      ) : clients.length === 0 ? (
                        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>
                          No clients found for this company. <button type="button" onClick={() => setCustomerType('guest')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, fontSize: 13, padding: 0 }}>Switch to Guest</button>
                        </div>
                      ) : (
                        <select
                          style={inp}
                          value={clientId ?? ''}
                          onChange={e => setClientId(Number(e.target.value) || null)}
                        >
                          <option value="">Select a client…</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.company_name ? ` (${c.company_name})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      {clientId && (() => {
                        const sel = clients.find(c => c.id === clientId);
                        if (!sel) return null;
                        return (
                          <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                            <div style={{ fontWeight: 700 }}>{sel.name}</div>
                            {sel.email && <div style={{ marginTop: 2, color: '#16a34a' }}>{sel.email}</div>}
                            {sel.company_name && <div style={{ marginTop: 2 }}>{sel.company_name}</div>}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Guest / External Customer fields */}
                  {customerType === 'guest' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={lbl}>Customer Name *</label>
                          <input style={inp} value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="John Smith" />
                        </div>
                        <div>
                          <label style={lbl}>Email</label>
                          <input type="email" style={inp} value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="john@example.com" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={lbl}>Phone <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                          <input style={inp} value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="+1 234 567 8900" />
                        </div>
                        <div>
                          <label style={lbl}>Billing Address <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                          <input style={inp} value={guestAddress} onChange={e => setGuestAddress(e.target.value)} placeholder="123 Main St, City" />
                        </div>
                      </div>
                      {guestEmail && (
                        <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 7, padding: '8px 12px' }}>
                          💡 The public payment link will be pre-filled with these details
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Project card */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Project</h3>
                </div>
                <div style={{ padding: 22 }}>

                  {/* Mode toggle */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                    {projectModuleAvailable && projectModeBtn('existing', <HiFolder size={15} />, 'Existing Project', 'Bill against a project already created or assigned to you')}
                    {projectModeBtn('new',      <HiFolderPlus size={15} />, 'New Project', 'Name the project and set an amount for this invoice')}
                  </div>

                  {/* Existing Project picker */}
                  {projectModuleAvailable && projectMode === 'existing' && (
                    <div>
                      <label style={lbl}>Select Project *</label>
                      {loadingProjects ? (
                        <div style={{ padding: '10px 0', fontSize: 13, color: '#94a3b8' }}>Loading projects…</div>
                      ) : projects.length === 0 ? (
                        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>
                          No projects found. <button type="button" onClick={() => setProjectMode('new')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, fontSize: 13, padding: 0 }}>Switch to New Project</button>
                        </div>
                      ) : (
                        <select
                          style={inp}
                          value={projectId ?? ''}
                          onChange={e => setProjectId(Number(e.target.value) || null)}
                        >
                          <option value="">Select a project…</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      {projectId && (() => {
                        const sel = projects.find(p => p.id === projectId);
                        if (!sel) return null;
                        return (
                          <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#166534' }}>
                            <div style={{ fontWeight: 700 }}>{sel.name}</div>
                            {sel.client?.name && <div style={{ marginTop: 2 }}>{sel.client.name}</div>}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* New Project fields */}
                  {projectMode === 'new' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={lbl}>Project Title *</label>
                          <input style={inp} value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="e.g. Website Redesign" />
                        </div>
                        <div>
                          <label style={lbl}>Reference <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                          <input style={inp} value={projectReference} onChange={e => setProjectReference(e.target.value)} placeholder="e.g. PRJ-1042" />
                        </div>
                      </div>
                      {!showLineItems && (
                        <div>
                          <label style={lbl}>Amount for the Invoice *</label>
                          <input type="number" min={0} step="0.01" style={inp} value={projectAmount} onChange={e => setProjectAmount(parseFloat(e.target.value) || 0)} placeholder="0.00" />
                        </div>
                      )}
                      {showLineItems && (
                        <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', borderRadius: 7, padding: '8px 12px' }}>
                          💡 This invoice&apos;s amount comes from the Line Items below, pre-filled from the deal — adjust them if needed.
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 12px' }}>
                        💳 The project is created right away with status <strong>Unpaid</strong>. It switches to <strong>Draft</strong> — ready to activate — once the client pays.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Line items card */}
              {showLineItems && (
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
              )}

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
                        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: (canSelectGateway && gatewayAccounts.length > 1) ? 'pointer' : 'default' }}>
                          <input
                            type="checkbox"
                            checked={selectedGatewayIds.includes(g.id)}
                            onChange={() => toggleGatewaySelection(g.id)}
                            disabled={!canSelectGateway || gatewayAccounts.length === 1}
                            style={{ width: 16, height: 16, accentColor: '#2563eb' }}
                          />
                          <span style={{ fontSize: 13, color: '#0f172a' }}>{g.label}</span>
                          {g.is_default && <span style={{ padding: '2px 8px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontSize: 10.5, fontWeight: 700 }}>DEFAULT</span>}
                        </label>
                      ))}
                      {!canSelectGateway && (
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          You don&apos;t have permission to change the payment gateway for this invoice — the company default will be used.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right column – totals + submit */}
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
                      { label: 'Subtotal',       value: fmt(subtotal) },
                      { label: `Tax (${taxRate}%)`, value: fmt(taxAmt) },
                      { label: 'Discount',        value: `– ${fmt(discount)}` },
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

              {createdLink && (
                <div style={{ marginBottom: 10, padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment Link</div>
                  <div style={{ fontSize: 12, color: '#0c4a6e', wordBreak: 'break-all' }}>{createdLink}</div>
                </div>
              )}

              <SubmitButton
                type="submit"
                loading={saving}
                loadingText="Creating Invoice…"
                disabled={sending || linking || noGatewayConfigured}
                title={noGatewayConfigured ? 'Configure a payment gateway before creating invoice' : undefined}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 10, opacity: noGatewayConfigured ? 0.5 : 1 }}
              >
                Save as Draft
              </SubmitButton>
              <SubmitButton
                type="button"
                onClick={handleCreateAndLink}
                loading={linking}
                loadingText="Creating Invoice…"
                disabled={saving || sending || noGatewayConfigured}
                title={noGatewayConfigured ? 'Configure a payment gateway before sending invoice' : undefined}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: '1.5px solid #0284c7', background: linking ? '#f0f9ff' : '#fff', color: '#0284c7', fontSize: 15, fontWeight: 700, marginBottom: 10, opacity: noGatewayConfigured ? 0.5 : 1 }}
              >
                Create Invoice
              </SubmitButton>
              <SubmitButton
                type="button"
                onClick={() => handleCreate(true)}
                loading={sending}
                loadingText="Creating & Sending…"
                disabled={saving || linking || noGatewayConfigured}
                title={noGatewayConfigured ? 'Configure a payment gateway before sending invoice' : undefined}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: '1.5px solid #2563eb', background: sending ? '#eff6ff' : '#fff', color: '#2563eb', fontSize: 15, fontWeight: 700, opacity: noGatewayConfigured ? 0.5 : 1 }}
              >
                Create & Send Invoice
              </SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={
      <DashboardLayout title="New Invoice">
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      </DashboardLayout>
    }>
      <NewInvoiceForm />
    </Suspense>
  );
}
