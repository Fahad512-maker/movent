'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientService } from '@/lib/services/clientService';
import clientApi from '@/lib/clientAxios';
import toast from 'react-hot-toast';
import { mentionQueryOf, matchMentionables, applyMention, renderWithMentions, roleLabel, Mentionable } from '@/lib/chatMentions';

const GREEN = '#10b981';
const SC: Record<string, { bg: string; color: string }> = {
  planning:           { bg: '#eff6ff', color: '#2563eb' },
  active:             { bg: '#ecfdf5', color: '#059669' },
  on_hold:            { bg: '#fffbeb', color: '#d97706' },
  completed:          { bg: '#f0fdf4', color: '#16a34a' },
  cancelled:          { bg: '#fef2f2', color: '#dc2626' },
  delivered:          { bg: '#eff6ff', color: '#2563eb' },
  approved:           { bg: '#ecfdf5', color: '#059669' },
  revision_requested: { bg: '#fffbeb', color: '#d97706' },
  draft:              { bg: '#f1f5f9', color: '#64748b' },
  todo:               { bg: '#f1f5f9', color: '#64748b' },
  in_progress:        { bg: '#ecfdf5', color: '#059669' },
};

const TASK_SC: Record<string, { bg: string; color: string }> = {
  todo:                  { bg: '#f1f5f9', color: '#64748b' },
  in_progress:           { bg: '#eff6ff', color: '#2563eb' },
  blocked:               { bg: '#fef2f2', color: '#dc2626' },
  ready_for_qa:          { bg: '#fffbeb', color: '#d97706' },
  in_qa:                 { bg: '#fff7ed', color: '#ea580c' },
  qa_failed:             { bg: '#fef2f2', color: '#dc2626' },
  qa_passed:             { bg: '#ecfdf5', color: '#059669' },
  ready_for_production:  { bg: '#eef2ff', color: '#4f46e5' },
  in_production:         { bg: '#f0fdf9', color: '#0d9488' },
  review:      { bg: '#fffbeb', color: '#d97706' },
  completed:   { bg: '#f0fdf4', color: '#16a34a' },
  cancelled:   { bg: '#fef2f2', color: '#dc2626' },
};

const TABS = ['tasks', 'deliverables', 'files', 'activity', 'chat'] as const;
type Tab = typeof TABS[number];

// Files a client may attach in project chat — mirrors the backend's
// ALLOWED_MIMES/MAX_FILE_KB in Api\Client\ProjectChatController exactly.
const CHAT_FILE_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'zip'];
const CHAT_MAX_MB = 10;

const MENTION_STYLE = { fontWeight: 700, color: '#047857', background: '#d1fae5', borderRadius: 4, padding: '0 3px' };
const MENTION_STYLE_MINE = { fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.25)', borderRadius: 4, padding: '0 3px' };

function fmtChatTime(d: string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ClientProjectDetailPage() {
  const { id } = useParams();
  const router  = useRouter();
  const [data, setData]       = useState<any>(null);
  const [tab, setTab]         = useState<Tab>('tasks');
  const [loading, setLoading] = useState(true);

  // Notification deep-links land here as ?tab=chat (see the `link` written by
  // Api\User\ProjectClientChatController / Api\Admin\ProjectClientChatController).
  // Read via window.location instead of useSearchParams so this page doesn't
  // need a Suspense boundary — same as /admin/clients/[id].
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && (TABS as readonly string[]).includes(requested)) setTab(requested as Tab);
  }, []);

  // Project chat — this project's own conversation with the Seller and
  // Company Admin (see Api\Client\ProjectChatController). Polled only while
  // the tab is open.
  const [chat, setChat]           = useState<{ participants: any[]; messages: any[]; mentionables: Mentionable[] } | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatText, setChatText]   = useState('');
  const [chatFile, setChatFile]   = useState<File | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  // @mentions — the client can tag their Seller and Company Admin, plus the
  // Project Manager once the Seller has invited them into this conversation.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<number[]>([]);

  // Revision modal
  const [revModal, setRevModal]     = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [revNotes, setRevNotes]     = useState('');
  const [revSaving, setRevSaving]   = useState(false);
  const [dlId, setDlId]             = useState<number | null>(null);

  const downloadFile = async (id: number, fileName: string, source: string) => {
    setDlId(id);
    try {
      const path = source === 'attachment' ? `/client/attachments/${id}/download` : `/client/documents/${id}/download`;
      const res = await clientApi.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
    finally { setDlId(null); }
  };

  const load = () => {
    clientService.project(Number(id))
      .then(setData)
      .catch(() => router.push('/client/projects'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const loadChat = () => {
    clientService.projectChat(Number(id))
      .then(r => setChat({ participants: r.thread?.participants ?? [], messages: r.messages ?? [], mentionables: r.mentionables ?? [] }))
      .catch(() => {});
  };

  // Only polls while the Chat tab is actually open — the other tabs are
  // static enough not to warrant a background request every few seconds.
  useEffect(() => {
    if (tab !== 'chat') return;
    setChatLoading(true);
    clientService.projectChat(Number(id))
      .then(r => setChat({ participants: r.thread?.participants ?? [], messages: r.messages ?? [], mentionables: r.mentionables ?? [] }))
      .catch(() => toast.error('Failed to load chat'))
      .finally(() => setChatLoading(false));
    const interval = setInterval(loadChat, 10000);
    return () => clearInterval(interval);
  }, [tab, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat?.messages?.length]);

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() && !chatFile) return;
    if (chatFile) {
      const ext = chatFile.name.split('.').pop()?.toLowerCase() ?? '';
      if (!CHAT_FILE_TYPES.includes(ext)) { toast.error(`${chatFile.name}: file type not allowed`); return; }
      if (chatFile.size > CHAT_MAX_MB * 1024 * 1024) { toast.error(`${chatFile.name}: exceeds ${CHAT_MAX_MB}MB limit`); return; }
    }
    setChatSending(true);
    try {
      const fd = new FormData();
      if (chatText.trim()) fd.append('content', chatText.trim());
      if (chatFile) fd.append('file', chatFile);
      selectedMentions.forEach(uid => fd.append('mentions[]', String(uid)));
      await clientService.projectChatSend(Number(id), fd);
      setChatText('');
      setChatFile(null);
      setSelectedMentions([]);
      setMentionQuery(null);
      loadChat();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send message');
    } finally { setChatSending(false); }
  };

  const mentionables = chat?.mentionables ?? [];
  const mentionNameById = Object.fromEntries(mentionables.map(m => [m.user_id, m.name ?? ''])) as Record<number, string>;

  const onChatTextChange = (v: string) => {
    setChatText(v);
    setMentionQuery(mentionQueryOf(v));
  };

  const pickMention = (userId: number, name: string) => {
    setChatText(t => applyMention(t, name));
    setSelectedMentions(prev => prev.includes(userId) ? prev : [...prev, userId]);
    setMentionQuery(null);
  };

  const downloadChatAttachment = async (messageId: number, fileName: string) => {
    try { await clientService.projectChatAttachment(Number(id), messageId, fileName); }
    catch { toast.error('Download failed'); }
  };

  // Own message only — enforced server-side too. Company Admin's unrestricted
  // delete authority only applies from the Admin panel's own client-chat page.
  const deleteChatMessage = async (messageId: number) => {
    if (!confirm('Delete this message?')) return;
    try {
      await clientService.projectChatDelete(Number(id), messageId);
      setChat(prev => prev ? {
        ...prev,
        messages: prev.messages.map((m: any) => m.id === messageId
          ? { ...m, is_deleted: true, content: null, attachment_name: null, attachment_path: null }
          : m),
      } : prev);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete message');
    }
  };

  const approve = async (deliverableId: number) => {
    try {
      await clientService.approveDeliverable(deliverableId);
      toast.success('Deliverable approved');
      load();
    } catch { toast.error('Failed to approve'); }
  };

  const openRevision = (deliverableId: number) => {
    setRevModal({ open: true, id: deliverableId });
    setRevNotes('');
  };

  const submitRevision = async () => {
    if (!revNotes.trim()) { toast.error('Please enter revision notes'); return; }
    if (!revModal.id) return;
    setRevSaving(true);
    try {
      await clientService.requestRevision(revModal.id, revNotes);
      toast.success('Revision requested');
      setRevModal({ open: false, id: null });
      setRevNotes('');
      load();
    } catch { toast.error('Failed to submit revision'); }
    finally { setRevSaving(false); }
  };

  if (loading) return <div style={{ padding: 40, color: '#94a3b8' }}>Loading…</div>;
  if (!data)   return null;

  const p   = data.project;
  const psc = SC[p.status] || { bg: '#f1f5f9', color: '#64748b' };
  const pct = p.progress ?? 0;

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20, paddingTop: 2 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>{p.name}</h1>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: psc.bg, color: psc.color, fontWeight: 600, textTransform: 'capitalize' }}>
              {p.status?.replace(/_/g, ' ')}
            </span>
          </div>
          {p.description && <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{p.description}</p>}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>
          <div>Start: {p.start_date || '—'}</div>
          <div>Deadline: <strong style={{ color: '#1e293b' }}>{p.deadline || '—'}</strong></div>
          {p.project_manager && <div style={{ marginTop: 2 }}>PM: <strong style={{ color: '#1e293b' }}>{p.project_manager.name}</strong></div>}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>Progress</span>
        <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16a34a' : GREEN, borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? '#16a34a' : GREEN, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderBottom: '1px solid #e2e8f0' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '9px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: 'none', border: 'none',
              color: tab === t ? GREEN : '#64748b',
              borderBottom: tab === t ? `2px solid ${GREEN}` : '2px solid transparent',
              textTransform: 'capitalize',
            }}>
            {t === 'chat' ? '💬 Project Chat' : t}
          </button>
        ))}
      </div>

      {/* TASKS */}
      {tab === 'tasks' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {(p.tasks || []).length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No tasks yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Task', 'Assigned To', 'Due Date', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {(p.tasks || []).map((t: any) => {
                  const sc = TASK_SC[t.status] || { bg: '#f1f5f9', color: '#64748b' };
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '11px 18px', fontSize: 13, color: '#1e293b' }}>{t.title}</td>
                      <td style={{ padding: '11px 18px', fontSize: 12, color: '#64748b' }}>{t.assigned_to?.name || '—'}</td>
                      <td style={{ padding: '11px 18px', fontSize: 12, color: '#64748b' }}>{t.due_date || '—'}</td>
                      <td style={{ padding: '11px 18px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
                          {t.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* DELIVERABLES */}
      {tab === 'deliverables' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(p.deliverables || []).length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 32, textAlign: 'center', color: '#94a3b8' }}>No deliverables yet.</div>
          ) : (
            (p.deliverables || []).map((d: any) => {
              const sc = SC[d.status] || { bg: '#f1f5f9', color: '#64748b' };
              return (
                <div key={d.id} style={{
                  background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                  padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{d.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
                        {d.status?.replace(/_/g, ' ')}
                      </span>
                      {d.uploaded_by && <span style={{ fontSize: 11, color: '#94a3b8' }}>by {d.uploaded_by.name}</span>}
                    </div>
                  </div>
                  {d.status === 'delivered' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => approve(d.id)}
                        style={{ padding: '6px 14px', background: GREEN, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => openRevision(d.id)}
                        style={{ padding: '6px 14px', background: '#fff', color: '#d97706', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        ↺ Request Revision
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* FILES */}
      {tab === 'files' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {(data.files || []).length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No files shared with you yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['File Name', 'Type', 'Size', 'Uploaded By', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
                <th style={{ padding: '10px 18px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Action</th>
              </tr></thead>
              <tbody>
                {(data.files || []).map((f: any) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 18px', fontSize: 13, color: '#1e293b' }}>{f.title}</td>
                    <td style={{ padding: '11px 18px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>{f.type || f.file_type || '—'}</td>
                    <td style={{ padding: '11px 18px', fontSize: 12, color: '#64748b' }}>
                      {f.file_size_bytes ? `${Math.round(f.file_size_bytes / 1024)} KB` : '—'}
                    </td>
                    <td style={{ padding: '11px 18px', fontSize: 12, color: '#64748b' }}>{f.uploaded_by?.name || '—'}</td>
                    <td style={{ padding: '11px 18px', fontSize: 12, color: '#64748b' }}>{f.created_at?.split('T')[0] || '—'}</td>
                    <td style={{ padding: '11px 18px', textAlign: 'right' }}>
                      <button
                        onClick={() => downloadFile(f.id, f.file_name || f.title, f.source)}
                        disabled={dlId === f.id}
                        style={{
                          fontSize: 12, color: dlId === f.id ? '#94a3b8' : GREEN, fontWeight: 600,
                          background: 'none', border: `1px solid ${dlId === f.id ? '#e2e8f0' : '#a7f3d0'}`,
                          borderRadius: 6, padding: '4px 12px', cursor: dlId === f.id ? 'not-allowed' : 'pointer',
                        }}>
                        {dlId === f.id ? '…' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ACTIVITY */}
      {tab === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {(data.activity || []).length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 32, textAlign: 'center', color: '#94a3b8' }}>No activity yet.</div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '8px 0' }}>
              {(data.activity || []).map((a: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 20px', borderBottom: i < data.activity.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                  <div style={{ fontSize: 18, lineHeight: '24px', flexShrink: 0 }}>{a.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#1e293b' }}>
                      {a.text}
                      {a.by && <span style={{ color: '#94a3b8', marginLeft: 4 }}>by {a.by}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {a.date ? new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROJECT CHAT — this project only. Same conversation the Seller and
          Company Admin see on their side; other projects have their own. */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 560, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Project Chat — {p.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {(chat?.participants ?? []).map((x: any) => x.name).filter(Boolean).join(', ') || 'Your Seller and Company Admin'}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
            {chatLoading && !chat ? (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading…</div>
            ) : (chat?.messages ?? []).length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                No messages on this project yet. Say hello 👋
              </div>
            ) : (chat?.messages ?? []).map((msg: any) => {
              // Cookie-free "is this mine" check — the client is the only
              // role_type='client' party in this thread, so no auth cookie is
              // read during render (which would break hydration).
              const isMe = msg.sender?.role_type === 'client';
              const senderName = msg.sender_admin?.name
                ? `${msg.sender_admin.name} (Admin)`
                : msg.sender?.name ?? 'Unknown';
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', marginBottom: 12, gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isMe ? 'linear-gradient(135deg,#10b981,#059669)' : '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: isMe ? '#fff' : '#64748b',
                  }}>
                    {senderName?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ maxWidth: '70%' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3, textAlign: isMe ? 'right' : 'left' }}>
                      {senderName} · {fmtChatTime(msg.sent_at)}
                    </div>
                    <div style={{
                      padding: '8px 12px', borderRadius: 10,
                      background: isMe ? GREEN : '#fff',
                      color: isMe ? '#fff' : '#1e293b',
                      border: isMe ? 'none' : '1px solid #e2e8f0',
                      fontSize: 13, whiteSpace: 'pre-wrap',
                    }}>
                      {msg.is_deleted ? (
                        <div style={{ fontStyle: 'italic', color: isMe ? 'rgba(255,255,255,0.75)' : '#94a3b8' }}>This message was deleted</div>
                      ) : (
                        <>
                          {renderWithMentions(msg.content, msg.mentions, mentionNameById, isMe ? MENTION_STYLE_MINE : MENTION_STYLE)}
                          {msg.attachment_name && (
                            <button
                              onClick={() => downloadChatAttachment(msg.id, msg.attachment_name)}
                              style={{
                                display: 'block', marginTop: msg.content ? 6 : 0, padding: '4px 10px',
                                borderRadius: 6, cursor: 'pointer', fontSize: 12,
                                border: `1px solid ${isMe ? 'rgba(255,255,255,0.35)' : '#e2e8f0'}`,
                                background: isMe ? 'rgba(255,255,255,0.12)' : '#f8fafc',
                                color: isMe ? '#fff' : GREEN,
                              }}>
                              📎 {msg.attachment_name}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {isMe && !msg.is_deleted && (
                      <div style={{ textAlign: 'right', marginTop: 3 }}>
                        <button onClick={() => deleteChatMessage(msg.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          <form onSubmit={sendChat} style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', position: 'relative' }}>
            {/* Tag suggestions — exactly who the server will accept, so a tag
                is never silently dropped on send. */}
            {mentionQuery !== null && matchMentionables(mentionables, mentionQuery).length > 0 && (
              <div style={{ position: 'absolute', bottom: '100%', left: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: 6, maxHeight: 180, overflowY: 'auto', minWidth: 200, zIndex: 5 }}>
                {matchMentionables(mentionables, mentionQuery).map(p => (
                  <div key={p.user_id} onClick={() => pickMention(p.user_id, p.name ?? '')} style={{ padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', color: '#334155' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    {p.name} {p.role_type && <span style={{ color: '#94a3b8', fontSize: 11 }}>({roleLabel(p.role_type)})</span>}
                  </div>
                ))}
              </div>
            )}
            {chatFile && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12, color: '#334155' }}>
                <span>📎 {chatFile.name}</span>
                <button type="button" onClick={() => setChatFile(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center' }}>
                📎
                <input type="file" style={{ display: 'none' }} accept={CHAT_FILE_TYPES.map(t => `.${t}`).join(',')}
                  onChange={e => { setChatFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              </label>
              <input
                value={chatText}
                onChange={e => onChatTextChange(e.target.value)}
                placeholder="Type a message… use @ to tag"
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
              />
              <button
                type="submit"
                disabled={chatSending || (!chatText.trim() && !chatFile)}
                style={{
                  padding: '8px 18px', background: chatSending ? '#a7f3d0' : GREEN,
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: chatSending || (!chatText.trim() && !chatFile) ? 'not-allowed' : 'pointer',
                }}>
                Send
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Revision Notes Modal */}
      {revModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Request Revision</h3>
              <button onClick={() => setRevModal({ open: false, id: null })} style={{ background: 'none', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}>×</button>
            </div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
              Revision Notes <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              value={revNotes}
              onChange={e => setRevNotes(e.target.value)}
              rows={4}
              placeholder="Describe the changes needed…"
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={submitRevision}
                disabled={revSaving || !revNotes.trim()}
                style={{
                  flex: 1, padding: '10px', background: revSaving ? '#fde68a' : '#d97706',
                  color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: revSaving || !revNotes.trim() ? 'not-allowed' : 'pointer',
                }}>
                {revSaving ? 'Submitting…' : 'Submit Revision'}
              </button>
              <button
                onClick={() => setRevModal({ open: false, id: null })}
                style={{ padding: '10px 18px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
