'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { getAuthUser } from '@/lib/auth';
import { adminProjectService } from '@/lib/services/adminProjectService';
import { adminClientService } from '@/lib/services/adminClientService';
import { adminLeadService } from '@/lib/services/adminLeadService';
import { inp, lbl, card, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize } from '@/components/admin/projects/shared';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { Admin } from '@/types';

interface Company { id: number; name: string }
interface ClientOption { id: number; name: string }
interface UserOption { id: number; name: string; role: string }

function CreateProjectForm() {
  useModuleGuard('projects');
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get('lead_id') ? Number(searchParams.get('lead_id')) : null;
  const invoiceId = searchParams.get('invoice_id') ? Number(searchParams.get('invoice_id')) : null;
  const admin = getAuthUser() as Admin | null;
  // 'client_portal' is the real purchasable module_key — 'clients' was never
  // a real CompanyModule row (see ModuleSeeder.php).
  const hasClients = admin?.modules?.includes('client_portal') ?? false;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients]     = useState<ClientOption[]>([]);
  const [users, setUsers]         = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [leadName, setLeadName]   = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);

  const [form, setForm] = useState({
    company_id: '', client_id: '', project_manager_id: '',
    name: '', description: '', status: 'active', priority: 'medium',
    budget: '', start_date: '', deadline: '',
  });

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Handed off from a won Lead — pre-fill name/client and keep the link.
  useEffect(() => {
    if (!leadId) return;
    adminLeadService.getOne(leadId).then(lead => {
      setLeadName(lead.name);
      setForm(f => ({ ...f, name: f.name || `${lead.name} — Project`, client_id: lead.client_id ? String(lead.client_id) : f.client_id }));
    }).catch(() => {});
  }, [leadId]);

  // Handed off from a paid Invoice — pre-fill name/client the same way.
  useEffect(() => {
    if (!invoiceId) return;
    api.get(`/admin/invoices/${invoiceId}`).then(r => {
      const inv = r.data.data;
      setInvoiceNumber(inv.invoice_number);
      setForm(f => ({ ...f, name: f.name || `${inv.invoice_number} — Project`, client_id: inv.client_id ? String(inv.client_id) : f.client_id }));
    }).catch(() => {});
  }, [invoiceId]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) {
        toast.error(`${file.name}: file type not allowed`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) setAttachments(prev => [...prev, ...accepted]);
  };

  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index));

  useEffect(() => {
    api.get('/admin/companies').then(r => {
      const list: Company[] = r.data.data || [];
      setCompanies(list);
      if (list.length === 1) setF('company_id', String(list[0].id));
    }).catch(() => {});

    if (hasClients) {
      adminClientService.list().then(d => setClients(d.clients)).catch(() => {});
    }
  }, [hasClients]);

  // Project Manager options are scoped to the SELECTED company only — reload
  // and clear the previous pick whenever the company changes, so a PM from a
  // different company this admin owns never lingers in the dropdown/value.
  useEffect(() => {
    setF('project_manager_id', '');
    if (!form.company_id) { setUsers([]); return; }

    setUsersLoading(true);
    adminProjectService.projectUsers(Number(form.company_id))
      .then(d => setUsers(d.all_assignable_users.map(u => ({ id: u.user_id, name: u.name, role: u.role }))))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, [form.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!form.company_id)  { toast.error('Select a company'); return; }
    if (!form.name)        { toast.error('Enter a project name'); return; }

    setSaving(true);
    try {
      const project = await adminProjectService.create({
        company_id: Number(form.company_id),
        client_id: form.client_id ? Number(form.client_id) : null,
        lead_id: leadId || undefined,
        invoice_id: invoiceId || undefined,
        project_manager_id: form.project_manager_id ? Number(form.project_manager_id) : null,
        name: form.name,
        description: form.description || null,
        status: form.status as never,
        priority: form.priority as never,
        budget: form.budget ? Number(form.budget) : null,
        start_date: form.start_date || null,
        deadline: form.deadline || null,
      });

      if (attachments.length > 0) {
        let failed = 0;
        for (const file of attachments) {
          try {
            await adminProjectService.attachments.upload(project.id, file);
          } catch {
            failed++;
          }
        }
        if (failed > 0) {
          toast.error(`Project created, but ${failed} of ${attachments.length} attachment(s) failed to upload. You can retry from the project page.`);
        }
      }

      toast.success('Project created!');
      router.push(`/admin/projects/${project.id}`);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      toast.error(e2.response?.data?.message ?? 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="New Project">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>New Project</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
            {leadName ? `Handing off from lead "${leadName}"`
              : invoiceNumber ? `Handing off from paid invoice "${invoiceNumber}"`
              : 'Set up a new project for your team'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div style={card}>
          {companies.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Company *</label>
              <select value={form.company_id} onChange={e => setF('company_id', e.target.value)} required style={inp}>
                <option value="">Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Project Name *</label>
            <input value={form.name} onChange={e => setF('name', e.target.value)} required placeholder="e.g. Website Redesign" style={inp} />
          </div>

          {hasClients ? (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Client (optional)</label>
              <select value={form.client_id} onChange={e => setF('client_id', e.target.value)} style={inp}>
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {clients.length === 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  No clients yet — you can create the project without one, or{' '}
                  <a href="/admin/clients/create" style={{ color: '#2563eb' }}>add a client first</a>.
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 16, fontSize: 12, color: '#94a3b8' }}>
              Client module is not active — projects can still be created without a linked client.
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Description</label>
            <textarea value={form.description} onChange={e => setF('description', e.target.value)}
              rows={3} placeholder="Project scope, goals…" style={{ ...inp, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Priority</label>
              <select value={form.priority} onChange={e => setF('priority', e.target.value)} style={inp}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Assign User</label>
            <select value={form.project_manager_id} onChange={e => setF('project_manager_id', e.target.value)} disabled={usersLoading} style={inp}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>)}
            </select>
            {usersLoading && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Loading company users…</div>
            )}
            {!usersLoading && form.company_id && users.length === 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                No eligible users found for this company.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Deadline</label>
              <input type="date" value={form.deadline} onChange={e => setF('deadline', e.target.value)} style={inp} />
            </div>
          </div>

          <div>
            <label style={lbl}>Budget (optional)</label>
            <input type="number" min="0" step="0.01" value={form.budget} onChange={e => setF('budget', e.target.value)} placeholder="0.00" style={inp} />
          </div>
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Project Attachments</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>
            Optional — PDF, DOC/DOCX, XLS/XLSX, PNG/JPG/JPEG, ZIP · max {MAX_ATTACHMENT_MB}MB per file
          </p>
          <label style={{
            display: 'inline-block', padding: '9px 18px', borderRadius: 8,
            border: '1.5px dashed #cbd5e1', background: '#f8fafc', color: '#475569',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: attachments.length ? 12 : 0,
          }}>
            + Add Files
            <input
              type="file" multiple style={{ display: 'none' }}
              accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
              onChange={e => { handleFilesSelected(e.target.files); e.target.value = ''; }}
            />
          </label>

          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attachments.map((file, i) => (
                <div key={`${file.name}-${i}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                }}>
                  <div style={{ fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
                    {file.name} <span style={{ color: '#94a3b8' }}>({fmtFileSize(file.size)})</span>
                  </div>
                  <button type="button" onClick={() => removeAttachment(i)} style={{
                    background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={saving} style={{
            padding: '11px 28px', background: saving ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Creating…' : 'Create Project'}</button>
          <button type="button" onClick={() => router.back()} style={{
            padding: '11px 22px', background: '#fff', color: '#64748b',
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </form>
    </DashboardLayout>
  );
}

export default function CreateProjectPage() {
  return (
    <Suspense fallback={
      <DashboardLayout title="New Project">
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      </DashboardLayout>
    }>
      <CreateProjectForm />
    </Suspense>
  );
}
