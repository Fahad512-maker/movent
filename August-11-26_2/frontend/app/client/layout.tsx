'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isClientAuthenticated, getClientUser, getClientInfo, clientLogout } from '@/lib/clientAuth';
import ClientSidebar from '@/components/client/ClientSidebar';
import {
  HiBell, HiChevronDown, HiArrowRightOnRectangle,
} from 'react-icons/hi2';
import clientApi from '@/lib/clientAxios';
import toast from 'react-hot-toast';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted]           = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser]                 = useState<{ name: string; email: string } | null>(null);
  const [clientInfo, setClientInfo]     = useState<{ company_name: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    if (pathname === '/client/login') return;
    if (!isClientAuthenticated()) {
      router.push('/client/login');
      return;
    }
    const u = getClientUser();
    const c = getClientInfo();
    if (u) setUser(u);
    if (c) setClientInfo(c);
  }, [router, pathname]);

  const handleLogout = async () => {
    try { await clientApi.post('/client/logout'); } catch {}
    clientLogout();
    toast.success('Logged out');
    router.push('/client/login');
  };

  if (!mounted) return null;

  // Login page: no sidebar/navbar wrapper
  if (pathname === '/client/login') return <>{children}</>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <ClientSidebar />

      <div style={{ marginLeft: 240, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <header style={{
          height: 60, background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
              {clientInfo?.company_name || 'Client Portal'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <HiBell size={20} color="#64748b" style={{ cursor: 'pointer' }} />

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 12px',
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 50, cursor: 'pointer',
                }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 12,
                }}>
                  {user?.name?.[0]?.toUpperCase() ?? 'C'}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{user?.name ?? 'Client'}</div>
                  <div style={{ fontSize: 10, color: '#10b981' }}>Client</div>
                </div>
                <HiChevronDown size={12} color="#94a3b8" />
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  background: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  minWidth: 180, zIndex: 200, overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{user?.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{user?.email}</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 12, color: '#ef4444', fontWeight: 500,
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <HiArrowRightOnRectangle size={14} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: 24 }}>{children}</main>
      </div>

      {dropdownOpen && (
        <div
          onClick={() => setDropdownOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        />
      )}
    </div>
  );
}
