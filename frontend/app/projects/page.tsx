'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { userLeadService } from '@/lib/services/adminLeadService';
import { Project } from '@/lib/services/adminProjectService';
import { CompanyUserOption } from '@/lib/services/userProjectService';
import { notificationService } from '@/lib/services/notificationService';
import { can, getAuthUser } from '@/lib/auth';
import { User } from '@/types';
import api from '@/lib/axios';
import SubmitButton from '@/components/ui/SubmitButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { Badge, STATUS_SC, PRIORITY_SC, fmtDate, inp, lbl } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

// A project's own Seller can carry a cosmetic 'project_manager' team row
// purely so this column shows a name instead of "Unassigned" on a
// self-run project (see ProjectSellerAssignmentService::assign()) — never
// treated as a real PM, same exclusion the backend uses.
const sellerIdOf = (project: Project): number | null => {
  const s = project.seller_id;
  if (s == null) return null;
  return typeof s === 'object' ? s.id : s;
};

const assignedPm = (project: Project): { id: number; name: string } | null => {
  const tm = project.team_members?.find(member => member.user?.role_type === 'project_manager');
  if (tm?.user && tm.user.id !== sellerIdOf(project)) return { id: tm.user.id, name: tm.user.name };
  return null;
};

const assignedToName = (project: Project): string =>
  assignedPm(project)?.name ?? project.project_manager?.name ?? '—';

function UserProjectsList() {
  useAdminGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = getAuthUser() as User | null;
  const leadId = searchParams.get('lead_id') ? Number(searchParams.get('lead_id')) : null;
  const invoiceId = searchParams.get('invoice_id') ? Number(searchParams.get('invoice_id')) : null;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  // Project Managers at this Seller's own company — options for the
  // "Assigned To" dropdown on rows the Seller owns (project.seller_id ===
  // me.id). Fetched once; every such project is the same company.
  const [pmOptions, setPmOptions] = useState<CompanyUserOption[]>([]);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [statusF, setStatusF]   = useState('');

  // A Seller holding canCreateProjects (granted via the "Manage Projects"
  // bundle) gets the same unrestricted "+ New Project" path as PM/Manager
  // tiers — mirrors Api\User\ProjectController::store(). Separately, a
  // Seller who only holds canCreateProjectHandoff can still create a project
  // via the lead/invoice handoff flow (arriving with ?lead_id=/?invoice_id=).
  const canCreate = can('project_management', 'canCreateProjects')
    || ((!!leadId || !!invoiceId) && can('project_management', 'canCreateProjectHandoff'));
  const [showCreate, setShowCreate] = useState(!!leadId || !!invoiceId);
  const [creating, setCreating]     = useState(false);
  const [newName, setNewName]         = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [newDeadline, setNewDeadline] = useState('');
  const [leadName, setLeadName]       = useState<string | null>(null);
  const [leadClientId, setLeadClientId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);

  // Handed off from a won Lead (e.g. /projects?lead_id=50) — pre-fill the
  // name and keep the client/lead link so Sales can see "Linked Projects".
  useEffect(() => {
    if (!leadId) return;
    userLeadService.getOne(leadId).then(lead => {
      setLeadName(lead.name);
      setLeadClientId(lead.client_id);
      setNewName(prev => prev || `${lead.name} — Project`);
    }).catch(() => {});
  }, [leadId]);

  // Handed off from a paid Invoice (e.g. /projects?invoice_id=50) — pre-fill
  // the name from the invoice number, same as the lead-based path above.
  useEffect(() => {
    if (!invoiceId) return;
    api.get(`/user/invoices/${invoiceId}`).then(r => {
      const inv = r.data.data;
      setInvoiceNumber(inv.invoice_number);
      setNewName(prev => prev || `${inv.invoice_number} — Project`);
    }).catch(() => {});
  }, [invoiceId]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    if (!newName.trim()) { toast.error('Project name is required'); return; }
    setCreating(true);
    try {
      const project = await userProjectService.create({
        name: newName.trim(), priority: newPriority, deadline: newDeadline || null,
        lead_id: leadId || undefined, client_id: leadClientId ?? undefined,
        source_invoice_id: invoiceId || undefined,
      });
      toast.success('Project created');
      router.push(`/projects/${project.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create project');
    } finally { setCreating(false); }
  };

  useEffect(() => {
    if (!can('project_management', 'canViewProjects') && !can('project_management', 'canViewLinkedProjects')
      && !can('project_management', 'canViewProjectDashboard') && !can('project_management', 'canViewTeamResources')
      && !can('project_management', 'canAssignTeamResources') && !can('project_management', 'canViewAllCompanyProjects')) {
      router.replace('/dashboard');
    }
    // Clears the Sidebar's Projects red dot now that the sub-user has seen this list.
    notificationService.markCategoryRead('projects')
      .then(() => window.dispatchEvent(new Event('nav_badges_refresh')))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusF) params.status = statusF;
      setProjects(await userProjectService.list(params));
    } catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  };

  // Only a Seller ever owns a project (seller_id match) here, so only a
  // Seller ever needs the PM options — skip the fetch for everyone else.
  useEffect(() => {
    if (me?.role_type !== 'seller') return;
    userProjectService.team.companyUsers()
      .then(users => setPmOptions(users.filter(u => u.role_type === 'project_manager')))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const assignPm = async (projectId: number, value: string) => {
    const pmId = value ? Number(value) : null;
    setAssigningId(projectId);
    try {
      await userProjectService.assignProjectManager(projectId, pmId);
      toast.success(pmId ? 'Project Manager assigned' : 'Project Manager unassigned');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update Project Manager');
    } finally {
      setAssigningId(null);
    }
  };

  useEffect(() => { load(); }, [statusF]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout title="Projects">
      <LoadingOverlay show={creating} message="Creating Project…" />
      <div style={{ width: '100%', maxWidth: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Projects</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>{projects.length} visible</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={statusF} onChange={e => setStatusF(e.target.value)}
              style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa' }}>
              <option value="">All Statuses</option>
              {Object.keys(STATUS_SC).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            {canCreate && (
              <button onClick={() => setShowCreate(v => !v)} style={{
                padding: '9px 16px', borderRadius: 7, border: 'none', background: '#2563eb',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>{showCreate ? 'Cancel' : '+ New Project'}</button>
            )}
          </div>
        </div>

        {canCreate && showCreate && (
          <form onSubmit={createProject} style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: '18px 20px', marginBottom: 16 }}>
            {leadName && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1d4ed8' }}>
                Handing off from lead &quot;{leadName}&quot; — this project will be linked back to it.
              </div>
            )}
            {invoiceNumber && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#5b21b6' }}>
                Handing off from paid invoice &quot;{invoiceNumber}&quot; — this project will be linked back to it.
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label style={lbl}>Project Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} style={inp} placeholder="e.g. Website Redesign" />
              </div>
              <div style={{ width: 160 }}>
                <label style={lbl}>Priority</label>
                <select value={newPriority} onChange={e => setNewPriority(e.target.value as typeof newPriority)} style={inp}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={{ width: 170 }}>
                <label style={lbl}>Deadline</label>
                <input type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} style={inp} />
              </div>
              <SubmitButton loading={creating} loadingText="Creating Project…" style={{
                padding: '9px 20px', borderRadius: 7, border: 'none', background: creating ? '#93c5fd' : '#2563eb',
                color: '#fff', fontSize: 13, fontWeight: 600,
              }}>Create</SubmitButton>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8' }}>You&apos;ll be set as project manager. Add a client, team, and other details from the project page after creating it.</p>
          </form>
        )}

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading projects…</div>
          ) : projects.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📁</div>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No projects visible</div>
              <div style={{ fontSize: 13 }}>Projects you manage or are assigned to will appear here</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Project', 'Client', 'Assigned To', 'Role', 'Status', 'Priority', 'Progress', 'Deadline', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < projects.length - 1 ? '1px solid #f8fafc' : 'none', cursor: 'pointer' }} onClick={() => router.push(`/projects/${p.id}`)}>
                    <td style={{ padding: '13px 14px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{p.name}</td>
                    <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>{p.client?.name ?? '—'}</td>
                    <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }} onClick={e => e.stopPropagation()}>
                      {me?.role_type === 'seller' && sellerIdOf(p) === me.id ? (
                        <select
                          value={assignedPm(p)?.id ?? ''}
                          disabled={assigningId === p.id}
                          onChange={e => assignPm(p.id, e.target.value)}
                          style={{ padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 12, outline: 'none', background: '#fafafa', maxWidth: 160 }}
                        >
                          <option value="">Unassigned (you)</option>
                          {pmOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      ) : assignedToName(p)}
                    </td>
                    <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>{p.my_role ?? '—'}</td>
                    <td style={{ padding: '13px 14px' }}><Badge label={p.status} sc={STATUS_SC[p.status]} /></td>
                    <td style={{ padding: '13px 14px' }}><Badge label={p.priority} sc={PRIORITY_SC[p.priority]} /></td>
                    <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>{p.progress ?? 0}%</td>
                    <td style={{ padding: '13px 14px', color: '#64748b', fontSize: 12 }}>{fmtDate(p.deadline)}</td>
                    <td style={{ padding: '13px 14px' }}>
                      <Link href={`/projects/${p.id}`} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function UserProjectsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout title="Projects">
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      </DashboardLayout>
    }>
      <UserProjectsList />
    </Suspense>
  );
}
