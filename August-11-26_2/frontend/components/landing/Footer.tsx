// 'use client';
// import Link from 'next/link';

// export default function LandingFooter() {
//   return (
//     <footer id="contact" style={{ background: '#0f172a', color: '#94a3b8', padding: '60px 24px 36px' }}>
//       <div style={{ maxWidth: 1200, margin: '0 auto' }}>
//         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, marginBottom: 48 }}>
//           {/* Brand */}
//           <div>
//             <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
//               <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                 <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>C</span>
//               </div>
//               <span style={{ fontWeight: 800, fontSize: 17, color: '#fff' }}>CRM<span style={{ color: '#3b82f6' }}>.</span></span>
//             </div>
//             <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: '#64748b' }}>
//               Complete business management platform for growing teams.
//             </p>
//           </div>

//           {/* Product */}
//           <div>
//             <h4 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, marginBottom: 16, margin: '0 0 16px' }}>Product</h4>
//             {[['#features', 'Features'], ['#modules', 'Modules'], ['/pricing', 'Pricing'], ['/register', 'Get Started']].map(([href, label]) => (
//               <a key={label} href={href} style={{ display: 'block', fontSize: 14, color: '#64748b', textDecoration: 'none', marginBottom: 10, transition: 'color 0.15s' }}
//                 onMouseEnter={e => (e.currentTarget.style.color = '#e2e8f0')}
//                 onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
//                 {label}
//               </a>
//             ))}
//           </div>

//           {/* Account */}
//           <div>
//             <h4 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, margin: '0 0 16px' }}>Account</h4>
//             {[['/login', 'User Login'], ['/admin/login', 'Admin Login'], ['/super-admin/login', 'Super Admin']].map(([href, label]) => (
//               <Link key={label} href={href} style={{ display: 'block', fontSize: 14, color: '#64748b', textDecoration: 'none', marginBottom: 10, transition: 'color 0.15s' }}
//                 onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = '#e2e8f0')}
//                 onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = '#64748b')}>
//                 {label}
//               </Link>
//             ))}
//           </div>

//           {/* Contact */}
//           <div>
//             <h4 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14, margin: '0 0 16px' }}>Contact</h4>
//             <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: 0 }}>
//               support@crm.com<br />
//               +1 (555) 000-0000<br />
//               Karachi, Pakistan
//             </p>
//           </div>
//         </div>

//         <div style={{ borderTop: '1px solid #1e293b', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
//           <span style={{ fontSize: 13 }}>© {new Date().getFullYear()} CRM System. All rights reserved.</span>
//           <div style={{ display: 'flex', gap: 24 }}>
//             {['Privacy Policy', 'Terms of Service'].map(t => (
//               <a key={t} href="#" style={{ fontSize: 13, color: '#475569', textDecoration: 'none' }}>{t}</a>
//             ))}
//           </div>
//         </div>
//       </div>
//     </footer>
//   );
// }


'use client';

import Link from 'next/link';
import Container from '../ui/Conatiner';
import {
  FaFacebookF,
  FaTwitter,
  FaLinkedinIn,
  FaInstagram,
} from 'react-icons/fa';
import { IconType } from 'react-icons';

interface FooterLink {
  label: string;
  href: string;
}

interface SocialLink {
  icon: IconType;
  color: string;
}

const PRODUCT_LINKS: FooterLink[] = [
  { label: 'Features', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Get Started', href: '/register' },
];

const COMPANY_LINKS: FooterLink[] = [
  { label: 'About Us', href: '#' },
  { label: 'Careers', href: '#' },
  { label: 'Blog', href: '#' },
  { label: 'Contact', href: '#' },
];

const RESOURCE_LINKS: FooterLink[] = [
  { label: 'Help Center', href: '#' },
  { label: 'Documentation', href: '#' },
  { label: 'Privacy Policy', href: '#' },
  { label: 'Terms of Service', href: '#' },
];

const SOCIAL_LINKS: SocialLink[] = [
  { icon: FaFacebookF, color: '#64748b' },
  { icon: FaTwitter, color: '#64748b' },
  { icon: FaLinkedinIn, color: '#64748b' },
  { icon: FaInstagram, color: '#64748b' },
];

export default function LandingFooter() {
  return (
    <footer
      style={{
        padding: '40px 0 20px',
        borderTop: '1px solid #edf2f7',
        backgroundColor: 'var(--bg-white)',
      }}
    >
      <Container>
        <div className="row gy-4">

          {/* Brand */}
          <div className="col-lg-4 col-md-6">
            <h3
              style={{
                fontWeight: 700,
                color: 'var(--text-heading)',
                marginBottom: 12,
              }}
            >
              MOVENT
              <span style={{ textTransform: "uppercase", color: 'var(--brand-blue)' }}>.io</span>
            </h3>

            <p
              style={{
                color: 'var(--text-muted)',
                lineHeight: 1.7,
                fontSize: 14,
                maxWidth: 280,
              }}
            >
              Complete business management platform for growing teams.
            </p>

            <div className="d-flex gap-3 mt-3">
              {SOCIAL_LINKS.map(({ icon: Icon }, index) => (
                <Icon key={index} color="#64748b" />
              ))}
            </div>
          </div>

          {/* Product */}
          <div className="col-lg-2 col-md-6">
            <h6
              style={{
                color: 'var(--text-heading)',
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              Product
            </h6>

            <div className="d-flex flex-column gap-2">
              {PRODUCT_LINKS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="footer-link"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Company */}
          <div className="col-lg-2 col-md-6">
            <h6
              style={{
                color: '#0f172a',
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              Company
            </h6>

            <div className="d-flex flex-column gap-2">
              {COMPANY_LINKS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="footer-link"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div className="col-lg-2 col-md-6">
            <h6
              style={{
                color: '#0f172a',
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              Resources
            </h6>

            <div className="d-flex flex-column gap-2">
              {RESOURCE_LINKS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="footer-link"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Support */}
          <div className="col-lg-2 col-md-6">
            <h6
              style={{
                color: '#0f172a',
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              Support
            </h6>

            <div
              style={{
                color: 'var(--text-muted)',
                fontSize: 14,
                lineHeight: 1.8,
              }}
            >
              support@pulsecrm.com
              <br />
              +1 (555) 123-4567
              <br />
              Karachi, Pakistan
            </div>
          </div>
        </div>

        <div
          className="d-flex footer_sec justify-content-between align-items-center flex-wrap mt-5 pt-4"
          style={{
            borderTop: '1px solid #edf2f7',
          }}
        >
          <p
            style={{
              color: '#94a3b8',
              fontSize: 13,
              margin: 0,
            }}
          >
            © {new Date().getFullYear()} PulseCRM. All rights reserved.
          </p>

          <div className="d-flex gap-4">
            <Link
              href="#"
              className="footer-link-small"
              style={{ color: 'var(--text-muted)' }}
            >
              Privacy Policy
            </Link>

            <Link
              href="#"
              className="footer-link-small"
              style={{ color: 'var(--text-muted)' }}
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}