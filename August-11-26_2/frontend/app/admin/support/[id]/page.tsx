'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { adminSupportService } from '@/lib/services/adminSupportService';
import { userService } from '@/lib/services/userService';

const GREEN = '#2563eb';
const SC: Record<string, { bg: string; color: string }> = {
  open:        { bg: '#eff6ff', color: '#2563eb' },
  in_progress: { bg: '#fffbeb', color: '#d97706' },
  resolved:    { bg: '#ecfdf5', color: '#059669' },
  closed:      { bg: '#f1f5f9', color: '#64748b' },
};
const STATUS_OPTS = ['open', 'in_progress', 'resolved', 'closed'];

export default function AdminSupportTicketPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const [data, setData]         = useState<any>(null);
  const [staff, setStaff]       = useState<{ id: number; name: string; role_type: string }[]>([]);
  const [replyMsg, setReplyMsg] = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [savingAssign, setSavingAssign] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    adminSupportService.get(Number(id))
      .then(setData)
      .catch(() => router.push('/admin/support'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [data]);
  useEffect(() => {
    userService.list().then(r => setStaff((r.users || []).filter((u: any) => u.role_type !== 'client'))).catch(() => {});
  }, []);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMsg.trim()) return;
    setSending(true);
    try {
      await adminSupportService.reply(Number(id), replyMsg, file);
      setReplyMsg('');
      setFile(null);
      toast.success('Reply sent');
      load();
    } catch { toast.error('Failed to send reply'); }
    finally { setSending(false); }
  };

  const changeAssign = async (userId: string) => {
    setSavingAssign(true);
    try {
      await adminSupportService.assign(Number(id), userId ? Number(userId) : null);
      toast.success('Assignment updated');
      load();
    } catch { toast.error('Failed to update assignment'); }
    finally { setSavingAssign(false); }
  };

  const changeStatus = async (status: string) => {
    setSavingStatus(true);
    try {
      await adminSupportService.updateStatus(Number(id), status);
      toast.success('Status updated');
      load();
    } catch { toast.error('Failed to update status'); }
    finally { setSavingStatus(false); }
  };

  if (loading) return <DashboardLayout title="Support Ticket"><div style={{ padding: 40, color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (!data)   return null;

  const t  = data.ticket;
  const sc = SC[t.status] || { bg: '#f1f5f9', color: '#64748b' };

  return (
    <DashboardLayout title={`Ticket #${t.id}`}>
      <div style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.push('/admin/support')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>#{t.id} — {t.subject}</h1>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 600 }}>
                {t.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              Raised by {t.raisedBy?.name || '—'} · Category: {t.category} · Priority: <strong style={{ color: t.priority === 'high' || t.priority === 'urgent' ? '#dc2626' : '#64748b' }}>{t.priority}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>ASSIGNED TO</div>
            <select
              value={t.assigned_to || ''}
              disabled={savingAssign}
              onChange={e => changeAssign(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
            >
              <option value="">Unassigned</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>STATUS</div>
            <select
              value={t.status}
              disabled={savingStatus}
              onChange={e => changeStatus(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, textTransform: 'capitalize' }}
            >
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>

        {t.description && (
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Description</div>
            <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6 }}>{t.description}</div>
            {t.attachment_url && (
              <a href={t.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: GREEN, fontWeight: 600 }}>
                📎 {t.attachment_name || 'Attachment'}
              </a>
            )}
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            Conversation ({data.replies?.length || 0} replies)
          </div>
          <div style={{ padding: '12px 18px', maxHeight: 420, overflowY: 'auto' }}>
            {(data.replies || []).length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>No replies yet.</div>
            ) : (
              (data.replies || []).map((r: any) => {
                const isClient = r.repliedBy?.role_type === 'client';
                const authorName = r.repliedByAdmin?.name || r.repliedBy?.name || (isClient ? 'Client' : 'Support');
                return (
                  <div key={r.id} style={{ display: 'flex', flexDirection: isClient ? 'row' : 'row-reverse', gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: isClient ? '#e2e8f0' : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: isClient ? '#64748b' : '#fff',
                    }}>
                      {authorName?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ maxWidth: '75%' }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3, textAlign: isClient ? 'left' : 'right' }}>
                        {authorName} · {r.created_at?.split('T')[0]}
                      </div>
                      <div style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: isClient ? '#f1f5f9' : GREEN,
                        color: isClient ? '#1e293b' : '#fff',
                        fontSize: 13, lineHeight: 1.5,
                      }}>
                        {r.message}
                      </div>
                      {r.attachment_url && (
                        <a href={r.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4, fontSize: 11, color: GREEN }}>
                          📎 {r.attachment_name || 'Attachment'}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </div>

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
                  padding: '8px 20px', background: sending ? '#93c5fd' : GREEN,
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                }}>
                {sending ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
