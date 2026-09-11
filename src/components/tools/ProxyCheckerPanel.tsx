'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Globe,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  RefreshCw,
  Shield,
  Zap,
  Copy,
  Sparkles,
  Timer,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TargetOption = { id: string; label: string; category: string };

type CheckResult = {
  id: string;
  label: string;
  working: boolean;
  partial?: boolean;
  status: number | null;
  ms: number;
  message: string;
  skipped?: boolean;
};

type HealthResult = {
  working: boolean;
  ms: number;
  message: string;
  outboundIp?: string | null;
  partial?: boolean;
};

const MAX_SITES = 8;

const PRESETS: { label: string; ids: string[] }[] = [
  { label: 'Popular', ids: ['irctc', 'google', 'youtube', 'amazon_in'] },
  { label: 'India', ids: ['irctc', 'paytm', 'amazon_in', 'flipkart'] },
  { label: 'IRCTC only', ids: ['irctc'] },
];

const SITE_STYLE: Record<string, { ring: string; dot: string }> = {
  google: { ring: 'ring-blue-500/30', dot: 'bg-blue-400' },
  irctc: { ring: 'ring-orange-500/30', dot: 'bg-orange-400' },
  youtube: { ring: 'ring-red-500/30', dot: 'bg-red-400' },
  amazon_in: { ring: 'ring-amber-500/30', dot: 'bg-amber-400' },
  flipkart: { ring: 'ring-yellow-500/30', dot: 'bg-yellow-400' },
  paytm: { ring: 'ring-sky-500/30', dot: 'bg-sky-400' },
};

function parseProxyPreview(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length < 4) return null;
  const ip = parts[0].trim();
  const port = parseInt(parts[1], 10);
  const username = parts[2].trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
  if (!username) return null;
  return { ip, port, username };
}

function latencyClass(ms: number, dashboard = false) {
  if (dashboard) {
    if (ms <= 500) {
      return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-500/25';
    }
    if (ms <= 2000) {
      return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/25';
    }
    return 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-500/15 dark:border-red-500/25';
  }
  if (ms <= 500) return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25';
  if (ms <= 2000) return 'text-amber-300 bg-amber-500/15 border-amber-500/25';
  return 'text-red-300 bg-red-500/15 border-red-500/25';
}

type ProxyCheckerPanelProps = {
  variant?: 'dashboard' | 'marketing';
};

export default function ProxyCheckerPanel({ variant = 'marketing' }: ProxyCheckerPanelProps) {
  const isDashboard = variant === 'dashboard';

  const [proxyLine, setProxyLine] = useState('');
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [summary, setSummary] = useState<{ total: number; working: number; failed: number } | null>(
    null
  );

  useEffect(() => {
    fetch('/api/tools/proxy-check')
      .then((r) => r.json())
      .then((data) => {
        const list: TargetOption[] = data.targets || [];
        setTargets(list);
        setSelected(new Set(['irctc']));
      })
      .catch(() => toast.error('Could not load website list'))
      .finally(() => setLoadingTargets(false));
  }, []);

  const irctcTarget = useMemo(() => targets.find((t) => t.id === 'irctc') || null, [targets]);

  const groupedOthers = useMemo(() => {
    const map = new Map<string, TargetOption[]>();
    for (const t of targets) {
      if (t.id === 'irctc') continue;
      const arr = map.get(t.category) || [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [targets]);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      if (a.id === 'irctc') return -1;
      if (b.id === 'irctc') return 1;
      return 0;
    });
  }, [results]);

  const proxyPreview = useMemo(() => parseProxyPreview(proxyLine), [proxyLine]);
  const successRate = summary ? Math.round((summary.working / summary.total) * 100) : 0;

  const cardClass = isDashboard ? 'premium-dashboard-card border-0' : 'premium-glass-card border-white/10';
  const titleClass = cn('flex items-center gap-2 text-lg', isDashboard ? 'text-foreground' : 'text-white');
  const descClass = isDashboard ? 'text-muted-foreground' : 'text-white/50';
  const labelClass = isDashboard ? 'text-foreground' : 'text-white/80';
  const mutedText = isDashboard ? 'text-muted-foreground' : 'text-white/50';
  const iconAccent = isDashboard ? 'text-emerald-600 dark:text-emerald-300' : 'text-emerald-300';
  const codeAccent = isDashboard
    ? 'text-emerald-700 dark:text-emerald-300/90'
    : 'text-emerald-300/90';
  const siteIdleClass = isDashboard
    ? 'border-border bg-muted/40 hover:bg-muted/60 hover:border-border'
    : 'border-white/10 bg-black/20 hover:bg-white/5 hover:border-white/20';
  const presetClass = isDashboard
    ? 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white';
  const chipBtnClass = isDashboard
    ? 'border-border text-muted-foreground hover:text-foreground'
    : 'border-white/10 text-white/50 hover:text-white/80';
  const countBadgeClass = isDashboard
    ? 'border-border text-muted-foreground font-normal'
    : 'border-white/15 text-white/60 font-normal';
  const previewBoxClass = isDashboard
    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5'
    : 'border-emerald-500/20 bg-emerald-500/5';
  const previewIpClass = isDashboard
    ? 'font-mono text-emerald-700 dark:text-emerald-200 truncate'
    : 'font-mono text-emerald-200 truncate';
  const emptyStateClass = isDashboard
    ? 'border-border bg-muted/30'
    : 'border-white/10 bg-black/15';
  const loadingBoxClass = isDashboard
    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5'
    : 'border-emerald-500/20 bg-emerald-500/5';
  const healthOkClass = isDashboard
    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/80 dark:border-emerald-500/30 dark:from-emerald-500/15 dark:to-emerald-950/20'
    : 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-950/20';
  const healthFailClass = isDashboard
    ? 'border-red-200 bg-gradient-to-br from-red-50 to-red-100/80 dark:border-red-500/30 dark:from-red-500/15 dark:to-red-950/20'
    : 'border-red-500/30 bg-gradient-to-br from-red-500/15 to-red-950/20';
  const statsBarClass = isDashboard
    ? 'border-border bg-muted/40 dark:bg-black/10'
    : 'border-white/10 bg-black/10';
  const progressTrackClass = isDashboard ? 'bg-muted' : 'bg-black/20';
  const resultOkClass = isDashboard
    ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06]'
    : 'border-emerald-500/20 bg-emerald-500/[0.06]';
  const resultFailClass = isDashboard
    ? 'border-red-200 bg-red-50/90 dark:border-red-500/20 dark:bg-red-500/[0.06]'
    : 'border-red-500/20 bg-red-500/[0.06]';
  const statWorkingClass = isDashboard
    ? 'text-2xl font-bold text-emerald-600 dark:text-emerald-300 tabular-nums'
    : 'text-2xl font-bold text-emerald-300 tabular-nums';
  const statFailedClass = isDashboard
    ? 'text-2xl font-bold text-red-600 dark:text-red-300 tabular-nums'
    : 'text-2xl font-bold text-red-300 tabular-nums';

  const toggleTarget = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= MAX_SITES) {
        toast.error(`Maximum ${MAX_SITES} websites per check`);
        return prev;
      }
      next.add(id);
      return next;
    });
  };

  const applyPreset = (ids: string[]) => {
    const available = ids.filter((id) => targets.some((t) => t.id === id));
    setSelected(new Set(available.slice(0, MAX_SITES)));
  };

  const selectAll = () => setSelected(new Set(targets.slice(0, MAX_SITES).map((t) => t.id)));
  const clearAll = () => setSelected(new Set());

  const copyExample = () => {
    navigator.clipboard.writeText('151.245.220.26:9619:username:password');
    toast.success('Example format copied');
  };

  const renderSiteOption = (t: TargetOption, featured = false) => {
    const style = SITE_STYLE[t.id];
    const isOn = selected.has(t.id);
    return (
      <label
        key={t.id}
        className={cn(
          'flex items-center gap-2.5 sm:gap-3 rounded-xl border px-2.5 sm:px-3 py-2.5 sm:py-2.5 cursor-pointer transition-all min-w-0 min-h-[44px] touch-manipulation',
          featured
            ? isOn
              ? 'border-orange-500/40 bg-orange-500/10 ring-1 ring-orange-500/25'
              : 'border-orange-500/20 bg-orange-500/[0.06] hover:bg-orange-500/10'
            : isOn
              ? cn('border-emerald-500/35 bg-emerald-500/10 ring-1', style?.ring || 'ring-emerald-500/20')
              : siteIdleClass
        )}
      >
        <Checkbox checked={isOn} onCheckedChange={() => toggleTarget(t.id)} />
        <span
          className={cn(
            'h-2 w-2 rounded-full shrink-0',
            style?.dot || (isDashboard ? 'bg-muted-foreground/40' : 'bg-white/30')
          )}
        />
        <span className={cn('text-sm flex-1', isDashboard ? 'text-foreground/90' : 'text-white/90')}>
          {t.label}
        </span>
        {featured && (
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-normal border-orange-300 text-orange-700 dark:border-orange-500/30 dark:text-orange-300'
            )}
          >
            Top pick
          </Badge>
        )}
      </label>
    );
  };

  const runCheck = async () => {
    const line = proxyLine.trim();
    if (!line) {
      toast.error('Paste your proxy: ip:port:username:password');
      return;
    }
    if (selected.size === 0) {
      toast.error('Select at least one website');
      return;
    }

    setLoading(true);
    setResults([]);
    setHealth(null);
    setSummary(null);

    try {
      const res = await fetch('/api/tools/proxy-check', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxy: line,
          targets: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || 'Check failed');
        return;
      }
      setHealth(data.health || null);
      setResults(data.results || []);
      setSummary(data.summary || null);
      const working = data.summary?.working ?? 0;
      const total = data.summary?.total ?? 0;
      if (working > 0) {
        toast.success(`Working on ${working}/${total} site(s)`);
      } else {
        toast.error(data.health?.message || 'Proxy did not reach any selected site');
      }
    } catch {
      toast.error('Network error — try again');
    } finally {
      setLoading(false);
    }
  };

  const cardHeaderClass = isDashboard ? 'px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4' : 'pb-4';
  const cardBodyClass = isDashboard ? 'px-4 pb-4 sm:px-6 sm:pb-6 space-y-4 sm:space-y-5' : 'space-y-5';

  return (
    <div
      className={cn(
        'grid grid-cols-1 min-w-0 w-full',
        isDashboard
          ? 'gap-4 sm:gap-5 lg:grid-cols-2 lg:gap-6 xl:gap-8'
          : 'gap-4 sm:gap-6 lg:grid-cols-2 lg:gap-6 xl:grid-cols-5 xl:gap-6'
      )}
    >
      <Card className={cn(cardClass, 'min-w-0 w-full', !isDashboard && 'lg:col-span-1 xl:col-span-2')}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle className={cn(titleClass, isDashboard && 'text-base sm:text-lg')}>
            <Shield className={cn('h-4 w-4 sm:h-5 sm:w-5 shrink-0', iconAccent)} />
            Proxy details
          </CardTitle>
          <CardDescription className={cn(descClass, 'text-xs sm:text-sm break-words')}>
            Format:{' '}
            <code className={cn(codeAccent, 'break-all text-[11px] sm:text-xs')}>
              ip:port:username:password
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent className={cardBodyClass}>
          <div className="space-y-2">
            <Label htmlFor="proxy-line" className={labelClass}>
              Proxy line
            </Label>
            <Textarea
              id="proxy-line"
              placeholder="151.245.220.26:9619:username:password"
              value={proxyLine}
              onChange={(e) => setProxyLine(e.target.value)}
              rows={2}
              spellCheck={false}
              className={cn(
                'font-mono text-[13px] sm:text-sm resize-none min-h-[4.5rem] break-all',
                !isDashboard && 'bg-black/30 border-white/10 text-white placeholder:text-white/25'
              )}
            />
            <button
              type="button"
              onClick={copyExample}
              className={cn(
                'text-xs inline-flex items-center gap-1',
                isDashboard
                  ? 'text-emerald-700 hover:text-emerald-800 dark:text-emerald-400/80 dark:hover:text-emerald-300'
                  : 'text-emerald-400/80 hover:text-emerald-300'
              )}
            >
              <Copy className="h-3 w-3" />
              Copy example format
            </button>
          </div>

          {proxyPreview && (
            <div
              className={cn(
                'rounded-xl border p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-xs',
                previewBoxClass
              )}
            >
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <p className={cn('mb-0.5', mutedText)}>IP</p>
                <p className={cn(previewIpClass, 'break-all')}>{proxyPreview.ip}</p>
              </div>
              <div className="min-w-0">
                <p className={cn('mb-0.5', mutedText)}>Port</p>
                <p className="font-mono">{proxyPreview.port}</p>
              </div>
              <div className="min-w-0">
                <p className={cn('mb-0.5', mutedText)}>User</p>
                <p className="font-mono truncate">{proxyPreview.username}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className={labelClass}>Websites to test</Label>
              <Badge variant="outline" className={countBadgeClass}>
                {selected.size}/{MAX_SITES} selected
              </Badge>
            </div>

            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 sm:flex-wrap sm:overflow-visible">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.ids)}
                  disabled={loadingTargets}
                  className={cn(
                    'text-xs rounded-full border px-2.5 sm:px-3 py-2 sm:py-1.5 transition-colors shrink-0 min-h-[36px] sm:min-h-0 touch-manipulation',
                    presetClass
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={selectAll}
                disabled={loadingTargets}
                className={cn('text-xs rounded-full border px-2.5 sm:px-3 py-1.5 shrink-0', chipBtnClass)}
              >
                All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className={cn('text-xs rounded-full border px-2.5 sm:px-3 py-1.5 shrink-0', chipBtnClass)}
              >
                Clear
              </button>
            </div>

            {loadingTargets ? (
              <div className={cn('flex items-center gap-2 text-sm py-10 justify-center', mutedText)}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading websites…
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4 max-h-[min(42vh,220px)] sm:max-h-[260px] lg:max-h-[280px] overflow-y-auto pr-1 -mr-0.5">
                {irctcTarget && (
                  <div>
                    <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400/80 uppercase tracking-wider mb-2">
                      IRCTC
                    </p>
                    {renderSiteOption(irctcTarget, true)}
                  </div>
                )}
                {[...groupedOthers.entries()].map(([category, items]) => (
                  <div key={category}>
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400/70 uppercase tracking-wider mb-2">
                      {category}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {items.map((t) => renderSiteOption(t))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            className={cn(
              'w-full gap-2 h-10 sm:h-11 text-sm sm:text-base',
              !isDashboard && 'premium-btn-primary'
            )}
            onClick={runCheck}
            disabled={loading || loadingTargets || !proxyPreview || selected.size === 0}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing proxy…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Check {selected.size || ''} site{selected.size === 1 ? '' : 's'}
              </>
            )}
          </Button>

          <p className={cn('text-[11px] leading-relaxed text-center', isDashboard ? 'text-muted-foreground' : 'text-white/35')}>
            Credentials are used only for this test and never stored.
          </p>
        </CardContent>
      </Card>

      <Card className={cn(cardClass, 'min-w-0 w-full', !isDashboard && 'lg:col-span-1 xl:col-span-3')}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle className={cn(titleClass, isDashboard && 'text-base sm:text-lg')}>
            <Zap className={cn('h-4 w-4 sm:h-5 sm:w-5 shrink-0', iconAccent)} />
            Live results
          </CardTitle>
          <CardDescription className={cn(descClass, 'text-xs sm:text-sm')}>
            Status is based on your selected sites — same way IRCTC loads in browser.
          </CardDescription>
        </CardHeader>
        <CardContent className={cardBodyClass}>
          {loading && (
            <div
              className={cn(
                'rounded-xl sm:rounded-2xl border px-4 py-8 sm:px-6 sm:py-10 flex flex-col items-center gap-3 sm:gap-4',
                loadingBoxClass
              )}
            >
              <div className="relative">
                <Loader2 className={cn('h-10 w-10 animate-spin', iconAccent)} />
                <Sparkles className={cn('h-4 w-4 absolute -top-1 -right-1', iconAccent)} />
              </div>
              <div className="text-center">
                <p className="font-medium">Running checks through your proxy</p>
                <p className={cn('text-sm mt-1', mutedText)}>This usually takes 5–30 seconds</p>
              </div>
            </div>
          )}

          {!loading && !results.length && (
            <div
              className={cn(
                'rounded-xl sm:rounded-2xl border border-dashed px-4 py-10 sm:px-6 sm:py-14 text-center',
                emptyStateClass
              )}
            >
              <Activity className={cn('h-10 w-10 mx-auto mb-4', mutedText)} />
              <p className="font-medium">No results yet</p>
              <p className={cn('text-sm mt-2 max-w-sm mx-auto', mutedText)}>
                Paste proxy, pick sites like IRCTC or Google, then hit Check.
              </p>
            </div>
          )}

          {!loading && health && summary && (
            <>
              <div
                className={cn(
                  'rounded-2xl border overflow-hidden',
                  health.working ? healthOkClass : healthFailClass
                )}
              >
                <div className="p-4 sm:p-5 lg:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={cn(
                          'rounded-full p-1.5 sm:p-2 shrink-0',
                          health.working ? 'bg-emerald-500/20' : 'bg-red-500/20'
                        )}
                      >
                        {health.working ? (
                          <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-[10px] sm:text-xs uppercase tracking-wider mb-1', mutedText)}>
                          Overall status
                        </p>
                        <p className="text-base sm:text-lg lg:text-xl font-semibold leading-snug break-words">
                          {health.working ? 'Proxy is working' : 'Proxy not reachable'}
                        </p>
                        <p className={cn('text-xs sm:text-sm mt-1 break-words', mutedText)}>{health.message}</p>
                      </div>
                    </div>
                    {health.ms > 0 && (
                      <div className="flex sm:flex-col items-center justify-between sm:justify-start sm:text-right gap-2 sm:gap-0 shrink-0 rounded-lg border border-border/60 bg-muted/30 sm:border-0 sm:bg-transparent px-3 py-2 sm:p-0">
                        <p className={cn('text-xs flex items-center gap-1 sm:justify-end', mutedText)}>
                          <Timer className="h-3 w-3" />
                          Best latency
                        </p>
                        <p className="text-xl sm:text-2xl font-bold tabular-nums">{health.ms} ms</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    <div className={cn('flex justify-between text-xs mb-1.5', mutedText)}>
                      <span>Success rate</span>
                      <span>
                        {summary.working}/{summary.total} sites
                      </span>
                    </div>
                    <div className={cn('h-2 rounded-full overflow-hidden', progressTrackClass)}>
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          successRate >= 75 ? 'bg-emerald-400' : successRate >= 40 ? 'bg-amber-400' : 'bg-red-400'
                        )}
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className={cn('grid grid-cols-3 border-t', statsBarClass)}>
                  <div className="px-2 py-2.5 sm:px-4 sm:py-3 text-center border-r border-border">
                    <p className={cn(statWorkingClass, 'text-xl sm:text-2xl')}>{summary.working}</p>
                    <p className={cn('text-[10px] sm:text-[11px] uppercase tracking-wide', mutedText)}>Working</p>
                  </div>
                  <div className="px-2 py-2.5 sm:px-4 sm:py-3 text-center border-r border-border">
                    <p className={cn(statFailedClass, 'text-xl sm:text-2xl')}>{summary.failed}</p>
                    <p className={cn('text-[10px] sm:text-[11px] uppercase tracking-wide', mutedText)}>Failed</p>
                  </div>
                  <div className="px-2 py-2.5 sm:px-4 sm:py-3 text-center">
                    <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{successRate}%</p>
                    <p className={cn('text-[10px] sm:text-[11px] uppercase tracking-wide', mutedText)}>Score</p>
                  </div>
                </div>
              </div>

              <ul className="space-y-2">
                {sortedResults.map((r) => {
                  const style = SITE_STYLE[r.id];
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        'flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-xl border px-3 py-3 sm:px-4 transition-colors min-w-0',
                        r.working ? resultOkClass : resultFailClass
                      )}
                    >
                      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                        <div
                          className={cn(
                            'h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 sm:mt-0',
                            r.working
                              ? 'bg-emerald-100 dark:bg-emerald-500/15'
                              : 'bg-red-100 dark:bg-red-500/15'
                          )}
                        >
                          {r.skipped ? (
                            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          ) : r.working ? (
                            <CheckCircle2
                              className={cn(
                                'h-4 w-4',
                                r.partial
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              )}
                            />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full shrink-0',
                                style?.dot || (isDashboard ? 'bg-muted-foreground/50' : 'bg-white/40')
                              )}
                            />
                            <p className="font-medium text-sm truncate min-w-0">{r.label}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] h-5 px-1.5 font-normal border',
                                r.working
                                  ? r.partial
                                    ? 'border-amber-300 text-amber-700 dark:border-amber-500/30 dark:text-amber-300'
                                    : 'border-emerald-300 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300'
                                  : 'border-red-300 text-red-700 dark:border-red-500/30 dark:text-red-300'
                              )}
                            >
                              {r.skipped
                                ? 'Skipped'
                                : r.working
                                  ? r.partial
                                    ? 'Partial'
                                    : 'Working'
                                  : 'Failed'}
                            </Badge>
                          </div>
                          <p className={cn('text-xs mt-0.5 line-clamp-2 sm:truncate', mutedText)}>{r.message}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1 shrink-0 pl-10 sm:pl-0 border-t border-border/40 sm:border-0 pt-2 sm:pt-0">
                        {!r.skipped && r.ms > 0 && (
                          <span
                            className={cn(
                              'text-[11px] font-mono px-2 py-0.5 rounded-md border tabular-nums',
                              latencyClass(r.ms, isDashboard)
                            )}
                          >
                            {r.ms} ms
                          </span>
                        )}
                        {r.status != null && (
                          <span className={cn('text-[10px] font-mono', isDashboard ? 'text-muted-foreground' : 'text-white/30')}>
                            HTTP {r.status}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <Button
                variant="outline"
                className={cn('w-full gap-2 h-10', isDashboard && 'premium-btn-outline')}
                onClick={runCheck}
                disabled={loading}
              >
                <RefreshCw className="h-4 w-4" />
                Re-check same sites
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
