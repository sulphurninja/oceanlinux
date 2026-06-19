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
      <div className="premium-dashboard-page">
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="premium-dashboard-page">
        <div className="premium-dashboard-page-inner">
          <Card className="premium-dashboard-card border-0">
            <CardContent className="py-8 text-center">
              <p className="text-white/45">Wallet unavailable</p>
              <Button variant="outline" className="mt-4 premium-btn-outline" onClick={fetchWallet}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="premium-dashboard-page">
      <div className="premium-dashboard-page-inner space-y-6">
      <div className="premium-dashboard-page-header">
        <div className="flex gap-2 ml-auto w-full sm:w-auto justify-end">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="premium-btn-outline">
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setRechargeOpen(true)} className="premium-btn-primary border-0">
            <Plus className="h-4 w-4 mr-2" /> Add Money
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 premium-dashboard-card border-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-white/45">
              <WalletIcon className="h-4 w-4 text-emerald-300" /> Available Balance
            </CardDescription>
            <CardTitle className="premium-wallet-balance-title text-4xl font-bold flex items-center gap-1 text-white">
              <IndianRupee className="h-7 w-7 text-emerald-300" />
              {wallet.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 text-xs text-white/45">
              <Badge variant="outline" className="gap-1 border-emerald-400/35 text-emerald-200 bg-emerald-500/15"><ShieldCheck className="h-3 w-3" /> {wallet.currency}</Badge>
              <span>Use this balance at checkout to skip the gateway.</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="premium-dashboard-card border-0">
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs text-white/45">
                <TrendingUp className="h-3 w-3 text-emerald-400" /> Total Credits
              </CardDescription>
              <CardTitle className="text-xl text-white">{formatINR(wallet.totalCredits || 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="premium-dashboard-card border-0">
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1 text-xs text-white/45">
                <TrendingDown className="h-3 w-3 text-red-400" /> Total Debits
              </CardDescription>
              <CardTitle className="text-xl text-white">{formatINR(wallet.totalDebits || 0)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Card className="premium-dashboard-card border-0">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-white">
            <CreditCard className="h-4 w-4 text-emerald-300" /> Recent Transactions
          </CardTitle>
          <CardDescription className="text-white/45">Last 50 wallet movements (most recent first).</CardDescription>
        </CardHeader>
        <CardContent>
          {wallet.transactions.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/45">
              No transactions yet. Add money to start using your wallet.
            </div>
          ) : (
            <div className="space-y-2">
              {wallet.transactions.map((t, idx) => (
                <div
                  key={t._id || idx}
                  className="premium-wallet-txn-row flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-white/10 hover:border-emerald-400/25 transition bg-white/[0.02]"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0',
                      (t.type === 'credit' || t.type === 'refund' || t.type === 'bonus')
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-red-500/15 text-red-300'
                    )}>
                      {(t.type === 'credit' || t.type === 'refund' || t.type === 'bonus')
                        ? <TrendingUp className="h-4 w-4" />
                        : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-white">{t.description}</p>
                      <p className="text-[11px] text-white/40">
                        {new Date(t.createdAt).toLocaleString('en-IN')}
                        {t.reference && <> &middot; ref: <span className="font-mono">{t.reference.slice(-10)}</span></>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right premium-wallet-txn-amount">
                    <p className={cn(
                      'text-sm font-semibold',
                      (t.type === 'credit' || t.type === 'refund' || t.type === 'bonus')
                        ? 'text-emerald-300'
                        : 'text-red-300'
                    )}>
                      {(t.type === 'credit' || t.type === 'refund' || t.type === 'bonus') ? '+' : '−'}
                      {formatINR(t.amount)}
                    </p>
                    <p className="text-[11px] text-white/40">
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
        <Card className="premium-dashboard-card border-0">
          <CardHeader>
            <CardTitle className="text-lg text-white">Recharge History</CardTitle>
            <CardDescription className="text-white/45">Your most recent top-up attempts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {wallet.recharges.map((r) => (
                <div key={r._id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{formatINR(r.amount)} via {r.paymentMethod}</p>
                    <p className="text-[11px] text-white/40 font-mono truncate">{r.clientTxnId}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={cn(
                      "capitalize",
                      r.status === 'confirmed' && 'border-emerald-400/35 text-emerald-200 bg-emerald-500/15',
                      r.status === 'failed' && 'border-red-400/35 text-red-300 bg-red-500/15',
                      r.status === 'pending' && 'border-amber-400/35 text-amber-200 bg-amber-500/15'
                    )}>
                      {r.status}
                    </Badge>
                    <p className="text-[11px] text-white/40 mt-1">
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
        <DialogContent className="max-w-md w-[calc(100vw-1.25rem)] premium-dashboard-dialog premium-dialog-mobile-sheet">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 premium-dashboard-title">
              <Plus className="h-5 w-5 text-emerald-400" /> Add Money to Wallet
            </DialogTitle>
            <DialogDescription className="premium-dashboard-subtitle">
              Funds are added instantly after payment. No fees, no expiry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block premium-field-label">Amount (₹)</label>
              <Input
                type="number"
                inputMode="decimal"
                min={50}
                max={100000}
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                disabled={submitting}
                className="premium-dashboard-input"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRechargeAmount(String(amt))}
                    className={cn(
                      'premium-payment-pill px-3 py-1',
                      rechargeAmount === String(amt)
                        ? 'premium-payment-pill--active'
                        : 'premium-payment-pill--inactive'
                    )}
                    disabled={submitting}
                  >
                    ₹{amt.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-white/40 mt-2">
                Minimum ₹50, maximum ₹1,00,000 per recharge.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Payment Method</label>
              <div className="grid grid-cols-3 gap-2 premium-payment-grid">
                {(['razorpay', 'cashfree', 'upi'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGateway(g)}
                    className={cn(
                      'premium-payment-pill p-2 uppercase',
                      gateway === g ? 'premium-payment-pill--active' : 'premium-payment-pill--inactive'
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
            <Button variant="outline" onClick={() => setRechargeOpen(false)} disabled={submitting} className="premium-btn-outline">
              Cancel
            </Button>
            <Button onClick={handleRecharge} disabled={submitting} className="premium-btn-primary border-0">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing</> : `Recharge ₹${rechargeAmount || '0'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
