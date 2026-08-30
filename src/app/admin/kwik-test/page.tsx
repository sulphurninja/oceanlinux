'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, RefreshCw, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';

interface RawLog {
  _id: string;
  source: string;
  paymentId: string;
  orderId: string;
  reportedStatus: string;
  reportedAmount: number | null;
  expectedAmount: number | null;
  amountMatches: boolean | null;
  signatureValid: boolean | null;
  raw: unknown;
  note: string;
  createdAt: string;
}

interface TestPayment {
  testOrderId: string;
  paymentId: string;
  requestedAmount: number;
  payAmount: number;
  paymentPage: string;
  upiLink: string;
  qrImageUrl: string;
  tamperedUpiLink: string;
  tamperedQrImageUrl: string;
}

interface StatusProbe {
  verified: boolean;
  reason: string;
  reportedAmount: number | null;
  raw: unknown;
}

export default function KwikPartialPaymentTestPage() {
  const [amount, setAmount] = useState(10);
  const [payAmount, setPayAmount] = useState(1);
  const [creating, setCreating] = useState(false);
  const [payment, setPayment] = useState<TestPayment | null>(null);
  const [logs, setLogs] = useState<RawLog[]>([]);
  const [statusProbe, setStatusProbe] = useState<StatusProbe | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (paymentId?: string) => {
    setRefreshing(true);
    try {
      const qs = paymentId ? `?paymentId=${encodeURIComponent(paymentId)}` : '';
      const res = await fetch(`/api/admin/kwik-test${qs}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load logs');
      setLogs(data.logs || []);
      setStatusProbe(data.statusProbe || null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!payment) return;
    const timer = setInterval(() => refresh(payment.paymentId), 5000);
    return () => clearInterval(timer);
  }, [payment, refresh]);

  const createTest = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/kwik-test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, payAmount }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to create test payment');
      setPayment(data);
      setStatusProbe(null);
      toast.success(`Test payment for ₹${data.requestedAmount} created`);
      refresh(data.paymentId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create test payment');
    } finally {
      setCreating(false);
    }
  };

  const verdict = (() => {
    if (!payment) return null;
    const reported = [
      statusProbe?.verified ? statusProbe.reportedAmount : null,
      ...logs
        .filter((l) => l.source === 'webhook' && l.paymentId === payment.paymentId)
        .map((l) => l.reportedAmount),
    ].filter((v): v is number => typeof v === 'number');

    if (reported.length === 0) return null;
    const anyBelowRequested = reported.some((v) => v + 0.5 < payment.requestedAmount);
    return anyBelowRequested ? 'reports-real' : 'echoes-order-amount';
  })();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">KwikUPI partial payment test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Creates a real KwikUPI payment plus a tampered QR that pays less than the requested amount — the
          same trick a customer uses. If KwikUPI reports the amount that actually landed, we can block ₹1
          fraud automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Create test payment</CardTitle>
          <CardDescription>No order is created — this payment is not linked to any customer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Order amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min={2}
                max={1000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payAmount">Actually pay (₹)</Label>
              <Input
                id="payAmount"
                type="number"
                min={1}
                max={amount}
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <Button onClick={createTest} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create test QR
            </Button>
          </div>

          {payment && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p>
                  UPI apps don&apos;t let you edit the amount after scanning. The fraud works by rewriting the{' '}
                  <code className="font-mono">am=</code> value in the raw UPI link before opening it — the QR on
                  the right does exactly that for you. <strong>Scan the right QR</strong> to reproduce it.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Honest QR — ₹{payment.requestedAmount}
                  </p>
                  {payment.qrImageUrl ? (
                    <img
                      src={payment.qrImageUrl}
                      alt={`UPI QR for ₹${payment.requestedAmount}`}
                      className="w-44 h-44 rounded-lg border bg-white p-2"
                    />
                  ) : null}
                  <p className="text-xs text-muted-foreground">What a normal customer sees.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-600">
                    Tampered QR — ₹{payment.payAmount} (scan this one)
                  </p>
                  {payment.tamperedQrImageUrl ? (
                    <img
                      src={payment.tamperedQrImageUrl}
                      alt={`Tampered UPI QR for ₹${payment.payAmount}`}
                      className="w-44 h-44 rounded-lg border-2 border-red-500/50 bg-white p-2"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Could not build — the UPI link has no amount parameter.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Same payee and same transaction ref, only the amount lowered.
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-xs font-mono break-all text-muted-foreground">
                <p>Payment ID: {payment.paymentId}</p>
                <p>Ref: {payment.testOrderId}</p>
                <p>Original: {payment.upiLink}</p>
                <p className="text-red-600/80">Tampered: {payment.tamperedUpiLink || '—'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">2 · What KwikUPI reports</CardTitle>
            <CardDescription>Auto-refreshes every 5 seconds after a test payment is created.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh(payment?.paymentId)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {verdict === 'reports-real' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex gap-2 text-sm">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              <p>
                <strong>KwikUPI reports the real amount.</strong> We can reject partial payments automatically —
                ₹1 fraud can be blocked while keeping KwikUPI.
              </p>
            </div>
          )}
          {verdict === 'echoes-order-amount' && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex gap-2 text-sm">
              <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
              <p>
                <strong>KwikUPI echoes back the requested amount.</strong> It cannot tell us what actually
                landed, so delivery has to be held until the amount is verified from Paytm.
              </p>
            </div>
          )}

          {statusProbe && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p className="font-medium">Status API right now</p>
              <p>
                verified: <strong>{String(statusProbe.verified)}</strong>
                {statusProbe.reason ? ` · ${statusProbe.reason}` : ''}
              </p>
              <p>
                reported amount: <strong>{statusProbe.reportedAmount ?? '—'}</strong>
              </p>
            </div>
          )}

          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payloads captured yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log._id} className="rounded-lg border p-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={log.source === 'webhook' ? 'default' : 'secondary'}>{log.source}</Badge>
                    {log.reportedStatus ? <Badge variant="outline">{log.reportedStatus}</Badge> : null}
                    {log.signatureValid === false ? (
                      <Badge variant="destructive">bad signature</Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-xs font-mono break-all text-muted-foreground">
                    {log.paymentId || log.orderId}
                  </p>
                  <p>
                    reported amount: <strong>{log.reportedAmount ?? '—'}</strong>
                    {log.expectedAmount != null ? ` · expected: ${log.expectedAmount}` : ''}
                  </p>
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(log.raw, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
