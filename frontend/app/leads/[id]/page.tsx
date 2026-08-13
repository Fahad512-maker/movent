'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminLeadService, userLeadService, Lead, FollowUp, LeadActivity, CompanyUser, DealEligibility } from '@/lib/services/adminLeadService';
import { adminSalesChatService, userSalesChatService } from '@/lib/services/salesChatService';
import { ChatMessage } from '@/lib/services/adminProjectService';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize } from '@/components/admin/projects/shared';
import { getAuthType, getAuthUser, can, getUserModulePermissions } from '@/lib/auth';
import { Admin } from '@/types';
import toast from 'react-hot-toast';
import {
  HiArrowLeft, HiPencilSquare, HiTrash, HiArrowPath,
  HiPlus, HiCheckCircle, HiXCircle, HiClock, HiCalendarDays,
  HiPhone, HiEnvelope, HiUserGroup, HiChatBubbleLeft,
  HiArrowsRightLeft, HiFolderPlus, HiBanknotes,
} from 'react-icons/hi2';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#eff6ff', color: '#2563eb' },
  contacted:   { bg: '#f0fdf4', color: '#16a34a' },
  qualified:   { bg: '#f5f3ff', color: '#7c3aed' },
  proposal:    { bg: '#fff7ed', color: '#ea580c' },
  negotiation: { bg: '#fffbeb', color: '#d97706' },
  won:         { bg: '#ecfdf5', color: '#059669' },
  lost:        { bg: '#fef2f2', color: '#dc2626' },
};

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  low:    { bg: '#f1f5f9', color: '#64748b' },
  medium: { bg: '#fff7ed', color: '#d97706' },
  high:   { bg: '#fef2f2', color: '#dc2626' },
  urgent: { bg: '#7f1d1d', color: '#fca5a5' },
};

const FU_ICON: Record<string, React.ReactNode> = {
  call:     <HiPhone size={13} />,
  email:    <HiEnvelope size={13} />,
  meeting:  <HiUserGroup size={13} />,
  whatsapp: <HiChatBubbleLeft size={13} />,
  demo:     <HiUserGroup size={13} />,
  other:    <HiClock size={13} />,
};

const PIPELINE_STEPS = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'];
const cap    = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
const PKR    = (n: number) => n > 0 ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDT   = (d: string) => new Date(d).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };

const ACTIVITY_COLOR: Record<string, string> = {
  created: '#2563eb', updated: '#64748b', status_changed: '#7c3aed',
  assigned: '#0891b2', note_added: '#d97706', followup_added: '#059669',
  followup_completed: '#10b981', converted: '#059669', won: '#059669', lost: '#dc2626', reopened: '#d97706',
};

const mergeLeadDetail = (current: Lead | null, updated: Lead): Lead => {
  if (!current) return updated;
  return {
    ...current,
    ...updated,
    follow_ups: updated.follow_ups ?? current.follow_ups,
    activities: updated.activities ?? current.activities,
  };
};

const errorMessage = (err: unknown, fallback: string) => {
  const response = (err as { response?: { data?: { message?: unknown } } })?.response;
  return typeof response?.data?.message === 'string' ? response.data.message : fallback;
};

const invoiceStatusLabel = (invoiceStatus?: string | null, fulfillmentStatus?: string | null) => {
  if (fulfillmentStatus === 'awaiting_payment') return 'Awaiting Payment';
  if (fulfillmentStatus === 'partially_paid') return 'Partially Paid';
  if (invoiceStatus === 'draft') return 'Pending Invoice';
  if (invoiceStatus === 'sent') return 'Awaiting Payment';
  if (invoiceStatus === 'overdue') return 'Invoice Overdue';
  if (invoiceStatus === 'paid') return 'Invoice Paid';
  return 'Invoice Pending';
};

export default function LeadDetailPage() {
  const router  = useRouter();
  const params  = useParams<{ id: string }>();
  const leadId  = Number(params.id);
  const authType = getAuthType();
  const isAdmin  = authType === 'admin';
  const authUser = getAuthUser() as { role_type?: string } | Admin | null;

  // Module / permission gates
  const admin          = isAdmin ? (authUser as Admin | null) : null;
  const hasProjectMod  = isAdmin ? (admin?.modules?.includes('projects') ?? false) : getUserModulePermissions('project_management').length > 0;
  const canEditLead    = isAdmin || can('sales', 'canEditLeads');
  const canDeleteLead  = isAdmin || can('sales', 'canDeleteLeads');
  const canManagePipe  = isAdmin || can('sales', 'canManagePipeline');
  const canConvertLead = isAdmin || (can('sales', 'canManagePipeline') && can('sales', 'canCreateClients'));
  const canCreateProject = isAdmin
    || can('project_management', 'canCreateProjects')
    || can('project_management', 'canCreateProjectHandoff');
  const hasInvoiceMod    = isAdmin ? (admin?.modules?.includes('invoices') ?? false) : getUserModulePermissions('invoice').length > 0;
  const canCreateInvoice = isAdmin || can('invoice', 'canCreateInvoices');
  // Company Admin always sees Sales Chat, same as every other chat surface.
  const canUseSalesChat = isAdmin || ((!authUser || 'role_type' in authUser) && authUser?.role_type === 'seller' && can('sales', 'canUseSalesChat'));

  const svc = isAdmin ? adminLeadService : userLeadService;
  const chatSvc = isAdmin ? adminSalesChatService : userSalesChatService;

  const [lead, setLead]               = useState<Lead | null>(null);
  // "Assign Lead Owner" only covers giving an unowned lead its first owner —
  // reassigning a lead that already has an owner needs "Transfer Leads"
  // specifically, matching the backend's split in Api\User\LeadController::transfer().
  const canTransferLead = lead?.status !== 'won' && (isAdmin || can('sales', 'canTransferLeads')
    || (!lead?.assigned_to && can('sales', 'canAssignLeadOwner')));
  const [loading, setLoading]         = useState(true);
  const [converting, setConverting]   = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [error, setError]             = useState('');
  const [tab, setTab]                 = useState<'details' | 'followups' | 'activity' | 'chat'>('details');

  // Sales Chat
  const [chat, setChat]         = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [sendingChat, setSendingChat] = useState(false);

  // Transfer Lead modal
  const [transferModal, setTransferModal]       = useState(false);
  const [companyUsers, setCompanyUsers]         = useState<CompanyUser[]>([]);
  const [transferToUserId, setTransferToUserId] = useState('');
  const [transferReason, setTransferReason]     = useState('');
  const [transferring, setTransferring]         = useState(false);
  const [transferError, setTransferError]       = useState('');


  // Deal financial/eligibility summary — App\Services\DealEligibilityService
  const [dealEligibility, setDealEligibility] = useState<DealEligibility | null>(null);

  // Follow-up modal
  const [fuModal, setFuModal]   = useState(false);
  const [fuType, setFuType]     = useState('call');
  const [fuDate, setFuDate]     = useState('');
  const [fuTime, setFuTime]     = useState('');
  const [fuNotes, setFuNotes]   = useState('');
  const [fuSaving, setFuSaving] = useState(false);
  const [fuError, setFuError]   = useState('');

  const load = () => {
    svc.getOne(leadId)
      .then(setLead)
      .catch(() => setError('Lead not found'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isAdmin && !can('sales', 'canViewLeads')) { router.replace('/dashboard'); return; }
    load();
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEligibility = () => {
    if (!lead || lead.status !== 'won') { setDealEligibility(null); return; }
    svc.projectEligibility(lead.id).then(setDealEligibility).catch(() => {});
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEligibility();
  }, [lead?.id, lead?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadChat = () => {
    if (!canUseSalesChat) return;
    chatSvc.leadMessages(leadId).then(setChat).catch(() => {});
  };

  useEffect(() => {
    loadChat();
    if (!canUseSalesChat) return;
    const interval = setInterval(loadChat, 8000);
    return () => clearInterval(interval);
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() && !chatFile) return;
    if (chatFile) {
      const ext = chatFile.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${chatFile.name}: file type not allowed`); return; }
      if (chatFile.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${chatFile.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); return; }
    }
    setSendingChat(true);
    try {
      await chatSvc.sendLeadMessage(leadId, chatText.trim(), chatFile);
      setChatText('');
      setChatFile(null);
      loadChat();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to send message'));
    } finally { setSendingChat(false); }
  };

  const downloadChatAttachment = async (m: ChatMessage) => {
    if (!m.attachment_name) return;
    try { await chatSvc.downloadLeadAttachment(leadId, m.id, m.attachment_name); }
    catch { toast.error('Download failed'); }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!lead || !canManagePipe) return;
    try {
      // Marking Won still creates a Deal server-side (deal_reference,
      // won_at, fulfillment_status) — proposed_project_title just defaults
      // to "{name} — Project" when not supplied, no confirmation modal
      // needed up front. Flow is Won -> Create Invoice -> paid/eligible ->
      // Convert to Client / project handoff.
      const updated = await svc.updateStatus(lead.id, newStatus);
      setLead(current => mergeLeadDetail(current, updated));
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setError(ex.response?.data?.message ?? 'Failed to update status');
    }
  };

  const handleConvert = async () => {
    if (!lead || lead.client_id || !canConvertLead) return;
    if (!confirm('Convert this lead to a client?')) return;
    setConverting(true); setError('');
    try {
      const { client_id } = await svc.convert(lead.id);
      // Update local state before navigating away — if the navigation is
      // ever interrupted (back button, a cached page load), the button here
      // must already reflect the conversion instead of still offering
      // "Convert to Client" on an already-converted lead.
      setLead(l => l ? { ...l, client_id } : l);
      // Admin and Seller share this page (app/admin/leads/[id]/page.tsx
      // re-exports it), so the destination must follow the caller's own
      // guard — an Admin sent to a Seller-guard route gets 401'd out to the
      // login screen.
      router.push(isAdmin ? `/admin/clients/${client_id}` : `/clients/${client_id}`);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setError(ex.response?.data?.message ?? 'Conversion failed');
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    if (!lead || !canDeleteLead) return;
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await svc.update(lead.id, {}); // placeholder — only admin has delete
      if (isAdmin) await adminLeadService.remove(lead.id);
      router.push(isAdmin ? '/admin/leads' : '/leads');
    } catch { setError('Failed to delete lead'); setDeleting(false); }
  };

  const handleAddFollowUp = async () => {
    if (!lead || !fuDate) { setFuError('Date is required'); return; }
    setFuSaving(true); setFuError('');
    const scheduledAt = fuTime ? `${fuDate} ${fuTime}` : `${fuDate} 09:00`;
    try {
      await svc.addFollowUp(lead.id, { type: fuType, scheduled_at: scheduledAt, notes: fuNotes || null });
      setFuModal(false); setFuDate(''); setFuTime(''); setFuNotes(''); setFuType('call');
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setFuError(ex.response?.data?.message ?? 'Failed to add follow-up');
    } finally { setFuSaving(false); }
  };

  const handleFuAction = async (fuId: number, action: 'complete' | 'miss' | 'cancel') => {
    try {
      const fuSvc = isAdmin ? adminLeadService : userLeadService;
      if (action === 'complete') await fuSvc.completeFollowUp(fuId);
      else if (action === 'miss') await fuSvc.missFollowUp(fuId);
      else await fuSvc.cancelFollowUp(fuId);
      load();
    } catch { setError(`Failed to ${action} follow-up`); }
  };

  const openTransferModal = () => {
    setTransferModal(true);
    setTransferError('');
    if (companyUsers.length > 0 || !lead) return;
    const req = isAdmin ? adminLeadService.companyUsers(lead.company_id) : userLeadService.companyUsers();
    req.then(setCompanyUsers).catch(() => setTransferError('Failed to load users'));
  };

  const handleTransfer = async () => {
    if (!lead || !transferToUserId) { setTransferError('Select a user to transfer to'); return; }
    setTransferring(true); setTransferError('');
    try {
      const updated = await svc.transfer(lead.id, Number(transferToUserId), transferReason.trim() || undefined);
      setLead(current => mergeLeadDetail(current, updated));
      toast.success('Lead transferred');
      setTransferModal(false);
      setTransferToUserId(''); setTransferReason('');
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setTransferError(ex.response?.data?.message ?? 'Failed to transfer lead');
    } finally { setTransferring(false); }
  };

  // Sales → Project handoff: hand the won lead off to Project Management as
  // a new project (pre-filled, linked back via lead_id).
  const handleCreateProjectHandoff = () => {
    if (!lead) return;
    router.push(isAdmin ? `/admin/projects/create?lead_id=${lead.id}` : `/projects?lead_id=${lead.id}`);
  };

  // Sales → Invoice handoff: send a won lead straight to the invoice-create
  // form, pre-filled via the existing ?lead_id= support already built into it.
  const handleCreateInvoice = () => {
    if (!lead) return;
    router.push(isAdmin ? `/admin/invoices/new?lead_id=${lead.id}` : `/invoices/new?lead_id=${lead.id}`);
  };

  if (loading) return <DashboardLayout title="Lead"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!lead || error) return <DashboardLayout title="Lead"><div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>{error || 'Lead not found'}</div></DashboardLayout>;

  const ss          = STATUS_STYLE[lead.status] ?? { bg: '#f1f5f9', color: '#64748b' };
  const ps          = PRIORITY_STYLE[lead.priority] ?? { bg: '#f1f5f9', color: '#64748b' };
  const pipelineIdx = PIPELINE_STEPS.indexOf(lead.status);
  const followUps   = lead.follow_ups ?? [];
  const activities  = lead.activities ?? [];
  const pendingFUs  = followUps.filter(f => f.status === 'pending');
  const leadsRoot   = isAdmin ? '/admin/leads' : '/leads';
  const isWonDeal = lead.status === 'won';
  const hasProject = !!dealEligibility?.has_project;
  const projectCreationEligible = !!dealEligibility?.project_creation_eligible;
  const latestInvoice = dealEligibility?.latest_invoice ?? null;
  const hasLeadInvoice = (dealEligibility?.invoice_count ?? 0) > 0;
  const awaitingProjectPayment = !hasProject && !projectCreationEligible;
  const canShowCreateInvoice = hasInvoiceMod && canCreateInvoice && isWonDeal && !!dealEligibility && !hasLeadInvoice && awaitingProjectPayment;
  const canShowInvoiceStatus = isWonDeal && !!latestInvoice && awaitingProjectPayment;
  const canShowConvert = isWonDeal && !lead.client_id && projectCreationEligible && (isAdmin || canConvertLead);

  return (
    <DashboardLayout title={lead.name}>
      <div style={{ maxWidth: 900 }}>
        <button onClick={() => router.push(leadsRoot)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to Leads
        </button>

        {error && <div style={{ marginBottom: 14, padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{error}</div>}

        {/* Header card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '22px 28px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{lead.name}</h1>
                <span style={{ padding: '3px 12px', borderRadius: 50, fontSize: 12, fontWeight: 700, ...ss }}>{cap(lead.status)}</span>
                <span style={{ padding: '3px 12px', borderRadius: 50, fontSize: 11, fontWeight: 600, ...ps }}>{cap(lead.priority)} Priority</span>
                {pendingFUs.length > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, background: '#ecfdf5', color: '#059669' }}>
                    <HiCalendarDays size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    {pendingFUs.length} follow-up{pendingFUs.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {lead.company_name && <div style={{ fontSize: 14, color: '#64748b', marginBottom: 3 }}>{lead.company_name}</div>}
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Added {fmtDate(lead.created_at)}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/* Convert to Client — only after the Deal has cleared its
                  payment requirement. Before payment, the seller should raise
                  the invoice first. A basic Client record, same for everyone.
                  Api\Admin\LeadController::convert() has never required the
                  Client module (it just creates a plain Client row, same as
                  the sub-user path's Sales-bundled canManagePipeline +
                  canCreateClients access) — Admin gets it unconditionally,
                  same as Admin's unrestricted access everywhere else. */}
              {canShowConvert && (
                <button onClick={handleConvert} disabled={converting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: converting ? '#a7f3d0' : 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: converting ? 'not-allowed' : 'pointer' }}>
                  <HiArrowPath size={15} /> {converting ? 'Converting…' : 'Convert to Client'}
                </button>
              )}
              {lead.client_id && (
                <Link href={`/clients/${lead.client_id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, background: '#ecfdf5', color: '#059669', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  View Client →
                </Link>
              )}
              {/* Project handoff — only when Project Management is active,
                  user has permission, lead is won, AND the Deal has cleared
                  its kickoff-payment requirement (core rule: Won alone never
                  makes a project eligible). */}
              {hasProjectMod && canCreateProject && isWonDeal && (
                dealEligibility?.has_project ? (
                  <button onClick={() => dealEligibility.project_id && router.push(isAdmin ? `/admin/projects/${dealEligibility.project_id}` : `/projects/${dealEligibility.project_id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <HiFolderPlus size={15} /> View Project {dealEligibility.project_reference}
                  </button>
                ) : dealEligibility?.project_creation_eligible ? (
                  <button onClick={handleCreateProjectHandoff}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <HiFolderPlus size={15} /> Create Project
                  </button>
                ) : null
              )}
              {/* Invoice handoff — first action after Won. The invoice form
                  supports lead-only/guest invoices, so conversion to Client is
                  intentionally not required here. Once the Deal is paid enough
                  to become project-eligible, this hides and Convert/Project
                  actions take over. */}
              {canShowCreateInvoice && (
                <button onClick={handleCreateInvoice}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiBanknotes size={15} /> Create Invoice
                </button>
              )}
              {canShowInvoiceStatus && latestInvoice && (
                <Link href={isAdmin ? `/admin/invoices/${latestInvoice.id}` : `/invoices/${latestInvoice.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#c2410c', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  <HiClock size={15} /> {invoiceStatusLabel(latestInvoice.status, dealEligibility?.fulfillment_status)}
                </Link>
              )}
              {canTransferLead && (
                <button onClick={openTransferModal}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiArrowsRightLeft size={15} /> Transfer
                </button>
              )}
              {canEditLead && (
                <button onClick={() => router.push(`${leadsRoot}/${lead.id}/edit`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiPencilSquare size={15} /> Edit
                </button>
              )}
              {canDeleteLead && isAdmin && (
                <button onClick={handleDelete} disabled={deleting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer' }}>
                  <HiTrash size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Pipeline bar */}
          {lead.status !== 'lost' && canManagePipe && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex' }}>
                {PIPELINE_STEPS.map((step, idx) => {
                  const isActive = step === lead.status;
                  const isPast   = pipelineIdx >= 0 && idx < pipelineIdx;
                  const isWon    = step === 'won' && lead.status === 'won';
                  // Once Won, every earlier stage is locked — a deal can't be
                  // walked back to New/Contacted/Qualified/Proposal/
                  // Negotiation from here (mirrors the existing Lost lock,
                  // which hides the whole bar). "Mark as Lost" below stays
                  // available for a Won deal that later falls through.
                  const locked   = lead.status === 'won' && step !== 'won';
                  const bg       = isWon ? '#059669' : isActive ? '#2563eb' : isPast ? '#93c5fd' : '#e2e8f0';
                  const col      = (isActive || isPast || isWon) ? '#fff' : '#94a3b8';
                  return (
                    <button key={step} onClick={() => !locked && handleStatusChange(step)} disabled={locked}
                      style={{ flex: 1, padding: '7px 0', background: bg, color: col, border: 'none', borderRadius: idx === 0 ? '8px 0 0 8px' : idx === PIPELINE_STEPS.length - 1 ? '0 8px 8px 0' : 0, fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.6 : 1 }}>
                      {cap(step)}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => handleStatusChange('lost')} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark as Lost ✕</button>
              </div>
            </div>
          )}
          {lead.status === 'lost' && (
            <div style={{ marginTop: 14, padding: '10px 16px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>This lead was marked as lost.{lead.lost_reason ? ` Reason: ${lead.lost_reason}` : ''}</span>
              {canManagePipe && (
                <button onClick={() => handleStatusChange('new')} style={{ background: 'none', border: '1.5px solid #fecaca', borderRadius: 7, padding: '5px 12px', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Reopen</button>
              )}
            </div>
          )}
        </div>

        {/* Deal panel — proposed project, kickoff payment progress, project
            eligibility. Only shown once the lead is Won (i.e. is a Deal). */}
        {lead.status === 'won' && dealEligibility && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '18px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  Deal {dealEligibility.deal_reference}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{dealEligibility.proposed_project_title}</div>
              </div>
              <span style={{
                padding: '4px 12px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                background: dealEligibility.has_project ? '#ecfdf5' : dealEligibility.project_creation_eligible ? '#eff6ff' : '#fff7ed',
                color: dealEligibility.has_project ? '#059669' : dealEligibility.project_creation_eligible ? '#2563eb' : '#d97706',
              }}>
                {cap((dealEligibility.fulfillment_status ?? '').replace(/_/g, ' '))}
              </span>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Required Kickoff</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{dealEligibility.required_kickoff_amount.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Received</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>
                  {dealEligibility.net_paid_amount.toLocaleString()} of {dealEligibility.required_kickoff_amount.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Remaining</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: dealEligibility.remaining_amount > 0 ? '#ea580c' : '#059669' }}>
                  {dealEligibility.remaining_amount.toLocaleString()}
                </div>
              </div>
            </div>
            {dealEligibility.project_creation_eligible && !dealEligibility.has_project && (
              <div style={{ marginTop: 12, padding: '9px 14px', background: '#ecfdf5', borderRadius: 8, color: '#059669', fontSize: 12.5, fontWeight: 600 }}>
                ✓ Required payment received. This Deal is now eligible for project creation.
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
          {(['details', 'followups', 'activity'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#0f172a' : '#64748b', fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {t === 'details' ? 'Details' : t === 'followups' ? `Follow-ups${followUps.length ? ` (${followUps.length})` : ''}` : t === 'activity' ? `Activity${activities.length ? ` (${activities.length})` : ''}` : 'Sales Chat'}
            </button>
          ))}
        </div>

        {/* Tab: Details */}
        {tab === 'details' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Contact Details</h3>
              {[
                { label: 'Name',    value: lead.name },
                { label: 'Email',   value: lead.email },
                { label: 'Phone',   value: lead.phone },
                { label: 'Company', value: lead.company_name },
                { label: 'Source',  value: lead.source ? cap(lead.source.replace('_', ' ')) : null },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', gap: 12, marginBottom: 12, borderBottom: '1px solid #f8fafc', paddingBottom: 10 }}>
                  <div style={{ width: 90, flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 13, color: value ? '#0f172a' : '#cbd5e1' }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Lead Info</h3>
              {[
                { label: 'Est. Value',     value: PKR(lead.estimated_value) },
                { label: 'Assigned To',    value: lead.assigned_user?.name },
                { label: 'Next Follow-up', value: lead.next_followup_date ? `${fmtDate(lead.next_followup_date)}${lead.next_followup_time ? ` at ${lead.next_followup_time}` : ''}` : null },
                { label: 'Converted',      value: lead.converted_at ? fmtDate(lead.converted_at) : null },
                { label: 'Created',        value: fmtDate(lead.created_at) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', gap: 12, marginBottom: 12, borderBottom: '1px solid #f8fafc', paddingBottom: 10 }}>
                  <div style={{ width: 100, flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontSize: 13, color: value ? '#0f172a' : '#cbd5e1' }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>
            {lead.notes && (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px', gridColumn: '1 / -1' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Notes</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{lead.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Follow-ups */}
        {tab === 'followups' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Follow-ups</h3>
              {lead.status !== 'won' && (isAdmin || can('sales', 'canEditLeads')) && (
                <button onClick={() => setFuModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <HiPlus size={15} /> Add Follow-up
                </button>
              )}
            </div>
            {followUps.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No follow-ups yet.</div>
            ) : followUps.map((fu: FollowUp) => {
              const isPending  = fu.status === 'pending';
              const isOverdue  = isPending && new Date(fu.scheduled_at) < new Date();
              const statusColor = fu.status === 'completed' ? '#059669' : fu.status === 'missed' ? '#dc2626' : fu.status === 'cancelled' ? '#94a3b8' : isOverdue ? '#ea580c' : '#2563eb';
              return (
                <div key={fu.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${statusColor}15`, color: statusColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    {FU_ICON[fu.type] ?? <HiClock size={13} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{cap(fu.type)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 50, background: `${statusColor}15`, color: statusColor }}>{isOverdue ? 'Overdue' : cap(fu.status)}</span>
                      {fu.assigned_user && <span style={{ fontSize: 11, color: '#64748b' }}>→ {fu.assigned_user.name}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{fmtDT(fu.scheduled_at)}</div>
                    {fu.notes && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{fu.notes}</div>}
                  </div>
                  {isPending && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => handleFuAction(fu.id, 'complete')}
                        style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <HiCheckCircle size={14} /> Done
                      </button>
                      <button onClick={() => handleFuAction(fu.id, 'miss')}
                        style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer' }}>
                        <HiXCircle size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab: Activity */}
        {tab === 'activity' && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700 }}>Activity Timeline</h3>
            {activities.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No activity yet.</div>
            ) : (
              <div style={{ position: 'relative' }}>
                {activities.map((a: LeadActivity, idx: number) => {
                  const dot = ACTIVITY_COLOR[a.type] ?? '#64748b';
                  return (
                    <div key={a.id} style={{ display: 'flex', gap: 14, paddingBottom: idx < activities.length - 1 ? 20 : 0, position: 'relative' }}>
                      {idx < activities.length - 1 && (
                        <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 2, background: '#f1f5f9' }} />
                      )}
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${dot}20`, border: `2px solid ${dot}`, flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{a.description}</div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                          {a.causer_name && <span style={{ fontSize: 11, color: '#64748b' }}>{a.causer_name}</span>}
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDT(a.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Sales Chat — Seller<->Lead conversation, separate from any
            Project chat this lead may later hand off to. */}
        {tab === 'chat' && canUseSalesChat && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Sales Chat</h3>
            {chat.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>No messages yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
                {chat.map(m => (
                  <div key={m.id}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                      {m.sender_admin ? `${m.sender_admin.name} (Admin)` : m.sender?.name ?? 'Unknown'}
                    </div>
                    {m.content && <div style={{ fontSize: 13, color: '#475569' }}>{m.content}</div>}
                    {m.attachment_name && (
                      <button onClick={() => downloadChatAttachment(m)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '4px 10px',
                        borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#2563eb',
                        fontSize: 12, cursor: 'pointer',
                      }}>📎 {m.attachment_name}</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {chatFile && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', marginBottom: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#334155' }}>📎 {chatFile.name} <span style={{ color: '#94a3b8' }}>({fmtFileSize(chatFile.size)})</span></span>
                <button type="button" onClick={() => setChatFile(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
              </div>
            )}
            <form onSubmit={sendChat} style={{ display: 'flex', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, borderRadius: 8, border: '1.5px dashed #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer', flexShrink: 0 }}>
                📎
                <input
                  type="file" style={{ display: 'none' }}
                  accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                  onChange={e => { setChatFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
              </label>
              <input
                value={chatText} onChange={e => setChatText(e.target.value)}
                placeholder="Message about this lead…" style={{ ...inp, flex: 1 }}
              />
              <button type="submit" disabled={sendingChat} style={{
                padding: '9px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: sendingChat ? 'wait' : 'pointer', opacity: sendingChat ? 0.7 : 1,
              }}>Send</button>
            </form>
          </div>
        )}
      </div>

      {/* Add Follow-up Modal */}
      {fuModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Add Follow-up</h3>
            {fuError && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, color: '#dc2626', fontSize: 12 }}>{fuError}</div>}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Type</label>
              <select style={inp} value={fuType} onChange={e => setFuType(e.target.value)}>
                <option value="call">Call</option><option value="email">Email</option>
                <option value="meeting">Meeting</option><option value="whatsapp">WhatsApp</option>
                <option value="demo">Demo</option><option value="other">Other</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div><label style={lbl}>Date *</label><input type="date" style={inp} value={fuDate} onChange={e => setFuDate(e.target.value)} required /></div>
              <div><label style={lbl}>Time</label><input type="time" style={inp} value={fuTime} onChange={e => setFuTime(e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Notes</label>
              <textarea style={{ ...inp, height: 72, resize: 'vertical' }} value={fuNotes} onChange={e => setFuNotes(e.target.value)} placeholder="Agenda, what to discuss…" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setFuModal(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddFollowUp} disabled={fuSaving}
                style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: fuSaving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: fuSaving ? 'not-allowed' : 'pointer' }}>
                {fuSaving ? 'Saving…' : 'Add Follow-up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Lead modal */}
      {transferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Transfer Lead</h3>
            <p style={{ margin: '0 0 18px', fontSize: 12, color: '#94a3b8' }}>
              Currently assigned to {lead.assigned_user?.name ?? 'no one'}.
            </p>
            {transferError && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, color: '#dc2626', fontSize: 12 }}>{transferError}</div>}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Transfer To *</label>
              <select style={inp} value={transferToUserId} onChange={e => setTransferToUserId(e.target.value)}>
                <option value="">Select user…</option>
                {companyUsers.filter(u => u.id !== lead.assigned_to).map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Reason (optional)</label>
              <textarea style={{ ...inp, height: 64, resize: 'vertical' }} value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="Why is this lead being transferred?" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setTransferModal(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleTransfer} disabled={transferring}
                style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: transferring ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: transferring ? 'not-allowed' : 'pointer' }}>
                {transferring ? 'Transferring…' : 'Transfer Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
