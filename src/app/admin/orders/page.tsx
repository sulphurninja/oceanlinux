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
    username?: string;
    password?: string;
}


const AdminOrders = () => {
    const [orders, setOrders] = useState<OrderType[] | null>([]);
    const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);


    useEffect(() => {
        fetch('/api/orders/all')
            .then(response => response.json())
            .then(setOrders)
            .catch(error => console.error('Failed to load orders:', error));
    }, []);

    const handleUpdate = (order: OrderType, username: string, password: string) => {
        fetch(`/api/orders/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, orderId: order._id })
        })
            .then(response => response.json())
            .then(() => {
                toast.success('Order updated successfully');
                setSelectedOrder(null); // Close dialog after update
                // Optionally refresh the list or update state to show new username/password
            })
            .catch(error => console.error('Error updating order:', error));
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
                            Update username and password for the order.
                        </DialogDescription>
                        <Input
                            placeholder="Username"
                            defaultValue={selectedOrder.username}
                            onChange={(e) => selectedOrder.username = e.target.value}
                        />
                        <Input
                            type="password"
                            placeholder="Password"
                            defaultValue={selectedOrder.password}
                            onChange={(e) => selectedOrder.password = e.target.value}
                        />
                        <DialogFooter>
                            <Button onClick={() => handleUpdate(selectedOrder, selectedOrder.username ?? "", selectedOrder.password ?? "")}>Save Changes</Button>
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
