'use client';
import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminGeneralChatService } from '@/lib/services/generalChatService';
import { ChatMessage } from '@/lib/services/adminProjectService';
import { inp, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize } from '@/components/admin/projects/shared';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

interface Company { id: number; name: string }
interface CompanyUser { id: number; name: string; role_type: string }

// Avatar background rotates through a small fixed palette keyed off the
// thread id, purely cosmetic — so a sidebar full of conversations doesn't
// read as one undifferentiated wall of identical blue circles.
const AVATAR_PALETTE = [
  { bg: '#e0e7ff', fg: '#4338ca' }, { bg: '#dcfce7', fg: '#15803d' }, { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#fef3c7', fg: '#b45309' }, { bg: '#e0f2fe', fg: '#0369a1' }, { bg: '#f3e8ff', fg: '#7e22ce' },
];
function avatarColors(seed: number) {
  return AVATAR_PALETTE[seed % AVATAR_PALETTE.length];
}

// Short, WhatsApp-style timestamp — just the time for something sent today,
// otherwise a short date, since a full ISO/locale string is too noisy for a
// sidebar preview or bubble footer.
function fmtShort(d: string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

function lastMessagePreview(lm: { content: string | null; message_type: string } | null | undefined): string {
  if (!lm) return 'No messages yet';
  if (lm.content) return lm.content;
  return lm.message_type === 'image' ? '📷 Photo' : '📎 Attachment';
}

export default function AdminChatPage() {
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof adminGeneralChatService.list>>>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupCompanyId, setGroupCompanyId] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupParticipants, setGroupParticipants] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = () => {
    setLoadingThreads(true);
    adminGeneralChatService.list()
      .then(setThreads)
      .catch(() => toast.error('Failed to load chats'))
      .finally(() => setLoadingThreads(false));
  };

  const loadMessages = (threadId: number) => {
    adminGeneralChatService.messages(threadId).then(setMessages).catch(() => {});
  };

  useEffect(() => {
    loadThreads();
    api.get('/admin/companies').then(r => setCompanies(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    loadMessages(activeThreadId);
    const interval = setInterval(() => loadMessages(activeThreadId), 8000);
    return () => clearInterval(interval);
  }, [activeThreadId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-select the only company when there's just one, mirroring how the
  // Add User / Create Project forms handle a single-company admin.
  useEffect(() => {
    if (companies.length === 1) setGroupCompanyId(String(companies[0].id));
  }, [companies]);

  // Users of the selected company who actually hold canUseGeneralChat, for
  // the group-creation checklist — using the dedicated eligible-users
  // endpoint (not the general /admin/users listing) so nothing shown here
  // can ever fail createGroup()'s own "must have chat access" check.
  useEffect(() => {
    if (!groupCompanyId) { setCompanyUsers([]); return; }
    adminGeneralChatService.eligibleUsers(Number(groupCompanyId)).then(setCompanyUsers).catch(() => setCompanyUsers([]));
  }, [groupCompanyId]);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;
  const visibleThreads = search.trim()
    ? threads.filter(t => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : threads;

  // Specific, one-thing-at-a-time messages instead of one generic combined
  // toast — so "I picked 2 users but it still complains" is never ambiguous.
  const groupFormError = !groupCompanyId
    ? 'Select a company first.'
    : !groupTitle.trim()
    ? 'Enter a group name.'
    : groupParticipants.length < 2
    ? `Select at least 2 users (${groupParticipants.length} selected).`
    : null;

  const startDirect = async (userId: number) => {
    if (!groupCompanyId) { toast.error('Select a company first.'); return; }
    try {
      const { thread_id } = await adminGeneralChatService.createDirect(Number(groupCompanyId), userId);
      setShowNewDirect(false);
      loadThreads();
      setActiveThreadId(thread_id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start chat');
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (groupFormError) { toast.error(groupFormError); return; }
    try {
      const { thread_id } = await adminGeneralChatService.createGroup(Number(groupCompanyId), groupTitle.trim(), groupParticipants);
      setShowNewGroup(false);
      setGroupTitle('');
      setGroupParticipants([]);
      loadThreads();
      setActiveThreadId(thread_id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create group');
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadId) return;
    if (!text.trim() && !file) return;
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${file.name}: file type not allowed`); return; }
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${file.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); return; }
    }
    setSending(true);
    try {
      await adminGeneralChatService.send(activeThreadId, text.trim(), file);
      setText('');
      setFile(null);
      loadMessages(activeThreadId);
      loadThreads();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send message');
    } finally { setSending(false); }
  };

  const downloadAttachment = async (m: ChatMessage) => {
    if (!activeThreadId || !m.attachment_name) return;
    try { await adminGeneralChatService.downloadAttachment(activeThreadId, m.id, m.attachment_name); }
    catch { toast.error('Download failed'); }
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
    if (!activeThreadId || !editText.trim()) return;
    try {
      const updated = await adminGeneralChatService.updateMessage(activeThreadId, messageId, editText.trim());
      setMessages(prev => prev.map(m => m.id === messageId ? updated : m));
      cancelEdit();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update message');
    }
  };

  // Admin can delete ANY message in a thread they oversee, not just their
  // own — matches Admin's unrestricted delete on Project Comments.
  const deleteMessage = async (messageId: number) => {
    if (!activeThreadId) return;
    if (!confirm('Delete this message?')) return;
    try {
      await adminGeneralChatService.deleteMessage(activeThreadId, messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete message');
    }
  };

  return (
    <DashboardLayout title="Chat">
      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
        {/* ── Conversation list ── */}
        <div style={{ width: 320, flexShrink: 0, background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => { setShowNewDirect(v => !v); setShowNewGroup(false); }} style={{ flex: 1, padding: '8px 10px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>+ New Chat</button>
              <button onClick={() => { setShowNewGroup(v => !v); setShowNewDirect(false); }} style={{ flex: 1, padding: '8px 10px', borderRadius: 20, border: 'none', background: '#2563eb', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>+ Group</button>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search conversations" style={{ ...inp, borderRadius: 20, fontSize: 12.5 }} />
          </div>

          {showNewDirect && (
            <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
              {companies.length > 1 && (
                <select value={groupCompanyId} onChange={e => setGroupCompanyId(e.target.value)} style={{ ...inp, marginBottom: 8, fontSize: 12.5 }}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {!groupCompanyId ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Select a company first.</div>
                ) : companyUsers.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>No users with chat access found for this company. Grant &quot;Use General Chat&quot; from Edit User first.</div>
                ) : companyUsers.map(u => (
                  <div key={u.id} onClick={() => startDirect(u.id)} style={{ padding: '7px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: '#334155' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    {u.name} <span style={{ color: '#94a3b8' }}>({u.role_type.replace('_', ' ')})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showNewGroup && (
            <form onSubmit={createGroup} style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
              {companies.length > 1 && (
                <select value={groupCompanyId} onChange={e => { setGroupCompanyId(e.target.value); setGroupParticipants([]); }} style={{ ...inp, marginBottom: 8, fontSize: 12.5 }}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <input value={groupTitle} onChange={e => setGroupTitle(e.target.value)} placeholder="Group name" style={{ ...inp, marginBottom: 8, fontSize: 12.5 }} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                {groupParticipants.length} selected {companyUsers.length > 0 && `of ${companyUsers.length} eligible`}
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 8 }}>
                {companyUsers.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{groupCompanyId ? 'No users with chat access found for this company. Grant "Use General Chat" from Edit User first.' : 'Select a company first.'}</div>
                ) : companyUsers.map(u => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                    <input type="checkbox" checked={groupParticipants.includes(u.id)}
                      onChange={e => setGroupParticipants(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))} />
                    {u.name} <span style={{ color: '#94a3b8' }}>({u.role_type.replace('_', ' ')})</span>
                  </label>
                ))}
              </div>
              {groupFormError && (
                <div style={{ fontSize: 11, color: '#d97706', marginBottom: 8 }}>{groupFormError}</div>
              )}
              <button type="submit" disabled={!!groupFormError} style={{
                width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none',
                background: groupFormError ? '#93c5fd' : '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: groupFormError ? 'not-allowed' : 'pointer',
              }}>Create Group</button>
            </form>
          )}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingThreads ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
            ) : visibleThreads.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{search ? 'No matches.' : 'No conversations yet.'}</div>
            ) : visibleThreads.map(t => {
              const colors = avatarColors(t.id);
              return (
                <div key={t.id} onClick={() => setActiveThreadId(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                  background: t.id === activeThreadId ? '#eff6ff' : 'transparent',
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', background: colors.bg, color: colors.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0,
                  }}>{t.thread_type === 'group' ? '👥' : t.title.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      <span style={{ fontSize: 10.5, color: '#94a3b8', flexShrink: 0 }}>{fmtShort(t.last_message_at)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.last_message?.sender_name ? `${t.last_message.sender_name}: ` : ''}{lastMessagePreview(t.last_message)}
                      </span>
                      {t.company && <span style={{ fontSize: 10, color: '#cbd5e1', flexShrink: 0 }}>{t.company}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Message thread ── */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Select a conversation</div>
          ) : (
            <>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: avatarColors(activeThread.id).bg, color: avatarColors(activeThread.id).fg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0,
                }}>{activeThread.thread_type === 'group' ? '👥' : activeThread.title.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeThread.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeThread.participants.map(p => p.name).filter(Boolean).join(', ')}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f7f8fa', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 }}>No messages yet. Say hello 👋</div>
                ) : messages.map(m => {
                  const isMine = m.sender_admin_id != null;
                  const senderName = m.sender?.name ?? m.sender_admin?.name ?? '—';
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 8 }}>
                      {!isMine && (
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                          flexShrink: 0, marginTop: 16,
                        }}>{senderName.charAt(0).toUpperCase()}</div>
                      )}
                      <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                        {!isMine && activeThread.thread_type === 'group' && (
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
                          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>
                            {fmtShort(m.sent_at)}{m.edited_at && ' (edited)'}
                          </span>
                          {editingMessageId !== m.id && (
                            <>
                              {isMine && m.message_type === 'text' && (
                                <button onClick={() => startEdit(m)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit</button>
                              )}
                              <button onClick={() => deleteMessage(m.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#fff' }}>
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
                  <input value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…" style={{ ...inp, borderRadius: 20, flex: 1 }} />
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
