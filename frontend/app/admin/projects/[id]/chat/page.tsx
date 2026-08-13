'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import { inp, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize, DRAFT_HINT, DraftNotice } from '@/components/admin/projects/shared';
import {
  adminProjectMessengerService, ProjectMessengerThread, ProjectMessengerEligibleUser,
} from '@/lib/services/projectMessengerService';
import { adminProjectService, ChatMessage } from '@/lib/services/adminProjectService';

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

// Project Chat — one thread per project, no groups/direct chats, no
// conversation switching (see Api\Admin\ProjectMessengerController and
// ProjectChatService). Company Admin oversees this single conversation
// unconditionally.
export default function AdminProjectChatPage() {
  useModuleGuard('projects');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [projectName, setProjectName] = useState('');
  // A draft project rejects messages server-side (ProjectMessengerController::
  // send()'s isDraft() guard) — the composer locks to match, and re-opens
  // by itself once the project is activated.
  const [isDraft, setIsDraft] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [thread, setThread] = useState<ProjectMessengerThread | null>(null);
  const [loading, setLoading] = useState(true);
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

  const loadMessages = () => {
    adminProjectMessengerService.messages(projectId).then(r => setMessages(r.messages)).catch(() => {});
  };

  const loadThread = () => {
    adminProjectMessengerService.show(projectId)
      .then(r => { setThread(r.thread); loadMessages(); })
      .catch(() => toast.error('Failed to load project chat'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadThread();
    adminProjectMessengerService.eligibleParticipants(projectId).then(setEligibleUsers).catch(() => {});
    adminProjectService.getOne(projectId).then(p => { setProjectName(p.name); setClientId(p.client_id); setIsDraft(p.status === 'draft'); }).catch(() => {});
    const interval = setInterval(() => { loadThread(); }, 8000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const addParticipant = async () => {
    if (!addParticipantId) return;
    try {
      await adminProjectMessengerService.addParticipant(projectId, Number(addParticipantId));
      setAddParticipantId('');
      loadThread();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add participant');
    }
  };

  const removeParticipant = async (userId: number) => {
    if (!confirm('Remove this participant from the chat?')) return;
    try {
      await adminProjectMessengerService.removeParticipant(projectId, userId);
      loadThread();
    } catch { toast.error('Failed to remove participant'); }
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
      await adminProjectMessengerService.send(projectId, text.trim(), selectedMentions, file);
      setText('');
      setFile(null);
      setSelectedMentions([]);
      loadMessages();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send message');
    } finally { setSending(false); }
  };

  const deleteMessage = async (messageId: number) => {
    if (!confirm('Delete this message?')) return;
    try {
      await adminProjectMessengerService.deleteMessage(projectId, messageId);
      setMessages(prev => prev.map(m => m.id === messageId
        ? { ...m, is_deleted: true, content: null, attachment_name: null, attachment_path: null }
        : m));
    } catch { toast.error('Failed to delete message'); }
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
      const updated = await adminProjectMessengerService.updateMessage(projectId, messageId, editText.trim());
      setMessages(prev => prev.map(m => m.id === messageId ? updated : m));
      cancelEdit();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update message');
    }
  };

  const downloadAttachment = async (m: ChatMessage) => {
    if (!m.attachment_name) return;
    try { await adminProjectMessengerService.downloadAttachment(projectId, m.id, m.attachment_name); }
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

  return (
    <DashboardLayout title="Project Chat">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Chat{projectName && ` — ${projectName}`}</h2>
        {clientId && (
          // THIS project's own client conversation (the "Project Chat" tab the
          // client sees in their portal) — not the account-level Client
          // Messages thread it used to open, which was shared across all of
          // that client's projects. See App\Services\ProjectClientChatService.
          <button onClick={() => router.push(`/admin/projects/${id}/client-chat`)} title="Open this project's chat with the client" style={{
            marginLeft: 'auto', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#2563eb',
          }}>💬 Chat with Client</button>
        )}
      </div>

      <ProjectTabs projectId={projectId} active="chat" isDraft={isDraft} />

      <div style={{ height: 'calc(100vh - 260px)', minHeight: 420 }}>
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
                  <button onClick={() => setShowParticipants(v => !v)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, color: '#64748b', cursor: 'pointer' }}>Participants</button>
                </div>
              </div>

              {showParticipants && (
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
                  const isMine = m.sender_admin_id != null;
                  const senderName = m.sender_admin?.name ?? m.sender?.name ?? '—';
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
                          {!m.is_deleted && isMine && editingMessageId !== m.id && m.message_type === 'text' && (
                            <button onClick={() => startEdit(m)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit</button>
                          )}
                          {!m.is_deleted && editingMessageId !== m.id && (
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
                {mentionQuery !== null && thread.participants.filter(p => p.name?.toLowerCase().includes(mentionQuery.toLowerCase())).length > 0 && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: 6, maxHeight: 160, overflowY: 'auto', minWidth: 180 }}>
                    {thread.participants.filter(p => p.name?.toLowerCase().includes(mentionQuery.toLowerCase())).map(p => (
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
                  <input value={text} onChange={e => onTextChange(e.target.value)} disabled={isDraft} title={isDraft ? DRAFT_HINT : undefined} placeholder={isDraft ? 'Chat opens up once the project is activated' : 'Type a message… use @ to mention'} style={{ ...inp, borderRadius: 20, flex: 1, background: isDraft ? '#f8fafc' : '#fff' }} />
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
