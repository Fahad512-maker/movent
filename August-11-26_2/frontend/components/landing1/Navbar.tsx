'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      background: scrolled ? '#fff' : 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px)',
      boxShadow: scrolled ? '0 1px 16px rgba(0,0,0,0.08)' : 'none',
      borderBottom: scrolled ? '1px solid #f1f5f9' : 'none',
      transition: 'all 0.25s',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>M</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', letterSpacing: '-0.3px' }}>Movent<span style={{ color: '#2563eb' }}>.</span></span>
        </Link>

        {/* Desktop Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="d-none d-md-flex">
          {[['#features', 'Features'], ['#modules', 'Modules'], ['/pricing', 'Pricing'], ['#contact', 'Contact']].map(([href, label]) => (
            <a key={label} href={href} style={{ color: '#475569', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#2563eb')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
              {label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/login" style={{ padding: '8px 18px', border: '1.5px solid #e2e8f0', borderRadius: 50, fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none', transition: 'all 0.15s' }}
            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb'; }}
            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569'; }}>
            Login
          </Link>
          <Link href="/register" style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 50, fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
