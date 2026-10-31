import DedicatedIpChecker from '@/components/tools/DedicatedIpChecker';

export default function ProxyCheckerPage() {
  return (
    <section className="premium-page-section !py-4 pb-[max(4rem,env(safe-area-inset-bottom))] sm:!py-8">
      <div className="container mx-auto max-w-4xl px-3 sm:px-6">
        <DedicatedIpChecker />
      </div>
    </section>
  );
}
