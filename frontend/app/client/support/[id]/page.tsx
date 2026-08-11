'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientService } from '@/lib/services/clientService';
import toast from 'react-hot-toast';

const GREEN = '#10b981';
const SC: Record<string, { bg: string; color: string }> = {
  open:        { bg: '#eff6ff', color: '#2563eb' },
  in_progress: { bg: '#fffbeb', color: '#d97706' },
  resolved:    { bg: '#ecfdf5', color: '#059669' },
  closed:      { bg: '#f1f5f9', color: '#64748b' },
};

export default function ClientTicketDetailPage() {
  const { id }    = useParams();
  const router    = useRouter();
  const [data, setData]         = useState<any>(null);
  const [replyMsg, setReplyMsg] = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    clientService.ticket(Number(id))
      .then(setData)
      .catch(() => router.push('/client/support'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data]);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMsg.trim()) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('message', replyMsg);
      if (file) fd.append('attachment', file);
      await clientService.ticketReply(Number(id), fd);
      setReplyMsg('');
      setFile(null);
      toast.success('Reply sent');
      load();
    } catch { toast.error('Failed to send reply'); }
    finally { setSending(false); }
  };

  if (loading) return <div style={{ padding: 40, color: '#94a3b8' }}>Loading...</div>;
  if (!data)   return null;

  const t  = data.ticket;
  const sc = SC[t.status] || { bg: '#f1f5f9', color: '#64748b' };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>#{t.id} — {t.subject}</h1>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 600 }}>
              {t.status.replace(/_/g, ' ')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Category: {t.category} · Priority: <strong style={{ color: t.priority === 'high' ? '#dc2626' : '#64748b' }}>{t.priority}</strong>
          </div>
        </div>
      </div>

      {t.description && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Description</div>
          <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6 }}>{t.description}</div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
          Conversation ({data.replies?.length || 0} replies)
        </div>
        <div style={{ padding: '12px 18px', maxHeight: 360, overflowY: 'auto' }}>
          {(data.replies || []).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>No replies yet.</div>
          ) : (
            (data.replies || []).map((r: any) => {
              const isClient = r.replied_by?.role_type === 'client';
              return (
                <div key={r.id} style={{ display: 'flex', flexDirection: isClient ? 'row-reverse' : 'row', gap: 10, marginBottom: 14 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: isClient ? 'linear-gradient(135deg,#10b981,#059669)' : '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: isClient ? '#fff' : '#64748b',
                  }}>
                    {r.replied_by?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ maxWidth: '75%' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3, textAlign: isClient ? 'right' : 'left' }}>
                      {r.replied_by?.name || 'Support'} · {r.created_at?.split('T')[0]}
                    </div>
                    <div style={{
                      padding: '10px 14px', borderRadius: 10,
                      background: isClient ? GREEN : '#f1f5f9',
                      color: isClient ? '#fff' : '#1e293b',
                      fontSize: 13, lineHeight: 1.5,
                    }}>
                      {r.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {['open', 'in_progress'].includes(t.status) && (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 12 }}>Add Reply</div>
          <form onSubmit={sendReply}>
            <textarea
              value={replyMsg}
              onChange={e => setReplyMsg(e.target.value)}
              rows={4}
              placeholder="Write your reply…"
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
                borderRadius: 8, fontSize: 13, outline: 'none',
                boxSizing: 'border-box', resize: 'vertical', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12, color: '#64748b', flex: 1 }} />
              <button
                type="submit" disabled={sending || !replyMsg.trim()}
                style={{
                  padding: '8px 20px', background: sending ? '#a7f3d0' : GREEN,
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                }}>
                {sending ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
