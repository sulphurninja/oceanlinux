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
    Server,
    Filter,
    SlidersHorizontal,
    LifeBuoy,
    ExternalLink,
    XIcon
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
    provider?: 'hostycare' | 'smartvps' | 'oceanlinux';
    hostycareServiceId?: string;
    smartvpsServiceId?: string;
    provisioningStatus?: string;
    lastAction?: string;
    lastActionTime?: Date;
    lastSyncTime?: Date;
    ipStockId?: string;
    renewalPayments?: Array<{
        paymentId: string;
        amount: number;
        paidAt: Date;
        previousExpiry: Date;
        newExpiry: Date;
        renewalTxnId: string;
    }>;
}

interface IPStock {
    _id: string;
    name: string;
    tags: string[];
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
            return <span key={index} className="text font-semibold">{part}</span>;
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

    // Filter states
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [activeTab, setActiveTab] = useState<string>('all');

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

    const getDaysUntilExpiry = (expiryDate: Date | string | null | undefined) => {
        if (!expiryDate) return 0;
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };


    // Get provider display name
    const getProviderDisplayName = (order: Order): string => {
        // Check explicit provider field first
        if (order.provider) {
            switch (order.provider) {
                case 'smartvps':
                    return 'SmartVPS';
                case 'hostycare':
                    return 'Hostycare';
                case 'oceanlinux':
                    return 'OceanLinux';
                default:
                    return order.provider.charAt(0).toUpperCase() + order.provider.slice(1);
            }
        }

        // Fallback logic based on service IDs or patterns
        if (order.hostycareServiceId) {
            return 'Hostycare';
        }
        if (order.smartvpsServiceId) {
            return 'SmartVPS';
        }
        if (order.productName.includes('103.195') || order.ipAddress?.startsWith('103.195') || order.productName.includes('🏅')) {
            return 'SmartVPS';
        }

        return 'OceanLinux';
    };



    // Get server status for filtering

    // Get server status for filtering
    // Get server status for filtering
    const getServerStatus = (order: Order): 'active' | 'expired' | 'pending' | 'failed' => {
        const currentStatus = order.provisioningStatus || order.status;

        // Check if expired first
        if (order.expiryDate && getDaysUntilExpiry(order.expiryDate) < 0) {
            return 'expired';
        }

        // Check for active states
        if (currentStatus.toLowerCase() === 'completed' || currentStatus.toLowerCase() === 'active') {
            return 'active';
        }

        // 🆕 NEW: Check if this is a non-auto-provisioned service first
        const provider = getProviderDisplayName(order);
        const isAutoProvisionedProvider = provider === 'Hostycare' || provider === 'SmartVPS';

        // For non-auto-provisioned services, they should be pending unless explicitly active
        if (!isAutoProvisionedProvider) {
            // Only consider it failed if it's explicitly marked as terminated or has a real API failure
            if (currentStatus.toLowerCase() === 'terminated' ||
                (currentStatus.toLowerCase() === 'failed' &&
                    order.provisioningError &&
                    !order.provisioningError.includes('CONFIG:') &&
                    !order.provisioningError.includes('Missing hostycareProductId') &&
                    !order.provisioningError.includes('Memory configuration not found') &&
                    !order.provisioningError.includes('lacks hostycareProductId'))) {
                return 'failed';
            }
            // All other non-auto-provisioned services should be pending (awaiting manual setup)
            return 'pending';
        }

        // For auto-provisioned services, continue with existing logic

        // 🆕 Special handling for configuration errors - these should be pending, not failed
        if (order.provisioningError &&
            (order.provisioningError.includes('Missing hostycareProductId') ||
                order.provisioningError.includes('CONFIG:') ||
                order.provisioningError.includes('Memory configuration not found') ||
                order.provisioningError.includes('lacks hostycareProductId'))) {
            return 'pending';
        }

        // Check for explicitly failed states (actual API failures, not config issues)
        if (currentStatus.toLowerCase() === 'failed' || currentStatus.toLowerCase() === 'terminated') {
            // But if it's just a config issue, treat as pending
            if (order.provisioningError && order.provisioningError.includes('CONFIG:')) {
                return 'pending';
            }
            return 'failed';
        }

        // Check for pending/provisioning states
        if (currentStatus.toLowerCase() === 'pending' ||
            currentStatus.toLowerCase() === 'provisioning' ||
            currentStatus.toLowerCase() === 'confirmed') {
            return 'pending';
        }

        // Default to pending for unknown states on auto-provisioned providers
        return 'pending';
    };

    // Filter orders based on search query, status filter, and tab
    useEffect(() => {
        let filtered = orders;

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(order =>
                order.ipAddress?.toLowerCase().includes(query) ||
                order.productName.toLowerCase().includes(query) ||
                order.os.toLowerCase().includes(query) ||
                order.username?.toLowerCase().includes(query) ||
                (order.provider && order.provider.toLowerCase().includes(query))
            );
        }

        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(order => getServerStatus(order) === statusFilter);
        }

        // Apply tab filter (this is now the status-based tab)
        if (activeTab !== 'all') {
            filtered = filtered.filter(order => getServerStatus(order) === activeTab);
        }

        setFilteredOrders(filtered);
    }, [orders, searchQuery, statusFilter, activeTab]);

    // Get counts for tabs
    const getCounts = () => {
        const all = orders.length;
        const active = orders.filter(order => getServerStatus(order) === 'active').length;
        const expired = orders.filter(order => getServerStatus(order) === 'expired').length;
        const pending = orders.filter(order => getServerStatus(order) === 'pending').length;
        const failed = orders.filter(order => getServerStatus(order) === 'failed').length;

        return { all, active, expired, pending, failed };
    };

    const counts = getCounts();

    const clearSearch = () => {
        setSearchQuery('');
    };

    const clearFilters = () => {
        setSearchQuery('');
        setStatusFilter('all');
        setActiveTab('all');
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

const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string, order?: Order) => {
    if (status.toLowerCase() === 'completed') {
        return (
            <Badge className="bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Active
            </Badge>
        );
    }

    const currentStatus = provisioningStatus || status;

    // 🆕 NEW: Check if this is a non-auto-provisioned service
    const provider = order ? getProviderDisplayName(order) : 'Unknown';
    const isAutoProvisionedProvider = provider === 'Hostycare' || provider === 'SmartVPS';

    // For non-auto-provisioned services, show appropriate pending status
    if (!isAutoProvisionedProvider) {
        if (currentStatus.toLowerCase() === 'terminated') {
            return (
                <Badge className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                    <XCircle className="w-3 h-3 mr-1" />
                    Terminated
                </Badge>
            );
        }
        // All other states for non-auto-provisioned should show as awaiting manual setup
        return (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                <User className="w-3 h-3 mr-1" />
                Awaiting Manual Setup
            </Badge>
        );
    }

    // Rest of the existing logic for auto-provisioned services...

    // 🆕 Check for configuration errors first
    if (order?.provisioningError &&
        (order.provisioningError.includes('Missing hostycareProductId') ||
            order.provisioningError.includes('CONFIG:') ||
            order.provisioningError.includes('Memory configuration not found') ||
            order.provisioningError.includes('lacks hostycareProductId'))) {
        return (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                <Settings className="w-3 h-3 mr-1" />
                Awaiting Config
            </Badge>
        );
    }

    switch (currentStatus.toLowerCase()) {
        case 'active':
            return (
                <Badge className="bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    Active
                </Badge>
            );
        case 'pending':
        case 'confirmed':
            return (
                <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending Setup
                </Badge>
            );
        case 'provisioning':
            return (
                <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Provisioning
                </Badge>
            );
        case 'suspended':
            return (
                <Badge className="bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Suspended
                </Badge>
            );
        case 'failed':
            // Double-check for config errors even in failed status
            if (order?.provisioningError && order.provisioningError.includes('CONFIG:')) {
                return (
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                        <Settings className="w-3 h-3 mr-1" />
                        Awaiting Config
                    </Badge>
                );
            }
            return (
                <Badge className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                    <XCircle className="w-3 h-3 mr-1" />
                    Failed
                </Badge>
            );
        case 'terminated':
            return (
                <Badge className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                    <XCircle className="w-3 h-3 mr-1" />
                    Terminated
                </Badge>
            );
        default:
            // Enhanced default case for auto-provisioned services
            const isManualOrder = !lastAction || lastAction.includes('manual');
            if (isManualOrder || currentStatus.toLowerCase() === 'confirmed') {
                return (
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                        <Clock className="w-3 h-3 mr-1" />
                        Awaiting Setup
                    </Badge>
                );
            }

            return (
                <Badge variant="secondary" className="bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300">
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
            {/* Mobile Header */}
            <div className="lg:hidden h-16" />

            {/* Responsive Header with proper mobile spacing */}
            <div className='sticky md:hidden  lg:top-0 z-40 bg-background/95 backdrop-blur-sm shadow-sm border-b border-border'>
                <div className='container mx-auto -mt-14 md:mt-0 px-3 sm:px-4 md:px-6 lg:px-8'>
                    <div className='flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4'>
                        <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.back()}
                                className="hover:bg-muted rounded-full flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10"
                            >
                                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                            <div className='flex items-center gap-2 sm:gap-3 min-w-0 flex-1'>
                                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Server className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h1 className='text-base sm:text-lg lg:text-xl font-bold'>Server Management</h1>
                                    <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">Manage your servers</p>
                                </div>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3 flex-shrink-0"
                            onClick={fetchOrders}
                            disabled={loading}
                        >
                            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline text-xs sm:text-sm">Refresh</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content with responsive container */}
            <div className='container mx-auto  px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6'>
                {/* Search and Filters Section - Enhanced */}
                {!loading && orders.length > 0 && (
                    <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
                            {/* Search Bar */}
                            <div className="relative flex-1 max-w-full ">
                                <Search className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                <Input
                                    placeholder="Search servers..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-8 sm:pl-10 w-full pr-8 sm:pr-10 h-9 sm:h-10 text-sm"
                                />
                                {searchQuery && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearSearch}
                                        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted/80"
                                    >
                                        <XIcon className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>

                            {/* Status Filter */}
                            <div className="flex gap-2">
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-32 sm:w-36 h-9 sm:h-10 text-xs sm:text-sm">
                                        <Filter className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="expired">Expired</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Clear Filters Button */}
                                {(searchQuery || statusFilter !== 'all' || activeTab !== 'all') && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={clearFilters}
                                        className="h-9 sm:h-10 px-2 sm:px-3 text-xs sm:text-sm flex-shrink-0"
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Show filter summary */}
                        {(searchQuery || statusFilter !== 'all') && (
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                {filteredOrders.length} of {orders.length} servers
                                {searchQuery && ` matching "${searchQuery}"`}
                                {statusFilter !== 'all' && ` with status "${statusFilter}"`}
                            </p>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center items-center py-12 sm:py-16 min-h-[50vh]">
                        <div className="flex flex-col items-center gap-3 sm:gap-4">
                            <div className="relative">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/20 rounded-full animate-pulse"></div>
                                <Loader2 className="absolute inset-0 m-auto animate-spin h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                            </div>
                            <p className="text-muted-foreground text-sm sm:text-base font-medium">Loading your servers...</p>
                        </div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-12 sm:py-16 px-4 min-h-[50vh] flex flex-col justify-center">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
                            <Server className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg sm:text-xl font-semibold mb-2">No servers found</h3>
                        <p className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
                            Get started by ordering your first Linux server.
                        </p>
                        <Button onClick={() => router.push('/dashboard/ipStock')} className="gap-2 mx-auto" size="sm">
                            <Server className="h-4 w-4" />
                            Browse Plans
                        </Button>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
                        {/* Enhanced Tab Navigation with Counts */}
                        <div className="flex justify-center overflow-x-auto scrollbar-hide">
                            <TabsList className="grid grid-cols-5 h-fit w-fit min-w-0">
                                <TabsTrigger value="all" className="flex items-center h- gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <Server className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>All</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.all}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="active" className="flex items-center gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>Active</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.active}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="expired" className="flex items-center gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>Expired</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.expired}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="pending" className="flex items-center gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>Pending</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.pending}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="failed" className="flex items-center gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <XCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>Failed</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.failed}
                                    </Badge>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value={activeTab} className="mt-4 sm:mt-6">
                            {filteredOrders.length === 0 ? (
                                <div className="text-center py-12 sm:py-16 px-4 min-h-[50vh] flex flex-col justify-center">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
                                        {activeTab === 'failed' ? (
                                            <XCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        ) : activeTab === 'pending' ? (
                                            <Clock className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        ) : activeTab === 'expired' ? (
                                            <Calendar className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        ) : activeTab === 'active' ? (
                                            <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        ) : (
                                            <Search className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        )}
                                    </div>
                                    <h3 className="text-lg sm:text-xl font-semibold mb-2">
                                        {searchQuery || statusFilter !== 'all'
                                            ? "No servers match your criteria"
                                            : `No ${activeTab === 'all' ? 'servers' : activeTab + ' servers'} found`
                                        }
                                    </h3>
                                    <p className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
                                        {searchQuery || statusFilter !== 'all'
                                            ? "Try adjusting your search terms or filters."
                                            : activeTab === 'failed'
                                                ? "No failed servers found. All systems are running smoothly!"
                                                : activeTab === 'pending'
                                                    ? "No pending servers. All orders have been processed!"
                                                    : activeTab === 'expired'
                                                        ? "No expired servers. All your services are up to date!"
                                                        : activeTab === 'active'
                                                            ? "No active servers. Order a new server to get started!"
                                                            : "No servers found."
                                        }
                                    </p>
                                    <div className="flex gap-2 justify-center">
                                        {(searchQuery || statusFilter !== 'all' || activeTab !== 'all') && (
                                            <Button variant="outline" onClick={clearFilters} className="gap-2" size="sm">
                                                <XIcon className="h-4 w-4" />
                                                Clear Filters
                                            </Button>
                                        )}
                                        {activeTab === 'active' && (
                                            <Button onClick={() => router.push('/dashboard/ipStock')} className="gap-2" size="sm">
                                                <Server className="h-4 w-4" />
                                                Browse Plans
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 sm:space-y-4 pb-4 sm:pb-6">
                                    {/* Special notice for failed tab */}
                                    {activeTab === 'failed' && filteredOrders.length > 0 && (
                                        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
                                            <CardContent className="p-3 sm:p-4">
                                                <div className="flex items-start gap-3">
                                                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-red-800 dark:text-red-200 mb-1">Server Issues Detected</h4>
                                                        <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                                                            Some of your servers have encountered issues. Our technical team can help resolve these problems.
                                                        </p>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => router.push('/support/tickets')}
                                                            className="gap-2 bg-red-500 text-white border-red-200 hover:bg-red-100 dark:border-red-800 dark:text-white -300 dark:hover:bg-red-950/50"
                                                        >
                                                            <LifeBuoy className="h-4 w-4" />
                                                            Create Support Ticket
                                                            <ExternalLink className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {filteredOrders.map((order) => (
                                        <Card
                                            key={order._id}
                                            className="hover:shadow-md transition-shadow cursor-pointer border-0 shadow-lg scale-90 bg-card"
                                            onClick={() => router.push(`/dashboard/order/${order._id}`)}
                                        >
                                            <CardContent className="p-3 sm:p-4 lg:p-6">
                                                {/* Mobile Layout - Completely responsive */}
                                                <div className="block lg:hidden space-y-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                                            <OSIcon os={order.os} className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-semibold text-sm sm:text-base leading-tight break-words">
                                                                    {styleText(order.productName)}
                                                                </h3>
                                                                <div className="flex items-center gap-1 sm:gap-2 mt-1 flex-wrap">
                                                                    <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                                                        {getProviderDisplayName(order)}
                                                                    </Badge>
                                                                    {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                        <div className="flex items-center gap-1.5">
                                                            <Terminal className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate">{order.os}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <MemoryStick className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate">{order.memory}</span>
                                                        </div>
                                                        {order.ipAddress && (
                                                            <div className="flex items-center gap-1.5 xs:col-span-2">
                                                                <Network className="h-3 w-3 flex-shrink-0" />
                                                                <span className="truncate font-mono text-xs">{order.ipAddress}</span>
                                                            </div>
                                                        )}
                                                        {order.createdAt && (
                                                            <div className="flex items-center gap-1.5 xs:col-span-2">
                                                                <Calendar className="h-3 w-3 flex-shrink-0" />
                                                                <span className="truncate">Created {formatDate(order.createdAt)}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Expiry indicator on mobile - Responsive */}
                                                    {order.expiryDate && (
                                                        <div className="border-t border-border pt-2">
                                                            {isExpired(order) ? (
                                                                <Badge variant="destructive" className="text-xs w-full justify-center py-1 h-6">
                                                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                                                    Expired {Math.abs(getDaysUntilExpiry(order.expiryDate))} days ago
                                                                </Badge>
                                                            ) : getDaysUntilExpiry(order.expiryDate) <= 7 ? (
                                                                <Badge variant="outline" className="text-xs w-full justify-center py-1 h-6 border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                                    <Clock className="h-3 w-3 mr-1" />
                                                                    Expires in {getDaysUntilExpiry(order.expiryDate)} days
                                                                </Badge>
                                                            ) : getDaysUntilExpiry(order.expiryDate) <= 30 ? (
                                                                <Badge variant="outline" className="text-xs w-full justify-center py-1 h-6 border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300">
                                                                    <Calendar className="h-3 w-3 mr-1" />
                                                                    Expires {formatDate(order.expiryDate)}
                                                                </Badge>
                                                            ) : null}
                                                        </div>
                                                    )}

                                                    <div className="border-t border-border pt-2">
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    router.push(`/dashboard/order/${order._id}`);
                                                                }}
                                                                className="flex-1 gap-1 sm:gap-2 h-8 sm:h-9"
                                                            >
                                                                <Settings className="h-3 w-3" />
                                                                <span className="text-xs">Manage</span>
                                                            </Button>

                                                            {/* Special button for failed servers */}
                                                            {getServerStatus(order) === 'failed' && (
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push('/support/tickets');
                                                                    }}
                                                                    className="gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3"
                                                                >
                                                                    <LifeBuoy className="h-3 w-3" />
                                                                    <span className="text-xs">Support</span>
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Desktop Layout - Responsive improvements */}
                                                <div className="hidden lg:flex items-center justify-between">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <OSIcon os={order.os} className="h-12 w-12 xl:h-14 xl:w-14 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-semibold text-lg xl:text-xl break-words">
                                                                {styleText(order.productName)}
                                                            </h3>
                                                            <div className="flex items-center gap-4 xl:gap-6 mt-1 text-sm xl:text-base text-muted-foreground flex-wrap">
                                                                <span className="flex items-center gap-1">
                                                                    <Terminal className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {order.os}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <MemoryStick className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {order.memory}
                                                                </span>
                                                                {/* <span className="flex items-center gap-1">
                                                                    <Database className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {getProviderDisplayName(order)}
                                                                </span> */}
                                                                {order.ipAddress && (
                                                                    <span className="flex items-center gap-1 font-mono">
                                                                        <Network className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                        {order.ipAddress}
                                                                    </span>
                                                                )}
                                                                {order.lastActionTime && (
                                                                    <span className="flex items-center gap-1 text-xs xl:text-sm">
                                                                        <Clock className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                        Last: {formatDate(order.lastActionTime)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {order.expiryDate && (
                                                                <div className="mt-2 xl:mt-3">
                                                                    {isExpired(order) ? (
                                                                        <Badge variant="destructive" className="text-xs xl:text-sm">
                                                                            <AlertTriangle className="h-3 w-3 xl:h-4 xl:w-4 mr-1" />
                                                                            Expired {Math.abs(getDaysUntilExpiry(order.expiryDate))} days ago
                                                                        </Badge>
                                                                    ) : getDaysUntilExpiry(order.expiryDate) <= 7 ? (
                                                                        <Badge variant="outline" className="text-xs xl:text-sm border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300">
                                                                            <Clock className="h-3 w-3 xl:h-4 xl:w-4 mr-1" />
                                                                            Expires in {getDaysUntilExpiry(order.expiryDate)} days
                                                                        </Badge>
                                                                    ) : getDaysUntilExpiry(order.expiryDate) <= 30 ? (
                                                                        <Badge variant="outline" className="text-xs xl:text-sm border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300">
                                                                            <Calendar className="h-3 w-3 xl:h-4 xl:w-4 mr-1" />
                                                                            Expires {formatDate(order.expiryDate)}
                                                                        </Badge>
                                                                    ) : null}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 xl:gap-3 ml-4 flex-shrink-0">
                                                        {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                                                        <div className="flex gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    router.push(`/dashboard/order/${order._id}`);
                                                                }}
                                                                className="gap-2 h-9 xl:h-10 px-3 xl:px-4"
                                                            >
                                                                <Settings className="h-4 w-4" />
                                                                <span className="hidden xl:inline">Manage</span>
                                                                <span className="xl:hidden">Manage</span>
                                                            </Button>

                                                            {/* Special button for failed servers */}
                                                            {/* {getServerStatus(order) === 'failed' && (
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push('/support/tickets');
                                                                    }}
                                                                    className="gap-2 h-9 xl:h-10 px-3 xl:px-4"
                                                                >
                                                                    <LifeBuoy className="h-4 w-4" />
                                                                    <span className="hidden xl:inline">Create Support Ticket</span>
                                                                    <span className="xl:hidden">Support</span>
                                                                </Button>
                                                            )} */}
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
};

export default ViewLinux;
