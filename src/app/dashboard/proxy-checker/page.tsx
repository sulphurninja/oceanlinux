'use client';

import { Globe, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ProxyCheckerPanel from '@/components/tools/ProxyCheckerPanel';

export default function DashboardProxyCheckerPage() {
  return (
    <div className="premium-dashboard-page min-w-0 w-full max-w-full overflow-x-hidden">
      <div
        className="premium-dashboard-page-inner space-y-4 sm:space-y-6 w-full"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start gap-3 sm:gap-4 premium-scripts-header min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-100 dark:bg-orange-500/15 flex items-center justify-center border border-orange-200 dark:border-orange-400/25 shrink-0">
            <Globe className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Paste{' '}
              <code className="text-orange-700 dark:text-orange-200/90 break-all text-[11px] sm:text-xs">
                ip:port:user:pass
              </code>{' '}
              and test IRCTC, Google, YouTube and more.
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 sm:flex-wrap sm:overflow-visible">
          <Badge variant="secondary" className="gap-1.5 shrink-0 text-[11px] sm:text-xs">
            <Globe className="h-3 w-3" />
            1. Paste proxy
          </Badge>
          <Badge variant="secondary" className="gap-1.5 shrink-0 text-[11px] sm:text-xs">
            <Zap className="h-3 w-3" />
            2. Select sites
          </Badge>
          <Badge variant="secondary" className="gap-1.5 shrink-0 text-[11px] sm:text-xs">
            <Globe className="h-3 w-3" />
            3. Check live
          </Badge>
        </div>

        <ProxyCheckerPanel variant="dashboard" />

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            &lt; 500 ms fast
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            &lt; 2 s ok
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            slow
          </span>
        </div>
      </div>
    </div>
  );
}
