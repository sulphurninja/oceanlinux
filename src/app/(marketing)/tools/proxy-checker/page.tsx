'use client';

import Link from 'next/link';
import { Globe, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ProxyCheckerPanel from '@/components/tools/ProxyCheckerPanel';

export default function ProxyCheckerPage() {
  return (
    <>
      <section className="border-b border-white/10 bg-white/[0.04] backdrop-blur-md">
        <div className="container mx-auto container-padding py-4 sm:py-5">
          <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <Badge
                  variant="outline"
                  className="h-5 px-2 text-[10px] font-medium border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                >
                  Free Tool
                </Badge>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-white/40">
                  <Globe className="h-3 w-3 text-emerald-400/80" />
                  ip:port:user:pass
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Proxy IP <span className="text-emerald-400">Checker</span>
              </h1>
              <p className="text-xs sm:text-sm text-white/50 mt-1 max-w-xl">
                Test IRCTC, Google, YouTube and more — paste proxy and check instantly.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0 border-white/10 text-white/60 hover:text-white h-8">
              <Link href="/tools">
                <ArrowRight className="h-3.5 w-3.5 rotate-180 mr-1.5" />
                All tools
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="premium-page-section !py-6 sm:!py-8 pb-16">
        <div className="container mx-auto container-padding max-w-6xl w-full min-w-0 overflow-x-hidden">
          <ProxyCheckerPanel variant="marketing" />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/35">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              &lt; 500 ms fast
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/35">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              &lt; 2 s ok
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/35">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              slow
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
