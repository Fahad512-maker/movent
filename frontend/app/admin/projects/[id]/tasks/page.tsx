'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Task, ProjectTaskAttachment } from '@/lib/services/adminProjectService';
import { userService } from '@/lib/services/userService';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import Link from 'next/link';
import { inp, lbl, card, Badge, TASK_SC, PRIORITY_SC, PRODUCTION_SC, PRODUCTION_LABEL, fmtDate, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize, asRelation, DRAFT_HINT, DraftNotice } from '@/components/admin/projects/shared';
import { TASK_STATUS_LABELS, taskStatusRequiresComment, promptForQaUser, promptForOptionalProductionUser } from '@/lib/taskStatusFlow';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { User } from '@/types';

const hasProjectManagementAccess = (u: User) =>
  (u.company_assignments ?? []).some(a => (a.permissions?.project_management ?? []).length > 0);

const TASK_TYPE_LABEL: Record<string, string> = {
  general: 'General', production: 'Production', client_request: 'Client Request', internal: 'Internal',
};
const NEVER_TASK_ASSIGNEE_ROLES = ['seller', 'client'];

const EMPTY_FORM = {
  title: '', description: '', assigned_to: '', priority: 'medium', status: 'todo',
  start_date: '', due_date: '', estimated_hours: '', notes: '', task_type: 'general',
};

export default function ProjectTasksPage() {
  useModuleGuard('tasks');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  // Existing (already-uploaded) attachments for the task currently being
  // edited — populated by startEdit(), distinct from `attachments` above
  // (which only ever holds locally-queued files for the CREATE flow, where
  // the task doesn't have an id yet to upload against).
  const [existingAttachments, setExistingAttachments] = useState<ProjectTaskAttachment[]>([]);
  const [existingAttLoading, setExistingAttLoading] = useState(false);
  const [uploadingExisting, setUploadingExisting] = useState(false);
  // Only fetched to know whether the project is closed (read-only) — hides
  // "+ Add Task"/row actions rather than letting the backend 422 on submit.
  const [projectClosed, setProjectClosed] = useState(false);
  // A draft can't have tasks until it's activated — see the isDraft() guard
  // in Api\Admin\TaskController::store().
  const [projectDraft, setProjectDraft] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setTasks(await adminProjectService.tasks.list(projectId));
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    adminProjectService.getOne(projectId).then(p => {
      setProjectClosed(['closed', 'completed'].includes(p.status));
      setProjectDraft(p.status === 'draft');
      // Only this project's own team members are assignable — not every
      // active user of the company (same fix already applied to the
      // Projects listing's PM dropdown, the all-Tasks page, and
      // Timesheets). Still sourced from userService.list() (not
      // project.team_members directly) since the "no Project Management
      // access" warning below needs each user's full company_assignments,
      // which team_members' nested user object doesn't carry. Seller/client
      // portal accounts can never be task assignees.
      const teamMemberIds = new Set((p.team_members ?? []).map(tm => tm.user_id));
      userService.list().then(d => setUsers(d.users.filter(u =>
        u.is_active && !NEVER_TASK_ASSIGNEE_ROLES.includes(u.role_type ?? '') && teamMemberIds.has(u.id)
      ))).catch(() => {});
    }).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignedUser = users.find(u => String(u.id) === form.assigned_to) ?? null;

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const loadExistingAttachments = async (taskId: number) => {
    setExistingAttLoading(true);
    try { setExistingAttachments(await adminProjectService.taskAttachments.list(projectId, taskId)); }
    catch { toast.error('Failed to load attachments'); }
    finally { setExistingAttLoading(false); }
  };

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setForm({
      title: t.title, description: t.description ?? '',
      assigned_to: asRelation(t.assigned_to)?.id ? String(asRelation(t.assigned_to)!.id) : '',
      priority: t.priority, status: t.status,
      start_date: t.start_date?.slice(0, 10) ?? '', due_date: t.due_date?.slice(0, 10) ?? '',
      estimated_hours: t.estimated_hours != null ? String(t.estimated_hours) : '',
      notes: t.notes ?? '', task_type: 'general',
    });
    setShowForm(true);
    loadExistingAttachments(t.id);
  };

  const cancelForm = () => {
    setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setAttachments([]);
    setExistingAttachments([]);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); continue; }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); continue; }
      accepted.push(file);
    }
    if (accepted.length) setAttachments(prev => [...prev, ...accepted]);
  };

  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index));

  // Uploads straight to the task being edited (it already has an id, unlike
  // the create flow's locally-queued `attachments` above) — one request per
  // file, then refreshes the list so it reflects what's actually stored.
  const uploadExistingAttachments = async (files: FileList | null) => {
    if (!files || !editingId) return;
    setUploadingExisting(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); failed++; continue; }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); failed++; continue; }
      try { await adminProjectService.taskAttachments.upload(projectId, editingId, file); }
      catch { failed++; toast.error(`${file.name}: upload failed`); }
    }
    if (failed < files.length) toast.success('Attachment(s) uploaded');
    setUploadingExisting(false);
    loadExistingAttachments(editingId);
    load();
  };

  const downloadExistingAttachment = async (a: ProjectTaskAttachment) => {
    try { await adminProjectService.taskAttachments.download(projectId, a.task_id, a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const deleteExistingAttachment = async (a: ProjectTaskAttachment) => {
    if (!confirm(`Delete "${a.original_name}"?`)) return;
    try {
      await adminProjectService.taskAttachments.remove(projectId, a.task_id, a.id);
      toast.success('Attachment deleted');
      setExistingAttachments(prev => prev.filter(x => x.id !== a.id));
      load();
    } catch { toast.error('Failed to delete attachment'); }
  };

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!form.title) { toast.error('Enter a task title'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title, description: form.description || null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        priority: form.priority as never, status: form.status as never,
        start_date: form.start_date || null, due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        notes: form.notes || null,
      };
      if (editingId) {
        await adminProjectService.tasks.update(projectId, editingId, payload);
        toast.success('Task updated');
      } else {
        const task = await adminProjectService.tasks.create(projectId, { ...payload, task_type: form.task_type as never });
        let failedCount = 0;
        if (attachments.length > 0) {
          for (const file of attachments) {
            try { await adminProjectService.taskAttachments.upload(projectId, task.id, file); }
            catch { failedCount++; toast.error(`${file.name}: upload failed`); }
          }
        }
        if (failedCount > 0) {
          toast.error(`Task created, but ${failedCount} of ${attachments.length} attachment(s) failed to upload. Open the task and re-upload them from there.`, { duration: 8000 });
        } else {
          toast.success('Task created');
        }
      }
      cancelForm();
      load();
    } catch { toast.error('Failed to save task'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (t: Task, status: string) => {
    let comment: string | undefined;
    if (taskStatusRequiresComment(status)) {
      const input = window.prompt(status === 'blocked' ? 'Reason for marking this task Blocked:' : 'QA comment / reason for QA Failed:');
      if (!input || !input.trim()) { toast.error('A comment is required for this status change.'); return; }
      comment = input.trim();
    }
    let qaAssignedTo: number | undefined;
    if (status === 'ready_for_qa') {
      const picked = promptForQaUser(users.filter(u => u.role_type === 'qa'));
      if (!picked) return;
      qaAssignedTo = picked;
    }
    let productionAssignedTo: number | undefined;
    if (status === 'ready_for_production') {
      productionAssignedTo = promptForOptionalProductionUser(users.filter(u => ['production', 'developer', 'designer'].includes(u.role_type))) ?? undefined;
    }
    try {
      await adminProjectService.tasks.update(projectId, t.id, {
        status: status as never,
        ...(comment ? { comment } : {}),
        ...(qaAssignedTo ? { qa_assigned_to: qaAssignedTo } : {}),
        ...(productionAssignedTo ? { production_assigned_to: productionAssignedTo } : {}),
      });
      load();
    } catch { toast.error('Failed to update status'); }
  };

  const remove = async (t: Task) => {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    try {
      await adminProjectService.tasks.remove(projectId, t.id);
      toast.success('Task deleted');
      load();
    } catch { toast.error('Failed to delete task'); }
  };

  return (
    <DashboardLayout title="Project Tasks">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0, flex: 1 }}>Tasks</h2>
        {!projectClosed && (
          <button
            onClick={() => (showForm ? cancelForm() : setShowForm(true))}
            disabled={projectDraft}
            title={projectDraft ? DRAFT_HINT : undefined}
            style={{
              padding: '9px 18px', background: projectDraft ? '#cbd5e1' : '#2563eb', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: projectDraft ? 'not-allowed' : 'pointer',
            }}>{showForm ? 'Cancel' : '+ Add Task'}</button>
        )}
      </div>

      <ProjectTabs projectId={projectId} active="tasks" isDraft={projectDraft} />

      {projectDraft && <DraftNotice style={{ marginBottom: 16 }} />}

      {showForm && (
        <form onSubmit={submit} style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Title *</label>
              <input value={form.title} onChange={e => setF('title', e.target.value)} required style={inp} />
            </div>
            <div>
              <label style={lbl}>Assign To</label>
              <select value={form.assigned_to} onChange={e => setF('assigned_to', e.target.value)} style={inp}>
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLE_LABELS[u.role_type] ?? u.role_type}{hasProjectManagementAccess(u) ? '' : ' — no Project Management access'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {assignedUser && !hasProjectManagementAccess(assignedUser) && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
              This user does not have Project Management access. They won&apos;t be able to see this task after logging in.{' '}
              <Link href={`/admin/users/${assignedUser.id}/edit`} style={{ color: '#2563eb', fontWeight: 600 }}>Grant access from Users &amp; Permissions</Link>.
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Description</label>
            <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Priority</label>
              <select value={form.priority} onChange={e => setF('priority', e.target.value)} style={inp}>
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                {Object.entries(TASK_STATUS_LABELS).map(([s, label]) => <option key={s} value={s}>{label}</option>)}
              </select>
            </div>
            {!editingId && (
              <div>
                <label style={lbl}>Type</label>
                <select value={form.task_type} onChange={e => setF('task_type', e.target.value)} style={inp}>
                  <option value="general">General</option>
                  <option value="production">Production</option>
                  <option value="client_request">Client Request</option>
                  <option value="internal">Internal</option>
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Estimated Hours</label>
              <input type="number" min={0} step="0.5" value={form.estimated_hours} onChange={e => setF('estimated_hours', e.target.value)} style={inp} placeholder="Optional" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Optional" />
          </div>
          {!editingId ? (
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>File Attachments</label>
              <label style={{
                display: 'inline-block', padding: '8px 16px', borderRadius: 8,
                border: '1.5px dashed #cbd5e1', background: '#f8fafc', color: '#475569',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', marginBottom: attachments.length ? 10 : 0,
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
                      padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
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
          ) : (
            // Editing an existing task — it already has an id, so new files
            // upload immediately (via uploadExistingAttachments) instead of
            // being queued locally like the create flow above.
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>File Attachments</label>
              <label style={{
                display: 'inline-block', padding: '8px 16px', borderRadius: 8,
                border: '1.5px dashed #cbd5e1', background: uploadingExisting ? '#f1f5f9' : '#f8fafc', color: '#475569',
                fontSize: 12, fontWeight: 500, cursor: uploadingExisting ? 'not-allowed' : 'pointer', marginBottom: 10,
              }}>
                {uploadingExisting ? 'Uploading…' : '+ Add Files'}
                <input
                  type="file" multiple disabled={uploadingExisting} style={{ display: 'none' }}
                  accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                  onChange={e => { uploadExistingAttachments(e.target.files); e.target.value = ''; }}
                />
              </label>
              {existingAttLoading ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</div>
              ) : existingAttachments.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>No attachments uploaded yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {existingAttachments.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                    }}>
                      <div style={{ fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
                        {a.original_name} <span style={{ color: '#94a3b8' }}>({fmtFileSize(a.file_size)})</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type="button" onClick={() => downloadExistingAttachment(a)} style={{
                          padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                          background: '#2563eb', color: '#fff', border: 'none',
                        }}>Download</button>
                        <button type="button" onClick={() => deleteExistingAttachment(a)} style={{
                          background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="submit" disabled={saving} style={{
            padding: '9px 20px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Saving…' : editingId ? 'Update Task' : 'Add Task'}</button>
        </form>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No tasks yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Task', 'Assigned To', 'Priority', 'Status', 'Due', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => router.push(`/admin/projects/${projectId}/tasks/${t.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                      {t.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{t.task_number}</div>}
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.title}</div>
                    </button>
                    <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      {t.task_type && t.task_type !== 'general' && <Badge label={TASK_TYPE_LABEL[t.task_type] ?? t.task_type} />}
                      {!!t.attachments_count && <Badge label={`📎 ${t.attachments_count}`} />}
                      {t.production_queue && (
                        <Link href={`/admin/projects/production?project_id=${t.project_id}`} style={{ textDecoration: 'none' }}>
                          <Badge label={`🏭 ${PRODUCTION_LABEL[t.production_queue.status] ?? t.production_queue.status}`} sc={PRODUCTION_SC[t.production_queue.status]} />
                        </Link>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{asRelation(t.assigned_to)?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}><Badge label={t.priority} sc={PRIORITY_SC[t.priority]} /></td>
                  <td style={{ padding: '12px 16px' }}>
                    <select value={t.status} onChange={e => updateStatus(t, e.target.value)} style={{
                      ...inp, width: 'auto', padding: '4px 8px', fontSize: 11, fontWeight: 500,
                      background: TASK_SC[t.status]?.bg, color: TASK_SC[t.status]?.color, border: 'none',
                    }}>
                      {Object.entries(TASK_STATUS_LABELS).map(([s, label]) => <option key={s} value={s}>{label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(t.due_date)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {!projectClosed && <button onClick={() => startEdit(t)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6 }}>Edit</button>}
                      {!projectClosed && <button onClick={() => remove(t)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6 }}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashboardLayout>
  );
}
