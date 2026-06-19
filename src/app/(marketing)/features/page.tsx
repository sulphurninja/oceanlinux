import CTA from '@/components/landing/CTA';
import Features from '@/components/landing/Features';
import PublicPageHero from '@/components/landing/PublicPageHero';

export default function FeaturesPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Platform"
        title="OceanLinux"
        titleAccent="Features"
        description="Discover the powerful features that make OceanLinux the best choice for affordable premium Linux VPS hosting."
      />
      <Features />
      <CTA />
    </>
  );
}
