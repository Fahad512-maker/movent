'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { userService, UserActivity } from '@/lib/services/userService';
import { ROLE_LABELS, computeAccessLabel } from '@/lib/roleUtils';
import { MODULE_CATALOG } from '@/lib/moduleCatalog';
import { SIMPLE_PROJECT_PERMISSIONS, collapseProjectPermissions } from '@/lib/simplifiedProjectPermissions';
import { User } from '@/types';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { HiArrowLeft, HiPencilSquare } from 'react-icons/hi2';

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  active:    { color: '#059669', bg: '#ecfdf5', label: 'Active'    },
  invited:   { color: '#d97706', bg: '#fffbeb', label: 'Invited'   },
  suspended: { color: '#dc2626', bg: '#fef2f2', label: 'Suspended' },
};

const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', padding: 24, marginBottom: 20 };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };
const fieldValue: React.CSSProperties = { fontSize: 13, color: '#0f172a', marginTop: 4 };

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function UserProfilePage() {
  useAdminGuard();
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [user, setUser] = useState<User | null>(null);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([userService.getOne(id), userService.getActivity(id)])
      .then(([u, act]) => { setUser(u); setActivity(act); })
      .catch(() => setError('Failed to load user'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <DashboardLayout title="User Profile"><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  if (error || !user) return <DashboardLayout title="User Profile"><div style={{ padding: 60, textAlign: 'center', color: '#dc2626' }}>{error || 'User not found'}</div></DashboardLayout>;

  const st = STATUS_CFG[user.status ?? 'active'] ?? STATUS_CFG['active'];
  const assignments = user.company_assignments ?? [];
  const merged: Record<string, string[]> = {};
  for (const a of assignments) {
    for (const [mod, keys] of Object.entries(a.permissions)) {
      merged[mod] = Array.from(new Set([...(merged[mod] ?? []), ...keys]));
    }
  }
  const accessLabel = Object.keys(merged).length > 0 ? computeAccessLabel(merged) : (ROLE_LABELS[user.role_type] ?? user.role_type);

  return (
    <DashboardLayout title="User Profile">
      <div style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button onClick={() => router.push('/admin/users')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
            <HiArrowLeft size={16} /> Back to Users
          </button>
          <button onClick={() => router.push(`/admin/users/${id}/edit`)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <HiPencilSquare size={14} /> Edit User
          </button>
        </div>

        {/* Header card */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
              {user.avatar_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_path} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: 0 }}>{user.name}</h1>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>
                  {st.label}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>{user.email}{user.phone ? ` · ${user.phone}` : ''}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 50, fontSize: 12, fontWeight: 600, background: '#eff6ff', color: '#2563eb' }}>{accessLabel}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{ROLE_LABELS[user.role_type] ?? user.role_type}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div style={card}>
          <h3 style={sectionTitle}>Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            <div><div style={fieldLabel}>Company</div><div style={fieldValue}>{user.company?.name ?? '—'}</div></div>
            <div><div style={fieldLabel}>Created By</div><div style={fieldValue}>{user.created_by?.name ?? 'Company Admin'}</div></div>
            <div><div style={fieldLabel}>Joined Date</div><div style={fieldValue}>{fmtDate(user.created_at)}</div></div>
            <div><div style={fieldLabel}>Last Login</div><div style={fieldValue}>{fmtDate(user.last_login_at)}</div></div>
          </div>
        </div>

        {/* Modules, permissions & data scope */}
        <div style={card}>
          <h3 style={sectionTitle}>Assigned Modules &amp; Permissions</h3>
          {Object.keys(merged).length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>No modules assigned.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Object.entries(merged).map(([modKey, perms]) => {
                const mod = MODULE_CATALOG.find(m => m.key === modKey);
                // Project Management: show the simplified permission labels
                // (same ones used on Add/Edit User) instead of up to 52
                // granular chips — a simple permission shows only when every
                // one of its underlying granular keys is granted.
                const chips = modKey === 'project_management'
                  ? collapseProjectPermissions(perms).map(k => SIMPLE_PROJECT_PERMISSIONS.find(p => p.key === k)?.label ?? k)
                  : perms.map(p => mod?.permissions.find(mp => mp.key === p)?.label ?? p);
                return (
                  <div key={modKey} style={{ border: '1.5px solid #f1f5f9', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: mod?.color ?? '#475569' }}>{mod?.name ?? modKey}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {chips.map(label => (
                        <span key={label} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Project Management activity */}
        {activity?.project_management_active && (
          <div style={card}>
            <h3 style={sectionTitle}>Project Management</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
              {[
                { label: 'Managed Projects', count: activity.managed_projects?.length ?? 0 },
                { label: 'Member Of', count: activity.member_projects?.length ?? 0 },
                { label: 'Assigned Tasks', count: activity.assigned_tasks?.length ?? 0 },
                { label: 'Production Tasks', count: activity.production_tasks?.length ?? 0 },
                { label: 'Timesheets', count: activity.timesheets?.length ?? 0 },
                { label: 'Deliverables', count: activity.deliverables?.length ?? 0 },
              ].map(s => (
                <div key={s.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{s.count}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {!!activity.managed_projects?.length && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...fieldLabel, marginBottom: 6 }}>Managed Projects</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {activity.managed_projects.map(p => (
                    <span key={p.id} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>{p.name}</span>
                  ))}
                </div>
              </div>
            )}
            {!!activity.assigned_tasks?.length && (
              <div>
                <div style={{ ...fieldLabel, marginBottom: 6 }}>Assigned Tasks</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {activity.assigned_tasks.map(t => (
                    <span key={t.id} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#f1f5f9', color: '#475569' }}>{t.title}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity logs */}
        <div style={{ ...card, marginBottom: 0 }}>
          <h3 style={sectionTitle}>Activity Logs</h3>
          {!activity?.audit_logs.length ? (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>No activity recorded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activity.audit_logs.map(log => (
                <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ fontSize: 13, color: '#334155' }}>{humanizeAction(log.action)}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDate(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
