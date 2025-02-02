'use client'

import React, { useEffect, useState } from 'react';
import {
    Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';


interface OrderType {
    _id: string;
    paymentId: string;
    productName: string;
    memory: string;
    status: string;
    ipAddress?: string;
    updatedAt: string;
    username?: string;
    password?: string;
}


const AdminOrders = () => {
    const [orders, setOrders] = useState<OrderType[] | null>([]);
    const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);

    // ✅ Properly update state using setSelectedOrder instead of direct mutation
    const handleInputChange = (field: keyof OrderType, value: string) => {
        setSelectedOrder(prev => prev ? { ...prev, [field]: value } : null);
    };

    useEffect(() => {
        fetch('/api/orders/all')
            .then(response => response.json())
            .then(data => {
                // ✅ Sort orders by createdAt (latest orders at the top)
                const sortedOrders = data.sort((a: OrderType, b: OrderType) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                );
                setOrders(sortedOrders);
            })
            .catch(error => console.error('Failed to load orders:', error));
    }, []);

    const handleUpdate = () => {
        if (selectedOrder) {
            fetch(`/api/orders/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: selectedOrder._id,
                    username: selectedOrder.username,
                    password: selectedOrder.password,
                    ipAddress: selectedOrder.ipAddress,
                })
            })
                .then(response => response.json())
                .then(() => {
                    toast.success('Order updated successfully');
                    setSelectedOrder(null); // Close dialog after update
                    // Optionally refresh the list or update state to show new username/password
                })
                .catch(error => console.error('Error updating order:', error));
        }
    };



    return (
        <div>
            <div className='p-4 text-lg border-b'>
                <h1>All Orders - Update Credentials</h1>
            </div>
            <div className='border mt-6 mx-12'>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Payment ID</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Memory</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders?.map(order => (
                            <TableRow key={order._id}>
                                <TableCell>{order.paymentId}</TableCell>
                                <TableCell>{order.productName}</TableCell>
                                <TableCell>{order.memory}</TableCell>
                                <TableCell>{order.status}</TableCell>
                                <TableCell>
                                    <Button onClick={() => setSelectedOrder(order)}>Update</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {selectedOrder && (
                <Dialog open={Boolean(selectedOrder)} onOpenChange={() => setSelectedOrder(null)}>
                    <DialogContent>
                        <DialogTitle>Update Order</DialogTitle>
                        <DialogDescription>
                            Update ip, username and password for the order.
                        </DialogDescription>
                        <Input
                            placeholder="IP Address"
                            value={selectedOrder.ipAddress || ''}
                            onChange={(e) => handleInputChange('ipAddress', e.target.value)}
                        />
                        <Input
                            placeholder="Username"
                            value={selectedOrder.username || ''}
                            onChange={(e) => handleInputChange('username', e.target.value)}
                        />
                        <Input
                            type="password"
                            placeholder="Password"
                            value={selectedOrder.password || ''}
                            onChange={(e) => handleInputChange('password', e.target.value)}
                        />
                        <DialogFooter>
                            <Button onClick={handleUpdate}>Save Changes</Button>
                            <DialogClose asChild>
                                <Button><X />Close</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default AdminOrders;
