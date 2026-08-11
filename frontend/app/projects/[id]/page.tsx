'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService, ProjectAttachment } from '@/lib/services/userProjectService';
import { Project, Task, TaskStatus, ProjectStatus, Priority, ProjectComment, ProductionQueueItem, MentionableUser, ProjectCommentAttachment } from '@/lib/services/adminProjectService';
import { can, getAuthUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { User } from '@/types';
import { Badge, StatCard, ThumbIcon, STATUS_SC, PRIORITY_SC, TASK_SC, PRODUCTION_SC, PRODUCTION_LABEL, TEAM_ROLE_LABEL, card, inp, lbl, fmtDate, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize, asRelation } from '@/components/admin/projects/shared';
import ProjectLifecycleActions from '@/components/admin/projects/ProjectLifecycleActions';
import { TASK_STATUS_LABELS, getAllowedNextTaskStatuses, taskStatusRequiresComment } from '@/lib/taskStatusFlow';
import toast from 'react-hot-toast';

const TASK_TYPE_LABEL: Record<string, string> = {
  general: 'General', production: 'Production', client_request: 'Client Request', internal: 'Internal',
};

// section heading — a lighter-weight variant of the bordered card header
// used elsewhere in this file, just for the h3 above a group of cards.
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' };

function assignedToId(t: Task): number | null {
  if (t.assigned_to == null) return null;
  return typeof t.assigned_to === 'object' ? t.assigned_to.id : t.assigned_to;
}

// Unwraps a relation-or-id field (qa_assigned_to/production_assigned_to come
// back as the loaded {id,name} relation on GET but must round-trip as a
// bare id on PUT) into the plain numeric id the update payload expects.
function relationId(v: number | { id: number } | null | undefined): number | undefined {
  if (v == null) return undefined;
  return typeof v === 'object' ? v.id : v;
}

function isOverdue(t: Task): boolean {
  return !!t.due_date && new Date(t.due_date) < new Date() && !['completed', 'cancelled'].includes(t.status);
}

// Groups a flat, newest-first comment list into proper reply threads — each
// root comment immediately followed by all of its replies (oldest first,
// recursively), instead of interleaving them chronologically with unrelated
// comments the way a flat list would. A reply whose parent isn't in this
// viewer's own visible set (e.g. an internal comment a Seller can't see) is
// treated as its own root — it has nothing visible to nest under.
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

export default function UserProjectDetailPage() {
  useAdminGuard();
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const me = getAuthUser() as User | null;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  // Every non-seller active company user, for the per-row "Assigned To"
  // reassignment dropdown — real source of truth (see the fetch below for why).
  const [assignableUsers, setAssignableUsers] = useState<{ id: number; name: string; role_type: string }[]>([]);
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentVisibleToClient, setAttachmentVisibleToClient] = useState(false);
  const [myProduction, setMyProduction] = useState<ProductionQueueItem[]>([]);

  const canEditProjects = can('project_management', 'canEditProjects');
  const canManageProjectInvoices = can('project_management', 'canManageProjectInvoices');
  const canEditTasks   = can('project_management', 'canEditTasks');
  const canCreateTasks = can('project_management', 'canCreateTasks');
  const canAssignTasks = can('project_management', 'canAssignTasks');
  // Seller-tier: submit a Client Requirement/General Request for PM review —
  // never an internal production/dev task, and status is always forced to
  // "review" server-side regardless of what's shown here.
  const canCreateLinkedTask = can('project_management', 'canCreateLinkedProjectTask');
  const canCreateAnyTask = canCreateTasks || canCreateLinkedTask;
  // A Developer/Team Member gets free rein on THEIR OWN task — full status
  // freedom and reassignment to anyone in the company — mirroring the
  // backend bypass in TaskStatusService::canTransition() and the
  // isDevOrTeamAssignee widening of Api\User\TaskController::update()'s
  // assigned_to rule. Neither canEditTasks nor canAssignTasks is required.
  const isDevOrTeamRole = me?.role_type === 'developer' || me?.role_type === 'team_member';
  // Mirrors Api\User\ProjectCommentController::isInternalStaff() — a Seller
  // following up on a linked project never sees/posts 'internal' notes, no
  // matter what permissions they hold.
  const isInternalCommentStaff = me?.role_type !== 'seller'
    && (can('project_management', 'canViewTasks') || can('project_management', 'canViewAllCompanyProjects'));
  const canAssignTeamResources = can('project_management', 'canAssignTeamResources');
  const isSeller = me?.role_type === 'seller';
  // A Seller never gets the full attachment list/delete — only ever to
  // view+download the "Visible to client" subset, no permission needed for
  // that narrower path (see Api\User\ProjectAttachmentController). Upload IS
  // permission-gated even for a Seller (canUploadProjectAttachments) — unlike
  // view/download/delete, store() has no seller-only bypass, it's a real
  // grant on their own linked project.
  const canViewAttachments   = isSeller || can('project_management', 'canViewProjectAttachments');
  const canUploadAttachments = can('project_management', 'canUploadProjectAttachments');
  const canDownloadAttachments = isSeller || can('project_management', 'canDownloadProjectAttachments');
  const canDeleteAttachments = !isSeller && can('project_management', 'canDeleteProjectAttachments');
  // Same permAny set the sidebar's "Production Queue" nav item already uses —
  // the section only appears for a role that has some production capability.
  const hasProductionAccess = ['canViewProductionQueue', 'canViewProductionDashboard', 'canStartProductionTasks', 'canSubmitProductionTasks']
    .some(k => can('project_management', k));
  const canStartProduction  = can('project_management', 'canStartProductionTasks');
  const canSubmitProduction = can('project_management', 'canSubmitProductionTasks');
  const canCompleteProjects   = can('project_management', 'canCompleteProjects');
  const canCloseProjects      = can('project_management', 'canCloseProjects');
  const canReopenProjects     = can('project_management', 'canReopenProjects');
  const canForceCloseProjects = can('project_management', 'canForceCloseProjects');
  const canActivateProjects   = can('project_management', 'canActivateProjects');

  // Task status-workflow permission set — passed to getAllowedNextTaskStatuses()
  // below to filter each status <select>'s options; the backend
  // (TaskStatusService::canTransition) is the real enforcement either way.
  const taskStatusPerms = [
    canEditTasks && 'canEditTasks',
    can('project_management', 'canMarkTaskBlocked') && 'canMarkTaskBlocked',
    can('project_management', 'canVerifyDeliverables') && 'canVerifyDeliverables',
    can('project_management', 'canAssignProductionTasks') && 'canAssignProductionTasks',
    can('project_management', 'canCompleteTasks') && 'canCompleteTasks',
    can('project_management', 'canReopenTasks') && 'canReopenTasks',
    can('project_management', 'canOverrideTaskStatus') && 'canOverrideTaskStatus',
  ].filter(Boolean) as string[];
  const isProjectPm = project?.project_manager?.id === me?.id;

  // Edit Project (inline form, toggled from the header)
  const [editingProject, setEditingProject] = useState(false);
  const [savingProject, setSavingProject]   = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; description: string; status: ProjectStatus; priority: Priority; start_date: string; deadline: string }>({
    name: '', description: '', status: 'planning', priority: 'medium', start_date: '', deadline: '',
  });

  // New comment form
  const [commentBody, setCommentBody]   = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentFile, setCommentFile]   = useState<File | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<MentionableUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // non-null while the '@' picker is open
  const [selectedMentions, setSelectedMentions] = useState<MentionableUser[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [replySelectedMentions, setReplySelectedMentions] = useState<MentionableUser[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      setProject(await userProjectService.getOne(id));
    } catch {
      toast.error('Project not found or not accessible');
      router.replace('/projects');
    } finally { setLoading(false); }
  };

  const loadComments = async () => {
    try { setComments(await userProjectService.comments.list(id)); } catch { /* silent */ }
  };

  const loadAttachments = async () => {
    try { setAttachments(await userProjectService.attachments.list(id)); } catch { /* silent */ }
  };

  // Invoices & billing
  const [linkInvoiceId, setLinkInvoiceId] = useState('');
  const [invoiceBusy, setInvoiceBusy]     = useState(false);
  const [showLinkInvoice, setShowLinkInvoice] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [newInvDesc, setNewInvDesc]   = useState('');
  const [newInvAmount, setNewInvAmount] = useState('');
  const [newInvDueDate, setNewInvDueDate] = useState('');

  const handleCreateProjectInvoice = async () => {
    if (!newInvDesc.trim() || !newInvAmount) { toast.error('Description and amount are required'); return; }
    setInvoiceBusy(true);
    try {
      await userProjectService.createInvoice(id, {
        due_date: newInvDueDate || null,
        items: [{ description: newInvDesc.trim(), quantity: 1, unit_price: Number(newInvAmount) }],
      });
      toast.success('Invoice created for project');
      setNewInvDesc(''); setNewInvAmount(''); setNewInvDueDate(''); setShowCreateInvoice(false);
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      toast.error(ex.response?.data?.message ?? 'Failed to create invoice');
    } finally { setInvoiceBusy(false); }
  };

  const handleLinkInvoice = async () => {
    if (!linkInvoiceId.trim()) return;
    setInvoiceBusy(true);
    try {
      await userProjectService.linkInvoice(id, Number(linkInvoiceId));
      toast.success('Invoice linked to project');
      setLinkInvoiceId(''); setShowLinkInvoice(false);
      load();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      toast.error(ex.response?.data?.message ?? 'Failed to link invoice');
    } finally { setInvoiceBusy(false); }
  };

  const handleUnlinkInvoice = async (invoiceId: number) => {
    if (!confirm('Unlink this invoice from the project?')) return;
    try {
      await userProjectService.unlinkInvoice(id, invoiceId);
      toast.success('Invoice unlinked');
      load();
    } catch { toast.error('Failed to unlink invoice'); }
  };

  const loadProduction = async () => {
    try {
      const items = await userProjectService.production.myQueue();
      setMyProduction(items.filter(it => it.task?.project_id === id));
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!can('project_management', 'canViewProjects') && !can('project_management', 'canViewLinkedProjects')) {
      router.replace('/dashboard');
      return;
    }
    load();
    loadComments();
    // No permission gate — unlike team.companyUsers() (which requires
    // canCreateTasks/canEditTasks/canAssignTeamResources/canViewTeamResources
    // and 403s for e.g. a Developer only granted canAssignTasks), this is the
    // reassignment dropdown's real source of truth below — always fetched.
    userProjectService.tasks.assignableUsers().then(setAssignableUsers).catch(() => {});
    if (canViewAttachments) loadAttachments();
    if (hasProductionAccess) loadProduction();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    userProjectService.comments.mentionableUsers(id, visibility).then(setMentionCandidates).catch(() => setMentionCandidates([]));
  }, [id, isInternalCommentStaff]);

  useEffect(() => {
    if (!project) return;
    setEditForm({
      name: project.name,
      description: project.description ?? '',
      status: project.status,
      priority: project.priority,
      start_date: project.start_date ? project.start_date.slice(0, 10) : '',
      deadline: project.deadline ? project.deadline.slice(0, 10) : '',
    });
  }, [project]);

  const saveProjectEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.name.trim()) { toast.error('Project name is required'); return; }
    setSavingProject(true);
    try {
      const updated = await userProjectService.update(id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        priority: editForm.priority,
        start_date: editForm.start_date || null,
        deadline: editForm.deadline || null,
      });
      setProject(updated);
      toast.success('Project updated');
      setEditingProject(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update project');
    } finally { setSavingProject(false); }
  };

  const uploadAttachments = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); failed++; continue; }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); failed++; continue; }
      try {
        // A Seller only ever sees the "visible to client" subset of
        // attachments (see canViewAttachments above) — uploading with the
        // box unchecked would make their own file invisible to them
        // immediately after upload, so force it true for a Seller.
        await userProjectService.attachments.upload(id, file, isSeller || attachmentVisibleToClient);
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
    try { await userProjectService.attachments.download(id, a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const downloadCommentAttachment = async (commentId: number, a: ProjectCommentAttachment) => {
    try { await userProjectService.comments.attachments.download(id, commentId, a.id, a.original_name); }
    catch { toast.error('Download failed'); }
  };

  const deleteAttachment = async (a: ProjectAttachment) => {
    if (!confirm(`Delete "${a.original_name}"?`)) return;
    try {
      await userProjectService.attachments.remove(id, a.id);
      toast.success('Attachment deleted');
      setAttachments(prev => prev.filter(x => x.id !== a.id));
    } catch { toast.error('Failed to delete attachment'); }
  };

  const updateTaskStatus = async (task: Task, status: TaskStatus) => {
    let comment: string | undefined;
    if (taskStatusRequiresComment(status)) {
      const input = window.prompt(status === 'blocked' ? 'Reason for marking this task Blocked:' : 'QA comment / reason for QA Failed:');
      if (!input || !input.trim()) { toast.error('A comment is required for this status change.'); return; }
      comment = input.trim();
    }
    // No production-user prompt here — production_assigned_to just carries
    // through whatever the task already has (set elsewhere, e.g. the task
    // detail page). Ready for QA no longer needs a QA user picked at all —
    // qa_assigned_to is unused/optional.
    const productionAssignedTo = relationId(task.production_assigned_to);
    try {
      await userProjectService.tasks.update(id, task.id, {
        status,
        ...(comment ? { comment } : {}),
        ...(status === 'ready_for_production' && productionAssignedTo ? { production_assigned_to: productionAssignedTo } : {}),
      });
      toast.success('Task updated');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update task');
    }
  };

  const updateTaskAssignee = async (task: Task, assignedTo: string) => {
    try {
      await userProjectService.tasks.update(id, task.id, { assigned_to: assignedTo ? Number(assignedTo) : null });
      toast.success('Task reassigned');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reassign task');
    }
  };

  const startProductionItem = async (item: ProductionQueueItem) => {
    try {
      await userProjectService.production.start(item.id);
      toast.success('Task started');
      loadProduction(); load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start task');
    }
  };

  const submitProductionItem = async (item: ProductionQueueItem) => {
    try {
      await userProjectService.production.submit(item.id);
      toast.success('Submitted for review');
      loadProduction(); load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit task');
    }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      const visibility = isInternalCommentStaff ? 'internal' : 'client';
      const comment = await userProjectService.comments.add(id, commentBody.trim(), undefined, visibility, selectedMentions.map(m => m.user_id));
      if (commentFile) {
        try { await userProjectService.comments.attachments.upload(id, comment.id, commentFile); }
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

  // General reply-threading — every comment can chain into a proper
  // conversation via parent_comment_id (any depth — a reply to a reply is
  // just another comment whose parent_comment_id points at that reply), so
  // conversations can run as long as needed instead of a flat message list.
  // Pre-fills the reply box with "@Name " and pre-selects them in
  // replySelectedMentions, so the auto-tag sendReply() does is visible, not
  // just a silent background mention — looked up from the already-fetched
  // mentionCandidates (same list the main composer's picker uses) so it's a
  // real, taggable candidate, not an ad-hoc guess. Skipped for a self-reply.
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
      // Internal staff replying inherits the parent's own visibility tier —
      // a reply to a client-facing comment must stay client-facing rather
      // than silently defaulting to 'internal' and vanishing from that
      // conversation. Leaving it undefined for an 'internal' or
      // 'seller_reply' parent is fine either way: the backend already
      // defaults an internal actor to 'internal', and forces 'seller_reply'
      // for anyone continuing that thread regardless of what's sent (see
      // store()'s isSellerThreadReply/isTaggedReply handling). A Seller's
      // own visibility is likewise decided entirely server-side.
      const parent = comments.find(c => c.id === parentId);
      const visibility = isInternalCommentStaff && parent?.visibility === 'client' ? 'client' : undefined;
      await userProjectService.comments.add(id, replyBody.trim(), undefined, visibility, replySelectedMentions.map(m => m.user_id), undefined, parentId);
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

  // Own comment, or this project's PM tier — mirrors
  // Api\User\ProjectCommentController::destroy()'s isProjectPmTier() check.
  // Deliberately keyed off role_type='project_manager', not just the
  // canViewAllCompanyProjects permission alone, so a Developer/Designer/QA/
  // Team Member/Seller holding it still can't delete someone else's comment.
  const canDeleteComment = (c: ProjectComment) => {
    if (c.author_user?.id === me?.id) return true;
    return project?.project_manager?.id === me?.id
      || (me?.role_type === 'project_manager' && can('project_management', 'canViewAllCompanyProjects'));
  };

  const deleteComment = async (commentId: number) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await userProjectService.comments.remove(id, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete comment');
    }
  };

  // Edit is always self-only (no moderator override, unlike delete above) —
  // matches Api\User\ProjectCommentController::update()'s own restraint.
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
      const updated = await userProjectService.comments.update(id, commentId, editCommentBody.trim());
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      cancelEditComment();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update comment');
    }
  };

  // Optimistic toggle — flips liked_by_me/likes_count immediately, then
  // reconciles with the server's actual count; reverts on failure.
  const toggleCommentLike = async (c: ProjectComment) => {
    const wasLiked = !!c.liked_by_me;
    const prevCount = c.likes_count ?? 0;
    setComments(prev => prev.map(x => x.id === c.id
      ? { ...x, liked_by_me: !wasLiked, likes_count: prevCount + (wasLiked ? -1 : 1) }
      : x));
    try {
      const res = await userProjectService.comments.toggleLike(id, c.id);
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, liked_by_me: res.liked, likes_count: res.likes_count } : x));
    } catch (err: any) {
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, liked_by_me: wasLiked, likes_count: prevCount } : x));
      toast.error(err?.response?.data?.message || 'Failed to update like');
    }
  };

  // Typing '@' opens the mention picker; selecting a candidate inserts
  // "@Name " into the text and tracks the id separately (sent as
  // mentioned_user_ids — the backend re-validates eligibility regardless).
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

  // "Tag All" — mentions every candidate currently eligible for this
  // comment's visibility tier in one click.
  const pickAllMentions = () => {
    const at = commentBody.lastIndexOf('@');
    setCommentBody(commentBody.slice(0, at) + '@all ');
    setSelectedMentions(mentionCandidates);
    setMentionQuery(null);
  };

  if (loading) return <DashboardLayout title="Project"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!project) return null;

  const tasks = project.tasks ?? [];
  const team = project.team_members ?? [];
  const projectManager = project.project_manager;
  const createdByName = asRelation(project.created_by)?.name ?? project.created_by_admin?.name ?? null;

  const totalTasks = tasks.length;
  const assignedTasksCount = tasks.filter(t => assignedToId(t) != null).length;
  const completedTasksCount = tasks.filter(t => t.status === 'completed').length;
  const pendingTasksCount = tasks.filter(t => !['completed', 'cancelled'].includes(t.status)).length;
  const overdueTasksCount = tasks.filter(isOverdue).length;

  const myTasks = me ? tasks.filter(t => assignedToId(t) === me.id) : [];

  return (
    <DashboardLayout title={project.name}>
      <div style={{ maxWidth: 1100 }}>
        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <button onClick={() => router.push('/projects')} style={{ background: 'none', border: 'none', padding: 0, marginBottom: 8, cursor: 'pointer', color: '#64748b', fontSize: 13 }}>
              ← Back to Projects
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>{project.name}</h1>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge label={project.status} sc={STATUS_SC[project.status]} />
              <Badge label={project.priority} sc={PRIORITY_SC[project.priority]} />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{project.progress ?? 0}% complete</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
              <span>Due: <strong style={{ color: '#334155' }}>{fmtDate(project.deadline)}</strong></span>
              <span>Manager: <strong style={{ color: '#334155' }}>
                {projectManager ? `${projectManager.name}${projectManager.role_type ? ` (${ROLE_LABELS[projectManager.role_type] ?? projectManager.role_type})` : ''}` : '—'}
              </strong></span>
              <span>Created by: <strong style={{ color: '#334155' }}>{createdByName ?? '—'}</strong></span>
              <span>Created: <strong style={{ color: '#334155' }}>{fmtDate(project.created_at)}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            <button onClick={() => router.push(`/projects/${id}/chat`)} style={{
              padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff',
              color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              💬 Chat
            </button>
            <ProjectLifecycleActions
              projectId={id}
              status={project.status}
              service={userProjectService}
              canComplete={canCompleteProjects}
              canClose={canCloseProjects}
              canReopen={canReopenProjects}
              canForceClose={canForceCloseProjects}
              canActivate={canActivateProjects}
              onUpdated={updated => setProject(updated)}
            />
            {canEditProjects && project.status !== 'closed' && (
              <button onClick={() => setEditingProject(v => !v)} style={{
                padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff',
                color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                {editingProject ? 'Cancel Edit' : 'Edit Project'}
              </button>
            )}
          </div>
        </div>

        {/* ── Inline Edit Project form ── */}
        {editingProject && canEditProjects && (
          <form onSubmit={saveProjectEdit} style={card}>
            <div style={sectionTitle}>Edit Project</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: '1 1 260px' }}>
                <label style={lbl}>Project Name</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inp} />
              </div>
              <div style={{ width: 160 }}>
                <label style={lbl}>Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as ProjectStatus }))} style={inp}>
                  {Object.keys(STATUS_SC).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div style={{ width: 140 }}>
                <label style={lbl}>Priority</label>
                <select value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value as Priority }))} style={inp}>
                  {Object.keys(PRIORITY_SC).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ width: 160 }}>
                <label style={lbl}>Start Date</label>
                <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} style={inp} />
              </div>
              <div style={{ width: 160 }}>
                <label style={lbl}>Due Date</label>
                <input type="date" value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Description</label>
              <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={savingProject} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: savingProject ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: savingProject ? 'not-allowed' : 'pointer' }}>
                {savingProject ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setEditingProject(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── A. Project Overview ── */}
        <div style={card}>
          <div style={sectionTitle}>Project Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Status</div><div style={{ marginTop: 6 }}><Badge label={project.status} sc={STATUS_SC[project.status]} /></div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Priority</div><div style={{ marginTop: 6 }}><Badge label={project.priority} sc={PRIORITY_SC[project.priority]} /></div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Progress</div><div style={{ fontSize: 13, color: '#0f172a', marginTop: 6, fontWeight: 600 }}>{project.progress ?? 0}%</div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Client</div><div style={{ fontSize: 13, color: '#0f172a', marginTop: 6 }}>{project.client?.name ?? '—'}</div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Start Date</div><div style={{ fontSize: 13, color: '#0f172a', marginTop: 6 }}>{fmtDate(project.start_date)}</div></div>
            <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Due Date</div><div style={{ fontSize: 13, color: '#0f172a', marginTop: 6 }}>{fmtDate(project.deadline)}</div></div>
          </div>
          {project.description && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #f1f5f9', fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{project.description}</div>
          )}
        </div>

        {/* ── Invoices & Billing — deposit/milestone/final/change-request
             invoices billed under this project, plus a running summary.
             Hidden entirely for anyone without canManageProjectInvoices. ── */}
        {canManageProjectInvoices && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={sectionTitle}>Invoices &amp; Billing</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowLinkInvoice(v => !v)} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#2563eb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  Link Existing Invoice
                </button>
                <button onClick={() => setShowCreateInvoice(v => !v)} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  + Create Invoice
                </button>
              </div>
            </div>

            {showLinkInvoice && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                <input value={linkInvoiceId} onChange={e => setLinkInvoiceId(e.target.value)} placeholder="Invoice ID" style={{ ...inp, width: 160 }} />
                <button onClick={handleLinkInvoice} disabled={invoiceBusy} style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: invoiceBusy ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: invoiceBusy ? 'not-allowed' : 'pointer' }}>
                  {invoiceBusy ? 'Linking…' : 'Link'}
                </button>
              </div>
            )}

            {showCreateInvoice && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={newInvDesc} onChange={e => setNewInvDesc(e.target.value)} placeholder="Description (e.g. Milestone 2)" style={{ ...inp, flex: '1 1 220px' }} />
                <input type="number" min={0} step="0.01" value={newInvAmount} onChange={e => setNewInvAmount(e.target.value)} placeholder="Amount" style={{ ...inp, width: 130 }} />
                <input type="date" value={newInvDueDate} onChange={e => setNewInvDueDate(e.target.value)} style={{ ...inp, width: 160 }} />
                <button onClick={handleCreateProjectInvoice} disabled={invoiceBusy} style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: invoiceBusy ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: invoiceBusy ? 'not-allowed' : 'pointer' }}>
                  {invoiceBusy ? 'Creating…' : 'Create'}
                </button>
              </div>
            )}

            {project.billing_summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
                <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total Invoiced</div><div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{project.billing_summary.total_invoiced.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
                <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total Paid</div><div style={{ fontSize: 15, fontWeight: 700, color: '#059669', marginTop: 4 }}>{project.billing_summary.total_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
                <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding</div><div style={{ fontSize: 15, fontWeight: 700, color: project.billing_summary.outstanding > 0 ? '#ea580c' : '#059669', marginTop: 4 }}>{project.billing_summary.outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
              </div>
            )}

            {(project.invoices ?? []).length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>No invoices linked to this project yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Invoice #', 'Amount', 'Status', 'Due Date', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(project.invoices ?? []).map(inv => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '9px 10px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{inv.invoice_number}</td>
                      <td style={{ padding: '9px 10px', fontSize: 13, color: '#475569' }}>{inv.currency} {inv.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '9px 10px' }}><Badge label={inv.status} sc={STATUS_SC[inv.status] ?? { bg: '#f1f5f9', color: '#64748b' }} /></td>
                      <td style={{ padding: '9px 10px', fontSize: 13, color: '#64748b' }}>{fmtDate(inv.due_date)}</td>
                      <td style={{ padding: '9px 10px', display: 'flex', gap: 10 }}>
                        <Link href={`/invoices/${inv.id}`} style={{ color: '#2563eb', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>View</Link>
                        <button onClick={() => handleUnlinkInvoice(inv.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12.5, fontWeight: 600 }}>Unlink</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── C. Tasks Summary / D. My Assigned Tasks — hidden entirely from
             anyone without real Task visibility (e.g. Seller) ── */}
        {isInternalCommentStaff && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={sectionTitle}>Tasks Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <StatCard label="Total" value={String(totalTasks)} color="#2563eb" />
                <StatCard label="Assigned" value={String(assignedTasksCount)} color="#7c3aed" />
                <StatCard label="Completed" value={String(completedTasksCount)} color="#059669" />
                <StatCard label="Pending" value={String(pendingTasksCount)} color="#d97706" />
                <StatCard label="Overdue" value={String(overdueTasksCount)} color="#dc2626" />
              </div>
            </div>

            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>My Assigned Tasks ({myTasks.length})</div>
              {myTasks.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No tasks assigned to you yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Title', 'Status', 'Priority', 'Due', 'Type', ''].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {myTasks.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '11px 16px', fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                          {t.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{t.task_number}</div>}
                          {t.title}
                        </td>
                        <td style={{ padding: '11px 16px' }}>
                          <select value={t.status} onChange={e => updateTaskStatus(t, e.target.value as TaskStatus)}
                            style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', background: '#fafafa' }}>
                            <option value={t.status}>{TASK_STATUS_LABELS[t.status] ?? t.status.replace(/_/g, ' ')}</option>
                            {getAllowedNextTaskStatuses(t.status, { isAssignee: true, isPm: isProjectPm, isAdmin: false, perms: taskStatusPerms }).map(s => (
                              <option key={s} value={s}>{TASK_STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '11px 16px' }}><Badge label={t.priority} sc={PRIORITY_SC[t.priority]} /></td>
                        <td style={{ padding: '11px 16px', fontSize: 12, color: isOverdue(t) ? '#dc2626' : '#64748b', fontWeight: isOverdue(t) ? 700 : 400 }}>{fmtDate(t.due_date)}</td>
                        <td style={{ padding: '11px 16px' }}>{t.task_type && <Badge label={TASK_TYPE_LABEL[t.task_type] ?? t.task_type} />}</td>
                        <td style={{ padding: '11px 16px' }}>
                          <button onClick={() => router.push(`/projects/${id}/tasks/${t.id}`)} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── E. Production Queue (only if the role has a production permission) ── */}
        {hasProductionAccess && (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Production Queue ({myProduction.length})</div>
            {myProduction.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No production tasks assigned yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Task', 'Status', 'Due', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myProduction.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '11px 16px', fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{item.task ? (item.task.task_number ? `${item.task.task_number} - ${item.task.title}` : item.task.title) : '—'}</td>
                      <td style={{ padding: '11px 16px' }}><Badge label={PRODUCTION_LABEL[item.status] ?? item.status} sc={PRODUCTION_SC[item.status]} /></td>
                      <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(item.task?.due_date)}</td>
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {canStartProduction && item.status === 'queued' && (
                            <button onClick={() => startProductionItem(item)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Start</button>
                          )}
                          {canSubmitProduction && item.status === 'in_progress' && (
                            <button onClick={() => submitProductionItem(item)} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#d97706', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Submit for Review</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Tasks (full list + create) — hidden entirely from anyone
             without real Task visibility (e.g. Seller) ── */}
        {isInternalCommentStaff && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>All Tasks ({tasks.length})</span>
            {canCreateAnyTask && project.status !== 'closed' && (
              <button onClick={() => router.push(`/projects/${id}/tasks/create`)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {canCreateTasks ? '+ Create Task' : '+ Submit Request'}
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No tasks yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Title', 'Assigned To', 'Status', 'Production', 'Due', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 16px' }}>
                      <button onClick={() => router.push(`/projects/${id}/tasks/${t.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                        {t.task_number && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 4, padding: '1px 5px', display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{t.task_number}</div>}
                        <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{t.title}</div>
                      </button>
                      {t.task_type && t.task_type !== 'general' && (
                        <div style={{ marginTop: 3 }}><Badge label={TASK_TYPE_LABEL[t.task_type] ?? t.task_type} /></div>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>
                      {(() => {
                        const isSelfTask = assignedToId(t) === me?.id;
                        if (!canEditTasks && !canAssignTasks && !isSelfTask) {
                          return asRelation(t.assigned_to)?.name ?? '—';
                        }
                        return (
                          <select value={t.assigned_to != null ? String(asRelation(t.assigned_to)?.id ?? t.assigned_to) : ''} onChange={e => updateTaskAssignee(t, e.target.value)}
                            style={{ padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', background: '#fafafa' }}>
                            <option value="">Unassigned</option>
                            {assignableUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '11px 16px' }}><Badge label={t.status} sc={TASK_SC[t.status]} /></td>
                    <td style={{ padding: '11px 16px' }}>
                      {t.production_queue ? <Badge label={PRODUCTION_LABEL[t.production_queue.status] ?? t.production_queue.status} sc={PRODUCTION_SC[t.production_queue.status]} /> : <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(t.due_date)}</td>
                    <td style={{ padding: '11px 16px' }}>
                      {(() => {
                        const isSelfTask = assignedToId(t) === me?.id;
                        const isDevOrTeamAssignee = isDevOrTeamRole && isSelfTask;
                        if (!canEditTasks && !isDevOrTeamAssignee) return null;
                        return (
                          <select value={t.status} onChange={e => updateTaskStatus(t, e.target.value as TaskStatus)}
                            style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', background: '#fafafa' }}>
                            <option value={t.status}>{TASK_STATUS_LABELS[t.status] ?? t.status.replace(/_/g, ' ')}</option>
                            {getAllowedNextTaskStatuses(t.status, { isAssignee: isSelfTask, isPm: isProjectPm, isAdmin: false, perms: taskStatusPerms, isDevOrTeamAssignee }).map(s => (
                              <option key={s} value={s}>{TASK_STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}

        {/* ── B. Assigned People ── */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Assigned People ({team.length})</span>
            {canAssignTeamResources && project.status !== 'closed' && (
              <Link href={`/projects/team?project=${id}`} style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>Manage Team →</Link>
            )}
          </div>
          {team.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No team members assigned yet.</div>
          ) : (
            <div style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {team.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f8fafc', borderRadius: 20, border: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{m.user?.name ?? '—'}</span>
                  {/* A team member's actual job (role_type, e.g. "Seller") is more
                      useful here than the generic 4-value project role_in_project —
                      fall back to the latter only if the user has no role_type set,
                      same pattern as the Admin Team page. */}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {(m.user?.role_type && ROLE_LABELS[m.user.role_type]) || TEAM_ROLE_LABEL[m.role_in_project] || m.role_in_project}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── F. Attachments ── */}
        {canViewAttachments && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Project Attachments ({attachments.length})</h3>
              {canUploadAttachments && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {!isSeller && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                      <input
                        type="checkbox" checked={attachmentVisibleToClient}
                        onChange={e => setAttachmentVisibleToClient(e.target.checked)}
                      />
                      Visible to client
                    </label>
                  )}
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
              )}
            </div>
            {attachments.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No attachments available.</div>
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
                      {canDownloadAttachments && (
                        <button onClick={() => downloadAttachment(a)} style={{
                          padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                          background: '#2563eb', color: '#fff', border: 'none',
                        }}>Download</button>
                      )}
                      {canDeleteAttachments && (
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

        {/* ── G. Comments / Activity — chat-style conversation ── */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>Comments &amp; Activity ({comments.length})</div>

          {/* Message thread — oldest at top, newest at bottom, like a chat */}
          <div style={{ maxHeight: 480, overflowY: 'auto', padding: '16px 20px', background: '#f7f8fa', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {comments.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No activity yet.</div>
            ) : (
              (() => {
                const commentById = new Map(comments.map(cm => [cm.id, cm]));
                return buildThreadOrder(comments).map(({ comment: c, depth }) => {
                const isMine = c.author_user?.id === me?.id;
                const senderName = c.author_user?.name ?? c.author_admin?.name ?? '—';
                const senderRole = c.author_admin ? 'Company Admin' : (c.author_user?.role_type ? ROLE_LABELS[c.author_user.role_type] ?? c.author_user.role_type : null);
                // Only rendered when the parent is actually in this viewer's
                // own visible set — if it's an internal comment they can't
                // see, the reply just shows as a standalone message instead
                // of leaking who/what it was replying to.
                const parentComment = c.parent_comment_id ? commentById.get(c.parent_comment_id) : null;
                const parentSenderName = parentComment?.author_user?.name ?? parentComment?.author_admin?.name ?? '—';
                // Grouped replies nest under their parent (capped at 3 visual
                // levels so a very deep thread doesn't run off the page) with
                // a thin connecting rail on the left, like a Slack thread.
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
                            paddingLeft: 8, marginBottom: 6, borderRadius: 4,
                            background: isMine ? 'rgba(255,255,255,0.12)' : '#f8fafc',
                            padding: '4px 8px',
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
                          {/* Only ever reached for a Seller when the backend let this
                              one internal comment through because they're tagged in
                              it (see Api\User\ProjectCommentController::index()) —
                              without this label it would look like an internal
                              comment leaked in for no reason. */}
                          {!isInternalCommentStaff && c.visibility === 'internal' && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: isMine ? '#ede9fe' : '#7c3aed', background: isMine ? 'rgba(255,255,255,0.15)' : '#f5f3ff', padding: '1px 6px', borderRadius: 8 }}>you were mentioned</span>
                          )}
                          {/* A Seller's reply to that tagged comment — visible only to
                              Company Admin/PM and the Seller who wrote it, never the
                              rest of the internal team (see index()'s seller_reply
                              exclusion) — labeled so it's clear this isn't a normal
                              internal or client-facing comment. */}
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

          {/* Composer — pinned below the thread, like a chat input bar */}
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
                <span>📎 {commentFile.name} <span style={{ color: '#94a3b8' }}>({fmtFileSize(commentFile.size)})</span></span>
                <button type="button" onClick={() => setCommentFile(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
              </div>
            )}
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
