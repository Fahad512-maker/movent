'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { Task, TaskActivity, ProjectComment, ProjectTaskAttachment, MentionableUser } from '@/lib/services/adminProjectService';
import { can, getAuthUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { User } from '@/types';
import { Badge, ThumbIcon, TASK_SC, PRIORITY_SC, card, inp, lbl, fmtDate, fmtFileSize, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

const TASK_TYPE_LABEL: Record<string, string> = {
  general: 'General', production: 'Production', client_request: 'Client Request', internal: 'Internal',
};

const ACTIVITY_COLOR: Record<string, string> = {
  created: '#2563eb', assigned: '#0891b2', status_changed: '#7c3aed', completed: '#059669', updated: '#64748b',
  commented: '#d97706', revision: '#be185d',
};

const fmtDT = (d: string) => new Date(d).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1e293b', marginTop: 4 }}>{value ?? '—'}</div>
    </div>
  );
}

function asRelation<T extends object>(v: T | number | null | undefined): T | null {
  return v && typeof v === 'object' ? v : null;
}

// Groups a flat, newest-first comment list into proper reply threads — each
// root comment immediately followed by all of its replies (oldest first,
// recursively), instead of interleaving them chronologically with unrelated
// comments the way a flat list would. A reply whose parent isn't in this
// viewer's own visible set is treated as its own root — it has nothing
// visible to nest under.
function buildThreadOrder(comments: ProjectComment[]): { comment: ProjectComment; depth: number }[] {
  const byId = new Map(comments.map(c => [c.id, c]));
  const childrenOf = new Map<number, ProjectComment[]>();
  const roots: ProjectComment[] = [];
  for (const c of comments) {
    if (c.parent_comment_id && byId.has(c.parent_comment_id)) {
      const siblings = childrenOf.get(c.parent_comment_id) ?? [];
      siblings.push(c);
      childrenOf.set(c.parent_comment_id, siblings);
    } else {
      roots.push(c);
    }
  }
  const byCreatedAtAsc = (a: ProjectComment, b: ProjectComment) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const ordered: { comment: ProjectComment; depth: number }[] = [];
  const walk = (c: ProjectComment, depth: number) => {
    ordered.push({ comment: c, depth });
    const kids = (childrenOf.get(c.id) ?? []).slice().sort(byCreatedAtAsc);
    for (const k of kids) walk(k, depth + 1);
  };
  for (const r of roots.slice().sort(byCreatedAtAsc)) walk(r, 0);
  return ordered;
}

export default function UserTaskDetailPage() {
  useAdminGuard();
  const router = useRouter();
  const params = useParams();
  const projectId = Number(params.id);
  const taskId = Number(params.taskId);
  const me = getAuthUser() as User | null;

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [comments, setComments] = useState<ProjectComment[]>([]);

  const [attachments, setAttachments] = useState<ProjectTaskAttachment[]>([]);
  const [attLoading, setAttLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const canViewTaskAttachments = can('project_management', 'canViewTaskAttachments');
  const canUploadTaskAttachments = can('project_management', 'canUploadTaskAttachments');
  const canDownloadTaskAttachments = can('project_management', 'canDownloadTaskAttachments');
  const canDeleteTaskAttachments = can('project_management', 'canDeleteTaskAttachments');

  // Mirrors Api\User\ProjectCommentController::isInternalStaff() — a Seller
  // following up on a linked project never sees/posts 'internal' notes, no
  // matter what permissions they hold.
  const isInternalCommentStaff = me?.role_type !== 'seller'
    && (can('project_management', 'canViewTasks') || can('project_management', 'canViewAllCompanyProjects'));

  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<MentionableUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<MentionableUser[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [replySelectedMentions, setReplySelectedMentions] = useState<MentionableUser[]>([]);

  const loadTask = async () => {
    setLoading(true);
    try {
      const tasks = await userProjectService.tasks.list(projectId);
      const found = tasks.find(t => t.id === taskId) ?? null;
      if (!found) { toast.error('Task not found or not accessible'); router.replace(`/projects/${projectId}`); return; }
      setTask(found);
    } catch {
      toast.error('Task not found or not accessible');
      router.replace(`/projects/${projectId}`);
    } finally { setLoading(false); }
  };

  const loadActivity = async () => {
    try { setActivities(await userProjectService.tasks.activity(projectId, taskId)); } catch { /* silent */ }
  };

  const loadComments = async () => {
    try { setComments(await userProjectService.comments.list(projectId, taskId)); } catch { /* silent */ }
  };

  const loadAttachments = async () => {
    setAttLoading(true);
    try { setAttachments(await userProjectService.taskAttachments.list(projectId, taskId)); }
    catch { toast.error('Failed to load attachments'); }
    finally { setAttLoading(false); }
  };

  useEffect(() => {
    if (!can('project_management', 'canViewProjects') && !can('project_management', 'canViewLinkedProjects')) {
      router.replace('/dashboard');
      return;
    }
    loadTask();
    loadActivity();
    loadComments();
    if (canViewTaskAttachments) loadAttachments(); else setAttLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadAttachments = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); failed++; continue; }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); failed++; continue; }
      try { await userProjectService.taskAttachments.upload(projectId, taskId, file); }
      catch { failed++; toast.error(`${file.name}: upload failed`); }
    }
    if (failed < files.length) toast.success('Attachment(s) uploaded');
    setUploading(false);
    loadAttachments();
  };

  const downloadAttachment = async (a: ProjectTaskAttachment) => {
    try { await userProjectService.taskAttachments.download(projectId, taskId, a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const deleteAttachment = async (a: ProjectTaskAttachment) => {
    if (!confirm(`Delete "${a.original_name}"?`)) return;
    try {
      await userProjectService.taskAttachments.remove(projectId, taskId, a.id);
      toast.success('Attachment deleted');
      setAttachments(prev => prev.filter(x => x.id !== a.id));
    } catch { toast.error('Failed to delete attachment'); }
  };

  // Comments have no realtime push — poll so a teammate's new comment shows
  // up without the viewer having to manually reload the page.
  useEffect(() => {
    const interval = setInterval(loadComments, 8000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload @mention candidates whenever the composer's resolved visibility
  // changes — internal vs client-facing have different eligible recipients.
  useEffect(() => {
    const visibility = isInternalCommentStaff ? 'internal' : 'client';
    setSelectedMentions([]);
    userProjectService.comments.mentionableUsers(projectId, visibility, taskId).then(setMentionCandidates).catch(() => setMentionCandidates([]));
  }, [projectId, isInternalCommentStaff]);

  const downloadCommentAttachment = async (commentId: number, a: { id: number; original_name: string }) => {
    try { await userProjectService.comments.attachments.download(projectId, commentId, a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      const visibility = isInternalCommentStaff ? 'internal' : 'client';
      const comment = await userProjectService.comments.add(projectId, commentBody.trim(), taskId, visibility, selectedMentions.map(m => m.user_id));
      if (commentFile) {
        try { await userProjectService.comments.attachments.upload(projectId, comment.id, commentFile); }
        catch { toast.error('Comment posted, but the attachment failed to upload.'); }
      }
      setCommentBody('');
      setCommentFile(null);
      setSelectedMentions([]);
      loadComments();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add comment');
    } finally { setPostingComment(false); }
  };

  const deleteComment = async (commentId: number) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await userProjectService.comments.remove(projectId, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete comment');
    }
  };

  // Own comment, or a moderator (this project's PM / canViewAllCompanyProjects
  // holder) — mirrors Api\User\ProjectCommentController::destroy()'s own check.
  const canDeleteComment = (c: ProjectComment) => {
    if (c.author_user?.id === me?.id) return true;
    return isInternalCommentStaff && (task?.project?.id === projectId && can('project_management', 'canViewAllCompanyProjects'));
  };

  const startEditComment = (c: ProjectComment) => {
    setEditingCommentId(c.id);
    setEditCommentBody(c.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentBody('');
  };

  const saveEditComment = async (commentId: number) => {
    if (!editCommentBody.trim()) return;
    try {
      const updated = await userProjectService.comments.update(projectId, commentId, editCommentBody.trim());
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      cancelEditComment();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update comment');
    }
  };

  const toggleCommentLike = async (c: ProjectComment) => {
    const wasLiked = !!c.liked_by_me;
    const prevCount = c.likes_count ?? 0;
    setComments(prev => prev.map(x => x.id === c.id
      ? { ...x, liked_by_me: !wasLiked, likes_count: prevCount + (wasLiked ? -1 : 1) }
      : x));
    try {
      const res = await userProjectService.comments.toggleLike(projectId, c.id);
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, liked_by_me: res.liked, likes_count: res.likes_count } : x));
    } catch (err: any) {
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, liked_by_me: wasLiked, likes_count: prevCount } : x));
      toast.error(err?.response?.data?.message || 'Failed to update like');
    }
  };

  // Pre-fills the reply box with "@Name " and pre-selects them in
  // replySelectedMentions, so the auto-tag sendReply() does is visible, not
  // just a silent background mention — looked up from the already-fetched
  // mentionCandidates (same list the main composer's picker uses). Skipped
  // for a self-reply.
  const startReply = (commentId: number) => {
    const parent = comments.find(c => c.id === commentId);
    const authorId = parent?.author_user && parent.author_user.id !== me?.id
      ? parent.author_user.id
      : (parent?.author_admin ? 0 : null); // 0 = Company Admin sentinel
    const candidate = authorId !== null ? mentionCandidates.find(u => u.user_id === authorId) : undefined;
    setReplyingToCommentId(commentId);
    setReplyBody(candidate ? `@${candidate.name} ` : '');
    setReplySelectedMentions(candidate ? [candidate] : []);
    setReplyMentionQuery(null);
  };
  const cancelReply = () => {
    setReplyingToCommentId(null);
    setReplyBody('');
    setReplySelectedMentions([]);
    setReplyMentionQuery(null);
  };
  const sendReply = async (parentId: number) => {
    if (!replyBody.trim()) return;
    setPostingReply(true);
    try {
      const parent = comments.find(c => c.id === parentId);
      const visibility = isInternalCommentStaff && parent?.visibility === 'client' ? 'client' : undefined;
      await userProjectService.comments.add(projectId, replyBody.trim(), taskId, visibility, replySelectedMentions.map(m => m.user_id), undefined, parentId);
      cancelReply();
      loadComments();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send reply');
    } finally { setPostingReply(false); }
  };

  // Typing '@' inside the reply box opens the same candidate picker the main
  // composer uses (mentionCandidates is already fetched once for the page).
  const handleReplyBodyChange = (value: string) => {
    setReplyBody(value);
    const at = value.lastIndexOf('@');
    if (at === -1 || /\s/.test(value.slice(at + 1))) { setReplyMentionQuery(null); return; }
    setReplyMentionQuery(value.slice(at + 1).toLowerCase());
  };

  const pickReplyMention = (u: MentionableUser) => {
    const at = replyBody.lastIndexOf('@');
    setReplyBody(replyBody.slice(0, at) + `@${u.name} `);
    setReplySelectedMentions(prev => prev.some(m => m.user_id === u.user_id) ? prev : [...prev, u]);
    setReplyMentionQuery(null);
  };

  const handleCommentBodyChange = (value: string) => {
    setCommentBody(value);
    const at = value.lastIndexOf('@');
    if (at === -1 || /\s/.test(value.slice(at + 1))) { setMentionQuery(null); return; }
    setMentionQuery(value.slice(at + 1).toLowerCase());
  };

  const pickMention = (u: MentionableUser) => {
    const at = commentBody.lastIndexOf('@');
    setCommentBody(commentBody.slice(0, at) + `@${u.name} `);
    setSelectedMentions(prev => prev.some(m => m.user_id === u.user_id) ? prev : [...prev, u]);
    setMentionQuery(null);
  };

  const pickAllMentions = () => {
    const at = commentBody.lastIndexOf('@');
    setCommentBody(commentBody.slice(0, at) + '@all ');
    setSelectedMentions(mentionCandidates);
    setMentionQuery(null);
  };

  if (loading) return <DashboardLayout title="Task"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!task) return null;

  const assignedTo = asRelation(task.assigned_to);
  const assignedByLabel = asRelation(task.assigned_by)?.name ?? 'Company Admin';

  return (
    <DashboardLayout title="Task">
      <div style={{ maxWidth: 900 }}>
        <button onClick={() => router.push(`/projects/${projectId}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b', marginBottom: 16,
        }}>← Back to Project</button>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {task.task_number && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <button
                    onClick={() => { navigator.clipboard.writeText(task.task_number!); toast.success('Task number copied'); }}
                    title="Copy task number"
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, fontWeight: 700,
                      color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6,
                      padding: '3px 8px', cursor: 'pointer', letterSpacing: 0.3,
                    }}
                  >
                    {task.task_number}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/task/${task.id}`); toast.success('Task link copied'); }}
                    title="Copy a link that opens for anyone (Admin, PM, Developer, etc.)"
                    style={{
                      fontSize: 11, fontWeight: 600, color: '#64748b', background: '#fff',
                      border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    🔗 Copy link
                  </button>
                </div>
              )}
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#0f172a' }}>{task.title}</h2>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Badge label={task.status} sc={TASK_SC[task.status]} />
                <Badge label={task.priority} sc={PRIORITY_SC[task.priority]} />
                {task.task_type && <Badge label={TASK_TYPE_LABEL[task.task_type] ?? task.task_type} />}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '20px 0' }}>
            <Field label="Assigned To" value={assignedTo ? `${assignedTo.name}${assignedTo.email ? ` (${assignedTo.email})` : ''}` : 'Unassigned'} />
            <Field label="Assigned By" value={assignedByLabel} />
            <Field label="Project" value={task.project?.name} />
            <Field label="Progress" value={`${task.progress ?? 0}%`} />
            <Field label="Start Date" value={fmtDate(task.start_date)} />
            <Field label="Due Date" value={fmtDate(task.due_date)} />
            <Field label="Estimated Hours" value={task.estimated_hours ?? '—'} />
          </div>

          {task.description && (
            <div style={{ marginBottom: 16 }}>
              <div style={lbl}>Description</div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.description}</div>
            </div>
          )}

          {task.notes && (
            <div>
              <div style={lbl}>Notes</div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.notes}</div>
            </div>
          )}
        </div>

        {/* ── Attachments — hidden entirely from anyone without canViewTaskAttachments (e.g. Seller) ── */}
        {canViewTaskAttachments && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Attachments ({attachments.length})</h3>
              {canUploadTaskAttachments && (
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
              )}
            </div>
            {attLoading ? (
              <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
            ) : attachments.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No attachments uploaded yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {attachments.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{a.original_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {a.file_type ?? 'file'} · {fmtFileSize(a.file_size)} · {a.uploaded_by_admin?.name ?? a.uploaded_by_user?.name ?? '—'} · {fmtDate(a.created_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {canDownloadTaskAttachments && (
                        <button onClick={() => downloadAttachment(a)} style={{
                          padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                          background: '#2563eb', color: '#fff', border: 'none',
                        }}>Download</button>
                      )}
                      {canDeleteTaskAttachments && (
                        <button onClick={() => deleteAttachment(a)} style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                          background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6,
                        }}>Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Comments — same WhatsApp-style conversation flow as the project detail page ── */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Comments ({comments.length})</div>

          <div style={{ maxHeight: 480, overflowY: 'auto', padding: '16px 20px', background: '#f7f8fa', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {comments.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No comments yet.</div>
            ) : (
              (() => {
                const commentById = new Map(comments.map(cm => [cm.id, cm]));
                return buildThreadOrder(comments).map(({ comment: c, depth }) => {
                const isMine = c.author_user?.id === me?.id;
                const senderName = c.author_user?.name ?? c.author_admin?.name ?? '—';
                const senderRole = c.author_admin ? 'Company Admin' : (c.author_user?.role_type ? ROLE_LABELS[c.author_user.role_type] ?? c.author_user.role_type : null);
                const parentComment = c.parent_comment_id ? commentById.get(c.parent_comment_id) : null;
                const parentSenderName = parentComment?.author_user?.name ?? parentComment?.author_admin?.name ?? '—';
                const indent = Math.min(depth, 3) * 22;
                return (
                  <div key={c.id} style={{
                    display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 8,
                    marginLeft: indent, paddingLeft: depth > 0 ? 10 : 0,
                    borderLeft: depth > 0 ? '2px solid #e2e8f0' : 'none',
                  }}>
                    {!isMine && (
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                        flexShrink: 0, marginTop: 16,
                      }}>{senderName.charAt(0).toUpperCase()}</div>
                    )}
                    <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                      {!isMine && (
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 3, marginLeft: 4 }}>
                          {senderName}{senderRole && <span style={{ fontWeight: 500, color: '#94a3b8' }}> · {senderRole}</span>}
                        </div>
                      )}
                      <div style={{
                        padding: '9px 13px',
                        borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMine ? '#2563eb' : '#fff',
                        color: isMine ? '#fff' : '#1e293b',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        border: isMine ? 'none' : '1px solid #f1f5f9',
                      }}>
                        {parentComment && (
                          <div style={{
                            borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,0.5)' : '#cbd5e1'}`,
                            borderRadius: 4, background: isMine ? 'rgba(255,255,255,0.12)' : '#f8fafc',
                            padding: '4px 8px', marginBottom: 6,
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: isMine ? '#dbeafe' : '#475569' }}>{parentSenderName}</div>
                            <div style={{
                              fontSize: 11.5, color: isMine ? 'rgba(255,255,255,0.85)' : '#64748b',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
                            }}>{parentComment.body}</div>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 4 }}>
                          {isInternalCommentStaff && c.visibility === 'client' && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: isMine ? '#dbeafe' : '#0891b2', background: isMine ? 'rgba(255,255,255,0.15)' : '#ecfeff', padding: '1px 6px', borderRadius: 8 }}>client-visible</span>
                          )}
                          {!isInternalCommentStaff && c.visibility === 'internal' && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: isMine ? '#ede9fe' : '#7c3aed', background: isMine ? 'rgba(255,255,255,0.15)' : '#f5f3ff', padding: '1px 6px', borderRadius: 8 }}>you were mentioned</span>
                          )}
                          {c.visibility === 'seller_reply' && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: isMine ? '#fde68a' : '#b45309', background: isMine ? 'rgba(255,255,255,0.15)' : '#fffbeb', padding: '1px 6px', borderRadius: 8 }}>private reply · Admin/PM only</span>
                          )}
                        </div>
                        {editingCommentId === c.id ? (
                          <div>
                            <input value={editCommentBody} onChange={e => setEditCommentBody(e.target.value)} style={{ ...inp, fontSize: 13, marginBottom: 6, color: '#0f172a' }} autoFocus />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => saveEditComment(c.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                              <button onClick={cancelEditComment} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                        )}
                        {c.attachments && c.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                            {c.attachments.map(a => (
                              <button key={a.id} onClick={() => downloadCommentAttachment(c.id, a)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                                borderRadius: 6, border: `1px solid ${isMine ? 'rgba(255,255,255,0.3)' : '#e2e8f0'}`,
                                background: isMine ? 'rgba(255,255,255,0.1)' : '#f8fafc', color: isMine ? '#fff' : '#2563eb',
                                fontSize: 12, cursor: 'pointer', width: 'fit-content',
                              }}>📎 {a.original_name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0 }}>
                        <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                          {fmtDate(c.created_at)}{c.updated_at && c.updated_at !== c.created_at && ' (edited)'}
                        </span>
                        <button
                          onClick={() => toggleCommentLike(c)}
                          title={c.liked_by && c.liked_by.length > 0 ? c.liked_by.join(', ') : 'Like'}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 10,
                            background: c.liked_by_me ? '#2563eb' : '#fff', border: `1px solid ${c.liked_by_me ? '#2563eb' : '#e2e8f0'}`,
                            color: c.liked_by_me ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: 10.5, fontWeight: 600,
                          }}
                        >
                          <ThumbIcon filled={c.liked_by_me} />
                          {!!c.likes_count && c.likes_count > 0 && <span>{c.likes_count}</span>}
                        </button>
                        {replyingToCommentId !== c.id && (
                          <button onClick={() => startReply(c.id)} title="Reply" style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, padding: 0 }}>Reply</button>
                        )}
                        {isMine && editingCommentId !== c.id && (
                          <button onClick={() => startEditComment(c)} title="Edit comment" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, padding: 0 }}>Edit</button>
                        )}
                        {canDeleteComment(c) && (
                          <button onClick={() => deleteComment(c.id)} title="Delete comment" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, padding: 0 }}>Delete</button>
                        )}
                      </div>
                      {replyingToCommentId === c.id && (
                        <div style={{ marginTop: 6, padding: 8, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', width: 320, maxWidth: '100%' }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                              <input
                                value={replyBody}
                                onChange={e => handleReplyBodyChange(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !postingReply) { e.preventDefault(); sendReply(c.id); } }}
                                placeholder={c.visibility === 'seller_reply' || (!isInternalCommentStaff && c.visibility === 'internal') ? 'Reply privately to Admin/PM…' : 'Reply…'}
                                style={{ ...inp, fontSize: 13 }}
                                autoFocus
                              />
                              {replyMentionQuery !== null && mentionCandidates.filter(u => u.name.toLowerCase().includes(replyMentionQuery)).length > 0 && (
                                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', zIndex: 20, maxHeight: 160, overflowY: 'auto' }}>
                                  {mentionCandidates.filter(u => u.name.toLowerCase().includes(replyMentionQuery)).map(u => (
                                    <div key={u.user_id} onClick={() => pickReplyMention(u)} style={{ padding: '7px 12px', fontSize: 12.5, color: '#334155', cursor: 'pointer' }}
                                      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                      @{u.name}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => sendReply(c.id)} disabled={postingReply} style={{ flexShrink: 0, padding: '9px 10px', borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: postingReply ? 'not-allowed' : 'pointer' }}>
                              {postingReply ? '…' : 'Send'}
                            </button>
                            <button onClick={cancelReply} style={{ flexShrink: 0, padding: '9px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
                });
              })()
            )}
          </div>

          <form onSubmit={addComment} style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#fff' }}>
            <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input value={commentBody} onChange={e => handleCommentBodyChange(e.target.value)} placeholder="Add a comment… (@ to mention)" style={{ ...inp, borderRadius: 20 }} />
                {mentionQuery !== null && (mentionCandidates.filter(u => u.name.toLowerCase().includes(mentionQuery)).length > 0 || (mentionCandidates.length > 0 && 'all'.startsWith(mentionQuery))) && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', zIndex: 20, maxHeight: 200, overflowY: 'auto' }}>
                    {mentionCandidates.length > 0 && 'all'.startsWith(mentionQuery) && (
                      <div onClick={pickAllMentions} style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, color: '#2563eb', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        @all — tag everyone ({mentionCandidates.length})
                      </div>
                    )}
                    {mentionCandidates.filter(u => u.name.toLowerCase().includes(mentionQuery)).map(u => (
                      <div key={u.user_id} onClick={() => pickMention(u)} style={{ padding: '7px 12px', fontSize: 12.5, color: '#334155', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        @{u.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label style={{ padding: '9px 12px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center' }} title="Attach a file">
                📎
                <input type="file" style={{ display: 'none' }} accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                  onChange={e => { setCommentFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              </label>
              <button type="submit" disabled={postingComment} style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: postingComment ? 'wait' : 'pointer', opacity: postingComment ? 0.7 : 1 }}>
                {postingComment ? 'Posting…' : 'Send'}
              </button>
            </div>
            {commentFile && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 12, color: '#334155' }}>
                <span>📎 {commentFile.name} <span style={{ color: '#94a3b8' }}>({(commentFile.size / 1024).toFixed(0)} KB)</span></span>
                <button type="button" onClick={() => setCommentFile(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
              </div>
            )}
          </form>
        </div>

        {/* ── History ── */}
        <div style={card}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>History ({activities.length})</h4>
          {activities.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No history yet.</div>
          ) : (
            <div style={{ position: 'relative' }}>
              {activities.map((a, idx) => {
                const dot = ACTIVITY_COLOR[a.type] ?? '#64748b';
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: idx < activities.length - 1 ? 16 : 0, position: 'relative' }}>
                    {idx < activities.length - 1 && (
                      <div style={{ position: 'absolute', left: 9, top: 20, bottom: 0, width: 2, background: '#e2e8f0' }} />
                    )}
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${dot}20`, border: `2px solid ${dot}`, flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{a.description}</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{a.causer_name || 'Unknown'}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDT(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
