'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Link from 'next/link';
import { Eye, User, CheckCircle, X, MemoryStick, Computer, ReceiptIndianRupee } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogOverlay,
    DialogTitle,
    DialogDescription,
    DialogClose
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Order {
    _id: string;
    productName: string;
    paymentId: string;
    memory: string;
    status: string;
    price: string;
    username?: string;
    password?: string;
}


const OrderHistory = () => {
    const [orders, setOrders] = useState<Order[]>([]); // Updated with Order type
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const router = useRouter();

    useEffect(() => {
        fetch('/api/orders/me', {
        })
            .then(response => response.json())
            .then(setOrders)
            .catch(() => router.push('/login'));
    }, []);


    const handleDialogOpen = (order: Order) => {
        setSelectedOrder(order);
    };

    console.log(orders, 'orders')

    return (
        <div className='w-full'>
            <div className='h-[63px] flex items-center border-b gap-2 p-4'>
                <ReceiptIndianRupee />
                <h1 className='text-xl'>Order History</h1>
            </div>
            <div className='mx-12 mt-6'>
                <Table className='w-full border'>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Payment ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Memory</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders?.map(order => (
                            <TableRow key={order._id}>
                                <TableCell>{order.paymentId}</TableCell>
                                <TableCell>{order.productName}</TableCell>
                                <TableCell>{order.memory}</TableCell>
                                <TableCell>{order.price}</TableCell>
                                <TableCell>{order.status}</TableCell>
                                {/* <TableCell>
                                    <button onClick={() => handleDialogOpen(order)}>
                                        <Eye className="cursor-pointer" />
                                    </button>
                                </TableCell> */}
                            </TableRow>
                        ))}
                    </TableBody>
                    {selectedOrder && (
                        <Dialog open={Boolean(selectedOrder)} onOpenChange={() => setSelectedOrder(null)}>
                            <DialogContent className='md:w-[1300px] '>
                                <DialogTitle>Linux Details</DialogTitle>
                                <DialogDescription>
                                    <div className='grid grid-cols-3  items-center gap-3 w-full'>
                                        <p><Computer /> {`${selectedOrder.productName}`.slice(0, 10)}...</p>
                                        <p><MemoryStick /> Memory: {selectedOrder.memory}</p>
                                        <p><CheckCircle /> Status: {selectedOrder.status}</p>
                                    </div>
                                    {selectedOrder.username ? (
                                        <>
                                            <div className='bg-background grid grid-cols-1 items-center rounded space-y-2 mt-4      p-4'>
                                                <div className='md:flex items-center gap-2'>
                                                    <Label>Username:</Label>
                                                    <Input
                                                        readOnly
                                                        value={selectedOrder.username}
                                                    />
                                                </div>
                                                <div className='md:flex items-center gap-2'>
                                                    <Label>Password:</Label>
                                                    <Input
                                                        readOnly
                                                        value={selectedOrder.password}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className='border p-5 mt-4'>
                                            <p className="text-red-500">The order status is Pending, Please wait <br />(Expected wait time: 5 mins)</p>
                                        </div>
                                    )}
                                </DialogDescription>

                            </DialogContent>
                        </Dialog>
                    )}
                </Table>
            </div>
        </div>
    );
};

export default OrderHistory;
