'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HiBell, HiChevronDown, HiBuildingOffice2 } from 'react-icons/hi2';
import { getAuthUser, getAuthType, getActiveCompany } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import { User, Admin } from '@/types';
import { notificationService } from '@/lib/services/notificationService';
import { adminNotificationService } from '@/lib/services/adminNotificationService';
import { resolveAvatarUrl } from '@/lib/services/profileService';

// Common shape both the staff (notifications table) and admin (SystemAuditLog
// activity feed) sources are normalized into for display — the two backends
// have different underlying models but render identically here.
interface NotifItem {
  id: number;
  // React-key + admin-side routing only — undefined for staff notifications
  // (single source, plain `id` is already unique there).
  key?: string;
  source?: 'audit' | 'notification';
  title: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
  link: string | null;
}

export default function Navbar({ title = 'Dashboard' }: { title?: string }) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const [user, setUser]                 = useState<User | Admin | null>(null);
  const [authType, setAuthType]         = useState<'user' | 'admin' | null>(null);
  const [activeCompanyName, setActiveCompanyName] = useState<string | null>(null);
  const [multiCompany, setMultiCompany] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const { logoutUser } = useAuth();

  // Notifications — staff sessions read the real notifications table;
  // Company Admin isn't a `users` row so it has no rows there, and instead
  // gets a company-wide activity feed sourced from SystemAuditLog. Both are
  // normalized into NotifItem so the dropdown UI below doesn't care which.
  const [notifications, setNotifications]       = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount]           = useState(0);
  const [notifOpen, setNotifOpen]               = useState(false);
  const [notifPos, setNotifPos]                 = useState({ top: 0, right: 0 });
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const notifTriggerRef  = useRef<HTMLButtonElement>(null);

  const loadNotifications = () => {
    if (authType === 'admin') {
      adminNotificationService.list().then(res => {
        setNotifications(res.notifications);
        setUnreadCount(res.unread_count);
      }).catch(() => {});
    } else if (authType === 'user') {
      notificationService.list().then(res => {
        // Staff notifications carry their link inside `data.link` rather
        // than as a top-level field like the admin feed does.
        setNotifications(res.notifications.map(n => ({ ...n, link: n.data?.link ?? null })));
        setUnreadCount(res.unread_count);
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (authType !== 'user' && authType !== 'admin') return;
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [authType]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNotifDropdown = () => {
    if (notifTriggerRef.current) {
      const rect = notifTriggerRef.current.getBoundingClientRect();
      setNotifPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    if (!notifOpen && (authType === 'user' || authType === 'admin')) loadNotifications();
    setNotifOpen(v => !v);
  };

  // Clicking any notification — audit-log-backed or a real row — marks it
  // read so the bell's unread count/red dot clears; the admin backend
  // figures out which table `id` belongs to.
  const handleNotifClick = (n: NotifItem) => {
    if (!n.is_read) {
      const svc = authType === 'admin' ? adminNotificationService : notificationService;
      svc.markRead(n.id).catch(() => {});
      setNotifications(prev => prev.map(x => (x.key ?? x.id) === (n.key ?? n.id) ? { ...x, is_read: true } : x));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    if (n.link) {
      setNotifOpen(false);
      router.push(n.link);
    }
  };

  const markAllRead = () => {
    const svc = authType === 'admin' ? adminNotificationService : notificationService;
    svc.markAllRead().catch(() => {});
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })));
    setUnreadCount(0);
  };

  // Clear (soft-dismiss) — staff always; for admin, only a real
  // notification-row entry (source==='notification') has anything to clear —
  // a legacy audit-log entry isn't a per-item inbox row.
  const clearOne = (e: React.MouseEvent, n: NotifItem) => {
    e.stopPropagation();
    const svc = authType === 'admin' ? adminNotificationService : notificationService;
    svc.clear(n.id).catch(() => {});
    setNotifications(prev => prev.filter(x => (x.key ?? x.id) !== (n.key ?? n.id)));
    if (!n.is_read) setUnreadCount(c => Math.max(0, c - 1));
  };

  const clearAll = () => {
    const svc = authType === 'admin' ? adminNotificationService : notificationService;
    svc.clearAll().catch(() => {});
    if (authType === 'admin') {
      // Only real notification rows are cleared server-side — audit-log
      // entries remain, so refresh from the server instead of wiping locally.
      loadNotifications();
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    const refresh = () => {
      const u    = getAuthUser();
      const type = getAuthType() as 'user' | 'admin' | null;
      setUser(u);
      setAuthType(type);

      if (type === 'user') {
        const assignments = (u as User)?.company_assignments ?? [];
        setMultiCompany(assignments.length > 1);
        const activeId = getActiveCompany();
        const active   = activeId ? assignments.find(a => a.company_id === activeId) : assignments[0];
        setActiveCompanyName(active?.company_name ?? null);
      }
    };
    refresh();
    window.addEventListener('auth_refreshed', refresh);
    return () => window.removeEventListener('auth_refreshed', refresh);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
      if (
        notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node) &&
        notifTriggerRef.current && !notifTriggerRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setDropdownOpen(v => !v);
  };

  const name = user?.name || '';
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const avatarUrl = resolveAvatarUrl((user as User | Admin | null)?.avatar_url);
  const role = authType === 'admin' ? 'Company Admin' : (user as User)?.role_type?.replace('_', ' ') || 'User';
  const isSubUser = authType === 'user';
  const company = isSubUser ? (user as User)?.company : null;
  const adminName = company?.admin?.name ?? null;

  return (
    <div className="topbar" style={{ justifyContent: 'space-between' }}>
      {/* Page Title */}
      <h1 style={{ fontSize: '17px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.2px' }}>
        {title}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Rule 9: Company switcher — only shown for sub-users with multiple companies */}
        {authType === 'user' && multiCompany && activeCompanyName && (
          <button
            onClick={() => router.push('/select-company')}
            title="Switch workspace"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569',
              transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#bfdbfe'; e.currentTarget.style.color = '#2563eb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569'; }}
          >
            <HiBuildingOffice2 size={14} />
            {activeCompanyName}
            <HiChevronDown size={12} />
          </button>
        )}
        {/* Notification */}
        <div style={{ position: 'relative' }}>
          <button
            ref={notifTriggerRef}
            onClick={openNotifDropdown}
            style={{
              position: 'relative', width: 38, height: 38, borderRadius: 10,
              border: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748b', transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
          >
            <HiBell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute', top: 7, right: 7,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#ef4444', border: '2px solid #fff',
                }}
              />
            )}
          </button>

          {notifOpen && (
            <div
              ref={notifDropdownRef}
              style={{
                position: 'fixed', top: notifPos.top, right: notifPos.right,
                background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12,
                boxShadow: '0 8px 30px rgba(0,0,0,0.1)', width: 340, maxHeight: 420,
                zIndex: 9999, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a' }}>Notifications</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{ border: 'none', background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Mark all as read
                    </button>
                  )}
                  {notifications.length > 0 && (authType === 'user' || (authType === 'admin' && notifications.some(n => n.source === 'notification'))) && (
                    <button
                      onClick={clearAll}
                      style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No notifications yet.</div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.key ?? n.id}
                      onClick={() => handleNotifClick(n)}
                      style={{
                        padding: '10px 16px', borderBottom: '1px solid #f8fafc',
                        cursor: n.link || !n.is_read ? 'pointer' : 'default',
                        background: n.is_read ? '#fff' : '#eff6ff',
                        display: 'flex', justifyContent: 'space-between', gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{n.body}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                      {(authType === 'user' || (authType === 'admin' && n.source === 'notification')) && (
                        <button
                          onClick={(e) => clearOne(e, n)}
                          title="Clear notification"
                          style={{
                            border: 'none', background: 'transparent', color: '#cbd5e1',
                            fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 2, flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div style={{ position: 'relative' }}>
          <button
            ref={triggerRef}
            onClick={openDropdown}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px 6px 6px', borderRadius: 10,
              border: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 28, height: 28, borderRadius: 8, overflow: 'hidden',
                background: 'linear-gradient(135deg, #2563eb, #60a5fa)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '11px', flexShrink: 0, userSelect: 'none',
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : initials}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>{name || 'Loading…'}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize', lineHeight: 1.2 }}>
                {isSubUser && company ? company.name : role}
              </div>
            </div>
            <HiChevronDown size={14} style={{ color: '#94a3b8', marginLeft: 2, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {dropdownOpen && (
            <div
              ref={dropdownRef}
              style={{
                position: 'fixed', top: dropdownPos.top, right: dropdownPos.right,
                background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12,
                boxShadow: '0 8px 30px rgba(0,0,0,0.1)', minWidth: 200, zIndex: 9999, overflow: 'hidden',
              }}
            >
              {/* User Info */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc' }}>
                <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#0f172a' }}>{name}</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: 2, textTransform: 'capitalize' }}>{role}</div>
                {isSubUser && company && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12 }}>🏢</span>
                      <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>{company.name}</span>
                    </div>
                    {adminName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12 }}>👤</span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>Admin: {adminName}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Actions */}
              <div style={{ padding: '4px' }}>
                <button
                  onClick={() => { setDropdownOpen(false); router.push('/profile'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px', width: '100%', borderRadius: 8,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: '13.5px', color: '#334155', fontWeight: 500,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 15 }}>👤</span> My Profile
                </button>
                <button
                  onClick={() => logoutUser(authType || 'user')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 12px', width: '100%', borderRadius: 8,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: '13.5px', color: '#ef4444', fontWeight: 500,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 15 }}>🚪</span> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
