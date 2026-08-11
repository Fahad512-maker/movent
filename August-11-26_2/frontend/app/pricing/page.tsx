

// OLdcode 


// 'use client';
// import { useEffect, useState } from 'react';
// import Link from 'next/link';
// import LandingNavbar from '@/components/landing/Navbar';
// import LandingFooter from '@/components/landing/Footer';
// import { publicService } from '@/lib/services/publicService';
// import { PublicPackage } from '@/types';

// export default function PricingPage() {
//   const [packages, setPackages] = useState<PublicPackage[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR');

//   useEffect(() => {
//     publicService.getPackages()
//       .then(setPackages)
//       .catch(() => {})
//       .finally(() => setLoading(false));
//   }, []);

//   const TIER_COLORS: Record<string, string> = {
//     basic: '#059669', professional: '#2563eb', enterprise: '#7c3aed', custom: '#ea580c',
//   };

//   return (
//     <>
//       <LandingNavbar />
//       <div style={{ paddingTop: 100, paddingBottom: 80, background: '#f8fafc', minHeight: '100vh' }}>
//         <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
//           {/* Header */}
//           <div style={{ textAlign: 'center', marginBottom: 52, paddingTop: 20 }}>
//             <h1 style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, color: '#0f172a', margin: '0 0 14px', letterSpacing: '-0.8px' }}>
//               Choose Your Plan
//             </h1>
//             <p style={{ fontSize: 17, color: '#64748b', marginBottom: 28 }}>
//               Start free for 14 days. No credit card required.
//             </p>

//             {/* Currency Toggle */}
//             <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: 50, padding: 4, gap: 2 }}>
//               {(['PKR', 'USD'] as const).map(c => (
//                 <button key={c} onClick={() => setCurrency(c)} style={{
//                   padding: '8px 24px', borderRadius: 50, border: 'none', cursor: 'pointer',
//                   background: currency === c ? '#fff' : 'transparent',
//                   color: currency === c ? '#2563eb' : '#64748b',
//                   fontWeight: currency === c ? 700 : 500, fontSize: 14,
//                   boxShadow: currency === c ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
//                   transition: 'all 0.2s',
//                 }}>{c}</button>
//               ))}
//             </div>
//           </div>

//           {/* Package Grid */}
//           {loading ? (
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 22 }}>
//               {[1,2,3,4,5].map(i => (
//                 <div key={i} style={{ height: 440, background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
//               ))}
//             </div>
//           ) : (
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 22, marginBottom: 60 }}>
//               {packages.map(pkg => (
//                 <div key={pkg.id} style={{
//                   background: '#fff',
//                   border: pkg.is_popular ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
//                   borderRadius: 18,
//                   padding: '32px 28px',
//                   position: 'relative',
//                   boxShadow: pkg.is_popular ? '0 10px 40px rgba(37,99,235,0.14)' : '0 2px 8px rgba(0,0,0,0.04)',
//                   transition: 'transform 0.2s',
//                 }}
//                 onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
//                 onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
//                   {pkg.is_popular && (
//                     <div style={{ position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 16px', borderRadius: 50, whiteSpace: 'nowrap' }}>
//                       ⭐ Most Popular
//                     </div>
//                   )}

//                   <span style={{ display: 'inline-block', padding: '3px 10px', background: `${TIER_COLORS[pkg.tier] ?? '#64748b'}15`, color: TIER_COLORS[pkg.tier] ?? '#64748b', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
//                     {pkg.tier}
//                   </span>

//                   <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>{pkg.name}</h3>

//                   <div style={{ marginBottom: 6 }}>
//                     <span style={{ fontSize: 38, fontWeight: 900, color: '#0f172a' }}>
//                       {currency === 'PKR' ? `PKR ${Number(pkg.price_pkr).toLocaleString()}` : `$${pkg.price_usd}`}
//                     </span>
//                     <span style={{ fontSize: 14, color: '#94a3b8' }}>/month</span>
//                   </div>
//                   <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, marginBottom: 22 }}>
//                     {pkg.trial_days}-day free trial
//                   </div>

//                   {/* Features */}
//                   <div style={{ marginBottom: 20 }}>
//                     {pkg.features.map(f => (
//                       <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 10 }}>
//                         <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
//                         <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>{f}</span>
//                       </div>
//                     ))}
//                   </div>

//                   {/* Module badges */}
//                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 22 }}>
//                     {pkg.modules.slice(0, 6).map(m => (
//                       <span key={m} style={{ padding: '2px 9px', background: '#f1f5f9', borderRadius: 20, fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'capitalize' }}>
//                         {m}
//                       </span>
//                     ))}
//                     {pkg.modules.length > 6 && (
//                       <span style={{ padding: '2px 9px', background: '#eff6ff', borderRadius: 20, fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
//                         +{pkg.modules.length - 6} more
//                       </span>
//                     )}
//                   </div>

//                   <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
//                     <Link href={`/register?package=${pkg.id}&trial=true`} style={{
//                       display: 'block', textAlign: 'center', padding: '11px',
//                       background: pkg.is_popular ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : '#eff6ff',
//                       borderRadius: 9, color: pkg.is_popular ? '#fff' : '#2563eb',
//                       fontWeight: 700, fontSize: 14, textDecoration: 'none',
//                     }}>
//                       Start Free Trial
//                     </Link>
//                     <Link href={`/register?package=${pkg.id}&trial=false`} style={{
//                       display: 'block', textAlign: 'center', padding: '11px',
//                       background: '#f8fafc', border: '1.5px solid #e2e8f0',
//                       borderRadius: 9, color: '#475569',
//                       fontWeight: 600, fontSize: 14, textDecoration: 'none',
//                     }}>
//                       Buy Now
//                     </Link>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}

//           {/* Custom Plan */}
//           <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0' }}>
//             <div style={{ fontSize: 28, marginBottom: 12 }}>🤝</div>
//             <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Need a Custom Plan?</h3>
//             <p style={{ color: '#64748b', marginBottom: 20, fontSize: 15 }}>
//               Large enterprise? Special requirements? We've got you covered.
//             </p>
//             <a href="mailto:sales@crm.com" style={{ display: 'inline-block', padding: '11px 28px', background: '#0f172a', borderRadius: 50, color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
//               Contact Sales →
//             </a>
//           </div>
//         </div>
//       </div>
//       <LandingFooter />
//     </>
//   );
// }


// updat code 




'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import LandingNavbar from '../../components/landing/Navbar';
import LandingFooter from '../../components/landing/Footer';
import { publicService } from '../../lib/services/publicService';
import { PublicPackage } from '@/types';
import walet from '@/public/UI_Images/Wallet.png'
import Image from 'next/image';
import {
  FiHeadphones,
  FiMessageCircle,
  FiUsers,
  FiBriefcase,
  FiPhoneCall,
  FiArrowRight,
} from "react-icons/fi";
import Container from '../../components/ui/Conatiner';
import PricingCard from '../../components/ui/PricingCard';
export default function PricingPage() {

  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    publicService
      .getPackages()
      .then((pkgs: PublicPackage[]) => {
        setPackages(pkgs);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const TIER_COLORS = {
    basic: '#059669', professional: '#2563eb', enterprise: '#7c3aed', custom: '#ea580c',
  };

  return (
    <>
      <LandingNavbar />
      <div className='flex flex-col items-start gap-5 w-full' style={{ paddingBottom: 60, background: 'var(--bg-white)', minHeight: '100vh' }}>
        <div style={{ backgroundColor: "var(--bg-backgound)", padding: "60px 0px" }} className='w-full' >
          <Container className='w-full grid grid-cols-1 md:grid-cols-2 items-center gap-5'>

            <div className='flex items-start gap-2 flex-col w-full'>
              <div className='features_bnt'>
                Pricing
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: '#0f172a' }}>
                Simple, Transparent Pricing
              </h2>
              <p style={{ fontSize: 17, color: 'var(--text-muted)' }}>Start free, scale as you grow</p>
            </div>

            <div className="w-full h-[250px] hidden md:flex items-end justify-end">
              <Image
                src={walet}
                alt="Wallet"
                className="w-full h-full object-contain"
              />
            </div>
          </Container>
        </div>
        <Container className='flex flex-col items-start gap-5 w-full'>

          {loading ? (
            <div className='mt-4 mb-16 grid md:grid-cols-2 lg:grid-cols-3 items-start gap-4 w-full'>
              {[1, 2, 3].map(i => (
                <div
                  className={
                    i === 1
                      ? ''
                      : i === 2
                        ? 'hidden md:block'
                        : 'hidden lg:block'
                  }

                  key={i} style={{ height: 440, background: '#f8fafc', borderRadius: 16, border: '1.5px solid #e2e8f0', animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
              ))}
            </div>
          ) : (
            <div className='grid h-auto lg:grid-cols-3 md:grid-cols-2  w-full items-start gap-3'>
              {packages.map((pkg: PublicPackage) => (
                // <div key={pkg.id} style={{
                //   background: '#fff',
                //   border: '1.5px solid #e2e8f0',
                //   borderRadius: 18,
                //   padding: '32px 28px',
                //   position: 'relative',
                //   boxShadow: pkg.is_popular ? '0 10px 40px rgba(37,99,235,0.14)' : '0 2px 8px rgba(0,0,0,0.04)',
                //   transition: 'transform 0.2s',
                // }}
                //   onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                //   onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
                //   {pkg.is_popular && (
                //     <div style={{ position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 16px', borderRadius: 50, whiteSpace: 'nowrap' }}>
                //       Most Popular
                //     </div>
                //   )}

                //   <span style={{ display: 'inline-block', padding: '3px 10px', background: `${TIER_COLORS[pkg.tier] ?? '#64748b'}15`, color: TIER_COLORS[pkg.tier] ?? '#64748b', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                //     {pkg.tier}
                //   </span>

                //   <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>{pkg.name}</h3>

                //   <div style={{ marginBottom: 6 }}>
                //     <span style={{ fontSize: 38, fontWeight: 900, color: '#0f172a' }}>
                //       {currency === 'PKR' ? `PKR ${Number(pkg.price_pkr).toLocaleString()}` : `$${pkg.price_usd}`}
                //     </span>
                //     <span style={{ fontSize: 14, color: '#94a3b8' }}>/month</span>
                //   </div>
                //   <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, marginBottom: 22 }}>
                //     {pkg.trial_days}-day free trial
                //   </div>

                //   <div style={{ marginBottom: 20 }}>
                //     {pkg.features.map(f => (
                //       <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 10 }}>
                //         <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
                //         <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>{f}</span>
                //       </div>
                //     ))}
                //   </div>
                //   <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 22 }}>
                //     {pkg.modules.slice(0, 6).map(m => (
                //       <span key={m} style={{ padding: '2px 9px', background: '#f1f5f9', borderRadius: 20, fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'capitalize' }}>
                //         {m}
                //       </span>
                //     ))}
                //     {pkg.modules.length > 6 && (
                //       <span style={{ padding: '2px 9px', background: '#eff6ff', borderRadius: 20, fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                //         +{pkg.modules.length - 6} more
                //       </span>
                //     )}
                //   </div>

                //   <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                //     <Link href={`/register?package=${pkg.id}&trial=true`} style={{
                //       display: 'block', textAlign: 'center', padding: '11px',
                //       background: pkg.is_popular ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : '#eff6ff',
                //       borderRadius: 9, color: pkg.is_popular ? '#fff' : '#2563eb',
                //       fontWeight: 700, fontSize: 14, textDecoration: 'none',
                //     }}>
                //       Start Free Trial
                //     </Link>
                //     <Link href={`/register?package=${pkg.id}&trial=false`} style={{
                //       display: 'block', textAlign: 'center', padding: '11px',
                //       background: '#f8fafc', border: '1.5px solid #e2e8f0',
                //       borderRadius: 9, color: '#475569',
                //       fontWeight: 600, fontSize: 14, textDecoration: 'none',
                //     }}>
                //       Buy Now
                //     </Link>
                //   </div>
                // </div>
                <PricingCard key={pkg.id} pkg={pkg} />
              ))}

            </div>
          )}

          <div
            style={{
              textAlign: "center",
              padding: "40px",
              background: "#ffffff",
              borderRadius: "20px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
              width: '100%',
              margin: "0 auto",
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: "72px",
                height: "72px",
                margin: "0 auto 20px",
                borderRadius: "50%",
                background: "var(--Baby-pink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--brand-pink)",
                fontSize: "32px",
              }}
            >
              <FiHeadphones />
            </div>

            {/* Heading */}
            <h3
              style={{
                fontSize: "24px",
                fontWeight: "700",
                color: "var(--text-heading)",
                marginBottom: "10px",
              }}
            >
              Need a Custom Plan?
            </h3>

            {/* Description */}
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "15px",
                lineHeight: "1.7",
                marginBottom: "24px",
              }}
            >
              Large enterprise? Special requirements? Our team will create a custom CRM
              solution tailored to your business needs.
            </p>

            {/* Button */}
            <a
              href="mailto:sales@crm.com"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "13px 28px",
                background: "var(--bg-cta-gradient)",
                color: "#ffffff",
                borderRadius: "999px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "15px",
                transition: "0.3s ease",
              }}
            >
              Contact Sales
              <FiArrowRight />
            </a>
          </div>
        </Container>
      </div>
      <LandingFooter />
    </>
  );
}
