'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Link from 'next/link';
import { Eye, User, CheckCircle, X, MemoryStick, Computer, ReplyIcon } from 'lucide-react';
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
    os: string;
    memory: string;
    status: string;
    ipAddress?: string;
    username?: string;
    password?: string;
}

function styleText(content: string) {
    const regex = /(\([^)]*\)|[a-zA-Z]+)/g;
    // Matches:
    // 1. Any content inside (parentheses), including numbers
    // 2. Any alphabet (a-zA-Z) outside parentheses

    return content.split(regex).map((part, index) => {
        if (part.match(/\([^)]*\)/) || part.match(/[a-zA-Z]/)) {
            return <span key={index} className="text-red-500">{part}</span>;
        } else {
            return part; // Keeps numbers outside of parentheses unchanged
        }
    });
}



const ViewLinux = () => {
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
                <ReplyIcon />
                <h1 className='text-xl'>View Linux</h1>
            </div>
            <div className='mx-12 mt-6'>
                <Table className='w-full border'>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Memory</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {orders?.map(order => (
                            <TableRow key={order._id}>
                                <TableCell>{styleText(order.productName)}</TableCell>
                                <TableCell>{order.memory}</TableCell>
                                <TableCell>{order.status}</TableCell>
                                <TableCell>
                                    <button onClick={() => handleDialogOpen(order)}>
                                        <Eye className="cursor-pointer" />
                                    </button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    {selectedOrder && (
                        <Dialog open={Boolean(selectedOrder)} onOpenChange={() => setSelectedOrder(null)}>
                            <DialogContent className='md:w-[1300px] '>
                                <DialogTitle>Linux Details</DialogTitle>
                                <DialogDescription>
                                    <div className='grid grid-cols-3  items-center gap-3 w-full'>
                                        <p><Computer /> {selectedOrder.os}</p>
                                        <p><MemoryStick /> Memory: {selectedOrder.memory}</p>
                                        <p><CheckCircle /> Status: {selectedOrder.status}</p>
                                    </div>
                                    {selectedOrder.username ? (
                                        <>
                                            <div className='bg-background grid grid-cols-1 items-center rounded space-y-2 mt-4 
                                                 p-4'>
                                                <div className='md:flex items-center gap-2'>
                                                    <Label>ipAddress:</Label>
                                                    <Input
                                                        readOnly
                                                        value={selectedOrder.ipAddress}
                                                    />
                                                </div>
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

export default ViewLinux;
