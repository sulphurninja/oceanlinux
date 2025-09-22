'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Check, X, Eye, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Notification {
    _id: string;
    type: string;
    title: string;
    message: string;
    data: any;
    read: boolean;
    createdAt: string;
    actionUrl?: string;
    icon: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
}

const NotificationBell = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        fetchNotifications();
        // Poll for new notifications every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/notifications?limit=10');
            if (response.ok) {
                const data = await response.json();
                setNotifications(data.notifications);
                setUnreadCount(data.unreadCount);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (notificationIds: string[] = []) => {
        try {
            const response = await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationIds })
            });

            if (response.ok) {
                fetchNotifications(); // Refresh notifications
            }
        } catch (error) {
            console.error('Error marking notifications as read:', error);
            toast.error('Failed to update notifications');
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
            await markAsRead([notification._id]);
        }

        if (notification.actionUrl) {
            router.push(notification.actionUrl);
        }
        setIsOpen(false);
    };

    const getNotificationIcon = (iconName: string, priority: string) => {
        const iconClass = cn(
            "h-4 w-4",
            priority === 'urgent' && "text-red-500",
            priority === 'high' && "text-orange-500",
            priority === 'medium' && "text-blue-500",
            priority === 'low' && "text-gray-500"
        );

        // You can expand this with more icons based on the iconName
        return <Bell className={iconClass} />;
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
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
    };

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative  border border-primary/30 rounded-full h-10 w-10"
                >
                    <Bell className="h-5 w-5  dark:text-white" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                        >
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-80 md:w-96 max-h-96 overflow-y-scroll"
            >
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead()}
                            className="text-xs h-6 px-2"
                        >
                            Mark all read
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <ScrollArea className="h-72">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">No notifications yet</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {notifications.map((notification) => (
                                <DropdownMenuItem
                                    key={notification._id}
                                    className={cn(
                                        "flex items-start gap-3 p-3 cursor-pointer",
                                        !notification.read && "bg-blue-50 dark:bg-blue-950/30"
                                    )}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="flex-shrink-0 mt-1">
                                        {getNotificationIcon(notification.icon, notification.priority)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm truncate">
                                                {notification.title}
                                            </p>
                                            {!notification.read && (
                                                <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formatTimeAgo(notification.createdAt)}
                                        </p>
                                    </div>
                                    {notification.actionUrl && (
                                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-1" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="text-center justify-center"
                    onClick={() => {
                        router.push('/dashboard/notifications');
                        setIsOpen(false);
                    }}
                >
                    <span className="text-sm text-primary">View all notifications</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default NotificationBell;
