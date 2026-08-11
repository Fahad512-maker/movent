// 'use client';
// import Link from 'next/link';

// export default function HeroSection() {
//   return (
//     <section style={{ paddingTop: 120, paddingBottom: 80, background: 'linear-gradient(160deg, #f8faff 0%, #fff 60%)' }}>
//       <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
//         {/* Badge */}
//         <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: '#eff6ff', borderRadius: 50, border: '1px solid #bfdbfe', marginBottom: 28 }}>
//           <span style={{ fontSize: 14 }}>✨</span>
//           <span style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>All-in-one Business Solution</span>
//         </div>

//         {/* H1 */}
//         <h1 style={{ fontSize: 'clamp(38px, 5vw, 64px)', fontWeight: 900, color: '#0f172a', margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-1.5px' }}>
//           Manage Your Business<br />
//           <span style={{ background: 'linear-gradient(135deg, #2563eb, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
//             Smarter & Faster
//           </span>
//         </h1>

//         <p style={{ fontSize: 18, color: '#64748b', maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.7 }}>
//           Complete CRM with Sales, Projects, HR, Compliance and more.
//           Start free, scale as you grow.
//         </p>

//         {/* Buttons */}
//         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 56 }}>
//           <Link href="/register" style={{
//             padding: '14px 32px',
//             background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
//             borderRadius: 50, color: '#fff', fontWeight: 700, fontSize: 16,
//             textDecoration: 'none', boxShadow: '0 4px 18px rgba(37,99,235,0.35)',
//           }}>
//             Start Free Trial
//           </Link>
//           <Link href="/pricing" style={{
//             padding: '14px 32px',
//             border: '1.5px solid #e2e8f0', borderRadius: 50,
//             color: '#475569', fontWeight: 600, fontSize: 16,
//             textDecoration: 'none', background: '#fff',
//           }}>
//             View Pricing →
//           </Link>
//         </div>

//         {/* Stats */}
//         <div style={{ display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap', marginBottom: 64 }}>
//           {[['500+', 'Companies'], ['10,000+', 'Users'], ['99.9%', 'Uptime']].map(([num, label]) => (
//             <div key={label} style={{ textAlign: 'center' }}>
//               <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{num}</div>
//               <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{label}</div>
//             </div>
//           ))}
//         </div>

//         {/* Dashboard mockup */}
//         <div style={{
//           background: '#fff',
//           border: '1px solid #e2e8f0',
//           borderRadius: 20,
//           padding: 24,
//           boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
//           maxWidth: 900,
//           margin: '0 auto',
//         }}>
//           {/* Mock topbar */}
//           <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
//             <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
//             <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }} />
//             <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} />
//             <div style={{ flex: 1, height: 28, background: '#f8fafc', borderRadius: 6, marginLeft: 12 }} />
//           </div>
//           {/* Mock stat cards */}
//           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
//             {[
//               { label: 'Total Leads', value: '247', color: '#2563eb', bg: '#eff6ff' },
//               { label: 'Active Projects', value: '18', color: '#059669', bg: '#ecfdf5' },
//               { label: 'Revenue', value: 'PKR 2.4M', color: '#d97706', bg: '#fffbeb' },
//               { label: 'Team Members', value: '34', color: '#7c3aed', bg: '#fdf4ff' },
//             ].map(({ label, value, color, bg }) => (
//               <div key={label} style={{ background: bg, borderRadius: 10, padding: '14px 16px' }}>
//                 <div style={{ fontSize: 11, color: color, fontWeight: 600, marginBottom: 6 }}>{label}</div>
//                 <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{value}</div>
//               </div>
//             ))}
//           </div>
//           {/* Mock chart placeholder */}
//           <div style={{ height: 80, background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//             <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
//               {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
//                 <div key={i} style={{ width: 18, height: h * 0.6, background: i === 9 ? '#2563eb' : `rgba(37,99,235,${0.2 + i * 0.04})`, borderRadius: '3px 3px 0 0' }} />
//               ))}
//             </div>
//           </div>
//         </div>
//       </div>
//     </section>
//   );
// }

'use client';

import { ReactElement } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FaArrowRight } from 'react-icons/fa6';
import { HiOutlineOfficeBuilding } from 'react-icons/hi';
import { HiOutlineUsers, HiOutlineSignal } from 'react-icons/hi2';
import "@/styles/index.css"
import "@/app/Responsive.global.css"
import Container from '../ui/Conatiner';
import Dashboard from '@/public/UI_Images/HeroDashboard.png';
import HeroBg from '@/public/UI_Images/HeroBackground.png';

interface StatItem {
  icon: ReactElement;
  bg: string;
  color: string;
  value: string;
  label: string;
}

const STATS: StatItem[] = [
  {
    icon: <HiOutlineOfficeBuilding size={20} />,
    bg: 'var(--bg-soft-blue)',
    color: 'var(--brand-blue)',
    value: '500+',
    label: 'Companies',
  },
  {
    icon: <HiOutlineUsers size={20} />,
    bg: 'var(--bg-soft-blue)',
    color: 'var(--brand-blue)',
    value: '10,000+',
    label: 'Users',
  },
  {
    icon: <HiOutlineSignal size={20} />,
    bg: 'var(--bg-soft-blue)',
    color: 'var(--brand-blue)',
    value: '99.9%',
    label: 'Uptime',
  },
];

export default function HeroSection(): React.ReactElement {
  return (
    <div
      style={{
        backgroundImage: `url(${HeroBg.src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
      className="HeroSection">
      <Container>
        <div className="grid lg:grid-cols-2 items-center gap-5 heroSection w-full h-auto">
          <div className="w-full flex flex-col items-start gap-2">
            <span
              className="py-2 px-4 rounded-full text-sm text-[var(--brand-blue)] font-semibold"
              style={{ backgroundColor: 'var(--bg-blue-light1)' }}
            >
              All-in-one Business Solution
            </span>

            <h1 className="heading">
              Manage Your Business{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'var(--brand-gradient)' }}
              >
                Smarter & Faster
              </span>
            </h1>

            <p className="text-[var(--text-body)] text-sm font-normal font-semibold">
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Unde quos
              porro similique debitis iusto voluptas. Rerum, doloremque? Sit.
            </p>

            <div className="flex max-[400px]:items-start max-[400px]:flex-col items-center w-full gap-2">
              <button className="hero-primary-btn">
                Start Free Trial
                <FaArrowRight className="btn-icon" size={12} />
              </button>

              <button className="hero-secondary-btn">
                View Pricing
                <FaArrowRight className="btn-icon" size={12} />
              </button>
            </div>

            <div className="grid mt-3 max-[450px]:grid-cols-2 grid-cols-3 w-full gap-2">
              {STATS.map((elemItem, indx) => (
                <div
                  key={indx}
                  className="flex items-center gap-1.5 w-full"
                >
                  <span
                    style={{
                      backgroundColor: elemItem.bg,
                      color: elemItem.color,
                      borderRadius: '100px',
                    }}
                    className="p-2.5 flex items-center justify-center"
                  >
                    {elemItem.icon}
                  </span>

                  <div className="flex flex-col items-start gap-0.5">
                    <h1
                      style={{
                        fontSize: '1.3rem',
                        color: 'var(--text-heading)',
                        marginBottom: '0px',
                        fontWeight: '500',
                      }}
                    >
                      {elemItem.value}
                    </h1>

                    <p
                      className="text-sm font-nomal text-[var(--text-body)]"
                      style={{ marginBottom: '0px' }}
                    >
                      {elemItem.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full h-[300px] lg:h-full flex items-start justify-start relative">
            <Image
              src={Dashboard}
              alt="Dashboard Image"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>
      </Container>
    </div>
  );
}