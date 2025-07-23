"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

// Create a client component that uses useSearchParams
function PaymentCallbackContent() {
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("Processing your payment...");
  const router = useRouter();
  const searchParams = useSearchParams();
  const retried = useRef(false);
  
  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Get transaction ID from URL params
        const clientTxnId = searchParams.get("client_txn_id");
        // Also try alternative parameter names the gateway might use
        const altTxnId = searchParams.get("txnId") || searchParams.get("transaction_id") || searchParams.get("order_id");
        
        const actualTxnId = clientTxnId || altTxnId;
        
        console.log(`Payment callback received with transaction ID: ${actualTxnId}`);
        
        // Convert searchParams to a regular object without using spread operator
        const paramsObject: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          paramsObject[key] = value;
        });
        console.log(`URL parameters:`, paramsObject);
        
        if (!actualTxnId) {
          setStatus("failed");
          setMessage("Invalid payment reference");
          console.error("Missing transaction ID in URL parameters");
          return;
        }

        // Verify payment with our backend
        console.log(`Calling payment status API with transaction ID: ${actualTxnId}`);
        
        const response = await fetch("/api/payment/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            clientTxnId: actualTxnId,
            returnedFromPayment: true,  // Add this flag to indicate it's coming directly from payment
            allParams: paramsObject // Send all URL params for debugging
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`API returned error ${response.status}: ${errorText}`);
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`Payment status API response:`, data);
        
        // Check payment status
        if (data.order && data.order.status === "confirmed") {
          console.log(`Payment confirmed for transaction ${actualTxnId}`);
          setStatus("success");
          setMessage("Payment successful! Your order has been confirmed.");
          
          // Redirect after a short delay
          setTimeout(() => {
            router.push("/dashboard/viewLinux");
          }, 3000);
        } else {
          console.log(`Payment not confirmed for transaction ${actualTxnId}`, data);
          setStatus("failed");
          setMessage(data.message || "Payment is pending or failed. Check your orders page for details.");
        }
      } catch (error:any) {
        console.error("Error verifying payment:", error);
        setStatus("failed");
        setMessage(`Failed to verify payment status: ${error.message}`);
        
        // Implement a retry mechanism
        if (!retried.current) {
          console.log("Retrying payment verification in 2 seconds...");
          retried.current = true;
          setTimeout(() => {
            verifyPayment();
          }, 2000);
        }
      }
    };

    verifyPayment();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          {status === "loading" && (
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          )}
          
          {status === "success" && (
            <CheckCircle2 className="h-12 w-12 text-green-500" />
          )}
          
          {status === "failed" && (
            <XCircle className="h-12 w-12 text-red-500" />
          )}
          
          <h1 className="text-xl font-bold">
            {status === "loading" ? "Processing Payment" : 
             status === "success" ? "Payment Successful" : "Payment Failed"}
          </h1>
          
          <p className="text-gray-300">{message}</p>
          
          {status !== "loading" && (
            <button 
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition"
              onClick={() => router.push("/dashboard/viewLinux")}
            >
              View My Orders
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Fallback component to show while content is loading
function PaymentCallbackFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          <h1 className="text-xl font-bold">Loading Payment Status</h1>
          <p className="text-gray-300">Please wait while we check your payment...</p>
        </div>
      </div>
    </div>
  );
}

// Main page component with Suspense boundary
export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<PaymentCallbackFallback />}>
      <PaymentCallbackContent />
    </Suspense>
  );
}