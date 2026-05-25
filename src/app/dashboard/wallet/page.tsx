'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Wallet as WalletIcon,
  CreditCard,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Plus,
  Loader2,
  IndianRupee,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { broadcastWallet } from '@/lib/walletClient';

interface WalletTxn {
  _id?: string;
  type: 'credit' | 'debit' | 'refund' | 'bonus';
  amount: number;
  description: string;
  reference?: string;
  balanceBefore: number;
  balanceAfter: number;
  metadata?: any;
  createdAt: string;
}

interface RechargeRow {
  _id: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  paymentMethod: string;
  clientTxnId: string;
  createdAt: string;
  creditedAt?: string;
}

interface WalletData {
  balance: number;
  currency: string;
  totalCredits: number;
  totalDebits: number;
  isActive: boolean;
  transactions: WalletTxn[];
  recharges: RechargeRow[];
}

declare global {
  interface Window {
    Razorpay: any;
    Cashfree: any;
  }
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('500');
  const [gateway, setGateway] = useState<'razorpay' | 'cashfree' | 'upi'>('razorpay');
  const [submitting, setSubmitting] = useState(false);

  const formatINR = useMemo(() => new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format, []);

  const fetchWallet = async () => {
    try {
      const res = await fetch('/api/wallet', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load wallet');
      }
      setWallet(data.wallet);
      // Push the new balance into the topbar pill in case it's mounted.
      broadcastWallet({
        balance: Number(data.wallet.balance) || 0,
        currency: data.wallet.currency || 'INR',
        totalCredits: Number(data.wallet.totalCredits) || 0,
        totalDebits: Number(data.wallet.totalDebits) || 0,
        isActive: data.wallet.isActive !== false,
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to load wallet');
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchWallet();
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await fetchWallet();
    setRefreshing(false);
  };

  const handleRecharge = async () => {
    const amount = Number(rechargeAmount);
    if (!Number.isFinite(amount) || amount < 50) {
      toast.error('Minimum recharge is ₹50');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/wallet/recharge/initiate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, gateway }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to initiate recharge');
      }

      const actualMethod: string = data.actualPaymentMethod || gateway;
      if (data.fallbackUsed) {
        toast.info(`${gateway} unavailable — using ${actualMethod}`);
      }

      if (actualMethod === 'razorpay') {
        await openRazorpay(data);
      } else if (actualMethod === 'cashfree') {
        await openCashfree(data);
      } else if (actualMethod === 'upi') {
        if (data.upi?.payment_url) {
          window.location.href = data.upi.payment_url;
        } else {
          throw new Error('UPI payment URL missing');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Recharge failed');
      setSubmitting(false);
    }
  };

  const openRazorpay = async (data: any) => {
    let attempts = 0;
    while (typeof window.Razorpay === 'undefined' && attempts < 20) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    if (typeof window.Razorpay === 'undefined') throw new Error('Razorpay SDK not loaded');

    const options = {
      key: data.razorpay.key,
      amount: data.razorpay.amount,
      currency: data.razorpay.currency,
      name: 'OceanLinux',
      description: `Wallet recharge ₹${rechargeAmount}`,
      order_id: data.razorpay.order_id,
      prefill: { name: data.customer.name, email: data.customer.email },
      theme: { color: '#3b82f6' },
      handler: async (response: any) => {
        try {
          const confirmRes = await fetch('/api/wallet/recharge/confirm', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientTxnId: data.clientTxnId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const cd = await confirmRes.json();
          if (confirmRes.ok && cd.success) {
            toast.success(`Wallet recharged with ₹${data.razorpay.amount / 100}`);
            setRechargeOpen(false);
            await fetchWallet();
          } else {
            throw new Error(cd.message || 'Recharge confirmation failed');
          }
        } catch (e: any) {
          toast.error(e.message || 'Recharge confirmation failed');
        } finally {
          setSubmitting(false);
        }
      },
      modal: {
        ondismiss: () => setSubmitting(false),
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const openCashfree = async (data: any) => {
    if (!data.cashfree?.payment_session_id) throw new Error('Cashfree session missing');
    if (typeof window.Cashfree === 'undefined') throw new Error('Cashfree SDK not loaded');
    const cashfree = await window.Cashfree({
      mode: process.env.NEXT_PUBLIC_CASHFREE_ENVIRONMENT || 'production',
    });
    const result = await cashfree.checkout({
      paymentSessionId: data.cashfree.payment_session_id,
      returnUrl: `${window.location.origin}/payment/callback?type=wallet&client_txn_id=${data.clientTxnId}`,
    });
    if (result?.error) {
      setSubmitting(false);
      throw new Error(result.error.message || 'Cashfree checkout failed');
    }
    if (result?.paymentDetails) {
      // Fall back: poll confirm endpoint (Cashfree confirm-by-clientTxnId)
      try {
        const confirmRes = await fetch('/api/wallet/recharge/confirm', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientTxnId: data.clientTxnId }),
        });
        const cd = await confirmRes.json();
        if (cd.success) {
          toast.success(`Wallet recharged with ₹${data.cashfree.amount}`);
          setRechargeOpen(false);
          await fetchWallet();
        } else {
          // Webhook will catch up — let user know
          toast.info('Payment received — wallet will reflect shortly');
          setRechargeOpen(false);
        }
      } catch {
        toast.info('Payment received — wallet will reflect shortly');
        setRechargeOpen(false);
      }
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Wallet unavailable</p>
            <Button variant="outline" className="mt-4" onClick={fetchWallet}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 mt-16 lg:mt-0 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Wallet</h1>
          <p className="text-sm text-muted-foreground">Recharge once, checkout faster on every order.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setRechargeOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Money
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <WalletIcon className="h-4 w-4" /> Available Balance
            </CardDescription>
            <CardTitle className="text-4xl font-bold flex items-center gap-1">
              <IndianRupee className="h-7 w-7" />
              {wallet.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> {wallet.currency}</Badge>
              <span>Use this balance at checkout to skip the gateway.</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-500" /> Total Credits
              </CardDescription>
              <CardTitle className="text-xl">{formatINR(wallet.totalCredits || 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs">
                <TrendingDown className="h-3 w-3 text-red-500" /> Total Debits
              </CardDescription>
              <CardTitle className="text-xl">{formatINR(wallet.totalDebits || 0)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Recent Transactions
          </CardTitle>
          <CardDescription>Last 50 wallet movements (most recent first).</CardDescription>
        </CardHeader>
        <CardContent>
          {wallet.transactions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No transactions yet. Add money to start using your wallet.
            </div>
          ) : (
            <div className="space-y-2">
              {wallet.transactions.map((t, idx) => (
                <div
                  key={t._id || idx}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-border hover:border-primary/30 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0',
                      (t.type === 'credit' || t.type === 'refund' || t.type === 'bonus')
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-red-500/10 text-red-600'
                    )}>
                      {(t.type === 'credit' || t.type === 'refund' || t.type === 'bonus')
                        ? <TrendingUp className="h-4 w-4" />
                        : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString('en-IN')}
                        {t.reference && <> &middot; ref: <span className="font-mono">{t.reference.slice(-10)}</span></>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'text-sm font-semibold',
                      (t.type === 'credit' || t.type === 'refund' || t.type === 'bonus')
                        ? 'text-green-600'
                        : 'text-red-600'
                    )}>
                      {(t.type === 'credit' || t.type === 'refund' || t.type === 'bonus') ? '+' : '−'}
                      {formatINR(t.amount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Bal: {formatINR(t.balanceAfter)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {wallet.recharges?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recharge History</CardTitle>
            <CardDescription>Your most recent top-up attempts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {wallet.recharges.map((r) => (
                <div key={r._id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-border">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{formatINR(r.amount)} via {r.paymentMethod}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{r.clientTxnId}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={
                      r.status === 'confirmed' ? 'default' :
                      r.status === 'failed' ? 'destructive' :
                      'secondary'
                    } className="capitalize">
                      {r.status}
                    </Badge>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(r.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={rechargeOpen} onOpenChange={(o) => { if (!submitting) setRechargeOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Add Money to Wallet
            </DialogTitle>
            <DialogDescription>
              Funds are added instantly after payment. No fees, no expiry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Amount (₹)</label>
              <Input
                type="number"
                inputMode="decimal"
                min={50}
                max={100000}
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                disabled={submitting}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRechargeAmount(String(amt))}
                    className={cn(
                      'px-3 py-1 rounded-md text-xs border transition',
                      rechargeAmount === String(amt)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/40 text-muted-foreground'
                    )}
                    disabled={submitting}
                  >
                    ₹{amt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Minimum ₹50, maximum ₹1,00,000 per recharge.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(['razorpay', 'cashfree', 'upi'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGateway(g)}
                    className={cn(
                      'p-2 rounded-md border text-xs font-medium uppercase transition',
                      gateway === g
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/40 text-muted-foreground'
                    )}
                    disabled={submitting}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> If your selected gateway is unavailable we&apos;ll auto-switch.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRechargeOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleRecharge} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing</> : `Recharge ₹${rechargeAmount || '0'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
