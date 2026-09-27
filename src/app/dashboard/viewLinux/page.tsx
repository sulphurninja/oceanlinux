"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Copy,
    CheckCircle,
    XCircle,
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
    XIcon,
    Download
} from 'lucide-react';
import DashboardSearchInput from '@/components/dashboard/DashboardSearchInput';
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
import { dashboardFetch } from '@/lib/dashboardFetch';
import { readDashboardCache, writeDashboardCache, DASHBOARD_CACHE_KEYS } from '@/lib/dashboardCache';
import { useSessionAlert } from '@/components/session-alert';
import { premiumBadge, premiumSelectContent } from '@/lib/premium-badges';
import { getCustomerProviderDisplayNameFromOrder } from '@/lib/customerProviderDisplay';
import {
    hasDeliveredCredentials,
    getDaysUntilExpiry,
    isServerListOrder,
    getServerDeliveryStatus,
    isOrderAwaitingDelivery,
    hasOrderBeenDelivered,
    isOrderPaid,
    shouldPollOrderForDelivery,
} from '@/lib/orderDeliveryStatus';
import { isWithinRenewalWindow } from '@/lib/expiryHelper';
import { isTrialVpsOrder } from '@/lib/trialVpsOrder';
import { OsIcon, humanizeOsLabel } from '@/components/os/OsIcon';

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
    provider?: 'hostycare' | 'smartvps' | 'oceanlinux' | 'slotip' | 'advps' | 'netbay';
    hostycareServiceId?: string;
    smartvpsServiceId?: string;
    advpsServiceId?: string;
    netbayServiceId?: string;
    slotIpPackageId?: string;
    slotIpId?: string;
    provisioningStatus?: string;
    provisioningError?: string;
    lastAction?: string;
    lastActionTime?: Date;
    lastSyncTime?: Date;
    panelUsername?: string;
    panelPassword?: string;
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

// OS icons — shared component handles win-22, Windows, Ubuntu, etc.

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
    const [refreshing, setRefreshing] = useState(false);
    const [actionBusy, setActionBusy] = useState<string | null>(null);

    // Filter states
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [activeTab, setActiveTab] = useState<string>('all');

    const router = useRouter();
    const { showAlert } = useSessionAlert();

    useEffect(() => {
        const cached = readDashboardCache(DASHBOARD_CACHE_KEYS.ordersMe) as Order[] | null;
        if (Array.isArray(cached) && cached.length > 0) {
            setOrders(cached);
            setLoading(false);
            fetchOrders(true);
            return;
        }
        fetchOrders();
    }, []);

    const needsDeliveryPoll = useMemo(
        () => orders.some(shouldPollOrderForDelivery),
        [orders]
    );

    useEffect(() => {
        if (!needsDeliveryPoll) return;

        const interval = setInterval(() => {
            fetchOrders(true);
        }, 15000);

        const timeout = setTimeout(() => clearInterval(interval), 3 * 60 * 1000);
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [needsDeliveryPoll]);

    const fetchOrders = async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const response = await dashboardFetch('/api/orders/me', { cache: 'no-store', credentials: 'include' });
            if (response.status === 401) {
                const data = await response.json().catch(() => ({}));
                const code = data.code || '';
                if (code === 'SESSION_EXPIRED' || String(data.message || '').toLowerCase().includes('expired')) {
                    showAlert('session_expired');
                } else {
                    showAlert('action_requires_login', 'Please log in to view your servers.');
                }
                return;
            }
            if (!response.ok) {
                throw new Error('Failed to fetch orders');
            }
            const data = await response.json();
            if (!Array.isArray(data)) {
                throw new Error('Invalid orders response');
            }
            writeDashboardCache(DASHBOARD_CACHE_KEYS.ordersMe, data);
            setOrders(data);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
            if (!isRefresh) toast.error('Could not load your servers. Please try again.');
        } finally {
            if (isRefresh) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    };

    const getDaysUntilExpiryLocal = getDaysUntilExpiry;

    const getProviderDisplayName = (order: Order): string =>
        getCustomerProviderDisplayNameFromOrder(order);



    const getServerStatus = (order: Order) => getServerDeliveryStatus(order);

    // Filter orders based on search query, status filter, and tab
    useEffect(() => {
        let filtered = orders.filter(isServerListOrder);

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            const compactQuery = query.replace(/\s+/g, '');
            filtered = filtered.filter((order) => {
                const ip = (order.ipAddress || '').toLowerCase();
                const haystack = [
                    ip,
                    ip.replace(/[^a-z0-9.]/g, ''),
                    order.productName,
                    order.os,
                    humanizeOsLabel(order.os, order.productName),
                    order.memory,
                    order.username,
                    order.provider,
                    getProviderDisplayName(order),
                    order._id,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(query) || haystack.replace(/\s+/g, '').includes(compactQuery);
            });
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
        const delivered = orders.filter(isServerListOrder);
        const all = delivered.length;
        const active = delivered.filter(order => getServerStatus(order) === 'active').length;
        const expired = delivered.filter(order => getServerStatus(order) === 'expired').length;

        return { all, active, expired };
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




    const downloadInvoice = async (e: React.MouseEvent, orderId: string) => {
        e.stopPropagation();
        try {
            const res = await dashboardFetch(`/api/invoice/download?orderId=${orderId}`);
            if (!res.ok) throw new Error('Failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `invoice-${orderId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Invoice downloaded!');
        } catch {
            toast.error('Failed to download invoice');
        }
    };

    const copyHosthellCreds = (e: React.MouseEvent, order: Order) => {
        e.stopPropagation();
        if (!order.panelUsername || !order.panelPassword) {
            toast.error('Panel credentials not generated yet for this order.');
            return;
        }
        const ip = order.ipAddress ? order.ipAddress.split(':')[0] : 'N/A';
        const text = `*VPS LOGIN DETAILS*\nUsername: ${order.panelUsername}\nPassword: ${order.panelPassword}\nRAM: ${order.memory}\nIP: ${ip}\nhttps://hosthell.com/access-server`;
        navigator.clipboard.writeText(text).then(() => {
            toast.success('Hosthell credentials copied!');
        }).catch(() => {
            toast.error('Failed to copy');
        });
    };

    const isRenewalEligible = (order: Order | null) => {
        if (!order || !order.expiryDate) return false;
        if (order.slotIpPackageId || order.provider === 'slotip' || isTrialVpsOrder(order)) return false;
        return isWithinRenewalWindow(order.expiryDate);
    };

    const isExpired = (order: Order | null) => {
        if (!order || !order.expiryDate) return false;
        return getDaysUntilExpiry(order.expiryDate) < 0;
    };

    const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string, order?: Order) => {
        if (status.toLowerCase() === 'completed') {
        return (
            <Badge variant="outline" className={premiumBadge.success}>
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Active
            </Badge>
        );
    }

    const currentStatus = provisioningStatus || status;

    // IP assigned — show Active even if status is still "confirmed" (post-payment lag).
    if (order && isOrderPaid(order) && hasOrderBeenDelivered(order)) {
        return (
            <Badge variant="outline" className={premiumBadge.success}>
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Active
            </Badge>
        );
    }

    // Paid, waiting for admin/company delivery — never show Failed
    if (order && isOrderAwaitingDelivery(order)) {
        return (
            <Badge variant="outline" className={premiumBadge.info}>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Processing
            </Badge>
        );
    }

    // 🆕 NEW: Check if order is fresh (created within last 10 minutes)
    // Fresh orders should show a friendly "Setting Up" message
    const orderAge = order?.createdAt ? Date.now() - new Date(order.createdAt).getTime() : 0;
    const isFreshOrder = orderAge < 10 * 60 * 1000; // 10 minutes

    if (isFreshOrder && currentStatus.toLowerCase() !== 'active' && currentStatus.toLowerCase() !== 'completed') {
        // For very fresh orders (< 2 mins), show "Processing Payment"
        if (orderAge < 2 * 60 * 1000) {
            return (
                <Badge variant="outline" className={premiumBadge.info}>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Processing
                </Badge>
            );
        }
        // For orders 2-10 mins old, show "Setting Up"
        return (
            <Badge variant="outline" className={premiumBadge.warning}>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Setting Up
            </Badge>
        );
    }

    const provider = order ? getProviderDisplayName(order) : 'Unknown';
    const isSlotIp = !!(order?.slotIpPackageId || order?.provider === 'slotip');
    const isTrialVps = isTrialVpsOrder(order ?? null);
    const isAutoProvisionedProvider =
        isSlotIp ||
        isTrialVps ||
        provider === 'Hostycare' ||
        provider === 'SmartVPS' ||
        provider === 'ADVPS' ||
        order?.provider === 'netbay' ||
        !!order?.netbayServiceId;

    // If the order has delivered credentials and isn't explicitly in a bad
    // state, render Active regardless of the underlying provisioningStatus.
    // This is the common case for manual fulfillments and company-Virtualizor
    // automated orders where `provisioningStatus` was never flipped to
    // 'active' even though the customer has a working server.
    const lowerCurrent = currentStatus.toLowerCase();
    const isExplicitlyBadForBadge =
        lowerCurrent === 'suspended' ||
        lowerCurrent === 'terminated' ||
        lowerCurrent === 'cancelled' ||
        lowerCurrent === 'canceled';
    if (order && hasDeliveredCredentials(order) && !isExplicitlyBadForBadge) {
        return (
            <Badge variant="outline" className={premiumBadge.success}>
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Active
            </Badge>
        );
    }

    // For non-auto-provisioned services, show appropriate pending status
    if (!isAutoProvisionedProvider) {
        if (currentStatus.toLowerCase() === 'terminated') {
            return (
                <Badge variant="outline" className={premiumBadge.error}>
                    <XCircle className="w-3 h-3 mr-1" />
                    Terminated
                </Badge>
            );
        }
        // All other states for non-auto-provisioned should show as processing
        return (
            <Badge variant="outline" className={premiumBadge.info}>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Processing
            </Badge>
        );
    }

    // Check for configuration/temporary errors - show as pending, not failed
    if (order?.provisioningError &&
        (order.provisioningError.includes('Missing hostycareProductId') ||
            order.provisioningError.includes('CONFIG:') ||
            order.provisioningError.includes('Memory configuration not found') ||
            order.provisioningError.includes('lacks hostycareProductId') ||
            order.provisioningError.includes('not found') ||
            order.provisioningError.includes('Lock acquisition') ||
            order.provisioningError.includes('IPStock') ||
            order.provisioningError.includes('timeout'))) {
        return (
            <Badge variant="outline" className={premiumBadge.warning}>
                <Clock className="w-3 h-3 mr-1" />
                In Queue
            </Badge>
        );
    }

    switch (currentStatus.toLowerCase()) {
        case 'active':
            return (
                <Badge variant="outline" className={premiumBadge.success}>
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    Active
                </Badge>
            );
        case 'pending':
        case 'confirmed':
            return (
                <Badge variant="outline" className={premiumBadge.warning}>
                    <Clock className="w-3 h-3 mr-1" />
                    Pending Setup
                </Badge>
            );
        case 'provisioning':
            return (
                <Badge variant="outline" className={premiumBadge.info}>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Provisioning
                </Badge>
            );
        case 'suspended':
            return (
                <Badge variant="outline" className={premiumBadge.error}>
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                    Offline
                </Badge>
            );
        case 'failed':
            if (order && isOrderAwaitingDelivery(order)) {
                return (
                    <Badge variant="outline" className={premiumBadge.info}>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Processing
                    </Badge>
                );
            }
            // Double-check for config/temporary errors even in failed status
            if (order?.provisioningError && 
                (order.provisioningError.includes('CONFIG:') ||
                 order.provisioningError.includes('not found') ||
                 order.provisioningError.includes('Lock') ||
                 order.provisioningError.includes('timeout'))) {
                return (
                    <Badge variant="outline" className={premiumBadge.warning}>
                        <Clock className="w-3 h-3 mr-1" />
                        In Queue
                    </Badge>
                );
            }
            return (
                <Badge variant="outline" className={premiumBadge.error}>
                    <XCircle className="w-3 h-3 mr-1" />
                    Needs Attention
                </Badge>
            );
        case 'terminated':
            return (
                <Badge variant="outline" className={premiumBadge.error}>
                    <XCircle className="w-3 h-3 mr-1" />
                    Terminated
                </Badge>
            );
        default:
            // Enhanced default case for auto-provisioned services
            const isManualOrder = !lastAction || lastAction.includes('manual');
            if (
              (isManualOrder || currentStatus.toLowerCase() === 'confirmed') &&
              !(order && isOrderPaid(order) && hasOrderBeenDelivered(order))
            ) {
                return (
                    <Badge variant="outline" className={premiumBadge.warning}>
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
        <div className='premium-dashboard-page'>
            <div className='premium-dashboard-page-inner'>
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
                ) : orders.filter(isServerListOrder).length === 0 ? (
                    <div className="text-center py-12 sm:py-16 px-4 min-h-[50vh] flex flex-col justify-center">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
                            <Server className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                        </div>
                        <h2 className="text-lg sm:text-xl font-semibold mb-2">No active servers yet</h2>
                        <p className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
                            Paid servers appear here right away — even while provisioning. Active servers show IP and credentials once ready.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button onClick={() => router.push('/dashboard/ipStock')} className="gap-2 mx-auto premium-btn-primary border-0">
                            <Server className="h-4 w-4" />
                            Browse Plans
                        </Button>
                        {orders.length > 0 && (
                            <Button variant="outline" onClick={() => router.push('/dashboard/orders')} className="gap-2 mx-auto premium-btn-outline">
                                <Clock className="h-4 w-4" />
                                View Pending Orders
                            </Button>
                        )}
                        </div>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-5 premium-dashboard-tabs premium-viewlinux-tabs">
                        <div className="premium-dashboard-toolbar premium-viewlinux-toolbar mb-0 space-y-2.5">
                            <div className="flex items-center gap-2">
                                <DashboardSearchInput
                                    value={searchQuery}
                                    onChange={setSearchQuery}
                                    onClear={clearSearch}
                                    placeholder="Search IP, product, or OS"
                                    className="min-w-0 flex-1"
                                />
                                <Button
                                    variant="outline"
                                    className="premium-btn-outline premium-btn-icon shrink-0 px-0 lg:w-auto lg:px-4 lg:gap-2"
                                    onClick={() => fetchOrders(true)}
                                    disabled={loading || refreshing}
                                    aria-label="Refresh servers"
                                    title="Refresh"
                                >
                                    <RefreshCw className={`h-4 w-4 shrink-0 ${loading || refreshing ? 'animate-spin' : ''}`} />
                                    <span className="hidden lg:inline">Refresh</span>
                                </Button>
                                <div className="hidden lg:block">
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger className="premium-dashboard-select w-40">
                                            <Filter className="h-4 w-4 mr-2" />
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent className={premiumSelectContent}>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="expired">Expired</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {(searchQuery || statusFilter !== 'all' || activeTab !== 'all') && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={clearFilters}
                                        className="premium-btn-outline hidden lg:inline-flex"
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>

                            <TabsList className="premium-dashboard-tablist premium-viewlinux-tablist grid h-auto w-full grid-cols-3 gap-1">
                                <TabsTrigger value="all" className="flex w-full min-w-0 items-center justify-center gap-1 px-1.5 sm:px-3 py-2 text-xs sm:text-sm">
                                    <Server className="hidden sm:block h-4 w-4" />
                                    <span>All</span>
                                    <Badge variant="secondary" className="premium-tab-count ml-0.5 text-[10px] sm:text-xs h-4 px-1">
                                        {counts.all}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="active" className="flex w-full min-w-0 items-center justify-center gap-1 px-1.5 sm:px-3 py-2 text-xs sm:text-sm">
                                    <CheckCircle className="hidden sm:block h-4 w-4" />
                                    <span>Active</span>
                                    <Badge variant="secondary" className="premium-tab-count ml-0.5 text-[10px] sm:text-xs h-4 px-1">
                                        {counts.active}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="expired" className="flex w-full min-w-0 items-center justify-center gap-1 px-1.5 sm:px-3 py-2 text-xs sm:text-sm">
                                    <Calendar className="hidden sm:block h-4 w-4" />
                                    <span>Expired</span>
                                    <Badge variant="secondary" className="premium-tab-count ml-0.5 text-[10px] sm:text-xs h-4 px-1">
                                        {counts.expired}
                                    </Badge>
                                </TabsTrigger>
                            </TabsList>

                            {(searchQuery || statusFilter !== 'all') && (
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs sm:text-sm text-white/45 min-w-0 truncate">
                                        {filteredOrders.length} of {orders.filter(isServerListOrder).length} servers
                                        {searchQuery && ` matching "${searchQuery}"`}
                                    </p>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={clearFilters}
                                        className="lg:hidden h-8 px-2 text-xs shrink-0"
                                    >
                                        Clear
                                    </Button>
                                </div>
                            )}
                        </div>

                        <TabsContent value={activeTab} className="mt-0">
                            {filteredOrders.length === 0 ? (
                                <div className="text-center py-12 sm:py-16 px-4 min-h-[50vh] flex flex-col justify-center">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
                                        {activeTab === 'expired' ? (
                                            <Calendar className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        ) : activeTab === 'active' ? (
                                            <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        ) : (
                                            <Search className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                        )}
                                    </div>
                                    <h2 className="text-lg sm:text-xl font-semibold mb-2">
                                        {searchQuery || statusFilter !== 'all'
                                            ? "No servers match your criteria"
                                            : `No ${activeTab === 'all' ? 'servers' : activeTab + ' servers'} found`
                                        }
                                    </h2>
                                    <p className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
                                        {searchQuery || statusFilter !== 'all'
                                            ? "Try adjusting your search terms or filters."
                                            : activeTab === 'expired'
                                                ? "No expired servers. All your services are up to date!"
                                                : activeTab === 'active'
                                                    ? "No active servers. Order a new server to get started!"
                                                    : "No delivered servers found."
                                        }
                                    </p>
                                    <div className="flex gap-2 justify-center">
                                        {(searchQuery || statusFilter !== 'all' || activeTab !== 'all') && (
                                            <Button variant="outline" onClick={clearFilters} className="gap-2 premium-btn-outline">
                                                <XIcon className="h-4 w-4" />
                                                Clear Filters
                                            </Button>
                                        )}
                                        {activeTab === 'active' && (
                                            <Button onClick={() => router.push('/dashboard/ipStock')} className="gap-2 premium-btn-primary border-0">
                                                <Server className="h-4 w-4" />
                                                Browse Plans
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 sm:space-y-4 pb-4 sm:pb-6">

                                    {filteredOrders.map((order) => (
                                        <Card
                                            key={order._id}
                                            className="premium-dashboard-order-card"
                                            onClick={() => router.push(`/dashboard/order/${order._id}`)}
                                        >
                                            <CardContent className="p-3 sm:p-4 lg:p-6">
                                                {/* Mobile Layout - Completely responsive */}
                                                <div className="block lg:hidden space-y-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                                            <OsIcon os={order.os} productName={order.productName} className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" />
                                                            <div className="flex-1 min-w-0">
                                                                <h2 className="font-semibold text-sm sm:text-base break-words premium-dashboard-title" title={order.productName}>
                                                                    {styleText(order.productName)}
                                                                </h2>
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
                                                            <span className="truncate">{humanizeOsLabel(order.os, order.productName)}</span>
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
                                                        <div className="premium-mobile-order-actions">
                                                            <Button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    router.push(`/dashboard/order/${order._id}`);
                                                                }}
                                                                className="premium-btn-primary gap-2 border-0"
                                                            >
                                                                <Settings className="h-4 w-4 shrink-0" />
                                                                <span className="truncate">Manage</span>
                                                            </Button>

                                                            <Button
                                                                variant="outline"
                                                                onClick={(e) => downloadInvoice(e, order._id)}
                                                                className="premium-btn-outline gap-2"
                                                            >
                                                                <Download className="h-4 w-4 shrink-0" />
                                                                <span className="truncate">Invoice</span>
                                                            </Button>

                                                            {order.panelUsername && (
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={(e) => copyHosthellCreds(e, order)}
                                                                    title="Copy the login your client uses to control this server"
                                                                    aria-label="Copy client login panel"
                                                                    className="premium-mobile-order-action--wide premium-btn-credentials w-full min-h-11 gap-2"
                                                                >
                                                                    <Copy className="h-4 w-4 shrink-0" />
                                                                    <span className="truncate">Copy client login panel</span>
                                                                </Button>
                                                            )}

                                                            {getServerStatus(order) === 'failed' && (
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        router.push('/support/tickets');
                                                                    }}
                                                                    className="premium-mobile-order-action--wide premium-btn-outline gap-2"
                                                                >
                                                                    <LifeBuoy className="h-3 w-3 shrink-0" />
                                                                    <span className="text-xs truncate">Support</span>
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Desktop Layout - Responsive improvements */}
                                                <div className="hidden lg:flex flex-wrap items-center justify-between gap-4 min-w-0">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <OsIcon os={order.os} productName={order.productName} className="h-12 w-12 xl:h-14 xl:w-14 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <h2 className="font-semibold text-lg xl:text-xl break-words premium-dashboard-title" title={order.productName}>
                                                                {styleText(order.productName)}
                                                            </h2>
                                                            <div className="flex items-center gap-4 xl:gap-6 mt-1 text-sm xl:text-base text-muted-foreground flex-wrap">
                                                                <span className="flex items-center gap-1">
                                                                    <Terminal className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {humanizeOsLabel(order.os, order.productName)}
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

                                                    <div className="flex flex-wrap items-center justify-end gap-2 xl:gap-3 ml-auto min-w-0">
                                                        {getStatusBadge(order.status, order.provisioningStatus, order.lastAction, order)}
                                                        <div className="flex gap-2">
                                                            <Button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    router.push(`/dashboard/order/${order._id}`);
                                                                }}
                                                                className="premium-btn-primary gap-2 border-0"
                                                            >
                                                                <Settings className="h-4 w-4" />
                                                                Manage
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                onClick={(e) => downloadInvoice(e, order._id)}
                                                                className="premium-btn-outline gap-2"
                                                            >
                                                                <Download className="h-4 w-4" />
                                                                Invoice
                                                            </Button>
                                                            {order.panelUsername && (
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={(e) => copyHosthellCreds(e, order)}
                                                                    title="Copy the login your client uses to control this server"
                                                                    aria-label="Copy client login panel"
                                                                    className="premium-btn-credentials gap-2"
                                                                >
                                                                    <Copy className="h-4 w-4 shrink-0" />
                                                                    Copy client login panel
                                                                </Button>
                                                            )}
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
