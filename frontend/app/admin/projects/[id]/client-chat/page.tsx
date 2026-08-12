'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import { inp, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize, DRAFT_HINT, DraftNotice } from '@/components/admin/projects/shared';
import { adminProjectClientChatService, ProjectClientChatPayload } from '@/lib/services/projectClientChatService';
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

// Client Chat — the per-project Client <-> Seller <-> Company Admin
// conversation the client sees on their portal project page (see
// Api\Admin\ProjectClientChatController). Admin oversees every project's
// client chat unconditionally, and its own messages carry sender_admin_id so
// both other sides render them as "(Admin)".
export default function AdminProjectClientChatPage() {
  useModuleGuard('projects');
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const [data, setData] = useState<ProjectClientChatPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // @mentions — Admin may tag anyone in the conversation (Client, Seller,
  // invited PM); the "Company Admin" sentinel is absent since that is Admin
  // itself. See App\Services\ProjectClientChatService::mentionablesFor().
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<number[]>([]);

  const load = () => {
    adminProjectClientChatService.get(projectId)
      .then(setData)
      .catch(() => {})
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
      await adminProjectClientChatService.send(projectId, text.trim(), file, selectedMentions);
      setText('');
      setFile(null);
      setSelectedMentions([]);
      setMentionQuery(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send message');
    } finally { setSending(false); }
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

  const downloadAttachment = async (m: ChatMessage) => {
    if (!m.attachment_name) return;
    try { await adminProjectClientChatService.downloadAttachment(projectId, m.id, m.attachment_name); }
    catch { toast.error('Download failed'); }
  };

  return (
    <DashboardLayout title={`Client Chat${data?.project?.name ? ` — ${data.project.name}` : ''}`}>
      {/* Reached from the Chat tab's "Chat with Client" button — there is no
          separate tab for it, so Chat stays the highlighted one. */}
      <ProjectTabs projectId={projectId} active="chat" isDraft={isDraft} />

      <div style={{ height: 'calc(100vh - 260px)', minHeight: 420 }}>
        <div style={{ height: '100%', background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {loading || !data ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>💬</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Client Chat</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {data.thread.participants.map(p => p.name).filter(Boolean).join(', ') || 'No client portal user or Seller on this project yet'}
                  </div>
                </div>
              </div>

              <div style={{ padding: '8px 20px', fontSize: 11.5, color: '#15803d', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                Client-facing conversation for this project. The internal team chat is on the Chat tab.
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#f7f8fa', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 }}>No messages yet.</div>
                ) : data.messages.map(m => {
                  const isMine = m.sender_admin_id != null;
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
                        </div>
                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3, marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0 }}>
                          {fmtShort(m.sent_at)}
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
    </DashboardLayout>
  );
}
