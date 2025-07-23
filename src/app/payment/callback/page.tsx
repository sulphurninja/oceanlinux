"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

// Create a client component that uses the useSearchParams hook
function PaymentCallbackContent() {
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("Processing your payment...");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Get transaction ID from URL params
        const clientTxnId = searchParams.get("client_txn_id");

        if (!clientTxnId) {
          setStatus("failed");
          setMessage("Invalid payment reference");
          return;
        }

        // Verify payment with our backend
        const response = await fetch("/api/payment/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientTxnId })
        });

        if (!response.ok) {
          throw new Error("Failed to verify payment");
        }

        const data = await response.json();

        // Check payment status
        if (data.order.status === "confirmed") {
          setStatus("success");
          setMessage("Payment successful! Your order has been confirmed.");

          // Redirect after a short delay
          setTimeout(() => {
            router.push("/dashboard/myOrders");
          }, 3000);
        } else {
          setStatus("failed");
          setMessage("Payment is pending or failed. Check your orders page for details.");
        }
      } catch (error) {
        console.error("Error verifying payment:", error);
        setStatus("failed");
        setMessage("Failed to verify payment status. Please check your orders page.");
      }
    };

    verifyPayment();
  }, [router, searchParams]);

  return (
    <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        {/* ... existing UI code ... */}
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