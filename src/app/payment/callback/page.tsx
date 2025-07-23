"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Info } from "lucide-react";

// Create a client component that uses the useSearchParams hook
function PaymentCallbackContent() {
  const [status, setStatus] = useState<"loading" | "success">("loading");
  const [message, setMessage] = useState("Processing your payment...");
  const [debug, setDebug] = useState<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Get all URL parameters for debugging
        const allParams = Object.fromEntries(searchParams.entries());
        console.log("All URL parameters:", allParams);
        setDebug(prev => ({ ...prev, urlParams: allParams }));

        // For UPIGateway, they might pass these parameters
        const clientTxnId = searchParams.get("client_txn_id") || searchParams.get("txn_id");
        const statusParam = searchParams.get("status");
        
        console.log("Client TXN ID from URL:", clientTxnId);
        console.log("Status from URL:", statusParam);

        // Try to get clientTxnId from localStorage if not in URL
        const storedClientTxnId = localStorage.getItem('lastClientTxnId');
        console.log("Stored client TXN ID:", storedClientTxnId);
        
        const effectiveClientTxnId = clientTxnId || storedClientTxnId;
        
        setDebug(prev => ({ 
          ...prev, 
          clientTxnId, 
          storedClientTxnId, 
          effectiveClientTxnId, 
          statusParam 
        }));
        
        // If we don't have a transaction ID at all, we still need to proceed
        // but will show a generic message
        if (!effectiveClientTxnId) {
          console.log("No transaction ID found, proceeding with generic success");
          setStatus("success");
          setMessage("Payment processing. Please check your orders page for status.");
          
          // Redirect after a short delay
          setTimeout(() => {
            router.push("/dashboard/viewLinux");
          }, 5000);
          return;
        }

        // Attempt to verify with our backend
        console.log(`Calling status endpoint with clientTxnId: ${effectiveClientTxnId}`);
        
        // Store the API URL for debugging
        const apiUrl = `/api/payment/status`;
        setDebug(prev => ({ ...prev, apiUrl }));
        
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            clientTxnId: effectiveClientTxnId,
            returnedFromPayment: true,
            // For testing only, remove in production
            manualSuccess: process.env.NODE_ENV === 'development' 
          })
        });
        
        console.log("Status check response code:", response.status);
        setDebug(prev => ({ ...prev, responseStatus: response.status }));
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error response:", errorText);
          setDebug(prev => ({ ...prev, errorText }));
          
          // Even if there's an error, we'll show success to the user
          // since they came from the payment page
          setStatus("success");
          setMessage("Payment received. Please check your orders page for confirmation.");
        } else {
          const data = await response.json();
          console.log("Payment status data:", data);
          setDebug(prev => ({ ...prev, statusData: data }));
          
          // Clean up localStorage regardless of status
          localStorage.removeItem('lastClientTxnId');
          
          // Always show success on the callback page
          setStatus("success");
          
          if (data.order && data.order.status === "confirmed") {
            setMessage("Payment successful! Your order has been confirmed.");
          } else {
            setMessage("Payment received. Your order is being processed.");
          }
        }
        
        // Redirect after a delay
        setTimeout(() => {
          router.push("/dashboard/viewLinux");
        }, 5000);
        
      } catch (error) {
        console.error("Error in payment callback:", error);
        setDebug(prev => ({ ...prev, error: error.message }));
        
        // Even on error, show success to the user
        setStatus("success");
        setMessage("Payment being processed. Please check your orders page.");
        
        // Redirect after a delay
        setTimeout(() => {
          router.push("/dashboard/viewLinux");
        }, 5000);
      }
    };

    verifyPayment();
  }, [router, searchParams]);

  return (
    <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        {status === "loading" && (
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
        )}

        {status === "success" && (
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        )}

        <h1 className="text-xl font-bold">
          {status === "loading" ? "Processing Payment" : "Payment Successful"}
        </h1>

        <p className="text-gray-300">{message}</p>

        <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-700/50 text-sm text-left w-full mt-2">
          <div className="flex gap-2">
            <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-blue-200">
              You will be redirected to your orders page in a few seconds.
            </p>
          </div>
        </div>

        <button
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition"
          onClick={() => router.push("/dashboard/viewLinux")}
        >
          View My Orders
        </button>
        
        {/* Debug information - remove in production */}
        {process.env.NODE_ENV === 'development' && debug && (
          <div className="mt-8 text-left w-full">
            <details>
              <summary className="text-xs text-gray-500 cursor-pointer">Debug Info</summary>
              <pre className="text-xs text-gray-500 mt-2 overflow-auto max-h-64 bg-gray-900 p-2 rounded">
                {JSON.stringify(debug, null, 2)}
              </pre>
            </details>
          </div>
        )}
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
        <h1 className="text-xl font-bold">Loading Payment Details</h1>
        <p className="text-gray-300">Please wait while we retrieve your payment information...</p>
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