'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Strip HTML so broken <img> tags don't float in the dropdown */
function plainNotificationText(text: string): string {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const NotificationBell = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        fetchNotifications();
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
                fetchNotifications();
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

    const getNotificationIcon = (priority: string) => {
        const iconClass = cn(
            "h-4 w-4 flex-shrink-0",
            priority === 'urgent' && "text-destructive",
            priority === 'high' && "text-emerald-600 dark:text-emerald-400",
            (priority === 'medium' || priority === 'low') && "text-muted-foreground"
        );

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
                    className="premium-dashboard-icon-btn relative"
                    aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-[17px] min-w-[17px] px-0.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-semibold border-2 border-background shadow-sm">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-[min(380px,calc(100vw-1.5rem))] p-0 premium-dashboard-dropdown premium-notification-panel"
                sideOffset={8}
            >
                <div className="premium-notification-header flex items-center justify-between p-4">
                    <h3 className="font-semibold text-base premium-dropdown-name">Notifications</h3>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                markAsRead();
                            }}
                            className="h-8 text-xs gap-1.5 premium-notification-action"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Mark all read
                        </Button>
                    )}
                </div>

                <div className="premium-notification-scroll max-h-[420px] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 border premium-notification-empty-icon">
                                <Bell className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium premium-dropdown-name">No notifications yet</p>
                            <p className="text-xs premium-dropdown-email mt-1 text-center">We&apos;ll notify you when something arrives</p>
                        </div>
                    ) : (
                        <div className="divide-y premium-notification-divide">
                            {notifications.map((notification) => {
                                const message = plainNotificationText(notification.message);
                                return (
                                <div
                                    key={notification._id}
                                    className={cn(
                                        "premium-notification-item flex items-start gap-3 p-4 cursor-pointer transition-colors",
                                        !notification.read && "premium-notification-item--unread"
                                    )}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="flex-shrink-0 mt-0.5">
                                        {getNotificationIcon(notification.priority)}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-semibold text-sm leading-tight premium-dropdown-name">
                                                {notification.title}
                                            </p>
                                            {!notification.read && (
                                                <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-1.5"></div>
                                            )}
                                        </div>
                                        {message ? (
                                            <p className="text-xs premium-dropdown-email line-clamp-2 leading-relaxed">
                                                {message}
                                            </p>
                                        ) : null}
                                        <div className="flex items-center gap-2 text-xs premium-dropdown-email pt-0.5">
                                            <span>{formatTimeAgo(notification.createdAt)}</span>
                                            {notification.actionUrl && (
                                                <>
                                                    <span className="opacity-40">•</span>
                                                    <span className="premium-notification-link flex items-center gap-1">
                                                        View
                                                        <ExternalLink className="h-3 w-3" />
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    )}
                </div>

                <div className="premium-notification-footer border-t">
                    <button
                        type="button"
                        className="w-full p-3 text-center text-sm font-medium premium-notification-link hover:bg-emerald-500/5 transition-colors"
                        onClick={() => {
                            router.push('/dashboard/notifications');
                            setIsOpen(false);
                        }}
                    >
                        View all notifications
                    </button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default NotificationBell;
