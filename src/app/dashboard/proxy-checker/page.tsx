'use client';

import DedicatedIpChecker from '@/components/tools/DedicatedIpChecker';

export default function DashboardProxyCheckerPage() {
  return (
    <div className="premium-dashboard-page min-w-0 w-full max-w-full overflow-x-hidden">
      <div
        className="premium-dashboard-page-inner w-full min-w-0 !px-3 sm:!px-6"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <DedicatedIpChecker variant="dashboard" />
      </div>
    </div>
  );
}
