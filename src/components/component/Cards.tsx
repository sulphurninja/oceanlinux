
'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { InfoIcon } from 'lucide-react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

// Define the order type based on your data structure
interface Order {
    _id: string;
    status: 'Active' | 'pending' | 'expired';
}

const Dashboard = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const router = useRouter();

    useEffect(() => {
        fetch('/api/orders/me', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
            .then(response => response.json())
            .then(setOrders)
            .catch(() => router.push('/login'));
    }, []);

    // Calculate different states of orders
    const totalVPS = orders?.length;
    const totalActive = orders?.filter(order => order.status === 'Active').length;
    const expiredVPS = orders?.filter(order => order.status === 'expired' || order.status === 'pending').length;

    return (
        <div className="flex flex-col  overflow-hidden">
            <main className="flex-1 p-4 md:p-8">
               
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Card className="shadow-md bg-transparent">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <InfoIcon className="w-6 h-6" />
                                <CardTitle>Total VPS</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <div className="text-4xl font-bold">{totalVPS}</div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-md bg-transparent">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <InfoIcon className="w-6 h-6" />
                                <CardTitle>Total Active</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <div className="text-4xl font-bold">{totalActive}</div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-md bg-transparent">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <InfoIcon className="w-6 h-6" />
                                <CardTitle>Expired VPS</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <div className="text-4xl font-bold">{expiredVPS}</div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
