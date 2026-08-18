'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Project, ProjectComment, ProjectCommentAttachment, MentionableUser, ProjectUserOption, ActivityItem } from '@/lib/services/adminProjectService';
import { getAuthUser } from '@/lib/auth';
import { ROLE_LABELS, roleDisplayLabel } from '@/lib/roleUtils';
import { Admin } from '@/types';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import ProjectLifecycleActions from '@/components/admin/projects/ProjectLifecycleActions';
import { card, lbl, inp, Badge, ThumbIcon, STATUS_SC, PRIORITY_SC, fmtDate, ALLOWED_ATTACHMENT_TYPES, fmtFileSize, asRelation, DRAFT_HINT, DraftNotice } from '@/components/admin/projects/shared';

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

function activityText(item: ActivityItem): string {
  if (item.type === 'comment') return `${item.author ?? 'Unknown'} commented: ${item.body ?? ''}`;
  if (item.description) return item.description;
  return item.entity_type === 'Task' ? `Task ${item.action ?? 'updated'}` : `Project ${item.action ?? 'updated'}`;
}

function errorMessage(err: unknown, fallback: string): string {
  const ex = err as { response?: { data?: { message?: string } } };
  return ex.response?.data?.message ?? fallback;
}

export default function ProjectOverviewPage() {
  useModuleGuard('projects');
  const me = getAuthUser() as Admin | null;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentFile, setCommentFile] = useState<File | null>(null);
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


  // Assign/Switch Seller — Company Admin always sees this, no permission gate.
  const [sellers, setSellers] = useState<ProjectUserOption[]>([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [showChangeSeller, setShowChangeSeller] = useState(false);
  const [sellerSelectId, setSellerSelectId] = useState('');
  const [sellerReason, setSellerReason] = useState('');
  const [sellerBusy, setSellerBusy] = useState(false);

  const handleAssignSeller = async () => {
    if (!sellerSelectId) return;
    setSellerBusy(true);
    try {
      await adminProjectService.assignSeller(Number(id), Number(sellerSelectId), sellerReason.trim() || undefined);
      // Full refetch, not setProject(response) — assignSeller() only returns
      // the project with `seller` eager-loaded, which would otherwise wipe
      // tasks/team/invoices/progress etc. from this page's state until a
      // manual reload, same root cause as the Projects list PM-dropdown bug.
      await load();
      toast.success('Seller updated');
      setShowChangeSeller(false);
      setSellerReason('');
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      toast.error(ex.response?.data?.message ?? 'Failed to update seller');
    } finally {
      setSellerBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const p = await adminProjectService.getOne(Number(id));
      setProject(p);
      setComments(await adminProjectService.comments.list(Number(id)).catch(() => []));
      setRecentActivity(await adminProjectService.activity(Number(id)).catch(() => []));
      setSellersLoading(true);
      adminProjectService.projectUsers(p.company_id)
        .then(d => setSellers(d.sellers ?? []))
        .catch(() => setSellers([]))
        .finally(() => setSellersLoading(false));
    } catch {
      toast.error('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try { setComments(await adminProjectService.comments.list(Number(id))); } catch { /* silent */ }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setPostingComment(true);
    try {
      const comment = await adminProjectService.comments.add(Number(id), commentBody.trim(), undefined, 'internal', selectedMentions.map(m => m.user_id));
      if (commentFile) {
        try { await adminProjectService.comments.attachments.upload(Number(id), comment.id, commentFile); }
        catch { toast.error('Comment posted, but the attachment failed to upload.'); }
      }
      setCommentBody('');
      setCommentFile(null);
      setSelectedMentions([]);
      loadComments();
    } catch {
      toast.error('Failed to add comment');
    } finally {
      setPostingComment(false);
    }
  };

  // Company Admin can delete any comment — no authorship/moderator
  // restriction, matching Api\Admin\ProjectCommentController::destroy().
  const deleteComment = async (commentId: number) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await adminProjectService.comments.remove(Number(id), commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  // Edit is self-only even for Admin — matches Api\Admin\ProjectCommentController::update()
  // (Admin can delete anyone's comment, but only edit their own).
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
      const updated = await adminProjectService.comments.update(Number(id), commentId, editCommentBody.trim());
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      cancelEditComment();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update comment'));
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
      const res = await adminProjectService.comments.toggleLike(Number(id), c.id);
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, liked_by_me: res.liked, likes_count: res.likes_count } : x));
    } catch (err: unknown) {
      setComments(prev => prev.map(x => x.id === c.id ? { ...x, liked_by_me: wasLiked, likes_count: prevCount } : x));
      toast.error(errorMessage(err, 'Failed to update like'));
    }
  };

  // General reply-threading — every comment (including seller_reply ones)
  // can chain into a proper, arbitrarily long conversation via
  // parent_comment_id — a reply to a reply is just another comment whose
  // parent_comment_id points at that reply. Admin bypasses every permission
  // check, so the reply just inherits the parent's own visibility tier
  // directly; a seller_reply parent forces 'seller_reply' again server-side
  // regardless of what's sent here (see store()'s isSellerThreadReply).
  // Pre-fills the reply box with "@Name " and pre-selects them in
  // replySelectedMentions, so the auto-tag sendReply() does is visible, not
  // just a silent background mention — looked up from the already-fetched
  // mentionCandidates (same list the main composer's picker uses) so it's a
  // real, taggable candidate. A User's comment only, since Admin has no "tag
  // Company Admin" concept (Admin authoring the reply already IS Admin).
  const startReply = (commentId: number) => {
    const parent = comments.find(c => c.id === commentId);
    const candidate = parent?.author_user ? mentionCandidates.find(u => u.user_id === parent.author_user!.id) : undefined;
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
      const visibility = parent?.visibility === 'client' ? 'client' : undefined;
      await adminProjectService.comments.add(Number(id), replyBody.trim(), undefined, visibility, replySelectedMentions.map(m => m.user_id), undefined, parentId);
      cancelReply();
      loadComments();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to send reply'));
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

  // "Tag All" — mentions every candidate currently in the picker in one click.
  const pickAllMentions = () => {
    const at = commentBody.lastIndexOf('@');
    setCommentBody(commentBody.slice(0, at) + '@all ');
    setSelectedMentions(mentionCandidates);
    setMentionQuery(null);
  };

  const downloadCommentAttachment = async (commentId: number, a: ProjectCommentAttachment) => {
    try {
      await adminProjectService.comments.attachments.download(Number(id), commentId, a.id, a.original_name);
    } catch { toast.error('Download failed'); }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Comments have no realtime push — poll so a sub-user's new comment shows
  // up without the admin having to manually reload the page.
  useEffect(() => {
    const interval = setInterval(loadComments, 8000);
    return () => clearInterval(interval);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin comments here are always 'internal' (no client-facing toggle on
  // this page today), so mention candidates are fetched for that tier only.
  useEffect(() => {
    adminProjectService.comments.mentionableUsers(Number(id), 'internal').then(setMentionCandidates).catch(() => setMentionCandidates([]));
  }, [id]);

  const remove = async () => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    try {
      await adminProjectService.remove(Number(id));
      toast.success('Project deleted');
      router.push('/admin/projects');
    } catch { toast.error('Failed to delete project'); }
  };

  if (loading) return (<DashboardLayout title="Project"><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>);
  if (!project) return (<DashboardLayout title="Project"><div style={{ padding: 60, textAlign: 'center', color: '#dc2626' }}>Project not found.</div></DashboardLayout>);

  // See the Seller-side twin (app/projects/[id]/page.tsx) — a draft only
  // allows SETUP; everything that produces work stays disabled until Activate.
  const isDraft = project.status === 'draft';

  return (
    <DashboardLayout title="Project">
      {isDraft && <DraftNotice style={{ marginBottom: 16 }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push('/admin/projects')} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>{project.name}</h2>
            <Badge label={project.status} sc={STATUS_SC[project.status]} />
            <Badge label={project.priority} sc={PRIORITY_SC[project.priority]} />
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>{project.client?.name ?? 'No client linked'}</p>
        </div>
        <ProjectLifecycleActions
          projectId={Number(id)}
          status={project.status}
          service={adminProjectService}
          canComplete canClose canReopen canForceClose canActivate
          canApproveDelivery
          deliveryStatus={project.delivery_status}
          deliveryFileName={project.delivery_file_name}
          onUpdated={updated => setProject(updated)}
        />
        {project.status !== 'closed' && (
          <button onClick={() => router.push(`/admin/projects/${id}/edit`)} style={{
            padding: '8px 16px', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Edit</button>
        )}
        <button onClick={remove} style={{
          padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca',
          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>Delete</button>
      </div>

      <ProjectTabs projectId={Number(id)} active="overview" isDraft={isDraft} />

      <div>
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>Details</h3>
            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px', lineHeight: 1.6 }}>{project.description || 'No description.'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={lbl}>{project.project_manager?.role_type === 'seller' ? 'Creator' : 'Manager'}</label><div style={{ fontSize: 13 }}>
                {project.project_manager
                  ? `${project.project_manager.name}${project.project_manager.role_type ? ` (${roleDisplayLabel(project.project_manager)})` : ''}`
                  : '—'}
              </div></div>
              <div>
                <label style={lbl}>Seller</label>
                <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{project.seller?.name ?? '—'}</span>
                  {project.status !== 'closed' && (
                    <button onClick={() => { setSellerSelectId(project.seller ? String(project.seller.id) : ''); setShowChangeSeller(v => !v); }} style={{
                      background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0,
                    }}>{project.seller ? 'Switch' : 'Assign'}</button>
                  )}
                </div>
              </div>
              <div><label style={lbl}>Created By</label><div style={{ fontSize: 13 }}>{asRelation(project.created_by)?.name ?? project.created_by_admin?.name ?? 'Unknown'}</div></div>
              <div><label style={lbl}>Created Date</label><div style={{ fontSize: 13 }}>{fmtDate(project.created_at)}</div></div>
              <div><label style={lbl}>Start Date</label><div style={{ fontSize: 13 }}>{fmtDate(project.start_date)}</div></div>
              <div><label style={lbl}>Deadline</label><div style={{ fontSize: 13, color: project.is_overdue ? '#dc2626' : '#1e293b', fontWeight: project.is_overdue ? 700 : 400 }}>{fmtDate(project.deadline)}</div></div>
              <div><label style={lbl}>Budget</label><div style={{ fontSize: 13 }}>{project.budget ? `$${Number(project.budget).toLocaleString()}` : '—'}</div></div>
              <div><label style={lbl}>Invoice</label><div style={{ fontSize: 13 }}>{project.invoice ? `#${project.invoice.invoice_number}` : '—'}</div></div>
            </div>

            {showChangeSeller && (
              <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <label style={lbl}>{project.seller ? 'Switch Seller' : 'Assign Seller'}</label>
                <select value={sellerSelectId} onChange={e => setSellerSelectId(e.target.value)} disabled={sellersLoading} style={{ ...inp, marginBottom: 10 }}>
                  <option value="">Select a seller…</option>
                  {sellers.map(s => <option key={s.user_id} value={s.user_id}>{s.name} ({s.email})</option>)}
                </select>
                {!sellersLoading && sellers.length === 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: -4, marginBottom: 10 }}>
                    No active sellers found for this company.
                  </div>
                )}
                {project.seller && (
                  <input value={sellerReason} onChange={e => setSellerReason(e.target.value)} placeholder="Reason for switching (optional)" style={{ ...inp, marginBottom: 10 }} />
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleAssignSeller} disabled={sellerBusy || !sellerSelectId} style={{
                    padding: '8px 16px', borderRadius: 7, border: 'none',
                    background: sellerBusy || !sellerSelectId ? '#93c5fd' : '#2563eb', color: '#fff',
                    fontSize: 13, fontWeight: 600, cursor: sellerBusy || !sellerSelectId ? 'not-allowed' : 'pointer',
                  }}>{sellerBusy ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => { setShowChangeSeller(false); setSellerReason(''); }} style={{
                    padding: '8px 16px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer',
                  }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <label style={lbl}>Progress — {project.progress ?? 0}%</label>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${project.progress ?? 0}%`, background: '#2563eb', borderRadius: 4 }} />
              </div>
            </div>
          </div>

          {/* Invoices & Billing — every invoice billed under this project
              (deposit/milestone/final/change-request), plus a running
              summary. Distinct from the single "Invoice" field in Details
              above (this project's originating invoice). */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Invoices &amp; Billing</h3>
            </div>

            {project.billing_summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
                <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total Invoiced</div><div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{project.billing_summary.total_invoiced.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
                <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total Paid</div><div style={{ fontSize: 15, fontWeight: 700, color: '#059669', marginTop: 4 }}>{project.billing_summary.total_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
                <div><div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding</div><div style={{ fontSize: 15, fontWeight: 700, color: project.billing_summary.outstanding > 0 ? '#ea580c' : '#059669', marginTop: 4 }}>{project.billing_summary.outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
              </div>
            )}

            {(project.invoices ?? []).length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No invoices linked to this project yet.</div>
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
                        <button onClick={() => router.push(`/invoices/${inv.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 12.5, fontWeight: 600, padding: 0 }}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>History</h3>
              <button onClick={() => router.push(`/admin/projects/${id}/activity`)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>View all</button>
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentActivity.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>No history yet.</div>
              ) : (
                recentActivity.slice(0, 6).map((item, index) => (
                  <div key={`${item.created_at}-${index}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.type === 'comment' ? '#2563eb' : '#64748b', marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.45 }}>{activityText(item)}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{fmtDate(item.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0, padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>Comments ({comments.length})</h3>

            {/* Message thread — oldest at top, newest at bottom, like a chat */}
            <div style={{ maxHeight: 480, overflowY: 'auto', padding: '16px 20px', background: '#f7f8fa', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {comments.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No comments yet.</div>
              ) : (
                (() => {
                  const commentById = new Map(comments.map(cm => [cm.id, cm]));
                  return buildThreadOrder(comments).map(({ comment: c, depth }) => {
                  const isMine = c.author_admin?.id === me?.id;
                  const senderName = c.author_admin?.name ?? c.author_user?.name ?? 'Unknown';
                  const senderRole = c.author_admin ? 'Company Admin' : (c.author_user?.role_type ? ROLE_LABELS[c.author_user.role_type] ?? c.author_user.role_type : null);
                  const parentComment = c.parent_comment_id ? commentById.get(c.parent_comment_id) : null;
                  const parentSenderName = parentComment?.author_admin?.name ?? parentComment?.author_user?.name ?? 'Unknown';
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
                          {/* A Seller's reply to the one internal comment they were
                              tagged into — visible only to Company Admin/PM, never
                              the rest of the internal team (see index()'s
                              seller_reply exclusion for non-PM staff). */}
                          {c.visibility === 'seller_reply' && (
                            <div style={{ marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: isMine ? '#fde68a' : '#b45309', background: isMine ? 'rgba(255,255,255,0.15)' : '#fffbeb', padding: '1px 6px', borderRadius: 8 }}>private reply · Admin/PM only</span>
                            </div>
                          )}
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
                          {isMine && editingCommentId !== c.id && (
                            <button onClick={() => startEditComment(c)} title="Edit comment" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, padding: 0 }}>Edit</button>
                          )}
                          {replyingToCommentId !== c.id && (
                            <button onClick={() => startReply(c.id)} title="Reply" style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, padding: 0 }}>Reply</button>
                          )}
                          <button onClick={() => deleteComment(c.id)} title="Delete comment" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, padding: 0 }}>Delete</button>
                        </div>
                        {replyingToCommentId === c.id && (
                          <div style={{ marginTop: 6, padding: 8, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', width: 320, maxWidth: '100%' }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                <input
                                  value={replyBody}
                                  onChange={e => handleReplyBodyChange(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !postingReply) { e.preventDefault(); sendReply(c.id); } }}
                                  placeholder="Reply…"
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
              {isDraft && <DraftNotice style={{ marginBottom: 10 }} />}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    value={commentBody} onChange={e => handleCommentBodyChange(e.target.value)}
                    disabled={isDraft} title={isDraft ? DRAFT_HINT : undefined}
                    placeholder={isDraft ? 'Comments open up once the project is activated' : 'Write a comment… (@ to mention)'}
                    style={{ ...inp, borderRadius: 20, background: isDraft ? '#f8fafc' : '#fff' }}
                  />
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
                <label title={isDraft ? DRAFT_HINT : 'Attach a file'} style={{ padding: '9px 12px', borderRadius: '50%', border: '1px solid #e2e8f0', background: isDraft ? '#f8fafc' : '#fff', cursor: isDraft ? 'not-allowed' : 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', opacity: isDraft ? 0.5 : 1 }}>
                  📎
                  <input type="file" style={{ display: 'none' }} disabled={isDraft} accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                    onChange={e => { setCommentFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                </label>
                <button type="submit" disabled={postingComment || isDraft} title={isDraft ? DRAFT_HINT : undefined} style={{
                  padding: '9px 20px', borderRadius: 20, border: 'none', background: isDraft ? '#cbd5e1' : '#2563eb', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: isDraft ? 'not-allowed' : (postingComment ? 'wait' : 'pointer'), opacity: postingComment ? 0.7 : 1,
                }}>Send</button>
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
