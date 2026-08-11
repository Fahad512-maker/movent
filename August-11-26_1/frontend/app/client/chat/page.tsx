'use client';
import { useEffect, useRef, useState } from 'react';
import { clientService } from '@/lib/services/clientService';
import toast from 'react-hot-toast';

const GREEN = '#10b981';

export default function ClientChatPage() {
  const [threads, setThreads]         = useState<any[]>([]);
  const [activeThread, setActiveThread] = useState<any>(null);
  const [messages, setMessages]       = useState<any[]>([]);
  const [reply, setReply]             = useState('');
  const [sending, setSending]         = useState(false);
  const [loading, setLoading]         = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // "Start New Conversation" — only ever offers the allow-listed contacts
  // (Company Admin / linked Seller / Finance where relevant); the backend
  // re-validates regardless (Api\Client\ChatController::startChat()).
  const [showPicker, setShowPicker]   = useState(false);
  const [contacts, setContacts]       = useState<Array<{ type: 'admin' | 'user'; id: number; name: string; role: string }>>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [starting, setStarting]       = useState(false);

  const loadThreads = () => {
    setLoading(true);
    clientService.chatThreads()
      .then(data => { setThreads(data); if (data.length > 0 && !activeThread) selectThread(data[0]); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadThreads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openPicker = () => {
    setShowPicker(true);
    setLoadingContacts(true);
    clientService.chatEligibleContacts()
      .then(setContacts)
      .catch(() => toast.error('Failed to load contacts'))
      .finally(() => setLoadingContacts(false));
  };

  const startChat = async (contact: { type: 'admin' | 'user'; id: number }) => {
    setStarting(true);
    try {
      const { thread_id } = await clientService.chatStart(contact);
      setShowPicker(false);
      const data = await clientService.chatThreads();
      setThreads(data);
      const thread = data.find((t: any) => t.id === thread_id);
      if (thread) selectThread(thread);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not start conversation');
    } finally {
      setStarting(false);
    }
  };

  const selectThread = (thread: any) => {
    setActiveThread(thread);
    clientService.chatMessages(thread.id).then(setMessages);
  };

  // Poll every 10s
  useEffect(() => {
    if (!activeThread) return;
    const interval = setInterval(() => {
      clientService.chatMessages(activeThread.id).then(setMessages);
    }, 10000);
    return () => clearInterval(interval);
  }, [activeThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async () => {
    if (!reply.trim() || !activeThread) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('content', reply);
      await clientService.chatReply(activeThread.id, fd);
      setReply('');
      const msgs = await clientService.chatMessages(activeThread.id);
      setMessages(msgs);
    } catch { toast.error('Failed to send'); }
    finally { setSending(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Chat</h1>
        <button
          onClick={openPicker}
          style={{ padding: '8px 16px', background: GREEN, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Start New Conversation
        </button>
      </div>

      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowPicker(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Start a Conversation</h3>
            {loadingContacts ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>Loading contacts…</div>
            ) : contacts.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>No contacts available.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contacts.map(c => (
                  <button
                    key={`${c.type}-${c.id}`}
                    onClick={() => startChat(c)}
                    disabled={starting}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff',
                      cursor: starting ? 'not-allowed' : 'pointer', textAlign: 'left', fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{c.role.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', height: 560, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {/* Thread list */}
        <div style={{ width: 240, borderRight: '1px solid #e2e8f0', overflowY: 'auto' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Conversations</div>
          {loading ? (
            <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>Loading...</div>
          ) : threads.length === 0 ? (
            <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>No conversations yet.</div>
          ) : threads.map((t: any) => (
            <div
              key={t.id}
              onClick={() => selectThread(t)}
              style={{
                padding: '12px 14px', cursor: 'pointer',
                borderBottom: '1px solid #f8fafc',
                background: activeThread?.id === t.id ? '#ecfdf5' : '#fff',
              }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: activeThread?.id === t.id ? GREEN : '#1e293b' }}>
                {t.title || `Thread #${t.id}`}
              </div>
              {t.messages?.[0] && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.messages[0].content}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!activeThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
              Select a conversation
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                {activeThread.title || `Thread #${activeThread.id}`}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {messages.map((msg: any) => {
                  const isMe = msg.sender?.role_type === 'client';
                  const senderName = msg.sender_admin?.name
                    ? `${msg.sender_admin.name} (Admin)`
                    : msg.sender?.name ?? 'Unknown';
                  return (
                    <div key={msg.id} style={{
                      display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row',
                      marginBottom: 12, gap: 8,
                    }}>
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
                          {senderName}
                        </div>
                        <div style={{
                          padding: '8px 12px', borderRadius: 10,
                          background: isMe ? GREEN : '#f1f5f9',
                          color: isMe ? '#fff' : '#1e293b',
                          fontSize: 13,
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
                <input
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder="Type a message…"
                  style={{
                    flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
                    fontSize: 13, outline: 'none',
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  style={{
                    padding: '8px 18px', background: sending ? '#a7f3d0' : GREEN,
                    color: '#fff', border: 'none', borderRadius: 8, fontSize: 13,
                    cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 600,
                  }}>
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
