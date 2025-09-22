'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Activity,
  Filter,
  Search,
  Calendar,
  Clock,
  User,
  Server,
  Shield,
  CreditCard,
  MessageCircle,
  Settings,
  Bell,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Download,
  Eye,
  MoreHorizontal,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ActivityItem {
  _id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'failed' | 'pending';
  metadata?: any;
  category?: string;
}

interface ActivityFilters {
  type: string;
  status: string;
  search: string;
  dateRange: string;
  category: string;
}

const ActivityPage = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ActivityFilters>({
    type: 'all',
    status: 'all',
    search: '',
    dateRange: 'all',
    category: 'all'
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  });
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [activityStats, setActivityStats] = useState({
    total: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    successRate: 0
  });
  const router = useRouter();

  useEffect(() => {
    fetchActivities();
  }, [filters, pagination.page]);

  useEffect(() => {
    fetchActivityStats();
  }, []);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.type !== 'all' && { type: filters.type }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.category !== 'all' && { category: filters.category }),
        ...(filters.search && { search: filters.search }),
        ...(dateRange.from && { dateFrom: dateRange.from.toISOString() }),
        ...(dateRange.to && { dateTo: dateRange.to.toISOString() })
      });

      const response = await fetch(`/api/users/activity?${queryParams}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities);
        setPagination(data.pagination);
      } else {
        toast.error('Failed to fetch activities');
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast.error('Error loading activities');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityStats = async () => {
    try {
      const response = await fetch('/api/users/activity/stats');
      if (response.ok) {
        const data = await response.json();
        setActivityStats(data);
      }
    } catch (error) {
      console.error('Error fetching activity stats:', error);
    }
  };

  const exportActivities = async () => {
    try {
      const queryParams = new URLSearchParams({
        export: 'true',
        ...(filters.type !== 'all' && { type: filters.type }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.search && { search: filters.search })
      });

      const response = await fetch(`/api/users/activity/export?${queryParams}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Activity log exported successfully');
      } else {
        toast.error('Failed to export activities');
      }
    } catch (error) {
      console.error('Error exporting activities:', error);
      toast.error('Export failed');
    }
  };

  const getActivityIcon = (type: string, status?: string) => {
    const iconClass = cn(
      "h-5 w-5",
      status === 'success' && "text-green-600",
      status === 'failed' && "text-red-600",
      status === 'pending' && "text-yellow-600",
      !status && "text-blue-600"
    );

    switch (type) {
      case 'order_created':
      case 'order_confirmed':
      case 'order_completed':
        return <Server className={iconClass} />;
      case 'payment_success':
      case 'payment_failed':
        return <CreditCard className={iconClass} />;
      case 'ticket_created':
      case 'ticket_updated':
      case 'ticket_replied':
        return <MessageCircle className={iconClass} />;
      case 'profile_updated':
        return <User className={iconClass} />;
      case 'security_update':
        return <Shield className={iconClass} />;
      case 'server_action':
        return <Settings className={iconClass} />;
      case 'login':
        return <Activity className={iconClass} />;
      case 'notification':
        return <Bell className={iconClass} />;
      default:
        return <Activity className={iconClass} />;
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const statusConfig = {
      success: { variant: 'outline' as const, color: 'text-green-600 border-green-200 bg-green-50', icon: CheckCircle },
      failed: { variant: 'outline' as const, color: 'text-red-600 border-red-200 bg-red-50', icon: XCircle },
      pending: { variant: 'outline' as const, color: 'text-yellow-600 border-yellow-200 bg-yellow-50', icon: Clock }
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;

    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getTypeLabel = (type: string) => {
    const typeLabels = {
      order_created: 'Order Created',
      order_confirmed: 'Order Confirmed',
      order_completed: 'Order Completed',
      order_failed: 'Order Failed',
      payment_success: 'Payment Success',
      payment_failed: 'Payment Failed',
      ticket_created: 'Ticket Created',
      ticket_updated: 'Ticket Updated',
      ticket_replied: 'Ticket Reply',
      ticket_resolved: 'Ticket Resolved',
      profile_updated: 'Profile Update',
      server_action: 'Server Action',
      security_update: 'Security Update',
      login: 'Login Activity',
      notification: 'Notification',
      account_created: 'Account Created'
    };
    return typeLabels[type as keyof typeof typeLabels] || type;
  };

  // Replace the formatDate function with this safer version:

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return {
          relative: 'Invalid date',
          absolute: 'Invalid date'
        };
      }

      return {
        relative: formatRelativeTime(date),
        absolute: format(date, 'MMM dd, yyyy HH:mm')
      };
    } catch (error) {
      console.error('Error formatting date:', error, 'Date string:', dateString);
      return {
        relative: 'Unknown',
        absolute: 'Unknown'
      };
    }
  };

  const formatRelativeTime = (date: Date) => {
    try {
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting relative time:', error);
      return 'Unknown';
    }
  };
  const handleActivityClick = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'order_created':
      case 'order_confirmed':
      case 'order_completed':
        if (activity.metadata?.orderId) {
          router.push(`/dashboard/order/${activity.metadata.orderId}`);
        } else {
          router.push('/dashboard/orders');
        }
        break;
      case 'ticket_created':
      case 'ticket_updated':
      case 'ticket_replied':
        if (activity.metadata?.ticketId) {
          router.push(`/support/tickets/${activity.metadata.ticketId}`);
        } else {
          router.push('/support/tickets');
        }
        break;
      case 'profile_updated':
        router.push('/dashboard/my-account');
        break;
      case 'server_action':
        router.push('/dashboard/viewLinux');
        break;
      default:
        break;
    }
  };

  return (
    <div className='min-h-screen bg-background'>
      {/* Mobile Header */}
      <div className="lg:hidden h-16" />

      {/* Header */}
   
      <div className='container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6'>
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Activities</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Clock className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityStats.today}</p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityStats.thisWeek}</p>
                  <p className="text-xs text-muted-foreground">This Week</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityStats.thisMonth}</p>
                  <p className="text-xs text-muted-foreground">This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activityStats.successRate}%</p>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search activities..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={filters.type} onValueChange={(value) => setFilters({ ...filters, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="order_created">Orders</SelectItem>
                    <SelectItem value="payment_success">Payments</SelectItem>
                    <SelectItem value="ticket_created">Support</SelectItem>
                    <SelectItem value="server_action">Server Actions</SelectItem>
                    <SelectItem value="login">Login Activity</SelectItem>
                    <SelectItem value="profile_updated">Profile Updates</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={filters.category} onValueChange={(value) => setFilters({ ...filters, category: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="orders">Orders & Payments</SelectItem>
                    <SelectItem value="support">Support & Tickets</SelectItem>
                    <SelectItem value="account">Account & Profile</SelectItem>
                    <SelectItem value="system">System & Security</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Date Range</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {(filters.search || filters.type !== 'all' || filters.status !== 'all' || filters.category !== 'all' || dateRange.from) && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilters({
                      type: 'all',
                      status: 'all',
                      search: '',
                      dateRange: 'all',
                      category: 'all'
                    });
                    setDateRange({});
                  }}
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activities List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity History
            </CardTitle>
            <CardDescription>
              Complete log of your account activities and actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading activities...</span>
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No activities found</h3>
                <p className="text-muted-foreground mb-4">
                  {Object.values(filters).some(f => f !== 'all' && f !== '') || dateRange.from
                    ? 'Try adjusting your filters to see more activities.'
                    : 'Your activities will appear here as you use our services.'
                  }
                </p>
                {(Object.values(filters).some(f => f !== 'all' && f !== '') || dateRange.from) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilters({
                        type: 'all',
                        status: 'all',
                        search: '',
                        dateRange: 'all',
                        category: 'all'
                      });
                      setDateRange({});
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity._id}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-lg border-primary/30 border transition-all duration-200 hover:bg-muted/50",
                      activity.metadata?.clickable !== false && "cursor-pointer"
                    )}
                    onClick={() => activity.metadata?.clickable !== false && handleActivityClick(activity)}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-full bg-background flex items-center justify-center border-2",
                      activity.status === 'success' && "border-green-200 bg-green-50 dark:bg-green-950/30",
                      activity.status === 'failed' && "border-red-200 bg-red-50 dark:bg-red-950/30",
                      activity.status === 'pending' && "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30",
                      !activity.status && "border-blue-200 bg-blue-50 dark:bg-blue-950/30"
                    )}>
                      {getActivityIcon(activity.type, activity.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <h3 className="font-semibold truncate">
                            {activity.title}
                          </h3>
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {getTypeLabel(activity.type)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getStatusBadge(activity.status)}
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">
                        {activity.description}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(activity.timestamp).relative}
                          </span>
                          <span title={formatDate(activity.timestamp).absolute}>
                            {formatDate(activity.timestamp).absolute}
                          </span>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleActivityClick(activity)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(activity, null, 2));
                              toast.success('Activity details copied to clipboard');
                            }}>
                              Copy Details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Metadata badges */}
                      {activity.metadata && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activity.metadata.orderId && (
                            <Badge variant="outline" className="text-xs">
                              Order: {activity.metadata.orderId.toString().slice(-8)}
                            </Badge>
                          )}
                          {activity.metadata.ticketId && (
                            <Badge variant="outline" className="text-xs">
                              Ticket: {activity.metadata.ticketId}
                            </Badge>
                          )}
                          {activity.metadata.amount && (
                            <Badge variant="outline" className="text-xs">
                              ₹{activity.metadata.amount}
                            </Badge>
                          )}
                          {activity.metadata.ipAddress && (
                            <Badge variant="outline" className="text-xs">
                              IP: {activity.metadata.ipAddress}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} activities
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                      const pageNum = Math.max(1, Math.min(pagination.page - 2, pagination.pages - 4)) + i;
                      if (pageNum > pagination.pages) return null;
                      return (
                        <Button
                          key={pageNum}
                          variant={pageNum === pagination.page ? "default" : "outline"}
                          size="sm"
                          className="w-10 h-8"
                          onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page === pagination.pages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ActivityPage;
