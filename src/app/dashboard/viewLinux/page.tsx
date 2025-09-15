"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Copy,
    CheckCircle,
    XCircle,
    Computer,
    RefreshCw,
    Shield,
    Calendar,
    Network,
    Activity,
    Check,
    Terminal,
    Play,
    Square,
    PowerCircle,
    KeyRound,
    LayoutTemplate,
    AlertTriangle,
    Settings,
    Globe,
    Loader2,
    Database,
    MemoryStick,
    Search,
    X,
    CreditCard,
    Clock,
    User,
    Server
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Order {
    _id: string;
    productName: string;
    os: string;
    memory: string;
    status: string;
    price: number;
    ipAddress?: string;
    username?: string;
    password?: string;
    expiryDate?: Date;
    createdAt?: Date;
    provider?: 'hostycare' | 'smartvps';
    hostycareServiceId?: string;
    smartvpsServiceId?: string;
    provisioningStatus?: string;
    lastAction?: string;
    lastActionTime?: Date;
    lastSyncTime?: Date;
    renewalPayments?: Array<{
        paymentId: string;
        amount: number;
        paidAt: Date;
        previousExpiry: Date;
        newExpiry: Date;
        renewalTxnId: string;
    }>;
}

// OS Icon Component
const OSIcon = ({ os, className = "h-8 w-8" }: { os: string; className?: string }) => {
    const osLower = os.toLowerCase();

    if (osLower.includes('ubuntu')) {
        return (
            <div className={`${className} rounded-lg flex items-center justify-center shadow-sm`}>
                <img src='/ubuntu.png' className={`${className} rounded-lg object-cover`} alt={os} />
            </div>
        );
    } else if (osLower.includes('centos')) {
        return (
            <div className={`${className} rounded-lg flex items-center justify-center shadow-sm`}>
                <img src='/centos.png' className={`${className} rounded-lg object-cover`} alt={os} />
            </div>
        );
    } else if (osLower.includes('windows')) {
        return (
            <div className={`${className} rounded-lg flex items-center justify-center shadow-sm`}>
                <img src='/windows.png' className={`${className} rounded-lg object-cover`} alt={os} />
            </div>
        );
    } else {
        return (
            <div className={`${className} bg-gray-500 rounded-lg flex items-center justify-center text-white shadow-sm`}>
                <Computer className="h-5 w-5" />
            </div>
        );
    }
};

function styleText(content: string) {
    const regex = /(\([^)]*\)|[a-zA-Z]+)/g;
    return content.split(regex).map((part, index) => {
        if (part.match(/\([^)]*\)/) || part.match(/[a-zA-Z]/)) {
            return <span key={index} className="text-primary font-semibold">{part}</span>;
        } else {
            return part;
        }
    });
}

const ViewLinux = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionBusy, setActionBusy] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/orders/me');
            if (!response.ok) throw new Error('Failed to fetch orders');
            const data = await response.json();
            setOrders(data);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
            router.push('/login');
        } finally {
            setLoading(false);
        }
    };

    // Filter orders based on search query
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredOrders(orders);
        } else {
            const filtered = orders.filter(order => {
                const query = searchQuery.toLowerCase();
                return (
                    order.ipAddress?.toLowerCase().includes(query) ||
                    order.productName.toLowerCase().includes(query) ||
                    order.os.toLowerCase().includes(query) ||
                    order.username?.toLowerCase().includes(query) ||
                    (order.provider && order.provider.toLowerCase().includes(query))
                );
            });
            setFilteredOrders(filtered);
        }
    }, [orders, searchQuery]);

    const clearSearch = () => {
        setSearchQuery('');
    };

    const getDaysUntilExpiry = (expiryDate: Date | string | null | undefined) => {
        if (!expiryDate) return 0;
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    const isRenewalEligible = (order: Order | null) => {
        if (!order || !order.expiryDate) return false;
        const daysLeft = getDaysUntilExpiry(order.expiryDate);
        return daysLeft <= 30 && daysLeft >= -7;
    };

    const isExpired = (order: Order | null) => {
        if (!order || !order.expiryDate) return false;
        return getDaysUntilExpiry(order.expiryDate) < 0;
    };

    const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string) => {
        if (status.toLowerCase() === 'completed') {
            return (
                <Badge className="bg-green-50 text-green-700 border dark:border-none-green-200">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    Active
                </Badge>
            );
        }

        const currentStatus = provisioningStatus || status;

        switch (currentStatus.toLowerCase()) {
            case 'active':
                return (
                    <Badge className="bg-green-50 text-green-700 border dark:border-none-green-200">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        Active
                    </Badge>
                );
            case 'pending':
                return (
                    <Badge className="bg-amber-50 text-amber-700 border dark:border-none-amber-200">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                    </Badge>
                );
            case 'provisioning':
                return (
                    <Badge className="bg-amber-50 text-amber-700 border dark:border-none-amber-200">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Provisioning
                    </Badge>
                );
            case 'suspended':
                return (
                    <Badge className="bg-orange-50 text-orange-700 border dark:border-none-orange-200">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Suspended
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge className="bg-red-50 text-red-700 border dark:border-none-red-200">
                        <XCircle className="w-3 h-3 mr-1" />
                        Failed
                    </Badge>
                );
            case 'terminated':
                return (
                    <Badge className="bg-red-50 text-red-700 border dark:border-none-red-200">
                        <XCircle className="w-3 h-3 mr-1" />
                        Terminated
                    </Badge>
                );
            default:
                return (
                    <Badge variant="secondary" className="bg-gray-50 text-gray-700">
                        <Shield className="w-3 h-3 mr-1" />
                        {currentStatus}
                    </Badge>
                );
        }
    };

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className='min-h-screen bg-background'>
            {/* Header */}
            <div className='sticky top-0 z-40 border dark:border-none-b bg-background/95 backdrop-blur'>
                <div className='flex h-16 items-center justify-between px-4 lg:px-6'>
                    <div className='flex items-center gap-4'>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.back()}
                            className="hover:bg-muted/80"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className='flex items-center gap-3'>
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                <Server className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <h1 className='text-xl font-bold'>Server Management</h1>
                                <p className="text-sm text-muted-foreground">Manage your servers</p>
                            </div>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={fetchOrders}
                        disabled={loading}
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className='container mx-auto max-w-5xl p-4 lg:p-6'>
                {/* Search Section */}
                {!loading && orders.length > 0 && (
                    <div className="mb-6">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                            <Input
                                placeholder="Search by IP, name, OS, username, or provider..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 pr-10"
                            />
                            {searchQuery && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearSearch}
                                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted/80"
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                        {searchQuery && (
                            <p className="text-sm text-muted-foreground mt-2">
                                {filteredOrders.length} of {orders.length} servers match "{searchQuery}"
                            </p>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center items-center py-16">
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="animate-spin h-8 w-8 text-primary" />
                            <p className="text-muted-foreground">Loading your servers...</p>
                        </div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
                            <Server className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No servers found</h3>
                        <p className="text-muted-foreground mb-6">
                            Get started by ordering your first Linux server.
                        </p>
                        <Button onClick={() => router.push('/dashboard/ipStock')} className="gap-2">
                            <Server className="h-4 w-4" />
                            Browse Plans
                        </Button>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-20 h-20 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center">
                            <Search className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No servers match your search</h3>
                        <p className="text-muted-foreground mb-6">
                            Try adjusting your search terms or clearing the filter.
                        </p>
                        <Button variant="outline" onClick={clearSearch} className="gap-2">
                            <X className="h-4 w-4" />
                            Clear Search
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredOrders.map((order) => (
                            <Card
                                key={order._id}
                                className="hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => router.push(`/dashboard/order/${order._id}`)}
                            >
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <OSIcon os={order.os} className="h-12 w-12 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-lg truncate">
                                                    {styleText(order.productName)}
                                                </h3>
                                                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Terminal className="h-3 w-3" />
                                                        {order.os}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <MemoryStick className="h-3 w-3" />
                                                        {order.memory}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Database className="h-3 w-3" />
                                                        {order.provider === 'smartvps' ? 'SmartVPS' : 'Hostycare'}
                                                    </span>
                                                    {order.ipAddress && (
                                                        <span className="flex items-center gap-1">
                                                            <Network className="h-3 w-3" />
                                                            {order.ipAddress}
                                                        </span>
                                                    )}
                                                    {order.lastActionTime && (
                                                        <span className="flex items-center gap-1 text-xs">
                                                            <Clock className="h-3 w-3" />
                                                            Last: {formatDate(order.lastActionTime)}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Add expiry indicator on order cards */}
                                                {order.expiryDate && (
                                                    <div className="mt-2">
                                                        {isExpired(order) ? (
                                                            <Badge variant="destructive" className="text-xs">
                                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                                Expired {Math.abs(getDaysUntilExpiry(order.expiryDate))} days ago
                                                            </Badge>
                                                        ) : getDaysUntilExpiry(order.expiryDate) <= 7 ? (
                                                            <Badge variant="outline" className="text-xs border dark:border-none-amber-200 text-amber-700">
                                                                <Clock className="h-3 w-3 mr-1" />
                                                                Expires in {getDaysUntilExpiry(order.expiryDate)} days
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(order.status, order.provisioningStatus, order.lastAction)}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/dashboard/order/${order._id}`);
                                                }}
                                                className="gap-2"
                                            >
                                                <Settings className="h-4 w-4" />
                                                Manage
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ViewLinux;
