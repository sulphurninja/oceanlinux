"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Info } from "lucide-react";

// Create a client component that uses the useSearchParams hook
function PaymentCallbackContent() {
  const [message, setMessage] = useState("Your payment is being processed...");
  const [orderId, setOrderId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handlePaymentReturn = async () => {
      try {
        // Get transaction ID from URL params or localStorage
        const clientTxnId = searchParams.get("client_txn_id") || searchParams.get("txn_id");
        const storedClientTxnId = localStorage.getItem('lastClientTxnId');
        const effectiveClientTxnId = clientTxnId || storedClientTxnId;
        
        console.log("Transaction ID:", effectiveClientTxnId);
        
        // Clean up localStorage
        localStorage.removeItem('lastClientTxnId');

        // If we have a transaction ID, try to retrieve order info
        if (effectiveClientTxnId) {
          try {
            const response = await fetch("/api/payment/status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                clientTxnId: effectiveClientTxnId,
                returnedFromPayment: true
              })
            });
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.order) {
                setOrderId(data.order.id);
              }
            }
          } catch (error) {
            // Just log the error, keep processing state
            console.error("Error retrieving order info:", error);
          }
        }
        
        // Redirect to orders page after a delay
        setTimeout(() => {
          router.push("/dashboard/viewLinux");
        }, 4000);
        
      } catch (error) {
        console.error("Error in callback page:", error);
      }
    };

    handlePaymentReturn();
  }, [router, searchParams]);

  return (
    <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />

        <h1 className="text-xl font-bold">
          Processing Your Payment
        </h1>

        <p className="text-gray-300">{message}</p>

        <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-700/50 text-sm text-left w-full mt-2">
          <div className="flex gap-2">
            <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-blue-200">
              Please wait while we verify your payment. You will be redirected to your orders page in a few seconds...
            </p>
          </div>
        </div>

        {orderId && (
          <div className="text-gray-400 text-sm">
            Order ID: {orderId}
          </div>
        )}

        <button
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition"
          onClick={() => router.push("/dashboard/myOrders")}
        >
          View My Orders
        </button>
      </div>
    </div>
  );
}

// Create a fallback UI
function PaymentCallbackFallback() {
  return (
    <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
        <h1 className="text-xl font-bold">Processing Payment</h1>
        <p className="text-gray-300">Please wait while we process your payment...</p>
      </div>
    </div>
  );
}

// Main component with Suspense boundary
export default function PaymentCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <Suspense fallback={<PaymentCallbackFallback />}>
        <PaymentCallbackContent />
      </Suspense>
    </div>
  );
}