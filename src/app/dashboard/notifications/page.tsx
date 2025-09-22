'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Bell,
    Check,
    CheckCheck,
    Trash2,
    Filter,
    Search,
    Calendar,
    Eye,
    EyeOff,
    MoreHorizontal,
    Loader2,
    RefreshCw,
    Star,
    Archive,
    Clock,
    AlertCircle,
    Info,
    Gift,
    Server,
    MessageCircle,
    User,
    Shield,
    Settings,
    CreditCard,
    Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Notification {
    _id: string;
    type: string;
    title: string;
    message: string;
    data: any;
    read: boolean;
    readAt?: string;
    createdAt: string;
    actionUrl?: string;
    icon: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface NotificationFilters {
    type: string;
    priority: string;
    read: string;
    search: string;
    dateRange: string;
}

const NotificationsPage = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
    const [filters, setFilters] = useState<NotificationFilters>({
        type: 'all',
        priority: 'all',
        read: 'all',
        search: '',
        dateRange: 'all'
    });
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
        total: 0,
        pages: 0
    });
    const [unreadCount, setUnreadCount] = useState(0);
    const router = useRouter();

    useEffect(() => {
        fetchNotifications();
    }, [filters, pagination.page]);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const queryParams = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(filters.type !== 'all' && { type: filters.type }),
                ...(filters.priority !== 'all' && { priority: filters.priority }),
                ...(filters.read !== 'all' && { read: filters.read }),
                ...(filters.search && { search: filters.search })
            });

            const response = await fetch(`/api/notifications?${queryParams}`);
            if (response.ok) {
                const data = await response.json();
                setNotifications(data.notifications);
                setPagination(data.pagination);
                setUnreadCount(data.unreadCount);
            } else {
                toast.error('Failed to fetch notifications');
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
            toast.error('Error loading notifications');
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (notificationIds: string[] = []) => {
        try {
            setUpdating(true);
            const response = await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds })
            });

            if (response.ok) {
                await fetchNotifications();
                setSelectedNotifications([]);
                toast.success(notificationIds.length === 0 ? 'All notifications marked as read' : `${notificationIds.length} notification(s) marked as read`);
            } else {
                toast.error('Failed to update notifications');
            }
        } catch (error) {
            console.error('Error marking notifications as read:', error);
            toast.error('Failed to update notifications');
        } finally {
            setUpdating(false);
        }
    };

    const deleteNotifications = async (notificationIds: string[]) => {
        try {
            setUpdating(true);
            const response = await fetch('/api/notifications', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds })
            });

            if (response.ok) {
                await fetchNotifications();
                setSelectedNotifications([]);
                toast.success(`${notificationIds.length} notification(s) deleted`);
            } else {
                toast.error('Failed to delete notifications');
            }
        } catch (error) {
            console.error('Error deleting notifications:', error);
            toast.error('Failed to delete notifications');
        } finally {
            setUpdating(false);
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
            await markAsRead([notification._id]);
        }

        if (notification.actionUrl) {
            router.push(notification.actionUrl);
        }
    };

    const toggleSelectAll = () => {
        if (selectedNotifications.length === notifications.length) {
            setSelectedNotifications([]);
        } else {
            setSelectedNotifications(notifications.map(n => n._id));
        }
    };

    const toggleSelectNotification = (id: string) => {
        setSelectedNotifications(prev =>
            prev.includes(id)
                ? prev.filter(nId => nId !== id)
                : [...prev, id]
        );
    };

    const getNotificationIcon = (type: string, priority: string) => {
        const iconClass = cn(
            "h-5 w-5",
            priority === 'urgent' && "text-red-500",
            priority === 'high' && "text-orange-500",
            priority === 'medium' && "text-blue-500",
            priority === 'low' && "text-gray-500"
        );

        switch (type) {
            case 'order_created':
            case 'order_confirmed':
            case 'order_completed':
            case 'order_failed':
                return <Server className={iconClass} />;
            case 'payment_success':
            case 'payment_failed':
                return <CreditCard className={iconClass} />;
            case 'ticket_created':
            case 'ticket_updated':
            case 'ticket_replied':
            case 'ticket_resolved':
                return <MessageCircle className={iconClass} />;
            case 'announcement':
                return <Gift className={iconClass} />;
            case 'profile_updated':
                return <User className={iconClass} />;
            case 'server_action':
                return <Settings className={iconClass} />;
            case 'security_update':
                return <Shield className={iconClass} />;
            case 'login':
                return <Activity className={iconClass} />;
            default:
                return <Bell className={iconClass} />;
        }
    };

    const getPriorityBadge = (priority: string) => {
        const variants = {
            urgent: 'destructive',
            high: 'default',
            medium: 'secondary',
            low: 'outline'
        } as const;

        const colors = {
            urgent: 'bg-red-100 text-red-700 border-red-200',
            high: 'bg-orange-100 text-orange-700 border-orange-200',
            medium: 'bg-blue-100 text-blue-700 border-blue-200',
            low: 'bg-gray-100 text-gray-700 border-gray-200'
        };

        return (
            <Badge variant="outline" className={colors[priority as keyof typeof colors]}>
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
            </Badge>
        );
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
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
            announcement: 'Announcement',
            profile_updated: 'Profile Update',
            server_action: 'Server Action',
            security_update: 'Security',
            login: 'Login'
        };
        return typeLabels[type as keyof typeof typeLabels] || type;
    };

    return (
        <div className='min-h-screen bg-background'>
            {/* Mobile Header */}
            <div className="lg:hidden h-16" />

            {/* Header */}
          
            <div className='container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6'>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                    <Bell className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{pagination.total}</p>
                                    <p className="text-xs text-muted-foreground">Total</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                                    <Eye className="h-5 w-5 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{unreadCount}</p>
                                    <p className="text-xs text-muted-foreground">Unread</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                    <CheckCheck className="h-5 w-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{pagination.total - unreadCount}</p>
                                    <p className="text-xs text-muted-foreground">Read</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                                    <AlertCircle className="h-5 w-5 text-red-600" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">
                                        {notifications.filter(n => n.priority === 'urgent' || n.priority === 'high').length}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Priority</p>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Search</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search notifications..."
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
                                        <SelectItem value="ticket_created">Support</SelectItem>
                                        <SelectItem value="announcement">Announcements</SelectItem>
                                        <SelectItem value="payment_success">Payments</SelectItem>
                                        <SelectItem value="server_action">Server Actions</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Priority</label>
                                <Select value={filters.priority} onValueChange={(value) => setFilters({ ...filters, priority: value })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Priorities</SelectItem>
                                        <SelectItem value="urgent">Urgent</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Status</label>
                                <Select value={filters.read} onValueChange={(value) => setFilters({ ...filters, read: value })}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="false">Unread</SelectItem>
                                        <SelectItem value="true">Read</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Bulk Actions */}
                        {selectedNotifications.length > 0 && (
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                <span className="text-sm font-medium">
                                    {selectedNotifications.length} selected
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => markAsRead(selectedNotifications)}
                                        disabled={updating}
                                        className="gap-1"
                                    >
                                        <Check className="h-4 w-4" />
                                        Mark Read
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={updating}
                                                className="gap-1 text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Delete
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete Notifications</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to delete {selectedNotifications.length} notification(s)? This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => deleteNotifications(selectedNotifications)}
                                                    className="bg-red-600 hover:bg-red-700"
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Notifications List */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Bell className="h-5 w-5" />
                                All Notifications
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    checked={selectedNotifications.length === notifications.length && notifications.length > 0}
                                    onCheckedChange={toggleSelectAll}
                                />
                                <span className="text-sm text-muted-foreground">Select all</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <span className="ml-3 text-muted-foreground">Loading notifications...</span>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="text-center py-12">
                                <Bell className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                                <h3 className="text-lg font-semibold mb-2">No notifications found</h3>
                                <p className="text-muted-foreground mb-4">
                                    {Object.values(filters).some(f => f !== 'all' && f !== '')
                                        ? 'Try adjusting your filters to see more notifications.'
                                        : 'You\'re all caught up! New notifications will appear here.'
                                    }
                                </p>
                                {Object.values(filters).some(f => f !== 'all' && f !== '') && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setFilters({
                                            type: 'all',
                                            priority: 'all',
                                            read: 'all',
                                            search: '',
                                            dateRange: 'all'
                                        })}
                                    >
                                        Clear Filters
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification._id}
                                        className={cn(
                                            "flex items-start gap-4 p-4 rounded-lg shadow dark:shadow-white transition-all duration-200 hover:bg-muted/50",
                                            !notification.read && "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
                                            notification.actionUrl && "cursor-pointer"
                                        )}
                                        onClick={() => notification.actionUrl && handleNotificationClick(notification)}
                                    >
                                        <Checkbox
                                            checked={selectedNotifications.includes(notification._id)}
                                            onCheckedChange={() => toggleSelectNotification(notification._id)}
                                            onClick={(e) => e.stopPropagation()}
                                        />

                                        <div className="flex-shrink-0 mt-1">
                                            {getNotificationIcon(notification.type, notification.priority)}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <h3 className={cn(
                                                        "font-semibold truncate",
                                                        !notification.read && "text-foreground"
                                                    )}>
                                                        {notification.title}
                                                    </h3>
                                                    {!notification.read && (
                                                        <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {getPriorityBadge(notification.priority)}
                                                    <Badge variant="outline" className="text-xs">
                                                        {getTypeLabel(notification.type)}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                                {notification.message}
                                            </p>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {formatDate(notification.createdAt)}
                                                    </span>
                                                    {notification.read && notification.readAt && (
                                                        <span className="flex items-center gap-1">
                                                            <Eye className="h-3 w-3" />
                                                            Read {formatDate(notification.readAt)}
                                                        </span>
                                                    )}
                                                </div>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        {!notification.read ? (
                                                            <DropdownMenuItem onClick={() => markAsRead([notification._id])}>
                                                                <Check className="h-4 w-4 mr-2" />
                                                                Mark as read
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem onClick={() => {
                                                                // Mark as unread logic would go here
                                                            }}>
                                                                <EyeOff className="h-4 w-4 mr-2" />
                                                                Mark as unread
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => deleteNotifications([notification._id])}
                                                            className="text-red-600 hover:text-red-700"
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        {pagination.pages > 1 && (
                            <div className="flex items-center justify-between mt-6 pt-4 border-t">
                                <div className="text-sm text-muted-foreground">
                                    Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} notifications
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

export default NotificationsPage;
