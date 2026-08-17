'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import toast from 'react-hot-toast';
import { getAuthUser } from '@/lib/auth';
import { User } from '@/types';
import { inp, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize, DRAFT_HINT, DraftNotice } from '@/components/admin/projects/shared';
import {
  userProjectMessengerService, ProjectMessengerThread, ProjectMessengerEligibleUser, ProjectMessengerParticipant,
} from '@/lib/services/projectMessengerService';
import { userProjectService } from '@/lib/services/userProjectService';
import { ChatMessage } from '@/lib/services/adminProjectService';

function roleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtShort(d: string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

function errorMessage(err: unknown, fallback: string): string {
  const ex = err as { response?: { data?: { message?: string } } };
  return ex.response?.data?.message ?? fallback;
}

// Project Chat — one thread per project, no groups/direct chats, no
// conversation switching (see Api\User\ProjectMessengerController and
// ProjectChatService). Every Company employee formally tied to the project
// plus the Project Manager/Company Admin can be in this single conversation;
// a Seller only ever joins if a PM/Admin explicitly adds them.
export default function ProjectChatPage() {
  useAdminGuard();
  const me = getAuthUser() as User | null;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);
  // Every role here can only ever delete their own message (plain ownership
  // check, enforced server-side too). Company Admin's unrestricted delete
  // authority only applies from the Admin panel's own chat page.

  const [projectName, setProjectName] = useState('');
  // A draft project rejects messages server-side (ProjectMessengerController::
  // send()'s isDraft() guard) — the composer locks to match, and re-opens
  // by itself once the project is activated.
  const [isDraft, setIsDraft] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [thread, setThread] = useState<ProjectMessengerThread | null>(null);
  const [canManageParticipants, setCanManageParticipants] = useState(false);
  // Literal PM only. Delegated participant managers still cannot @mention a
  // Seller unless they are the actual PM, matching the backend send() gate.
  const [isLiteralPm, setIsLiteralPm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const [eligibleUsers, setEligibleUsers] = useState<ProjectMessengerEligibleUser[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [addParticipantId, setAddParticipantId] = useState<string>('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<number[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [showInvitePm, setShowInvitePm] = useState(false);
  const [eligiblePms, setEligiblePms] = useState<{ id: number; name: string }[]>([]);
  const [invitePmId, setInvitePmId] = useState('');
  const [invitingPm, setInvitingPm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fetchedEligibleRef = useRef(false);
  const fetchedEligiblePmsRef = useRef(false);

  const loadMessages = () => {
    userProjectMessengerService.messages(projectId).then(r => setMessages(r.messages)).catch(() => {});
  };

  const loadThread = () => {
    userProjectMessengerService.show(projectId)
      .then(r => {
        setThread(r.thread); setCanManageParticipants(r.can_manage_participants); setIsLiteralPm(r.is_literal_pm); setNoAccess(false); loadMessages();
        // eligible-participants is permission-gated server-side and only used
        // by the Manage Participants picker.
        // Fetched once (not on every 8s poll) since the eligible pool rarely changes mid-session.
        if (r.can_manage_participants && !fetchedEligibleRef.current) {
          fetchedEligibleRef.current = true;
          userProjectMessengerService.eligibleParticipants(projectId).then(setEligibleUsers).catch(() => {});
        }
      })
      .catch(() => setNoAccess(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadThread();
    userProjectService.getOne(projectId).then(p => {
      setProjectName(p.name);
      setClientId(p.client_id);
      setIsDraft(p.status === 'draft');
      const seller = p.seller_id;
      setSellerId(seller == null ? null : (typeof seller === 'object' ? seller.id : seller));
    }).catch(() => {});
    const interval = setInterval(() => { loadThread(); }, 8000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const addParticipant = async () => {
    if (!addParticipantId) return;
    try {
      await userProjectMessengerService.addParticipant(projectId, Number(addParticipantId));
      setAddParticipantId('');
      loadThread();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to add participant'));
    }
  };

  const removeParticipant = async (userId: number) => {
    if (!confirm('Remove this participant from the chat?')) return;
    try {
      await userProjectMessengerService.removeParticipant(projectId, userId);
      loadThread();
    } catch { toast.error('Failed to remove participant'); }
  };

  const toggleMute = async () => {
    try { await userProjectMessengerService.toggleMute(projectId); loadThread(); }
    catch { toast.error('Failed to update mute state'); }
  };

  const toggleInvitePm = () => {
    setShowInvitePm(v => !v);
    if (!fetchedEligiblePmsRef.current) {
      fetchedEligiblePmsRef.current = true;
      userProjectMessengerService.eligiblePms(projectId).then(setEligiblePms).catch(() => {});
    }
  };

  const invitePm = async () => {
    if (!invitePmId) return;
    setInvitingPm(true);
    try {
      await userProjectMessengerService.invitePm(projectId, Number(invitePmId));
      toast.success('Project Manager invited');
      setInvitePmId('');
      setShowInvitePm(false);
      loadThread();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to invite Project Manager'));
    } finally { setInvitingPm(false); }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return;
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); return; }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); return; }
    }
    setSending(true);
    try {
      await userProjectMessengerService.send(projectId, text.trim(), selectedMentions, file);
      setText('');
      setFile(null);
      setSelectedMentions([]);
      loadMessages();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to send message'));
    } finally { setSending(false); }
  };

  const deleteMessage = async (messageId: number) => {
    if (!confirm('Delete this message?')) return;
    try {
      await userProjectMessengerService.deleteMessage(projectId, messageId);
      setMessages(prev => prev.map(m => m.id === messageId
        ? { ...m, is_deleted: true, content: null, attachment_name: null, attachment_path: null }
        : m));
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to delete message'));
    }
  };

  const startEdit = (m: ChatMessage) => {
    setEditingMessageId(m.id);
    setEditText(m.content ?? '');
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const saveEdit = async (messageId: number) => {
    if (!editText.trim()) return;
    try {
      const updated = await userProjectMessengerService.updateMessage(projectId, messageId, editText.trim());
      setMessages(prev => prev.map(m => m.id === messageId ? updated : m));
      cancelEdit();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update message'));
    }
  };

  const downloadAttachment = async (m: ChatMessage) => {
    if (!m.attachment_name) return;
    try { await userProjectMessengerService.downloadAttachment(projectId, m.id, m.attachment_name); }
    catch { toast.error('Download failed'); }
  };

  const onTextChange = (v: string) => {
    setText(v);
    const at = v.lastIndexOf('@');
    setMentionQuery(at !== -1 && (at === 0 || v[at - 1] === ' ') ? v.slice(at + 1) : null);
  };

  const pickMention = (userId: number, name: string) => {
    const at = text.lastIndexOf('@');
    setText(text.slice(0, at) + `@${name} `);
    setSelectedMentions(prev => prev.includes(userId) ? prev : [...prev, userId]);
    setMentionQuery(null);
  };

  // Mirrors send()'s mention rule exactly, so the suggestion list never
  // offers a tag the server would silently drop: anyone who ISN'T the
  // literal PM — Seller or plain team member alike — can only ever
  // successfully tag the literal PM (or Company Admin, via the sentinel
  // below); never a Seller, never the Client, never each other. Only the
  // literal PM can tag anyone, including the Client — the only way a PM
  // message ever reaches the Client (visibility='client', see send()).
  // Company Admin is never a real chat_participants row, so it's added as a
  // synthetic candidate (id 0, matching send()'s ADMIN_MENTION_ID) rather
  // than coming from `thread.participants`.
  const meIsSeller = me?.role_type === 'seller';
  // Only this project's own linked Seller may invite a PM here — matches
  // Api\User\ProjectMessengerController::invitePm()'s own gate exactly.
  const isProjectSeller = meIsSeller && sellerId != null && me?.id === sellerId;
  const ADMIN_MENTION_ID = 0;
  const mentionCandidates = (query: string) => {
    const q = query.toLowerCase();
    const staff = (thread?.participants ?? []).filter(p =>
      p.user_id !== me?.id
      && (isLiteralPm || !!p.is_project_pm)
      && p.name?.toLowerCase().includes(q)
    );
    const admin: ProjectMessengerParticipant = { user_id: ADMIN_MENTION_ID, name: 'Company Admin', role: null };
    return 'company admin'.includes(q) ? [admin, ...staff] : staff;
  };

  if (noAccess) {
    return (
      <DashboardLayout title="Project Chat">
        <button onClick={() => router.push(`/projects/${id}`)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b', marginBottom: 16 }}>← Back</button>
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>You do not have access to project chat.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Project Chat">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Chat{projectName && ` — ${projectName}`}</h2>
      </div>

      <div style={{ height: 'calc(100vh - 220px)', minHeight: 420 }}>
        <div style={{ height: '100%', background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {loading || !thread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    👥
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Project Chat</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{thread.participants.map(p => p.name).filter(Boolean).join(', ')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {canManageParticipants && (
                    <button onClick={() => setShowParticipants(v => !v)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, color: '#64748b', cursor: 'pointer' }}>Participants</button>
                  )}
                  {isProjectSeller && (
                    <button onClick={toggleInvitePm} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, color: '#64748b', cursor: 'pointer' }}>+ Invite PM</button>
                  )}
                  <button onClick={toggleMute} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, color: '#64748b', cursor: 'pointer' }}>
                    {thread.is_muted ? '🔔 Unmute' : '🔕 Mute'}
                  </button>
                </div>
              </div>

              {isProjectSeller && showInvitePm && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={invitePmId} onChange={e => setInvitePmId(e.target.value)} style={{ ...inp, fontSize: 12 }}>
                      <option value="">Select a Project Manager…</option>
                      {eligiblePms.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                    <button onClick={invitePm} disabled={invitingPm || !invitePmId} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: invitingPm || !invitePmId ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: invitingPm || !invitePmId ? 0.6 : 1 }}>Invite</button>
                  </div>
                  {eligiblePms.length === 0 && (
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>No active Project Managers found at your company.</div>
                  )}
                </div>
              )}

              {showParticipants && canManageParticipants && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {thread.participants.map(p => (
                      <span key={p.user_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '3px 10px', fontSize: 11.5, color: '#334155' }}>
                        {p.name}
                        <button onClick={() => removeParticipant(p.user_id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={addParticipantId} onChange={e => setAddParticipantId(e.target.value)} style={{ ...inp, fontSize: 12 }}>
                      <option value="">Add participant…</option>
                      {eligibleUsers.filter(u => !thread.participants.some(p => p.user_id === u.id)).map(u => (
                        <option key={u.id} value={u.id}>{u.name}{u.is_seller ? ' (Seller)' : ''}</option>
                      ))}
                    </select>
                    <button onClick={addParticipant} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Add</button>
                  </div>
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f7f8fa', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 }}>No messages yet. Say hello 👋</div>
                ) : messages.map(m => {
                  const isMine = m.sender_id != null && m.sender_id === me?.id;
                  const senderName = m.sender?.name ?? m.sender_admin?.name ?? '—';
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 8 }}>
                      {!isMine && (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 16 }}>
                          {senderName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                        {!isMine && (
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 3, marginLeft: 4 }}>{senderName}</div>
                        )}
                        <div style={{
                          padding: '9px 13px',
                          borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          background: isMine ? '#2563eb' : '#fff',
                          color: isMine ? '#fff' : '#1e293b',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          border: isMine ? 'none' : '1px solid #f1f5f9',
                        }}>
                          {m.is_deleted ? (
                            <div style={{ fontSize: 13, fontStyle: 'italic', color: isMine ? 'rgba(255,255,255,0.75)' : '#94a3b8' }}>This message was deleted</div>
                          ) : editingMessageId === m.id ? (
                            <div>
                              <input value={editText} onChange={e => setEditText(e.target.value)} style={{ ...inp, fontSize: 13, marginBottom: 6, color: '#0f172a' }} autoFocus />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => saveEdit(m.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                                <button onClick={cancelEdit} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11.5, cursor: 'pointer' }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {m.content && <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.content}</div>}
                              {m.attachment_name && (
                                <button onClick={() => downloadAttachment(m)} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: m.content ? 6 : 0, padding: '4px 10px',
                                  borderRadius: 6, border: `1px solid ${isMine ? 'rgba(255,255,255,0.3)' : '#e2e8f0'}`,
                                  background: isMine ? 'rgba(255,255,255,0.1)' : '#f8fafc', color: isMine ? '#fff' : '#2563eb',
                                  fontSize: 12, cursor: 'pointer', width: 'fit-content',
                                }}>📎 {m.attachment_name}</button>
                              )}
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0 }}>
                          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{fmtShort(m.sent_at)}{m.edited_at && ' (edited)'}</span>
                          {!m.is_deleted && m.visibility === 'client' && (
                            <span title="The client can see this message" style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '1px 7px' }}>👁 Client</span>
                          )}
                          {!m.is_deleted && isMine && editingMessageId !== m.id && (
                            <>
                              {m.message_type === 'text' && (
                                <button onClick={() => startEdit(m)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit</button>
                              )}
                            </>
                          )}
                          {!m.is_deleted && isMine && editingMessageId !== m.id && (
                            <button onClick={() => deleteMessage(m.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Delete</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#fff', position: 'relative' }}>
                {mentionQuery !== null && mentionCandidates(mentionQuery).length > 0 && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: 6, maxHeight: 160, overflowY: 'auto', minWidth: 180 }}>
                    {mentionCandidates(mentionQuery).map(p => (
                      <div key={p.user_id} onClick={() => pickMention(p.user_id, p.name ?? '')} style={{ padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', color: '#334155' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        {p.name} {p.role && <span style={{ color: '#94a3b8', fontSize: 11 }}>({roleLabel(p.role)})</span>}
                      </div>
                    ))}
                  </div>
                )}
                {file && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12, color: '#334155' }}>
                    <span>📎 {file.name} <span style={{ color: '#94a3b8' }}>({fmtFileSize(file.size)})</span></span>
                    <button type="button" onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
                  </div>
                )}
                {isDraft && <DraftNotice style={{ marginBottom: 10 }} />}
                <div style={{ display: 'flex', gap: 10 }}>
                  <label title={isDraft ? DRAFT_HINT : undefined} style={{ padding: '9px 12px', borderRadius: '50%', border: '1px solid #e2e8f0', background: isDraft ? '#f8fafc' : '#fff', cursor: isDraft ? 'not-allowed' : 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', opacity: isDraft ? 0.5 : 1 }}>
                    📎
                    <input type="file" style={{ display: 'none' }} disabled={isDraft} accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                      onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                  </label>
                  <input value={text} onChange={e => onTextChange(e.target.value)} disabled={isDraft} title={isDraft ? DRAFT_HINT : undefined} placeholder={isDraft ? 'Chat opens up once the project is activated' : clientId ? 'Type a message… the client sees it unless you @mention someone' : 'Type a message… use @ to mention'} style={{ ...inp, borderRadius: 20, flex: 1, background: isDraft ? '#f8fafc' : '#fff' }} />
                  <button type="submit" disabled={sending || isDraft} title={isDraft ? DRAFT_HINT : undefined} style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: isDraft ? '#cbd5e1' : (sending ? '#93c5fd' : '#2563eb'), color: '#fff', fontSize: 13, fontWeight: 600, cursor: isDraft ? 'not-allowed' : (sending ? 'wait' : 'pointer') }}>Send</button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
