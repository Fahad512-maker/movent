'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import toast from 'react-hot-toast';
import { can, getAuthUser } from '@/lib/auth';
import { User } from '@/types';
import { inp, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize } from '@/components/admin/projects/shared';
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
  // Company Admin/PM can delete ANY message; everyone else can only ever
  // delete their own (plain ownership check, enforced server-side too).
  const canDeleteAny = can('project_management', 'canDeleteAnyProjectChatMessage');

  const [projectName, setProjectName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const fetchedEligibleRef = useRef(false);

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
    userProjectService.getOne(projectId).then(p => { setProjectName(p.name); setClientId(p.client_id); }).catch(() => {});
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
      setMessages(prev => prev.filter(m => m.id !== messageId));
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
  // offers a tag the server would silently drop: a Seller can only ever
  // successfully tag the literal PM or Company Admin (never the rest of the
  // team); everyone else can tag anyone EXCEPT a Seller, unless they're the
  // literal PM. Company Admin is never a real chat_participants row, so it's
  // added as a synthetic candidate (id 0, matching send()'s
  // ADMIN_MENTION_ID) rather than coming from `thread.participants`.
  const meIsSeller = me?.role_type === 'seller';
  const ADMIN_MENTION_ID = 0;
  const mentionCandidates = (query: string) => {
    const q = query.toLowerCase();
    const staff = (thread?.participants ?? []).filter(p =>
      p.user_id !== me?.id
      && (meIsSeller ? !!p.is_project_pm : (isLiteralPm || p.role !== 'seller'))
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
        {clientId && (
          // THIS project's own client conversation (the "Project Chat" tab the
          // client sees in their portal) — not the account-level Client
          // Messages thread it used to open, which was shared across all of
          // that client's projects. See App\Services\ProjectClientChatService.
          <button onClick={() => router.push(`/projects/${id}/client-chat`)} title="Open this project's chat with the client" style={{
            marginLeft: 'auto', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#2563eb',
          }}>💬 Chat with Client</button>
        )}
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
                  <button onClick={toggleMute} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, color: '#64748b', cursor: 'pointer' }}>
                    {thread.is_muted ? '🔔 Unmute' : '🔕 Mute'}
                  </button>
                </div>
              </div>

              {me?.role_type === 'seller' && (
                <div style={{ padding: '8px 20px', fontSize: 11.5, color: '#b45309', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                  You only see messages Company Admin or the Project Manager tag you in, plus your own messages.
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
                          {editingMessageId === m.id ? (
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
                          {isMine && editingMessageId !== m.id && (
                            <>
                              {m.message_type === 'text' && (
                                <button onClick={() => startEdit(m)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit</button>
                              )}
                            </>
                          )}
                          {(isMine || canDeleteAny) && editingMessageId !== m.id && (
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
                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ padding: '9px 12px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center' }}>
                    📎
                    <input type="file" style={{ display: 'none' }} accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                      onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                  </label>
                  <input value={text} onChange={e => onTextChange(e.target.value)} placeholder="Type a message… use @ to mention" style={{ ...inp, borderRadius: 20, flex: 1 }} />
                  <button type="submit" disabled={sending} style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: sending ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: sending ? 'wait' : 'pointer' }}>Send</button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
