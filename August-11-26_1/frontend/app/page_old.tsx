import LandingNavbar from '@/components/landing/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import ModuleSection from '@/components/landing/ModuleSection';
import PricingPreview from '@/components/landing/PricingPreview';
import HowItWorks from '@/components/landing/HowItWorks';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import CTASection from '@/components/landing/CTASection';
import LandingFooter from '@/components/landing/Footer';

export default function LandingPage() {
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
