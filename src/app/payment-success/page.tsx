'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

const PaymentSuccessPage = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orderId = searchParams.get('order_id');

    // useEffect(() => {
    //     if (orderId) {
    //         verifyPayment(orderId);
    //     }
    // }, [orderId]);

    // const verifyPayment = async (orderId) => {
    //     try {
    //         const response = await fetch('/api/confirmOrder', {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ orderId })
    //         });

    //         const confirmData = await response.json();

    //         if (confirmData.message === "Order confirmed.") {
    //             toast.success("Payment Verified! Order Created Successfully.");
    //             router.push('/dashboard/viewLinux');
    //         } else {
    //             toast.error("Payment Verification Failed.");
    //             router.push('/dashboard');
    //         }
    //     } catch (error) {
    //         console.error("Error verifying payment:", error);
    //         toast.error("Something went wrong.");
    //         router.push('/dashboard');
    //     }
    // };

    return (
        <div className="flex flex-col items-center bg-background justify-center min-h-screen">
            <h2 className="text-2xl font-bold">Verifying Payment...</h2>
            <p className="mt-2">Please wait while we confirm your order.</p>
        </div>
    );
};

export default PaymentSuccessPage;
