'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  ServerIcon,
  CalendarIcon,
  Package,
  Eye,
  Download,
  Settings,
  ArrowRight,
  ChevronRight,
  LifeBuoy,
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
  CardTitle,
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
import { toast } from "sonner";
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

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
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

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/dashboard/stats?timeframe=${timeframe}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowsePlans = () => router.push('/dashboard/ipStock');
  const handleViewAllOrders = () => router.push('/dashboard/viewLinux');
  const handleDownloadInvoice = () => setShowInvoiceDialog(true);
  const handleAccountSettings = () => setShowSettingsDialog(true);

  const downloadInvoiceForOrder = async () => {
    if (!selectedOrderForInvoice) {
      toast.error('Please select an order');
      return;
    }
    setIsDownloadingInvoice(true);
    try {
      const response = await fetch(`/api/invoice/download?orderId=${selectedOrderForInvoice}`);
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
      const response = await fetch('/api/user/update-settings', {
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


  const getStatusBadgeClasses = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': case 'active':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'pending': case 'provisioning':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'failed': case 'terminated':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
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
    if (!stats?.orderStatusBreakdown) return [];
    const { completed, pending, failed } = stats.orderStatusBreakdown;
    return [
      { name: 'Completed', value: completed || 0, color: '#10b981' },
      { name: 'Pending', value: (pending ?? stats.pendingOrders) || 0, color: '#f59e0b' },
      { name: 'Failed', value: failed || 0, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [stats?.orderStatusBreakdown, stats?.pendingOrders]);

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
        <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold text-foreground">{formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  // ── Skeleton loader ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background relative">
        <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
          <div className="absolute -top-32 right-0 w-[420px] h-[420px] bg-gradient-to-bl from-primary/6 via-emerald-500/4 to-transparent rounded-full blur-3xl" />
        </div>
        <div className="lg:hidden h-16" />
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 -mt-12 md:mt-0">
          <div className="rounded-2xl border border-border/40 bg-card/80 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2.5">
                <div className="h-3 w-20 bg-muted/60 rounded animate-pulse" />
                <div className="h-7 w-40 bg-muted rounded-md animate-pulse" />
                <div className="h-3 w-56 bg-muted/50 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-border/40 bg-card/80 p-3.5 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 bg-muted/50 rounded-lg animate-pulse" />
                  <div className="h-3 w-14 bg-muted/60 rounded animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-muted rounded animate-pulse mb-2" />
                <div className="h-2.5 w-20 bg-muted/40 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-border/40 bg-card/80 p-4 sm:p-5">
              <div className="h-4 w-36 bg-muted rounded animate-pulse mb-4" />
              <div className="h-[200px] sm:h-[220px] bg-muted/20 rounded-xl animate-pulse" />
            </div>
            <div className="rounded-2xl border border-border/40 bg-card/80 p-4 sm:p-5">
              <div className="h-4 w-28 bg-muted rounded animate-pulse mb-4" />
              <div className="h-[160px] sm:h-[180px] bg-muted/20 rounded-xl animate-pulse mx-auto max-w-[180px]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const firstName = user?.name?.split(' ')[0] || user?.name || 'there';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const totalDistribution = orderDistributionData.reduce((s, d) => s + d.value, 0);

  const softCard = "border-border/40 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-[0_4px_24px_-10px_hsl(var(--primary)/0.18)] transition-all duration-300";
  const statIconBox = "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border shadow-sm";

  const userInitials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="min-h-screen bg-background relative">
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 right-0 w-[420px] h-[420px] bg-gradient-to-bl from-primary/6 via-emerald-500/4 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-24 w-80 h-80 bg-gradient-to-tr from-emerald-600/5 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="lg:hidden h-16" />

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 -mt-12 md:mt-0">

        {/* ════════════════════════════════════════════════════════════════
            WELCOME BANNER
        ════════════════════════════════════════════════════════════════ */}
        <div className={cn("relative rounded-2xl border overflow-hidden", softCard)}>
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -right-16 -top-16 w-72 h-72 bg-gradient-to-br from-primary/10 via-emerald-500/5 to-transparent rounded-full blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-primary/[0.03]" />
          </div>

          <div className="relative p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-primary text-white text-sm font-bold flex items-center justify-center shadow-md shadow-primary/25 ring-2 ring-primary/15 shrink-0">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-widest uppercase mb-0.5">
                    {greeting}
                  </p>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{firstName}</span>
                  </h1>
                  <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
                    {stats?.activeServices ? (
                      <>
                        <span className="text-foreground font-medium">{stats.activeServices}</span> active service{stats.activeServices !== 1 ? 's' : ''}
                        {(stats?.pendingOrders || 0) > 0 && (
                          <> &middot; <span className="text-amber-600 dark:text-amber-400 font-medium">{stats.pendingOrders} pending</span></>
                        )}
                      </>
                    ) : 'Deploy your first server in minutes'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] sm:text-[11px] text-muted-foreground/70">
                    <CalendarIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {new Date().toLocaleDateString('en-IN', {
                        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 w-full sm:w-auto shrink-0 p-1 rounded-xl bg-gradient-to-b from-muted/40 to-muted/15 border border-border/30">
                <Button size="sm" className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm flex-1 sm:flex-initial gap-1.5 shadow-sm shadow-primary/20" onClick={handleBrowsePlans}>
                  <Zap className="h-3.5 w-3.5" />
                  New Order
                </Button>
                <Button variant="outline" size="sm" className="h-8 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm flex-1 sm:flex-initial gap-1.5 bg-background/60 border-border/50" onClick={handleDownloadInvoice}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="sm:hidden">PDF</span>
                  <span className="hidden sm:inline">Invoice</span>
                </Button>
                <Button variant="outline" size="sm" className="h-8 sm:h-9 px-2.5 text-xs sm:text-sm bg-background/60 border-border/50 hidden sm:flex" onClick={handleAccountSettings}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            STAT CARDS
        ════════════════════════════════════════════════════════════════ */}
        <div className={cn(
          "grid gap-2.5 sm:gap-3",
          stats?.resellerWallet ? "grid-cols-2 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4"
        )}>
          {stats?.resellerWallet && (
            <Card className={cn("relative overflow-hidden group", softCard)}>
              <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={cn(statIconBox, "bg-gradient-to-br from-primary/25 to-primary/10 border-primary/25")}>
                    <Wallet className="h-3.5 w-3.5 text-emerald-700 dark:text-primary" />
                  </div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Wallet</p>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight tabular-nums">{formatCurrency(stats.resellerWallet.balance)}</p>
                <button
                  onClick={() => router.push('/dashboard/reseller-wallet')}
                  className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 font-medium hover:underline mt-1 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all"
                >
                  Add Funds <ArrowRight className="h-3 w-3" />
                </button>
              </CardContent>
            </Card>
          )}

          <Card className={cn("relative overflow-hidden", softCard)}>
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={cn(statIconBox, "bg-gradient-to-br from-muted/60 to-muted/20 border-border/50")}>
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Orders</p>
              </div>
              <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight tabular-nums">{stats?.totalOrders || 0}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card className={cn("relative overflow-hidden", softCard)}>
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={cn(statIconBox, "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/25")}>
                  <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active</p>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight tabular-nums">{stats?.activeServices || 0}</p>
                {(stats?.activeServices || 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Live
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Running</p>
            </CardContent>
          </Card>

          <Card className={cn("relative overflow-hidden", softCard)}>
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className={cn(statIconBox, "bg-gradient-to-br from-violet-500/15 to-violet-500/5 border-violet-500/20")}>
                  <TrendingUp className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Spent</p>
              </div>
              <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight tabular-nums">{formatCurrency(stats?.totalSpent || 0)}</p>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {spendingTrend !== 0 ? (
                  <span className={cn(
                    "text-[9px] font-semibold inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full",
                    spendingTrend > 0
                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                      : "text-red-500 bg-red-500/10 border border-red-500/20"
                  )}>
                    {spendingTrend > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    {Math.abs(spendingTrend)}%
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold text-muted-foreground inline-flex items-center gap-0.5">
                    <Minus className="h-2.5 w-2.5" /> 0%
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground/50">vs last mo</span>
              </div>
            </CardContent>
          </Card>

          {(stats?.pendingOrders || 0) > 0 && (
            <Card className={cn("relative overflow-hidden", softCard)}>
              <CardContent className="p-3.5 sm:p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={cn(statIconBox, "bg-gradient-to-br from-amber-500/20 to-amber-500/5 border-amber-500/25")}>
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pending</p>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight tabular-nums">{stats?.pendingOrders}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Awaiting setup</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            CHARTS ROW
        ════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Spending Trend Area Chart */}
          <Card className={cn("lg:col-span-2 rounded-2xl", softCard)}>
            <CardHeader className="pb-1 flex flex-row items-center justify-between px-4 sm:px-5 pt-4 sm:pt-5">
              <div className="flex items-center gap-2">
                <div className={cn(statIconBox, "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20")}>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-700 dark:text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Spending Trend</CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Last 6 months</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {spendingTrend !== 0 && (
                  <Badge variant="outline" className={cn(
                    "text-[9px] font-semibold",
                    spendingTrend > 0
                      ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                      : "border-red-500/20 text-red-500 bg-red-500/5"
                  )}>
                    {spendingTrend > 0 ? '+' : ''}{spendingTrend}%
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-1 pb-3 px-2 sm:px-4">
              {spendingChartData.length > 0 && spendingChartData.some(d => d.amount > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={spendingChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v) => `₹${formatCompact(v)}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#spendGradient)"
                      dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex flex-col items-center justify-center text-muted-foreground/50">
                  <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-xs">No spending data yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Distribution Donut */}
          <Card className={cn("rounded-2xl", softCard)}>
            <CardHeader className="pb-1 px-4 sm:px-5 pt-4 sm:pt-5">
              <div className="flex items-center gap-2">
                <div className={cn(statIconBox, "bg-gradient-to-br from-amber-500/15 to-amber-500/5 border-amber-500/20")}>
                  <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Distribution</CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{stats?.totalOrders || 0} orders</p>
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
                            background: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                            padding: '6px 10px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-bold text-foreground">{stats?.totalOrders || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Orders</p>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="flex gap-4 mt-2">
                    {orderDistributionData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-[11px] text-muted-foreground">{entry.name}</span>
                        <span className="text-[11px] font-semibold text-foreground">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground/50">
                  <Package className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-xs">No orders yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            MAIN CONTENT: Two-column layout
        ════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

          {/* ── Left: Recent Orders ─────────────────────────────────── */}
          <div className="lg:col-span-2">
            <Card className={cn("rounded-2xl", softCard)}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between px-4 sm:px-5 pt-4 sm:pt-5">
                <div className="flex items-center gap-2">
                  <div className={cn(statIconBox, "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/25")}>
                    <ServerIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] sm:text-xs text-muted-foreground hover:text-foreground gap-1 h-7 px-2 rounded-lg hover:bg-muted/50"
                  onClick={handleViewAllOrders}
                >
                  View all
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="pt-0 px-3 sm:px-4 pb-3 sm:pb-4">
                {stats?.recentOrders?.length ? (
                  <div className="space-y-1">
                    {stats.recentOrders.slice(0, 6).map((order) => (
                      <button
                        key={order._id}
                        onClick={() => router.push(`/dashboard/order/${order._id}`)}
                        className="flex items-center gap-2.5 sm:gap-3 py-2.5 sm:py-3 w-full text-left hover:bg-muted/40 px-2.5 sm:px-3 rounded-xl transition-all duration-200 group border border-transparent hover:border-border/40"
                      >
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                          order.status?.toLowerCase() === 'completed' || order.status?.toLowerCase() === 'active'
                            ? "bg-emerald-500/10 border-emerald-500/20"
                            : order.status?.toLowerCase() === 'pending' || order.status?.toLowerCase() === 'provisioning'
                              ? "bg-amber-500/10 border-amber-500/20"
                              : "bg-muted/40 border-border/40"
                        )}>
                          <ServerIcon className={cn(
                            "h-3.5 w-3.5",
                            order.status?.toLowerCase() === 'completed' || order.status?.toLowerCase() === 'active'
                              ? "text-emerald-600 dark:text-emerald-400"
                              : order.status?.toLowerCase() === 'pending' || order.status?.toLowerCase() === 'provisioning'
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium text-foreground line-clamp-1 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                            {order.productName}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                            <span className="line-clamp-1">{order.memory}</span>
                            <span className="text-muted-foreground/30">&middot;</span>
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
                            <Badge variant="outline" className={cn("text-[8px] sm:text-[9px] mt-0.5 capitalize hidden min-[380px]:inline-flex", getStatusBadgeClasses(order.status))}>
                              {order.status}
                            </Badge>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-emerald-600/50 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 sm:py-12">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/15 to-emerald-500/10 border border-primary/20 flex items-center justify-center mx-auto mb-3 shadow-sm">
                      <Package className="h-5 w-5 text-emerald-700 dark:text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">No orders yet</p>
                    <p className="text-xs text-muted-foreground/50 mb-4">Deploy your first server in minutes</p>
                    <Button size="sm" onClick={handleBrowsePlans} className="gap-2 h-8 text-xs shadow-sm shadow-primary/15">
                      <Zap className="h-3.5 w-3.5" />
                      Browse Plans
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Account + Quick Actions ──────────────────────── */}
          <div className="space-y-3 sm:space-y-4">
            {/* Account Card */}
            <Card className={cn("rounded-2xl overflow-hidden", softCard)}>
              <div className="h-1 bg-gradient-to-r from-emerald-600 via-primary to-emerald-500/60" />
              <CardHeader className="pb-2 px-4 sm:px-5 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-700 via-emerald-600 to-primary text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {userInitials}
                  </div>
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 sm:px-5 pb-4 space-y-2">
                {[
                  { label: 'Name', value: user?.name },
                  { label: 'Email', value: user?.email },
                  {
                    label: 'Member since',
                    value: user?.createdAt
                      ? new Date(user.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' })
                      : 'N/A',
                  },
                ].map((row, i) => (
                  <div key={row.label}>
                    <div className="flex justify-between items-center gap-3 py-1.5">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{row.label}</span>
                      <span className="text-xs sm:text-sm font-medium text-foreground truncate max-w-[58%] text-right">{row.value}</span>
                    </div>
                    {i < 2 && <Separator className="bg-border/40" />}
                  </div>
                ))}
                <Separator className="bg-border/40" />
                <div className="flex justify-between items-center gap-3 py-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <ShieldCheck className="h-3 w-3" />
                    Active
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className={cn("rounded-2xl", softCard)}>
              <CardHeader className="pb-1 px-4 sm:px-5 pt-4">
                <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="pt-1 px-2 sm:px-3 pb-3 grid gap-0.5">
                {[
                  { icon: Zap, label: 'Browse Plans', action: handleBrowsePlans, accent: true },
                  { icon: Eye, label: 'View All Orders', action: handleViewAllOrders },
                  { icon: Download, label: 'Download Invoice', action: handleDownloadInvoice },
                  { icon: Settings, label: 'Account Settings', action: handleAccountSettings },
                  { icon: LifeBuoy, label: 'Support', action: () => router.push('/support/tickets') },
                ].map(({ icon: Icon, label, action, accent }) => (
                  <Button
                    key={label}
                    variant="ghost"
                    className={cn(
                      "justify-start h-8 sm:h-9 text-xs sm:text-sm font-normal px-3 rounded-xl hover:bg-muted/50 group w-full",
                      accent && "text-emerald-700 dark:text-emerald-400 font-medium bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10"
                    )}
                    onClick={action}
                  >
                    <Icon className={cn("h-3.5 w-3.5 mr-2", accent ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
                    {label}
                    <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
                  </Button>
                ))}
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" />
              Download Invoice
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Select an order to download its invoice as PDF
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm">Select Order</Label>
              <Select value={selectedOrderForInvoice} onValueChange={setSelectedOrderForInvoice}>
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Choose an order..." />
                </SelectTrigger>
                <SelectContent>
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
              <div className="p-2 rounded-lg bg-muted/50 text-xs">
                <div className="flex justify-between items-center">
                  <span>Order Date:</span>
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
            <Button variant="outline" onClick={() => { setShowInvoiceDialog(false); setSelectedOrderForInvoice(''); }} disabled={isDownloadingInvoice} className="w-full h-9 text-xs sm:text-sm">
              Cancel
            </Button>
            <Button onClick={downloadInvoiceForOrder} disabled={!selectedOrderForInvoice || isDownloadingInvoice} className="flex items-center gap-2 w-full h-9 text-xs sm:text-sm">
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Account Settings
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Update your account information and security settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs sm:text-sm">Full Name</Label>
                <Input id="name" value={settingsData.name} onChange={(e) => setSettingsData(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter your full name" className="text-xs sm:text-sm h-9" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs sm:text-sm">Email Address</Label>
                <Input id="email" type="email" value={settingsData.email} onChange={(e) => setSettingsData(prev => ({ ...prev, email: e.target.value }))} placeholder="Enter your email address" className="text-xs sm:text-sm h-9" />
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-xs sm:text-sm font-semibold">Change Password</h4>
              <p className="text-xs text-muted-foreground">Leave password fields empty if you don't want to change your password</p>
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-xs sm:text-sm">Current Password</Label>
                <Input id="currentPassword" type="password" value={settingsData.currentPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, currentPassword: e.target.value }))} placeholder="Enter current password" className="text-xs sm:text-sm h-9" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-xs sm:text-sm">New Password</Label>
                <Input id="newPassword" type="password" value={settingsData.newPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, newPassword: e.target.value }))} placeholder="Enter new password" className="text-xs sm:text-sm h-9" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs sm:text-sm">Confirm New Password</Label>
                <Input id="confirmPassword" type="password" value={settingsData.confirmPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Confirm new password" className="text-xs sm:text-sm h-9" />
              </div>
              {settingsData.newPassword && settingsData.confirmPassword && settingsData.newPassword !== settingsData.confirmPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-semibold">Account Status</h4>
                <p className="text-xs text-muted-foreground">Your account is currently active</p>
              </div>
              <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 text-xs self-start">
                Active
              </Badge>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col-reverse sm:flex-row pt-4">
            <Button variant="outline" onClick={() => { setShowSettingsDialog(false); setSettingsData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' })); }} disabled={isUpdatingSettings} className="w-full h-9 text-xs sm:text-sm">
              Cancel
            </Button>
            <Button onClick={updateAccountSettings} disabled={isUpdatingSettings} className="flex items-center gap-2 w-full h-9 text-xs sm:text-sm">
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
