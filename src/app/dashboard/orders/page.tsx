'use client'

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
    XIcon,
    ReceiptIndianRupee,
    Eye,
    Package,
    Banknote,
    DollarSign,
    IndianRupee,
    ShoppingCart,
    History,
    Receipt,
    FileText
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface Order {
    _id: string;
    productName: string;
    os: string;
    memory: string;
    status: string;
    price: number;
    originalPrice?: number;
    promoCode?: string;
    promoDiscount?: number;
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
    transactionId?: string;
    clientTxnId?: string;
    gatewayOrderId?: string;
    customerName?: string;
    customerEmail?: string;
    webhookAmount?: string;
    webhookCustomerName?: string;
    webhookCustomerEmail?: string;
    provisioningError?: string;
    autoProvisioned?: boolean;
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

const OrderHistory = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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
            toast.error('Failed to fetch order history');
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

    // Get order status for filtering
    const getOrderStatus = (order: Order): 'completed' | 'pending' | 'failed' | 'cancelled' => {
        const currentStatus = order.status.toLowerCase();

        if (currentStatus === 'completed' || currentStatus === 'active') {
            return 'completed';
        }
        if (currentStatus === 'failed' || currentStatus === 'terminated') {
            return 'failed';
        }
        if (currentStatus === 'cancelled') {
            return 'cancelled';
        }
        return 'pending';
    };

    // Filter orders based on search query, status filter, and tab
    useEffect(() => {
        let filtered = orders;

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(order =>
                order.productName.toLowerCase().includes(query) ||
                order.transactionId?.toLowerCase().includes(query) ||
                order.clientTxnId?.toLowerCase().includes(query) ||
                order.customerName?.toLowerCase().includes(query) ||
                order.customerEmail?.toLowerCase().includes(query) ||
                getProviderDisplayName(order).toLowerCase().includes(query)
            );
        }

        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(order => getOrderStatus(order) === statusFilter);
        }

        // Apply tab filter
        if (activeTab !== 'all') {
            filtered = filtered.filter(order => getOrderStatus(order) === activeTab);
        }

        setFilteredOrders(filtered);
    }, [orders, searchQuery, statusFilter, activeTab]);

    // Get counts for tabs
    const getCounts = () => {
        const all = orders.length;
        const completed = orders.filter(order => getOrderStatus(order) === 'completed').length;
        const pending = orders.filter(order => getOrderStatus(order) === 'pending').length;
        const failed = orders.filter(order => getOrderStatus(order) === 'failed').length;
        const cancelled = orders.filter(order => getOrderStatus(order) === 'cancelled').length;

        return { all, completed, pending, failed, cancelled };
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

    const getStatusBadge = (order: Order) => {
        const status = getOrderStatus(order);

        switch (status) {
            case 'completed':
                return (
                    <Badge className="bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Completed
                    </Badge>
                );
            case 'pending':
                return (
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge className="bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                        <XCircle className="w-3 h-3 mr-1" />
                        Failed
                    </Badge>
                );
            case 'cancelled':
                return (
                    <Badge className="bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800">
                        <X className="w-3 h-3 mr-1" />
                        Cancelled
                    </Badge>
                );
            default:
                return (
                    <Badge variant="secondary">
                        {order.status}
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

    const formatCurrency = (amount: number) => {
        return `₹${amount.toFixed(2)}`;
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Copied to clipboard');
        } catch (err) {
            toast.error('Failed to copy');
        }
    };

    const handleDialogOpen = (order: Order) => {
        setSelectedOrder(order);
    };

    return (
        <div className='min-h-screen bg-background'>
            {/* Mobile Header */}
            <div className="lg:hidden h-16" />

            {/* Responsive Header */}
            <div className='sticky md:hidden lg:top-0 z-40 bg-background/95 backdrop-blur-sm shadow-sm border-b border-border'>
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
                                    <History className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h1 className='text-base sm:text-lg lg:text-xl font-bold'>Order History</h1>
                                    <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">View all your orders</p>
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

            {/* Main Content */}
            <div className='container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6'>
                {/* Search and Filters Section */}
                {!loading && orders.length > 0 && (
                    <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
                            {/* Search Bar */}
                            <div className="relative flex-1 max-w-full">
                                <Search className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                <Input
                                    placeholder="Search orders by product, transaction ID, or customer..."
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
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                        <SelectItem value="cancelled">Cancelled</SelectItem>
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
                                {filteredOrders.length} of {orders.length} orders
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
                            <p className="text-muted-foreground text-sm sm:text-base font-medium">Loading your orders...</p>
                        </div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-12 sm:py-16 px-4 min-h-[50vh] flex flex-col justify-center">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
                            <ShoppingCart className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg sm:text-xl font-semibold mb-2">No orders found</h3>
                        <p className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
                            You haven't placed any orders yet. Start by browsing our available plans.
                        </p>
                        <Button onClick={() => router.push('/dashboard/ipStock')} className="gap-2 mx-auto" size="sm">
                            <Package className="h-4 w-4" />
                            Browse Plans
                        </Button>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
                        {/* Enhanced Tab Navigation with Counts */}
                        <div className="flex justify-center overflow-x-auto scrollbar-hide">
                            <TabsList className="grid grid-cols-3 md:grid-cols-5 h-fit w-fit min-w-0">
                                <TabsTrigger value="all" classsName="flex items-center gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <Receipt className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>All</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.all}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger value="completed" className="flex items-center gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>Completed</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.completed}
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
                                <TabsTrigger value="cancelled" className="flex items-center gap-1 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
                                    <X className="h-3 w-3 sm:h-4 sm:w-4" />
                                    <span>Cancelled</span>
                                    <Badge variant="secondary" className="ml-0.5 text-xs h-4 px-1">
                                        {counts.cancelled}
                                    </Badge>
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value={activeTab} className="mt-4 sm:mt-6">
                            {filteredOrders.length === 0 ? (
                                <div className="text-center py-12 sm:py-16 px-4 min-h-[50vh] flex flex-col justify-center">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-muted rounded-full flex items-center justify-center">
                                        <Search className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg sm:text-xl font-semibold mb-2">
                                        {searchQuery || statusFilter !== 'all'
                                            ? "No orders match your criteria"
                                            : `No ${activeTab === 'all' ? 'orders' : activeTab + ' orders'} found`
                                        }
                                    </h3>
                                    <p className="text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto text-sm sm:text-base">
                                        {searchQuery || statusFilter !== 'all'
                                            ? "Try adjusting your search terms or filters."
                                            : `You don't have any ${activeTab === 'all' ? '' : activeTab + ' '}orders yet.`
                                        }
                                    </p>
                                    <div className="flex gap-2 justify-center">
                                        {(searchQuery || statusFilter !== 'all' || activeTab !== 'all') && (
                                            <Button variant="outline" onClick={clearFilters} className="gap-2" size="sm">
                                                <XIcon className="h-4 w-4" />
                                                Clear Filters
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 sm:space-y-4 pb-4 sm:pb-6">
                                    {filteredOrders.map((order) => (
                                        <Card
                                            key={order._id}
                                            className="hover:shadow-md transition-shadow cursor-pointer border-0 shadow-lg scale-90 bg-card"
                                            onClick={() => handleDialogOpen(order)}
                                        >
                                            <CardContent className="p-3 sm:p-4 lg:p-6">
                                                {/* Mobile Layout */}
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
                                                                    {getStatusBadge(order)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-semibold text-sm sm:text-base">
                                                                {formatCurrency(order.price)}
                                                            </p>
                                                            {order.originalPrice && order.originalPrice > order.price && (
                                                                <p className="text-xs text-muted-foreground line-through">
                                                                    {formatCurrency(order.originalPrice)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate">{order.createdAt ? formatDate(order.createdAt) : 'N/A'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <CreditCard className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate font-mono">{order.transactionId || order.clientTxnId || 'N/A'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <MemoryStick className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate">{order.memory}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <Terminal className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate">{order.os}</span>
                                                        </div>
                                                    </div>

                                                    <div className="border-t border-border pt-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDialogOpen(order);
                                                            }}
                                                            className="w-full gap-1 sm:gap-2 h-8 sm:h-9"
                                                        >
                                                            <Eye className="h-3 w-3" />
                                                            <span className="text-xs">View Details</span>
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Desktop Layout */}
                                                <div className="hidden lg:flex items-center justify-between">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <OSIcon os={order.os} className="h-12 w-12 xl:h-14 xl:w-14 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-semibold text-lg xl:text-xl break-words">
                                                                {styleText(order.productName)}
                                                            </h3>
                                                            <div className="flex items-center gap-4 xl:gap-6 mt-1 text-sm xl:text-base text-muted-foreground flex-wrap">
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {order.createdAt ? formatDate(order.createdAt) : 'N/A'}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <MemoryStick className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {order.memory}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Terminal className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {order.os}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Database className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                    {getProviderDisplayName(order)}
                                                                </span>
                                                                {order.transactionId && (
                                                                    <span className="flex items-center gap-1 font-mono text-xs xl:text-sm">
                                                                        <CreditCard className="h-3 w-3 xl:h-4 xl:w-4" />
                                                                        {order.transactionId}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {/* Renewal payments indicator */}
                                                            {order.renewalPayments && order.renewalPayments.length > 0 && (
                                                                <div className="mt-2 xl:mt-3">
                                                                    <Badge variant="outline" className="text-xs xl:text-sm border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300">
                                                                        <RefreshCw className="h-3 w-3 xl:h-4 xl:w-4 mr-1" />
                                                                        {order.renewalPayments.length} renewal{order.renewalPayments.length > 1 ? 's' : ''}
                                                                    </Badge>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 xl:gap-3 ml-4 flex-shrink-0">
                                                        <div className="text-right mr-4">
                                                            <p className="font-semibold text-lg xl:text-xl">
                                                                {formatCurrency(order.price)}
                                                            </p>
                                                            {order.originalPrice && order.originalPrice > order.price && (
                                                                <p className="text-sm text-muted-foreground line-through">
                                                                    {formatCurrency(order.originalPrice)}
                                                                </p>
                                                            )}
                                                            {order.promoCode && (
                                                                <p className="text-xs text-green-600 font-medium">
                                                                    {order.promoCode} applied
                                                                </p>
                                                            )}
                                                        </div>
                                                        {getStatusBadge(order)}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDialogOpen(order);
                                                            }}
                                                            className="gap-2 h-9 xl:h-10 px-3 xl:px-4"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                            <span className="hidden xl:inline">View Details</span>
                                                            <span className="xl:hidden">View</span>
                                                        </Button>
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

            {/* Enhanced Order Details Dialog */}
            {selectedOrder && (
                <Dialog open={Boolean(selectedOrder)} onOpenChange={() => setSelectedOrder(null)}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-3">
                                <OSIcon os={selectedOrder.os} className="h-8 w-8" />
                                <div>
                                    <h2 className="text-xl font-bold">Order Details</h2>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        {styleText(selectedOrder.productName)}
                                    </p>
                                </div>
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Order Summary */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Receipt className="h-5 w-5" />
                                        Order Summary
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Order ID:</span>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                                        {selectedOrder._id}
                                                    </code>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => copyToClipboard(selectedOrder._id)}
                                                        className="h-6 w-6 p-0"
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Status:</span>
                                                {getStatusBadge(selectedOrder)}
                                            </div>

                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Provider:</span>
                                                <Badge variant="secondary">
                                                    {getProviderDisplayName(selectedOrder)}
                                                </Badge>
                                            </div>

                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Order Date:</span>
                                                <span className="font-mono text-sm">
                                                    {selectedOrder.createdAt ? formatDate(selectedOrder.createdAt) : 'N/A'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Price:</span>
                                                <div className="text-right">
                                                    <p className="font-semibold">
                                                        {formatCurrency(selectedOrder.price)}
                                                    </p>
                                                    {selectedOrder.originalPrice && selectedOrder.originalPrice > selectedOrder.price && (
                                                        <p className="text-sm text-muted-foreground line-through">
                                                            {formatCurrency(selectedOrder.originalPrice)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {selectedOrder.promoCode && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted-foreground">Promo Code:</span>
                                                    <div className="text-right">
                                                        <Badge variant="outline" className="text-green-600 border-green-200">
                                                            {selectedOrder.promoCode}
                                                        </Badge>
                                                        {selectedOrder.promoDiscount && (
                                                            <p className="text-xs text-green-600 mt-1">
                                                                Saved {formatCurrency(selectedOrder.promoDiscount)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {selectedOrder.transactionId && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-muted-foreground">Transaction ID:</span>
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                                            {selectedOrder.transactionId}
                                                        </code>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => copyToClipboard(selectedOrder.transactionId!)}
                                                            className="h-6 w-6 p-0"
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Server Specifications */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Server className="h-5 w-5" />
                                        Server Specifications
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                                <MemoryStick className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Memory</p>
                                                <p className="font-semibold">{selectedOrder.memory}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                                <Terminal className="h-5 w-5 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Operating System</p>
                                                <p className="font-semibold">{selectedOrder.os}</p>
                                            </div>
                                        </div>

                                        {selectedOrder.ipAddress && (
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                                                    <Network className="h-5 w-5 text-purple-600" />
                                                </div>
                                                <div>
                                                    <p className="text-sm text-muted-foreground">IP Address</p>
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-sm font-mono">{selectedOrder.ipAddress}</code>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => copyToClipboard(selectedOrder.ipAddress!)}
                                                            className="h-6 w-6 p-0"
                                                        >
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Server Access Details */}
                            {(selectedOrder.username || selectedOrder.password || selectedOrder.ipAddress) && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <KeyRound className="h-5 w-5" />
                                            Server Access Details
                                        </CardTitle>
                                        <CardDescription>
                                            {getOrderStatus(selectedOrder) === 'completed'
                                                ? "Your server credentials are ready to use"
                                                : "Server credentials will be available once setup is complete"
                                            }
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {getOrderStatus(selectedOrder) === 'completed' ? (
                                            <div className="space-y-4">
                                                {selectedOrder.ipAddress && (
                                                    <div>
                                                        <Label className="text-sm font-medium">Server IP Address</Label>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Input
                                                                readOnly
                                                                value={selectedOrder.ipAddress}
                                                                className="font-mono text-sm"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => copyToClipboard(selectedOrder.ipAddress!)}
                                                                className="gap-2"
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                                Copy
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                {selectedOrder.username && (
                                                    <div>
                                                        <Label className="text-sm font-medium">Username</Label>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Input
                                                                readOnly
                                                                value={selectedOrder.username}
                                                                className="font-mono text-sm"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => copyToClipboard(selectedOrder.username!)}
                                                                className="gap-2"
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                                Copy
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                {selectedOrder.password && (
                                                    <div>
                                                        <Label className="text-sm font-medium">Password</Label>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Input
                                                                readOnly
                                                                type="password"
                                                                value={selectedOrder.password}
                                                                className="font-mono text-sm"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => copyToClipboard(selectedOrder.password!)}
                                                                className="gap-2"
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                                Copy
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                                    <div className="flex items-start gap-3">
                                                        <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                                        <div>
                                                            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                                                                Security Note
                                                            </h4>
                                                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                                                Keep your server credentials secure. Consider changing the default password after first login.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8">
                                                <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                                                    <Clock className="h-8 w-8 text-amber-600" />
                                                </div>
                                                <h3 className="font-semibold mb-2">Server Setup in Progress</h3>
                                                <p className="text-sm text-muted-foreground mb-4">
                                                    Your server credentials will be available once the setup is complete.
                                                    This usually takes 5-15 minutes.
                                                </p>
                                                <div className="text-xs text-muted-foreground">
                                                    Expected completion: 5-15 minutes from order time
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Customer Information */}
                            {(selectedOrder.customerName || selectedOrder.customerEmail) && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <User className="h-5 w-5" />
                                            Customer Information
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {selectedOrder.customerName && (
                                                <div>
                                                    <Label className="text-sm font-medium text-muted-foreground">Customer Name</Label>
                                                    <p className="mt-1 font-medium">{selectedOrder.customerName}</p>
                                                </div>
                                            )}
                                            {selectedOrder.customerEmail && (
                                                <div>
                                                    <Label className="text-sm font-medium text-muted-foreground">Email Address</Label>
                                                    <p className="mt-1 font-medium font-mono text-sm">{selectedOrder.customerEmail}</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Renewal History */}
                            {selectedOrder.renewalPayments && selectedOrder.renewalPayments.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <RefreshCw className="h-5 w-5" />
                                            Renewal History
                                        </CardTitle>
                                        <CardDescription>
                                            View all renewal payments for this service
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {selectedOrder.renewalPayments.map((renewal, index) => (
                                                <div key={renewal.paymentId || index} className="border rounded-lg p-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Payment Date</p>
                                                            <p className="font-semibold">{formatDate(renewal.paidAt)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Amount</p>
                                                            <p className="font-semibold">{formatCurrency(renewal.amount)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">Previous Expiry</p>
                                                            <p className="font-mono text-sm">{formatDate(renewal.previousExpiry)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-muted-foreground">New Expiry</p>
                                                            <p className="font-mono text-sm">{formatDate(renewal.newExpiry)}</p>
                                                        </div>
                                                        {renewal.renewalTxnId && (
                                                            <div className="md:col-span-2">
                                                                <p className="text-sm text-muted-foreground">Transaction ID</p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                                                        {renewal.renewalTxnId}
                                                                    </code>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => copyToClipboard(renewal.renewalTxnId)}
                                                                        className="h-6 w-6 p-0"
                                                                    >
                                                                        <Copy className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                                <Button
                                    onClick={() => router.push(`/dashboard/order/${selectedOrder._id}`)}
                                    className="gap-2 flex-1"
                                >
                                    <Settings className="h-4 w-4" />
                                    Manage Server
                                </Button>

                                {getOrderStatus(selectedOrder) === 'failed' && (
                                    <Button
                                        variant="outline"
                                        onClick={() => router.push('/support/tickets')}
                                        className="gap-2 flex-1"
                                    >
                                        <LifeBuoy className="h-4 w-4" />
                                        Get Support
                                        <ExternalLink className="h-3 w-3" />
                                    </Button>
                                )}

                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedOrder(null)}
                                    className="gap-2"
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default OrderHistory;
