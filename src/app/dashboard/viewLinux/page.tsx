'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Eye,
    User,
    CheckCircle,
    XCircle,
    Computer,
    ArrowLeft,
    Copy,
    Server,
    Lock,
    Clock,
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
    X
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Order {
    _id: string;
    productName: string;
    os: string;
    memory: string;
    status: string;
    ipAddress?: string;
    username?: string;
    password?: string;
    expiryDate?: Date;
    createdAt?: Date;
    hostycareServiceId?: string;
    provisioningStatus?: string;
    price?: number;
}

// OS Icon Component
const OSIcon = ({ os, className = "h-8 w-8" }: { os: string; className?: string }) => {
    const osLower = os.toLowerCase();

    if (osLower.includes('ubuntu')) {
        return (
            <div className={`${className}  rounded-lg flex items-center justify-center shadow-sm`}>
                <img src='/ubuntu.png' className={`${className} rounded-lg object-cover`} alt={os} />
            </div>
        );
    } else if (osLower.includes('centos')) {
        return (
            <div className={`${className}  rounded-lg flex items-center justify-center shadow-sm`}>
                <img src='/centos.png' className={`${className} rounded-lg object-cover`} alt={os} />
            </div>
        );
    } else if (osLower.includes('windows')) {
        return (
            <div className={`${className}  rounded-lg flex items-center justify-center shadow-sm`}>
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
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    // VPS Management states
    const [serviceDetails, setServiceDetails] = useState<any | null>(null);
    const [serviceLoading, setServiceLoading] = useState(false);
    const [actionBusy, setActionBusy] = useState<string | null>(null);

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
                    order.username?.toLowerCase().includes(query)
                );
            });
            setFilteredOrders(filtered);
        }
    }, [orders, searchQuery]);
    const clearSearch = () => {
        setSearchQuery('');
    };

    const loadServiceDetails = async (order: Order) => {
        if (!order.hostycareServiceId) return;
        setServiceLoading(true);
        try {
            const res = await fetch(`/api/orders/service-action?orderId=${order._id}`);
            const data = await res.json();
            if (data.success) {
                setServiceDetails(data);
                // Update the selected order with the latest synced data
                await refreshOrderData(order._id);
            }
        } catch (error) {
            toast.error('Failed to load service details');
        } finally {
            setServiceLoading(false);
        }
    };

    const runServiceAction = async (order: Order, action: string, payload?: any) => {
        setActionBusy(action);
        try {
            const res = await fetch('/api/orders/service-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: order._id, action, payload })
            });
            const data = await res.json();

            if (data.success) {
                toast.success(`Action "${action}" executed successfully`);

                // Refresh both service details and order data
                await Promise.all([
                    loadServiceDetails(order),
                    refreshOrderData(order._id)
                ]);

                // Show additional feedback for specific actions
                if (action === 'changepassword' || action === 'reinstall') {
                    toast.success('Password updated in your records');
                }
            } else {
                toast.error(data.error || `Failed to execute "${action}"`);
            }
        } catch (e: any) {
            toast.error(e.message || `Failed to execute "${action}"`);
        } finally {
            setActionBusy(null);
        }
    };

    // New function to refresh a specific order's data
    const refreshOrderData = async (orderId: string) => {
        try {
            const response = await fetch(`/api/orders/${orderId}`);
            if (response.ok) {
                const updatedOrder = await response.json();

                // Update the orders list
                setOrders(prev => prev.map(order =>
                    order._id === orderId ? updatedOrder : order
                ));

                // Update the selected order if it's the same one
                if (selectedOrder?._id === orderId) {
                    setSelectedOrder(updatedOrder);
                }
            }
        } catch (error) {
            console.error('Failed to refresh order data:', error);
        }
    };

    const handleDialogOpen = (order: Order) => {
        setSelectedOrder(order);
        setShowPassword(false);
        setServiceDetails(null);
        if (order.hostycareServiceId) {
            loadServiceDetails(order);
        }
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        toast.success(`${field} copied to clipboard`);
        setTimeout(() => setCopied(null), 2000);
    };

    // ... existing code ...

    const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string) => {
        const currentStatus = provisioningStatus || status;

        // Show transitional states based on last action
        if (lastAction && actionBusy === null) {
            switch (lastAction) {
                case 'start':
                    if (currentStatus === 'active') {
                        return (
                            <Badge className="bg-green-50 text-green-700 border-green-200">
                                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                Running
                            </Badge>
                        );
                    }
                    break;
                case 'stop':
                    if (currentStatus === 'suspended') {
                        return (
                            <Badge className="bg-gray-50 text-gray-700 border-gray-200">
                                <Square className="w-3 h-3 mr-1" />
                                Stopped
                            </Badge>
                        );
                    }
                    break;
                case 'reboot':
                    return (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Rebooting
                        </Badge>
                    );
                case 'reinstall':
                    if (currentStatus === 'provisioning') {
                        return (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                Reinstalling
                            </Badge>
                        );
                    }
                    break;
            }
        }

        // Default status badges - FIXED: Handle completed status properly
        switch (currentStatus.toLowerCase()) {
            case 'active':
                return (
                    <Badge className="bg-green-50 text-green-700 border-green-200">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        Active
                    </Badge>
                );
            case 'completed':
                return (
                    <Badge className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Completed
                    </Badge>
                );
            case 'pending':
                return (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                    </Badge>
                );
            case 'provisioning':
                return (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        Provisioning
                    </Badge>
                );
            case 'suspended':
                return (
                    <Badge className="bg-orange-50 text-orange-700 border-orange-200">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Suspended
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge className="bg-red-50 text-red-700 border-red-200">
                        <XCircle className="w-3 h-3 mr-1" />
                        Failed
                    </Badge>
                );
            case 'terminated':
                return (
                    <Badge className="bg-red-50 text-red-700 border-red-200">
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

    const getDaysUntilExpiry = (expiryDate: Date | string) => {
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    return (
        <div className='min-h-screen bg-background'>
            {/* Header */}
            <div className='sticky top-0 z-40 border-b bg-background/95 backdrop-blur'>
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
                                <h1 className='text-xl font-bold'>Order Management</h1>
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
                                placeholder="Search by IP, name, OS, or username..."
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
                            <Card key={order._id} className="hover:shadow-md transition-shadow">
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
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            {getStatusBadge(order.status, order.provisioningStatus, order.lastAction)}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDialogOpen(order)}
                                                className="gap-2"
                                            >
                                                <Eye className="h-4 w-4" />
                                                View Details
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Updated Server Details Dialog */}
                <Dialog open={Boolean(selectedOrder)} onOpenChange={() => setSelectedOrder(null)}>
                    <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
                        {selectedOrder && (
                            <>
                                <DialogHeader className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-4">
                                            <OSIcon os={selectedOrder.os} className="h-14 w-14" />
                                            <div>
                                                <DialogTitle className="text-2xl font-bold">
                                                    {styleText(selectedOrder.productName)}
                                                </DialogTitle>
                                                <DialogDescription className="text-base mt-1">
                                                    {selectedOrder.os} • Created {selectedOrder.createdAt ? formatDate(selectedOrder.createdAt) : 'Unknown'}
                                                    {selectedOrder.lastSyncTime && (
                                                        <span className="block text-sm text-muted-foreground mt-1">
                                                            Last synced: {formatDate(selectedOrder.lastSyncTime)}
                                                        </span>
                                                    )}
                                                </DialogDescription>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(selectedOrder.status, selectedOrder.provisioningStatus, selectedOrder.lastAction)}
                                        </div>
                                    </div>
                                </DialogHeader>
                                <Tabs defaultValue="connection" className="w-full">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="overview">Overview</TabsTrigger>
                                        <TabsTrigger value="connection">Connection Details</TabsTrigger>
                                        <TabsTrigger value="management" disabled={!selectedOrder.hostycareServiceId}>
                                            Manage Instance
                                        </TabsTrigger>
                                    </TabsList>

                                    {/* Overview Tab */}
                                    <TabsContent value="overview" className="space-y-6">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2">
                                                    <Server className="h-5 w-5" />
                                                    Server Specifications
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                    <div className="p-4 bg-blue-300 rounded-lg border border-blue-200">
                                                        <div className="flex items-center gap-3">
                                                            <Terminal className="h-8 w-8 text-blue-600" />
                                                            <div>
                                                                <p className="text-xs font-medium text-blue-600 uppercase">OS</p>
                                                                <p className="font-semibold text-blue-900">{selectedOrder.os}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="p-4 bg-purple-300 rounded-lg border border-purple-200">
                                                        <div className="flex items-center gap-3">
                                                            <MemoryStick className="h-8 w-8 text-purple-600" />
                                                            <div>
                                                                <p className="text-xs font-medium text-purple-600 uppercase">Memory</p>
                                                                <p className="font-semibold text-purple-900">{selectedOrder.memory}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="p-4 bg-green-300 rounded-lg border border-green-200">
                                                        <div className="flex items-center gap-3">
                                                            <Activity className="h-8 w-8 text-green-600" />
                                                            <div>
                                                                <p className="text-xs font-medium text-green-600 uppercase">Status</p>
                                                                <p className="font-semibold text-green-900 capitalize">
                                                                    {selectedOrder.provisioningStatus || selectedOrder.status}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                        {/* Recent Activity Card */}
                                        {(selectedOrder.lastAction || selectedOrder.lastActionTime) && (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Activity className="h-5 w-5" />
                                                        Recent Activity
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                                            {selectedOrder.lastAction === 'start' && <Play className="h-4 w-4 text-blue-600" />}
                                                            {selectedOrder.lastAction === 'stop' && <Square className="h-4 w-4 text-blue-600" />}
                                                            {selectedOrder.lastAction === 'reboot' && <RefreshCw className="h-4 w-4 text-blue-600" />}
                                                            {selectedOrder.lastAction === 'changepassword' && <KeyRound className="h-4 w-4 text-blue-600" />}
                                                            {selectedOrder.lastAction === 'reinstall' && <LayoutTemplate className="h-4 w-4 text-blue-600" />}
                                                            {!selectedOrder.lastAction && <Activity className="h-4 w-4 text-blue-600" />}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-blue-900">
                                                                {selectedOrder.lastAction ?
                                                                    `Last action: ${selectedOrder.lastAction.charAt(0).toUpperCase() + selectedOrder.lastAction.slice(1)}`
                                                                    : 'Server Activity'
                                                                }
                                                            </p>
                                                            {selectedOrder.lastActionTime && (
                                                                <p className="text-sm text-blue-600">
                                                                    {formatDate(selectedOrder.lastActionTime)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                        {selectedOrder.expiryDate && (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Calendar className="h-5 w-5" />
                                                        Service Timeline
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="p-4 bg-blue-900 rounded-lg border border-blue-200">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="font-semibold text-blue-200">Service Expires</p>
                                                                <p className="text-sm text-white -600">
                                                                    {formatDate(selectedOrder.expiryDate)}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-2xl font-bold text-white -900">
                                                                    {getDaysUntilExpiry(selectedOrder.expiryDate)}
                                                                </p>
                                                                <p className="text-sm text-blue-200">days left</p>
                                                            </div>
                                                        </div>

                                                        {getDaysUntilExpiry(selectedOrder.expiryDate) > 0 && (
                                                            <div className="mt-4">
                                                                <Progress
                                                                    value={Math.max(0, 100 - (getDaysUntilExpiry(selectedOrder.expiryDate) / 30) * 100)}
                                                                    className="h-2"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </TabsContent>

                                    {/* Connection Tab */}
                                    <TabsContent value="connection" className="space-y-6">
                                        {selectedOrder.ipAddress && selectedOrder.username ? (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Network className="h-5 w-5" />
                                                        Connection Details
                                                    </CardTitle>
                                                    <CardDescription>
                                                        Use these credentials to connect to your server
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                    {/* IP Address */}
                                                    <div className="space-y-2">
                                                        <Label className="flex items-center gap-2">
                                                            <Globe className="h-4 w-4" />
                                                            Server IP Address
                                                        </Label>
                                                        <div className="flex gap-2">
                                                            <Input
                                                                readOnly
                                                                value={selectedOrder.ipAddress}
                                                                className="font-mono"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => copyToClipboard(selectedOrder.ipAddress!, 'IP Address')}
                                                            >
                                                                {copied === 'IP Address' ? (
                                                                    <Check className="h-4 w-4 text-green-600" />
                                                                ) : (
                                                                    <Copy className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Username */}
                                                    <div className="space-y-2">
                                                        <Label className="flex items-center gap-2">
                                                            <User className="h-4 w-4" />
                                                            Username
                                                        </Label>
                                                        <div className="flex gap-2">
                                                            <Input
                                                                readOnly
                                                                value={selectedOrder.username}
                                                                className="font-mono"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => copyToClipboard(selectedOrder.username!, 'Username')}
                                                            >
                                                                {copied === 'Username' ? (
                                                                    <Check className="h-4 w-4 text-green-600" />
                                                                ) : (
                                                                    <Copy className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Password */}
                                                    <div className="space-y-2">
                                                        <Label className="flex items-center gap-2">
                                                            <Lock className="h-4 w-4" />
                                                            Password
                                                        </Label>
                                                        <div className="flex gap-2">
                                                            <Input
                                                                readOnly
                                                                type={showPassword ? "text" : "password"}
                                                                value={selectedOrder.password || ''}
                                                                className="font-mono"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => setShowPassword(!showPassword)}
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => copyToClipboard(selectedOrder.password || '', 'Password')}
                                                            >
                                                                {copied === 'Password' ? (
                                                                    <Check className="h-4 w-4 text-green-600" />
                                                                ) : (
                                                                    <Copy className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* SSH Command */}
                                                    <div className="p-4 bg-gray-900 rounded-lg">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-green-400 font-semibold">SSH Connection</span>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => copyToClipboard(`ssh ${selectedOrder.username}@${selectedOrder.ipAddress}`, 'SSH Command')}
                                                                className="text-green-400 hover:bg-green-400/20"
                                                            >
                                                                <Copy className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                        <code className="text-green-300 font-mono text-sm">
                                                            ssh {selectedOrder.username}@{selectedOrder.ipAddress}
                                                        </code>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <Card>
                                                <CardContent className="text-center py-12">
                                                    <Clock className="h-16 w-16 text-amber-600 mx-auto mb-4" />
                                                    <h3 className="text-xl font-semibold mb-2">Server Setup in Progress</h3>
                                                    <p className="text-muted-foreground mb-4">
                                                        Your server is being configured. Connection details will appear here once ready.
                                                    </p>
                                                    <div className="text-sm text-amber-600">
                                                        ⏱️ Estimated setup time: 5-10 minutes
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </TabsContent>

                                    {/* Management Tab */}
                                    <TabsContent value="management" className="space-y-6">
                                        {selectedOrder.hostycareServiceId ? (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Settings className="h-5 w-5" />
                                                        Server Management
                                                    </CardTitle>
                                                    <CardDescription>
                                                        Control your server's power state and configuration
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-6">
                                                    {/* Power Controls */}
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <Button
                                                            variant="default"
                                                            size="lg"
                                                            onClick={() => runServiceAction(selectedOrder, 'start')}
                                                            disabled={actionBusy === 'start'}
                                                            className="h-12 gap-2"
                                                        >
                                                            {actionBusy === 'start' ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Play className="h-4 w-4" />
                                                            )}
                                                            Start Server
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="lg"
                                                            onClick={() => runServiceAction(selectedOrder, 'stop')}
                                                            disabled={actionBusy === 'stop'}
                                                            className="h-12 gap-2"
                                                        >
                                                            {actionBusy === 'stop' ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Square className="h-4 w-4" />
                                                            )}
                                                            Stop Server
                                                        </Button>
                                                        <Button
                                                            variant="secondary"
                                                            size="lg"
                                                            onClick={() => runServiceAction(selectedOrder, 'reboot')}
                                                            disabled={actionBusy === 'reboot'}
                                                            className="h-12 gap-2"
                                                        >
                                                            {actionBusy === 'reboot' ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <PowerCircle className="h-4 w-4" />
                                                            )}
                                                            Reboot Server
                                                        </Button>
                                                    </div>

                                                    <Separator />

                                                    {/* Advanced Actions */}
                                                    <div className="space-y-4">
                                                        <h4 className="font-semibold">Advanced Actions</h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {/* <Button
                                                                variant="outline"
                                                                size="lg"
                                                                onClick={async () => {
                                                                    const pwd = prompt('Enter new root/administrator password:');
                                                                    if (pwd && pwd.length >= 6) {
                                                                        await runServiceAction(selectedOrder, 'changepassword', { password: pwd });
                                                                    } else if (pwd) {
                                                                        toast.error('Password must be at least 6 characters long');
                                                                    }
                                                                }}
                                                                disabled={actionBusy === 'changepassword'}
                                                                className="h-12 gap-2"
                                                            >
                                                                {actionBusy === 'changepassword' ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <KeyRound className="h-4 w-4" />
                                                                )}
                                                                Change Password
                                                            </Button> */}
                                  
                                                            <Button
                                                                variant="destructive"
                                                                size="lg"
                                                                onClick={async () => {
                                                                    const confirmed = confirm('Are you sure you want to reinstall? This will erase all data!');
                                                                    if (confirmed) {
                                                                        // First, optionally get templates
                                                                        const shouldSelectTemplate = confirm('Do you want to select a different OS template? (Cancel to keep current OS)');

                                                                        if (shouldSelectTemplate) {
                                                                            // Get available templates
                                                                            try {
                                                                                const templatesRes = await fetch('/api/orders/service-action', {
                                                                                    method: 'POST',
                                                                                    headers: { 'Content-Type': 'application/json' },
                                                                                    body: JSON.stringify({ orderId: selectedOrder._id, action: 'templates' })
                                                                                });
                                                                                const templatesData = await templatesRes.json();

                                                                                if (templatesData.success && templatesData.result) {
                                                                                    // Show template selection (you might want to create a proper dialog for this)
                                                                                    const templateOptions = Object.entries(templatesData.result).map(([id, template]: [string, any]) =>
                                                                                        `${id}: ${template.name || template.distro || id}`
                                                                                    ).join('\n');

                                                                                    const selectedTemplate = prompt(`Available templates:\n${templateOptions}\n\nEnter template ID (or cancel to keep current):`);

                                                                                    if (selectedTemplate) {
                                                                                        const pwd = prompt('Enter new root/administrator password:');
                                                                                        if (pwd && pwd.length >= 6) {
                                                                                            await runServiceAction(selectedOrder, 'reinstall', {
                                                                                                password: pwd,
                                                                                                templateId: selectedTemplate
                                                                                            });
                                                                                        } else if (pwd) {
                                                                                            toast.error('Password must be at least 6 characters long');
                                                                                        }
                                                                                    }
                                                                                }
                                                                            } catch (error) {
                                                                                console.error('Failed to get templates:', error);
                                                                                toast.error('Failed to load templates');
                                                                            }
                                                                        } else {
                                                                            // Just reinstall with current OS
                                                                            const pwd = prompt('Enter new root/administrator password:');
                                                                            if (pwd && pwd.length >= 6) {
                                                                                await runServiceAction(selectedOrder, 'reinstall', { password: pwd });
                                                                            } else if (pwd) {
                                                                                toast.error('Password must be at least 6 characters long');
                                                                            }
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={actionBusy === 'reinstall'}
                                                                className="h-12 gap-2"
                                                            >
                                                                {actionBusy === 'reinstall' ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <LayoutTemplate className="h-4 w-4" />
                                                                )}
                                                                Reinstall OS
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <Separator />

                                                    {/* Service Status */}
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="font-semibold">Service Status</h4>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => loadServiceDetails(selectedOrder)}
                                                                disabled={serviceLoading}
                                                                className="gap-2"
                                                            >
                                                                <RefreshCw className={`h-4 w-4 ${serviceLoading ? 'animate-spin' : ''}`} />
                                                                Refresh
                                                            </Button>
                                                        </div>
                                                        <div className="p-4 border rounded-lg bg-muted/30">
                                                            {serviceLoading ? (
                                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    Loading service details...
                                                                </div>
                                                            ) : serviceDetails ? (
                                                                <pre className="max-h-40 overflow-auto text-xs bg-background p-3 rounded border font-mono">
                                                                    {JSON.stringify(serviceDetails, null, 2)}
                                                                </pre>
                                                            ) : (
                                                                <div className="text-muted-foreground text-sm">
                                                                    Click refresh to load service details
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ) : (
                                            <Card>
                                                <CardContent className="text-center py-12">
                                                    <Settings className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                                                    <h3 className="text-xl font-semibold mb-2">Management Not Available</h3>
                                                    <p className="text-muted-foreground">
                                                        Advanced server management is not available for this instance.
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </TabsContent>
                                </Tabs>

                                <DialogFooter className="border-t pt-6">
                                    <Button
                                        variant="outline"
                                        onClick={() => setSelectedOrder(null)}
                                        className="w-full sm:w-auto"
                                    >
                                        Close
                                    </Button>
                                    {selectedOrder.ipAddress && (
                                        <Button
                                            onClick={() => {
                                                const sshCommand = `ssh ${selectedOrder.username}@${selectedOrder.ipAddress}`;
                                                copyToClipboard(sshCommand, 'SSH Command');
                                            }}
                                            className="w-full sm:w-auto gap-2"
                                        >
                                            <Terminal className="h-4 w-4" />
                                            Copy SSH Command
                                        </Button>
                                    )}
                                </DialogFooter>
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default ViewLinux;
