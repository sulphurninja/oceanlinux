'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  IndianRupee,
  Loader2,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Wallet,
  CreditCard,
  CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DailyRow = {
  date: string;
  label: string;
  vpsOrders: number;
  vpsRevenue: number;
  gatewayAmount: number;
  walletUsed: number;
  renewals: number;
  renewalRevenue: number;
  walletTopups: number;
  walletTopupAmount: number;
  totalExternalIn: number;
  totalBusiness: number;
};

type PaymentDashboardData = {
  timezone: string;
  today: DailyRow;
  last7: DailyRow[];
  daily: DailyRow[];
  periodTotals: Omit<DailyRow, 'date' | 'label'>;
  range: { from: string; to: string; days: number };
};

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof IndianRupee;
  tone?: 'default' | 'green' | 'blue' | 'amber' | 'violet';
}) {
  const toneClass =
    tone === 'green'
      ? 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/20'
      : tone === 'blue'
        ? 'from-sky-500/15 to-sky-500/5 border-sky-500/20'
        : tone === 'amber'
          ? 'from-amber-500/15 to-amber-500/5 border-amber-500/20'
          : tone === 'violet'
            ? 'from-violet-500/15 to-violet-500/5 border-violet-500/20'
            : 'from-primary/10 to-primary/5 border-border';

  return (
    <Card className={cn('overflow-hidden border bg-gradient-to-br', toneClass)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function PaymentDashboard() {
  const [data, setData] = useState<PaymentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/payment-dashboard?days=${days}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load dashboard');
      setData(json);
    } catch (err) {
      console.error(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxBar = useMemo(() => {
    if (!data?.last7?.length) return 1;
    return Math.max(...data.last7.map((d) => d.totalExternalIn), 1);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Payment dashboard load nahi hua. Refresh try karo.
        </CardContent>
      </Card>
    );
  }

  const { today, periodTotals } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Daily Payments</h2>
            <Badge variant="secondary" className="font-normal">IST</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Aaj ka sell + per-day gateway / wallet breakdown — {data.range.from} se {data.range.to}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 60].map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={days === n ? 'default' : 'outline'}
              onClick={() => setDays(n)}
            >
              {n} days
            </Button>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-background to-violet-500/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            Aaj — {today.label}
          </CardTitle>
          <CardDescription>India time (IST) ke hisaab se aaj ki sales & payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              title="VPS Sold"
              value={String(today.vpsOrders)}
              hint={formatInr(today.vpsRevenue)}
              icon={ShoppingCart}
              tone="blue"
            />
            <StatCard
              title="Gateway In"
              value={formatInr(today.gatewayAmount + today.renewalRevenue)}
              hint="Razorpay / Cashfree / UPI"
              icon={CreditCard}
              tone="green"
            />
            <StatCard
              title="Wallet Used"
              value={formatInr(today.walletUsed)}
              hint="Orders paid from wallet"
              icon={Wallet}
              tone="amber"
            />
            <StatCard
              title="Renewals"
              value={String(today.renewals)}
              hint={formatInr(today.renewalRevenue)}
              icon={TrendingUp}
              tone="violet"
            />
            <StatCard
              title="Wallet Top-ups"
              value={String(today.walletTopups)}
              hint={formatInr(today.walletTopupAmount)}
              icon={Wallet}
            />
            <StatCard
              title="Total Cash In"
              value={formatInr(today.totalExternalIn)}
              hint="Gateway + top-ups"
              icon={IndianRupee}
              tone="green"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 7 days — cash in</CardTitle>
          <CardDescription>Har din kitna payment aaya (external gateway + wallet top-ups)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.last7.map((row) => (
            <div key={row.date} className="grid grid-cols-[88px_1fr_96px] items-center gap-3">
              <div className="text-xs text-muted-foreground">
                {row.date === today.date ? 'Today' : row.label.split(',')[0]}
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
                  style={{ width: `${Math.max(4, (row.totalExternalIn / maxBar) * 100)}%` }}
                />
              </div>
              <div className="text-right text-sm font-semibold tabular-nums">
                {formatInr(row.totalExternalIn)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={`${days}-day VPS sales`}
          value={String(periodTotals.vpsOrders)}
          hint={formatInr(periodTotals.vpsRevenue)}
          icon={ShoppingCart}
          tone="blue"
        />
        <StatCard
          title={`${days}-day gateway`}
          value={formatInr(periodTotals.gatewayAmount)}
          hint="New order gateway portion"
          icon={CreditCard}
          tone="green"
        />
        <StatCard
          title={`${days}-day renewals`}
          value={String(periodTotals.renewals)}
          hint={formatInr(periodTotals.renewalRevenue)}
          icon={TrendingUp}
          tone="violet"
        />
        <StatCard
          title={`${days}-day cash in`}
          value={formatInr(periodTotals.totalExternalIn)}
          hint={`Top-ups ${formatInr(periodTotals.walletTopupAmount)}`}
          icon={IndianRupee}
          tone="green"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-day breakdown</CardTitle>
          <CardDescription>Din-wise orders, revenue, gateway, wallet & renewals</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">VPS</TableHead>
                  <TableHead className="text-right">VPS ₹</TableHead>
                  <TableHead className="text-right">Gateway ₹</TableHead>
                  <TableHead className="text-right">Wallet ₹</TableHead>
                  <TableHead className="text-right">Renewals</TableHead>
                  <TableHead className="text-right">Top-ups ₹</TableHead>
                  <TableHead className="text-right">Cash In ₹</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.daily.map((row) => (
                  <TableRow
                    key={row.date}
                    className={cn(row.date === today.date && 'bg-primary/5 font-medium')}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.label}
                        {row.date === today.date ? (
                          <Badge className="text-[10px] h-5">Today</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.vpsOrders}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInr(row.vpsRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatInr(row.gatewayAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {formatInr(row.walletUsed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.renewals > 0 ? `${row.renewals} · ${formatInr(row.renewalRevenue)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.walletTopupAmount > 0 ? formatInr(row.walletTopupAmount) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatInr(row.totalExternalIn)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
