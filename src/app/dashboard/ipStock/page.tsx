'use client'

import { useEffect, useState } from 'react';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { ServerIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface MemoryOptionDetails {
    price: number;
}

interface IPStock {
    _id: string;
    name: string;
    memoryOptions: Record<string, MemoryOptionDetails>;
    available: boolean;
}

declare global {
    interface Window { Cashfree: any; }
}

const IPStockPage = () => {
    const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
    const router = useRouter();

    useEffect(() => {
        const loadCashfreeScript = () => {
            return new Promise((resolve, reject) => {
                if (window.Cashfree) {
                    console.log("Cashfree SDK already loaded");
                    resolve(true);
                    return;
                }

                const script = document.createElement("script");
                script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
                script.async = true;
                script.onload = () => {
                    console.log("Cashfree SDK Loaded");
                    resolve(true);
                };
                script.onerror = () => {
                    console.error("Failed to load Cashfree SDK");
                    reject(false);
                };

                document.body.appendChild(script);
            });
        };

        loadCashfreeScript();
    }, []);

    const handleBuyNow = async (productName: string, memory: string, price: number) => {
        try {
            const orderResponse = await fetch('/api/createOrder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productName, memory, price })
            });

            const orderData = await orderResponse.json();

            if (!orderData || !orderData.paymentSessionId) {
                toast.error("Failed to initiate payment.");
                return;
            }

            console.log("🔗 Redirecting to Cashfree Hosted Checkout:", orderData.paymentSessionId);


            // ✅ Use window.Cashfree to avoid TypeScript errors
            if (typeof window !== "undefined" && window.Cashfree) {
                const cashfree = window.Cashfree({ mode: "production" }); // Change to "sandbox" in test mode
                cashfree.checkout({
                    paymentSessionId: orderData.paymentSessionId,
                    redirectTarget: "_self" // Opens in the same tab
                });
            } else {
                console.error("❌ Cashfree SDK not loaded.");
                toast.error("Payment gateway not loaded. Please refresh the page.");
            }

        } catch (error) {
            console.error("❌ Payment Error:", error);
            toast.error("Something went wrong.");
        }
    };





    useEffect(() => {
        const fetchIPStocks = async () => {
            const response = await fetch('/api/ipstock');
            const data = await response.json();
            setIpStocks(data);
        };
        fetchIPStocks();
    }, []);

    return (
        <div className='w-full'>
            <div id="cashfree-container" className="mt-4"></div>

            <div className='h-[63px] flex gap-2 items-center border-b p-4'>
                <ServerIcon />
                <h1 className='text-xl'>IP Stock</h1>
            </div>
            <div className='mx-12 mt-6'>
                <Table className='w-full border'>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Available</TableHead>
                            <TableHead>4 GB</TableHead>
                            <TableHead>8 GB</TableHead>
                            <TableHead>16 GB</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {ipStocks.map((stock) => (
                            <TableRow key={stock._id}>
                                <TableCell>{stock.name}</TableCell>
                                <TableCell>{stock.available ? 'Yes' : 'No'}</TableCell>
                                {Object.entries(stock.memoryOptions).map(([memory, details]) => (
                                    <TableCell key={memory}>
                                        <Button onClick={() => handleBuyNow(stock.name, memory, details.price)}>
                                            Buy Now
                                        </Button>
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

export default IPStockPage;
