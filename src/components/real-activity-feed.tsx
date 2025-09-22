'use client';

import React, { useState, useEffect } from 'react';
import {
    User,
    Server,
    Shield,
    Activity,
    CreditCard,
    MessageCircle,
    Settings,
    Bell,
    CheckCircle,
    XCircle,
    Clock,
    Loader2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface ActivityItem {
    _id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    status?: 'success' | 'failed' | 'pending';
    metadata?: any;
}

const RealActivityFeed = ({ userId }: { userId: string }) => {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchActivities();
    }, [userId]);

    const fetchActivities = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/users/activity');
            if (response.ok) {
                const data = await response.json();
                setActivities(data.activities);
            }
        } catch (error) {
            console.error('Error fetching activities:', error);
        } finally {
            setLoading(false);
        }
    };

    const getActivityIcon = (type: string, status?: string) => {
        const iconClass = cn(
            "h-4 w-4",
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

        switch (status) {
            case 'success':
                return <Badge variant="outline" className="text-green-600 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
            case 'failed':
                return <Badge variant="outline" className="text-red-600 border-red-200"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
            case 'pending':
                return <Badge variant="outline" className="text-yellow-600 border-yellow-200"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
            default:
                return null;
        }
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

    const handleActivityClick = (activity: ActivityItem) => {
        // Navigate based on activity type
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
            default:
                // Do nothing for non-navigable activities
                break;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading activity...</span>
            </div>
        );
    }

    if (activities.length === 0) {
        return (
            <div className="text-center py-8">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="font-semibold mb-2">No Recent Activity</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Your account activity will appear here as you use our services.
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/dashboard/ipStock')}
                >
                    Get Started
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {activities.map((activity, index) => (
                <div
                    key={activity._id || index}
                    className={cn(
                        "flex items-start gap-4 p-4 rounded-lg shadow-sm border border-primary/30  transition-colors",
                        activity.metadata?.clickable !== false && "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={() => activity.metadata?.clickable !== false && handleActivityClick(activity)}
                >
                    <div className={cn(
                        "w-10 h-10 rounded-full bg-background flex items-center justify-center border-2",
                        activity.status === 'success' && "border-green-200 bg-green-50 dark:bg-green-950/30",
                        activity.status === 'failed' && "border-red-200 bg-red-50 dark:bg-red-950/30",
                        activity.status === 'pending' && "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30",
                        !activity.status && "border-blue-200 bg-blue-50 dark:bg-blue-950/30"
                    )}>
                        {getActivityIcon(activity.type, activity.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <h4 className="font-semibold text-sm">{activity.title}</h4>
                            <div className="flex items-center gap-2">
                                {getStatusBadge(activity.status)}
                                <span className="text-xs text-muted-foreground">
                                    {formatDate(activity.timestamp)}
                                </span>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{activity.description}</p>

                        {/* Show additional metadata if available */}
                        {activity.metadata && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {activity.metadata.orderId && (
                                    <Badge variant="outline" className="text-xs">
                                        Order: {activity.metadata.orderId.slice(-8)}
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
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {activities.length >= 10 && (
                <div className="text-center pt-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push('/dashboard/activity')}
                    >
                        View All Activity
                    </Button>
                </div>
            )}
        </div>
    );
};

export default RealActivityFeed;
