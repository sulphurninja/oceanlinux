'use client'

import React, { useEffect, useState } from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboardIcon,
  ServerIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  TrendingUpIcon,
  ActivityIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
  Users,
  DollarSign,
  Package,
  Zap,
  Eye,
  Filter,
  Download,
  Settings,
  ArrowUpIcon,
  ArrowDownIcon,
  MoreHorizontal,
  IndianRupee
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Badge,
} from "@/components/ui/badge";
import {
  Button,
} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DashboardStats {
  totalOrders: number;
  activeServices: number;
  totalSpent: number;
  pendingOrders: number;
  recentOrders: any[];
  monthlySpending: number[];
  orderStatusBreakdown: {
    pending: number;
    completed: number;
    failed: number;
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('30d');

  // Dialog states
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<string>('');
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);

  // Settings states
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

  // Keep all existing handler functions...
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

      if (!response.ok) {
        throw new Error('Failed to generate invoice');
      }

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

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update settings');
      }

      toast.success('Account settings updated successfully!');
      setShowSettingsDialog(false);
      setSettingsData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
    } catch (error) {
      console.error('Failed to update settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update settings');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(date));
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'active':
        return 'bg-green-500';
      case 'pending':
      case 'provisioning':
        return 'bg-yellow-500';
      case 'failed':
      case 'terminated':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'active':
        return <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4" />;
      case 'pending':
      case 'provisioning':
        return <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" />;
      case 'failed':
      case 'terminated':
        return <XCircleIcon className="h-3 w-3 sm:h-4 sm:w-4" />;
      default:
        return <AlertCircleIcon className="h-3 w-3 sm:h-4 sm:w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/20 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 m-auto animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="lg:hidden h-16" />



      <div className="w-full md:max-w-7xl mt- mx-auto px-3 md:mt-0 -mt-12  sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Welcome Banner - Mobile Optimized */}
        <Card className="relative  bg-gradient-to-br from-purple-500/10 to-purple-600/5 overflow-hidden">
          <CardContent className="relative p-3 sm:p-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1 min-w-0">
                <div className="hidden sm:block flex-shrink-0">
                  <DotLottieReact
                    src="/welcome.lottie"
                    loop
                    autoplay
                    className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold break-words">
                    Welcome back, {user?.name?.split(' ')[0] || user?.name}!
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm lg:text-base">
                    Here's what's happening with your services
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs lg:text-sm text-muted-foreground">
                    <CalendarIcon className="h-3 w-3 lg:h-4 lg:w-4 flex-shrink-0" />
                    <span className="truncate">
                      {new Date().toLocaleDateString('en-IN', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-row gap-2 w-full sm:w-auto">
                <Button size="sm" className="flex items-center gap-1 h-8 px-3 text-xs flex-1 sm:flex-initial" onClick={handleBrowsePlans}>
                  <ServerIcon className="h-3 w-3" />
                  <span>Buy Now</span>
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-1 h-8 px-3 text-xs flex-1 sm:flex-initial" onClick={handleDownloadInvoice}>
                  <Download className="h-3 w-3" />
                  <span>Export</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid - Responsive */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground line-clamp-2">Total Orders</p>
                  <p className="text-lg sm:text-xl font-bold">{stats?.totalOrders || 0}</p>
                </div>
                <div className="h-6 w-6 sm:h-8 sm:w-8 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <ShoppingCartIcon className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <TrendingUpIcon className="h-2.5 w-2.5" />
                <span>All time</span>
              </div>
            </CardContent>
          </Card>

          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground line-clamp-2">Active Services</p>
                  <p className="text-lg sm:text-xl font-bold">{stats?.activeServices || 0}</p>
                </div>
                <div className="h-6 w-6 sm:h-8 sm:w-8 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <ServerIcon className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <ActivityIcon className="h-2.5 w-2.5" />
                <span>Running</span>
              </div>
            </CardContent>
          </Card>

          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground line-clamp-2">Total Spent</p>
                  <p className="text-sm sm:text-lg font-bold break-words">{formatCurrency(stats?.totalSpent || 0)}</p>
                </div>
                <div className="h-6 w-6 sm:h-8 sm:w-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CreditCardIcon className="h-3 w-3 sm:h-4 sm:w-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <IndianRupee className="h-2.5 w-2.5" />
                <span>Lifetime</span>
              </div>
            </CardContent>
          </Card>

          <Card className="p-3">
            <CardContent className="p-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground line-clamp-2">Pending</p>
                  <p className="text-lg sm:text-xl font-bold">{stats?.pendingOrders || 0}</p>
                </div>
                <div className="h-6 w-6 sm:h-8 sm:w-8 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <AlertCircleIcon className="h-2.5 w-2.5" />
                <span>Attention</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Responsive Tabs */}
        <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
          <div className="flex justify-center">
            <TabsList className="grid w-full max-w-sm grid-cols-3">
              <TabsTrigger value="overview" className="text-xs sm:text-sm px-2">Overview</TabsTrigger>
              <TabsTrigger value="orders" className="text-xs sm:text-sm px-2">Orders</TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs sm:text-sm px-2">Analytics</TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Order Status Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Package className="h-4 w-4" />
                    Order Status
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Current status of your orders
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 bg-green-500 rounded-full"></div>
                        <span className="text-xs sm:text-sm">Completed</span>
                      </div>
                      <span className="font-semibold text-xs sm:text-sm">{stats?.orderStatusBreakdown?.completed || 0}</span>
                    </div>
                    <Progress value={((stats?.orderStatusBreakdown?.completed || 0) / Math.max(stats?.totalOrders || 1, 1)) * 100} className="h-1.5" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 bg-yellow-500 rounded-full"></div>
                        <span className="text-xs sm:text-sm">Pending</span>
                      </div>
                      <span className="font-semibold text-xs sm:text-sm">{stats?.orderStatusBreakdown?.pending || 0}</span>
                    </div>
                    <Progress value={((stats?.orderStatusBreakdown?.pending || 0) / Math.max(stats?.totalOrders || 1, 1)) * 100} className="h-1.5" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 bg-red-500 rounded-full"></div>
                        <span className="text-xs sm:text-sm">Failed</span>
                      </div>
                      <span className="font-semibold text-xs sm:text-sm">{stats?.orderStatusBreakdown?.failed || 0}</span>
                    </div>
                    <Progress value={((stats?.orderStatusBreakdown?.failed || 0) / Math.max(stats?.totalOrders || 1, 1)) * 100} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>

              {/* Account Information */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Users className="h-4 w-4" />
                    Account Information
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Your account details and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Name</span>
                      <span className="font-medium text-xs sm:text-sm break-words text-right max-w-[60%]">{user?.name}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Email</span>
                      <span className="font-medium text-xs sm:text-sm break-all text-right max-w-[60%]">{user?.email}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Member Since</span>
                      <span className="font-medium text-xs sm:text-sm text-right">
                        {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short'
                        }) : 'N/A'}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Account Status</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                        Active
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <ActivityIcon className="h-4 w-4" />
                  Recent Orders
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Your latest order activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats?.recentOrders?.length ? (
                  <div className="space-y-2">
                    {stats.recentOrders.slice(0, 5).map((order) => (
                      <div key={order._id} className="flex items-center justify-between p-2 rounded-lg  border border-primary/30  bg-card hover:bg-muted/50 transition-colors gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={cn("h-2 w-2 rounded-full flex-shrink-0", getStatusColor(order.status))} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-xs sm:text-sm line-clamp-1">{order.productName}</p>
                            <div className="flex flex-col text-xs text-muted-foreground">
                              <span className="line-clamp-1">{order.memory}</span>
                              <span className="line-clamp-1">
                                {new Date(order.createdAt).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-semibold text-xs">{formatCurrency(order.price)}</p>
                          <Badge variant="outline" className="text-xs mt-1 hidden sm:inline-flex">
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No recent orders found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg">All Orders</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Complete history of your orders and services
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table className=''>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[120px] text-xs">Product</TableHead>
                          <TableHead className="hidden sm:table-cell min-w-[80px] text-xs">Config</TableHead>
                          <TableHead className="hidden md:table-cell min-w-[90px] text-xs">Date</TableHead>
                          <TableHead className="min-w-[70px] text-xs">Status</TableHead>
                          <TableHead className="text-right min-w-[70px] text-xs">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats?.recentOrders?.map((order) => (
                          <TableRow key={order._id}>
                            <TableCell className="max-w-[120px]">
                              <div>
                                <p className="font-medium line-clamp-2 text-xs">{order.productName}</p>
                                <p className="text-xs text-muted-foreground sm:hidden line-clamp-1">
                                  {order.memory}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <span className="text-xs line-clamp-1">{order.memory}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="text-xs">
                                <p>{new Date(order.createdAt).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  day: 'numeric'
                                })}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  order.status === 'completed' && "bg-green-50 text-green-700 border-green-200",
                                  order.status === 'pending' && "bg-yellow-50 text-yellow-700 border-yellow-200",
                                  order.status === 'failed' && "bg-red-50 text-red-700 border-red-200"
                                )}
                              >
                                {getStatusIcon(order.status)}
                                <span className="ml-1 capitalize hidden sm:inline">{order.status}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-xs">
                              <div className="break-words">{formatCurrency(order.price)}</div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Spending Overview</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Your spending patterns over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <span className="text-xs sm:text-sm">This Month</span>
                      <span className="font-semibold text-xs sm:text-sm break-words">{formatCurrency(stats?.monthlySpending?.[0] || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <span className="text-xs sm:text-sm">Last Month</span>
                      <span className="font-semibold text-xs sm:text-sm break-words">{formatCurrency(stats?.monthlySpending?.[1] || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                      <span className="text-xs sm:text-sm">Average Monthly</span>
                      <span className="font-semibold text-xs sm:text-sm break-words">
                        {formatCurrency(
                          (stats?.monthlySpending?.reduce((a, b) => a + b, 0) || 0) /
                          Math.max(stats?.monthlySpending?.length || 1, 1)
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Updated Quick Actions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Frequently used actions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      variant="outline"
                      className="justify-start h-9 text-xs sm:text-sm"
                      onClick={handleBrowsePlans}
                    >
                      <ServerIcon className="h-3 w-3 mr-2" />
                      <span className="truncate">Browse New Plans</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start h-9 text-xs sm:text-sm"
                      onClick={handleViewAllOrders}
                    >
                      <Eye className="h-3 w-3 mr-2" />
                      <span className="truncate">View All Orders</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start h-9 text-xs sm:text-sm"
                      onClick={handleDownloadInvoice}
                    >
                      <Download className="h-3 w-3 mr-2" />
                      <span className="truncate">Download Invoice</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start h-9 text-xs sm:text-sm"
                      onClick={handleAccountSettings}
                    >
                      <Settings className="h-3 w-3 mr-2" />
                      <span className="truncate">Account Settings</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Download Invoice Dialog - Mobile Responsive */}
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
                  <span className="break-words">
                    {stats?.recentOrders?.find(o => o._id === selectedOrderForInvoice)?.createdAt
                      ? new Date(stats.recentOrders.find(o => o._id === selectedOrderForInvoice)!.createdAt).toLocaleDateString('en-IN')
                      : 'N/A'
                    }
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-col-reverse sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setShowInvoiceDialog(false);
                setSelectedOrderForInvoice('');
              }}
              disabled={isDownloadingInvoice}
              className="w-full h-9 text-xs sm:text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={downloadInvoiceForOrder}
              disabled={!selectedOrderForInvoice || isDownloadingInvoice}
              className="flex items-center gap-2 w-full h-9 text-xs sm:text-sm"
            >
              {isDownloadingInvoice ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Download className="h-3 w-3" />
                  Download PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Settings Dialog - Mobile Responsive */}
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
            {/* Personal Information */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs sm:text-sm">Full Name</Label>
                <Input
                  id="name"
                  value={settingsData.name}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter your full name"
                  className="text-xs sm:text-sm h-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs sm:text-sm">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={settingsData.email}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter your email address"
                  className="text-xs sm:text-sm h-9"
                />
              </div>
            </div>

            <Separator />

            {/* Password Change Section */}
            <div className="space-y-3">
              <h4 className="text-xs sm:text-sm font-semibold">Change Password</h4>
              <p className="text-xs text-muted-foreground">
                Leave password fields empty if you don't want to change your password
              </p>

              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-xs sm:text-sm">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={settingsData.currentPassword}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="Enter current password"
                  className="text-xs sm:text-sm h-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-xs sm:text-sm">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={settingsData.newPassword}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="Enter new password"
                  className="text-xs sm:text-sm h-9"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs sm:text-sm">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={settingsData.confirmPassword}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                  className="text-xs sm:text-sm h-9"
                />
              </div>

              {settingsData.newPassword && settingsData.confirmPassword &&
                settingsData.newPassword !== settingsData.confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
            </div>

            {/* Account Status */}
            <Separator />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-semibold">Account Status</h4>
                <p className="text-xs text-muted-foreground">Your account is currently active</p>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs self-start">
                Active
              </Badge>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-col-reverse sm:flex-row pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowSettingsDialog(false);
                setSettingsData(prev => ({
                  ...prev,
                  currentPassword: '',
                  newPassword: '',
                  confirmPassword: '',
                }));
              }}
              disabled={isUpdatingSettings}
              className="w-full h-9 text-xs sm:text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={updateAccountSettings}
              disabled={isUpdatingSettings}
              className="flex items-center gap-2 w-full h-9 text-xs sm:text-sm"
            >
              {isUpdatingSettings ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Settings className="h-3 w-3" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
