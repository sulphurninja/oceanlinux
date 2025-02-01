// src/pages/ipstock.tsx
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
import { ServerIcon, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface MemoryOptionDetails {
    price: number;
}

interface IPStock {
    _id: string;
    name: string;
    memoryOptions: Record<string, MemoryOptionDetails>; // Adjusted to a more descriptive type
    available: boolean;
}

declare global {
    interface Window { Razorpay: any; }
}


const IPStockPage = () => {
    const [ipStocks, setIpStocks] = useState<IPStock[]>([]);
    const router = useRouter();

    const loadRazorpayScript = (src: any) => {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                resolve(true);
            };
            script.onerror = () => {
                resolve(false);
            };
            document.body.appendChild(script);
        });
    };

    const handleLoadRazorpay = async () => {
        const res = await loadRazorpayScript('https://checkout.razorpay.com/v1/checkout.js');
        if (!res) {
            alert('Razorpay SDK failed to load. Are you online?');
            return;
        }
    };


    useEffect(() => {
        handleLoadRazorpay();
    }, []);

    const handleBuyNow = async (productName: string, memory: string, price: number): Promise<void> => {
        const options = {
            key: "rzp_test_GgS0pFyhBV7wHM", // Replace with your Razorpay Key ID
            amount: price * 100, // Razorpay expects the amount in the smallest currency unit (paise)
            currency: "INR",
            name: productName,
            description: `Purchase of ${memory} GB variant`,
            handler: async (response: { razorpay_payment_id: string }) => {
                const { razorpay_payment_id } = response;
                const orderData = {
                    productName,
                    memory,
                    price,
                    paymentId: razorpay_payment_id,
                    status: 'pending'
                };

                // After payment is successful, create an order in the database
                await fetch('/api/createOrder', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}` // Ensure you're storing the JWT in localStorage or similar
                    },
                    body: JSON.stringify(orderData)
                }).then(res => res.json())
                    .then(data => {
                        toast.success('Order created successfully!');
                        console.log(data);
                        router.push('/dashboard/viewLinux')
                    })
                    .catch(error => console.error('Error:', error));
            },
            modal: {
                ondismiss: function () {
                    alert('Payment cancelled by user.');
                }
            },
            prefill: {
                name: "Customer Name",
                email: "customer_email@example.com",
                contact: "9999999999"
            },
            theme: {
                color: "#F37254"
            }
        };

        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
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
            <div className='h-[63px] flex gap-2 items-center border-b p-4'>
                <ServerIcon />
                <h1 className='text-xl'>IP Stock</h1>
            </div>
            <div className='mx-12 mt-6'>
                <Table className='w-full  border'>
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
                                        <Button className='hover:border border hover:border-muted-foreground' onClick={() => handleBuyNow(stock.name, memory, details.price)}>
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


