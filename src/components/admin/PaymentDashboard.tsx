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
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DailyRow = {
  date: string;
  label: string;
  vpsOrders: number;
  vpsRevenue: number;
  vpsWalletOnly: number;
  vpsGatewayOnly: number;
  vpsMixed: number;
  vpsCartOrders: number;
  vpsGatewayAmount: number;
  vpsWalletAmount: number;
  cartCheckouts: number;
  cartGatewayAmount: number;
  cartWalletAmount: number;
  renewals: number;
  renewalRevenue: number;
  renewalGatewayAmount: number;
  renewalWalletAmount: number;
  renewalGatewayCount: number;
  renewalWalletCount: number;
  walletTopups: number;
  walletTopupAmount: number;
  gatewayCaptures: number;
  gatewayCollected: number;
  razorpayCaptures: number;
  razorpayCollected: number;
  razorpayVpsAmount: number;
  razorpayCartAmount: number;
  razorpayRenewalAmount: number;
  razorpayTopupAmount: number;
  upiCaptures: number;
  upiCollected: number;
  upiVpsAmount: number;
  upiCartAmount: number;
  upiRenewalAmount: number;
  upiTopupAmount: number;
  otherGatewayCaptures: number;
  otherGatewayCollected: number;
  walletSpent: number;
  walletAdded: number;
  totalBusiness: number;
  gatewayAmount: number;
  walletUsed: number;
  renewalGateway: number;
  totalExternalIn: number;
};

type PaymentDashboardData = {
  timezone: string;
  today: DailyRow;
  last7: DailyRow[];
  daily: DailyRow[];
  periodTotals: DailyRow;
  range: { from: string; to: string; days: number };
  notes?: string[];
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
        {hint ? <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function GatewayReconcileCard({ row }: { row: DailyRow }) {
  return (
    <Card className="border-[#3395FF]/30 bg-gradient-to-br from-[#3395FF]/10 via-background to-[#072654]/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#3395FF]" />
          Gateway — aaj ka hisaab (Razorpay + UPI)
        </CardTitle>
        <CardDescription>
          Razorpay dashboard aur KwikUPI se match karo — captured payments & collected amount
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Razorpay captures</p>
            <p className="text-2xl font-bold tabular-nums">{row.razorpayCaptures}</p>
            <p className="text-xs text-[#3395FF] font-medium tabular-nums">{formatInr(row.razorpayCollected)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">UPI (KwikUPI)</p>
            <p className="text-2xl font-bold tabular-nums">{row.upiCaptures}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
              {formatInr(row.upiCollected)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Legacy / other</p>
            <p className="text-2xl font-bold tabular-nums">{row.otherGatewayCaptures}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatInr(row.otherGatewayCollected)}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-muted-foreground">Sab gateways total</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {row.gatewayCaptures} · {formatInr(row.gatewayCollected)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border bg-background/80 p-3 text-sm space-y-1.5">
            <p className="font-medium text-foreground mb-2">Razorpay breakdown</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Naye VPS (single buy)</span>
              <span className="font-medium tabular-nums">{formatInr(row.razorpayVpsAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cart checkout</span>
              <span className="font-medium tabular-nums">{formatInr(row.razorpayCartAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Renewals</span>
              <span className="font-medium tabular-nums">{formatInr(row.razorpayRenewalAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">Wallet top-up</span>
              <span className="font-medium tabular-nums">{formatInr(row.razorpayTopupAmount)}</span>
            </div>
          </div>

          <div className="rounded-lg border bg-emerald-500/10 border-emerald-500/20 p-3 text-sm space-y-1.5">
            <p className="font-medium text-foreground mb-2">UPI breakdown (KwikUPI)</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Naye VPS (single buy)</span>
              <span className="font-medium tabular-nums">{formatInr(row.upiVpsAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cart checkout</span>
              <span className="font-medium tabular-nums">{formatInr(row.upiCartAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Renewals</span>
              <span className="font-medium tabular-nums">{formatInr(row.upiRenewalAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">Wallet top-up</span>
              <span className="font-medium tabular-nums">{formatInr(row.upiTopupAmount)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Razorpay</strong> — card/UPI via Razorpay checkout. <strong>UPI</strong> — inline QR (KwikUPI) se
          buy, cart, renewal, wallet top-up. Wallet-only orders yahan nahi aate.
        </p>
      </CardContent>
    </Card>
  );
}

function TodayBreakdown({ row }: { row: DailyRow }) {
  const standaloneGateway = row.vpsGatewayAmount;
  const standaloneWallet = row.vpsWalletAmount;
  const cartItems = row.vpsCartOrders;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">New VPS Sales</CardTitle>
          <CardDescription>{row.vpsOrders} orders · {formatInr(row.vpsRevenue)}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gateway only</span>
            <span className="font-medium">{row.vpsGatewayOnly} · {formatInr(standaloneGateway)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Wallet only</span>
            <span className="font-medium">{row.vpsWalletOnly} · {formatInr(standaloneWallet)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Wallet + Gateway</span>
            <span className="font-medium">{row.vpsMixed} orders</span>
          </div>
          {cartItems > 0 ? (
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">Cart checkout items</span>
              <span className="font-medium">
                {cartItems} · {row.cartCheckouts} payment{row.cartCheckouts === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Payment Gateway</CardTitle>
          <CardDescription>
            Razorpay {row.razorpayCaptures} · {formatInr(row.razorpayCollected)} · UPI{' '}
            {row.upiCaptures} · {formatInr(row.upiCollected)}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">New orders (single)</span>
            <span className="font-medium">{formatInr(standaloneGateway)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cart checkouts</span>
            <span className="font-medium">{formatInr(row.cartGatewayAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Renewals</span>
            <span className="font-medium">
              {row.renewalGatewayCount} · {formatInr(row.renewalGatewayAmount)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-1.5">
            <span className="text-muted-foreground">Wallet top-ups</span>
            <span className="font-medium">
              {row.walletTopups} · {formatInr(row.walletTopupAmount)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <span>UPI total (KwikUPI)</span>
            <span>{row.upiCaptures} · {formatInr(row.upiCollected)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 text-[#3395FF] font-medium">
            <span>Razorpay total (match dashboard)</span>
            <span>{row.razorpayCaptures} · {formatInr(row.razorpayCollected)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Wallet</CardTitle>
          <CardDescription>Balance movement today</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
            <span>Added (top-ups)</span>
            <span className="font-medium">+{formatInr(row.walletAdded)}</span>
          </div>
          <div className="flex justify-between text-amber-700 dark:text-amber-400">
            <span>Spent on orders</span>
            <span className="font-medium">−{formatInr(row.vpsWalletAmount + row.cartWalletAmount)}</span>
          </div>
          <div className="flex justify-between text-amber-700 dark:text-amber-400">
            <span>Spent on renewals</span>
            <span className="font-medium">−{formatInr(row.renewalWalletAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-medium">
            <span>Total spent</span>
            <span>{formatInr(row.walletSpent)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Renewals</CardTitle>
          <CardDescription>
            {row.renewals} renewals · {formatInr(row.renewalRevenue)}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Via gateway</span>
            <span className="font-medium">{row.renewalGatewayCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Via wallet</span>
            <span className="font-medium">{row.renewalWalletCount}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-medium">
            <span>Total business</span>
            <span>{formatInr(row.totalBusiness)}</span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            VPS sold ({row.vpsOrders}) ≠ gateway captures ({row.gatewayCaptures}) when cart ya wallet use hota hai.
          </p>
        </CardContent>
      </Card>
    </div>
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
    return Math.max(...data.last7.map((d) => d.gatewayCollected), 1);
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
            Gateway captures, wallet top-ups, wallet spend, renewals — {data.range.from} se {data.range.to}
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
          <CardDescription>India time (IST) — poora din ka payment report</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            <StatCard
              title="VPS Sold"
              value={String(today.vpsOrders)}
              hint={`Revenue ${formatInr(today.vpsRevenue)}`}
              icon={ShoppingCart}
              tone="blue"
            />
            <StatCard
              title="Razorpay Today"
              value={formatInr(today.razorpayCollected)}
              hint={`${today.razorpayCaptures} captures — dashboard se match`}
              icon={CreditCard}
              tone="blue"
            />
            <StatCard
              title="UPI Today"
              value={formatInr(today.upiCollected)}
              hint={`${today.upiCaptures} captures — KwikUPI inline QR`}
              icon={IndianRupee}
              tone="green"
            />
            <StatCard
              title="All Gateway"
              value={formatInr(today.gatewayCollected)}
              hint={`${today.gatewayCaptures} captures — Razorpay + UPI`}
              icon={CreditCard}
              tone="green"
            />
            <StatCard
              title="Wallet Added"
              value={formatInr(today.walletAdded)}
              hint={`${today.walletTopups} top-up${today.walletTopups === 1 ? '' : 's'}`}
              icon={Wallet}
            />
            <StatCard
              title="Wallet Spent"
              value={formatInr(today.walletSpent)}
              hint="Orders + renewals from balance"
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
              title="Total Business"
              value={formatInr(today.totalBusiness)}
              hint="New sales + renewals"
              icon={IndianRupee}
              tone="green"
            />
          </div>
          <GatewayReconcileCard row={today} />
          <TodayBreakdown row={today} />
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="flex gap-3 py-4 text-sm text-muted-foreground">
          <Info className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              Razorpay: {today.razorpayCaptures} · {formatInr(today.razorpayCollected)} · UPI:{' '}
              {today.upiCaptures} · {formatInr(today.upiCollected)}
            </p>
            <p>
              <strong>VPS Sold</strong> ({today.vpsOrders}) har order line hai.{' '}
              <strong>Razorpay</strong> aur <strong>UPI (KwikUPI)</strong> alag count hote hain — wallet-only alag.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 7 days — gateway collected</CardTitle>
          <CardDescription>Unique payment captures ka total amount (orders + renewals + top-ups)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.last7.map((row) => (
            <div key={row.date} className="grid grid-cols-[88px_1fr_120px] items-center gap-3">
              <div className="text-xs text-muted-foreground">
                {row.date === today.date ? 'Today' : row.label.split(',')[0]}
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
                  style={{ width: `${Math.max(4, (row.gatewayCollected / maxBar) * 100)}%` }}
                />
              </div>
              <div className="text-right text-sm font-semibold tabular-nums">
                {formatInr(row.gatewayCollected)}
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {row.gatewayCaptures} captures
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-day breakdown</CardTitle>
          <CardDescription>Din-wise poora report</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">VPS</TableHead>
                  <TableHead className="text-right">VPS ₹</TableHead>
                  <TableHead className="text-right">Captures</TableHead>
                  <TableHead className="text-right">Razorpay</TableHead>
                  <TableHead className="text-right">UPI</TableHead>
                  <TableHead className="text-right">All GW ₹</TableHead>
                  <TableHead className="text-right">Wallet +</TableHead>
                  <TableHead className="text-right">Wallet −</TableHead>
                  <TableHead className="text-right">Renewals</TableHead>
                  <TableHead className="text-right">Business ₹</TableHead>
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
                    <TableCell className="text-right tabular-nums">{row.gatewayCaptures}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#3395FF]">
                      {row.razorpayCollected > 0
                        ? `${row.razorpayCaptures} · ${formatInr(row.razorpayCollected)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {row.upiCollected > 0
                        ? `${row.upiCaptures} · ${formatInr(row.upiCollected)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatInr(row.gatewayCollected)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.walletTopupAmount > 0 ? formatInr(row.walletTopupAmount) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {row.walletSpent > 0 ? formatInr(row.walletSpent) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.renewals > 0 ? `${row.renewals} · ${formatInr(row.renewalRevenue)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatInr(row.totalBusiness)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
          title={`${days}-day Razorpay`}
          value={formatInr(periodTotals.razorpayCollected)}
          hint={`${periodTotals.razorpayCaptures} captures`}
          icon={CreditCard}
          tone="blue"
        />
        <StatCard
          title={`${days}-day UPI`}
          value={formatInr(periodTotals.upiCollected)}
          hint={`${periodTotals.upiCaptures} captures — KwikUPI`}
          icon={IndianRupee}
          tone="green"
        />
        <StatCard
          title={`${days}-day all gateway`}
          value={formatInr(periodTotals.gatewayCollected)}
          hint={`${periodTotals.gatewayCaptures} captures`}
          icon={CreditCard}
          tone="green"
        />
        <StatCard
          title={`${days}-day wallet added`}
          value={formatInr(periodTotals.walletTopupAmount)}
          hint={`${periodTotals.walletTopups} top-ups`}
          icon={Wallet}
        />
        <StatCard
          title={`${days}-day renewals`}
          value={String(periodTotals.renewals)}
          hint={formatInr(periodTotals.renewalRevenue)}
          icon={TrendingUp}
          tone="violet"
        />
      </div>
    </div>
  );
}
