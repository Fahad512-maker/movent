'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HiSquares2X2,
  HiRectangleStack,
  HiUserGroup,
  HiBuildingOffice2,
  HiShieldCheck,
  HiCreditCard,
  HiPuzzlePiece,
} from 'react-icons/hi2';

const NAV_ITEMS = [
  { href: '/super-admin/dashboard',          icon: HiSquares2X2,      label: 'Dashboard' },
  { href: '/super-admin/packages',           icon: HiRectangleStack,  label: 'Packages' },
  { href: '/super-admin/modules',            icon: HiPuzzlePiece,     label: 'Modules' },
  { href: '/super-admin/admins',             icon: HiUserGroup,       label: 'Company Admins' },
  { href: '/super-admin/companies',          icon: HiBuildingOffice2, label: 'Companies' },
  { href: '/super-admin/payment-gateways',   icon: HiCreditCard,      label: 'Payment Gateways' },
];

export default function SuperAdminSidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <aside style={{
      width: 256,
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38,
            height: 38,
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <HiShieldCheck size={20} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Movent</div>
            <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 500 }}>Super Admin</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '16px 12px', flex: 1 }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 8px 10px' }}>
          Management
        </div>
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = mounted && pathname === href;
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                marginBottom: 2,
                background: active ? 'rgba(124,58,237,0.25)' : 'transparent',
                color: active ? '#c4b5fd' : '#94a3b8',
                fontWeight: active ? 600 : 400,
                fontSize: 14,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                  (e.currentTarget as HTMLDivElement).style.color = '#e2e8f0';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  (e.currentTarget as HTMLDivElement).style.color = '#94a3b8';
                }
              }}>
                <Icon size={18} />
                {label}
                {active && (
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#a78bfa',
                    marginLeft: 'auto',
                  }} />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        color: '#64748b',
        fontSize: 11,
      }}>
        Super Admin Panel v1.0
      </div>
    </aside>
  );
}
