"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
        const orderId = searchParams.get("order_id");
        const paymentId = searchParams.get("payment_id");
        const statusParam = searchParams.get("status");

        console.log(`Payment callback received with transaction ID: ${clientTxnId}`);
        console.log(`Order ID: ${orderId}`);
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
          setMessage("Payment was successful but order processing failed. Don't worry - your payment is safe! Please contact support with your transaction ID for assistance.");
          return;
        }

        // Check for session/auth errors in URL
        if (statusParam === "session_expired" || statusParam === "auth_error") {
          setStatus("failed");
          setMessage("Your session expired during payment. If your payment was successful, it will be automatically processed. You can check your order status in the dashboard.");
          return;
        }

        if (!clientTxnId) {
          setStatus("failed");
          setMessage("Invalid payment reference");
          console.error("Missing transaction ID in URL parameters");
          return;
        }

        // Detect if this is a renewal transaction
        const isRenewal = clientTxnId.startsWith("RENEWAL_");
        console.log(`Transaction type: ${isRenewal ? 'RENEWAL' : 'NEW ORDER'}`);

        // HANDLE RENEWAL TRANSACTIONS
        if (isRenewal) {
          console.log(`[RENEWAL-CALLBACK] Processing renewal transaction: ${clientTxnId}`);

          // First, verify payment status
          const statusResponse = await fetch("/api/payment/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              renewalTxnId: clientTxnId
            })
          });

          if (!statusResponse.ok) {
            throw new Error(`Failed to verify renewal payment status`);
          }

          const statusData = await statusResponse.json();
          console.log(`[RENEWAL-CALLBACK] Payment status response:`, statusData);

          if (statusData.paymentStatus === 'SUCCESS') {
            console.log(`[RENEWAL-CALLBACK] Payment successful, confirming renewal...`);

            // Confirm the renewal
            const confirmResponse = await fetch("/api/payment/renew-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                renewalTxnId: clientTxnId,
                orderId: orderId
              })
            });

            const confirmData = await confirmResponse.json();
            console.log(`[RENEWAL-CALLBACK] Renewal confirmation response:`, confirmData);

            if (confirmResponse.ok && confirmData.success) {
              console.log(`[RENEWAL-CALLBACK] ✅ Renewal successful!`);
              setStatus("success");

              // Handle different processing scenarios
              if (confirmData.processing) {
                // Webhook is processing the renewal
                setMessage("Payment successful! Your renewal is being processed and will be confirmed shortly.");
              } else if (confirmData.alreadyProcessed) {
                // Already processed by webhook
                setMessage("Renewal successful! Your service has been extended for 30 days.");
              } else {
                // Processed by this confirmation
                setMessage("Renewal successful! Your service has been extended for 30 days.");
              }

              toast.success("Service renewed successfully!");

              setTimeout(() => {
                router.push(`/dashboard/order/${orderId}`);
              }, 3000);
            } else {
              console.error(`[RENEWAL-CALLBACK] ❌ Renewal confirmation failed:`, confirmData);
              setStatus("failed");
              setMessage(confirmData.message || "Payment successful but renewal processing failed. Please contact support.");
            }
          } else {
            console.log(`[RENEWAL-CALLBACK] Payment not successful: ${statusData.paymentStatus}`);
            setStatus("failed");
            setMessage("Renewal payment verification failed. Please check your orders or contact support.");
          }

          return;
        }

        // HANDLE NEW ORDER TRANSACTIONS (existing logic)
        console.log(`Calling payment status API with transaction ID: ${clientTxnId}`);

        const response = await fetch("/api/payment/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientTxnId: clientTxnId,
            razorpayPaymentId: paymentId,
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

          toast.success("Payment confirmed! Check your orders for server details.");

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

  // Determine icon and colors based on message content
  const isSessionError = message.toLowerCase().includes('session') || message.toLowerCase().includes('expired');
  const isPaymentSafe = message.toLowerCase().includes('payment is safe') || message.toLowerCase().includes('automatically processed');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-xl shadow-xl p-8 border border-border">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          {/* Icon with glow effect */}
          <div className={`
            p-4 rounded-full 
            ${status === "loading" ? "bg-blue-500/10" : ""}
            ${status === "success" ? "bg-green-500/10" : ""}
            ${status === "failed" && isSessionError ? "bg-amber-500/10" : ""}
            ${status === "failed" && !isSessionError ? "bg-red-500/10" : ""}
          `}>
            {status === "loading" && (
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
            )}
            {status === "success" && (
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            )}
            {status === "failed" && isSessionError && (
              <Clock className="h-12 w-12 text-amber-500" />
            )}
            {status === "failed" && !isSessionError && (
              <XCircle className="h-12 w-12 text-red-500" />
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              {status === "loading" && "Verifying Payment"}
              {status === "success" && "Payment Successful"}
              {status === "failed" && isSessionError && "Session Expired"}
              {status === "failed" && !isSessionError && "Payment Issue"}
            </h1>

            {/* Subtitle for context */}
            {status === "failed" && isPaymentSafe && (
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                ✓ Your payment is safe
              </p>
            )}
          </div>

          {/* Message */}
          <p className="text-muted-foreground leading-relaxed">{message}</p>

          {/* Transaction ID if available */}
          {searchParams.get("client_txn_id") && status === "failed" && (
            <div className="w-full p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Transaction Reference</p>
              <p className="font-mono text-sm text-foreground break-all">
                {searchParams.get("client_txn_id")}
              </p>
            </div>
          )}

          {/* Actions */}
          {status !== "loading" && (
            <div className="space-y-3 w-full pt-2">
              <Button
                className="w-full"
                size="lg"
                onClick={() => router.push("/dashboard/viewLinux")}
              >
                View My Orders
              </Button>

              {status === "failed" && isSessionError && (
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => router.push("/login")}
                >
                  Log In Again
                </Button>
              )}

              {status === "failed" && !isSessionError && (
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => router.push("/support/tickets")}
                >
                  Contact Support
                </Button>
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-xl shadow-xl p-8 border border-border">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          <div className="p-4 rounded-full bg-blue-500/10">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Verifying Payment</h1>
            <p className="text-muted-foreground">Please wait while we verify your payment...</p>
          </div>
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
