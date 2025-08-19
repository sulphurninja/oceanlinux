'use client';

import { useEffect, useState } from 'react';
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
import { Eye, Settings, Play, RotateCcw, Loader2, AlertCircle, CheckCircle, Wrench, Search, Filter, Calendar, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';

interface Order {
    _id: string;
    user: {
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
    autoProvisioned?: boolean;
    ipAddress?: string;
    username?: string;
    password?: string;
    os: string;
    transactionId: string;
    createdAt: string;
}

interface FilterState {
    status: string;
    provisioningStatus: string;
    autoProvisioned: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
}

const ManageOrders = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isProvisioningDialogOpen, setIsProvisioningDialogOpen] = useState(false);
    const [provisioning, setProvisioning] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<FilterState>({
        status: '',
        provisioningStatus: '',
        autoProvisioned: '',
        dateFrom: undefined,
        dateTo: undefined,
    });
    const [showFilters, setShowFilters] = useState(false);
    const [batchProvisioning, setBatchProvisioning] = useState(false);
    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const response = await fetch(`/api/admin/orders?t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
            });
            const data = await response.json();
            setOrders(data);
        } catch {
            toast.error('Failed to fetch orders');
        }
    };

    const handleEdit = (order: Order) => {
        setCurrentOrder({ ...order });
        setIsDialogOpen(true);
    };

    const handleProvision = (order: Order) => {
        setCurrentOrder(order);
        setIsProvisioningDialogOpen(true);
    };

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
                toast.success('Server provisioning started successfully!');
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
        if (currentOrder) {
            try {
                const response = await fetch(`/api/orders/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: currentOrder._id,
                        ipAddress: currentOrder.ipAddress,
                        username: currentOrder.username,
                        password: currentOrder.password,
                        os: currentOrder.os,
                        status: currentOrder.status
                    })
                });

                if (response.ok) {
                    setOrders(prev => prev.map(order =>
                        order._id === currentOrder._id ? currentOrder : order
                    ));
                    toast.success('Order updated successfully!');
                    setIsDialogOpen(false);
                } else {
                    throw new Error('Failed to update order');
                }
            } catch (error) {
                toast.error('Failed to update order');
            }
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge variant="default">{status}</Badge>;
            case 'confirmed':
                return <Badge className="bg-green-600 hover:bg-green-700 text-white">{status}</Badge>;
            case 'completed':
                return <Badge variant="default">{status}</Badge>;
            case 'pending':
                return <Badge variant="outline">{status}</Badge>;
            case 'paid':
                return <Badge variant="secondary">{status}</Badge>;
            case 'invalid':
            case 'expired':
                return <Badge variant="destructive">{status}</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getProvisioningStatusBadge = (order: Order) => {
        if (order.autoProvisioned) {
            switch (order.provisioningStatus) {
                case 'provisioning':
                    return (
                        <Badge variant="outline" className="gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Auto-Provisioning
                        </Badge>
                    );
                case 'active':
                    return (
                        <Badge variant="default" className="gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Auto-Provisioned
                        </Badge>
                    );
                case 'failed':
                    return (
                        <Badge variant="destructive" className="gap-1">
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
                <Badge variant="secondary" className="gap-1">
                    <Wrench className="w-3 h-3" />
                    Manual Setup
                </Badge>
            );
        }
        return (
            <Badge variant="outline">
                Not Provisioned
            </Badge>
        );
    };

    // Filter and search logic
    const filteredOrders = orders.filter(order => {
        // Text search
        const matchesSearch = !searchTerm ||
            order.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.transactionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.ipAddress && order.ipAddress.toLowerCase().includes(searchTerm.toLowerCase()));

        // Status filter
        const matchesStatus = !filters.status || order.status === filters.status;

        // Provisioning status filter
        let matchesProvisioningStatus = true;
        if (filters.provisioningStatus) {
            if (filters.provisioningStatus === 'not_provisioned') {
                matchesProvisioningStatus = !order.autoProvisioned && (!order.ipAddress || !order.username);
            } else if (filters.provisioningStatus === 'manual_setup') {
                matchesProvisioningStatus = !order.autoProvisioned && order.ipAddress && order.username;
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
        const matchesDateTo = !filters.dateTo || orderDate <= new Date(filters.dateTo.getTime() + 24 * 60 * 60 * 1000); // Include end date

        return matchesSearch && matchesStatus && matchesProvisioningStatus && matchesAutoProvisioned && matchesDateFrom && matchesDateTo;
    });

    // Stats calculations - Updated to show only specific cards
    const stats = {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        confirmed: orders.filter(o => o.status === 'confirmed').length, // Changed from paid to confirmed
        totalRevenue: orders.filter(o => o.status === 'active' || o.status === 'paid' || o.status === 'confirmed').reduce((sum, o) => sum + o.price, 0),
    };

    const clearFilters = () => {
        setFilters({
            status: '',
            provisioningStatus: '',
            autoProvisioned: '',
            dateFrom: undefined,
            dateTo: undefined,
        });
        setSearchTerm('');
    };

    const hasActiveFilters = searchTerm || filters.status || filters.provisioningStatus || filters.autoProvisioned || filters.dateFrom || filters.dateTo;

    return (
        <div className="h-full flex flex-col">
            {/* Mobile Header */}
            <div className="lg:hidden h-16" />

            {/* Page Header */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex flex-col gap-6 p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Manage Orders</h1>
                            <p className="text-muted-foreground mt-1">
                                Monitor and manage customer server orders
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="default"
                                onClick={handleBatchAutoProvision}
                                disabled={batchProvisioning}
                                className="gap-2"
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
                            <Button variant="outline" onClick={fetchOrders} className="gap-2">
                                <RotateCcw className="w-4 h-4" />
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {/* Updated Stats Cards - Only showing 3 cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.total}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Paid (Confirmed)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.confirmed}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.pending}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Revenue Card - Separate row */}
                    {/* <div className="grid grid-cols-1 max-w-sm">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </div> */}

                    {/* Search and Filters */}
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search orders..."
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
                                    Filter
                                    {hasActiveFilters && (
                                        <Badge variant="secondary" className="ml-1 px-1 py-0 text-xs">
                                            {[searchTerm, filters.status, filters.provisioningStatus, filters.autoProvisioned, filters.dateFrom, filters.dateTo].filter(Boolean).length}
                                        </Badge>
                                    )}
                                </Button>
                                {hasActiveFilters && (
                                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                                        <X className="w-4 h-4" />
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Filter Panel */}
                        {showFilters && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg">Filters</CardTitle>
                                    <CardDescription>Filter orders by status, provisioning, and date range</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-2">
                                            <Label>Order Status</Label>
                                            <Select
                                                value={filters.status}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
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
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Provisioning Status</Label>
                                            <Select
                                                value={filters.provisioningStatus}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, provisioningStatus: value }))}
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
                                            <Label>Provisioning Type</Label>
                                            <Select
                                                value={filters.autoProvisioned}
                                                onValueChange={(value) => setFilters(prev => ({ ...prev, autoProvisioned: value }))}
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

                                        <div className="space-y-2">
                                            <Label>Date Range</Label>
                                            <div className="flex gap-2">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {filters.dateFrom ? format(filters.dateFrom, "MMM dd") : "From"}
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
                                                            {filters.dateTo ? format(filters.dateTo, "MMM dd") : "To"}
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

                        {/* Results summary */}
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>
                                Showing {filteredOrders.length} of {orders.length} orders
                                {hasActiveFilters && " (filtered)"}
                            </span>
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
                                        <TableHead className="w-[200px]">Customer</TableHead>
                                        <TableHead className="w-[180px]">Product</TableHead>
                                        <TableHead className="w-[100px]">Memory</TableHead>
                                        <TableHead className="w-[100px]">Price</TableHead>
                                        <TableHead className="w-[120px]">Status</TableHead>
                                        <TableHead className="w-[160px]">Provisioning</TableHead>
                                        <TableHead className="w-[140px]">Transaction ID</TableHead>
                                        <TableHead className="w-[120px]">Date</TableHead>
                                        <TableHead className="w-[200px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredOrders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                                {hasActiveFilters ? 'No orders match your search criteria.' : 'No orders found.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredOrders.map(order => (
                                            <TableRow key={order._id}>
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        <div className="font-medium">{order.user?.name || 'N/A'}</div>
                                                        <div className="text-sm text-muted-foreground truncate">
                                                            {order.user?.email}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium">{order.productName}</TableCell>
                                                <TableCell>{order.memory}</TableCell>
                                                <TableCell>₹{order.price}</TableCell>
                                                <TableCell>
                                                    {getStatusBadge(order.status)}
                                                </TableCell>
                                                <TableCell>
                                                    {getProvisioningStatusBadge(order)}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm font-mono text-muted-foreground truncate max-w-[120px]" title={order.transactionId}>
                                                        {order.transactionId || 'N/A'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        {format(new Date(order.createdAt), "MMM dd, yyyy")}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleEdit(order)}
                                                            className="gap-1"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                            {order.autoProvisioned ? 'View' : 'Edit'}
                                                        </Button>

                                                        {((order.status === 'paid' || order.status === 'confirmed') &&
                                                            (!order.autoProvisioned || order.provisioningStatus === 'failed')) && (
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleProvision(order)}
                                                                    disabled={provisioning === order._id}
                                                                    className="gap-1"
                                                                >
                                                                    {provisioning === order._id ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <Play className="w-4 h-4" />
                                                                    )}
                                                                    Auto-Provision
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

            {/* Manual Edit Dialog */}
            {isDialogOpen && currentOrder && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl">
                                {currentOrder.autoProvisioned ? 'View Order Details' : 'Edit Order Details'}
                            </DialogTitle>
                            <DialogDescription>
                                {currentOrder.autoProvisioned
                                    ? 'View server information (auto-provisioned)'
                                    : 'Update order information and server credentials manually'
                                }
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                            {/* Basic Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold">Order Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Product Name</Label>
                                        <Input
                                            value={currentOrder.productName}
                                            readOnly
                                            className="bg-muted"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Memory</Label>
                                        <Input
                                            value={currentOrder.memory}
                                            readOnly
                                            className="bg-muted"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select
                                            value={currentOrder.status}
                                            onValueChange={(value) => setCurrentOrder({ ...currentOrder, status: value })}
                                            disabled={currentOrder.autoProvisioned}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="completed">Completed</SelectItem>
                                                <SelectItem value="invalid">Invalid</SelectItem>
                                                <SelectItem value="confirmed">Confirmed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Operating System</Label>
                                        <Select
                                            value={currentOrder.os}
                                            onValueChange={(value) => setCurrentOrder({ ...currentOrder, os: value })}
                                            disabled={currentOrder.autoProvisioned}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="CentOS 7">CentOS 7</SelectItem>
                                                <SelectItem value="Ubuntu 22">Ubuntu 22</SelectItem>
                                                <SelectItem value="Windows 2022 64">Windows 2022 64</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Server Credentials Section */}
                            <div className="space-y-4 border-t pt-6">
                                <div className="flex items-center gap-2">
                                    <Settings className="w-5 h-5" />
                                    <h3 className="text-lg font-semibold">Server Credentials</h3>
                                    {currentOrder.autoProvisioned && (
                                        <Badge variant="outline" className="text-xs">
                                            Auto-Generated
                                        </Badge>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>IP Address</Label>
                                        <Input
                                            value={currentOrder.ipAddress || ''}
                                            onChange={(e) => setCurrentOrder({ ...currentOrder, ipAddress: e.target.value })}
                                            placeholder="Enter IP address"
                                            readOnly={currentOrder.autoProvisioned}
                                            className={currentOrder.autoProvisioned ? "bg-muted" : ""}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Username</Label>
                                            <Input
                                                value={currentOrder.username || ''}
                                                onChange={(e) => setCurrentOrder({ ...currentOrder, username: e.target.value })}
                                                placeholder="Enter username"
                                                readOnly={currentOrder.autoProvisioned}
                                                className={currentOrder.autoProvisioned ? "bg-muted" : ""}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Password</Label>
                                            <Input
                                                type="password"
                                                value={currentOrder.password || ''}
                                                onChange={(e) => setCurrentOrder({ ...currentOrder, password: e.target.value })}
                                                placeholder="Enter password"
                                                readOnly={currentOrder.autoProvisioned}
                                                className={currentOrder.autoProvisioned ? "bg-muted" : ""}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Error Display */}
                            {currentOrder.provisioningError && (
                                <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                                        <div>
                                            <h4 className="font-medium text-destructive">Provisioning Error</h4>
                                            <p className="text-sm text-destructive/80 mt-1">
                                                {currentOrder.provisioningError}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Service ID Display */}
                            {currentOrder.hostycareServiceId && (
                                <div className="border rounded-lg p-4 bg-muted/50">
                                    <h4 className="font-medium mb-2">Hostycare Service ID</h4>
                                    <code className="text-sm bg-background px-2 py-1 rounded border">
                                        {currentOrder.hostycareServiceId}
                                    </code>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="gap-2">
                            <DialogClose asChild>
                                <Button variant="outline">Close</Button>
                            </DialogClose>
                            {!currentOrder.autoProvisioned && (
                                <Button onClick={handleUpdate}>Update Order</Button>
                            )}
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
                                Start automatic server provisioning via Hostycare API for this order?
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
                                            <li>• Create server automatically via Hostycare API</li>
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
