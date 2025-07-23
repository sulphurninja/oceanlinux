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
    Shield
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
    expiryDate?:Date;
}

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
    const router = useRouter();

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

    const handleDialogOpen = (order: Order) => {
        setSelectedOrder(order);
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopied(field);
        toast("Copied to clipboard");

        setTimeout(() => setCopied(null), 2000);
    };

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case 'active':
                return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 transition-colors">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Active
                </Badge>;
            case 'pending':
                return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors">
                    <Clock className="w-3.5 h-3.5 mr-1" /> Pending
                </Badge>;
            default:
                return <Badge variant="secondary">
                    <Shield className="w-3.5 h-3.5 mr-1" /> {status}
                </Badge>;
        }
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
                        <DialogContent className='sm:max-w-[900px]'>
                            <DialogHeader>
                                <DialogTitle className="text-xl flex items-center gap-2">
                                    <Server className="h-5 w-5 text-primary" />
                                    Linux Server Details
                                </DialogTitle>
                            </DialogHeader>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
                                <Card className="overflow-hidden transition-all hover:shadow-md">
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="bg-primary/10 p-2.5 rounded-full">
                                            <Computer className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">OS</p>
                                            <p className="font-medium">{selectedOrder.os}</p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="overflow-hidden transition-all hover:shadow-md">
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="bg-primary/10 p-2.5 rounded-full">
                                            <MemoryStick className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Memory</p>
                                            <p className="font-medium">{selectedOrder.memory}</p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="overflow-hidden transition-all hover:shadow-md">
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="bg-primary/10 p-2.5 rounded-full">
                                            {selectedOrder.status.toLowerCase() === 'active' ? (
                                                <CheckCircle className="h-5 w-5 text-green-600" />
                                            ) : (
                                                <Clock className="h-5 w-5 text-yellow-600" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Status</p>
                                            <p className="font-medium">{selectedOrder.status}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Add the expiry date card */}
                            {selectedOrder.expiryDate && (
                                <Card className="mt-4 mb-4">
                                    <CardContent className="p-4 flex items-center gap-3">
                                        <div className="bg-red-100 p-2.5 rounded-full">
                                            <Clock className="h-5 w-5 text-red-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Expires On</p>
                                            <p className="font-medium">
                                                {new Date(selectedOrder.expiryDate).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Your server will automatically expire after this date
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {selectedOrder.username ? (
                                <Card className="mt-2">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base font-medium">Connection Details</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="flex items-center gap-1">
                                                <Server className="h-4 w-4" /> IP Address
                                            </Label>
                                            <div className="flex">
                                                <Input
                                                    readOnly
                                                    value={selectedOrder.ipAddress}
                                                    className="font-mono"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="ml-2"
                                                    onClick={() => copyToClipboard(selectedOrder.ipAddress || '', 'IP Address')}
                                                >
                                                    <Copy className={`h-4 w-4 ${copied === 'IP Address' ? 'text-green-500' : ''}`} />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="flex items-center gap-1">
                                                <User className="h-4 w-4" /> Username
                                            </Label>
                                            <div className="flex">
                                                <Input
                                                    readOnly
                                                    value={selectedOrder.username}
                                                    className="font-mono"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="ml-2"
                                                    onClick={() => copyToClipboard(selectedOrder.username || '', 'Username')}
                                                >
                                                    <Copy className={`h-4 w-4 ${copied === 'Username' ? 'text-green-500' : ''}`} />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="flex items-center gap-1">
                                                <Lock className="h-4 w-4" /> Password
                                            </Label>
                                            <div className="flex">
                                                <Input
                                                    readOnly
                                                    type="password"
                                                    value={selectedOrder.password}
                                                    className="font-mono"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="ml-2"
                                                    onClick={() => copyToClipboard(selectedOrder.password || '', 'Password')}
                                                >
                                                    <Copy className={`h-4 w-4 ${copied === 'Password' ? 'text-green-500' : ''}`} />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card className="mt-2 border-yellow-200">
                                    <CardContent className="p-6 flex items-center gap-4">
                                        <div className="bg-yellow-100 p-3 rounded-full">
                                            <Clock className="h-6 w-6 text-yellow-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-yellow-800">Server is being provisioned</h3>
                                            <p className="text-muted-foreground mt-1">
                                                The order status is Pending. Your server is being set up.
                                                <br />Expected wait time: <span className="font-medium">5 minutes</span>
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setSelectedOrder(null)}>Close</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </div>
    );
};

export default ViewLinux;