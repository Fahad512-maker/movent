'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import {
  HiSquares2X2, HiFolder, HiDocumentText, HiCreditCard,
  HiArrowDownTray, HiChatBubbleLeftRight, HiLifebuoy, HiChartBar,
} from 'react-icons/hi2';
import clientApi from '@/lib/clientAxios';

// Module key → nav item map (Dashboard is always visible)
const NAV = [
  { key: null,        label: 'Dashboard', icon: HiSquares2X2,         path: '/client/dashboard' },
  { key: 'projects',  label: 'Projects',  icon: HiFolder,              path: '/client/projects' },
  { key: 'invoices',  label: 'Invoices',  icon: HiDocumentText,        path: '/client/invoices' },
  { key: 'payments',  label: 'Payments',  icon: HiCreditCard,          path: '/client/payments' },
  { key: 'documents', label: 'Documents', icon: HiArrowDownTray,       path: '/client/documents' },
  { key: 'chat',      label: 'Chat',      icon: HiChatBubbleLeftRight, path: '/client/chat' },
  { key: 'support',   label: 'Support',   icon: HiLifebuoy,            path: '/client/support' },
  { key: 'reports',   label: 'Reports',   icon: HiChartBar,            path: '/client/reports' },
];

const GREEN   = '#10b981';
const GREENBG = '#ecfdf5';

export default function ClientSidebar() {
  const pathname = usePathname();
  const [perms, setPerms] = useState<Record<string, boolean> | null>(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    try {
      const info = JSON.parse(Cookies.get('client_info') || '{}');
      setCompanyName(info.company_name || '');
    } catch { /* ignore */ }

    const token = Cookies.get('client_token');
    if (!token) return;

    clientApi.get('/client/permissions')
      .then(r => setPerms(r.data.data || {}))
      .catch(() => setPerms({})); // on error → show all
  }, []);

  const visible = NAV.filter(item => {
    if (item.key === null) return true;      // Dashboard always shown
    if (perms === null) return true;          // still loading → show all
    return perms[item.key] !== false;         // hide only if explicitly false
  });

  return (
    <aside style={{
      width: 240, minHeight: '100vh', background: '#fff',
      borderRight: '1px solid #e2e8f0',
      position: 'fixed', top: 0, left: 0,
      display: 'flex', flexDirection: 'column', zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>C</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Client Portal</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{companyName || 'Secure Access'}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px' }}>
        {visible.map(({ label, icon: Icon, path }) => {
          const active = pathname === path || pathname.startsWith(path + '/');
          return (
            <Link key={path} href={path} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                background: active ? GREENBG : 'transparent',
                color: active ? GREEN : '#64748b',
                fontWeight: active ? 600 : 400, fontSize: 13,
                transition: 'all 0.15s', cursor: 'pointer',
              }}>
                <Icon size={18} />
                {label}
                {active && (
                  <div style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: GREEN }} />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'center' }}>
          Client Portal v1.0
        </div>
      </div>
    </aside>
  );
}
