'use client';
import Link from 'next/link';

export default function LandingFooter() {
  return (
    <footer id="contact" style={{ background: '#0f172a', color: '#94a3b8', padding: '60px 24px 36px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, marginBottom: 48 }}>
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>M</span>
              </div>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#fff' }}>Movent<span style={{ color: '#3b82f6' }}>.</span></span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: '#64748b' }}>
              Complete business management platform for growing teams.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, marginBottom: 16, margin: '0 0 16px' }}>Product</h4>
            {[['#features', 'Features'], ['#modules', 'Modules'], ['/pricing', 'Pricing'], ['/register', 'Get Started']].map(([href, label]) => (
              <a key={label} href={href} style={{ display: 'block', fontSize: 14, color: '#64748b', textDecoration: 'none', marginBottom: 10, transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
                onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
                {label}
              </a>
            ))}
          </div>

          {/* Account */}
          <div>
            <h4 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, margin: '0 0 16px' }}>Account</h4>
            {[['/login', 'User Login'], ['/admin/login', 'Admin Login'], ['/super-admin/login', 'Super Admin']].map(([href, label]) => (
              <Link key={label} href={href} style={{ display: 'block', fontSize: 14, color: '#64748b', textDecoration: 'none', marginBottom: 10, transition: 'color 0.15s' }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = '#e2e8f0')}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = '#64748b')}>
                {label}
              </Link>
            ))}
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, margin: '0 0 16px' }}>Contact</h4>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: 0 }}>
              support@crm.com<br />
              +92 300 0000000<br />
              Karachi, Pakistan
            </p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #1e293b', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13 }}>© {new Date().getFullYear()} Movent. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Privacy Policy', 'Terms of Service'].map(t => (
              <a key={t} href="#" style={{ fontSize: 13, color: '#475569', textDecoration: 'none' }}>{t}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
