'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { can, getAuthUser } from '@/lib/auth';
import { userProjectService, ProjectAttachment } from '@/lib/services/userProjectService';
import { Project, Priority, ProjectStatus } from '@/lib/services/adminProjectService';
import { User } from '@/types';
import { ALLOWED_ATTACHMENT_TYPES, DRAFT_HINT, fmtDate, fmtFileSize, inp, lbl, MAX_ATTACHMENT_MB } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: 20,
};

export default function UserEditProjectPage() {
  useAdminGuard();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);
  const me = getAuthUser() as User | null;

  const [project, setProject] = useState<Project | null>(null);
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [attLoading, setAttLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'planning' as ProjectStatus,
    priority: 'medium' as Priority,
    start_date: '',
    deadline: '',
  });

  const canEditProjects = can('project_management', 'canEditProjects');
  const canViewAttachments = me?.role_type === 'seller' || can('project_management', 'canViewProjectAttachments');
  const canDownloadAttachments = me?.role_type === 'seller' || can('project_management', 'canDownloadProjectAttachments');
  const canDeleteAttachments = me?.role_type !== 'seller' && can('project_management', 'canDeleteProjectAttachments');
  const isSeller = me?.role_type === 'seller';
  const isProjectPmTier = project?.project_manager?.id === me?.id
    || (me?.role_type === 'project_manager' && can('project_management', 'canViewAllCompanyProjects'));
  const canUploadAttachments = isSeller
    ? can('project_management', 'canUploadProjectAttachments')
    : isProjectPmTier && (canEditProjects || can('project_management', 'canUploadProjectAttachments'));
  const isDraft = project?.status === 'draft' || project?.status === 'unpaid';

  const setF = (key: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const loadAttachments = async () => {
    if (!canViewAttachments) {
      return;
    }
    try {
      setAttachments(await userProjectService.attachments.list(projectId));
    } catch {
      setAttachments([]);
    } finally {
      setAttLoading(false);
    }
  };

  useEffect(() => {
    if (!can('project_management', 'canViewProjects') && !can('project_management', 'canViewLinkedProjects')) {
      router.replace('/dashboard');
      return;
    }
    if (!canEditProjects) {
      router.replace(`/projects/${projectId}`);
      return;
    }
    userProjectService.getOne(projectId)
      .then(next => {
        setProject(next);
        setForm({
          name: next.name,
          description: next.description ?? '',
          status: next.status,
          priority: next.priority,
          start_date: next.start_date?.slice(0, 10) ?? '',
          deadline: next.deadline?.slice(0, 10) ?? '',
        });
      })
      .catch(() => {
        toast.error('Project not found or not accessible');
        router.replace('/projects');
      })
      .finally(() => setLoading(false));

    if (canViewAttachments) {
      userProjectService.attachments.list(projectId)
        .then(setAttachments)
        .catch(() => setAttachments([]))
        .finally(() => setAttLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAttachments = async (files: FileList | null) => {
    if (!files || isDraft) return;
    setUploading(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) {
        toast.error(`${file.name}: file type not allowed`);
        failed++;
        continue;
      }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`);
        failed++;
        continue;
      }
      try {
        await userProjectService.attachments.upload(projectId, file, isSeller || visibleToClient);
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
    if (!canDownloadAttachments) return;
    try {
      await userProjectService.attachments.download(projectId, a.id, a.original_name);
    } catch {
      toast.error('Download failed');
    }
  };

  const deleteAttachment = async (a: ProjectAttachment) => {
    if (!canDeleteAttachments || !confirm(`Delete "${a.original_name}"?`)) return;
    try {
      await userProjectService.attachments.remove(projectId, a.id);
      toast.success('Attachment deleted');
      setAttachments(prev => prev.filter(x => x.id !== a.id));
    } catch {
      toast.error('Failed to delete attachment');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Project name is required');
      return;
    }
    setSaving(true);
    try {
      await userProjectService.update(projectId, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date || null,
        deadline: form.deadline || null,
      });
      toast.success('Project updated');
      router.push(`/projects/${projectId}`);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      toast.error(ex.response?.data?.message ?? 'Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <DashboardLayout title="Edit Project"><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading...</div></DashboardLayout>;
  }
  if (!project) return null;

  return (
    <DashboardLayout title="Edit Project">
      <div style={{ width: '100%', maxWidth: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => router.push(`/projects/${projectId}`)} style={{
            background: '#f1f5f9', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
          }}>Back</button>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Edit Project</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={card}>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Project Name *</label>
              <input value={form.name} onChange={e => setF('name', e.target.value)} required style={inp} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Description</label>
              <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="blocked">Blocked</option>
                  <option value="cancelled">Cancelled</option>
                  {form.status === 'completed' && <option value="completed" disabled>Completed</option>}
                  {form.status === 'closed' && <option value="closed" disabled>Closed</option>}
                  {form.status === 'draft' && <option value="draft" disabled>Draft</option>}
                  {form.status === 'unpaid' && <option value="unpaid" disabled>Unpaid</option>}
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <div>
                <label style={lbl}>Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Deadline</label>
                <input type="date" value={form.deadline} onChange={e => setF('deadline', e.target.value)} style={inp} />
              </div>
            </div>
          </div>

          <div style={{ ...card, marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Attachments</h3>
              {canUploadAttachments && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {!isSeller && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                      <input type="checkbox" checked={visibleToClient} onChange={e => setVisibleToClient(e.target.checked)} />
                      Visible to client
                    </label>
                  )}
                  <label title={isDraft ? DRAFT_HINT : undefined} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1.5px dashed #cbd5e1',
                    background: uploading || isDraft ? '#f1f5f9' : '#f8fafc', color: '#475569',
                    fontSize: 12, fontWeight: 500, cursor: uploading || isDraft ? 'not-allowed' : 'pointer',
                    opacity: isDraft ? 0.6 : 1,
                  }}>
                    {uploading ? 'Uploading...' : 'Add Files'}
                    <input
                      type="file" multiple disabled={uploading || isDraft} style={{ display: 'none' }}
                      accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                      onChange={e => { uploadAttachments(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                </div>
              )}
            </div>

            {attLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading...</div>
            ) : attachments.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No attachments uploaded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {attachments.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f8fafc', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', wordBreak: 'break-word' }}>{a.original_name}</span>
                        {a.is_visible_to_client && (
                          <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>
                            Visible to client
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                        {a.file_type ?? 'file'} | {fmtFileSize(a.file_size)} | {a.uploaded_by_admin?.name ?? a.uploaded_by_user?.name ?? '-'} | {fmtDate(a.created_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {canDownloadAttachments && (
                        <button type="button" onClick={() => downloadAttachment(a)} style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                          background: '#2563eb', color: '#fff', border: 'none',
                        }}>Download</button>
                      )}
                      {canDeleteAttachments && (
                        <button type="button" onClick={() => deleteAttachment(a)} style={{
                          padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6,
                        }}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="submit" disabled={saving || ['closed', 'approved_locked'].includes(project.status)} style={{
              padding: '11px 28px', background: saving || ['closed', 'approved_locked'].includes(project.status) ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, cursor: saving || ['closed', 'approved_locked'].includes(project.status) ? 'not-allowed' : 'pointer',
            }}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" onClick={() => router.push(`/projects/${projectId}`)} style={{
              padding: '11px 22px', background: '#fff', color: '#64748b',
              border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
