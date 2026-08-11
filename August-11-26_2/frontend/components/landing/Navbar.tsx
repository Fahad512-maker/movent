// 'use client';
// import { useEffect, useState } from 'react';
// import Link from 'next/link';

// export default function LandingNavbar() {
//   const [scrolled, setScrolled] = useState(false);
//   const [menuOpen, setMenuOpen] = useState(false);

//   useEffect(() => {
//     const handler = () => setScrolled(window.scrollY > 20);
//     window.addEventListener('scroll', handler);
//     return () => window.removeEventListener('scroll', handler);
//   }, []);

//   return (
//     <nav style={{
//       position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
//       background: scrolled ? '#fff' : 'rgba(255,255,255,0.92)',
//       backdropFilter: 'blur(12px)',
//       boxShadow: scrolled ? '0 1px 16px rgba(0,0,0,0.08)' : 'none',
//       borderBottom: scrolled ? '1px solid #f1f5f9' : 'none',
//       transition: 'all 0.25s',
//     }}>
//       <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
//         {/* Logo */}
//         <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
//           <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//             <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>C</span>
//           </div>
//           <span style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', letterSpacing: '-0.3px' }}>CRM<span style={{ color: '#2563eb' }}>.</span></span>
//         </Link>

//         {/* Desktop Links */}
//         <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="d-none d-md-flex">
//           {[['#features', 'Features'], ['#modules', 'Modules'], ['/pricing', 'Pricing'], ['#contact', 'Contact']].map(([href, label]) => (
//             <a key={label} href={href} style={{ color: '#475569', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.15s' }}
//               onMouseEnter={e => (e.currentTarget.style.color = '#2563eb')}
//               onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
//               {label}
//             </a>
//           ))}
//         </div>

//         {/* CTA */}
//         <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//           <Link href="/login" style={{ padding: '8px 18px', border: '1.5px solid #e2e8f0', borderRadius: 50, fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none', transition: 'all 0.15s' }}
//             onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb'; }}
//             onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569'; }}>
//             Login
//           </Link>
//           <Link href="/register" style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 50, fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
//             Get Started
//           </Link>
//         </div>
//       </div>
//     </nav>
//   );
// }

'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Container from '@/components/ui/Conatiner';
import { HiX, HiMenu } from 'react-icons/hi';
import "@/styles/index.css"

const NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'How it works', href: '#howitwork' },
  { label: 'Testimonials', href: '#testimonials' },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      <div
        className={`sticky top-0 left-0 right-0 z-[1000] bg-white border-b transition-all duration-300 ${scrolled ? 'shadow-[0_1px_16px_rgba(0,0,0,0.07)]' : ''}`}
        style={{ borderColor: 'var(--border)' }}
      >
        <Container>
          <div ref={navRef} className="flex items-center justify-between h-[68px] gap-2">
            <Link href="/" className="flex items-center gap-2 no-underline flex-shrink-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--brand-gradient)' }}>
                <span className="text-white font-extrabold text-sm">M</span>
              </div>
              <span className="text-[19px] font-extrabold tracking-tight"
                style={{ color: 'var(--text-heading)' }}>
                MOVENT
                <span style={{ textTransform: "uppercase", color: 'var(--brand-blue)' }}>.io</span>
              </span>
            </Link>

            <ul className="hidden lg:flex items-center gap-1 list-none m-0 p-0">
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <Link href={item.href}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium no-underline hover:no-underline transition-all duration-150"
                    style={{ color: 'var(--text-body)' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--brand-blue)';
                      e.currentTarget.style.background = 'var(--primary-light)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--text-body)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
              <Link href="/login" className="nav-login-btn">
                Log in
              </Link>

              <Link href="/register" className="nav-register-btn">
                Get Started
              </Link>
            </div>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden bg-transparent cursor-pointer flex items-center justify-center transition-all duration-150"
              style={{ color: 'var(--text-body)' }}
            >
              {mobileOpen ? <HiX className="w-5 h-5" /> : <HiMenu className="w-5 h-5" />}
            </button>
          </div>
        </Container>
      </div>

      <div
        onClick={() => setMobileOpen(false)}
        className={`lg:hidden fixed inset-0 z-[1001] transition-opacity duration-500 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(13,18,48,0.3)', backdropFilter: 'blur(4px)' }}
      />

      <div
        className={`lg:hidden fixed top-0 right-0 bottom-0 w-[400px] max-[420px]:w-full z-[1002] bg-white flex flex-col overflow-y-auto transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ boxShadow: '-8px 0 40px rgba(13,18,48,0.14)' }}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border-light)' }}>
          <Link href="/" className="flex items-center gap-2 no-underline flex-shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--brand-gradient)' }}>
              <span className="text-white font-extrabold text-sm">P</span>
            </div>
            <span className="text-[19px] font-extrabold tracking-tight"
              style={{ color: 'var(--text-heading)' }}>
              Pulse<span style={{ color: 'var(--brand-blue)' }}>CRM</span>
            </span>
          </Link>
          <button onClick={() => setMobileOpen(false)}
            className="bg-transparent cursor-pointer transition-all duration-150"
            style={{ color: 'var(--text-body)' }}>
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-2 py-1.5">
          {NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-all duration-150"
              style={{ color: 'var(--text-body)' }}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="px-4 pt-3 pb-6 border-t flex flex-col gap-1.5 flex-shrink-0"
          style={{ borderColor: 'var(--border-light)' }}>
          <Link href="/login"
            className="px-4 py-2.5 text-center rounded-md text-sm font-semibold no-underline transition-all duration-150"
            style={{
              color: 'var(--text-body)',
              border: '1.5px solid var(--brand-blue)',
            }}
          >
            Log in
          </Link>
          <Link href="/register"
            className="px-6 py-2.5 text-center rounded-md text-sm font-bold text-white no-underline transition-all duration-150"
            style={{
              background: 'var(--brand-gradient)',
              boxShadow: '0 4px 14px var(--primary-shadow)',
              border: '1.5px solid var(--brand-blue)',
            }}
          >
            Get Started
          </Link>
        </div>
      </div>
    </>
  );
}