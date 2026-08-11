'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getAuthType, getAuthUser, logout } from '@/lib/auth';
import SuperAdminSidebar from './SuperAdminSidebar';
import { HiBell, HiChevronDown, HiArrowRightOnRectangle, HiShieldCheck } from 'react-icons/hi2';
import api from '@/lib/axios';
import toast from 'react-hot-toast';

interface Props {
  children: React.ReactNode;
}

export default function SuperAdminLayout({ children }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated() || getAuthType() !== 'super_admin') {
      router.push('/super-admin/login');
      return;
    }
    const u = getAuthUser();
    if (u) setUser(u);
  }, [router]);

  const handleLogout = async () => {
    try {
      await api.post('/super-admin/logout');
    } catch { /* ignore */ }
    logout();
    toast.success('Logged out');
    router.push('/super-admin/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <SuperAdminSidebar />

      <div style={{ marginLeft: 256, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <header style={{
          height: 64,
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HiShieldCheck size={20} color="#7c3aed" />
            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>Super Admin Console</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Bell */}
            <div style={{ position: 'relative', cursor: 'pointer' }}>
              <HiBell size={22} color="#64748b" />
              <div style={{
                position: 'absolute', top: -2, right: -2,
                width: 8, height: 8,
                background: '#ef4444',
                borderRadius: '50%',
                border: '2px solid #fff',
              }} />
            </div>

            {/* User dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 14px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 50,
                  cursor: 'pointer',
                }}>
                <div style={{
                  width: 30, height: 30,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 12,
                }}>
                  {user?.name?.[0]?.toUpperCase() ?? 'S'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{user?.name ?? 'Super Admin'}</div>
                  <div style={{ fontSize: 11, color: '#7c3aed' }}>Super Admin</div>
                </div>
                <HiChevronDown size={14} color="#94a3b8" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  minWidth: 200,
                  zIndex: 200,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{user?.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{user?.email}</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%', padding: '11px 16px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 13, color: '#ef4444', fontWeight: 500,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <HiArrowRightOnRectangle size={16} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: 28 }}>
          {children}
        </main>
      </div>

      {/* Backdrop for dropdown */}
      {dropdownOpen && (
        <div
          onClick={() => setDropdownOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        />
      )}
    </div>
  );
}
