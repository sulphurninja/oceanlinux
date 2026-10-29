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
  gateway?: string;
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
  chargedAmount: number;
  payAmount: number;
  paymentPage: string;
  expiresAt?: string | null;
  upiLink: string;
  qrImageUrl: string;
  tamperedUpiLink: string;
  tamperedQrImageUrl: string;
}

interface StatusProbe {
  verified: boolean;
  reason: string;
  reportedAmount: number | null;
  pending?: boolean;
  expired?: boolean;
  failed?: boolean;
  raw: unknown;
}

function logEvent(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const event = (raw as Record<string, unknown>).event;
  return typeof event === 'string' ? event : '';
}

export default function VyaparPartialPaymentTestPage() {
  const [amount, setAmount] = useState(10);
  const [payAmount, setPayAmount] = useState(1);
  const [creating, setCreating] = useState(false);
  const [payment, setPayment] = useState<TestPayment | null>(null);
  const [logs, setLogs] = useState<RawLog[]>([]);
  const [statusProbe, setStatusProbe] = useState<StatusProbe | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (probe?: { paymentId: string; clientTxnId: string }) => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (probe?.paymentId) params.set('paymentId', probe.paymentId);
      if (probe?.clientTxnId) params.set('clientTxnId', probe.clientTxnId);
      const qs = params.toString() ? `?${params.toString()}` : '';
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
    const timer = setInterval(
      () => refresh({ paymentId: payment.paymentId, clientTxnId: payment.testOrderId }),
      5000
    );
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
      toast.success(`UPI Gateway test created — pay ₹${data.chargedAmount} honestly or ₹${data.payAmount} via tampered QR`);
      refresh({ paymentId: data.paymentId, clientTxnId: data.testOrderId });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create test payment');
    } finally {
      setCreating(false);
    }
  };

  const verdict = (() => {
    if (!payment) return null;

    const relevant = logs.filter(
      (l) => l.paymentId === payment.paymentId || l.orderId === payment.testOrderId
    );

    const webhookSuccess = relevant.some(
      (l) =>
        l.source === 'webhook' &&
        (String(l.reportedStatus).toLowerCase() === 'success' || logEvent(l.raw) === 'payment.success')
    );
    const webhookExpired = relevant.some(
      (l) =>
        l.source === 'webhook' &&
        (String(l.reportedStatus).toLowerCase() === 'expired' || logEvent(l.raw) === 'payment.expired')
    );

    if (statusProbe?.verified || webhookSuccess) {
      return 'honest-paid';
    }
    if (statusProbe?.expired || webhookExpired || statusProbe?.reason?.includes('expired')) {
      return 'fraud-blocked';
    }
    if (statusProbe && !statusProbe.verified && !statusProbe.pending) {
      return 'fraud-blocked';
    }
    return null;
  })();

  const honestAmount = payment?.chargedAmount ?? payment?.requestedAmount ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">UPI Gateway test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Creates a real merchant.upigateway.com QR (same API as reseller recharge). No wallet credit and no
          VPS order. The red QR lowers only the amount, so you can see if an underpayment is marked paid.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Create test payment</CardTitle>
          <CardDescription>
            No customer order is created. Uses the saved UPI Gateway API key.
          </CardDescription>
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
              <Label htmlFor="payAmount">Tampered pay (₹)</Label>
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
                  <strong>Step A — fraud test:</strong> scan the <strong>red tampered QR</strong> and pay only ₹
                  {payment.payAmount}. Order should <strong>not</strong> succeed.
                  <br />
                  <strong>Step B — honest test:</strong> create a new QR and scan the <strong>left QR</strong> for
                  the exact amount shown (₹{honestAmount.toFixed(2)}).
                </p>
              </div>

              {payment.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  QR expires ~2 min after creation ({new Date(payment.expiresAt).toLocaleTimeString('en-IN')}).
                  Create a new test if it expires.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Honest QR — ₹{honestAmount.toFixed(2)}</p>
                  {payment.qrImageUrl ? (
                    <img
                      src={payment.qrImageUrl}
                      alt={`UPI QR for ₹${honestAmount}`}
                      className="w-44 h-44 rounded-lg border bg-white p-2"
                    />
                  ) : null}
                  <p className="text-xs text-muted-foreground">Pay this exact amount for a real success.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-600">
                    Tampered QR — ₹{payment.payAmount} (scan for fraud test)
                  </p>
                  {payment.tamperedQrImageUrl ? (
                    <img
                      src={payment.tamperedQrImageUrl}
                      alt={`Tampered UPI QR for ₹${payment.payAmount}`}
                      className="w-44 h-44 rounded-lg border-2 border-red-500/50 bg-white p-2"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Could not build tampered QR.</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Same payee and transaction ref — only the amount lowered to ₹{payment.payAmount}.
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-xs font-mono break-all text-muted-foreground">
                <p>Order ID: {payment.paymentId}</p>
                <p>Ref: {payment.testOrderId}</p>
                {payment.paymentPage ? (
                  <p>
                    Payment page:{' '}
                    <a href={payment.paymentPage} target="_blank" rel="noreferrer" className="underline">
                      open
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">2 · What UPI Gateway reports</CardTitle>
            <CardDescription>Auto-refreshes every 5 seconds after a test is created.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              payment
                ? refresh({ paymentId: payment.paymentId, clientTxnId: payment.testOrderId })
                : refresh()
            }
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {verdict === 'fraud-blocked' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex gap-2 text-sm">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              <p>
                <strong>Underpayment not accepted.</strong> UPI Gateway did not mark the order as paid.
              </p>
            </div>
          )}
          {verdict === 'honest-paid' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex gap-2 text-sm">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              <p>
                <strong>Honest payment confirmed.</strong> Full amount verified — production checkout would
                proceed normally.
              </p>
            </div>
          )}
          {verdict === null && payment && statusProbe?.pending && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 flex gap-2 text-sm">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-600" />
              <p>Waiting for payment or expiry…</p>
            </div>
          )}

          {statusProbe && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p className="font-medium">Status API</p>
              <p>
                verified: <strong>{String(statusProbe.verified)}</strong>
                {statusProbe.reason ? ` · ${statusProbe.reason}` : ''}
              </p>
              <p>
                reported amount: <strong>{statusProbe.reportedAmount ?? '—'}</strong>
              </p>
              {statusProbe.expired ? <Badge variant="outline">expired</Badge> : null}
              {statusProbe.pending ? <Badge variant="secondary">pending</Badge> : null}
            </div>
          )}

          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payloads captured yet — pay via one of the QRs above.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log._id} className="rounded-lg border p-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={log.source === 'webhook' ? 'default' : 'secondary'}>{log.source}</Badge>
                    {log.gateway ? <Badge variant="outline">{log.gateway}</Badge> : null}
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
                  {log.note ? <p className="text-xs text-muted-foreground">{log.note}</p> : null}
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-48">
                    {JSON.stringify(log.raw, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {!payment && (
            <div className="rounded-lg border border-muted p-3 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4 inline mr-2" />
              Expected results: tampered ₹1 → <strong>expired / not verified</strong>. Honest full amount →{' '}
              <strong>success + UTR</strong>.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
