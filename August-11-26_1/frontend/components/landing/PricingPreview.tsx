// 'use client';
// import Link from 'next/link';
// import { useEffect, useState } from 'react';
// import { publicService } from '@/lib/services/publicService';
// import { PublicPackage } from '@/types';

// export default function PricingPreview() {
//   const [packages, setPackages] = useState<PublicPackage[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR');

//   useEffect(() => {
//     publicService.getPackages()
//       .then(pkgs => setPackages(pkgs.filter(p => ['Starter', 'Business', 'Full Suite'].includes(p.name))))
//       .catch(() => {})
//       .finally(() => setLoading(false));
//   }, []);

//   return (
//     <section id="pricing" style={{ padding: '96px 0', background: '#fff' }}>
//       <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
//         <div style={{ textAlign: 'center', marginBottom: 52 }}>
//           <div style={{ display: 'inline-block', padding: '5px 14px', background: '#fdf4ff', borderRadius: 50, fontSize: 12, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
//             Pricing
//           </div>
//           <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: '#0f172a', margin: '0 0 14px', letterSpacing: '-0.5px' }}>
//             Simple, Transparent Pricing
//           </h2>
//           <p style={{ fontSize: 17, color: '#64748b', marginBottom: 24 }}>Start free, scale as you grow</p>

//           {/* Currency Toggle */}
//           <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 50, padding: 4, gap: 2 }}>
//             {(['PKR', 'USD'] as const).map(c => (
//               <button key={c} onClick={() => setCurrency(c)} style={{
//                 padding: '7px 20px', borderRadius: 50, border: 'none', cursor: 'pointer',
//                 background: currency === c ? '#fff' : 'transparent',
//                 color: currency === c ? '#2563eb' : '#64748b',
//                 fontWeight: currency === c ? 700 : 400,
//                 fontSize: 14,
//                 boxShadow: currency === c ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
//                 transition: 'all 0.2s',
//               }}>{c}</button>
//             ))}
//           </div>
//         </div>

//         {loading ? (
//           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}>
//             {[1, 2, 3].map(i => (
//               <div key={i} style={{ height: 380, background: '#f8fafc', borderRadius: 16, animation: 'pulse 1.5s infinite' }} />
//             ))}
//           </div>
//         ) : (
//           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22, marginBottom: 36 }}>
//             {packages.map(pkg => (
//               <div key={pkg.id} style={{
//                 background: '#fff',
//                 border: pkg.is_popular ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
//                 borderRadius: 16,
//                 padding: '28px 26px',
//                 position: 'relative',
//                 boxShadow: pkg.is_popular ? '0 8px 32px rgba(37,99,235,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
//               }}>
//                 {pkg.is_popular && (
//                   <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 50 }}>
//                     Most Popular
//                   </div>
//                 )}
//                 <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{pkg.name}</div>
//                 <div style={{ marginBottom: 20 }}>
//                   <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a' }}>
//                     {currency === 'PKR' ? `PKR ${Number(pkg.price_pkr).toLocaleString()}` : `$${pkg.price_usd}`}
//                   </span>
//                   <span style={{ fontSize: 14, color: '#94a3b8' }}>/month</span>
//                 </div>
//                 <div style={{ marginBottom: 22 }}>
//                   {pkg.features.slice(0, 4).map(f => (
//                     <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
//                       <span style={{ color: '#22c55e', fontSize: 14, fontWeight: 700 }}>✓</span>
//                       <span style={{ fontSize: 13, color: '#475569' }}>{f}</span>
//                     </div>
//                   ))}
//                 </div>
//                 <Link href={`/register?package=${pkg.id}`} style={{
//                   display: 'block', textAlign: 'center',
//                   padding: '10px', borderRadius: 8,
//                   background: pkg.is_popular ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : '#f8fafc',
//                   border: pkg.is_popular ? 'none' : '1.5px solid #e2e8f0',
//                   color: pkg.is_popular ? '#fff' : '#475569',
//                   fontWeight: 600, fontSize: 14, textDecoration: 'none',
//                 }}>
//                   Start Free Trial
//                 </Link>
//               </div>
//             ))}
//           </div>
//         )}

//         <div style={{ textAlign: 'center' }}>
//           <Link href="/pricing" style={{ fontSize: 15, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
//             View all plans including Add-ons →
//           </Link>
//         </div>
//       </div>
//     </section>
//   );
// }


'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { publicService } from '../../lib/services/publicService';
import Container from '@/components/ui/Conatiner';
import walet from '@/public/UI_Images/Wallet.png'
import Image from 'next/image';
import PricingCard from '../../components/ui/PricingCard'
import { FaArrowRight } from 'react-icons/fa';
import { PublicPackage } from '@/types';

export default function PricingPreview() {
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);


  console.log(publicService.getPackages())
  useEffect(() => {
    publicService.getPackages()
      .then(pkgs => {
        console.log(pkgs.map(p => p.name), "ALL NAMES");
        setPackages(pkgs.slice(0, 3));
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  console.log(packages, "Packages")

  return (
    <section id="pricing" style={{ padding: '60px 0', background: 'var(--bg-white)' }}>
      <Container>
        <div className='w-full grid grid-cols-1 md:grid-cols-2 items-center gap-5' >
          <div className='flex items-start gap-2 flex-col w-full'>
            <div className='features_bnt'>
              Pricing
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: '#0f172a' }}>
              Simple, Transparent Pricing
            </h2>
            <p style={{ fontSize: 17, color: 'var(--text-muted)' }}>Start free, scale as you grow</p>
          </div>

          <div className="w-full h-[250px] hidden md:flex items-center justify-center">
            <Image
              src={walet}
              alt="Wallet"
              className="w-full h-full object-contain"
            />
          </div>

        </div>

        {loading ? (
          <div className='mt-4 mb-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 items-start gap-4 w-full'>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={
                  i === 1
                    ? ''
                    : i === 2
                      ? 'hidden md:block'
                      : 'hidden lg:block'
                }
                style={{
                  height: 380,
                  background: '#f8fafc',
                  borderRadius: 16,
                  animation: 'pulse 1.5s infinite',
                }}
              />
            ))}
          </div>
        ) : (
          <div className='grid md:grid-cols-2 lg:grid-cols-3 items-start gap-3 mb-16 w-full mt-4'>
            {packages.map(pkg => (
              <PricingCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center' }} className="PrcingPlan">
          <Link href="/pricing" style={{ display: 'flex', justifyContent: "center", alignItems: "center", gap: "5px", fontSize: 15, color: 'var(--text-muted)', fontWeight: 600, textDecoration: 'none' }}>
            View all plans including Add-ons <FaArrowRight size={16} />
          </Link>
        </div>
      </Container>
    </section>
  );
}
