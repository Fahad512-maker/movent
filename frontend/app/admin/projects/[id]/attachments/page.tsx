'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, ProjectAttachment, ProjectTaskAttachment, Task } from '@/lib/services/adminProjectService';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import { card, fmtDate, fmtFileSize, ALLOWED_ATTACHMENT_TYPES, DRAFT_HINT, DraftNotice } from '@/components/admin/projects/shared';

interface TaskAttachmentGroup {
  task: Task;
  attachments: ProjectTaskAttachment[];
}

export default function ProjectAttachmentsPage() {
  useModuleGuard('projects');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [visibleToClient, setVisibleToClient] = useState(false);
  // Files can't be added to a draft — see the isDraft() guard in
  // Api\Admin\ProjectAttachmentController::store().
  const [projectDraft, setProjectDraft] = useState(false);

  // Task-level attachments are a separate feature/table from the project-
  // level ones above (see Api\Admin\TaskAttachmentController) — shown here
  // too, grouped by task, so it's never ambiguous which task (if any) an
  // attachment belongs to instead of everything reading as "the project's".
  const [taskGroups, setTaskGroups] = useState<TaskAttachmentGroup[]>([]);
  const [taskAttLoading, setTaskAttLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setAttachments(await adminProjectService.attachments.list(projectId)); }
    catch { toast.error('Failed to load attachments'); }
    finally { setLoading(false); }
  };

  const loadTaskAttachments = async () => {
    setTaskAttLoading(true);
    try {
      const tasks = await adminProjectService.tasks.list(projectId);
      const withFiles = tasks.filter(t => (t.attachments_count ?? 0) > 0);
      const groups = await Promise.all(withFiles.map(async task => ({
        task,
        attachments: await adminProjectService.taskAttachments.list(projectId, task.id).catch(() => []),
      })));
      setTaskGroups(groups.filter(g => g.attachments.length > 0));
    } catch { /* silent — project attachments above still load fine */ }
    finally { setTaskAttLoading(false); }
  };

  useEffect(() => {
    load();
    loadTaskAttachments();
    adminProjectService.getOne(projectId).then(p => setProjectDraft(p.status === 'draft')).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadTaskAttachment = async (taskId: number, a: ProjectTaskAttachment) => {
    try { await adminProjectService.taskAttachments.download(projectId, taskId, a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const uploadAttachments = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); failed++; continue; }
      try {
        await adminProjectService.attachments.upload(projectId, file, visibleToClient);
      } catch {
        failed++;
        toast.error(`${file.name}: upload failed`);
      }
    }
    if (failed < files.length) toast.success('Attachment(s) uploaded');
    setUploading(false);
    load();
  };

  const downloadAttachment = async (a: ProjectAttachment) => {
    try { await adminProjectService.attachments.download(projectId, a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const deleteAttachment = async (a: ProjectAttachment) => {
    if (!confirm(`Delete "${a.original_name}"?`)) return;
    try {
      await adminProjectService.attachments.remove(projectId, a.id);
      toast.success('Attachment deleted');
      setAttachments(prev => prev.filter(x => x.id !== a.id));
    } catch { toast.error('Failed to delete attachment'); }
  };

  return (
    <DashboardLayout title="Project Attachments">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Attachments</h2>
      </div>

      <ProjectTabs projectId={projectId} active="attachments" isDraft={projectDraft} />

      {projectDraft && <DraftNotice style={{ marginBottom: 16 }} />}

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Project Attachments</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
              <input
                type="checkbox" checked={visibleToClient}
                onChange={e => setVisibleToClient(e.target.checked)}
              />
              Visible to client
            </label>
            <label
              title={projectDraft ? DRAFT_HINT : undefined}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px dashed #cbd5e1',
                background: uploading || projectDraft ? '#f1f5f9' : '#f8fafc', color: '#475569',
                fontSize: 12, fontWeight: 500, cursor: uploading || projectDraft ? 'not-allowed' : 'pointer',
                opacity: projectDraft ? 0.6 : 1,
              }}>
              {uploading ? 'Uploading…' : '+ Add Files'}
              <input
                type="file" multiple disabled={uploading || projectDraft} style={{ display: 'none' }}
                accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                onChange={e => { uploadAttachments(e.target.files); e.target.value = ''; }}
              />
            </label>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 14 }}>
          General project files — not tied to any specific task. For a task&apos;s own attachments, see &quot;Task Attachments&quot; below or open the task directly.
        </div>
        {loading ? (
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
                  <button onClick={() => downloadAttachment(a)} style={{
                    padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                    background: '#2563eb', color: '#fff', border: 'none',
                  }}>Download</button>
                  <button onClick={() => deleteAttachment(a)} style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6,
                  }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Task Attachments</h3>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 14 }}>
          Files uploaded on individual tasks, grouped by task — separate from the project-level files above.
        </div>
        {taskAttLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        ) : taskGroups.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No task attachments uploaded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {taskGroups.map(({ task, attachments: taskAtts }) => (
              <div key={task.id}>
                <Link href={`/admin/projects/${projectId}/tasks/${task.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 6 }}>
                  {task.task_number && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{task.task_number}</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{task.title}</span>
                </Link>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                  {taskAtts.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{a.original_name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {a.file_type ?? 'file'} · {fmtFileSize(a.file_size)} · {a.uploaded_by_admin?.name ?? a.uploaded_by_user?.name ?? '—'} · {fmtDate(a.created_at)}
                        </div>
                      </div>
                      <button onClick={() => downloadTaskAttachment(task.id, a)} style={{
                        padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                        background: '#2563eb', color: '#fff', border: 'none', flexShrink: 0,
                      }}>Download</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
