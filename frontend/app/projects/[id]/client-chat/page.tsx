'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import toast from 'react-hot-toast';
import { getAuthUser } from '@/lib/auth';
import { User } from '@/types';
import { inp, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize, DRAFT_HINT, DraftNotice } from '@/components/admin/projects/shared';
import { userProjectClientChatService, ProjectClientChatPayload } from '@/lib/services/projectClientChatService';
import { ChatMessage } from '@/lib/services/adminProjectService';
import { mentionQueryOf, matchMentionables, applyMention, renderWithMentions, roleLabel } from '@/lib/chatMentions';

const MENTION_STYLE = { fontWeight: 700, color: '#047857', background: '#d1fae5', borderRadius: 4, padding: '0 3px' };
const MENTION_STYLE_MINE = { fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.22)', borderRadius: 4, padding: '0 3px' };

function fmtShort(d: string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

// Client Chat — the Seller's side of the conversation the client sees on
// their portal project page (see Api\User\ProjectClientChatController). One
// conversation per project; only this project's own linked Seller
// (projects.seller_id) can open it, so the API 404s for anyone else.
export default function ProjectClientChatPage() {
  useAdminGuard();
  const me = getAuthUser() as User | null;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [data, setData] = useState<ProjectClientChatPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // @mentions — the picker offers exactly what the server will accept
  // (data.mentionables), so a tag is never silently dropped on send.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<number[]>([]);

  // Invite the Project Manager — Seller only, and only when this project
  // actually has a PM of its own (data.pm is null otherwise).
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteHistory, setInviteHistory] = useState<'from_now' | 'all'>('from_now');
  const [invitePmId, setInvitePmId] = useState<number | null>(null);
  const [inviting, setInviting] = useState(false);
  // "Ask Company Admin to join" — an alert only; Admin can already read and
  // post in every project's client chat.
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [notifying, setNotifying] = useState(false);

  const load = () => {
    userProjectClientChatService.get(projectId)
      .then(r => { setData(r); setNoAccess(false); })
      .catch(() => setNoAccess(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data?.messages?.length]);

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
      await userProjectClientChatService.send(projectId, text.trim(), file, selectedMentions);
      setText('');
      setFile(null);
      setSelectedMentions([]);
      setMentionQuery(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send message');
    } finally { setSending(false); }
  };

  const downloadAttachment = async (m: ChatMessage) => {
    if (!m.attachment_name) return;
    try { await userProjectClientChatService.downloadAttachment(projectId, m.id, m.attachment_name); }
    catch { toast.error('Download failed'); }
  };

  // Own message only — Company Admin's unrestricted delete authority only
  // applies from the Admin panel's own client-chat page.
  const deleteMessage = async (messageId: number) => {
    if (!confirm('Delete this message?')) return;
    try {
      await userProjectClientChatService.deleteMessage(projectId, messageId);
      setData(prev => prev ? {
        ...prev,
        messages: prev.messages.map(m => m.id === messageId
          ? { ...m, is_deleted: true, content: null, attachment_name: null, attachment_path: null }
          : m),
      } : prev);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete message');
    }
  };

  // Own message, or the client's — never another staff member's. Purely a
  // staff-side view toggle; the client never knows it happened.
  const toggleHide = async (m: ChatMessage) => {
    try {
      const r = await userProjectClientChatService.toggleHide(projectId, m.id);
      setData(prev => prev ? {
        ...prev,
        messages: prev.messages.map(x => x.id === m.id ? { ...x, hidden_for_staff: r.hidden_for_staff } : x),
      } : prev);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update message');
    }
  };

  const invitePm = async () => {
    setInviting(true);
    try {
      await userProjectClientChatService.invitePm(projectId, inviteHistory, invitePmId ?? undefined);
      toast.success(inviteHistory === 'all'
        ? 'Project Manager can now see the full conversation'
        : 'Project Manager added — they will see messages from now on');
      setInviteOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to invite the Project Manager');
    } finally { setInviting(false); }
  };

  const notifyAdmin = async () => {
    setNotifying(true);
    try {
      await userProjectClientChatService.notifyAdmin(projectId, adminNote.trim());
      toast.success('Company Admin notified');
      setAdminOpen(false);
      setAdminNote('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to notify Company Admin');
    } finally { setNotifying(false); }
  };

  // A draft project accepts no messages (server-side too) — the composer
  // locks itself and re-opens by itself once the project is activated.
  const isDraft = data?.project?.status === 'draft';

  const mentionables = data?.mentionables ?? [];
  const nameById = Object.fromEntries(mentionables.map(m => [m.user_id, m.name ?? ''])) as Record<number, string>;

  const onTextChange = (v: string) => {
    setText(v);
    setMentionQuery(mentionQueryOf(v));
  };

  const pickMention = (userId: number, name: string) => {
    setText(t => applyMention(t, name));
    setSelectedMentions(prev => prev.includes(userId) ? prev : [...prev, userId]);
    setMentionQuery(null);
  };

  const pms = data?.pms ?? [];
  const invitedPms = pms.filter(p => p.invited);
  // A PM invited with "chat from now" simply never receives the earlier
  // messages — the banner says so rather than showing a gap with no reason.
  const myHistoryLimited = data?.role === 'pm' && pms.some(p => p.user_id === me?.id && p.history === 'from_now');
  // The PM the invite dialog is currently acting on: an explicit pick when
  // the project has several, otherwise the only one.
  const activePm = pms.find(p => p.user_id === invitePmId) ?? (pms.length === 1 ? pms[0] : null);

  if (noAccess) {
    return (
      <DashboardLayout title="Client Chat">
        <button onClick={() => router.push(`/projects/${id}/chat`)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b', marginBottom: 16 }}>← Back</button>
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          Only this project&apos;s assigned Seller — or a Project Manager the Seller has invited — can open its client chat.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Client Chat">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/projects/${id}/chat`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>
          Client Chat{data?.project?.name && ` — ${data.project.name}`}
        </h2>
      </div>

      <div style={{ height: 'calc(100vh - 220px)', minHeight: 420 }}>
        <div style={{ height: '100%', background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {loading || !data ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>💬</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Client Chat</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {data.thread.participants.map(p => p.name).filter(Boolean).join(', ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {/* Invite the PM — Seller only. Shown even when there is
                      nobody to invite, disabled with the reason: a silently
                      missing button just reads as "the feature is broken",
                      and "the project has a manager" is often the Seller
                      themselves (see ProjectClientChatService::invitablePmIds). */}
                  {data.role === 'seller' && (
                    <button
                      onClick={() => {
                        if (!pms.length) return;
                        const target = pms.find(p => p.invited) ?? pms[0];
                        setInvitePmId(target.user_id);
                        setInviteHistory(target.history === 'all' ? 'all' : 'from_now');
                        setInviteOpen(true);
                      }}
                      disabled={!pms.length}
                      title={pms.length
                        ? 'Bring the Project Manager into this client conversation'
                        : 'No Project Manager is on this project yet — assign one to the project, or add them to its team, and they can be invited here. (A project whose manager is you, the Seller, has nobody to invite.)'}
                      style={{
                        border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20,
                        padding: '5px 12px', fontSize: 11.5,
                        color: pms.length ? '#64748b' : '#cbd5e1',
                        cursor: pms.length ? 'pointer' : 'not-allowed',
                      }}>
                      {invitedPms.length ? '👤 PM access' : '➕ Invite Project Manager'}
                    </button>
                  )}
                  <button onClick={() => setAdminOpen(true)} style={{
                    border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20,
                    padding: '5px 12px', fontSize: 11.5, color: '#64748b', cursor: 'pointer',
                  }}>🔔 Notify Company Admin</button>
                </div>
              </div>

              <div style={{ padding: '8px 20px', fontSize: 11.5, color: '#15803d', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                {data.role === 'pm'
                  ? (myHistoryLimited
                    ? 'You were invited into this client conversation and can see messages from your invite onward.'
                    : 'You were invited into this client conversation and can see its full history.')
                  : 'This conversation is visible to the client. The internal team chat is separate.'}
                {data.role === 'seller' && invitedPms.map(pm => (
                  <span key={pm.user_id}> {pm.name} (PM) is in this chat — {pm.history === 'all' ? 'full history' : 'messages from their invite onward'}.</span>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f7f8fa', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 }}>No messages yet. Say hello 👋</div>
                ) : data.messages.map(m => {
                  const isMine = m.sender_id != null && m.sender_id === me?.id;
                  // Whether this Seller/PM may hide/unhide THIS message: own,
                  // or the client's — never another staff member's (Admin's,
                  // or an invited PM's/the Seller's, whichever isn't "me").
                  const canHide = isMine || m.sender?.role_type === 'client';
                  const senderName = m.sender_admin?.name
                    ? `${m.sender_admin.name} (Admin)`
                    : m.sender?.name ?? '—';
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 8 }}>
                      {!isMine && (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 16 }}>
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
                          background: isMine ? '#059669' : '#fff',
                          color: isMine ? '#fff' : '#1e293b',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          border: isMine ? 'none' : '1px solid #f1f5f9',
                        }}>
                          {m.is_deleted ? (
                            <div style={{ fontSize: 13, fontStyle: 'italic', color: isMine ? 'rgba(255,255,255,0.75)' : '#94a3b8' }}>This message was deleted</div>
                          ) : m.hidden_for_staff ? (
                            <div style={{ fontSize: 13, fontStyle: 'italic', color: isMine ? 'rgba(255,255,255,0.75)' : '#94a3b8' }}>This message is hidden</div>
                          ) : (
                            <>
                              {m.content && (
                                <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                  {renderWithMentions(m.content, m.mentions, nameById, isMine ? MENTION_STYLE_MINE : MENTION_STYLE)}
                                </div>
                              )}
                              {m.attachment_name && (
                                <button onClick={() => downloadAttachment(m)} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: m.content ? 6 : 0, padding: '4px 10px',
                                  borderRadius: 6, border: `1px solid ${isMine ? 'rgba(255,255,255,0.3)' : '#e2e8f0'}`,
                                  background: isMine ? 'rgba(255,255,255,0.1)' : '#f8fafc', color: isMine ? '#fff' : '#059669',
                                  fontSize: 12, cursor: 'pointer', width: 'fit-content',
                                }}>📎 {m.attachment_name}</button>
                              )}
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0 }}>
                          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{fmtShort(m.sent_at)}</span>
                          {canHide && !m.is_deleted && (
                            <button onClick={() => toggleHide(m)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                              {m.hidden_for_staff ? 'Unhide' : 'Hide'}
                            </button>
                          )}
                          {isMine && !m.is_deleted && (
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
                {mentionQuery !== null && matchMentionables(mentionables, mentionQuery).length > 0 && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: 6, maxHeight: 180, overflowY: 'auto', minWidth: 200, zIndex: 5 }}>
                    {matchMentionables(mentionables, mentionQuery).map(p => (
                      <div key={p.user_id} onClick={() => pickMention(p.user_id, p.name ?? '')} style={{ padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', color: '#334155' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        {p.name} {p.role_type && <span style={{ color: '#94a3b8', fontSize: 11 }}>({roleLabel(p.role_type)})</span>}
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
                  <input value={text} onChange={e => onTextChange(e.target.value)} disabled={isDraft} title={isDraft ? DRAFT_HINT : undefined} placeholder={isDraft ? 'Chat opens up once the project is activated' : 'Message the client… use @ to tag'} style={{ ...inp, borderRadius: 20, flex: 1, background: isDraft ? '#f8fafc' : '#fff' }} />
                  <button type="submit" disabled={sending || isDraft} title={isDraft ? DRAFT_HINT : undefined} style={{ padding: '9px 20px', borderRadius: 20, border: 'none', background: isDraft ? '#cbd5e1' : (sending ? '#a7f3d0' : '#059669'), color: '#fff', fontSize: 13, fontWeight: 600, cursor: isDraft ? 'not-allowed' : (sending ? 'wait' : 'pointer') }}>Send</button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Invite the Project Manager — the two options are the whole point of
          this dialog: how much of the conversation they get to read. */}
      {inviteOpen && pms.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 460, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                {activePm?.invited ? 'Project Manager access' : 'Invite Project Manager'}
              </h3>
              <button onClick={() => setInviteOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 16px' }}>
              {pms.length > 1
                ? 'The chosen Project Manager will be able to read and reply in this client conversation. Choose how much of it they can see.'
                : `${activePm?.name} will be able to read and reply in this client conversation. Choose how much of it they can see.`}
            </p>

            {/* Only when the project has more than one PM (project_manager_id
                plus team members carrying role_in_project='project_manager'). */}
            {pms.length > 1 && (
              <select
                value={invitePmId ?? ''}
                onChange={e => {
                  const picked = pms.find(p => p.user_id === Number(e.target.value));
                  setInvitePmId(picked?.user_id ?? null);
                  setInviteHistory(picked?.history === 'all' ? 'all' : 'from_now');
                }}
                style={{ ...inp, fontSize: 13, marginBottom: 14 }}>
                {pms.map(p => (
                  <option key={p.user_id} value={p.user_id}>{p.name}{p.invited ? ' — already in this chat' : ''}</option>
                ))}
              </select>
            )}

            {([
              { key: 'from_now' as const, title: 'Chat from now', desc: 'They only see messages sent after this moment. Everything you and the client said before stays private.' },
              { key: 'all' as const, title: 'View all chat', desc: 'They see the full conversation, including everything from before the invite.' },
            ]).map(opt => (
              <label key={opt.key} onClick={() => setInviteHistory(opt.key)} style={{
                display: 'block', padding: '11px 14px', marginBottom: 10, cursor: 'pointer',
                border: `1.5px solid ${inviteHistory === opt.key ? '#059669' : '#e2e8f0'}`,
                background: inviteHistory === opt.key ? '#f0fdf4' : '#fff',
                borderRadius: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" checked={inviteHistory === opt.key} onChange={() => setInviteHistory(opt.key)} style={{ accentColor: '#059669' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b' }}>{opt.title}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, marginLeft: 24 }}>{opt.desc}</div>
              </label>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={invitePm} disabled={inviting} style={{
                flex: 1, padding: '10px', background: inviting ? '#a7f3d0' : '#059669', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: inviting ? 'wait' : 'pointer',
              }}>
                {inviting ? 'Saving…' : activePm?.invited ? 'Update access' : 'Invite'}
              </button>
              <button onClick={() => setInviteOpen(false)} style={{ padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Ask Company Admin to step in. Admin already has full access to every
          project's client chat — this only puts it on their bell. */}
      {adminOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Notify Company Admin</h3>
              <button onClick={() => setAdminOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 0 14px' }}>
              Company Admin can already read and post in this conversation. This just alerts them to come and look.
            </p>
            <textarea
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Optional — what do you need them for?"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={notifyAdmin} disabled={notifying} style={{
                flex: 1, padding: '10px', background: notifying ? '#a7f3d0' : '#059669', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: notifying ? 'wait' : 'pointer',
              }}>
                {notifying ? 'Sending…' : 'Notify'}
              </button>
              <button onClick={() => setAdminOpen(false)} style={{ padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
