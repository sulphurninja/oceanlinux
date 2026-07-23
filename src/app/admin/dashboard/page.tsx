"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from "next/link";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Ticket,
  BookOpen,
  Server,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  MessageSquare,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Wrench,
  ArrowRight,
  Activity,
  Building2,
  Megaphone,
  RotateCcw,
  ClipboardList,
  LayoutDashboard,
} from "lucide-react";

interface RecentTicket {
  _id: string;
  ticketId?: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  userId?: { name?: string; email?: string } | null;
}

interface AdminStats {
  users: {
    total: number;
    newThisMonth: number;
  };
  tickets: {
    total: number;
    open: number;
    inProgress: number;
    waitingResponse: number;
    resolved: number;
    recent: RecentTicket[];
  };
  knowledgeBase: {
    total: number;
    published: number;
    newThisMonth: number;
  };
  systemHealth: {
    uptime: string;
    responseTime: string;
    status: string;
    cronSecretConfigured?: boolean;
  };
  orders?: {
    total: number;
    pending: number;
    confirmed: number;
    active: number;
    provisioningNow: number;
    provisionFailed: number;
    paidNotProvisioned: number;
    advpsPending: number;
  };
}

const statusConfig = {
  open: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300', icon: AlertCircle, label: 'Open' },
  'in-progress': { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300', icon: Clock, label: 'In Progress' },
  'waiting-response': { color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300', icon: MessageSquare, label: 'Waiting' },
  resolved: { color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300', icon: CheckCircle, label: 'Resolved' },
  closed: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', icon: CheckCircle, label: 'Closed' },
};

const priorityConfig = {
  low: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300', label: 'Low' },
  medium: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300', label: 'Medium' },
  high: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300', label: 'High' },
  critical: { color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300', label: 'Critical' },
};

const quickLinks = [
  { href: '/admin/manageOrders', label: 'Manage Orders', icon: ShoppingBag, desc: 'Payments & provisioning' },
  { href: '/admin/users', label: 'Users', icon: Users, desc: 'Accounts & wallets' },
  { href: '/admin/tickets', label: 'Support Tickets', icon: Ticket, desc: 'Customer replies' },
  { href: '/admin/ipStock', label: 'IP Stock', icon: Server, desc: 'Plans & inventory' },
  { href: '/admin/companies', label: 'Companies', icon: Building2, desc: 'Reseller portals' },
  { href: '/admin/renewal-logs', label: 'Renewal Logs', icon: RotateCcw, desc: 'Debug renewals' },
  { href: '/admin/server-action-requests', label: 'Action Requests', icon: ClipboardList, desc: 'Manual actions' },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone, desc: 'Broadcast updates' },
];

function formatStatusLabel(status: string) {
  return statusConfig[status as keyof typeof statusConfig]?.label || status.replace(/-/g, ' ');
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const response = await fetch('/api/admin/stats', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        toast.error('Failed to load dashboard stats');
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Network error while loading dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const openTickets = useMemo(() => {
    if (!stats) return 0;
    return stats.tickets.open + stats.tickets.inProgress + stats.tickets.waitingResponse;
  }, [stats]);

  const attentionItems = useMemo(() => {
    const orders = stats?.orders;
    if (!orders) return [];
    const items: { label: string; count: number; href: string; tone: 'red' | 'amber' | 'blue' }[] = [];
    if (orders.provisionFailed > 0) {
      items.push({ label: 'Provision failed', count: orders.provisionFailed, href: '/admin/manageOrders', tone: 'red' });
    }
    if (orders.paidNotProvisioned > 0) {
      items.push({ label: 'Paid, not provisioned', count: orders.paidNotProvisioned, href: '/admin/manageOrders', tone: 'amber' });
    }
    if (orders.advpsPending > 0) {
      items.push({ label: 'ADVPS pending', count: orders.advpsPending, href: '/admin/manageOrders', tone: 'amber' });
    }
    if (openTickets > 0) {
      items.push({ label: 'Open support tickets', count: openTickets, href: '/admin/tickets', tone: 'blue' });
    }
    return items;
  }, [stats?.orders, openTickets]);

  const systemOk = stats?.systemHealth.status === 'operational';

  if (loading && !stats) {
    return (
      <div className="admin-page-container">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="admin-page-container">
        <div className="text-center py-12 space-y-4">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl sm:text-2xl font-bold">Failed to Load Dashboard</h2>
          <p className="text-muted-foreground">Please try refreshing the page.</p>
          <Button onClick={() => fetchStats()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-container space-y-4 sm:space-y-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl lg:text-3xl">Admin Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground sm:text-base">
            Overview of users, orders, support, and platform health
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Badge
            variant="outline"
            className={cn(
              'justify-center py-1.5 px-3 w-full sm:w-auto',
              systemOk
                ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400'
                : 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-400'
            )}
          >
            <span className={cn('mr-2 h-2 w-2 rounded-full', systemOk ? 'bg-emerald-500' : 'bg-amber-500')} />
            System {stats.systemHealth.status}
          </Badge>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => fetchStats(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Attention alerts */}
      {attentionItems.length > 0 && (
        <Card className="border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-600" />
              Needs attention
            </CardTitle>
            <CardDescription>Items that may need admin action today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {attentionItems.map((item) => (
                <Link key={item.label} href={item.href}>
                  <Badge
                    variant="outline"
                    className={cn(
                      'cursor-pointer hover:opacity-90 py-1.5 px-3',
                      item.tone === 'red' && 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-400',
                      item.tone === 'amber' && 'border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-400',
                      item.tone === 'blue' && 'border-blue-200 text-blue-700 dark:border-blue-900 dark:text-blue-400'
                    )}
                  >
                    {item.count} {item.label}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Total Users</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">{stats.users.total.toLocaleString()}</p>
                <p className="text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 shrink-0" />
                  +{stats.users.newThisMonth} this month
                </p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Open Tickets</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">{openTickets}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">
                  {stats.tickets.total} total · {stats.tickets.resolved} resolved
                </p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                <Ticket className="h-4 w-4 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Total Orders</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">{(stats.orders?.total ?? 0).toLocaleString()}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">
                  {stats.orders?.active ?? 0} active · {stats.orders?.pending ?? 0} pending
                </p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <ShoppingBag className="h-4 w-4 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Knowledge Base</p>
                <p className="text-xl sm:text-2xl font-bold mt-1">{stats.knowledgeBase.published}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">
                  +{stats.knowledgeBase.newThisMonth} new · {stats.knowledgeBase.total} total
                </p>
              </div>
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Quick actions</CardTitle>
          <CardDescription>Jump to common admin tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <div className="group flex items-center gap-3 rounded-lg border bg-muted/20 p-3 hover:bg-muted/40 hover:border-primary/20 transition-colors min-w-0">
                    <div className="h-9 w-9 rounded-md bg-background border flex items-center justify-center shrink-0 group-hover:border-primary/30">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{link.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{link.desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Tickets */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Recent Support Tickets</CardTitle>
              <CardDescription>Latest customer support requests</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full sm:w-auto shrink-0">
              <Link href="/admin/tickets">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.tickets.recent.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No recent tickets</p>
              </div>
            ) : (
              stats.tickets.recent.map((ticket) => {
                const status = statusConfig[ticket.status as keyof typeof statusConfig];
                const StatusIcon = status?.icon || AlertCircle;
                const ticketHref = ticket.ticketId ? `/admin/tickets/${ticket.ticketId}` : '/admin/tickets';

                return (
                  <Link key={ticket._id} href={ticketHref}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors min-w-0">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 shrink-0">
                          <StatusIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{ticket.subject}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {ticket.userId?.name || 'Unknown user'} · {new Date(ticket.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pl-7 sm:pl-0 shrink-0">
                        <Badge className={priorityConfig[ticket.priority as keyof typeof priorityConfig]?.color || 'bg-gray-100 text-gray-800'}>
                          {priorityConfig[ticket.priority as keyof typeof priorityConfig]?.label || ticket.priority}
                        </Badge>
                        <Badge className={status?.color || 'bg-blue-100 text-blue-800'}>
                          {formatStatusLabel(ticket.status)}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4 sm:space-y-6">
          {/* Ticket breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Ticket breakdown</CardTitle>
              <CardDescription>Current support queue status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Open', value: stats.tickets.open, color: 'bg-blue-500' },
                { label: 'In progress', value: stats.tickets.inProgress, color: 'bg-yellow-500' },
                { label: 'Waiting response', value: stats.tickets.waitingResponse, color: 'bg-orange-500' },
                { label: 'Resolved', value: stats.tickets.resolved, color: 'bg-emerald-500' },
              ].map((row) => {
                const pct = stats.tickets.total > 0 ? Math.round((row.value / stats.tickets.total) * 100) : 0;
                return (
                  <div key={row.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium">{row.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', row.color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* System health + orders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Platform snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-xs text-muted-foreground">Uptime</p>
                  <p className="text-lg font-semibold mt-0.5">{stats.systemHealth.uptime}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-xs text-muted-foreground">API response</p>
                  <p className="text-lg font-semibold mt-0.5">{stats.systemHealth.responseTime}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-xs text-muted-foreground">Provisioning now</p>
                  <p className="text-lg font-semibold mt-0.5">{stats.orders?.provisioningNow ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <p className="text-xs text-muted-foreground">Confirmed orders</p>
                  <p className="text-lg font-semibold mt-0.5">{stats.orders?.confirmed ?? 0}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Cron secret configured</span>
                <Badge variant={stats.systemHealth.cronSecretConfigured ? 'default' : 'secondary'}>
                  {stats.systemHealth.cronSecretConfigured ? 'Yes' : 'No'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
