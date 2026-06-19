import CTA from '@/components/landing/CTA';
import Security from '@/components/landing/Security';
import PublicPageHero from '@/components/landing/PublicPageHero';

export default function SecurityPage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Protection"
        title="Enterprise-Grade"
        titleAccent="Security"
        description="Protect your data and applications with advanced DDoS protection, firewalls, and security monitoring on every plan."
      />
      <Security />
      <CTA />
    </>
  );
}
