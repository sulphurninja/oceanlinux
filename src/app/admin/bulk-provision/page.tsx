'use client';

import { useEffect, useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogHeader,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Play, RefreshCw, CheckCircle, AlertCircle, Server, Users } from 'lucide-react';

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
    autoProvisioned?: boolean;
    createdAt: string;
}

interface ProvisioningResult {
    orderId: string;
    success: boolean;
    error?: string;
    serviceId?: string;
    credentials?: {
        username: string;
        password: string;
    };
    hostname?: string;
}

const BulkProvisionPage = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [provisioning, setProvisioning] = useState(false);
    const [showResultDialog, setShowResultDialog] = useState(false);
    const [provisioningResults, setProvisioningResults] = useState<ProvisioningResult[]>([]);

    useEffect(() => {
        fetchProvisionableOrders();
    }, []);

    const fetchProvisionableOrders = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/orders/bulk-provision?status=paid');
            const data = await response.json();
            if (data.success) {
                setOrders(data.orders);
            }
        } catch (error) {
            toast.error('Failed to fetch orders');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const eligibleOrders = orders
                .filter(order => !order.autoProvisioned || order.provisioningStatus === 'failed')
                .map(order => order._id);
            setSelectedOrders(eligibleOrders);
        } else {
            setSelectedOrders([]);
        }
    };

    const handleSelectOrder = (orderId: string, checked: boolean) => {
        if (checked) {
            setSelectedOrders(prev => [...prev, orderId]);
        } else {
            setSelectedOrders(prev => prev.filter(id => id !== orderId));
        }
    };

    const handleBulkProvision = async () => {
        if (selectedOrders.length === 0) {
            toast.error('Please select at least one order');
            return;
        }

        setProvisioning(true);
        try {
            const response = await fetch('/api/admin/orders/bulk-provision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderIds: selectedOrders,
                    action: 'provision'
                })
            });

            const result = await response.json();

            if (result.success) {
                setProvisioningResults(result.results);
                setShowResultDialog(true);
                toast.success(
                    `Bulk provisioning completed! ${result.summary.successful} successful, ${result.summary.failed} failed.`
                );
                await fetchProvisionableOrders(); // Refresh the list
                setSelectedOrders([]); // Clear selection
            } else {
                toast.error(result.message || 'Bulk provisioning failed');
            }
        } catch (error) {
            toast.error('Failed to start bulk provisioning');
        } finally {
            setProvisioning(false);
        }
    };

    const isOrderEligible = (order: Order) => {
        return order.status === 'paid' && (!order.autoProvisioned || order.provisioningStatus === 'failed');
    };

    const getOrderStatusBadge = (order: Order) => {
        if (order.autoProvisioned) {
            switch (order.provisioningStatus) {
                case 'active':
                    return <Badge className="bg-green-50 text-green-700">Auto-Provisioned</Badge>;
                case 'failed':
                    return <Badge className="bg-red-50 text-red-700">Failed</Badge>;
                case 'provisioning':
                    return <Badge className="bg-blue-50 text-blue-700">Provisioning...</Badge>;
                default:
                    return <Badge variant="outline">Pending Auto</Badge>;
            }
        }
        return <Badge variant="secondary">Not Provisioned</Badge>;
    };

    const stats = {
        total: orders.length,
        eligible: orders.filter(isOrderEligible).length,
        alreadyProvisioned: orders.filter(o => o.autoProvisioned && o.provisioningStatus === 'active').length,
        failed: orders.filter(o => o.provisioningStatus === 'failed').length
    };

    return (
        <div className='w-full'>
            <div className='h-[63px] flex gap-2 items-center border dark:border-none-b p-4'>
                <h1 className='text-xl flex items-center gap-2'>
                    <Server className="h-5 w-5" />
                    Bulk Auto-Provision
                </h1>
                <Button variant="outline" onClick={fetchProvisionableOrders} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className='p-6'>
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                                <div className="bg-blue-100 p-2 rounded-full">
                                    <Users className="h-4 w-4 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Total Orders</p>
                                    <p className="text-2xl font-bold">{stats.total}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                                <div className="bg-orange-100 p-2 rounded-full">
                                    <Play className="h-4 w-4 text-orange-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Eligible for Auto-Provision</p>
                                    <p className="text-2xl font-bold text-orange-600">{stats.eligible}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                                <div className="bg-green-100 p-2 rounded-full">
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Already Provisioned</p>
                                    <p className="text-2xl font-bold text-green-600">{stats.alreadyProvisioned}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                                <div className="bg-red-100 p-2 rounded-full">
                                    <AlertCircle className="h-4 w-4 text-red-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Failed Provisions</p>
                                    <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Bulk Actions */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Bulk Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600">
                                {selectedOrders.length} orders selected for provisioning
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => handleSelectAll(false)}
                                    disabled={selectedOrders.length === 0}
                                >
                                    Clear Selection
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleSelectAll(true)}
                                    disabled={stats.eligible === 0}
                                >
                                    Select All Eligible
                                </Button>
                                <Button
                                    onClick={handleBulkProvision}
                                    disabled={selectedOrders.length === 0 || provisioning}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {provisioning ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Provisioning {selectedOrders.length} orders...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4 mr-2" />
                                            Provision {selectedOrders.length} Selected
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Orders Table */}
                <Card>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                <Server className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p>No orders available for auto-provisioning</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">
                                            <Checkbox
                                                checked={selectedOrders.length === stats.eligible && stats.eligible > 0}
                                                onCheckedChange={handleSelectAll}
                                                disabled={stats.eligible === 0}
                                            />
                                        </TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Memory</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Provisioning</TableHead>
                                        <TableHead>Created</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.map(order => {
                                        const eligible = isOrderEligible(order);
                                        return (
                                            <TableRow
                                                key={order._id}
                                                className={!eligible ? 'opacity-50' : ''}
                                            >
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedOrders.includes(order._id)}
                                                        onCheckedChange={(checked) => handleSelectOrder(order._id, checked as boolean)}
                                                        disabled={!eligible}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{order.user?.name || 'N/A'}</div>
                                                        <div className="text-sm text-gray-500">{order.user?.email}</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{order.productName}</TableCell>
                                                <TableCell>{order.memory}</TableCell>
                                                <TableCell>₹{order.price}</TableCell>
                                                <TableCell>
                                                    <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                                                        {order.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {getOrderStatusBadge(order)}
                                                </TableCell>
                                                <TableCell className="text-sm text-gray-500">
                                                    {new Date(order.createdAt).toLocaleDateString()}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Results Dialog */}
            {showResultDialog && (
                <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Bulk Provisioning Results</DialogTitle>
                            <DialogDescription>
                                Summary of the bulk provisioning operation
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="text-center p-4 bg-green-50 rounded-lg">
                                    <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                                    <div className="text-2xl font-bold text-green-600">
                                        {provisioningResults.filter(r => r.success).length}
                                    </div>
                                    <div className="text-sm text-green-700">Successful</div>
                                </div>
                                <div className="text-center p-4 bg-red-50 rounded-lg">
                                    <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                                    <div className="text-2xl font-bold text-red-600">
                                        {provisioningResults.filter(r => !r.success).length}
                                    </div>
                                    <div className="text-sm text-red-700">Failed</div>
                                </div>
                                <div className="text-center p-4 bg-blue-50 rounded-lg">
                                    <Server className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                                    <div className="text-2xl font-bold text-blue-600">
                                        {provisioningResults.length}
                                    </div>
                                    <div className="text-sm text-blue-700">Total Processed</div>
                                </div>
                            </div>

                            {/* Detailed Results */}
                            <div className="border dark:border-none rounded-lg">
                                <div className="p-3 border dark:border-none-b bg-gray-50">
                                    <h4 className="font-medium">Detailed Results</h4>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {provisioningResults.map((result, index) => {
                                        const order = orders.find(o => o._id === result.orderId);
                                        return (
                                            <div key={index} className="p-3 border dark:border-none-b last:border dark:border-none-b-0">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="font-medium">
                                                            {order?.productName} ({order?.memory})
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {order?.user?.email}
                                                        </div>
                                                        {result.success && result.serviceId && (
                                                            <div className="text-xs text-blue-600 mt-1">
                                                                Service ID: {result.serviceId}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {result.success ? (
                                                            <Badge className="bg-green-50 text-green-700">Success</Badge>
                                                        ) : (
                                                            <Badge className="bg-red-50 text-red-700">Failed</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                {result.error && (
                                                    <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                                                        {result.error}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={() => setShowResultDialog(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default BulkProvisionPage;
