'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { dashboardFetch } from '@/lib/dashboardFetch';

export type UpiCheckoutFlow = 'wallet' | 'cart' | 'order' | 'renewal';

export interface UpiQrSession {
  amount: number;
  clientTxnId: string;
  qrImageUrl: string;
  flow: UpiCheckoutFlow;
  orderId?: string;
  /** ISO timestamp after which the gateway stops accepting this QR. */
  expiresAt?: string | null;
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
  // The gateway only holds a QR open for a couple of minutes, so the dialog
  // tracks its own copy of the QR and swaps in a fresh one on expiry rather than
  // making the customer restart checkout.
  const [live, setLive] = useState<{ qrImageUrl: string; amount: number; expiresAt?: string | null } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  useEffect(() => {
    if (!open) setPaid(false);
  }, [open, session?.clientTxnId]);

  useEffect(() => {
    setLive(
      session
        ? { qrImageUrl: session.qrImageUrl, amount: session.amount, expiresAt: session.expiresAt }
        : null
    );
    setRefreshError('');
  }, [session?.clientTxnId, session?.qrImageUrl]);

  const expiresAt = live?.expiresAt ?? null;

  const refreshQr = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    setRefreshError('');
    try {
      const res = await dashboardFetch('/api/payment/upi/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          session.flow === 'renewal'
            ? { renewalTxnId: session.clientTxnId }
            : { clientTxnId: session.clientTxnId }
        ),
      });
      const data = await res.json();
      if (res.ok && data.success && data.upi?.qrImageUrl) {
        setLive({
          qrImageUrl: data.upi.qrImageUrl,
          amount: Number(data.upi.amount) || session.amount,
          expiresAt: data.upi.expiresAt ?? null,
        });
      } else if (data.alreadyPaid) {
        // Payment landed between expiry and refresh; the poller will pick it up.
        setRefreshError('');
      } else {
        setRefreshError(data.message || 'Could not refresh the QR code.');
      }
    } catch {
      setRefreshError('Could not refresh the QR code.');
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    if (!open || paid || !expiresAt) {
      setSecondsLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, remaining));
      return remaining;
    };

    if (tick() <= 0) {
      refreshQr();
      return;
    }

    const interval = setInterval(() => {
      if (tick() <= 0) {
        clearInterval(interval);
        refreshQr();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [open, paid, expiresAt, refreshQr]);

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
            if (data.renewalApplied) {
              setPaid(true);
              onSuccess(data);
              return;
            }
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

      timer = setTimeout(poll, 2000);
    };

    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, session, paid, onSuccess]);

  const handleClose = (next: boolean) => {
    if (!next && onCancel) onCancel();
    onOpenChange(next);
  };

  const payableAmount = live?.amount ?? session?.amount ?? 0;

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
                    ₹{payableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pay this exact amount — a different amount will not be accepted.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Ref: {session.clientTxnId}
                  </p>
                </div>

                {refreshing ? (
                  <div className="flex h-52 flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Generating a fresh QR code…</p>
                  </div>
                ) : live?.qrImageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={live.qrImageUrl}
                      alt="UPI QR code"
                      className="w-52 h-52 rounded-lg border bg-white p-2"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      Scan with GPay, PhonePe, Paytm, or any UPI app
                    </p>
                    {secondsLeft !== null && (
                      <p
                        className={`text-xs text-center ${
                          secondsLeft <= 30
                            ? 'font-medium text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {secondsLeft <= 30
                          ? `QR expires in ${secondsLeft}s — pay now or a fresh QR will load automatically`
                          : `QR refreshes in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    QR could not be loaded. Please try again or choose Razorpay.
                  </p>
                )}

                {refreshError && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                    {refreshError}
                  </div>
                )}

                <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-900 dark:text-sky-100">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  Waiting for payment confirmation…
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={refreshing}
                    onClick={refreshQr}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    New QR
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={() => handleClose(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function launchUpiInlineOrRedirect(
  data: {
    clientTxnId?: string;
    upi?: { qrImageUrl?: string; payment_url?: string; amount?: number; expiresAt?: string | null };
  },
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
      // The gateway may have adjusted the paise to keep the amount unique, so
      // its figure wins over the one the page computed.
      amount: Number(data.upi?.amount) || ctx.amount,
      clientTxnId: data.clientTxnId,
      qrImageUrl,
      flow: ctx.flow,
      orderId: ctx.orderId,
      expiresAt: data.upi?.expiresAt ?? null,
    });
    return true;
  }
  if (data.upi?.payment_url) {
    window.location.href = data.upi.payment_url;
    return true;
  }
  return false;
}
