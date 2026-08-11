// 'use client';
// import Link from 'next/link';

// export default function CTASection() {
//   return (
//     <section style={{
//       padding: '100px 24px',
//       background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #0ea5e9 100%)',
//       textAlign: 'center',
//     }}>
//       <div style={{ maxWidth: 640, margin: '0 auto' }}>
//         <div style={{ fontSize: 44, marginBottom: 20 }}>🚀</div>
//         <h2 style={{ fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 900, color: '#fff', margin: '0 0 16px', letterSpacing: '-0.5px' }}>
//           Ready to Transform Your Business?
//         </h2>
//         <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.82)', marginBottom: 40, lineHeight: 1.6 }}>
//           Start your 14-day free trial. No credit card required.
//         </p>
//         <Link href="/register" style={{
//           display: 'inline-block',
//           padding: '16px 44px',
//           background: '#fff',
//           borderRadius: 50,
//           fontSize: 17,
//           fontWeight: 700,
//           color: '#2563eb',
//           textDecoration: 'none',
//           boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
//           transition: 'transform 0.15s',
//         }}
//         onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.transform = 'translateY(-2px)')}
//         onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.transform = 'none')}>
//           Get Started Free →
//         </Link>
//         <div style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
//           No credit card · Cancel anytime · Full access during trial
//         </div>
//       </div>
//     </section>
//   );
// }


"use client";
import Link from "next/link";
import rocket from "@/public/UI_Images/RocketIcon.png";
import Image from "next/image";
import Container from "../../components/ui/Conatiner";
import "@/styles/index.css"
export default function CTASection() {
  return (
    <Container>
      <section
        className="relative w-full  overflow-hidden max-[450px]:h-96 h-80 rounded-5 cta_Section px-5 py-2"
        style={{
          background: "var(--brand-gradient)",
        }}
      >
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10"></div>

        <div className="relative z-10 h-full grid grid-cols-12 items-center gap-4 w-full">

          <div className="max-[1200px]:col-span-12 col-span-7 w-full">
            <h2
              className="text-white cta_heading fw-bold"
              style={{
                fontSize: "42px",
              }}
            >
              Ready to Transform Your Business?
            </h2>

            <p
              style={{
                color: "rgba(255,255,255,0.85)",
                fontSize: "16px",
                maxWidth: "500px",
              }}
            >
              Join thousands of businesses already using Movent to manage
              and grow their business.
            </p>

            <div className="d-flex gap-3 flex-wrap">
              <Link
                href="/register"
                className="text-decoration-none"
                style={{
                  background: "#fff",
                  color: "var(--brand-pink)",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  fontWeight: "600",
                }}
              >
                Start Free Trial
              </Link>

              <Link
                href="/demo"
                className="text-decoration-none"
                style={{
                  border: "1px solid rgba(255,255,255,0.4)",
                  color: "#fff",
                  padding: "12px 24px",
                  borderRadius: "10px",
                  fontWeight: "600",
                }}
              >
                Book a Demo
              </Link>
            </div>
          </div>

          <div className="max-[1200px]:col-span-0 max-[1200px]:hidden col-span-5 w-full h-full">
            <Image
              src={rocket}
              alt="Rocket"
              className="img-fluid"
            />
          </div>

        </div>
      </section>
    </Container>
  );
}
