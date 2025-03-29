'use client'

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { InfoIcon, Server, Power, AlertCircle } from 'lucide-react';

// Define the order type based on your data structure
interface Order {
    _id: string;
    status: 'Active' | 'pending' | 'expired';
}

const Dashboard = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                setIsLoading(true);
   
              
                const response = await fetch('/api/orders/me', {
                    headers: { 'Authorization': `Bearer ` }
                });
                
                if (!response.ok) {
                    throw new Error('Failed to fetch orders');
                }
                
                const data = await response.json();
                setOrders(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error('Error fetching orders:', err);
                setError('Could not load your VPS data');
                // Don't redirect on error, just show empty state
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchOrders();
    }, []);

    // Calculate different states of orders, safely handling empty arrays
    const totalVPS = orders?.length || 0;
    const totalActive = orders?.filter(order => order.status === 'Active')?.length || 0;
    const expiredVPS = orders?.filter(order => 
        order.status === 'expired' || order.status === 'pending'
    )?.length || 0;

    if (isLoading) {
        return (
            <div className="flex flex-col overflow-hidden">
                <main className="flex-1 p-4 md:p-8">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map((i) => (
                            <Card key={i} className="shadow-md bg-transparent">
                                <CardHeader>
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 bg-gray-700 rounded animate-pulse"></div>
                                        <div className="h-5 w-24 bg-gray-700 rounded animate-pulse"></div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-10 w-16 bg-gray-700 rounded animate-pulse"></div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col overflow-hidden">
            <main className="flex-1 p-4 md:p-8">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Card className="shadow-md bg-transparent border-gray-800">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Server className="w-5 h-5 text-blue-400" />
                                <CardTitle>Total VPS</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <div className="text-4xl font-bold">{totalVPS}</div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-md bg-transparent border-gray-800">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Power className="w-5 h-5 text-green-400" />
                                <CardTitle>Total Active</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <div className="text-4xl font-bold">{totalActive}</div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-md bg-transparent border-gray-800">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-amber-400" />
                                <CardTitle>Expired VPS</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <div className="text-4xl font-bold">{expiredVPS}</div>
                        </CardContent>
                    </Card>
                </div>
                
                {error && (
                    <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm">
                        {error}
                    </div>
                )}
                
                {!isLoading && !error && totalVPS === 0 && (
                    <div className="mt-8 text-center p-6 bg-gray-800/50 border border-gray-700 rounded-lg">
                        <InfoIcon className="w-10 h-10 text-gray-500 mx-auto mb-3" />
                        <h3 className="text-xl font-medium text-gray-300 mb-1">No VPS Found</h3>
                        <p className="text-gray-400">
                            You don't have any VPS servers yet. Visit the store to purchase your first server.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;