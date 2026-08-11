'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { userService } from '@/lib/services/userService';
import { ROLE_LABELS } from '@/lib/roleUtils';
import { MODULE_CATALOG } from '@/lib/moduleCatalog';
import { User } from '@/types';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { HiUserPlus, HiTrash, HiCheckCircle, HiClipboard, HiArrowPath, HiNoSymbol, HiPlay, HiPencilSquare, HiEye, HiKey } from 'react-icons/hi2';

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  active:    { color: '#059669', bg: '#ecfdf5', label: 'Active'    },
  invited:   { color: '#d97706', bg: '#fffbeb', label: 'Invited'   },
  suspended: { color: '#dc2626', bg: '#fef2f2', label: 'Suspended' },
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'invited')   return <HiArrowPath size={13} />;
  if (status === 'suspended') return <HiNoSymbol size={13} />;
  return <HiCheckCircle size={13} />;
}

/** Merge permissions across all of this user's (already company-scoped) assignments. */
function mergedPermissions(user: User): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const a of user.company_assignments ?? []) {
    for (const [mod, keys] of Object.entries(a.permissions)) {
      if (!merged[mod]) merged[mod] = [];
      for (const k of keys) {
        if (!merged[mod].includes(k)) merged[mod].push(k);
      }
    }
  }
  return merged;
}

/** Module keys with at least one granted permission, mapped to display names. */
function getActiveModules(user: User): string[] {
  const merged = mergedPermissions(user);
  return Object.entries(merged)
    // 'account' is the common "can add users" capability, not a work module — shown separately.
    .filter(([modKey, keys]) => modKey !== 'account' && keys.length > 0)
    .map(([modKey]) => MODULE_CATALOG.find(m => m.key === modKey)?.name ?? modKey);
}

/** Whether this user has been granted the common "can add other users" capability. */
function canAddUsers(user: User): boolean {
  return mergedPermissions(user)['account']?.includes('canAddUsers') ?? false;
}

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UsersPage() {
  useAdminGuard();
  const router = useRouter();
  const [users, setUsers]           = useState<User[]>([]);
  const [used, setUsed]             = useState(0);
  const [limit, setLimit]           = useState<number | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [copiedId, setCopiedId]     = useState<number | null>(null);
  const [resetInfo, setResetInfo]   = useState<{ name: string; password: string } | null>(null);
  const [resetCopied, setResetCopied] = useState(false);

  const load = async () => {
    try {
      const data = await userService.list();
      setUsers(data.users);
      setUsed(data.used);
      setLimit(data.limit);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const atLimit = limit !== null && used >= limit;

  const handleResend = async (user: User) => {
    setActionBusy(user.id);
    try {
      const updated = await userService.resendInvite(user.id);
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
    } catch { alert('Failed to resend invite'); }
    finally { setActionBusy(null); }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    if (!confirm(`${newStatus === 'suspended' ? 'Suspend' : 'Reactivate'} ${user.name}?`)) return;
    setActionBusy(user.id);
    try {
      const updated = await userService.toggleStatus(user.id, newStatus);
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
    } catch { alert('Failed to update status'); }
    finally { setActionBusy(null); }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Remove ${user.name} from this company? This does not delete their account if they belong to another company.`)) return;
    setActionBusy(user.id);
    try {
      await userService.remove(user.id);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      setUsed(u => Math.max(0, u - 1));
    } catch { alert('Failed to remove user'); }
    finally { setActionBusy(null); }
  };

  const handleResetPassword = async (user: User) => {
    if (!confirm(`Reset ${user.name}'s password? A new temporary password will be generated.`)) return;
    setActionBusy(user.id);
    try {
      const { password } = await userService.resetPassword(user.id);
      setResetInfo({ name: user.name, password });
      setResetCopied(false);
    } catch { alert('Failed to reset password'); }
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
    <DashboardLayout title="Users & Permissions">
      <div style={{ maxWidth: 1280 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Users & Permissions</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
              {used}{limit ? ` / ${limit}` : ''} seats used
              {atLimit && <span style={{ color: '#dc2626', fontWeight: 600 }}> — Limit reached</span>}
            </p>
          </div>
          <button
            onClick={() => router.push('/admin/users/new')}
            disabled={atLimit}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 9, border: 'none', background: atLimit ? '#e2e8f0' : 'linear-gradient(135deg,#2563eb,#3b82f6)', color: atLimit ? '#94a3b8' : '#fff', fontSize: 14, fontWeight: 600, cursor: atLimit ? 'not-allowed' : 'pointer' }}
          >
            <HiUserPlus size={17} /> Add User
          </button>
        </div>

        {atLimit && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16 }}>
            You have reached your user limit ({limit} seats). Upgrade your plan to invite more users.
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Reset password result — shown once, matching the create-user "copy credentials" pattern */}
        {resetInfo && (
          <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>
              Password reset for {resetInfo.name}
            </div>
            <div style={{ fontSize: 12, color: '#3b82f6', marginBottom: 10 }}>
              Share this temporary password with them now — it will not be shown again.
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: '#0f172a', fontFamily: 'monospace' }}>
                {resetInfo.password}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetInfo.password);
                  setResetCopied(true);
                  setTimeout(() => setResetCopied(false), 2000);
                }}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: resetCopied ? '#ecfdf5' : '#fff', color: resetCopied ? '#059669' : '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                {resetCopied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={() => setResetInfo(null)} style={{ padding: '9px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 12 }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading users…</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 64, textAlign: 'center' }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>👥</div>
              <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6, fontSize: 15 }}>No team members yet</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Add your first team member to get started</div>
              <button onClick={() => router.push('/admin/users/new')} style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Add Someone
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #f1f5f9' }}>
                    {['Name', 'Role', 'Active Modules', 'Status', 'Last Login', 'Created', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => {
                    const st      = STATUS_CFG[user.status ?? 'active'] ?? STATUS_CFG['active'];
                    const busy    = actionBusy === user.id;
                    const modules = getActiveModules(user);

                    return (
                      <tr key={user.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #f8fafc' : 'none', opacity: busy ? 0.6 : 1 }}>

                        {/* Name + email */}
                        <td style={{ padding: '14px 16px', minWidth: 180 }}>
                          <button onClick={() => router.push(`/admin/users/${user.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{user.name}</div>
                          </button>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{user.email}</div>
                        </td>

                        {/* Role — just the role_type label, nothing else */}
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 50, fontSize: 12, fontWeight: 600, background: '#eff6ff', color: '#2563eb', whiteSpace: 'nowrap' }}>
                            {ROLE_LABELS[user.role_type] ?? user.role_type}
                          </span>
                        </td>

                        {/* Active modules */}
                        <td style={{ padding: '14px 16px', maxWidth: 220 }}>
                          {modules.length > 0 || canAddUsers(user) ? (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {modules.map(m => (
                                <span key={m} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  {m}
                                </span>
                              ))}
                              {canAddUsers(user) && (
                                <span title="Can create/invite other users" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  + Add Users
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 50, fontSize: 12, fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                            <StatusIcon status={user.status ?? 'active'} /> {st.label}
                          </span>
                        </td>

                        {/* Last login */}
                        <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {fmtDate(user.last_login_at)}
                        </td>

                        {/* Created date */}
                        <td style={{ padding: '14px 16px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {fmtDate(user.created_at)}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => router.push(`/admin/users/${user.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <HiEye size={13} /> View
                            </button>
                            <button onClick={() => router.push(`/admin/users/${user.id}/edit`)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <HiPencilSquare size={13} /> Edit
                            </button>
                            <button onClick={() => router.push(`/admin/users/${user.id}/edit?tab=permissions`)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              Permissions
                            </button>
                            {user.status === 'invited' ? (
                              <>
                                {user.invite_url && (
                                  <button onClick={() => copyLink(user)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0', background: copiedId === user.id ? '#ecfdf5' : '#fff', color: copiedId === user.id ? '#059669' : '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    <HiClipboard size={13} /> {copiedId === user.id ? 'Copied' : 'Copy Link'}
                                  </button>
                                )}
                                <button onClick={() => handleResend(user)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #fde68a', background: '#fffbeb', color: '#d97706', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  <HiArrowPath size={13} /> Resend
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleToggleStatus(user)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: `1.5px solid ${user.status === 'active' ? '#fecaca' : '#bbf7d0'}`, background: user.status === 'active' ? '#fff' : '#f0fdf4', color: user.status === 'active' ? '#dc2626' : '#059669', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  {user.status === 'active' ? <HiNoSymbol size={13} /> : <HiPlay size={13} />}
                                  {user.status === 'active' ? 'Suspend' : 'Activate'}
                                </button>
                                <button onClick={() => handleResetPassword(user)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  <HiKey size={13} /> Reset Password
                                </button>
                              </>
                            )}

                            <button onClick={() => handleDelete(user)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1.5px solid #fee2e2', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                              <HiTrash size={13} />
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
