'use client';
import { useEffect, useRef, useState } from 'react';
import { clientService } from '@/lib/services/clientService';
import toast from 'react-hot-toast';

const GREEN = '#10b981';

// One single Sales Chat conversation — Seller <-> Client <-> Company Admin,
// nobody else. No thread picker: every message the client, their linked
// Seller, or Company Admin sends lands in this same conversation (see
// Api\Client\ChatController).
export default function ClientChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = () => {
    clientService.chatMessages().then(setMessages).catch(() => {});
  };

  useEffect(() => {
    setLoading(true);
    clientService.chatMessages()
      .then(setMessages)
      .finally(() => setLoading(false));

    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('content', reply);
      await clientService.chatReply(fd);
      setReply('');
      loadMessages();
    } catch { toast.error('Failed to send'); }
    finally { setSending(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Chat</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Message your Seller or Company Admin</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', height: 560, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading…</div>
          ) : messages.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No messages yet. Say hello 👋</div>
          ) : messages.map((msg: any) => {
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
      </div>
    </div>
  );
}
