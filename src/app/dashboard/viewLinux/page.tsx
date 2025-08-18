'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
    Eye,
    User,
    CheckCircle,
    XCircle,
    MemoryStick,
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
    HardDrive,
    Activity,
    Check,
    Terminal,
    TerminalIcon,
    Play,
    Square,
    PowerCircle,
    KeyRound,
    LayoutTemplate
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

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
    // NEW: show VPS controls when Hostycare service exists
    hostycareServiceId?: string;
    provisioningStatus?: string;
}

// OS Icon Component
const OSIcon = ({ os, className = "h-8 w-8" }: { os: string; className?: string }) => {
    const osLower = os.toLowerCase();

    if (osLower.includes('ubuntu')) {
        return (
            <div className={`${className} bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                <img src='/ubuntu.png' className='rounded-full object-contain' />
            </div>
        );
    } else if (osLower.includes('centos')) {
        return (
            <div className={`${className} bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                <img src='/centos.png' className='rounded-full object-contain' />

            </div>
        );
    } else if (osLower.includes('windows')) {
        return (
            <div className={`${className} bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                <img src='/windows.png' className='rounded-full object-contain' />

            </div>
        );
    } else {
        return <Computer className={className} />;
    }
};

function styleText(content: string) {
    const regex = /(\([^)]*\)|[a-zA-Z]+)/g;
    return content.split(regex).map((part, index) => {
        if (part.match(/\([^)]*\)/) || part.match(/[a-zA-Z]/)) {
            return <span key={index} className="text-primary font-medium">{part}</span>;
        } else {
            return part;
        }
    });
}

const ViewLinux = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    // ... inside component ...
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
            const data = await response.json();
            setOrders(data);
        } catch (error) {
            router.push('/login');
        } finally {
            setLoading(false);
        }
    };

    const loadServiceDetails = async (order: Order) => {
        if (!order.hostycareServiceId) return;
        setServiceLoading(true);
        try {
            const res = await fetch(`/api/orders/service-action?orderId=${order._id}`);
            const data = await res.json();
            if (data.success) setServiceDetails(data);
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
                toast.success(`Action "${action}" executed`);
                await loadServiceDetails(order);
            } else {
                toast.error(data.error || `Failed to run "${action}"`);
            }
        } catch (e: any) {
            toast.error(e.message || `Failed to run "${action}"`);
        } finally {
            setActionBusy(null);
        }
    };

    const handleDialogOpen = (order: Order) => {
        setSelectedOrder(order);
        setShowPassword(false);
        setServiceDetails(null);
        if (order.hostycareServiceId) loadServiceDetails(order);
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        toast.success(`${field} copied to clipboard`);
        setTimeout(() => setCopied(null), 2000);
    };

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case 'active':
                return (
                    <Badge className="bg- -50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></div>
                        Active
                    </Badge>
                );
            case 'pending':
                return (
                    <Badge className="bg- -50 text-amber-700 border-amber-200 hover:bg-amber-100">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                    </Badge>
                );
            default:
                return (
                    <Badge variant="secondary" className="bg-gray-50 text-gray-700">
                        <Shield className="w-3 h-3 mr-1" />
                        {status}
                    </Badge>
                );
        }
    };

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getDaysUntilExpiry = (expiryDate: Date) => {
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    return (
        <div className='w-full'>
            <div className='h-[70px] flex items-center border-b gap-3 px-6 bg-background shadow-sm'>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.back()}
                    className="hover:bg-muted transition-colors"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className='text-xl font-semibold flex items-center gap-2'>
                    <Server className="h-5 w-5 text-primary" /> Linux Instances
                </h1>
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto flex items-center gap-1"
                    onClick={fetchOrders}
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            <div className='mx-auto max-w-7xl p-6'>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg font-medium">Your Linux Servers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center items-center py-10">
                                <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground" />
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                <Server className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p>No Linux instances found</p>
                            </div>
                        ) : (
                            <Table className='w-full border'>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Memory</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.map(order => (
                                        <motion.tr
                                            key={order._id}
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="border-b"
                                        >
                                            <TableCell className="font-medium">{styleText(order.productName)}</TableCell>
                                            <TableCell><MemoryStick className="inline mr-1.5 h-4 w-4" />{order.memory}</TableCell>
                                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDialogOpen(order)}
                                                    className="hover:bg-primary/10 transition-colors"
                                                >
                                                    <Eye className="h-4 w-4 mr-1" /> View Details
                                                </Button>
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {selectedOrder && (
                    <Dialog open={Boolean(selectedOrder)} onOpenChange={() => setSelectedOrder(null)}>
                        <DialogContent className='sm:max-w-[800px] max-h-[90vh] overflow-y-auto'>
                            <DialogHeader className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <OSIcon os={selectedOrder.os} className="h-10 w-10" />
                                    <div>
                                        <DialogTitle className="text-xl font-semibold">
                                            {styleText(selectedOrder.productName)}
                                        </DialogTitle>
                                        <DialogDescription className="text-sm text-muted-foreground">
                                            Server configuration and access details
                                        </DialogDescription>
                                    </div>
                                    <div className="ml-auto">
                                        {getStatusBadge(selectedOrder.status)}
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-6 py-4">
                                {/* Server Overview */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="flex items-center gap-3 p-3 bg- -50 rounded-lg">
                                        <TerminalIcon className="h-8 w-8" />
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Template</p>
                                            <p className="font-medium text-sm">{selectedOrder.os}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 p-3 bg- -50 rounded-lg">
                                        <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                                            <HardDrive className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Memory</p>
                                            <p className="font-medium text-sm">{selectedOrder.memory}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 p-3 bg- -50 rounded-lg">
                                        <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                                            <Activity className="h-4 w-4 text-green-600" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                                            <p className="font-medium text-sm capitalize">{selectedOrder.status}</p>
                                        </div>
                                    </div>

                                    {selectedOrder.expiryDate && (
                                        <div className="flex items-center gap-3 p-3 bg- -50 rounded-lg">
                                            <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                                                <Calendar className="h-4 w-4 text-orange-600" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground uppercase tracking-wide">Expires</p>
                                                <p className="font-medium text-sm">
                                                    {getDaysUntilExpiry(selectedOrder.expiryDate)} days
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Separator />

                                {/* Connection Details or Pending State */}
                                {selectedOrder.username ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Network className="h-5 w-5 text-primary" />
                                            <h3 className="text-lg font-semibold">Connection Details</h3>
                                        </div>

                                        <div className="grid gap-4">
                                            {/* IP Address */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                                    <Server className="h-4 w-4" />
                                                    IP Address
                                                </Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        readOnly
                                                        value={selectedOrder.ipAddress || ''}
                                                        className="font-mono bg-transparent -50 bo-200"
                                                    />
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => copyToClipboard(selectedOrder.ipAddress || '', 'IP Address')}
                                                        className="shrink-0"
                                                    >
                                                        {copied === 'IP Address' ? (
                                                            <Check className="h-4 w-4 text-green-500" />
                                                        ) : (
                                                            <Copy className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Username */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                                    <User className="h-4 w-4" />
                                                    Username
                                                </Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        readOnly
                                                        value={selectedOrder.username || ''}
                                                        className="font-mono bg-transparent -50 -gray-200"
                                                    />
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => copyToClipboard(selectedOrder.username || '', 'Username')}
                                                        className="shrink-0"
                                                    >
                                                        {copied === 'Username' ? (
                                                            <Check className="h-4 w-4 text-green-500" />
                                                        ) : (
                                                            <Copy className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Password */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                                    <Lock className="h-4 w-4" />
                                                    Password
                                                </Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        readOnly
                                                        type={showPassword ? "text" : "password"}
                                                        value={selectedOrder.password || ''}
                                                        className="font-mono bg-transparent 50 -gray-200"
                                                    />
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="shrink-0"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => copyToClipboard(selectedOrder.password || '', 'Password')}
                                                        className="shrink-0"
                                                    >
                                                        {copied === 'Password' ? (
                                                            <Check className="h-4 w-4 text-green-500" />
                                                        ) : (
                                                            <Copy className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SSH Command Helper */}
                                        {/* <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                                <span>SSH Connection Command</span>
                                            </div>
                                            <code className="text-gray-300">
                                                ssh {selectedOrder.username}@{selectedOrder.ipAddress}
                                            </code>
                                        </div> */}
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                                            <Clock className="h-8 w-8 text-amber-600" />
                                        </div>
                                        <h3 className="text-lg font-semibold mb-2">Server Provisioning</h3>
                                        <p className="text-muted-foreground mb-4">
                                            Your server is being set up and configured. This usually takes about 5 minutes.
                                        </p>
                                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                                            <span>Expected wait time: 5 minutes</span>
                                        </div>
                                    </div>
                                )}

                                {selectedOrder.hostycareServiceId && (
                                    <>
                                        <Separator />
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <Server className="h-5 w-5 text-primary" />
                                                <h3 className="text-lg font-semibold">Manage VPS</h3>
                                                <Badge variant="secondary" className="ml-auto">
                                                    Service ID: {selectedOrder.hostycareServiceId}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <Button variant="outline" size="sm" onClick={() => loadServiceDetails(selectedOrder)} disabled={serviceLoading}>
                                                    <RefreshCw className={`h-4 w-4 mr-1 ${serviceLoading ? 'animate-spin' : ''}`} />
                                                    Refresh Status
                                                </Button>
                                                <Button size="sm" onClick={() => runServiceAction(selectedOrder, 'start')} disabled={actionBusy === 'start'}>
                                                    <Play className="h-4 w-4 mr-1" /> Start
                                                </Button>
                                                <Button size="sm" variant="secondary" onClick={() => runServiceAction(selectedOrder, 'stop')} disabled={actionBusy === 'stop'}>
                                                    <Square className="h-4 w-4 mr-1" /> Stop
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => runServiceAction(selectedOrder, 'reboot')} disabled={actionBusy === 'reboot'}>
                                                    <PowerCircle className="h-4 w-4 mr-1" /> Reboot
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        const pwd = prompt('Enter new root/administrator password');
                                                        if (pwd) await runServiceAction(selectedOrder, 'changepassword', { password: pwd });
                                                    }}
                                                    disabled={actionBusy === 'changepassword'}
                                                >
                                                    <KeyRound className="h-4 w-4 mr-1" /> Change Password
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={async () => {
                                                        const pwd = prompt('Enter root/administrator password for reinstall');
                                                        if (pwd) await runServiceAction(selectedOrder, 'reinstall', { password: pwd });
                                                    }}
                                                    disabled={actionBusy === 'reinstall'}
                                                >
                                                    <LayoutTemplate className="h-4 w-4 mr-1" /> Reinstall
                                                </Button>
                                            </div>

                                            <div className="border rounded p-3 text-sm">
                                                {serviceLoading ? (
                                                    <div className="text-muted-foreground">Loading service details...</div>
                                                ) : serviceDetails ? (
                                                    <pre className="max-h-56 overflow-auto bg-muted p-2 rounded">{JSON.stringify(serviceDetails, null, 2)}</pre>
                                                ) : (
                                                    <div className="text-muted-foreground">No service details loaded.</div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}


                                {/* Expiry Information */}
                                {selectedOrder.expiryDate && (
                                    <>
                                        <Separator />
                                        <div className="bg- -50 border border-blue-200 rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="bg- -100 p-2 rounded-full">
                                                    <Calendar className="h-5 w-5 text-blue-300" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-medium text-blue-400 mb-1">Server Expiry</h4>
                                                    <p className="text-sm text-blue-400 mb-2">
                                                        This server will expire on {formatDate(selectedOrder.expiryDate)}
                                                    </p>
                                                    <p className="text-xs text-blue-400">
                                                        {getDaysUntilExpiry(selectedOrder.expiryDate)} days remaining
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <DialogFooter className="border-t pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedOrder(null)}
                                    className="w-full sm:w-auto"
                                >
                                    Close
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </div>
    );
};

export default ViewLinux;
