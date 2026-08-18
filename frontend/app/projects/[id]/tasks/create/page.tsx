'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { TaskStatus } from '@/lib/services/adminProjectService';
import { can } from '@/lib/auth';
import { roleDisplayLabel } from '@/lib/roleUtils';
import { card, inp, lbl, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';
import SubmitButton from '@/components/ui/SubmitButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';

const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'completed', 'cancelled'];
// A Seller can never be a task assignee, full stop (unconditional exclusion
// below). These roles are excluded from the dropdown only for an actor who
// lacks canAssignTasks — mirrors Api\User\TaskController::assignedToRule().
const INTERNAL_ASSIGNEE_ROLES = ['production', 'developer', 'designer', 'qa'];
const NEVER_TASK_ASSIGNEE_ROLES = ['seller', 'client', 'project_manager'];

interface AssigneeOption { id: number; name: string; role_type?: string; custom_role_label?: string | null }

export default function CreateTaskPage() {
  useAdminGuard();
  const router = useRouter();
  const params = useParams();
  const projectId = Number(params.id);

  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  // Only this project's own team (+ its PM) — not every company user — so
  // the dropdown can't offer someone with no actual stake in this project.
  const [teamOptions, setTeamOptions] = useState<AssigneeOption[]>([]);

  const canCreateTasks = can('project_management', 'canCreateTasks');
  const canAssignTasks = can('project_management', 'canAssignTasks');
  const canUploadTaskAttachments = can('project_management', 'canUploadTaskAttachments');
  // Seller-tier: submit a Client Requirement/General Request for PM review —
  // never an internal production/dev task, and status is always forced to
  // "review" server-side regardless of what's shown here.
  const canCreateLinkedTask = can('project_management', 'canCreateLinkedProjectTask');
  const canCreateAnyTask = canCreateTasks || canCreateLinkedTask;
  const assignableTeamUsers = teamOptions.filter(u => !NEVER_TASK_ASSIGNEE_ROLES.includes(u.role_type ?? ''));

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [notes, setNotes] = useState('');
  const [taskType, setTaskType] = useState<'general' | 'production' | 'client_request' | 'internal'>('general');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canCreateAnyTask) {
      router.replace(`/projects/${projectId}`);
      return;
    }
    userProjectService.getOne(projectId)
      .then(p => {
        if (p.status === 'closed') {
          toast.error('This project is closed and read-only.');
          router.replace(`/projects/${projectId}`);
          return;
        }
        if (p.status === 'completed') {
          toast.error('This project is completed. Reopen it before adding new tasks.');
          router.replace(`/projects/${projectId}`);
          return;
        }
        // Same rule the server enforces (TaskController::store()'s isDraft()
        // guard) — a draft has no tasks until someone activates it. Reached
        // only by a typed URL; the button that leads here is disabled.
        if (p.status === 'draft') {
          toast.error('Activate this draft project before adding tasks.');
          router.replace(`/projects/${projectId}`);
          return;
        }
        setProjectName(p.name);
        // The Project Manager is never assignable — this dropdown is the
        // production team only (Developer/Designer/QA/Production/Team
        // Member), mirrors Api\User\TaskController::assignedToRule().
        const fromTeam = (p.team_members ?? []).map(m => m.user).filter((u): u is AssigneeOption => !!u);
        setTeamOptions(fromTeam);
      })
      .catch(() => { toast.error('Project not found or not accessible'); router.replace('/projects'); })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    const accepted: File[] = [];
    for (const file of Array.from(fileList)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); continue; }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); continue; }
      accepted.push(file);
    }
    if (accepted.length) setFiles(prev => [...prev, ...accepted]);
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    if (!title.trim()) { toast.error('Task title is required'); return; }
    setSaving(true);
    try {
      const task = await userProjectService.tasks.create(projectId, {
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignee ? Number(assignee) : null,
        priority,
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimated_hours: estimatedHours ? Number(estimatedHours) : null,
        notes: notes.trim() || null,
        task_type: taskType,
      });
      let failedCount = 0;
      if (files.length > 0) {
        for (const file of files) {
          try { await userProjectService.taskAttachments.upload(projectId, task.id, file); }
          catch (err: any) {
            failedCount++;
            const isForbidden = err?.response?.status === 403;
            toast.error(isForbidden
              ? `${file.name}: you don't have permission to upload task attachments`
              : `${file.name}: upload failed`);
          }
        }
      }
      if (failedCount > 0) {
        toast.error(`Task created, but ${failedCount} of ${files.length} attachment(s) failed to upload. Open the task and re-upload them from there.`, { duration: 8000 });
      } else {
        toast.success('Task created');
      }
      router.push(`/projects/${projectId}/tasks/${task.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create task');
    } finally { setSaving(false); }
  };

  if (loading) return (<DashboardLayout title="Create Task"><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>);

  return (
    <DashboardLayout title="Create Task">
      <LoadingOverlay show={saving} message={canCreateTasks ? 'Creating Task…' : 'Submitting Request…'} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push(`/projects/${projectId}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>
          {canCreateTasks ? 'Create Task' : 'Submit Task Request'}{projectName && ` — ${projectName}`}
        </h2>
      </div>

      <form onSubmit={submit} style={{ maxWidth: 720 }}>
        <div style={card}>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Task Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required style={inp} placeholder="e.g. Homepage Design" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Assigned To</label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)} style={inp}>
                <option value="">Unassigned</option>
                {(canAssignTasks ? assignableTeamUsers : assignableTeamUsers.filter(u => !INTERNAL_ASSIGNEE_ROLES.includes(u.role_type ?? ''))).map(u => (
                  <option key={u.id} value={u.id}>{u.name}{u.role_type ? ` (${roleDisplayLabel(u)})` : ''}</option>
                ))}
              </select>
              {teamOptions.length === 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>No team members on this project yet.</div>
              )}
            </div>
            <div>
              <label style={lbl}>Task Type</label>
              <select value={taskType} onChange={e => setTaskType(e.target.value as typeof taskType)} style={inp}>
                <option value="general">General</option>
                {canCreateTasks && <option value="production">Production</option>}
                <option value="client_request">Client Request</option>
                {canCreateTasks && <option value="internal">Internal</option>}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: canCreateTasks ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)} style={inp}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            {canCreateTasks ? (
              <div>
                <label style={lbl}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} style={inp}>
                  {TASK_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center', marginTop: 18 }}>
                Will be submitted for PM review
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Optional" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Optional" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Estimated Hours</label>
              <input type="number" min={0} step="0.5" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} style={inp} placeholder="Optional" />
            </div>
          </div>

          {canUploadTaskAttachments ? (
            <div>
              <label style={lbl}>File Attachments</label>
              <label style={{
                display: 'inline-block', padding: '8px 16px', borderRadius: 8,
                border: '1.5px dashed #cbd5e1', background: '#f8fafc', color: '#475569',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', marginBottom: files.length ? 10 : 0,
              }}>
                + Add Files
                <input
                  type="file" multiple style={{ display: 'none' }}
                  accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                  onChange={e => { handleFilesSelected(e.target.files); e.target.value = ''; }}
                />
              </label>
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {files.map((file, i) => (
                    <div key={`${file.name}-${i}`} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                    }}>
                      <div style={{ fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
                        {file.name} <span style={{ color: '#94a3b8' }}>({fmtFileSize(file.size)})</span>
                      </div>
                      <button type="button" onClick={() => removeFile(i)} style={{
                        background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
                      }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              File attachments require the &quot;Upload Task Attachments&quot; permission.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <SubmitButton loading={saving} loadingText={canCreateTasks ? 'Creating Task…' : 'Submitting Request…'} style={{
            padding: '11px 28px', background: saving ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600,
          }}>{canCreateTasks ? 'Create Task' : 'Submit Request'}</SubmitButton>
          <button type="button" onClick={() => router.push(`/projects/${projectId}`)} disabled={saving} style={{
            padding: '11px 22px', background: '#fff', color: '#64748b',
            border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </form>
    </DashboardLayout>
  );
}
