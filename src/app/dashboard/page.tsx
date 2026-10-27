'use client'

import React, { useEffect, useLayoutEffect, useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ServerIcon,
  CalendarIcon,
  Package,
  Download,
  Settings,
  ArrowRight,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  Activity,
  Zap,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { premiumSelectContent, premiumBadge } from "@/lib/premium-badges";
import { useTheme } from 'next-themes';
import { toast } from "sonner";
import { dashboardFetch } from '@/lib/dashboardFetch';
import { readDashboardCache, writeDashboardCache, DASHBOARD_CACHE_KEYS } from '@/lib/dashboardCache';
import PageLoader from '@/components/dashboard/DashboardPageSkeleton';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardStats {
  totalOrders: number;
  activeServices: number;
  totalSpent: number;
  pendingOrders: number;
  recentOrders: any[];
  monthlySpending: number[];
  orderStatusBreakdown: {
    completed: number;
    failed: number;
    pending?: number;
  };
  resellerWallet?: {
    balance: number;
    currency: string;
    creditLimit: number;
    totalSpent: number;
  };
}

const statsRequests = new Map<string, Promise<DashboardStats>>();

function loadDashboardStats(timeframe: string) {
  const existing = statsRequests.get(timeframe);
  if (existing) return existing;
  const request = dashboardFetch(`/api/dashboard/stats?timeframe=${timeframe}`)
    .then((response) => response.json())
    .finally(() => {
      statsRequests.delete(timeframe);
    });
  statsRequests.set(timeframe, request);
  return request;
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [knownUser, setKnownUser] = useState<{ name?: string; email?: string; createdAt?: string } | null>(null);
  const [timeframe, setTimeframe] = useState('30d');

  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<string>('');
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);

  const [settingsData, setSettingsData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  useLayoutEffect(() => {
    if (user?.name) {
      setKnownUser(user);
      return;
    }
    const cached = readDashboardCache(DASHBOARD_CACHE_KEYS.currentUser) as { name?: string; email?: string; createdAt?: string } | null;
    if (cached?.name) setKnownUser(cached);
  }, [user]);

  useLayoutEffect(() => {
    const key = DASHBOARD_CACHE_KEYS.dashboardStats(timeframe);
    const cached = readDashboardCache(key, 24 * 60 * 60 * 1000);
    if (cached) {
      setStats(cached as typeof stats);
      setIsLoading(false);
      fetchDashboardData(true);
      return;
    }
    fetchDashboardData();
  }, [timeframe]);

  useEffect(() => {
    if (user) {
      setSettingsData(prev => ({
        ...prev,
        name: user.name || '',
        email: user.email || '',
      }));
    }
  }, [user]);

  const fetchDashboardData = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const data = await loadDashboardStats(timeframe);
      if (data?.error) throw new Error(data.error);
      writeDashboardCache(DASHBOARD_CACHE_KEYS.dashboardStats(timeframe), data);
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      if (!silent) toast.error('Failed to load dashboard data');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleBrowsePlans = () => router.push('/dashboard/ipStock');
  const handleDownloadInvoice = () => setShowInvoiceDialog(true);
  const handleAccountSettings = () => setShowSettingsDialog(true);

  const downloadInvoiceForOrder = async () => {
    if (!selectedOrderForInvoice) {
      toast.error('Please select an order');
      return;
    }
    setIsDownloadingInvoice(true);
    try {
      const response = await dashboardFetch(`/api/invoice/download?orderId=${selectedOrderForInvoice}`);
      if (!response.ok) throw new Error('Failed to generate invoice');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `invoice-${selectedOrderForInvoice}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Invoice downloaded successfully!');
      setShowInvoiceDialog(false);
      setSelectedOrderForInvoice('');
    } catch (error) {
      console.error('Failed to download invoice:', error);
      toast.error('Failed to download invoice');
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  const updateAccountSettings = async () => {
    if (settingsData.newPassword && settingsData.newPassword !== settingsData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (settingsData.newPassword && !settingsData.currentPassword) {
      toast.error('Current password is required to set a new password');
      return;
    }
    setIsUpdatingSettings(true);
    try {
      const response = await dashboardFetch('/api/user/update-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settingsData.name,
          email: settingsData.email,
          currentPassword: settingsData.currentPassword || undefined,
          newPassword: settingsData.newPassword || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update settings');
      toast.success('Account settings updated successfully!');
      setShowSettingsDialog(false);
      setSettingsData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (error) {
      console.error('Failed to update settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update settings');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount);

  const formatCompact = (amount: number) => {
    if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toString();
  };


  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const chartTheme = useMemo(() => ({
    grid: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(16, 80, 60, 0.14)',
    tick: isDark ? 'rgba(255,255,255,0.55)' : 'hsl(160 14% 36%)',
    stroke: isDark ? '#34d399' : '#059669',
    gradientStart: isDark ? '#34d399' : '#10b981',
    activeDotStroke: isDark ? 'hsl(160 32% 6%)' : '#ffffff',
    tooltipBg: isDark ? 'hsl(158 28% 10%)' : '#ffffff',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(16, 185, 129, 0.22)',
    tooltipText: isDark ? '#fff' : 'hsl(160 28% 12%)',
  }), [isDark]);

  const getStatusBadgeClasses = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': case 'active':
        return premiumBadge.success;
      case 'pending': case 'provisioning':
        return premiumBadge.warning;
      case 'failed': case 'terminated':
        return premiumBadge.error;
      default:
        return premiumBadge.neutral;
    }
  };

  // ── Chart data ──────────────────────────────────────────────────────
  const spendingChartData = useMemo(() => {
    if (!stats?.monthlySpending) return [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    return [...stats.monthlySpending].reverse().map((amount, i) => {
      const monthIndex = (now.getMonth() - stats.monthlySpending.length + 1 + i + 12) % 12;
      return { month: months[monthIndex], amount };
    });
  }, [stats?.monthlySpending]);

  const orderDistributionData = useMemo(() => {
    const total = stats?.totalOrders || 0;
    if (!total) return [];
    const completed = stats?.orderStatusBreakdown?.completed || 0;
    const pending = stats?.orderStatusBreakdown?.pending ?? stats?.pendingOrders ?? 0;
    const failed = stats?.orderStatusBreakdown?.failed || 0;
    // Orders whose status is active, confirmed, provisioning, etc. still count
    // toward totalOrders. Fold them in so the chart matches the header.
    const other = Math.max(0, total - completed - pending - failed);
    return [
      { name: 'Completed', value: completed, color: '#10b981' },
      { name: 'Pending', value: pending, color: '#f59e0b' },
      { name: 'Other', value: other, color: '#64748b' },
      { name: 'Failed', value: failed, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [stats?.orderStatusBreakdown, stats?.pendingOrders, stats?.totalOrders]);

  const spendingTrend = useMemo(() => {
    if (!stats?.monthlySpending || stats.monthlySpending.length < 2) return 0;
    const current = stats.monthlySpending[0];
    const previous = stats.monthlySpending[1];
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }, [stats?.monthlySpending]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="premium-chart-tooltip rounded-lg px-3 py-2 shadow-lg">
          <p className="text-xs premium-chart-tooltip-label">{label}</p>
          <p className="text-sm font-semibold premium-chart-tooltip-value">{formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  // ── Skeleton loader ────────────────────────────────────────────────
  const account = user?.name ? user : knownUser;
  const firstName = account?.name?.split(' ')[0] || account?.name || '';
  const waiting = isLoading && !stats;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const totalDistribution = orderDistributionData.reduce((s, d) => s + d.value, 0);

  if (waiting) {
    return <PageLoader />;
  }

  const softCard = "premium-dashboard-card";
  const statIconBox = "premium-dashboard-stat-icon";

  const userInitials = account?.name
    ? account.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '';

  return (
    <div className="min-h-screen relative">
      <div className="premium-dashboard-home w-full min-w-0 px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">

        {/* ════════════════════════════════════════════════════════════════
            WELCOME BANNER
        ════════════════════════════════════════════════════════════════ */}
        <div className="premium-dashboard-welcome">
          <div className="relative p-4 sm:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 text-white text-sm font-bold flex items-center justify-center shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/15 shrink-0">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  {firstName ? (
                    <p className="text-[10px] sm:text-[11px] premium-greeting-label tracking-widest uppercase mb-0.5">
                      {greeting}
                    </p>
                  ) : null}
                  <p className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight premium-dashboard-title">
                    {firstName || greeting}
                  </p>
                  <p className="premium-dashboard-subtitle mt-1 text-xs sm:text-sm">
                    {waiting ? '\u00a0' : stats?.activeServices ? (
                      <>
                        <span className="font-medium text-foreground">{stats.activeServices}</span> active service{stats.activeServices !== 1 ? 's' : ''}
                        {(stats?.pendingOrders || 0) > 0 && (
                          <> &middot; <span className="text-amber-600 dark:text-amber-400 font-medium">{stats.pendingOrders} pending</span></>
                        )}
                      </>
                    ) : 'Deploy your first server in minutes'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-xs premium-dashboard-subtitle">
                    <CalendarIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {new Date().toLocaleDateString('en-IN', {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="premium-dashboard-actions">
                <Button className="premium-btn-primary flex-1 sm:flex-initial gap-1.5" onClick={handleBrowsePlans}>
                  <Zap className="h-3.5 w-3.5" />
                  New Order
                </Button>
                <Button variant="outline" className="premium-btn-outline flex-1 sm:flex-initial gap-1.5" onClick={handleDownloadInvoice}>
                  <Download className="h-3.5 w-3.5" />
                  Invoice
                </Button>
                <Button variant="outline" className="premium-btn-outline flex-1 sm:flex-initial gap-1.5" onClick={handleAccountSettings}>
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            STAT CARDS
        ════════════════════════════════════════════════════════════════ */}
        <div className={cn(
          "grid grid-cols-2 gap-2.5 sm:gap-3",
          "[&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:col-span-1",
          ({ 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 5: "xl:grid-cols-5" } as Record<number, string>)[
            3 + (stats?.resellerWallet ? 1 : 0) + ((stats?.pendingOrders || 0) > 0 ? 1 : 0)
          ]
        )}>
          {stats?.resellerWallet && (
            <Card className={cn("relative overflow-hidden group", softCard)}>
              <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={cn(statIconBox)}>
                    <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                  </div>
                  <p className="premium-dashboard-stat-label">Wallet</p>
                </div>
                <p className="premium-dashboard-stat-value">{formatCurrency(stats.resellerWallet.balance)}</p>
                <Link
                  href="/dashboard/reseller-wallet"
                  className="text-xs text-emerald-700 dark:text-emerald-400 font-medium hover:underline mt-1 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all"
                >
                  Add Funds <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}

          <Card className={cn("relative overflow-hidden", softCard)}>
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={cn(statIconBox)}>
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="premium-dashboard-stat-label">Orders</p>
              </div>
              <p className="premium-dashboard-stat-value">{waiting ? '—' : (stats?.totalOrders || 0)}</p>
              <p className="premium-dashboard-stat-sub">All time</p>
            </CardContent>
          </Card>

          <Card className={cn("relative overflow-hidden", softCard)}>
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={cn(statIconBox, "bg-emerald-500/20 border-emerald-400/30")}>
                  <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                </div>
                <p className="premium-dashboard-stat-label">Active</p>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="premium-dashboard-stat-value">{waiting ? '—' : (stats?.activeServices || 0)}</p>
                {(stats?.activeServices || 0) > 0 && (
                  <span className={cn("inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full premium-badge", premiumBadge.success)}>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="ocean-soft-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Live
                  </span>
                )}
              </div>
              <p className="premium-dashboard-stat-sub">Running</p>
            </CardContent>
          </Card>

          <Card className={cn("relative overflow-hidden", softCard)}>
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={cn(statIconBox, "bg-violet-500/20 border-violet-400/30")}>
                  <TrendingUp className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                </div>
                <p className="premium-dashboard-stat-label">Spent</p>
              </div>
              <p className="premium-dashboard-stat-value">{waiting ? '—' : formatCurrency(stats?.totalSpent || 0)}</p>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {spendingTrend !== 0 ? (
                  <span className={cn(
                    "text-[9px] font-semibold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full premium-badge",
                    spendingTrend > 0 ? premiumBadge.success : premiumBadge.error
                  )}>
                    {spendingTrend > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {Math.abs(spendingTrend)}%
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold premium-dashboard-subtitle inline-flex items-center gap-0.5">
                    <Minus className="h-2.5 w-2.5" /> 0%
                  </span>
                )}
                <span className="text-[9px] premium-dashboard-subtitle">vs last mo</span>
              </div>
            </CardContent>
          </Card>

          {(stats?.pendingOrders || 0) > 0 && (
            <Card className={cn("relative overflow-hidden", softCard)}>
              <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={cn(statIconBox, "bg-amber-500/20 border-amber-400/30")}>
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                  </div>
                  <p className="premium-dashboard-stat-label">Pending</p>
                </div>
                <p className="premium-dashboard-stat-value">{stats?.pendingOrders}</p>
                <p className="premium-dashboard-stat-sub">Awaiting setup</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            CHARTS ROW
        ════════════════════════════════════════════════════════════════ */}
        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4">
          {/* Spending Trend Area Chart */}
          <Card className={cn("min-w-0 overflow-hidden lg:col-span-2 rounded-2xl", softCard)}>
            <CardHeader className="pb-1 flex flex-row items-center justify-between px-4 sm:px-5 pt-4 sm:pt-5">
              <div className="flex items-center gap-2">
                <div className={cn(statIconBox, "bg-emerald-500/20 border-emerald-400/30")}>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight premium-dashboard-title">Spending Trend</h2>
                  <p className="text-[10px] premium-dashboard-subtitle mt-0.5">Last 6 months</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {spendingTrend !== 0 && (
                  <Badge variant="outline" className={cn(
                    "text-[9px] font-semibold premium-badge",
                    spendingTrend > 0 ? premiumBadge.success : premiumBadge.error
                  )}>
                    {spendingTrend > 0 ? '+' : ''}{spendingTrend}%
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-1 pb-3 px-2 sm:px-4">
              {!waiting && spendingChartData.length > 0 && spendingChartData.some(d => d.amount > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={spendingChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartTheme.gradientStart} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={chartTheme.gradientStart} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: chartTheme.tick }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: chartTheme.tick }}
                      tickFormatter={(v) => `₹${formatCompact(v)}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke={chartTheme.stroke}
                      strokeWidth={2}
                      fill="url(#spendGradient)"
                      dot={{ r: 3, fill: chartTheme.stroke, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: chartTheme.stroke, stroke: chartTheme.activeDotStroke, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : waiting ? null : (
                <div className="h-[220px] flex flex-col items-center justify-center premium-dashboard-subtitle">
                  <TrendingUp className="h-8 w-8 mb-2 opacity-50 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs">No spending data yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Distribution Donut */}
          <Card className={cn("min-w-0 overflow-hidden rounded-2xl", softCard)}>
            <CardHeader className="pb-1 px-4 sm:px-5 pt-4 sm:pt-5">
              <div className="flex items-center gap-2">
                <div className={cn(statIconBox, "bg-amber-500/20 border-amber-400/30")}>
                  <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight premium-dashboard-title">Distribution</h2>
                  <p className="text-[10px] premium-dashboard-subtitle mt-0.5">{stats?.totalOrders || 0} orders</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4 px-4">
              {totalDistribution > 0 ? (
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={orderDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {orderDistributionData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [value, name]}
                          contentStyle={{
                            background: chartTheme.tooltipBg,
                            border: `1px solid ${chartTheme.tooltipBorder}`,
                            borderRadius: '8px',
                            fontSize: '12px',
                            padding: '6px 10px',
                            color: chartTheme.tooltipText,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-bold premium-dashboard-title">{stats?.totalOrders || 0}</p>
                      <p className="text-[10px] premium-dashboard-subtitle">Orders</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                    {orderDistributionData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-[11px] premium-dashboard-subtitle">{entry.name}</span>
                        <span className="text-[11px] font-semibold premium-dashboard-title">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : waiting ? null : (
                <div className="h-[200px] flex flex-col items-center justify-center premium-dashboard-subtitle">
                  <Package className="h-8 w-8 mb-2 opacity-50 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs">No orders yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            MAIN CONTENT: Two-column layout
        ════════════════════════════════════════════════════════════════ */}
        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4">

          {/* ── Left: Recent Orders ─────────────────────────────────── */}
          <div className="min-w-0 lg:col-span-2">
            <Card className={cn("min-w-0 overflow-hidden rounded-2xl", softCard)}>
              <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2 px-4 sm:px-5 pt-4 sm:pt-5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(statIconBox, "bg-emerald-500/20 border-emerald-400/30")}>
                    <ServerIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                  </div>
                  <h2 className="text-sm font-semibold tracking-tight premium-dashboard-title">Recent Orders</h2>
                </div>
                <Link href="/dashboard/viewLinux" className="premium-btn-outline premium-dashboard-inline-link gap-1.5 shrink-0">
                  View all
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </CardHeader>
              <CardContent className="pt-0 px-3 sm:px-4 pb-3 sm:pb-4">
                {stats?.recentOrders?.length ? (
                  <div className="space-y-1">
                    {stats.recentOrders.slice(0, 6).map((order) => (
                      <Link
                        key={order._id}
                        href={`/dashboard/order/${order._id}`}
                        className="flex items-center gap-2.5 sm:gap-3 py-2.5 sm:py-3 w-full text-left px-2.5 sm:px-3 rounded-xl transition-all duration-200 group border border-transparent premium-dashboard-order-row"
                      >
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                          order.status?.toLowerCase() === 'completed' || order.status?.toLowerCase() === 'active'
                            ? "bg-emerald-500/10 border-emerald-500/20"
                            : order.status?.toLowerCase() === 'pending' || order.status?.toLowerCase() === 'provisioning'
                              ? "bg-amber-500/10 border-amber-500/20"
                              : "bg-white/5 border-white/10"
                        )}>
                          <ServerIcon className={cn(
                            "h-3.5 w-3.5",
                            order.status?.toLowerCase() === 'completed' || order.status?.toLowerCase() === 'active'
                              ? "text-emerald-600 dark:text-emerald-300"
                              : order.status?.toLowerCase() === 'pending' || order.status?.toLowerCase() === 'provisioning'
                                ? "text-amber-600 dark:text-amber-300"
                                : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="min-w-0 max-w-xl flex-1 lg:flex-none">
                          <p className="text-xs sm:text-sm font-medium text-foreground line-clamp-1 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                            {order.productName}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                            <span className="line-clamp-1">{order.memory}</span>
                            <span className="text-muted-foreground/50">&middot;</span>
                            <span className="shrink-0">
                              {new Date(order.createdAt).toLocaleDateString('en-IN', {
                                month: 'short', day: 'numeric'
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-xs sm:text-sm font-semibold text-foreground tabular-nums">{formatCurrency(order.price)}</p>
                            <Badge variant="outline" className={cn("text-[8px] sm:text-[9px] mt-0.5 capitalize hidden min-[380px]:inline-flex premium-badge", getStatusBadgeClasses(order.status))}>
                              {order.status}
                            </Badge>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : waiting ? null : (
                  <div className="text-center py-10 sm:py-12">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center mx-auto mb-3 shadow-sm">
                      <Package className="h-5 w-5 text-emerald-300" />
                    </div>
                    <p className="text-sm premium-dashboard-subtitle mb-1">No orders yet</p>
                    <p className="text-xs premium-dashboard-subtitle mb-4 opacity-80">Deploy your first server in minutes</p>
                    <Button onClick={handleBrowsePlans} className="premium-btn-primary gap-2">
                      <Zap className="h-3.5 w-3.5" />
                      Browse Plans
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Account ──────────────────────────────────────── */}
          <div className="h-full">
            {/* Account Card */}
            <Card className={cn("flex h-full flex-col rounded-2xl overflow-hidden", softCard)}>
              <div className="h-1 bg-gradient-to-r from-emerald-600 via-primary to-emerald-500/60" />
              <CardHeader className="pb-2 px-4 sm:px-5 pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-700 via-emerald-600 to-primary text-white text-[10px] font-bold flex items-center justify-center shadow-sm" aria-hidden>
                    {userInitials}
                  </div>
                  <h2 className="text-sm font-semibold tracking-tight premium-dashboard-title">Account</h2>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-4 sm:px-5 pb-4">
                <dl className="premium-account-facts">
                  {[
                    { label: 'Name', value: account?.name || '' },
                    { label: 'Email', value: account?.email || '' },
                    {
                      label: 'Member since',
                      value: account?.createdAt
                        ? new Date(account.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })
                        : '',
                    },
                  ].filter((row) => row.value).map((row) => (
                    <div key={row.label} className="premium-account-fact">
                      <dt className="premium-dashboard-stat-label">{row.label}</dt>
                      <dd className="text-xs sm:text-sm font-medium text-foreground truncate">{row.value}</dd>
                    </div>
                  ))}
                  <div className="premium-account-fact">
                    <dt className="premium-dashboard-stat-label">Status</dt>
                    <dd>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-200 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/35">
                        <ShieldCheck className="h-3 w-3" />
                        Active
                      </span>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOGS
      ══════════════════════════════════════════════════════════════════ */}

      {/* Download Invoice Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-auto premium-dashboard-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base premium-dashboard-title">
              <Download className="h-4 w-4 text-emerald-400" />
              Download Invoice
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm premium-dashboard-subtitle">
              Select an order to download its invoice as PDF
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm premium-field-label">Select Order</Label>
              <Select value={selectedOrderForInvoice} onValueChange={setSelectedOrderForInvoice}>
                <SelectTrigger className="h-9 text-xs sm:text-sm premium-dashboard-input">
                  <SelectValue placeholder="Choose an order..." />
                </SelectTrigger>
                <SelectContent className={premiumSelectContent}>
                  {stats?.recentOrders?.map((order) => (
                    <SelectItem key={order._id} value={order._id}>
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="truncate max-w-[120px] text-xs">{order.productName}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatCurrency(order.price)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedOrderForInvoice && (
              <div className="p-2 rounded-lg border border-border bg-muted/50 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Order Date:</span>
                  <span>
                    {stats?.recentOrders?.find(o => o._id === selectedOrderForInvoice)?.createdAt
                      ? new Date(stats.recentOrders.find(o => o._id === selectedOrderForInvoice)!.createdAt).toLocaleDateString('en-IN')
                      : 'N/A'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 flex-col-reverse sm:flex-row">
            <Button variant="outline" onClick={() => { setShowInvoiceDialog(false); setSelectedOrderForInvoice(''); }} disabled={isDownloadingInvoice} className="w-full premium-btn-outline">
              Cancel
            </Button>
            <Button onClick={downloadInvoiceForOrder} disabled={!selectedOrderForInvoice || isDownloadingInvoice} className="flex items-center gap-2 w-full premium-btn-primary">
              {isDownloadingInvoice ? (
                <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /><span>Loading...</span></>
              ) : (
                <><Download className="h-3 w-3" />Download PDF</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto max-h-[90vh] overflow-y-auto premium-dashboard-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base premium-dashboard-title">
              <Settings className="h-4 w-4 text-emerald-400" />
              Account Settings
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm premium-dashboard-subtitle">
              Update your account information and security settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs sm:text-sm premium-field-label">Full Name</Label>
                <Input id="name" value={settingsData.name} onChange={(e) => setSettingsData(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter your full name" className="text-xs sm:text-sm h-9 premium-dashboard-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs sm:text-sm premium-field-label">Email Address</Label>
                <Input id="email" type="email" value={settingsData.email} onChange={(e) => setSettingsData(prev => ({ ...prev, email: e.target.value }))} placeholder="Enter your email address" className="text-xs sm:text-sm h-9 premium-dashboard-input" />
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-xs sm:text-sm font-semibold premium-dashboard-title">Change Password</h4>
              <p className="text-xs premium-dashboard-subtitle">Leave password fields empty if you don't want to change your password</p>
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-xs sm:text-sm premium-field-label">Current Password</Label>
                <Input id="currentPassword" type="password" value={settingsData.currentPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, currentPassword: e.target.value }))} placeholder="Enter current password" className="text-xs sm:text-sm h-9 premium-dashboard-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-xs sm:text-sm premium-field-label">New Password</Label>
                <Input id="newPassword" type="password" value={settingsData.newPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, newPassword: e.target.value }))} placeholder="Enter new password" className="text-xs sm:text-sm h-9 premium-dashboard-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs sm:text-sm premium-field-label">Confirm New Password</Label>
                <Input id="confirmPassword" type="password" value={settingsData.confirmPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Confirm new password" className="text-xs sm:text-sm h-9 premium-dashboard-input" />
              </div>
              {settingsData.newPassword && settingsData.confirmPassword && settingsData.newPassword !== settingsData.confirmPassword && (
                <p className="text-xs text-red-400">Passwords do not match</p>
              )}
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-semibold premium-dashboard-title">Account Status</h4>
                <p className="text-xs premium-dashboard-subtitle">Your account is currently active</p>
              </div>
              <Badge variant="outline" className="premium-badge premium-badge--success text-xs self-start">
                Active
              </Badge>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col-reverse sm:flex-row pt-4">
            <Button variant="outline" onClick={() => { setShowSettingsDialog(false); setSettingsData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' })); }} disabled={isUpdatingSettings} className="w-full premium-btn-outline">
              Cancel
            </Button>
            <Button onClick={updateAccountSettings} disabled={isUpdatingSettings} className="flex items-center gap-2 w-full premium-btn-primary">
              {isUpdatingSettings ? (
                <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /><span>Saving...</span></>
              ) : (
                <><Settings className="h-3 w-3" />Save Changes</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
