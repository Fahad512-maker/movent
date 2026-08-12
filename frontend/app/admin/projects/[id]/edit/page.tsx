'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { getAuthUser } from '@/lib/auth';
import { adminProjectService, ProjectAttachment } from '@/lib/services/adminProjectService';
import { adminClientService } from '@/lib/services/adminClientService';
import { inp, lbl, card, fmtDate, fmtFileSize, ALLOWED_ATTACHMENT_TYPES } from '@/components/admin/projects/shared';
import { Admin } from '@/types';

interface ClientOption { id: number; name: string }
interface UserOption { id: number; name: string; role: string }

export default function EditProjectPage() {
  useModuleGuard('projects');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const admin = getAuthUser() as Admin | null;
  // 'client_portal' is the real purchasable module_key — 'clients' was never
  // a real CompanyModule row (see ModuleSeeder.php).
  const hasClients = admin?.modules?.includes('client_portal') ?? false;

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [users, setUsers]     = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);

  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [attLoading, setAttLoading]   = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [visibleToClient, setVisibleToClient] = useState(false);

  const [form, setForm] = useState({
    client_id: '', project_manager_id: '',
    name: '', description: '', status: 'planning', priority: 'medium',
    budget: '', start_date: '', deadline: '',
  });
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    setLoading(true);
    adminProjectService.getOne(Number(id))
      .then(p => {
        setForm({
          client_id: String(p.client_id ?? ''),
          project_manager_id: p.project_manager_id ? String(p.project_manager_id) : '',
          name: p.name, description: p.description ?? '',
          status: p.status, priority: p.priority,
          budget: p.budget != null ? String(p.budget) : '',
          start_date: p.start_date?.slice(0, 10) ?? '',
          deadline: p.deadline?.slice(0, 10) ?? '',
        });
        // Project Manager options are scoped to THIS project's own (fixed,
        // non-editable) company — never every company this admin owns.
        setUsersLoading(true);
        adminProjectService.projectUsers(p.company_id)
          .then(d => setUsers(d.all_assignable_users.map(u => ({ id: u.user_id, name: u.name, role: u.role }))))
          .catch(() => setUsers([]))
          .finally(() => setUsersLoading(false));
      })
      .catch(() => toast.error('Failed to load project'))
      .finally(() => setLoading(false));

    if (hasClients) adminClientService.list().then(d => setClients(d.clients)).catch(() => {});
  }, [id, hasClients]);

  const loadAttachments = async () => {
    setAttLoading(true);
    try { setAttachments(await adminProjectService.attachments.list(Number(id))); }
    catch { toast.error('Failed to load attachments'); }
    finally { setAttLoading(false); }
  };

  useEffect(() => { loadAttachments(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAttachments = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); failed++; continue; }
      try {
        await adminProjectService.attachments.upload(Number(id), file, visibleToClient);
      } catch {
        failed++;
        toast.error(`${file.name}: upload failed`);
      }
    }
    if (failed < files.length) toast.success('Attachment(s) uploaded');
    setUploading(false);
    loadAttachments();
  };

  const downloadAttachment = async (a: ProjectAttachment) => {
    try { await adminProjectService.attachments.download(Number(id), a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const deleteAttachment = async (a: ProjectAttachment) => {
    if (!confirm(`Delete "${a.original_name}"?`)) return;
    try {
      await adminProjectService.attachments.remove(Number(id), a.id);
      toast.success('Attachment deleted');
      setAttachments(prev => prev.filter(x => x.id !== a.id));
    } catch { toast.error('Failed to delete attachment'); }
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminProjectService.update(Number(id), {
        client_id: form.client_id ? Number(form.client_id) : null,
        project_manager_id: form.project_manager_id ? Number(form.project_manager_id) : null,
        name: form.name,
        description: form.description || null,
        status: form.status as never,
        priority: form.priority as never,
        budget: form.budget ? Number(form.budget) : null,
        start_date: form.start_date || null,
        deadline: form.deadline || null,
      });
      toast.success('Project updated');
      router.push(`/admin/projects/${id}`);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      toast.error(e2.response?.data?.message ?? 'Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (<DashboardLayout title="Edit Project"><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>);

  return (
    <DashboardLayout title="Edit Project">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Edit Project</h2>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div style={card}>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Project Name *</label>
            <input value={form.name} onChange={e => setF('name', e.target.value)} required style={inp} />
          </div>

          {hasClients && (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Client (optional)</label>
              <select value={form.client_id} onChange={e => setF('client_id', e.target.value)} style={inp}>
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Description</label>
            <textarea value={form.description} onChange={e => setF('description', e.target.value)}
              rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="blocked">Blocked</option>
                <option value="cancelled">Cancelled</option>
                {/* Completed/Closed are reached only via the "Mark as Complete" /
                    "Close Project" actions on the project detail page — the
                    backend no longer accepts them as a bare status write here.
                    Kept as disabled options only so the current value still
                    renders correctly if this project is already in that state. */}
                {form.status === 'completed' && <option value="completed" disabled>Completed</option>}
                {form.status === 'closed' && <option value="closed" disabled>Closed</option>}
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
            <label style={lbl}>Assign Project</label>
            <select value={form.project_manager_id} onChange={e => setF('project_manager_id', e.target.value)} disabled={usersLoading} style={inp}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, ' ')})</option>)}
            </select>
            {usersLoading && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Loading company users…</div>
            )}
            {!usersLoading && users.length === 0 && (
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
            <label style={lbl}>Budget</label>
            <input type="number" min="0" step="0.01" value={form.budget} onChange={e => setF('budget', e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ ...card, marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Attachments</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={visibleToClient} onChange={e => setVisibleToClient(e.target.checked)} />
                Visible to client
              </label>
              <label style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px dashed #cbd5e1',
                background: uploading ? '#f1f5f9' : '#f8fafc', color: '#475569',
                fontSize: 12, fontWeight: 500, cursor: uploading ? 'not-allowed' : 'pointer',
              }}>
                {uploading ? 'Uploading…' : '+ Add Files'}
                <input
                  type="file" multiple disabled={uploading} style={{ display: 'none' }}
                  accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                  onChange={e => { uploadAttachments(e.target.files); e.target.value = ''; }}
                />
              </label>
            </div>
          </div>
          {attLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
          ) : attachments.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>No attachments uploaded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{a.original_name}</span>
                      {a.is_visible_to_client && (
                        <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>
                          Visible to client
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {a.file_type ?? 'file'} · {fmtFileSize(a.file_size)} · {a.uploaded_by_admin?.name ?? a.uploaded_by_user?.name ?? '—'} · {fmtDate(a.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => downloadAttachment(a)} style={{
                      padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                      background: '#2563eb', color: '#fff', border: 'none',
                    }}>Download</button>
                    <button type="button" onClick={() => deleteAttachment(a)} style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6,
                    }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="submit" disabled={saving} style={{
            padding: '11px 28px', background: saving ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Saving…' : 'Save Changes'}</button>
          <button type="button" onClick={() => router.push(`/admin/projects/${id}`)} style={{
            padding: '11px 22px', background: '#fff', color: '#64748b',
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </form>
    </DashboardLayout>
  );
}
