'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { userService } from '@/lib/services/userService';
import { User } from '@/types';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { HiArrowPath, HiClipboard, HiTrash, HiUserPlus } from 'react-icons/hi2';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InvitationsPage() {
  useAdminGuard();
  const router = useRouter();
  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [copiedId, setCopiedId]     = useState<number | null>(null);

  const load = async () => {
    try {
      const data = await userService.list('invited');
      setUsers(data.users);
    } catch {
      setError('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleResend = async (user: User) => {
    setActionBusy(user.id);
    try {
      const updated = await userService.resendInvite(user.id);
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
    } catch { alert('Failed to resend invite'); }
    finally { setActionBusy(null); }
  };

  const handleCancel = async (user: User) => {
    if (!confirm(`Cancel the invitation for ${user.name}?`)) return;
    setActionBusy(user.id);
    try {
      await userService.remove(user.id);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch { alert('Failed to cancel invitation'); }
    finally { setActionBusy(null); }
  };

  const copyLink = (user: User) => {
    if (!user.invite_url) return;
    navigator.clipboard.writeText(user.invite_url).then(() => {
      setCopiedId(user.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <DashboardLayout title="Invitations">
      <div style={{ maxWidth: 1100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Invitations</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Pending invites waiting to be accepted.</p>
          </div>
          <button
            onClick={() => router.push('/users/invite')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <HiUserPlus size={17} /> Invite User
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 64, textAlign: 'center' }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>✉️</div>
              <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6, fontSize: 15 }}>No pending invitations</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Everyone you've invited has already joined.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                    {['Name', 'Invited On', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => {
                    const busy = actionBusy === user.id;
                    return (
                      <tr key={user.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #f8fafc' : 'none', opacity: busy ? 0.6 : 1 }}>
                        <td style={{ padding: '14px 16px', minWidth: 180 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{user.name}</div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{user.email}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {fmtDate(user.created_at)}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {user.invite_url && (
                              <button onClick={() => copyLink(user)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0', background: copiedId === user.id ? '#ecfdf5' : '#fff', color: copiedId === user.id ? '#059669' : '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <HiClipboard size={13} /> {copiedId === user.id ? 'Copied' : 'Copy Link'}
                              </button>
                            )}
                            <button onClick={() => handleResend(user)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #fde68a', background: '#fffbeb', color: '#d97706', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <HiArrowPath size={13} /> Resend
                            </button>
                            <button onClick={() => handleCancel(user)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <HiTrash size={13} /> Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
