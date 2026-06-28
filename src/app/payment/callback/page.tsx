"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchWalletSummary } from "@/lib/walletClient";
import { triggerPaymentSuccessBird } from "@/lib/oceanBirdFly";
import { redirectToLogin } from "@/lib/redirectToLogin";

// Create a client component that uses useSearchParams
function PaymentCallbackContent() {
  const [status, setStatus] = useState<"loading" | "success" | "failed" | "processing">("loading");
  const [message, setMessage] = useState("Processing your payment...");
  const router = useRouter();
  const searchParams = useSearchParams();
  const retried = useRef(false);

  useEffect(() => {
    if (status !== "success") return;
    triggerPaymentSuccessBird(
      searchParams.get("client_txn_id"),
      searchParams.get("type"),
    );
  }, [status, searchParams]);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Get transaction ID from URL params
        const clientTxnId = searchParams.get("client_txn_id");
        const orderId = searchParams.get("order_id");
        const paymentId = searchParams.get("payment_id");
        const statusParam = searchParams.get("status");
        const callbackType = searchParams.get("type"); // 'wallet' | 'cart' | undefined (order)

        console.log(`Payment callback received with transaction ID: ${clientTxnId}`);
        console.log(`Order ID: ${orderId}`);
        console.log(`Payment ID: ${paymentId}`);
        console.log(`Status param: ${statusParam}`);
        console.log(`Callback type: ${callbackType || 'order'}`);

        // Convert searchParams to a regular object
        const paramsObject: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          paramsObject[key] = value;
        });
        console.log(`URL parameters:`, paramsObject);

        // Handle specific failure statuses — still try gateway recovery first
        if (statusParam === "processing_failed" || statusParam === "confirmation_failed") {
          if (clientTxnId) {
            setStatus("processing");
            setMessage("Payment received — confirming your order, please wait…");
            const pollRes = await fetch("/api/payment/status", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientTxnId, returnedFromPayment: true }),
            });
            const pollData = pollRes.ok ? await pollRes.json() : null;
            if (pollData?.paymentStatus === "SUCCESS" || pollData?.order?.status === "confirmed") {
              setStatus("success");
              setMessage("Payment successful! Your server is being provisioned and will be ready shortly.");
              toast.success("Payment confirmed!");
              setTimeout(() => router.push("/dashboard/viewLinux"), 3000);
              return;
            }
          }
          setStatus("processing");
          setMessage("Payment was successful but order processing is still catching up. Check My Orders in a few minutes — your payment is safe. Contact support with your transaction ID if needed.");
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

        // ===== HANDLE WALLET RECHARGE CALLBACK =====
        if (callbackType === 'wallet' || clientTxnId.startsWith('WALLET_')) {
          console.log(`[WALLET-CALLBACK] Confirming wallet recharge: ${clientTxnId}`);
          try {
            const confirmRes = await fetch('/api/wallet/recharge/confirm', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientTxnId }),
            });
            const cd = await confirmRes.json();
            if (confirmRes.ok && cd.success) {
              setStatus('success');
              setMessage(cd.alreadyProcessed
                ? 'Wallet recharge already confirmed.'
                : `Wallet recharged successfully! New balance: ₹${cd.newBalance}`);
              toast.success('Wallet recharged');
              fetchWalletSummary().catch(() => { });
              setTimeout(() => router.push('/dashboard/wallet'), 2500);
              return;
            }

            setStatus('processing');
            setMessage('Payment received — adding money to your wallet, please wait…');
            const pollRes = await fetch('/api/payment/status', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientTxnId, returnedFromPayment: true }),
            });
            const pollData = pollRes.ok ? await pollRes.json() : null;
            if (pollData?.paymentStatus === 'SUCCESS') {
              setStatus('success');
              setMessage(`Wallet recharged successfully! New balance: ₹${pollData.newBalance}`);
              toast.success('Wallet recharged');
              fetchWalletSummary().catch(() => { });
              setTimeout(() => router.push('/dashboard/wallet'), 2500);
              return;
            }

            setStatus('failed');
            setMessage(cd.message || pollData?.message || 'Recharge could not be verified yet. It will reflect once the gateway confirms.');
          } catch (e: any) {
            setStatus('failed');
            setMessage('Could not verify recharge yet. Please check your wallet page.');
          }
          return;
        }

        // ===== HANDLE CART CHECKOUT CALLBACK =====
        if (callbackType === 'cart' || clientTxnId.startsWith('CART_')) {
          console.log(`[CART-CALLBACK] Confirming cart checkout: ${clientTxnId}`);
          if (statusParam === 'wallet_paid') {
            setStatus('success');
            setMessage('Cart paid using wallet balance! Your servers are being provisioned.');
            toast.success('Cart checkout complete');
            // Wallet was just debited — refresh the topbar pill.
            fetchWalletSummary().catch(() => { });
            setTimeout(() => router.push('/dashboard/viewLinux'), 2500);
            return;
          }
          try {
            const confirmRes = await fetch('/api/cart/checkout/confirm', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientTxnId }),
            });
            const cd = await confirmRes.json();
            if (confirmRes.ok && cd.success) {
              setStatus('success');
              setMessage(cd.alreadyProcessed
                ? 'Checkout already confirmed. Your orders are being provisioned.'
                : `Checkout confirmed for ${cd.orderIds?.length || ''} order(s). Provisioning servers now…`);
              toast.success('Cart checkout confirmed');
              fetchWalletSummary().catch(() => { });
              setTimeout(() => router.push('/dashboard/viewLinux'), 3000);
              return;
            }

            // Confirm failed — poll gateway recovery (webhook may still land).
            setStatus('processing');
            setMessage('Payment received — confirming your orders, please wait…');
            const pollRes = await fetch('/api/payment/status', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientTxnId, returnedFromPayment: true }),
            });
            const pollData = pollRes.ok ? await pollRes.json() : null;
            if (pollData?.paymentStatus === 'SUCCESS') {
              setStatus('success');
              setMessage(`Checkout confirmed for ${pollData.orderIds?.length || ''} order(s). Provisioning servers now…`);
              toast.success('Cart checkout confirmed');
              fetchWalletSummary().catch(() => { });
              setTimeout(() => router.push('/dashboard/viewLinux'), 3000);
              return;
            }

            setStatus('failed');
            setMessage(cd.message || pollData?.message || 'Checkout verification pending. Your orders will appear shortly.');
          } catch (e: any) {
            setStatus('failed');
            setMessage('Could not verify checkout yet. Check your orders page in a minute.');
          }
          return;
        }

        // Detect if this is a renewal transaction
        const isRenewal = clientTxnId.startsWith("RENEWAL_");
        console.log(`Transaction type: ${isRenewal ? 'RENEWAL' : 'NEW ORDER'}`);

        if (statusParam === 'wallet_paid' && !isRenewal && callbackType !== 'cart') {
          setStatus('success');
          setMessage('Order paid using wallet balance! Your server is being provisioned.');
          toast.success('Payment confirmed');
          fetchWalletSummary().catch(() => { });
          setTimeout(() => router.push('/dashboard/viewLinux'), 2500);
          return;
        }

        // HANDLE RENEWAL TRANSACTIONS
        if (isRenewal) {
          console.log(`[RENEWAL-CALLBACK] Processing renewal transaction: ${clientTxnId}`);

          // First, verify payment status
          const statusResponse = await fetch("/api/payment/status", {
            method: "POST",
            credentials: "include",
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

            // Detect payment method from status response (supports cashfree, razorpay, upi)
            const detectedPaymentMethod = statusData.paymentMethod || 'cashfree';
            console.log(`[RENEWAL-CALLBACK] Detected payment method: ${detectedPaymentMethod}`);

            // Confirm the renewal
            const confirmResponse = await fetch("/api/payment/renew-confirm", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                renewalTxnId: clientTxnId,
                orderId: orderId,
                paymentMethod: detectedPaymentMethod // Use detected method for proper verification
              })
            });

            const confirmData = await confirmResponse.json();
            console.log(`[RENEWAL-CALLBACK] Renewal confirmation response:`, confirmData);

            if (confirmResponse.ok && confirmData.success) {
              console.log(`[RENEWAL-CALLBACK] ✅ Renewal successful!`);
              setStatus("success");

              // Handle different processing scenarios
              if (confirmData.processing) {
                setMessage("Payment successful! Your renewal is being processed and will be confirmed shortly.");
              } else if (confirmData.companyApproval?.status === 'pending') {
                setMessage("Payment received! Your provider will approve the renewal from their dashboard. You'll see the new expiry here once approved.");
                toast.success("Payment received — awaiting provider approval");
              } else if (confirmData.alreadyProcessed) {
                setMessage("Renewal successful! Your service has been extended for 30 days.");
              } else {
                setMessage("Renewal successful! Your service has been extended for 30 days.");
              }

              if (confirmData.companyApproval?.status !== 'pending') {
                toast.success("Service renewed successfully!");
              }

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
            try {
              const cancelRes = await fetch('/api/payment/cancel', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientTxnId, userInitiated: true }),
              });
              const cancelData = await cancelRes.json();
              if (cancelData.success && cancelData.refunded > 0) {
                fetchWalletSummary().catch(() => { });
                setStatus('failed');
                setMessage(`Renewal payment was not completed. ₹${cancelData.refunded.toLocaleString('en-IN')} has been returned to your wallet.`);
                return;
              }
            } catch (cancelErr) {
              console.error('[RENEWAL-CALLBACK] Cancel/refund failed:', cancelErr);
            }
            setStatus("failed");
            setMessage("Renewal payment verification failed. Please check your orders or contact support.");
          }

          return;
        }

        // HANDLE NEW ORDER TRANSACTIONS
        console.log(`Calling payment status API with transaction ID: ${clientTxnId}`);

        const pollOrderPayment = async (attempt = 0): Promise<void> => {
          const maxAttempts = 8;
          const response = await fetch("/api/payment/status", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientTxnId,
              razorpayPaymentId: paymentId,
              returnedFromPayment: true,
              allParams: paramsObject,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`API returned error ${response.status}: ${errorText}`);
            if (attempt < maxAttempts - 1) {
              setStatus("processing");
              setMessage("Payment received — confirming your order, please wait…");
              await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
              return pollOrderPayment(attempt + 1);
            }
            throw new Error(`API error: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          console.log(`Payment status API response (attempt ${attempt + 1}):`, data);

          const isConfirmed =
            data.paymentStatus === "SUCCESS" ||
            data.order?.status === "confirmed";

          if (isConfirmed) {
            setStatus("success");
            setMessage("Payment successful! Your server is being provisioned and will be ready shortly.");
            toast.success("Payment confirmed! Check your orders for server details.");
            setTimeout(() => router.push("/dashboard/viewLinux"), 3000);
            return;
          }

          const stillPending =
            !data.paymentStatus ||
            data.paymentStatus === "PENDING" ||
            data.paymentStatus === "CREATED" ||
            data.paymentStatus === "ATTEMPTED";

          if (stillPending && attempt < maxAttempts - 1) {
            setStatus("processing");
            setMessage("Payment received — confirming your order, please wait…");
            await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
            return pollOrderPayment(attempt + 1);
          }

          if (data.paymentStatus === "FAILED" || data.paymentStatus === "FAILURE") {
            try {
              const cancelRes = await fetch('/api/payment/cancel', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientTxnId, userInitiated: true }),
              });
              const cancelData = await cancelRes.json();
              if (cancelData.success && cancelData.refunded > 0) {
                fetchWalletSummary().catch(() => { });
                setStatus('failed');
                setMessage(`Payment was not completed. ₹${cancelData.refunded.toLocaleString('en-IN')} has been returned to your wallet.`);
                return;
              }
            } catch (cancelErr) {
              console.error('[CALLBACK] Cancel/refund failed:', cancelErr);
            }
            setStatus("failed");
            setMessage(data.message || "Payment was not completed. You can try again from IP Stock.");
            return;
          }

          setStatus("processing");
          setMessage(
            "Your payment may have gone through. We're still confirming with the bank — check My Orders in a few minutes. If the order doesn't appear, contact support with your transaction ID."
          );
        };

        await pollOrderPayment();
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
  const isPaymentSafe = message.toLowerCase().includes('payment is safe') || message.toLowerCase().includes('automatically processed') || message.toLowerCase().includes('may have gone through');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-xl shadow-xl p-8 border border-border">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          {/* Icon with glow effect */}
          <div className={`
            p-4 rounded-full 
            ${status === "loading" ? "bg-blue-500/10" : ""}
            ${status === "processing" ? "bg-amber-500/10" : ""}
            ${status === "success" ? "bg-green-500/10" : ""}
            ${status === "failed" && isSessionError ? "bg-amber-500/10" : ""}
            ${status === "failed" && !isSessionError ? "bg-red-500/10" : ""}
          `}>
            {status === "loading" && (
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
            )}
            {status === "processing" && (
              <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
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
              {status === "processing" && "Confirming Order"}
              {status === "success" && "Payment Successful"}
              {status === "failed" && isSessionError && "Session Expired"}
              {status === "failed" && !isSessionError && "Payment Issue"}
            </h1>

            {/* Subtitle for context */}
            {status === "failed" && isPaymentSafe && (
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                ✓ Your payment is likely safe
              </p>
            )}
            {status === "processing" && (
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                Do not pay again for the same order
              </p>
            )}
          </div>

          {/* Message */}
          <p className="text-muted-foreground leading-relaxed">{message}</p>

          {/* Transaction ID if available */}
          {searchParams.get("client_txn_id") && (status === "failed" || status === "processing") && (
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

              {status === "processing" && (
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => router.push("/support/tickets")}
                >
                  Contact Support
                </Button>
              )}

              {status === "failed" && isSessionError && (
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => redirectToLogin('/dashboard/viewLinux')}
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
