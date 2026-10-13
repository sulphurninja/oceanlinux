"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchWalletSummary } from "@/lib/walletClient";
import { triggerPaymentSuccessBird } from "@/lib/oceanBirdFly";
import { redirectToLogin } from "@/lib/redirectToLogin";
import { clearDashboardCache, DASHBOARD_CACHE_KEYS } from "@/lib/dashboardCache";

async function waitForOrderDelivery(orderId: string, maxAttempts = 12, delayMs = 2000): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.ok) {
        const order = await res.json();
        const ip = String(order.ipAddress || "").trim();
        const st = String(order.status || "").toLowerCase();
        if (ip && (st === "active" || order.password)) return;
        if (ip && st === "confirmed") return;
      }
    } catch {
      // keep polling
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function goToOrderAfterPayment(
  router: ReturnType<typeof useRouter>,
  orderId?: string | null
) {
  if (orderId) {
    await waitForOrderDelivery(orderId);
    router.push(`/dashboard/order/${orderId}`);
    return;
  }
  router.push("/dashboard/viewLinux");
}

// Create a client component that uses useSearchParams
function PaymentCallbackContent() {
  const [status, setStatus] = useState<"loading" | "success" | "failed" | "processing">("loading");
  const [message, setMessage] = useState("Processing your payment...");
  const [rechargeInfo, setRechargeInfo] = useState<{ amount: number; newBalance: number } | null>(null);
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

  // A purchase just changed orders, wallet and stock — drop the cached copies so
  // the dashboard refetches instead of showing pre-purchase data.
  useEffect(() => {
    clearDashboardCache(DASHBOARD_CACHE_KEYS.ordersMe);
    clearDashboardCache(DASHBOARD_CACHE_KEYS.wallet);
    clearDashboardCache(DASHBOARD_CACHE_KEYS.ipStock);
    clearDashboardCache(DASHBOARD_CACHE_KEYS.slotIps);
    clearDashboardCache(DASHBOARD_CACHE_KEYS.resellerInfo);
  }, []);

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

        // ===== HANDLE RESELLER WALLET RECHARGE CALLBACK =====
        if (callbackType === 'reseller-wallet' || clientTxnId.startsWith('RRC_') || clientTxnId.startsWith('RRA_')) {
          try {
            const confirmRes = await fetch('/api/reseller/wallet/recharge/confirm', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientTxnId }),
            });
            const cd = await confirmRes.json();
            if (confirmRes.ok && cd.success) {
              setStatus('success');
              setRechargeInfo({ amount: cd.amount ?? 0, newBalance: cd.newBalance ?? 0 });
              setMessage(cd.alreadyProcessed
                ? 'This recharge has already been credited to your wallet.'
                : 'Payment received. Funds have been added to your wallet.');
              toast.success('Wallet recharged');
              setTimeout(() => router.push('/dashboard/reseller-wallet'), 3500);
              return;
            }
            setStatus('processing');
            setMessage('Payment received — crediting reseller wallet, please wait…');
          } catch {
            setStatus('failed');
            setMessage('Could not verify recharge yet. Check your reseller wallet page.');
          }
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
              setTimeout(() => router.push(cd.reroutedToResellerWallet ? '/dashboard/reseller-wallet' : '/dashboard/wallet'), 2500);
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
              setTimeout(() => router.push(cd.reroutedToResellerWallet ? '/dashboard/reseller-wallet' : '/dashboard/wallet'), 2500);
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
          void goToOrderAfterPayment(router, orderId || searchParams.get('order_id'));
          return;
        }

        // HANDLE RENEWAL TRANSACTIONS — poll until KwikUPI confirms (same as buy-now)
        if (isRenewal) {
          console.log(`[RENEWAL-CALLBACK] Processing renewal transaction: ${clientTxnId}`);

          const pollRenewalPayment = async (attempt = 0): Promise<void> => {
            const maxAttempts = 8;
            const statusResponse = await fetch("/api/payment/status", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                renewalTxnId: clientTxnId,
                orderId: orderId || searchParams.get("order_id"),
                returnedFromPayment: true,
              }),
            });

            if (!statusResponse.ok) {
              if (attempt < maxAttempts - 1) {
                setStatus("processing");
                setMessage("Payment received — confirming your renewal, please wait…");
                await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
                return pollRenewalPayment(attempt + 1);
              }
              throw new Error("Failed to verify renewal payment status");
            }

            const statusData = await statusResponse.json();
            console.log(`[RENEWAL-CALLBACK] Payment status (attempt ${attempt + 1}):`, statusData);

            if (statusData.paymentStatus === "SUCCESS") {
              if (statusData.alreadyProcessed) {
                setStatus("success");
                setMessage("Renewal successful! Your service has been extended.");
                toast.success("Service renewed successfully!");
                const targetOrderId = orderId || statusData.orderId;
                setTimeout(() => router.push(`/dashboard/order/${targetOrderId}`), 2500);
                return;
              }

              const detectedPaymentMethod = statusData.paymentMethod || "upi";
              const confirmResponse = await fetch("/api/payment/renew-confirm", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  renewalTxnId: clientTxnId,
                  orderId: orderId,
                  paymentMethod: detectedPaymentMethod,
                }),
              });

              const confirmData = await confirmResponse.json();
              if (confirmResponse.ok && confirmData.success) {
                setStatus("success");
                if (confirmData.processing) {
                  setMessage("Payment successful! Your renewal is being processed and will be confirmed shortly.");
                } else if (confirmData.companyApproval?.status === "pending") {
                  setMessage("Payment received! Your provider will approve the renewal from their dashboard.");
                  toast.success("Payment received — awaiting provider approval");
                } else {
                  setMessage("Renewal successful! Your service has been extended.");
                  toast.success("Service renewed successfully!");
                }
                setTimeout(() => router.push(`/dashboard/order/${orderId}`), 3000);
                return;
              }
              setStatus("failed");
              setMessage(confirmData.message || "Payment received but renewal processing failed. Contact support.");
              return;
            }

            const stillPending =
              !statusData.paymentStatus ||
              statusData.paymentStatus === "PENDING" ||
              statusData.paymentStatus === "CREATED";

            if (stillPending && attempt < maxAttempts - 1) {
              setStatus("processing");
              setMessage("Payment received — confirming your renewal, please wait…");
              await new Promise((r) => setTimeout(r, 2000 + attempt * 1000));
              return pollRenewalPayment(attempt + 1);
            }

            if (stillPending) {
              setStatus("processing");
              setMessage(
                "Your payment may have gone through. We're still confirming — check your order page in a few minutes or contact support with your transaction ID."
              );
              return;
            }

            try {
              const cancelRes = await fetch("/api/payment/cancel", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientTxnId, userInitiated: true }),
              });
              const cancelData = await cancelRes.json();
              if (cancelData.success && cancelData.refunded > 0) {
                fetchWalletSummary().catch(() => {});
                setStatus("failed");
                setMessage(
                  `Renewal payment was not completed. ₹${cancelData.refunded.toLocaleString("en-IN")} has been returned to your wallet.`
                );
                return;
              }
            } catch {
              // ignore
            }
            setStatus("failed");
            setMessage("Renewal payment verification failed. Please check your order or contact support.");
          };

          await pollRenewalPayment();
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
            setMessage("Payment successful! Setting up your server…");
            toast.success("Payment confirmed! Your server details will appear shortly.");
            void goToOrderAfterPayment(router, data.order?.id || orderId);
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

          // Any resolved, non-successful, non-pending status means the payment
          // was not completed (failed / cancelled / dropped / amount mismatch).
          // Release the order so any wallet money reserved for it is refunded.
          const isTerminalFailure =
            !stillPending &&
            !isConfirmed &&
            !!data.paymentStatus &&
            !["PENDING", "CREATED", "ATTEMPTED"].includes(data.paymentStatus);

          if (isTerminalFailure) {
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

  // Reseller wallet recharge — dedicated celebration UI
  if (status === "success" && rechargeInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-3xl shadow-2xl p-8 border border-emerald-500/20 relative overflow-hidden">
          <div className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative flex flex-col items-center text-center space-y-6">
            <div className="relative flex items-center justify-center">
              <span className="absolute h-28 w-28 rounded-full bg-emerald-500/15 animate-ping" />
              <span className="absolute h-20 w-20 rounded-full bg-emerald-500/20 animate-pulse" />
              <div className="relative h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                <CheckCircle2 className="h-11 w-11 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div className="space-y-1">
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                Wallet Recharged!
              </h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>

            <div className="w-full rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-5 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">
                  Amount added
                </p>
                <p className="text-4xl font-extrabold text-emerald-600 dark:text-emerald-300 mt-1">
                  + ₹{rechargeInfo.amount.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="h-px bg-emerald-500/20" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">New wallet balance</span>
                <span className="text-lg font-bold text-foreground">
                  ₹{rechargeInfo.newBalance.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => router.push('/dashboard/reseller-wallet')}
            >
              Open Reseller Wallet
            </Button>
            <p className="text-xs text-muted-foreground">
              Redirecting to wallet dashboard…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
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
    <div className="min-h-screen flex items-center justify-center p-4">
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
