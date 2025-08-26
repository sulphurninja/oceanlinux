"use client";

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
    X,
    CreditCard
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

declare global {
    interface Window {
        Razorpay: any;
    }
}

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
    hostycareServiceId?: string;
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
        if (!order) return;
        setSelectedOrder(order);
        setShowPassword(false);
        setServiceDetails(null);
        if (order.hostycareServiceId) {
            loadServiceDetails(order);
        }
    };

    const handleDialogClose = () => {
        setSelectedOrder(null);
        setShowPassword(false);
        setServiceDetails(null);
        setActionBusy(null);
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        toast.success(`${field} copied to clipboard`);
        setTimeout(() => setCopied(null), 2000);
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
        // Allow renewal if expiring within 30 days or already expired (but not more than 7 days ago)
        return daysLeft <= 30 && daysLeft >= -7;
    };

    const isExpired = (order: Order | null) => {
        if (!order || !order.expiryDate) return false;
        return getDaysUntilExpiry(order.expiryDate) < 0;
    };

    const handleRenewService = async (order: Order) => {
        if (!order || !order.expiryDate) {
            toast.error('Order has no expiry date');
            return;
        }

        const daysLeft = getDaysUntilExpiry(order.expiryDate);
        const isExpiredService = daysLeft < 0;

        const confirmed = confirm(
            `Renew service for ₹${order.price}?\n\n` +
            `Service: ${order.productName}\n` +
            `Configuration: ${order.memory}\n` +
            `Current Expiry: ${formatDate(order.expiryDate)}\n` +
            `${isExpiredService ? 'Service is expired' : `${daysLeft} days remaining`}\n\n` +
            `After payment, service will be extended for 30 days.\n` +
            `Proceed to payment?`
        );

        if (!confirmed) return;

        setActionBusy('renew');

        try {
            // Initiate renewal payment
            const res = await fetch("/api/payment/renew", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: order._id
                })
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.message || "Failed to initiate renewal payment");
                setActionBusy(null);
                return;
            }

            // Store renewal transaction ID
            if (data.renewalTxnId) {
                localStorage.setItem('lastRenewalTxnId', data.renewalTxnId);
                localStorage.setItem('renewalOrderId', order._id);
                console.log("Stored renewal info in localStorage");
            }

            // Sanitize description for Razorpay
            const sanitizedDescription = `Renewal: ${order.productName} - ${order.memory}`.replace(/[^\w\s\-\.]/g, '').trim();
            const sanitizedCustomerName = data.customer.name.replace(/[^\w\s\-\.]/g, '').trim();

            // Initialize Razorpay for renewal
            const options = {
                key: data.razorpay.key,
                amount: data.razorpay.amount,
                currency: data.razorpay.currency,
                name: 'OceanLinux',
                description: sanitizedDescription,
                order_id: data.razorpay.order_id,
                prefill: {
                    name: sanitizedCustomerName,
                    email: data.customer.email,
                },
                theme: {
                    color: '#3b82f6'
                },
                handler: async function (response: any) {
                    console.log('Renewal payment successful:', response);
                    toast.success("Payment successful! Processing renewal...");

                    try {
                        // Call API to confirm renewal payment and trigger service renewal
                        const confirmRes = await fetch("/api/payment/renew-confirm", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                renewalTxnId: data.renewalTxnId,
                                orderId: order._id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        const confirmData = await confirmRes.json();

                        if (confirmRes.ok && confirmData.success) {
                            toast.success("Service renewed successfully! New expiry date updated.");

                            // Refresh order data to show new expiry date
                            await Promise.all([
                                fetchOrders(), // Refresh the orders list
                                refreshOrderData(order._id) // Refresh selected order
                            ]);
                        } else {
                            toast.error("Payment successful but renewal processing failed. Please contact support.");
                            console.error('Renewal confirmation failed:', confirmData);
                        }
                    } catch (error) {
                        console.error('Error confirming renewal payment:', error);
                        toast.error("Payment successful but renewal confirmation failed. Please contact support.");
                    } finally {
                        setActionBusy(null);
                    }
                },
                modal: {
                    ondismiss: function () {
                        console.log('Renewal payment modal dismissed');
                        setActionBusy(null);
                    }
                }
            };

            setSelectedOrder(null); // Close the server details dialog

            const razorpay = new window.Razorpay(options);
            razorpay.open();

        } catch (error) {
            console.error("Error initiating renewal payment:", error);
            toast.error("Something went wrong. Please try again");
            setActionBusy(null);
        }
    };

    const getStatusBadge = (status: string, provisioningStatus?: string, lastAction?: string) => {
        // Show transitional states ONLY during active operations (when actionBusy is set)
        if (actionBusy) {
            switch (actionBusy) {
                case 'reboot':
                    return (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Rebooting
                        </Badge>
                    );
                case 'start':
                    return (
                        <Badge className="bg-green-50 text-green-700 border-green-200">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Starting
                        </Badge>
                    );
                case 'stop':
                    return (
                        <Badge className="bg-gray-50 text-gray-700 border-gray-200">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Stopping
                        </Badge>
                    );
                case 'renew':
                    return (
                        <Badge className="bg-green-50 text-green-700 border-green-200">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Renewing
                        </Badge>
                    );
                case 'reinstall':
                    return (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Reinstalling
                        </Badge>
                    );
                case 'changepassword':
                    return (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Changing Password
                        </Badge>
                    );
            }
        }

        // EXPLICIT CHECK: If order.status is 'completed', always show 'Active'
        if (status.toLowerCase() === 'completed') {
            return (
                <Badge className="bg-green-50 text-green-700 border-green-200">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    Active
                </Badge>
            );
        }

        // For all other cases, use the current status or provisioning status
        const currentStatus = provisioningStatus || status;

        switch (currentStatus.toLowerCase()) {
            case 'active':
                return (
                    <Badge className="bg-green-50 text-green-700 border-green-200">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        Active
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
                                                {/* Add expiry indicator on order cards */}
                                                {order.expiryDate && (
                                                    <div className="mt-2">
                                                        {isExpired(order) ? (
                                                            <Badge variant="destructive" className="text-xs">
                                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                                Expired {Math.abs(getDaysUntilExpiry(order.expiryDate))} days ago
                                                            </Badge>
                                                        ) : getDaysUntilExpiry(order.expiryDate) <= 7 ? (
                                                            <Badge variant="outline" className="text-xs border-amber-200 text-amber-700">
                                                                <Clock className="h-3 w-3 mr-1" />
                                                                Expires in {getDaysUntilExpiry(order.expiryDate)} days
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {/* Add quick renewal button on card if eligible */}
                                            {isRenewalEligible(order) && order.hostycareServiceId && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRenewService(order);
                                                    }}
                                                    disabled={actionBusy === 'renew'}
                                                    className="gap-1 text-xs"
                                                >
                                                    {actionBusy === 'renew' ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <CreditCard className="h-3 w-3" />
                                                    )}
                                                    Renew
                                                </Button>
                                            )}
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

                {/* Server Details Dialog */}
                <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => {
                    if (!open) {
                        handleDialogClose();
                    }
                }}>
                    <DialogContent className='sm:max-w-4xl max-h-[90vh] overflow-y-auto'>
                        {selectedOrder ? (
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

                                <Tabs defaultValue="overview" className="w-full">
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
                                                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                                        <div className="flex items-center gap-3">
                                                            <Terminal className="h-8 w-8 text-blue-600" />
                                                            <div>
                                                                <p className="text-xs font-medium text-blue-600 uppercase">OS</p>
                                                                <p className="font-semibold text-blue-900">{selectedOrder.os}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                                                        <div className="flex items-center gap-3">
                                                            <MemoryStick className="h-8 w-8 text-purple-600" />
                                                            <div>
                                                                <p className="text-xs font-medium text-purple-600 uppercase">Memory</p>
                                                                <p className="font-semibold text-purple-900">{selectedOrder.memory}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
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
                                                            {selectedOrder.lastAction === 'renew' && <CreditCard className="h-4 w-4 text-blue-600" />}
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

                                        {/* Service Timeline with Renewal */}
                                        {selectedOrder?.expiryDate && (
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Calendar className="h-5 w-5" />
                                                        Service Timeline & Renewal
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className={cn(
                                                        "p-4 rounded-lg border",
                                                        isExpired(selectedOrder)
                                                            ? "bg-red-50 border-red-200"
                                                            : getDaysUntilExpiry(selectedOrder.expiryDate) <= 7
                                                                ? "bg-amber-50 border-amber-200"
                                                                : "bg-blue-50 border-blue-200"
                                                    )}>
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className={cn(
                                                                    "font-semibold",
                                                                    isExpired(selectedOrder)
                                                                        ? "text-red-700"
                                                                        : getDaysUntilExpiry(selectedOrder.expiryDate) <= 7
                                                                            ? "text-amber-700"
                                                                            : "text-blue-700"
                                                                )}>
                                                                    {isExpired(selectedOrder) ? 'Service Expired' : 'Service Expires'}
                                                                </p>
                                                                <p className={cn(
                                                                    "text-sm",
                                                                    isExpired(selectedOrder)
                                                                        ? "text-red-600"
                                                                        : getDaysUntilExpiry(selectedOrder.expiryDate) <= 7
                                                                            ? "text-amber-600"
                                                                            : "text-blue-600"
                                                                )}>
                                                                    {formatDate(selectedOrder.expiryDate)}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className={cn(
                                                                    "text-2xl font-bold",
                                                                    isExpired(selectedOrder)
                                                                        ? "text-red-700"
                                                                        : getDaysUntilExpiry(selectedOrder.expiryDate) <= 7
                                                                            ? "text-amber-700"
                                                                            : "text-blue-700"
                                                                )}>
                                                                    {Math.abs(getDaysUntilExpiry(selectedOrder.expiryDate))}
                                                                </p>
                                                                <p className={cn(
                                                                    "text-sm",
                                                                    isExpired(selectedOrder)
                                                                        ? "text-red-600"
                                                                        : getDaysUntilExpiry(selectedOrder.expiryDate) <= 7
                                                                            ? "text-amber-600"
                                                                            : "text-blue-600"
                                                                )}>
                                                                    {isExpired(selectedOrder) ? 'days ago' : 'days left'}
                                                                </p>
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

                                                        {/* Renewal Button */}
                                                        {isRenewalEligible(selectedOrder) && selectedOrder.hostycareServiceId && (
                                                            <div className="mt-4 pt-3 border-t">
                                                                <Button
                                                                    onClick={() => handleRenewService(selectedOrder)}
                                                                    disabled={actionBusy === 'renew'}
                                                                    className={cn(
                                                                        "w-full gap-2",
                                                                        isExpired(selectedOrder)
                                                                            ? "bg-red-600 hover:bg-red-700"
                                                                            : "bg-green-600 hover:bg-green-700"
                                                                    )}
                                                                >
                                                                    {actionBusy === 'renew' ? (
                                                                        <>
                                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                                            Processing Payment...
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <CreditCard className="h-4 w-4" />
                                                                            {isExpired(selectedOrder)
                                                                                ? `Renew Service - Pay ₹${selectedOrder.price}`
                                                                                : `Renew for 30 Days - Pay ₹${selectedOrder.price}`
                                                                            }
                                                                        </>
                                                                    )}
                                                                </Button>

                                                                {isExpired(selectedOrder) && (
                                                                    <p className="text-xs text-red-600 mt-2 text-center">
                                                                        ⚠️ Service renewal available for up to 7 days after expiry
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Show renewal eligibility message */}
                                                        {!isRenewalEligible(selectedOrder) && selectedOrder?.hostycareServiceId && (
                                                            <div className="mt-4 pt-3 border-t">
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                    <Clock className="h-4 w-4" />
                                                                    {selectedOrder.expiryDate && getDaysUntilExpiry(selectedOrder.expiryDate) > 30
                                                                        ? `Renewal available ${getDaysUntilExpiry(selectedOrder.expiryDate) - 30} days before expiry`
                                                                        : selectedOrder.expiryDate && getDaysUntilExpiry(selectedOrder.expiryDate) < -7
                                                                            ? 'Renewal period has expired'
                                                                            : 'Renewal not available'
                                                                    }
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Renewal History */}
                                                    {selectedOrder.renewalPayments && selectedOrder.renewalPayments.length > 0 && (
                                                        <div className="mt-4 pt-4 border-t">
                                                            <h4 className="font-medium text-sm mb-3">Renewal History</h4>
                                                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                                                {selectedOrder.renewalPayments.map((renewal, index) => (
                                                                    <div key={index} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                                                                        <div>
                                                                            <p className="font-medium">₹{renewal.amount} paid</p>
                                                                            <p className="text-muted-foreground">{formatDate(renewal.paidAt)}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p>Extended to</p>
                                                                            <p className="text-muted-foreground">{formatDate(renewal.newExpiry)}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
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
                                                            <Button
                                                                variant="destructive"
                                                                size="lg"
                                                                onClick={async () => {
                                                                    const confirmed = confirm('Are you sure you want to reinstall? This will erase all data!');
                                                                    if (confirmed) {
                                                                        try {
                                                                            setActionBusy('reinstall');

                                                                            // First, get available templates
                                                                            const templatesRes = await fetch('/api/orders/service-action', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify({ orderId: selectedOrder._id, action: 'templates' })
                                                                            });
                                                                            const templatesData = await templatesRes.json();

                                                                            console.log('Templates response:', templatesData);

                                                                            if (templatesData.success && templatesData.result) {
                                                                                const templates = templatesData.result;

                                                                                // Handle different response formats
                                                                                let templateOptions = '';
                                                                                let templateList = {};

                                                                                if (Array.isArray(templates)) {
                                                                                    // If templates is an array
                                                                                    templates.forEach((template, index) => {
                                                                                        const name = template.name || template.os || template.distro || `Template ${index + 1}`;
                                                                                        const id = template.id || template.templateId || index.toString();
                                                                                        templateList[id] = template;
                                                                                        templateOptions += `${id}: ${name}\n`;
                                                                                    });
                                                                                } else if (typeof templates === 'object' && templates !== null) {
                                                                                    // If templates is an object
                                                                                    Object.entries(templates).forEach(([id, template]) => {
                                                                                        const name = typeof template === 'string' ? template :
                                                                                            (template?.name || template?.os || template?.distro || `Template ${id}`);
                                                                                        templateList[id] = template;
                                                                                        templateOptions += `${id}: ${name}\n`;
                                                                                    });
                                                                                } else {
                                                                                    console.warn('Unexpected templates format:', templates);
                                                                                    templateOptions = 'No templates found in expected format';
                                                                                }

                                                                                if (templateOptions && Object.keys(templateList).length > 0) {
                                                                                    const selectedTemplateId = prompt(
                                                                                        `Select OS Template:\n\n${templateOptions}\nEnter template ID (or leave blank for default):`
                                                                                    );

                                                                                    // Allow empty selection for default reinstall
                                                                                    if (selectedTemplateId === null) {
                                                                                        // User cancelled
                                                                                        setActionBusy(null);
                                                                                        return;
                                                                                    }

                                                                                    // Validate template selection if provided
                                                                                    if (selectedTemplateId && !templateList[selectedTemplateId]) {
                                                                                        toast.error('Invalid template ID selected');
                                                                                        setActionBusy(null);
                                                                                        return;
                                                                                    }

                                                                                    const pwd = prompt('Enter new root/administrator password (minimum 6 characters):');
                                                                                    if (pwd && pwd.length >= 6) {
                                                                                        await runServiceAction(selectedOrder, 'reinstall', {
                                                                                            password: pwd,
                                                                                            templateId: selectedTemplateId || undefined // undefined if empty
                                                                                        });
                                                                                    } else if (pwd !== null) {
                                                                                        toast.error('Password must be at least 6 characters long');
                                                                                        setActionBusy(null);
                                                                                    } else {
                                                                                        // User cancelled password prompt
                                                                                        setActionBusy(null);
                                                                                    }
                                                                                } else {
                                                                                    // No templates available, proceed with default reinstall
                                                                                    console.log('No templates available, proceeding with default reinstall');
                                                                                    const pwd = prompt('No templates available. Proceed with default OS reinstall?\n\nEnter new root/administrator password (minimum 6 characters):');
                                                                                    if (pwd && pwd.length >= 6) {
                                                                                        await runServiceAction(selectedOrder, 'reinstall', {
                                                                                            password: pwd
                                                                                        });
                                                                                    } else if (pwd !== null) {
                                                                                        toast.error('Password must be at least 6 characters long');
                                                                                        setActionBusy(null);
                                                                                    } else {
                                                                                        setActionBusy(null);
                                                                                    }
                                                                                }
                                                                            } else {
                                                                                // Failed to get templates, proceed with default reinstall
                                                                                console.log('Failed to load templates, proceeding with default reinstall');
                                                                                const pwd = prompt('Failed to load templates. Proceed with default OS reinstall?\n\nEnter new root/administrator password (minimum 6 characters):');
                                                                                if (pwd && pwd.length >= 6) {
                                                                                    await runServiceAction(selectedOrder, 'reinstall', {
                                                                                        password: pwd
                                                                                    });
                                                                                } else if (pwd !== null) {
                                                                                    toast.error('Password must be at least 6 characters long');
                                                                                    setActionBusy(null);
                                                                                } else {
                                                                                    setActionBusy(null);
                                                                                }
                                                                            }
                                                                        } catch (error) {
                                                                            console.error('Error in reinstall process:', error);
                                                                            toast.error('Failed to initiate reinstall');
                                                                            setActionBusy(null);
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

                                                            {/* Change Password Button */}
                                                            <Button
                                                                variant="outline"
                                                                size="lg"
                                                                onClick={async () => {
                                                                    const newPassword = prompt('Enter new password (minimum 6 characters):');
                                                                    if (newPassword && newPassword.length >= 6) {
                                                                        await runServiceAction(selectedOrder, 'changepassword', {
                                                                            password: newPassword
                                                                        });
                                                                    } else if (newPassword !== null) {
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
                                        onClick={handleDialogClose}
                                        className="w-full sm:w-auto"
                                    >
                                        Close
                                    </Button>
                                    {/* {selectedOrder.ipAddress && (
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
                                    )} */}
                                    {/* Add renewal button in footer if eligible */}
                                    {isRenewalEligible(selectedOrder) && selectedOrder.hostycareServiceId && (
                                        <Button
                                            onClick={() => handleRenewService(selectedOrder)}
                                            disabled={actionBusy === 'renew'}
                                            className="w-full sm:w-auto gap-2 bg-green-600 hover:bg-green-700"
                                        >
                                            {actionBusy === 'renew' ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    <CreditCard className="h-4 w-4" />
                                                    Renew Service
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </DialogFooter>
                            </>
                        ) : (
                            <div className="flex justify-center items-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default ViewLinux;