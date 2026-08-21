import CTA from '@/components/landing/CTA';
import Performance from '@/components/landing/Performance';
import PublicPageHero from '@/components/landing/PublicPageHero';

export default function PerformancePage() {
  return (
    <>
      <PublicPageHero
        eyebrow="Speed"
        title="Unmatched"
        titleAccent="Performance"
        description="Experience lightning-fast NVMe storage, optimized networking, and low-latency infrastructure built for demanding workloads."
      />
      <Performance />
      <CTA />
    </>
  );
}
