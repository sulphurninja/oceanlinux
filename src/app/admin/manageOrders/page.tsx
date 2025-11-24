'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    DialogHeader,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
    Eye, Settings, Play, RotateCcw, Loader2, AlertCircle, CheckCircle, 
    Wrench, Search, Filter, Calendar, X, ChevronLeft, ChevronRight, 
    ChevronsLeft, ChevronsRight, Edit2, Save, XCircle, Download, RefreshCw
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';

interface Order {
    _id: string;
    user: {
        _id?: string;
        name?: string;
        email?: string;
    };
    productName: string;
    memory: string;
    price: number;
    status: string;
    provisioningStatus?: string;
    provisioningError?: string;
    hostycareServiceId?: string;
    smartvpsServiceId?: string;
    provider?: string;
    autoProvisioned?: boolean;
    ipAddress?: string;
    username?: string;
    password?: string;
    os: string;
    transactionId: string;
    createdAt: string;
    expiryDate?: string;
    lastAction?: string;
    lastActionTime?: string;
}

interface FilterState {
    status: string;
    provisioningStatus: string;
    autoProvisioned: string;
    provider: string;
    os: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
}

interface PaginationState {
    page: number;
    limit: number;
    total: number;
}

const ManageOrders = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isProvisioningDialogOpen, setIsProvisioningDialogOpen] = useState(false);
    const [provisioning, setProvisioning] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<FilterState>({
        status: '',
        provisioningStatus: '',
        autoProvisioned: '',
        provider: '',
        os: '',
        dateFrom: undefined,
        dateTo: undefined,
    });
    const [showFilters, setShowFilters] = useState(false);
    const [batchProvisioning, setBatchProvisioning] = useState(false);
    const [updating, setUpdating] = useState(false);
    
    // Pagination state
    const [pagination, setPagination] = useState<PaginationState>({
        page: 1,
        limit: 50,
        total: 0
    });

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/orders?t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            });
            const data = await response.json();
            setOrders(data);
            setPagination(prev => ({ ...prev, total: data.length }));
        } catch {
            toast.error('Failed to fetch orders');
        } finally {
            setLoading(false);
        }
    };

    // Memoized filtered orders for performance
    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            // Text search
            const matchesSearch = !searchTerm ||
                order.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.transactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (order.ipAddress && order.ipAddress.toLowerCase().includes(searchTerm.toLowerCase()));

            // Status filter
            const matchesStatus = !filters.status || order.status === filters.status;

            // Provider filter
            const matchesProvider = !filters.provider || 
                (order.provider || 'hostycare') === filters.provider;

            // OS filter
            const matchesOS = !filters.os || 
                order.os?.toLowerCase().includes(filters.os.toLowerCase());

            // Provisioning status filter
            let matchesProvisioningStatus = true;
            if (filters.provisioningStatus) {
                if (filters.provisioningStatus === 'not_provisioned') {
                    matchesProvisioningStatus = !order.autoProvisioned && (!order.ipAddress || !order.username);
                } else if (filters.provisioningStatus === 'manual_setup') {
                    matchesProvisioningStatus = !order.autoProvisioned && Boolean(order.ipAddress) && Boolean(order.username);
                } else {
                    matchesProvisioningStatus = order.provisioningStatus === filters.provisioningStatus;
                }
            }

            // Auto-provisioned filter
            let matchesAutoProvisioned = true;
            if (filters.autoProvisioned) {
                if (filters.autoProvisioned === 'auto') {
                    matchesAutoProvisioned = order.autoProvisioned === true;
                } else if (filters.autoProvisioned === 'manual') {
                    matchesAutoProvisioned = !order.autoProvisioned;
                }
            }

            // Date filters
            const orderDate = new Date(order.createdAt);
            const matchesDateFrom = !filters.dateFrom || orderDate >= filters.dateFrom;
            const matchesDateTo = !filters.dateTo || orderDate <= new Date(filters.dateTo.getTime() + 24 * 60 * 60 * 1000);

            return matchesSearch && matchesStatus && matchesProvider && matchesOS && 
                   matchesProvisioningStatus && matchesAutoProvisioned && matchesDateFrom && matchesDateTo;
        });
    }, [orders, searchTerm, filters]);

    // Paginated orders
    const paginatedOrders = useMemo(() => {
        const startIndex = (pagination.page - 1) * pagination.limit;
        const endIndex = startIndex + pagination.limit;
        return filteredOrders.slice(startIndex, endIndex);
    }, [filteredOrders, pagination.page, pagination.limit]);

    const totalPages = Math.ceil(filteredOrders.length / pagination.limit);

    // Update total when filtered orders change
    useEffect(() => {
        setPagination(prev => ({ ...prev, total: filteredOrders.length, page: 1 }));
    }, [filteredOrders.length]);

    const handleEdit = useCallback((order: Order) => {
        setCurrentOrder({ ...order });
        setEditingOrder({ ...order });
        setIsDialogOpen(true);
    }, []);

    const handleProvision = useCallback((order: Order) => {
        setCurrentOrder(order);
        setIsProvisioningDialogOpen(true);
    }, []);

    const handleAutoProvision = async (orderId: string) => {
        setProvisioning(orderId);
        try {
            const response = await fetch('/api/orders/provision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId })
            });

            const result = await response.json();

            if (result.success) {
                toast.success('Server provisioned successfully!');
                fetchOrders();
            } else {
                toast.error(result.message || 'Provisioning failed');
            }
        } catch (error) {
            toast.error('Failed to start provisioning');
        } finally {
            setProvisioning(null);
            setIsProvisioningDialogOpen(false);
        }
    };

    const handleBatchAutoProvision = async () => {
        setBatchProvisioning(true);
        try {
            const response = await fetch('/api/admin/batch-provision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (result.success && result.data.success) {
                const summary = result.data.summary;
                toast.success(
                    `Batch provisioning completed! ${summary.successful} successful, ${summary.failed} failed${summary.retries > 0 ? `, ${summary.retries} retries` : ''}`
                );
                fetchOrders();
            } else {
                toast.error(result.data.message || 'Batch provisioning failed');
            }
        } catch (error) {
            toast.error('Failed to start batch provisioning');
        } finally {
            setBatchProvisioning(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingOrder) return;
        
        setUpdating(true);
        try {
            const response = await fetch(`/api/orders/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: editingOrder._id,
                    ipAddress: editingOrder.ipAddress,
                    username: editingOrder.username,
                    password: editingOrder.password,
                    os: editingOrder.os,
                    status: editingOrder.status,
                    provider: editingOrder.provider,
                    provisioningStatus: editingOrder.provisioningStatus
                })
            });

            if (response.ok) {
                setOrders(prev => prev.map(order =>
                    order._id === editingOrder._id ? editingOrder : order
                ));
                toast.success('Order updated successfully!');
                setIsDialogOpen(false);
                setCurrentOrder(null);
                setEditingOrder(null);
            } else {
                throw new Error('Failed to update order');
            }
        } catch (error) {
            toast.error('Failed to update order');
        } finally {
            setUpdating(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, string> = {
            active: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
            confirmed: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
            completed: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
            pending: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
            paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
            invalid: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
            expired: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
            failed: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
        };
        
        return (
            <Badge className={`${variants[status] || variants.pending} font-medium`}>
                {status}
            </Badge>
        );
    };

    const getProvisioningStatusBadge = (order: Order) => {
        if (order.autoProvisioned) {
            switch (order.provisioningStatus) {
                case 'provisioning':
                    return (
                        <Badge variant="outline" className="gap-1 border-blue-500/20 bg-blue-500/10">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Auto-Provisioning
                        </Badge>
                    );
                case 'active':
                    return (
                        <Badge className="gap-1 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                            <CheckCircle className="w-3 h-3" />
                            Auto-Provisioned
                        </Badge>
                    );
                case 'failed':
                    return (
                        <Badge className="gap-1 bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20">
                            <AlertCircle className="w-3 h-3" />
                            Auto-Failed
                        </Badge>
                    );
                default:
                    return (
                        <Badge variant="outline">
                            Pending Auto
                        </Badge>
                    );
            }
        } else if (order.ipAddress && order.username) {
            return (
                <Badge className="gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20">
                    <Wrench className="w-3 h-3" />
                    Manual Setup
                </Badge>
            );
        }
        return (
            <Badge variant="outline" className="text-muted-foreground">
                Not Provisioned
            </Badge>
        );
    };

    // Stats calculations
    const stats = useMemo(() => ({
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        confirmed: orders.filter(o => o.status === 'confirmed').length,
        active: orders.filter(o => o.status === 'active').length,
        failed: orders.filter(o => o.provisioningStatus === 'failed').length,
        totalRevenue: orders.filter(o => ['active', 'paid', 'confirmed'].includes(o.status)).reduce((sum, o) => sum + o.price, 0),
    }), [orders]);

    const clearFilters = () => {
        setFilters({
            status: '',
            provisioningStatus: '',
            autoProvisioned: '',
            provider: '',
            os: '',
            dateFrom: undefined,
            dateTo: undefined,
        });
        setSearchTerm('');
    };

    const hasActiveFilters = searchTerm || Object.values(filters).some(v => v);

    const exportToCSV = () => {
        const csvData = filteredOrders.map(order => ({
            'Order ID': order._id,
            'Customer Name': order.user?.name || 'N/A',
            'Customer Email': order.user?.email || 'N/A',
            'Product': order.productName,
            'Memory': order.memory,
            'Price': order.price,
            'Status': order.status,
            'Provisioning Status': order.provisioningStatus || 'N/A',
            'Provider': order.provider || 'hostycare',
            'IP Address': order.ipAddress || 'N/A',
            'Username': order.username || 'N/A',
            'OS': order.os || 'N/A',
            'Transaction ID': order.transactionId || 'N/A',
            'Created At': format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm:ss'),
            'Expiry Date': order.expiryDate ? format(new Date(order.expiryDate), 'yyyy-MM-dd') : 'N/A',
        }));

        const headers = Object.keys(csvData[0] || {});
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `orders_export_${format(new Date(), 'yyyy-MM-dd_HHmmss')}.csv`;
        link.click();
        
        toast.success(`Exported ${csvData.length} orders to CSV`);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Mobile Header Spacer */}
            <div className="lg:hidden h-16" />

            {/* Page Header */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex flex-col gap-6 p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Manage Orders</h1>
                            <p className="text-muted-foreground mt-1">
                                Advanced order management with full editability
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Button
                                variant="outline"
                                onClick={exportToCSV}
                                disabled={filteredOrders.length === 0}
                                className="gap-2"
                                size="sm"
                            >
                                <Download className="w-4 h-4" />
                                Export CSV
                            </Button>
                            <Button
                                variant="default"
                                onClick={handleBatchAutoProvision}
                                disabled={batchProvisioning}
                                className="gap-2"
                                size="sm"
                            >
                                {batchProvisioning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Batch Provisioning...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4" />
                                        Auto-Provision All
                                    </>
                                )}
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={fetchOrders} 
                                disabled={loading}
                                className="gap-2"
                                size="sm"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="w-4 h-4" />
                                )}
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.total}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.confirmed}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Active</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Failed</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Search and Filters */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, email, product, transaction ID, IP..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={() => setShowFilters(!showFilters)}
                                >
                                    <Filter className="w-4 h-4" />
                                    Advanced Filters
                                    {hasActiveFilters && (
                                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                                            {[searchTerm, ...Object.values(filters)].filter(Boolean).length}
                                        </Badge>
                                    )}
                                </Button>
                                {hasActiveFilters && (
                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                                        <X className="w-4 h-4" />
                                        Clear All
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Advanced Filter Panel */}
                        {showFilters && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Advanced Filters</CardTitle>
                                    <CardDescription>Filter orders by multiple criteria</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-2">
                                            <Label>Order Status</Label>
                                            <Select
                                                value={filters.status}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All statuses" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All statuses</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
                                                    <SelectItem value="paid">Paid</SelectItem>
                                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                                    <SelectItem value="active">Active</SelectItem>
                                                    <SelectItem value="completed">Completed</SelectItem>
                                                    <SelectItem value="invalid">Invalid</SelectItem>
                                                    <SelectItem value="expired">Expired</SelectItem>
                                                    <SelectItem value="failed">Failed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provisioning Status</Label>
                                            <Select
                                                value={filters.provisioningStatus}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, provisioningStatus: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All provisioning" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All provisioning</SelectItem>
                                                    <SelectItem value="active">Auto-Active</SelectItem>
                                                    <SelectItem value="provisioning">Auto-Provisioning</SelectItem>
                                                    <SelectItem value="failed">Auto-Failed</SelectItem>
                                                    <SelectItem value="manual_setup">Manual Setup</SelectItem>
                                                    <SelectItem value="not_provisioned">Not Provisioned</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provider</Label>
                                            <Select
                                                value={filters.provider}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, provider: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All providers" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All providers</SelectItem>
                                                    <SelectItem value="hostycare">Hostycare</SelectItem>
                                                    <SelectItem value="smartvps">SmartVPS</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Operating System</Label>
                                            <Select
                                                value={filters.os}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, os: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All OS" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All OS</SelectItem>
                                                    <SelectItem value="windows">Windows</SelectItem>
                                                    <SelectItem value="ubuntu">Ubuntu</SelectItem>
                                                    <SelectItem value="centos">CentOS</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provisioning Type</Label>
                                            <Select
                                                value={filters.autoProvisioned}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, autoProvisioned: value === 'All' ? '' : value }))}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="All types" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="All">All types</SelectItem>
                                                    <SelectItem value="auto">Auto-Provisioned</SelectItem>
                                                    <SelectItem value="manual">Manual</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Date Range</Label>
                                            <div className="flex gap-2">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {filters.dateFrom ? format(filters.dateFrom, "MMM dd, yyyy") : "From date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <CalendarComponent
                                                            mode="single"
                                                            selected={filters.dateFrom}
                                                            onSelect={(date) => setFilters(prev => ({ ...prev, dateFrom: date }))}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>

                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {filters.dateTo ? format(filters.dateTo, "MMM dd, yyyy") : "To date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <CalendarComponent
                                                            mode="single"
                                                            selected={filters.dateTo}
                                                            onSelect={(date) => setFilters(prev => ({ ...prev, dateTo: date }))}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Results summary and Pagination Controls */}
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                                Showing {Math.min((pagination.page - 1) * pagination.limit + 1, filteredOrders.length)}-
                                {Math.min(pagination.page * pagination.limit, filteredOrders.length)} of {filteredOrders.length} orders
                                {hasActiveFilters && " (filtered)"}
                            </span>
                            
                            {totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={pagination.limit.toString()}
                                        onValueChange={(value) => setPagination(prev => ({ ...prev, limit: parseInt(value), page: 1 }))}
                                    >
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="25">25</SelectItem>
                                            <SelectItem value="50">50</SelectItem>
                                            <SelectItem value="100">100</SelectItem>
                                            <SelectItem value="200">200</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <span className="text-muted-foreground">per page</span>
                                    
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                                            disabled={pagination.page === 1}
                                        >
                                            <ChevronsLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                            disabled={pagination.page === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium px-2">
                                            Page {pagination.page} of {totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                            disabled={pagination.page === totalPages}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setPagination(prev => ({ ...prev, page: totalPages }))}
                                            disabled={pagination.page === totalPages}
                                        >
                                            <ChevronsRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="p-6">
                        <div className="rounded-lg border bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">Customer</TableHead>
                                        <TableHead className="w-[200px]">Product</TableHead>
                                        <TableHead className="w-[80px]">Memory</TableHead>
                                        <TableHead className="w-[90px]">Price</TableHead>
                                        <TableHead className="w-[100px]">Status</TableHead>
                                        <TableHead className="w-[140px]">Provisioning</TableHead>
                                        <TableHead className="w-[90px]">Provider</TableHead>
                                        <TableHead className="w-[120px]">IP Address</TableHead>
                                        <TableHead className="w-[100px]">Date</TableHead>
                                        <TableHead className="w-[180px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-32 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Loader2 className="h-6 w-6 animate-spin" />
                                                    <span>Loading orders...</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : paginatedOrders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                                                {hasActiveFilters ? 'No orders match your search criteria.' : 'No orders found.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedOrders.map(order => (
                                            <TableRow key={order._id} className="hover:bg-muted/50">
                                                <TableCell>
                                                    <div className="space-y-0.5">
                                                        <div className="font-medium text-sm">{order.user?.name || 'N/A'}</div>
                                                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                                                            {order.user?.email}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm font-medium line-clamp-2">{order.productName}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{order.memory}</Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">₹{order.price}</TableCell>
                                                <TableCell>
                                                    {getStatusBadge(order.status)}
                                                </TableCell>
                                                <TableCell>
                                                    {getProvisioningStatusBadge(order)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {order.provider || 'hostycare'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                        {order.ipAddress || 'Pending'}
                                                    </code>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs">
                                                        {format(new Date(order.createdAt), "MMM dd, yyyy")}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleEdit(order)}
                                                            className="gap-1 h-8"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                            Edit
                                                        </Button>

                                                        {/* Show provision button for: 1) Non-provisioned orders 2) Failed SmartVPS orders that need retry */}
                                                        {(
                                                            ((order.status === 'paid' || order.status === 'confirmed') && !order.autoProvisioned) ||
                                                            (order.provider === 'smartvps' && order.provisioningStatus === 'failed') ||
                                                            (order.provider === 'smartvps' && order.status === 'confirmed' && !order.ipAddress)
                                                        ) && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleProvision(order)}
                                                                disabled={provisioning === order._id}
                                                                className="gap-1 h-8"
                                                                variant={order.provisioningStatus === 'failed' ? 'destructive' : 'default'}
                                                            >
                                                                {provisioning === order._id ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <Play className="w-3.5 h-3.5" />
                                                                )}
                                                                {order.provisioningStatus === 'failed' ? 'Retry' : 'Provision'}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            {/* Edit Dialog - FULLY EDITABLE */}
            {isDialogOpen && editingOrder && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                Edit Order Details
                            </DialogTitle>
                            <DialogDescription>
                                Update all order information. Changes will be saved to the database.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Basic Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Order Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Order ID</Label>
                                        <Input value={editingOrder._id} readOnly className="bg-muted font-mono text-xs" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Transaction ID</Label>
                                        <Input value={editingOrder.transactionId || 'N/A'} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Product Name</Label>
                                        <Input value={editingOrder.productName} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Memory</Label>
                                        <Input value={editingOrder.memory} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Order Status *</Label>
                                        <Select
                                            value={editingOrder.status}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, status: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="paid">Paid</SelectItem>
                                                <SelectItem value="confirmed">Confirmed</SelectItem>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="completed">Completed</SelectItem>
                                                <SelectItem value="invalid">Invalid</SelectItem>
                                                <SelectItem value="expired">Expired</SelectItem>
                                                <SelectItem value="failed">Failed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Provisioning Status *</Label>
                                        <Select
                                            value={editingOrder.provisioningStatus || 'none'}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, provisioningStatus: value === 'none' ? undefined : value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Not Set</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="provisioning">Provisioning</SelectItem>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="failed">Failed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Server Configuration */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Server Configuration</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Provider *</Label>
                                        <Select
                                            value={editingOrder.provider || 'hostycare'}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, provider: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="hostycare">Hostycare</SelectItem>
                                                <SelectItem value="smartvps">SmartVPS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Operating System *</Label>
                                        <Select
                                            value={editingOrder.os || 'Ubuntu 22'}
                                            onValueChange={(value) => setEditingOrder({ ...editingOrder, os: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Ubuntu 22">Ubuntu 22</SelectItem>
                                                <SelectItem value="Ubuntu 20">Ubuntu 20</SelectItem>
                                                <SelectItem value="CentOS 7">CentOS 7</SelectItem>
                                                <SelectItem value="CentOS 8">CentOS 8</SelectItem>
                                                <SelectItem value="Windows 2022 64">Windows 2022 64</SelectItem>
                                                <SelectItem value="Windows 2019 64">Windows 2019 64</SelectItem>
                                                <SelectItem value="Windows 2016 64">Windows 2016 64</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Server Credentials */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Server Credentials</h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>IP Address *</Label>
                                        <Input
                                            value={editingOrder.ipAddress || ''}
                                            onChange={(e) => setEditingOrder({ ...editingOrder, ipAddress: e.target.value })}
                                            placeholder="Enter IP address (e.g., 103.177.114.195 or 103.177.114.195:49965)"
                                            className="font-mono"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            For Windows Hostycare orders, include port :49965
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Username *</Label>
                                            <Input
                                                value={editingOrder.username || ''}
                                                onChange={(e) => setEditingOrder({ ...editingOrder, username: e.target.value })}
                                                placeholder="Enter username (e.g., root or Administrator)"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Password *</Label>
                                            <Input
                                                type="text"
                                                value={editingOrder.password || ''}
                                                onChange={(e) => setEditingOrder({ ...editingOrder, password: e.target.value })}
                                                placeholder="Enter password"
                                                className="font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Service IDs */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Service Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {editingOrder.hostycareServiceId && (
                                        <div className="space-y-2">
                                            <Label>Hostycare Service ID</Label>
                                            <Input
                                                value={editingOrder.hostycareServiceId}
                                                readOnly
                                                className="bg-muted font-mono text-sm"
                                            />
                                        </div>
                                    )}
                                    {editingOrder.smartvpsServiceId && (
                                        <div className="space-y-2">
                                            <Label>SmartVPS Service ID</Label>
                                            <Input
                                                value={editingOrder.smartvpsServiceId}
                                                readOnly
                                                className="bg-muted font-mono text-sm"
                                            />
                                        </div>
                                    )}
                                    {editingOrder.expiryDate && (
                                        <div className="space-y-2">
                                            <Label>Expiry Date</Label>
                                            <Input
                                                value={format(new Date(editingOrder.expiryDate), 'PPP')}
                                                readOnly
                                                className="bg-muted"
                                            />
                                        </div>
                                    )}
                                    {editingOrder.autoProvisioned && (
                                        <div className="space-y-2">
                                            <Label>Provisioning Type</Label>
                                            <Badge variant="outline" className="w-full justify-center py-2">
                                                Auto-Provisioned
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Error Display */}
                            {editingOrder.provisioningError && (
                                <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <h4 className="font-medium text-destructive mb-1">Provisioning Error</h4>
                                            <p className="text-sm text-destructive/90">
                                                {editingOrder.provisioningError}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Customer Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold border-b pb-2">Customer Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Customer Name</Label>
                                        <Input value={editingOrder.user?.name || 'N/A'} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Customer Email</Label>
                                        <Input value={editingOrder.user?.email || 'N/A'} readOnly className="bg-muted" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Created At</Label>
                                        <Input
                                            value={format(new Date(editingOrder.createdAt), 'PPP p')}
                                            readOnly
                                            className="bg-muted"
                                        />
                                    </div>
                                    {editingOrder.lastActionTime && (
                                        <div className="space-y-2">
                                            <Label>Last Action</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={editingOrder.lastAction || 'N/A'}
                                                    readOnly
                                                    className="bg-muted flex-1"
                                                />
                                                <Input
                                                    value={format(new Date(editingOrder.lastActionTime), 'PPP')}
                                                    readOnly
                                                    className="bg-muted flex-1"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 mt-6">
                            <DialogClose asChild>
                                <Button variant="outline" disabled={updating}>
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button onClick={handleUpdate} disabled={updating} className="gap-2">
                                {updating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Auto-Provisioning Confirmation Dialog */}
            {isProvisioningDialogOpen && currentOrder && (
                <Dialog open={isProvisioningDialogOpen} onOpenChange={setIsProvisioningDialogOpen}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Auto-Provision Server</DialogTitle>
                            <DialogDescription>
                                Start automatic server provisioning for this order?
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="border rounded-lg p-4 bg-muted/50">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-full bg-primary/10">
                                        <Play className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium mb-2">Auto-Provisioning will:</h4>
                                        <ul className="text-sm space-y-1 text-muted-foreground">
                                            <li>• Create server automatically via API</li>
                                            <li>• Generate secure credentials</li>
                                            <li>• Configure hostname and settings</li>
                                            <li>• Update order status to active</li>
                                            <li>• Set expiry date (30 days)</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <Label className="text-muted-foreground">Product:</Label>
                                    <p className="font-medium">{currentOrder.productName}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Memory:</Label>
                                    <p className="font-medium">{currentOrder.memory}</p>
                                </div>
                            </div>

                            {currentOrder.provisioningError && (
                                <div className="border border-destructive/50 rounded-lg p-3 bg-destructive/5">
                                    <Label className="text-destructive font-medium">Previous Error:</Label>
                                    <p className="text-sm text-destructive/80 mt-1">
                                        {currentOrder.provisioningError}
                                    </p>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="gap-2">
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button
                                onClick={() => handleAutoProvision(currentOrder._id)}
                                disabled={provisioning === currentOrder._id}
                                className="gap-2"
                            >
                                {provisioning === currentOrder._id ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Provisioning...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4" />
                                        Start Auto-Provision
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default ManageOrders;
