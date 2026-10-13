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
  RotateCcw,
  Wallet,
  CreditCard,
  CalendarDays,
  ArrowDownRight,
  ArrowUpRight,
  Equal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  walletSpentOnNewBuys?: number;
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
};

type PaymentDashboardData = {
  timezone: string;
  today: DailyRow;
  last7: DailyRow[];
  daily: DailyRow[];
  periodTotals: DailyRow;
  range: { from: string; to: string; days: number };
};

type DayDetailItem = {
  id: string;
  kind: string;
  kindLabel: string;
  amount: number;
  walletPart?: number;
  gatewayPart?: number;
  totalPrice?: number;
  productName: string;
  memory?: string;
  paymentMethod?: string;
  transactionId?: string;
  gatewayOrderId?: string;
  clientTxnId?: string;
  at?: string;
  orderId?: string;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
};

type DayDetailData = {
  date: string;
  label: string;
  channel: 'razorpay' | 'wallet';
  count: number;
  totalAmount: number;
  items: DayDetailItem[];
};

function formatInr(value: number) {
  return `₹${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function Line({
  label,
  value,
  count,
  tone,
  strong,
}: {
  label: string;
  value: string;
  count?: string | number;
  tone?: 'muted' | 'in' | 'out' | 'total' | 'razorpay';
  strong?: boolean;
}) {
  const valueClass =
    tone === 'in'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'out'
        ? 'text-amber-700 dark:text-amber-400'
        : tone === 'total'
          ? 'text-foreground'
          : tone === 'razorpay'
            ? 'text-[#0C6CF2]'
            : 'text-foreground';

  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-2',
        strong && 'border-t border-border/80 pt-3 mt-1'
      )}
    >
      <div className="min-w-0">
        <p className={cn('text-sm', strong ? 'font-semibold' : 'text-muted-foreground')}>{label}</p>
        {count != null && count !== '' && count !== 0 ? (
          <p className="text-[11px] text-muted-foreground/80 tabular-nums">{count}</p>
        ) : null}
      </div>
      <p className={cn('shrink-0 text-sm tabular-nums', strong ? 'text-base font-bold' : 'font-medium', valueClass)}>
        {value}
      </p>
    </div>
  );
}

function SectionShell({
  title,
  subtitle,
  icon: Icon,
  accent,
  children,
  hero,
  action,
}: {
  title: string;
  subtitle?: string;
  icon: typeof CreditCard;
  accent?: string;
  children: React.ReactNode;
  hero?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md',
                  accent || 'bg-foreground/5 text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              {title}
        </CardTitle>
            {subtitle ? <CardDescription className="text-xs sm:text-sm">{subtitle}</CardDescription> : null}
            {action}
          </div>
          {hero}
          </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function RazorpayLedger({
  row,
  dayLabel = 'Today',
  onOpenList,
}: {
  row: DailyRow;
  dayLabel?: string;
  onOpenList?: () => void;
}) {
  return (
    <SectionShell
      title={`Razorpay — collected on ${dayLabel}`}
      subtitle="Match this total with Razorpay Dashboard → Payments for the same day (IST)"
      icon={CreditCard}
      accent="bg-[#0C6CF2]/10 text-[#0C6CF2]"
      action={
        onOpenList ? (
          <Button type="button" size="sm" className="mt-2 bg-[#0C6CF2] hover:bg-[#0C6CF2]/90" onClick={onOpenList}>
            Live list — which orders?
          </Button>
        ) : null
      }
      hero={
        <button
          type="button"
          onClick={onOpenList}
          className="rounded-lg border border-[#0C6CF2]/25 bg-[#0C6CF2]/5 px-4 py-2 text-right transition hover:bg-[#0C6CF2]/10"
        >
          <p className="text-[10px] uppercase tracking-wider text-[#0C6CF2]/80">Razorpay · {dayLabel}</p>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-[#0C6CF2]">
            {formatInr(row.razorpayCollected)}
          </p>
          <p className="text-[11px] text-muted-foreground">{row.razorpayCaptures} captures · open list</p>
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
          <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Line by line
          </p>
          <Line
            label="New VPS buy (single)"
            value={formatInr(row.razorpayVpsAmount)}
            tone="razorpay"
          />
          <Line label="Cart checkout" value={formatInr(row.razorpayCartAmount)} tone="razorpay" />
          <Line label="VPS renew" value={formatInr(row.razorpayRenewalAmount)} tone="razorpay" />
          <Line label="Wallet top-up" value={formatInr(row.razorpayTopupAmount)} tone="razorpay" />
          <Line
            label="Razorpay grand total"
            value={formatInr(row.razorpayCollected)}
            count={`${row.razorpayCaptures} payments`}
            tone="total"
            strong
          />
          </div>
        <div className="rounded-lg border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">How to match</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs sm:text-sm">
            <li>Razorpay Dashboard → Payments → filter that day (IST)</li>
            <li>Captured amount ≈ <strong className="text-foreground">{formatInr(row.razorpayCollected)}</strong></li>
            <li>Wallet-only and UPI-only payments are in the other sections</li>
          </ol>
          {row.upiCollected > 0 ? (
            <p className="mt-3 border-t pt-3 text-xs">
              UPI (KwikUPI) is separate: <strong className="text-foreground">{formatInr(row.upiCollected)}</strong> ·{' '}
              {row.upiCaptures} captures. These do not appear on the Razorpay dashboard.
            </p>
          ) : null}
          </div>
        </div>
    </SectionShell>
  );
}

function WalletLedger({
  row,
  dayLabel = 'Today',
  onOpenList,
}: {
  row: DailyRow;
  dayLabel?: string;
  onOpenList?: () => void;
}) {
  const newBuyWallet = row.walletSpentOnNewBuys ?? row.vpsWalletAmount + row.cartWalletAmount;
  const renewWallet = row.renewalWalletAmount;
  const net = (row.walletAdded || 0) - (row.walletSpent || 0);

  return (
    <SectionShell
      title={`Wallet — ${dayLabel} ledger`}
      subtitle="Top-ups in, then spend on new buys and renewals. Nothing is counted twice."
      icon={Wallet}
      accent="bg-amber-500/10 text-amber-700 dark:text-amber-400"
      action={
        onOpenList ? (
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onOpenList}>
            Wallet history — that day's buys
          </Button>
        ) : null
      }
      hero={
        <button
          type="button"
          onClick={onOpenList}
          className="rounded-lg border bg-background px-4 py-2 text-right transition hover:bg-muted/40"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net wallet · {dayLabel}</p>
          <p
            className={cn(
              'text-2xl font-bold tabular-nums tracking-tight',
              net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
            )}
          >
            {net >= 0 ? '+' : '−'}
            {formatInr(Math.abs(net))}
          </p>
          <p className="text-[11px] text-muted-foreground">open list</p>
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <ArrowUpRight className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Money in</p>
            </div>
          <Line
            label="Wallet top-ups"
            value={`+${formatInr(row.walletAdded)}`}
            count={`${row.walletTopups} top-up${row.walletTopups === 1 ? '' : 's'}`}
            tone="in"
            strong
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            This money arrives via Razorpay or UPI first, then lands in the wallet balance.
          </p>
            </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <ShoppingCart className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">New VPS buy (wallet)</p>
            </div>
          <Line
            label="Single buy — wallet only"
            value={formatInr(row.vpsWalletAmount)}
            count={`${row.vpsWalletOnly} order${row.vpsWalletOnly === 1 ? '' : 's'}`}
            tone="out"
          />
          <Line
            label="Cart checkout — wallet part"
            value={formatInr(row.cartWalletAmount)}
            count={row.cartCheckouts > 0 ? `${row.cartCheckouts} checkout` : undefined}
            tone="out"
          />
          <Line
            label="Total new buy from wallet"
            value={`−${formatInr(newBuyWallet)}`}
            tone="out"
            strong
          />
          </div>

        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sky-700 dark:text-sky-400">
            <RotateCcw className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Renew (wallet)</p>
            </div>
          <Line
            label="VPS renew via wallet"
            value={`−${formatInr(renewWallet)}`}
            count={`${row.renewalWalletCount} renew${row.renewalWalletCount === 1 ? '' : 's'}`}
            tone="out"
            strong
          />
          <div className="mt-4 border-t pt-3">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <ArrowDownRight className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-wider">Total spent</p>
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              −{formatInr(row.walletSpent)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              New buy {formatInr(newBuyWallet)} + Renew {formatInr(renewWallet)}
            </p>
            </div>
            </div>
          </div>
    </SectionShell>
  );
}

function SalesLedger({ row, dayLabel = 'Today' }: { row: DailyRow; dayLabel?: string }) {
  return (
    <SectionShell
      title={`Sales — new buy vs renew · ${dayLabel}`}
      subtitle="Business total = new VPS sales + renewals (gateway and wallet together)"
      icon={IndianRupee}
      accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      hero={
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/80">
            Total business · {dayLabel}
          </p>
          <p className="text-2xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-400">
            {formatInr(row.totalBusiness)}
          </p>
          </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-sky-600" />
              <p className="font-semibold">New VPS buy</p>
          </div>
            <Badge variant="secondary" className="font-normal tabular-nums">
              {row.vpsOrders} orders
            </Badge>
          </div>
          <Line label="Total sales value" value={formatInr(row.vpsRevenue)} strong />
          <Line
            label="Paid via gateway"
            value={formatInr(row.vpsGatewayAmount + row.cartGatewayAmount)}
            count={`${row.vpsGatewayOnly} gateway-only · ${row.vpsMixed} mixed`}
          />
          <Line
            label="Paid via wallet"
            value={formatInr(row.vpsWalletAmount + row.cartWalletAmount)}
            count={`${row.vpsWalletOnly} wallet-only · cart ${formatInr(row.cartWalletAmount)}`}
            tone="out"
          />
          {row.vpsCartOrders > 0 ? (
            <Line
              label="Cart items (inside VPS count)"
              value={`${row.vpsCartOrders} items`}
              count={`${row.cartCheckouts} checkout payment${row.cartCheckouts === 1 ? '' : 's'}`}
            />
          ) : null}
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-sky-700" />
              <p className="font-semibold">VPS renew</p>
          </div>
            <Badge variant="secondary" className="font-normal tabular-nums">
              {row.renewals} renews
            </Badge>
          </div>
          <Line label="Total renew value" value={formatInr(row.renewalRevenue)} strong />
          <Line
            label="Renew via gateway"
            value={formatInr(row.renewalGatewayAmount)}
            count={`${row.renewalGatewayCount} renew${row.renewalGatewayCount === 1 ? '' : 's'}`}
          />
          <Line
            label="Renew via wallet"
            value={formatInr(row.renewalWalletAmount)}
            count={`${row.renewalWalletCount} renew${row.renewalWalletCount === 1 ? '' : 's'}`}
            tone="out"
          />
          <div className="mt-4 flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Equal className="h-3.5 w-3.5 shrink-0" />
            New {formatInr(row.vpsRevenue)} + Renew {formatInr(row.renewalRevenue)} ={' '}
            <strong className="text-foreground">{formatInr(row.totalBusiness)}</strong>
          </div>
          </div>
          </div>
    </SectionShell>
  );
}

function UpiStrip({ row }: { row: DailyRow }) {
  if (!(row.upiCollected > 0 || row.otherGatewayCollected > 0)) return null;
  return (
    <Card className="border-border/70">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Other gateways (not Razorpay)</p>
          <p className="text-xs text-muted-foreground">KwikUPI and legacy gateways. These do not appear on the Razorpay dashboard.</p>
          </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">UPI / KwikUPI</p>
            <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatInr(row.upiCollected)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">({row.upiCaptures})</span>
            </p>
          </div>
          {row.otherGatewayCollected > 0 ? (
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Other</p>
              <p className="font-semibold tabular-nums">
                {formatInr(row.otherGatewayCollected)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({row.otherGatewayCaptures})
                </span>
              </p>
          </div>
          ) : null}
          </div>
        </CardContent>
      </Card>
  );
}

export function PaymentDashboard() {
  const [data, setData] = useState<PaymentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailChannel, setDetailChannel] = useState<'razorpay' | 'wallet'>('razorpay');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DayDetailData | null>(null);

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
      setSelectedDate((prev) => {
        if (prev && json.daily?.some((d: DailyRow) => d.date === prev)) return prev;
        return json.today?.date || null;
      });
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

  const todayKey = data?.today?.date || '';
  const yesterdayKey = useMemo(() => {
    if (!todayKey) return '';
    const [y, m, d] = todayKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().slice(0, 10);
  }, [todayKey]);

  const selected = useMemo(() => {
    if (!data) return null;
    const key = selectedDate || data.today.date;
    return data.daily.find((d) => d.date === key) || data.today;
  }, [data, selectedDate]);

  const openDayList = useCallback(
    async (channel: 'razorpay' | 'wallet') => {
      if (!selected?.date) return;
      setDetailChannel(channel);
      setDetailOpen(true);
      setDetailLoading(true);
      setDetail(null);
      try {
        const res = await fetch(
          `/api/admin/orders/payment-dashboard?channel=${channel}&date=${selected.date}`,
          { cache: 'no-store', credentials: 'include' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed to load list');
        setDetail(json);
      } catch (err) {
        console.error(err);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [selected?.date]
  );

  const maxBar = useMemo(() => {
    if (!data?.last7?.length) return 1;
    return Math.max(...data.last7.map((d) => d.razorpayCollected || d.gatewayCollected), 1);
  }, [data]);

  const minDate = data?.range?.from || '';
  const maxDate = data?.range?.to || '';

  if (loading && !data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || !selected) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Could not load the payment dashboard. Try refresh.
        </CardContent>
      </Card>
    );
  }

  const { periodTotals } = data;
  const isToday = selected.date === todayKey;
  const isYesterday = selected.date === yesterdayKey;
  const dayTag = isToday ? 'Today' : isYesterday ? 'Yesterday' : selected.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Daily Payments</h2>
            <Badge variant="outline" className="font-normal">
              IST
            </Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {dayTag} · {selected.label}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={isToday ? 'default' : 'outline'}
              onClick={() => setSelectedDate(todayKey)}
            >
              Today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isYesterday ? 'default' : 'outline'}
              onClick={() => setSelectedDate(yesterdayKey)}
              disabled={!data.daily.some((d) => d.date === yesterdayKey)}
            >
              Yesterday
            </Button>
            <div className="flex items-center gap-2">
              <label htmlFor="pay-day-pick" className="sr-only">
                Select date
              </label>
              <input
                id="pay-day-pick"
                type="date"
                value={selected.date}
                min={minDate}
                max={maxDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && data.daily.some((d) => d.date === v)) setSelectedDate(v);
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
              />
            </div>
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
                {n}d
            </Button>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          </div>
        </div>
      </div>

      {/* Top snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => void openDayList('razorpay')}
          className="rounded-xl border border-[#0C6CF2]/25 bg-[#0C6CF2]/5 text-left transition hover:bg-[#0C6CF2]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0C6CF2]/40"
        >
          <div className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#0C6CF2]/90">
              Razorpay collected · open list
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[#0C6CF2]">
              {formatInr(selected.razorpayCollected)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selected.razorpayCaptures} captures · {dayTag}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => void openDayList('wallet')}
          className="rounded-xl border bg-card text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          <div className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Wallet spent · open list
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-amber-700 dark:text-amber-400">
              {formatInr(selected.walletSpent)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buy{' '}
              {formatInr(
                selected.walletSpentOnNewBuys ?? selected.vpsWalletAmount + selected.cartWalletAmount
              )}{' '}
              · Renew {formatInr(selected.renewalWalletAmount)}
            </p>
          </div>
        </button>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              New VPS + renewals
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
              {selected.vpsOrders + selected.renewals}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selected.vpsOrders} buy · {selected.renewals} renew
            </p>
        </CardContent>
      </Card>
        <Card className="border-emerald-500/25 bg-emerald-500/5">
          <CardContent className="pt-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-700/90 dark:text-emerald-400/90">
              Total business
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-400">
              {formatInr(selected.totalBusiness)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Sales value · {dayTag}</p>
        </CardContent>
      </Card>
      </div>

      <RazorpayLedger row={selected} dayLabel={dayTag} onOpenList={() => void openDayList('razorpay')} />
      <WalletLedger row={selected} dayLabel={dayTag} onOpenList={() => void openDayList('wallet')} />
      <SalesLedger row={selected} dayLabel={dayTag} />
      <UpiStrip row={selected} />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {detailChannel === 'razorpay' ? 'Razorpay' : 'Wallet'} live list · {selected.label}
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                <p>
                  {detailChannel === 'razorpay'
                    ? 'Payments collected on Razorpay that day — user and order details'
                    : 'Wallet buys and renewals that day — user and history'}
                </p>
                {detail ? (
                  <p className="mt-1 font-medium text-foreground">
                    {detail.count} entries · {formatInr(detail.totalAmount)}
                  </p>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {detailLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : !detail?.items?.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No entries for this day on this channel.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Txn / Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {item.at
                          ? new Date(item.at).toLocaleTimeString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="whitespace-nowrap font-normal">
                          {item.kindLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.email}</p>
                        {item.phone ? (
                          <p className="text-[11px] text-muted-foreground">{item.phone}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <p className="truncate text-sm">{item.productName}</p>
                        {item.memory ? (
                          <p className="text-[11px] text-muted-foreground">{item.memory}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                        {formatInr(item.amount)}
                        {detailChannel === 'razorpay' && item.walletPart ? (
                          <p className="text-[10px] font-normal text-muted-foreground">
                            +wallet {formatInr(item.walletPart)}
                          </p>
                        ) : null}
                        {detailChannel === 'wallet' && item.gatewayPart ? (
                          <p className="text-[10px] font-normal text-muted-foreground">
                            +gw {formatInr(item.gatewayPart)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[140px] text-[11px] text-muted-foreground">
                        <p className="truncate font-mono">
                          {item.transactionId || item.gatewayOrderId || item.clientTxnId || '—'}
                        </p>
                        {item.orderId ? (
                          <p className="truncate font-mono opacity-70">{item.orderId}</p>
                        ) : item.kind !== 'topup' && item.kind !== 'cart' ? (
                          <p className="truncate font-mono opacity-70">{item.id}</p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Last 7 days — Razorpay</CardTitle>
          <CardDescription>Click a row to open that day's full ledger</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.last7.map((row) => {
            const active = row.date === selected.date;
            return (
              <button
                key={row.date}
                type="button"
                onClick={() => setSelectedDate(row.date)}
                className={cn(
                  'grid w-full grid-cols-[100px_1fr_140px] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60',
                  active && 'bg-[#0C6CF2]/10 ring-1 ring-[#0C6CF2]/25'
                )}
              >
              <div className="text-xs text-muted-foreground">
                  {row.date === todayKey ? (
                    <span className="font-semibold text-foreground">Today</span>
                  ) : row.date === yesterdayKey ? (
                    <span className="font-semibold text-foreground">Yesterday</span>
                  ) : (
                    row.label.split(',')[0]
                  )}
              </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[#0C6CF2] transition-all"
                    style={{
                      width: `${Math.max(3, ((row.razorpayCollected || 0) / maxBar) * 100)}%`,
                    }}
                />
              </div>
                <div className="text-right text-sm font-semibold tabular-nums text-[#0C6CF2]">
                  {formatInr(row.razorpayCollected)}
                <span className="block text-[10px] font-normal text-muted-foreground">
                    {row.razorpayCaptures} · wallet −{formatInr(row.walletSpent)}
                </span>
              </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Day-by-day ledger</CardTitle>
          <CardDescription>Click any row to open that day above</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Razorpay</TableHead>
                  <TableHead className="text-right">UPI</TableHead>
                  <TableHead className="text-right">Wallet +</TableHead>
                  <TableHead className="text-right">Wallet buy</TableHead>
                  <TableHead className="text-right">Wallet renew</TableHead>
                  <TableHead className="text-right">New VPS</TableHead>
                  <TableHead className="text-right">Renews</TableHead>
                  <TableHead className="text-right">Business</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.daily.map((row) => {
                  const buyW = row.walletSpentOnNewBuys ?? row.vpsWalletAmount + row.cartWalletAmount;
                  const active = row.date === selected.date;
                  return (
                  <TableRow
                    key={row.date}
                      className={cn(
                        'cursor-pointer hover:bg-muted/50',
                        active && 'bg-[#0C6CF2]/5 font-medium'
                      )}
                      onClick={() => setSelectedDate(row.date)}
                  >
                    <TableCell>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                        {row.label}
                          {row.date === todayKey ? (
                            <Badge className="h-5 text-[10px]" variant="secondary">
                              Today
                            </Badge>
                          ) : null}
                          {row.date === yesterdayKey ? (
                            <Badge className="h-5 text-[10px]" variant="outline">
                              Yesterday
                            </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                      <TableCell className="text-right tabular-nums text-[#0C6CF2]">
                      {row.razorpayCollected > 0
                        ? `${row.razorpayCaptures} · ${formatInr(row.razorpayCollected)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {row.upiCollected > 0 ? formatInr(row.upiCollected) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.walletTopupAmount > 0 ? formatInr(row.walletTopupAmount) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                        {buyW > 0 ? formatInr(buyW) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                        {row.renewalWalletAmount > 0 ? formatInr(row.renewalWalletAmount) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.vpsOrders > 0 ? `${row.vpsOrders} · ${formatInr(row.vpsRevenue)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.renewals > 0 ? `${row.renewals} · ${formatInr(row.renewalRevenue)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatInr(row.totalBusiness)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{days}d Razorpay</p>
            <p className="text-xl font-bold tabular-nums text-[#0C6CF2]">
              {formatInr(periodTotals.razorpayCollected)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{days}d wallet spent</p>
            <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {formatInr(periodTotals.walletSpent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{days}d new VPS</p>
            <p className="text-xl font-bold tabular-nums">
              {periodTotals.vpsOrders} · {formatInr(periodTotals.vpsRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{days}d renews</p>
            <p className="text-xl font-bold tabular-nums">
              {periodTotals.renewals} · {formatInr(periodTotals.renewalRevenue)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
