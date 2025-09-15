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
        // Get transaction ID from URL params (Razorpay uses different param names)
        const clientTxnId = searchParams.get("client_txn_id");
        const paymentId = searchParams.get("payment_id");
        const statusParam = searchParams.get("status");

        console.log(`Payment callback received with transaction ID: ${clientTxnId}`);
        console.log(`Payment ID: ${paymentId}`);
        console.log(`Status param: ${statusParam}`);

        // Convert searchParams to a regular object
        const paramsObject: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          paramsObject[key] = value;
        });
        console.log(`URL parameters:`, paramsObject);

        // Handle specific failure statuses
        if (statusParam === "processing_failed" || statusParam === "confirmation_failed") {
          setStatus("failed");
          setMessage("Payment was successful but order processing failed. Please contact support with your transaction details.");
          return;
        }

        if (!clientTxnId) {
          setStatus("failed");
          setMessage("Invalid payment reference");
          console.error("Missing transaction ID in URL parameters");
          return;
        }

        // Verify payment with our backend
        console.log(`Calling payment status API with transaction ID: ${clientTxnId}`);

        const response = await fetch("/api/payment/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientTxnId: clientTxnId,
            razorpayPaymentId: paymentId, // Include Razorpay payment ID
            returnedFromPayment: true,
            allParams: paramsObject
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
          console.log(`Payment confirmed for transaction ${clientTxnId}`);
          setStatus("success");
          setMessage("Payment successful! Your server is being provisioned and will be ready shortly.");

          // Show success toast
          toast.success("Payment confirmed! Check your orders for server details.");

          // Redirect after a short delay
          setTimeout(() => {
            router.push("/dashboard/viewLinux");
          }, 3000);
        } else {
          console.log(`Payment not confirmed for transaction ${clientTxnId}`, data);
          setStatus("failed");
          setMessage(data.message || "Payment verification failed. Please check your orders page or contact support.");
        }
      } catch (error: any) {
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
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border dark:border-none border dark:border-none-gray-700">
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
            {status === "loading" ? "Verifying Payment" :
              status === "success" ? "Payment Successful" : "Payment Issue"}
          </h1>

          <p className="text-gray-300">{message}</p>

          {status !== "loading" && (
            <div className="space-y-2 w-full">
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition"
                onClick={() => router.push("/dashboard/viewLinux")}
              >
                View My Orders
              </button>
              {status === "failed" && (
                <button
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-md transition"
                  onClick={() => router.push("/dashboard/ipStock")}
                >
                  Try Again
                </button>
              )}
            </div>
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
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border dark:border-none border dark:border-none-gray-700">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          <h1 className="text-xl font-bold">Loading Payment Status</h1>
          <p className="text-gray-300">Please wait while we verify your payment...</p>
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
