'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { dashboardFetch } from '@/lib/dashboardFetch';

export type UpiCheckoutFlow = 'wallet' | 'cart' | 'order' | 'renewal';

export interface UpiQrSession {
  amount: number;
  clientTxnId: string;
  qrImageUrl: string;
  flow: UpiCheckoutFlow;
  orderId?: string;
}

interface UpiQrPaymentDialogProps {
  session: UpiQrSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (payload: Record<string, unknown>) => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
}

export function UpiQrPaymentDialog({
  session,
  open,
  onOpenChange,
  onSuccess,
  onCancel,
  title = 'Pay with UPI',
  description = 'Scan the QR code with any UPI app. Payment is verified automatically — no need to leave this page.',
}: UpiQrPaymentDialogProps) {
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!open) setPaid(false);
  }, [open, session?.clientTxnId]);

  useEffect(() => {
    if (!open || !session || paid) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled || !session) return;

      try {
        const statusBody =
          session.flow === 'renewal'
            ? { renewalTxnId: session.clientTxnId }
            : { clientTxnId: session.clientTxnId };

        const res = await dashboardFetch('/api/payment/status', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(statusBody),
        });
        const data = await res.json();

        if (data.paymentStatus === 'SUCCESS') {
          if (session.flow === 'renewal' && session.orderId) {
            const confirmRes = await dashboardFetch('/api/payment/renew-confirm', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                renewalTxnId: session.clientTxnId,
                orderId: session.orderId,
                paymentMethod: 'upi',
              }),
            });
            const confirmData = await confirmRes.json();
            if (confirmRes.ok && confirmData.success) {
              setPaid(true);
              onSuccess(confirmData);
              return;
            }
          } else {
            setPaid(true);
            onSuccess(data);
            return;
          }
        }
      } catch {
        /* keep polling */
      }

      timer = setTimeout(poll, 4000);
    };

    timer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, session, paid, onSuccess]);

  const handleClose = (next: boolean) => {
    if (!next && onCancel) onCancel();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {paid ? (
          <div className="py-6 flex flex-col items-center text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-white" strokeWidth={2.5} />
            </div>
            <p className="text-lg font-semibold">Payment received!</p>
            <p className="text-sm text-muted-foreground animate-pulse">Finishing up…</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>

            {session && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-semibold text-lg">
                    ₹{session.amount.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Ref: {session.clientTxnId}
                  </p>
                </div>

                {session.qrImageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={session.qrImageUrl}
                      alt="UPI QR code"
                      className="w-52 h-52 rounded-lg border bg-white p-2"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Scan with GPay, PhonePe, Paytm, or any UPI app
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    QR could not be loaded. Please try again or choose Razorpay.
                  </p>
                )}

                <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-900 dark:text-sky-100">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  Waiting for payment confirmation…
                </div>

                <Button variant="ghost" className="w-full" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function launchUpiInlineOrRedirect(
  data: { clientTxnId?: string; upi?: { qrImageUrl?: string; payment_url?: string } },
  ctx: {
    amount: number;
    flow: UpiCheckoutFlow;
    orderId?: string;
    onInline: (session: UpiQrSession) => void;
  }
): boolean {
  const qrImageUrl = data.upi?.qrImageUrl;
  if (qrImageUrl && data.clientTxnId) {
    ctx.onInline({
      amount: ctx.amount,
      clientTxnId: data.clientTxnId,
      qrImageUrl,
      flow: ctx.flow,
      orderId: ctx.orderId,
    });
    return true;
  }
  if (data.upi?.payment_url) {
    window.location.href = data.upi.payment_url;
    return true;
  }
  return false;
}
