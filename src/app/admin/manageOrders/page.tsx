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
import { Eye, Settings, Play, RotateCcw, Loader2, AlertCircle, CheckCircle, Wrench } from 'lucide-react';

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

const ManageOrders = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isProvisioningDialogOpen, setIsProvisioningDialogOpen] = useState(false);
    const [provisioning, setProvisioning] = useState<string | null>(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const response = await fetch('/api/admin/orders');
            const data = await response.json();
            setOrders(data);
        } catch (error) {
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
                fetchOrders(); // Refresh the orders list
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

    const getProvisioningStatusBadge = (order: Order) => {
        if (order.autoProvisioned) {
            switch (order.provisioningStatus) {
                case 'provisioning':
                    return (
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Auto-Provisioning
                        </Badge>
                    );
                case 'active':
                    return (
                        <Badge className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Auto-Provisioned
                        </Badge>
                    );
                case 'failed':
                    return (
                        <Badge className="bg-red-50 text-red-700 border-red-200">
                            <AlertCircle className="w-3 h-3 mr-1" />
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
                <Badge className="bg-purple-50 text-purple-700 border-purple-200">
                    <Wrench className="w-3 h-3 mr-1" />
                    Manual Setup
                </Badge>
            );
        }
        return (
            <Badge variant="secondary">
                Not Provisioned
            </Badge>
        );
    };

    return (
        <div className='w-full'>
            <div className='h-[63px] flex gap-2 items-center border-b p-4'>
                <h1 className='text-xl'>Manage Orders</h1>
                <Button variant="outline" onClick={fetchOrders}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            <div className='mx-12 mt-6'>
                <Table className='w-full border'>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Memory</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Provisioning</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders.map(order => (
                            <TableRow key={order._id}>
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
                                    <Badge variant={
                                        order.status === 'active' ? 'default' :
                                        order.status === 'paid' ? 'secondary' :
                                        order.status === 'pending' ? 'outline' : 'destructive'
                                    }>
                                        {order.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {getProvisioningStatusBadge(order)}
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleEdit(order)}
                                        >
                                            <Eye className="w-4 h-4 mr-1" />
                                            {order.autoProvisioned ? 'View' : 'Edit'}
                                        </Button>

                                        {(order.status === 'paid' &&
                                          (!order.autoProvisioned || order.provisioningStatus === 'failed')) && (
                                            <Button
                                                size="sm"
                                                onClick={() => handleProvision(order)}
                                                disabled={provisioning === order._id}
                                                className="bg-blue-600 hover:bg-blue-700"
                                            >
                                                {provisioning === order._id ? (
                                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                                ) : (
                                                    <Play className="w-4 h-4 mr-1" />
                                                )}
                                                Auto-Provision
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {/* Manual Edit Dialog */}
                {isDialogOpen && currentOrder && (
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>
                                    {currentOrder.autoProvisioned ? 'View Order Details' : 'Edit Order Details'}
                                </DialogTitle>
                                <DialogDescription>
                                    {currentOrder.autoProvisioned
                                        ? 'View server information (auto-provisioned)'
                                        : 'Update order information and server credentials manually'
                                    }
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Product Name</Label>
                                        <Input
                                            value={currentOrder.productName}
                                            onChange={(e) => setCurrentOrder({ ...currentOrder, productName: e.target.value })}
                                            readOnly
                                            className="bg-gray-50"
                                        />
                                    </div>
                                    <div>
                                        <Label>Memory</Label>
                                        <Input
                                            value={currentOrder.memory}
                                            readOnly
                                            className="bg-gray-50"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
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
                                                <SelectItem value="pending">Pending</SelectItem>
                                                <SelectItem value="paid">Paid</SelectItem>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="expired">Expired</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
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

                                {/* Server Credentials Section */}
                                <div className="space-y-4 border-t pt-4">
                                    <div className="flex items-center gap-2">
                                        <Settings className="w-4 h-4" />
                                        <Label className="text-base font-semibold">Server Credentials</Label>
                                        {currentOrder.autoProvisioned && (
                                            <Badge variant="outline" className="text-xs">
                                                Auto-Generated
                                            </Badge>
                                        )}
                                    </div>

                                    <div>
                                        <Label>IP Address</Label>
                                        <Input
                                            value={currentOrder.ipAddress || ''}
                                            onChange={(e) => setCurrentOrder({ ...currentOrder, ipAddress: e.target.value })}
                                            placeholder="Enter IP address"
                                            readOnly={currentOrder.autoProvisioned}
                                            className={currentOrder.autoProvisioned ? "bg-gray-50" : ""}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Username</Label>
                                            <Input
                                                value={currentOrder.username || ''}
                                                onChange={(e) => setCurrentOrder({ ...currentOrder, username: e.target.value })}
                                                placeholder="Enter username"
                                                readOnly={currentOrder.autoProvisioned}
                                                className={currentOrder.autoProvisioned ? "bg-gray-50" : ""}
                                            />
                                        </div>
                                        <div>
                                            <Label>Password</Label>
                                            <Input
                                                type="password"
                                                value={currentOrder.password || ''}
                                                onChange={(e) => setCurrentOrder({ ...currentOrder, password: e.target.value })}
                                                placeholder="Enter password"
                                                readOnly={currentOrder.autoProvisioned}
                                                className={currentOrder.autoProvisioned ? "bg-gray-50" : ""}
                                            />
                                        </div>
                                    </div>

                                    {/* Show provisioning error if exists */}
                                    {currentOrder.provisioningError && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                            <div className="flex items-start gap-2">
                                                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                                                <div>
                                                    <Label className="text-red-700 font-medium">Provisioning Error</Label>
                                                    <p className="text-sm text-red-600 mt-1">
                                                        {currentOrder.provisioningError}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Show Hostycare service ID if available */}
                                    {currentOrder.hostycareServiceId && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <Label className="text-blue-700 font-medium">Hostycare Service ID</Label>
                                            <p className="text-sm text-blue-600 font-mono mt-1">
                                                {currentOrder.hostycareServiceId}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DialogFooter>
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
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Auto-Provision Server</DialogTitle>
                                <DialogDescription>
                                    Start automatic server provisioning via Hostycare API for this order?
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="bg-blue-100 p-2 rounded-full">
                                            <Play className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-blue-900">Auto-Provisioning will:</h4>
                                            <ul className="text-sm text-blue-800 mt-2 space-y-1">
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
                                        <Label className="text-gray-600">Product:</Label>
                                        <p className="font-medium">{currentOrder.productName}</p>
                                    </div>
                                    <div>
                                        <Label className="text-gray-600">Memory:</Label>
                                        <p className="font-medium">{currentOrder.memory}</p>
                                    </div>
                                </div>

                                {currentOrder.provisioningError && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                        <Label className="text-red-700 font-medium">Previous Error:</Label>
                                        <p className="text-sm text-red-600 mt-1">
                                            {currentOrder.provisioningError}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button
                                    onClick={() => handleAutoProvision(currentOrder._id)}
                                    disabled={provisioning === currentOrder._id}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {provisioning === currentOrder._id ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Provisioning...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4 mr-2" />
                                            Start Auto-Provision
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </div>
    );
};

export default ManageOrders;
