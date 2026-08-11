import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LandingNavbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import ModuleSection from '@/components/landing/ModuleSection';
import PricingPreview from '@/components/landing/PricingPreview';
import HowItWorks from '@/components/landing/HowItWorks';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import CTASection from '@/components/landing/CTASection';
import LandingFooter from '@/components/landing/Footer';
import '@/styles/LandingPageStyle.css'

export default async function LandingPage() {
  // Already logged in (any tier) → skip the marketing page, go straight to
  // the right dashboard. Same auth_token/auth_type cookies as lib/auth.ts,
  // plus the client portal's separate client_token — just read server-side
  // here since this page has no client-side auth check today.
  const cookieStore = await cookies();
  const authToken   = cookieStore.get('auth_token')?.value;
  const authType    = cookieStore.get('auth_type')?.value;
  const clientToken = cookieStore.get('client_token')?.value;

  if (authToken && authType) {
    const dest = authType === 'admin' ? '/admin/dashboard' : authType === 'super_admin' ? '/super-admin/dashboard' : '/dashboard';
    redirect(dest);
  } else if (clientToken) {
    redirect('/client/dashboard');
  }

  return (
    <>
      <LandingNavbar />
      <HeroSection />
      <FeaturesSection />
      <ModuleSection />
      <PricingPreview />
      <HowItWorks />
      <TestimonialsSection />
      <CTASection />
      <LandingFooter />
    </>
  );
}
